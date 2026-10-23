package bwv.update;

import static bwv.update.UpdateModel.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.*;
import java.util.*;

/** Sole native-facing owner of an A coordinator. No network, Android or project writes. */
public final class PublicationService {
    public enum FaultPoint {
        BEFORE_ARCHIVE_WRITE, AFTER_ARCHIVE_WRITE, AFTER_ARCHIVE_SYNC, AFTER_EXTRACTION,
        AFTER_PAYLOAD_FILE_SYNC, AFTER_PAYLOAD_DIRECTORY_SYNC, AFTER_RECEIPT_WRITE,
        AFTER_RECEIPT_SYNC, BEFORE_RECEIPT_RENAME, AFTER_RECEIPT_RENAME,
        AFTER_RECEIPT_DIRECTORY_SYNC, BEFORE_BUNDLE_RENAME, AFTER_BUNDLE_RENAME,
        AFTER_BUNDLE_DIRECTORY_SYNC, BEFORE_REGISTER, AFTER_REGISTER,
        AFTER_ANCHOR_DIRECTORY_SYNC, AFTER_STORE_DIRECTORY_SYNC, AFTER_STAGING_DIRECTORY_SYNC,
        AFTER_BUNDLES_DIRECTORY_SYNC, AFTER_RECEIPTS_DIRECTORY_SYNC, AFTER_JOURNAL_DIRECTORY_SYNC
    }
    @FunctionalInterface public interface Fault { void hit(FaultPoint point) throws IOException; }
    public record Offer(SignedManifest.VerifiedRelease metadata, UpdateCoordinator.Route route) {}
    /** A capability, not a record a caller can construct/substitute. */
    public static final class Download {
        private final UpdateCoordinator.Operation operation;
        private final SignedManifest.VerifiedRelease metadata;
        private Download(UpdateCoordinator.Operation operation, SignedManifest.VerifiedRelease metadata) {
            this.operation = operation; this.metadata = metadata;
        }
        public String id() { return operation.id(); }
        public SignedManifest.WebArtifact artifact() { return metadata.web(); }
        public AuthenticatedRelease release() { return metadata.release(); }
    }
    private static final Set<String> REQUIRED = Set.of("native-web.json", "assets/mobile/index.html",
            "assets/js/capacitor.js", "assets/native/gaussian-vertex.glsl", "assets/native/gaussian-fragment.glsl");
    private final Path store, staging, bundles, receipts;
    private final NativeConfig config;
    private final SignedManifest.Policy policy;
    private final VerifiedZipExtractor.Limits zipLimits;
    private final UpdateCoordinator coordinator;
    private final UpdateCoordinator.LocalVerifier bundledVerifier;
    private final Fault faults;
    private Download active, processing;
    private boolean poisoned;

    public PublicationService(NativeConfig config, Path store, StateJournal journal, SignedManifest.Policy policy,
            VerifiedZipExtractor.Limits zipLimits, UpdateCoordinator.LocalVerifier bundledVerifier,
            UpdateCoordinator.DataReaderGate dataReader) throws IOException {
        this(config, store, journal, policy, zipLimits, bundledVerifier, dataReader, point -> {});
    }
    public PublicationService(NativeConfig config, Path store, StateJournal journal, SignedManifest.Policy policy,
            VerifiedZipExtractor.Limits zipLimits, UpdateCoordinator.LocalVerifier bundledVerifier,
            UpdateCoordinator.DataReaderGate dataReader, Fault faults) throws IOException {
        this.config = Objects.requireNonNull(config); this.policy = Objects.requireNonNull(policy);
        this.zipLimits = Objects.requireNonNull(zipLimits); this.bundledVerifier = Objects.requireNonNull(bundledVerifier);
        this.faults = Objects.requireNonNull(faults); Objects.requireNonNull(dataReader);
        if (!config.identity().equals(policy.identity()) || !config.trustedKeys().equals(policy.trustedKeys().keySet()))
            throw new IOException("Coordinator and manifest trust policy disagree");
        this.store = absolute(store); this.staging = this.store.resolve("staging");
        this.bundles = this.store.resolve("bundles"); this.receipts = this.store.resolve("receipts");
        // Store must be directly below an already-owned application filesDir. Do not create arbitrary ancestors.
        Path anchor = this.store.getParent();
        requireExistingDirectory(anchor); requireExistingDirectory(anchor.getParent());
        syncDirectory(anchor); syncDirectory(anchor.getParent()); faults.hit(FaultPoint.AFTER_ANCHOR_DIRECTORY_SYNC);
        ensureDirectory(this.store); faults.hit(FaultPoint.AFTER_STORE_DIRECTORY_SYNC);
        ensureDirectory(staging); faults.hit(FaultPoint.AFTER_STAGING_DIRECTORY_SYNC);
        ensureDirectory(bundles); faults.hit(FaultPoint.AFTER_BUNDLES_DIRECTORY_SYNC);
        ensureDirectory(receipts); faults.hit(FaultPoint.AFTER_RECEIPTS_DIRECTORY_SYNC);
        Path journalDirectory = absolute(journal.file()).getParent();
        if (!journalDirectory.getParent().equals(anchor) && !journalDirectory.getParent().equals(this.store))
            throw new IOException("Journal must be a direct child of application filesDir or update store");
        requireExistingDirectory(journalDirectory); syncDirectory(journalDirectory); syncDirectory(journalDirectory.getParent());
        faults.hit(FaultPoint.AFTER_JOURNAL_DIRECTORY_SYNC);
        coordinator = new UpdateCoordinator(config, this.store, journal, this::verifyLocal, dataReader);
    }

