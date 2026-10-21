package bwv.update;

import static bwv.update.UpdateModel.*;
import java.io.IOException;
import java.nio.file.Path;
import java.util.*;
import java.util.function.Supplier;

/** One instance per APPLICATION PROCESS. No Activity may construct its own coordinator. */
public final class UpdateCoordinator {
    public enum Route { WEB, APK, CURRENT }
    @FunctionalInterface public interface RootDeleter { void delete(Path root) throws IOException; }
    @FunctionalInterface public interface DataReaderGate { boolean canReadCurrentData(Bundle bundle) throws IOException; }
    @FunctionalInterface public interface LocalVerifier { boolean verify(Bundle bundle) throws IOException; }
    public record Operation(String id, AuthenticatedRelease release, String stagingRoot) {}
    public record Readiness(boolean nativeHandshake, boolean criticalResources, boolean projectStoreRead, int nativeApi) {}

    /** Immutable; native renderers and WebViews share this exact object, including shader-pair resolution. */
    public static final class RuntimeSession {
        private final String sessionId;
        private final Bundle bundle;
        private final String attemptToken;
        private RuntimeSession(String sessionId, Bundle bundle, String attemptToken) {
            this.sessionId = sessionId; this.bundle = bundle; this.attemptToken = attemptToken;
        }
        public String sessionId() { return sessionId; }
        public Bundle bundle() { return bundle; }
        public String attemptToken() { return attemptToken; }
        public Path resolve(String relative) {
            // Resource paths are deliberately narrower than user drawing/project filenames.
            if (relative == null || relative.isEmpty() || relative.startsWith("/") || relative.contains("\\")
                    || relative.contains(":")) throw new IllegalArgumentException("Invalid resource path");
            for (String part : relative.split("/", -1))
                if (part.isEmpty() || part.equals(".") || part.equals("..") || !part.matches("[a-zA-Z0-9._-]+"))
                    throw new IllegalArgumentException("Noncanonical resource path");
            return java.nio.file.Paths.get(bundle.root()).resolve(relative);
        }
        public List<Path> shaderPair() {
            return List.of(resolve("assets/native/gaussian-vertex.glsl"), resolve("assets/native/gaussian-fragment.glsl"));
        }
    }

    /** Capability created by native wiring after observing the WebView's actual serving root. */
    public static final class ConsumerBinding {
        private final RuntimeSession session;
        private final String observedRoot;
        private ConsumerBinding(RuntimeSession session, String observedRoot) { this.session = session; this.observedRoot = observedRoot; }
    }

    private final NativeConfig config;
    private final StateJournal journal;
    private final LocalVerifier verifier;
    private final DataReaderGate dataReader;
    private final Supplier<String> ids;
    private final Path storageRoot;
    private final Map<String, Operation> operations = new HashMap<>();
    private State state;
    private RuntimeSession running;
    private boolean poisoned;

    public UpdateCoordinator(NativeConfig config, Path storageRoot, StateJournal journal, LocalVerifier verifier, DataReaderGate dataReader) throws IOException {
        this(config, storageRoot, journal, verifier, dataReader, () -> UUID.randomUUID().toString());
    }
    public UpdateCoordinator(NativeConfig config, Path storageRoot, StateJournal journal, LocalVerifier verifier, DataReaderGate dataReader, Supplier<String> ids) throws IOException {
        this.config = Objects.requireNonNull(config); this.storageRoot = storageRoot.toAbsolutePath().normalize();
        this.journal = Objects.requireNonNull(journal); this.verifier = Objects.requireNonNull(verifier); this.dataReader = Objects.requireNonNull(dataReader); this.ids = Objects.requireNonNull(ids);
        state = journal.load().orElse(new State(config.identity(), new Trust(0, "", config.bundled().version()), null, null, null, Set.of()));
        if (!state.identity().equals(config.identity())) throw new IOException("Journal belongs to a different package/generation/channel");
        long sequence = Math.max(state.trust().sequence(), config.minimumSequence());
        String digest = sequence > state.trust().sequence() ? "" : state.trust().digest();
        Version version = max(state.trust().highestVersion(), config.bundled().version());
        State seeded = state.withTrust(new Trust(sequence, digest, version));
        if (!seeded.equals(state) || journal.load().isEmpty()) commit(seeded);
    }

    public synchronized State snapshot() { return state; }
    public synchronized Optional<RuntimeSession> running() { return Optional.ofNullable(running); }