    public synchronized UpdateCoordinator.RuntimeSession startProcess() throws IOException { return coordinator.startProcess(); }
    public synchronized State snapshot() { return coordinator.snapshot(); }
    public synchronized UpdateCoordinator.ConsumerBinding bindNativeConsumer(String root) throws IOException { return coordinator.bindNativeConsumer(root); }
    public synchronized boolean markHealthy(UpdateCoordinator.ConsumerBinding binding, String token, String content,
            UpdateCoordinator.Readiness readiness) throws IOException {
        usable(); return coordinator.markHealthy(binding, token, content, readiness);
    }
    public synchronized Offer observe(byte[] envelope) throws IOException {
        usable(); SignedManifest.VerifiedRelease verified = SignedManifest.verify(envelope, policy);
        UpdateCoordinator.Route route = coordinator.acceptAuthenticated(verified.release());
        if (active != null && !active.release().metadataDigest().equals(verified.release().metadataDigest())) {
            coordinator.cancel(active.operation); active = null;
        }
        return new Offer(verified, route);
    }
    public synchronized Download begin(byte[] envelope) throws IOException {
        usable();
        if (active != null || processing != null) throw new IOException("An update task is already in flight");
        SignedManifest.VerifiedRelease verified = SignedManifest.verify(envelope, policy);
        UpdateCoordinator.Operation operation = coordinator.beginDownload(verified.release());
        Download next = new Download(operation, verified);
        try { Files.createDirectory(java.nio.file.Paths.get(operation.stagingRoot())); }
        catch (IOException failure) { coordinator.cancel(operation); throw failure; }
        active = next; return next;
    }
    public synchronized boolean cancel(Download download) throws IOException {
        usable();
        if (download == null || active != download) return false;
        boolean cancelled = coordinator.cancel(download.operation); active = null; return cancelled;
    }

    /** Owns/closes input; never accepts a pre-populated extraction root or arbitrary AuthenticatedRelease. */
    public Bundle complete(Download download, InputStream input) throws IOException {
        Objects.requireNonNull(input);
        synchronized (this) {
            try { current(download); if (processing != null) throw new IOException("Completion already processing"); processing = download; }
            catch (IOException failure) { input.close(); throw failure; }
        }
        boolean publishing = false;
        try (InputStream source = input) {
            Path stage = java.nio.file.Paths.get(download.operation.stagingRoot()); Path archive = stage.resolve("archive.zip");
            copyArchive(download, source, archive);
            synchronized (this) { current(download); }
            Path payload = stage.resolve("payload");
            var metadata = download.metadata;
            var extracted = VerifiedZipExtractor.extract(archive, payload, metadata.web().sha256(), metadata.web().bytes(),
                    metadata.web().inventorySha256(), metadata.web().inventoryBytes(), zipLimits);
            faults.hit(FaultPoint.AFTER_EXTRACTION);
            validateNativeMetadata(payload, metadata.release(), extracted.entries());
            syncTree(payload);
            synchronized (this) {
                current(download); // final linearization before ANY receipt or bundle publication
                Bundle bundle = descriptor(metadata.release());
                publishing = true;
                writeReceipt(stage, metadata);
                Path destination = java.nio.file.Paths.get(bundle.root());
                if (Files.exists(destination, LinkOption.NOFOLLOW_LINKS)) {
                    if (!verifyLocal(bundle)) throw new IOException("Existing immutable content root does not match");
                    // A prior process may have observed an unsynced rename. Visibility is not durability.
                    syncTree(destination);
                } else {
                    faults.hit(FaultPoint.BEFORE_BUNDLE_RENAME);
                    Files.move(payload, destination, StandardCopyOption.ATOMIC_MOVE);
                    faults.hit(FaultPoint.AFTER_BUNDLE_RENAME);
                }
                // Required for both a new rename and a verified orphan reused after uncertain sync.
                syncDirectory(stage); syncDirectory(bundles);
                faults.hit(FaultPoint.AFTER_BUNDLE_DIRECTORY_SYNC);
                faults.hit(FaultPoint.BEFORE_REGISTER);
                coordinator.registerStaged(download.operation, bundle);
                active = null;
                faults.hit(FaultPoint.AFTER_REGISTER);
                return bundle;
            }
        } catch (IOException | RuntimeException failure) {
            synchronized (this) {
                if (publishing) poisoned = true; // rename/journal visibility may be ambiguous; force restart
                if (active == download) {
                    try { coordinator.cancel(download.operation); } catch (IOException cancelFailure) { failure.addSuppressed(cancelFailure); }
                    active = null;
                }
            }
            throw failure;
        } finally { synchronized (this) { if (processing == download) processing = null; } }
    }

    public synchronized Set<Path> protectedRoots() {
        Set<Path> result = new HashSet<>(coordinator.protectedRoots());
        if (processing != null) result.add(java.nio.file.Paths.get(processing.operation.stagingRoot()));
        return Set.copyOf(result);
    }
    /** Explicit caller-selected managed resource roots only; receipts and project paths are not admissible. */
    public synchronized Set<Path> cleanup(Collection<Path> candidates) throws IOException {
        usable(); Set<Path> protectedNow = protectedRoots(); List<Path> allowed = new ArrayList<>();
        for (Path candidate : candidates) {
            Path normalized = absolute(candidate);
            if (!normalized.equals(candidate)) throw new IOException("Noncanonical cleanup root");
            boolean bundle = bundles.equals(candidate.getParent()) && candidate.getFileName().toString().matches("[0-9a-f]{64}");
            boolean stage = staging.equals(candidate.getParent()) && candidate.getFileName().toString().matches("[a-zA-Z0-9_-]{1,100}");
            if (!bundle && !stage) throw new IOException("Cleanup target outside managed resource roots");
            if (!protectedNow.contains(candidate)) allowed.add(candidate);
        }
        return coordinator.cleanupUnreferenced(allowed, PublicationService::deleteTree);
    }