    public synchronized RuntimeSession startProcess() throws IOException {
        if (running != null) return running; // Journal failures never break an already pinned local session.
        ensureUsable();
        State next = state;
        Set<String> failed = new HashSet<>(next.failedContentIds());
        Trial prior = next.trial(); Bundle pending = next.pending(); Trial trial = null;
        Bundle selected = null;
        if (prior != null) {
            if (usableCache(prior.bundle()) && prior.attempts() < 2) {
                selected = prior.bundle(); trial = new Trial(selected, prior.attempts() + 1, newId());
            } else if (usableCache(prior.bundle()) && prior.attempts() >= 2) {
                if (failed.size() >= 1024) throw new IOException("Recovery quarantine full; explicit repair required");
                failed.add(prior.bundle().contentId());
            }
        }
        if (selected == null && pending != null) {
            if (!failed.contains(pending.contentId()) && usableCache(pending)) {
                selected = pending; trial = new Trial(selected, 1, newId());
            }
            pending = null; // Never keep an ineligible/stale pending root as an activation candidate.
        }
        Bundle good = next.lastKnownGood();
        if (good != null && (!usableCache(good) || failed.contains(good.contentId()))) good = null;
        if (selected == null) selected = good;
        if (selected == null) {
            if (!verifier.verify(config.bundled()) || !dataReader.canReadCurrentData(config.bundled()))
                throw new IOException("Bundled resources or current-data reader compatibility failed; recovery export required");
            selected = config.bundled();
        }
        next = new State(next.identity(), next.trust(), good, pending, trial, failed);
        if (!next.equals(state)) commit(next); // Must be durable before exposing trial root.
        RuntimeSession candidate = new RuntimeSession(newId(), selected, trial == null ? null : trial.attemptToken());
        running = candidate;
        return candidate;
    }

    /** Call from native wiring, not from a JS-provided root parameter. */
    public synchronized ConsumerBinding bindNativeConsumer(String observedServingRoot) throws IOException {
        if (running == null || !running.bundle().root().equals(observedServingRoot)) throw new IOException("Serving root does not match process session");
        return new ConsumerBinding(running, observedServingRoot);
    }

    /** Readiness is evidence from native startup coordinator, not booleans accepted from JavaScript. */
    public synchronized boolean markHealthy(ConsumerBinding consumer, String token, String bundleId, Readiness readiness) throws IOException {
        ensureUsable(); Objects.requireNonNull(readiness);
        if (running == null || consumer == null || consumer.session != running || !consumer.observedRoot.equals(running.bundle().root())
                || running.attemptToken() == null || !running.attemptToken().equals(token)
                || !running.bundle().contentId().equals(bundleId) || !readiness.nativeHandshake()
                || !readiness.criticalResources() || !readiness.projectStoreRead() || readiness.nativeApi() != config.nativeApi()) return false;
        if (state.trial() == null) return running.bundle().equals(state.lastKnownGood()); // Exact repeated success is idempotent.
        Trial trial = state.trial();
        if (!trial.bundle().equals(running.bundle()) || !trial.attemptToken().equals(token)) return false;
        commit(new State(state.identity(), state.trust(), running.bundle(), state.pending(), null, state.failedContentIds()));
        return true;
    }

    /** Accept only metadata already cryptographically authenticated by the future native parser. */
    public synchronized Route acceptAuthenticated(AuthenticatedRelease release) throws IOException {
        ensureUsable(); validateIdentity(release);
        Trust old = state.trust();
        if (release.sequence() < old.sequence() || (release.sequence() == old.sequence() && !old.digest().isEmpty()
                && !old.digest().equals(release.metadataDigest())) || release.version().compareTo(old.highestVersion()) < 0)
            throw new IOException("Replayed, conflicting or downgraded metadata");
        Trust accepted = new Trust(release.sequence(), release.metadataDigest(), max(old.highestVersion(), release.version()));
        if (!accepted.equals(old)) commit(state.withTrust(accepted));
        if (release.version().compareTo(effectiveVersion()) <= 0) return Route.CURRENT;
        // Native/APK routing happens before applying this runtime's web package limit.
        if (release.nativeApi() != config.nativeApi() || release.minNativeVersionCode() > config.versionCode()
                || release.webBytes() > config.maximumWebBytes()) return Route.APK;
        return Route.WEB;
    }
    public synchronized Operation beginDownload(AuthenticatedRelease release) throws IOException {
        if (running == null) throw new IOException("Start local runtime before optional download work");
        Route route = acceptAuthenticated(release);
        if (route != Route.WEB) throw new IOException("No compatible web download: " + route);
        String id = newId();
        if (operations.containsKey(id)) throw new IOException("Operation token collision");
        Operation operation = new Operation(id, release, storageRoot.resolve("staging").resolve(id).toString());
        operations.put(id, operation); return operation;
    }
    public synchronized boolean cancel(Operation operation) throws IOException {
        ensureUsable(); return operation != null && operations.remove(operation.id(), operation);
    }

    /** Files and signed-bound inventory must be durable and immutable before this method is called. */
    public synchronized void registerStaged(Operation operation, Bundle bundle) throws IOException {
        ensureUsable();
        if (operation == null || !operation.equals(operations.get(operation.id()))) throw new IOException("Stale or cancelled operation");
        AuthenticatedRelease release = operation.release(); validateIdentity(release);
        if (state.trust().sequence() != release.sequence() || !state.trust().digest().equals(release.metadataDigest()))
            throw new IOException("Stale download completion");
        if (!bundle.identity().equals(release.identity()) || !bundle.version().equals(release.version())
                || bundle.sequence() != release.sequence() || !bundle.metadataDigest().equals(release.metadataDigest())
                || !bundle.keyId().equals(release.keyId()) || !bundle.contentId().equals(release.inventoryDigest())
                || !bundle.buildId().equals(release.buildId()) || bundle.nativeApi() != release.nativeApi()
                || bundle.minNativeVersionCode() != release.minNativeVersionCode()) throw new IOException("Staged metadata mismatch");
        if (!usableCache(bundle)) throw new IOException("Staged root incompatible, quarantined or corrupt");
        Bundle pending = state.pending();
        if (pending != null && (pending.sequence() > bundle.sequence() || (pending.sequence() == bundle.sequence()
                && !pending.equals(bundle)))) throw new IOException("Stale or conflicting pending publication");
        commit(new State(state.identity(), state.trust(), state.lastKnownGood(), bundle, state.trial(), state.failedContentIds()));
        operations.remove(operation.id());
    }

    /** Snapshot for native single-writer cleanup; this checkpoint intentionally deletes nothing. */
    public synchronized Set<Path> protectedRoots() {
        Set<Path> roots = new HashSet<>(); roots.add(java.nio.file.Paths.get(config.bundled().root()));
        if (running != null) roots.add(java.nio.file.Paths.get(running.bundle().root()));
        for (Bundle bundle : new Bundle[]{state.lastKnownGood(), state.pending(), state.trial() == null ? null : state.trial().bundle()})
            if (bundle != null) roots.add(java.nio.file.Paths.get(bundle.root()));
        for (Operation operation : operations.values()) roots.add(java.nio.file.Paths.get(operation.stagingRoot()));
        return Set.copyOf(roots);
    }
    /** Deletion runs under the same single-writer lock as acquisition/publication; no stale cleanup snapshot. */
    public synchronized Set<Path> cleanupUnreferenced(Collection<Path> candidates, RootDeleter deleter) throws IOException {
        ensureUsable(); Set<Path> protectedNow = protectedRoots(); Set<Path> deleted = new HashSet<>();
        for (Path candidate : candidates) {
            if (!candidate.isAbsolute() || !candidate.normalize().equals(candidate)) throw new IOException("Noncanonical cleanup target");
            Path parent = candidate.getParent(); String leaf = candidate.getFileName().toString();
            boolean bundleRoot = storageRoot.resolve("bundles").equals(parent) && leaf.matches("[0-9a-f]{64}");
            boolean stagingRoot = storageRoot.resolve("staging").equals(parent) && leaf.matches("[a-zA-Z0-9_-]{1,100}");
            if (!bundleRoot && !stagingRoot) throw new IOException("Cleanup target outside resource store");
            if (!protectedNow.contains(candidate)) { deleter.delete(candidate); deleted.add(candidate); }
        }
        return Set.copyOf(deleted);
    }
    public synchronized Version effectiveVersion() { return running == null ? config.bundled().version() : running.bundle().version(); }
    private boolean usableCache(Bundle b) {
        if (b == null || !b.identity().equals(config.identity()) || b.nativeApi() != config.nativeApi()
                || b.minNativeVersionCode() > config.versionCode() || b.sequence() < config.minimumSequence() || !config.trustedKeys().contains(b.keyId())
                || b.version().compareTo(config.bundled().version()) <= 0 || state.failedContentIds().contains(b.contentId())
                || !java.nio.file.Paths.get(b.root()).equals(storageRoot.resolve("bundles").resolve(b.contentId()))) return false;
        try { return verifier.verify(b) && dataReader.canReadCurrentData(b); } catch (IOException failure) { return false; }
    }
    private void validateIdentity(AuthenticatedRelease release) throws IOException {
        if (!release.identity().equals(config.identity()) || !config.trustedKeys().contains(release.keyId()))
            throw new IOException("Wrong update identity or untrusted key");
    }
    private static Version max(Version a, Version b) { return a.compareTo(b) >= 0 ? a : b; }
    private String newId() { String id = ids.get(); token(id); return id; }
    private void ensureUsable() throws IOException { if (poisoned) throw new IOException("Journal uncertainty requires process recovery"); }
    private void commit(State next) throws IOException {
        try { journal.save(next); state = next; }
        catch (IOException failure) {
            // The rename may have executed even when directory sync/reporting failed. Never assume rollback.
            try { state = journal.load().orElse(state); }
            catch (IOException reread) { failure.addSuppressed(reread); }
            poisoned = true; // Refuse further state transitions; pinned running session is unchanged.
            throw failure;
        }
    }
}