    private void current(Download download) throws IOException {
        usable();
        if (download == null || active != download) throw new IOException("Stale or cancelled completion");
        Trust trust = coordinator.snapshot().trust();
        if (trust.sequence() != download.release().sequence() || !trust.digest().equals(download.release().metadataDigest()))
            throw new IOException("Superseded completion");
    }
    private void usable() throws IOException { if (poisoned) throw new IOException("Publication uncertainty requires process recovery"); }
    private Bundle descriptor(AuthenticatedRelease release) {
        return new Bundle(release.identity(), release.inventoryDigest(), bundles.resolve(release.inventoryDigest()).toString(),
                release.version(), release.buildId(), release.nativeApi(), release.minNativeVersionCode(), release.sequence(), release.metadataDigest(), release.keyId());
    }
    private Path receipt(AuthenticatedRelease release) { return receipts.resolve(release.inventoryDigest() + "-" + release.metadataDigest() + ".manifest"); }
    private Path receipt(Bundle bundle) { return receipts.resolve(bundle.contentId() + "-" + bundle.metadataDigest() + ".manifest"); }
    private void copyArchive(Download download, InputStream input, Path archive) throws IOException {
        long expected = download.artifact().bytes();
        if (expected > zipLimits.maxArchiveBytes()) throw new IOException("Archive exceeds local extraction budget");
        MessageDigest digest = sha256(); long total = 0; byte[] buffer = new byte[32 * 1024];
        faults.hit(FaultPoint.BEFORE_ARCHIVE_WRITE);
        try (FileChannel out = FileChannel.open(archive, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) {
            while (true) {
                synchronized (this) { current(download); }
                int count = input.read(buffer);
                if (count == -1) break;
                if (count == 0) throw new IOException("Input stream made no progress");
                if (count > expected - total) throw new IOException("Archive exceeds signed size");
                total += count; digest.update(buffer, 0, count); ByteBuffer bytes = ByteBuffer.wrap(buffer, 0, count);
                while (bytes.hasRemaining()) out.write(bytes);
            }
            if (total != expected || !PortableHex.format(digest.digest()).equals(download.artifact().sha256()))
                throw new IOException("Archive signed size/digest mismatch");
            faults.hit(FaultPoint.AFTER_ARCHIVE_WRITE); out.force(true); faults.hit(FaultPoint.AFTER_ARCHIVE_SYNC);
        }
    }
    private void writeReceipt(Path stage, SignedManifest.VerifiedRelease metadata) throws IOException {
        Path destination = receipt(metadata.release());
        if (Files.exists(destination, LinkOption.NOFOLLOW_LINKS)) {
            var prior = SignedManifest.verifyCached(readRegular(destination, policy.maxEnvelopeBytes()), policy);
            if (!Arrays.equals(prior.payloadBytes(), metadata.payloadBytes())) throw new IOException("Existing receipt conflict");
            forceRegular(destination); faults.hit(FaultPoint.AFTER_RECEIPT_SYNC);
            syncDirectory(receipts); faults.hit(FaultPoint.AFTER_RECEIPT_DIRECTORY_SYNC);
            return;
        }
        Path temporary = stage.resolve("receipt.part");
        try (FileChannel out = FileChannel.open(temporary, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) {
            ByteBuffer bytes = ByteBuffer.wrap(metadata.envelopeBytes()); while (bytes.hasRemaining()) out.write(bytes);
            faults.hit(FaultPoint.AFTER_RECEIPT_WRITE); out.force(true); faults.hit(FaultPoint.AFTER_RECEIPT_SYNC);
        }
        faults.hit(FaultPoint.BEFORE_RECEIPT_RENAME); Files.move(temporary, destination, StandardCopyOption.ATOMIC_MOVE);
        faults.hit(FaultPoint.AFTER_RECEIPT_RENAME); syncDirectory(stage); syncDirectory(receipts);
        faults.hit(FaultPoint.AFTER_RECEIPT_DIRECTORY_SYNC);
    }
    private boolean verifyLocal(Bundle bundle) throws IOException {
        if (bundle.equals(config.bundled())) return bundledVerifier.verify(bundle);
        if (!java.nio.file.Paths.get(bundle.root()).equals(bundles.resolve(bundle.contentId()))) return false;
        var metadata = SignedManifest.verifyCached(readRegular(receipt(bundle), policy.maxEnvelopeBytes()), policy);
        if (!descriptor(metadata.release()).equals(bundle)) return false;
        Path root = java.nio.file.Paths.get(bundle.root());
        byte[] inventory = readRegular(root.resolve(InventoryVerifier.INVENTORY_NAME), zipLimits.inventoryLimits().maxInventoryBytes());
        if (inventory.length != metadata.web().inventoryBytes()) return false;
        var entries = VerifiedZipExtractor.parseInventory(inventory, zipLimits);
        var result = InventoryVerifier.verify(root, entries, bundle.contentId(), inventory, zipLimits.inventoryLimits());
        if (!result.allHardLinkCountsChecked()) throw new IOException("External hardlink detection unavailable");
        validateNativeMetadata(root, metadata.release(), entries); return true;
    }
    private static void validateNativeMetadata(Path root, AuthenticatedRelease release, List<InventoryVerifier.Entry> entries) throws IOException {
        Set<String> paths = new HashSet<>(); for (var entry : entries) paths.add(entry.path());
        if (!paths.containsAll(REQUIRED)) throw new IOException("Missing critical startup resources");
        Map<String, Object> value = StrictJson.object(StrictJson.parse(readRegular(root.resolve("native-web.json"), 4096), 4096, 4));
        StrictJson.exactKeys(value, "schema", "product", "packageId", "generation", "channel", "version", "build", "nativeApi", "minNativeVersionCode");
        if (StrictJson.integer(value, "schema") != 1 || !StrictJson.string(value, "product").equals("BuildingWebViewer")
                || !StrictJson.string(value, "packageId").equals(release.identity().packageName())
                || !StrictJson.string(value, "generation").equals(release.identity().generation())
                || !StrictJson.string(value, "channel").equals(release.identity().channel())
                || !StrictJson.string(value, "version").equals(release.version().toString())
                || !StrictJson.string(value, "build").equals(release.buildId())
                || StrictJson.integer(value, "nativeApi") != release.nativeApi()
                || StrictJson.integer(value, "minNativeVersionCode") != release.minNativeVersionCode()) throw new IOException("Native metadata differs from signed release");
    }
    private void syncTree(Path root) throws IOException {
        List<Path> directories = new ArrayList<>();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attrs) throws IOException {
                if (attrs.isSymbolicLink()) throw new IOException("Linked directory during sync"); directories.add(directory); return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                if (!attrs.isRegularFile() || attrs.isSymbolicLink()) throw new IOException("Nonregular resource during sync");
                try (FileChannel channel = FileChannel.open(file, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) { channel.force(true); }
                return FileVisitResult.CONTINUE;
            }
        });
        faults.hit(FaultPoint.AFTER_PAYLOAD_FILE_SYNC);
        Collections.reverse(directories); for (Path directory : directories) syncDirectory(directory);
        faults.hit(FaultPoint.AFTER_PAYLOAD_DIRECTORY_SYNC);
    }
    private static void deleteTree(Path root) throws IOException {
        noLinkAncestors(root);
        if (!Files.exists(root, LinkOption.NOFOLLOW_LINKS)) return;
        if (!Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS)) throw new IOException("Managed root is not a directory");
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override public FileVisitResult visitFile(Path path, BasicFileAttributes attrs) throws IOException { Files.delete(path); return FileVisitResult.CONTINUE; }
            @Override public FileVisitResult postVisitDirectory(Path path, IOException error) throws IOException {
                if (error != null) throw error; Files.delete(path); return FileVisitResult.CONTINUE;
            }
        });
        syncDirectory(root.getParent());
    }
    private static byte[] readRegular(Path path, int maximum) throws IOException {
        noLinkAncestors(path); BasicFileAttributes before = Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (!before.isRegularFile() || before.size() > maximum || before.size() < 0) throw new IOException("Invalid bounded metadata file");
        Object links;
        try { links = Files.getAttribute(path, "unix:nlink", LinkOption.NOFOLLOW_LINKS); }
        catch (UnsupportedOperationException failure) { throw new IOException("Hardlink checks unavailable", failure); }
        if (!(links instanceof Number) || ((Number) links).longValue() != 1) throw new IOException("Linked metadata file");
        try (InputStream input = Files.newInputStream(path, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
            byte[] bytes = PortableIO.readAtMost(input, maximum + 1);
            BasicFileAttributes after = Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            if (bytes.length > maximum || bytes.length != before.size() || before.size() != after.size()
                    || !Objects.equals(before.fileKey(), after.fileKey()) || !before.lastModifiedTime().equals(after.lastModifiedTime()))
                throw new IOException("Metadata changed during read");
            return bytes;
        }
    }
    private static Path absolute(Path path) throws IOException {
        Objects.requireNonNull(path); if (!path.isAbsolute() || !path.normalize().equals(path)) throw new IOException("Absolute canonical path required"); return path;
    }
    private static void ensureDirectory(Path path) throws IOException {
        requireExistingDirectory(path.getParent()); noLinkAncestors(path);
        if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) Files.createDirectory(path);
        requireExistingDirectory(path);
        // Re-force even an existing visible directory left by a failed prior initialization.
        syncDirectory(path); syncDirectory(path.getParent());
    }
    private static void requireExistingDirectory(Path path) throws IOException {
        if (path == null) throw new IOException("Missing durable application anchor");
        noLinkAncestors(path);
        if (!Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS)) throw new IOException("Application anchor must already exist");
    }
    private static void forceRegular(Path path) throws IOException {
        noLinkAncestors(path);
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) throw new IOException("Not a regular immutable file");
        try (FileChannel file = FileChannel.open(path, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) { file.force(true); }
    }
    private static void noLinkAncestors(Path path) throws IOException {
        for (Path p = path.toAbsolutePath(); p != null; p = p.getParent()) if (Files.isSymbolicLink(p)) throw new IOException("Symbolic link in private store path");
    }
    private static void syncDirectory(Path path) throws IOException { try (FileChannel directory = FileChannel.open(path, StandardOpenOption.READ)) { directory.force(true); } }
    private static MessageDigest sha256() { try { return MessageDigest.getInstance("SHA-256"); } catch (NoSuchAlgorithmException e) { throw new AssertionError(e); } }
}
