package bwv.diagnostics;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.OpenOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;

/**
 * App-process-wide, cache-only diagnostic capability. Never expose Lease paths or
 * Scratch to JavaScript. This is not a production storage/update capability.
 * Callbacks are trusted native code and must not retain paths or perform async I/O.
 */
public final class DiagnosticRunLease {
    public static final long MAX_BYTES = 4L * 1024L * 1024L;
    /** All entries, including directories, count toward this conservative limit. */
    public static final int MAX_FILES = 256;
    public static final int MAX_DEPTH = 16;
    public static final long LIFETIME_MILLIS = 120_000L;
    private static final long LIFETIME_NANOS = LIFETIME_MILLIS * 1_000_000L;
    private static final String PARENT_NAME = "self-test";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Map<Path, Shared> APP_STATES = new HashMap<>();
    private static final ScheduledExecutorService DEADLINES = Executors.newSingleThreadScheduledExecutor(
            runnable -> {
                Thread thread = new Thread(runnable, "diagnostic-lease-deadline");
                thread.setDaemon(true);
                return thread;
            });
    private final Shared shared;

    public enum CloseResult { CLOSED, CLOSING }
    public enum Code {
        BUSY, INVALID_RUN_ID, INVALID_HANDLE, EXPIRED, CANCELLED, QUOTA_EXCEEDED,
        UNSAFE_PATH, INVALID_SCOPE, CLEANUP_FAILED
    }

    public static final class LeaseException extends IOException {
        private static final long serialVersionUID = 1L;
        private final Code code;

        private LeaseException(Code code, String message) {
            super(message);
            this.code = code;
        }

        private LeaseException(Code code, String message, Throwable cause) {
            super(message, cause);
            this.code = code;
        }

        public Code code() { return code; }
    }

    /** Native-only lease metadata. The handle is the only capability sent to JS. */
    public static final class Lease {
        private final String handle;
        private final String runId;
        private final Path scratchRoot;
        private final long deadlineEpochMillis;
        private final long startedNanos;
        private final Object rootKey;
        private final Map<Path, Long> reservations = new HashMap<>();
        private final Map<Path, TreeReservation> trees = new HashMap<>();
        private int operations;
        private boolean closing;
        private boolean cancelled;
        private boolean expired;
        private ScheduledFuture<?> expiration;

        private Lease(String handle, String runId, Path root, long deadline,
                long startedNanos, Object rootKey) {
            this.handle = handle;
            this.runId = runId;
            this.scratchRoot = root;
            this.deadlineEpochMillis = deadline;
            this.startedNanos = startedNanos;
            this.rootKey = rootKey;
        }

        public String handle() { return handle; }
        public String runId() { return runId; }
        public Path scratchRoot() { return scratchRoot; }
        public long deadlineEpochMillis() { return deadlineEpochMillis; }
    }

    @FunctionalInterface
    public interface Operation<T> {
        T run(Scratch scratch) throws Exception;
    }

    private static final class Shared {
        final Path cacheRoot;
        final Path parent;
        final Object cacheKey;
        final Object parentKey;
        final LongSupplier nanos;
        final LongSupplier millis;
        Lease current;
        String lastClosedHandle;

        Shared(Path root, Path parent, Object cacheKey, Object parentKey,
                LongSupplier nanos, LongSupplier millis) {
            this.cacheRoot = root;
            this.parent = parent;
            this.cacheKey = cacheKey;
            this.parentKey = parentKey;
            this.nanos = nanos;
            this.millis = millis;
        }
    }

    /** appCacheRoot must come from native Context.getCacheDir(), never JavaScript. */
    public DiagnosticRunLease(Path appCacheRoot) throws IOException {
        this(appCacheRoot, System::nanoTime, System::currentTimeMillis);
    }

    DiagnosticRunLease(Path appCacheRoot, LongSupplier nanos, LongSupplier millis)
            throws IOException {
        Objects.requireNonNull(appCacheRoot, "appCacheRoot");
        Objects.requireNonNull(nanos, "nanos");
        Objects.requireNonNull(millis, "millis");
        // Resolve the native-supplied cache location once. Never canonicalize a
        // user-controlled relative path, scratch child, or cleanup target.
        Path root = appCacheRoot.toRealPath();
        verifyAncestors(root);
        BasicFileAttributes rootAttributes = directoryAttributes(root);
        synchronized (APP_STATES) {
            Shared existing = APP_STATES.get(root);
            if (existing != null) {
                this.shared = existing;
                synchronized (existing) { verifyAnchors(existing); }
                return;
            }
            Path parent = root.resolve(PARENT_NAME);
            if (!Files.exists(parent, LinkOption.NOFOLLOW_LINKS)) {
                Files.createDirectory(parent);
            }
            BasicFileAttributes parentAttributes = directoryAttributes(parent);
            this.shared = new Shared(root, parent, requireKey(rootAttributes),
                    requireKey(parentAttributes), nanos, millis);
            APP_STATES.put(root, this.shared);
        }
    }

    public Lease begin(String runId) throws IOException {
        if (runId == null || !runId.matches("[A-Za-z0-9][A-Za-z0-9_-]{0,63}")) {
            throw error(Code.INVALID_RUN_ID, "runId must be 1..64 bounded ASCII characters");
        }
        synchronized (shared) {
            expireIfNeeded();
            if (shared.current != null) {
                if (shared.current.closing && shared.current.operations == 0) {
                    cleanup(shared.current);
                } else {
                    throw error(Code.BUSY, "A diagnostic lease is still active or unwinding");
                }
            }
            verifyAnchors(shared);
            // Neither the runId nor a bridge-supplied path participates in names.
            Path scratch = shared.parent.resolve("run-" + randomHex(16));
            Files.createDirectory(scratch);
            BasicFileAttributes attributes = directoryAttributes(scratch);
            Lease lease = new Lease(randomHex(32), runId, scratch,
                    Math.addExact(shared.millis.getAsLong(), LIFETIME_MILLIS),
                    shared.nanos.getAsLong(), requireKey(attributes));
            shared.current = lease;
            shared.lastClosedHandle = null;
            lease.expiration = DEADLINES.schedule(() -> {
                synchronized (shared) {
                    if (shared.current != lease) return;
                    // The scheduler is only a wake-up. Monotonic time remains
                    // authoritative; all public operations enforce it as well.
                    markExpired(lease);
                    if (lease.closing && lease.operations == 0) {
                        try { cleanup(lease); }
                        catch (IOException ignored) {
                            // Fail closed: keep ownership and reject new runs
                            // until an explicit close/begin cleanup retry succeeds.
                        }
                    }
                }
            }, LIFETIME_MILLIS, TimeUnit.MILLISECONDS);
            return lease;
        }
    }

    /**
     * At most one synchronous operation runs per app process. A cancelled, expired,
     * or late callback cannot publish a result. Active callbacks must cooperate
     * via checkCancelled(); a blocked callback holds the lease, never a new run.
     */
    public <T> T operation(String handle, Operation<T> body) throws Exception {
        Objects.requireNonNull(body, "body");
        final Lease lease;
        final Scratch scratch;
        synchronized (shared) {
            lease = requireHandle(handle);
            ensureValid(lease);
            if (lease.operations != 0) {
                throw error(Code.BUSY, "A diagnostic operation is already running");
            }
            verifyRoot(lease);
            scan(lease);
            lease.operations++;
            scratch = new Scratch(lease, Thread.currentThread());
        }
        Throwable failure = null;
        try {
            T result = body.run(scratch);
            scratch.validate();
            synchronized (shared) { ensureValid(lease); }
            return result;
        } catch (Exception | Error exception) {
            failure = exception;
            throw exception;
        } finally {
            synchronized (shared) {
                IOException lateFailure = null;
                if (failure == null) {
                    try { ensureValid(lease); }
                    catch (IOException exception) { lateFailure = exception; }
                }
                scratch.live = false;
                lease.operations--;
                if (lease.closing && lease.operations == 0) {
                    try {
                        cleanup(lease);
                    } catch (IOException cleanupFailure) {
                        if (failure != null) {
                            failure.addSuppressed(cleanupFailure);
                        } else if (lateFailure != null) lateFailure.addSuppressed(cleanupFailure);
                        else lateFailure = cleanupFailure;
                    }
                }
                if (lateFailure != null) throw lateFailure;
            }
        }
    }

    /** Cancels immediately; cleanup waits for the current operation to unwind. */
    public CloseResult cancel(String handle) throws IOException {
        synchronized (shared) {
            Lease lease = requireHandle(handle);
            lease.cancelled = true;
            lease.closing = true;
            return closeOrWait(lease);
        }
    }

    /**
     * Closes only this lease's own root. The most recent successful close receipt
     * is idempotent until a new begin; older handles cannot close a newer run.
     */
    public CloseResult close(String handle) throws IOException {
        synchronized (shared) {
            if (shared.current == null && handle != null && handle.length() == 64
                    && handle.equals(shared.lastClosedHandle)) {
                return CloseResult.CLOSED;
            }
            Lease lease = requireHandle(handle);
            lease.cancelled = true;
            lease.closing = true;
            return closeOrWait(lease);
        }
    }

    /** Native cancellation polling for long-running work inside an operation. */
    public boolean isCancelled(String handle) throws IOException {
        synchronized (shared) {
            Lease lease = requireHandle(handle);
            markExpired(lease);
            return lease.cancelled || lease.closing;
        }
    }

    /** Scratch methods are scoped to the operation's thread and lifetime. */
    public final class Scratch {
        private final Lease lease;
        private final Thread owner;
        private boolean live = true;

        private Scratch(Lease lease, Thread owner) {
            this.lease = lease;
            this.owner = owner;
        }

        /** Native-only; no asynchronous or unaccounted I/O may use this path. */
        public Path root() throws IOException {
            checkCancelled();
            verifyRoot(lease);
            return lease.scratchRoot;
        }

        public void checkCancelled() throws IOException {
            synchronized (shared) {
                if (!live || Thread.currentThread() != owner) {
                    throw error(Code.INVALID_SCOPE, "Scratch capability escaped its operation");
                }
                ensureValid(lease);
            }
        }

        /** Creates bounded deterministic fixture directories, never follows links. */
        public Path createDirectory(String relative) throws IOException {
            checkCancelled();
            Path target = resolve(lease, relative);
            for (Path file : lease.reservations.keySet()) {
                if (target.startsWith(file)) {
                    throw error(Code.UNSAFE_PATH, "A reserved file cannot become a directory");
                }
            }
            Usage usage = scan(lease);
            List<Path> missing = missingDirectories(lease, target);
            checkDirectoryAdditions(lease, usage, missing);
            for (Path directory : missing) {
                checkCancelled();
                verifyRoot(lease);
                verifyParents(lease, directory);
                Files.createDirectory(directory);
            }
            validate();
            return target;
        }

        /**
         * Pre-accounts a trusted deterministic native builder's maximum file size.
         * This is not a sandbox for arbitrary Path writes: the native builder must
         * honor the reservation and remain synchronous. Prefer write()/read().
         */
        public Path reserve(String relative, long expectedBytes) throws IOException {
            checkCancelled();
            if (expectedBytes < 0 || expectedBytes > MAX_BYTES) {
                throw error(Code.QUOTA_EXCEEDED, "Invalid reservation size");
            }
            Path target = resolve(lease, relative);
            if (containingTree(lease, target) != null) {
                throw error(Code.UNSAFE_PATH, "File and tree reservations cannot overlap");
            }
            verifyParents(lease, target);
            BasicFileAttributes present = attributesIfExists(target);
            if (present != null && !present.isRegularFile()) {
                throw error(Code.UNSAFE_PATH, "A fixture file must be regular");
            }
            if (present != null && present.size() > expectedBytes) {
                throw error(Code.QUOTA_EXCEEDED, "Reservation is smaller than existing file");
            }
            Long previous = lease.reservations.put(target, expectedBytes);
            try {
                scan(lease);
            } catch (IOException | RuntimeException exception) {
                if (previous == null) lease.reservations.remove(target);
                else lease.reservations.put(target, previous);
                throw exception;
            }
            return target;
        }

        /**
         * Pre-accounts a bounded subtree for trusted synchronous native code such
         * as ProjectStore/AtomicFile. maxFiles counts every entry including the
         * subtree root. Call validate() after every native mutation. This does not
         * intercept arbitrary filesystem calls; builders must obey their budget.
         */
        public Path reserveTree(String relative, long maxBytes, int maxFiles)
                throws IOException {
            checkCancelled();
            if (maxBytes < 0 || maxBytes > MAX_BYTES || maxFiles < 1 || maxFiles > MAX_FILES) {
                throw error(Code.QUOTA_EXCEEDED, "Invalid subtree reservation");
            }
            Path target = resolve(lease, relative);
            for (Path path : lease.trees.keySet()) {
                if (path.startsWith(target) || target.startsWith(path)) {
                    throw error(Code.UNSAFE_PATH, "Subtree reservations cannot overlap");
                }
            }
            for (Path path : lease.reservations.keySet()) {
                if (path.startsWith(target) || target.startsWith(path)) {
                    throw error(Code.UNSAFE_PATH, "File and subtree reservations cannot overlap");
                }
            }
            Usage usage = scan(lease);
            Usage old = subtreeUsage(usage, target);
            TreeReservation reservation = new TreeReservation(target, maxBytes, maxFiles);
            checkTreeLimits(reservation, old.bytes, Math.max(1, old.entries));
            List<Path> missing = missingDirectories(lease, target);
            int ancestors = 0;
            for (Path path : missing) if (!path.startsWith(target)) ancestors++;
            checkLimits(usage.bytes - old.bytes + maxBytes,
                    usage.entries - old.entries + maxFiles + ancestors);
            createDirectory(relative);
            lease.trees.put(target, reservation);
            try {
                validate();
            } catch (IOException | RuntimeException exception) {
                lease.trees.remove(target);
                throw exception;
            }
            return target;
        }

        /** Removes only an explicitly reserved subtree, without following links. */
        public void removeTree(String relative) throws IOException {
            checkCancelled();
            Path target = resolve(lease, relative);
            if (!lease.trees.containsKey(target)) {
                throw error(Code.UNSAFE_PATH, "Only an explicitly reserved subtree may be removed");
            }
            verifyParents(lease, target);
            if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) {
                deleteOwnedTree(target, 0, new int[] { 0 });
            }
            lease.trees.remove(target);
            validate();
        }

        /** Writes only after byte/entry budgets and every ancestor are validated. */
        public Path write(String relative, byte[] bytes) throws IOException {
            Objects.requireNonNull(bytes, "bytes");
            checkCancelled();
            Path target = resolve(lease, relative);
            verifyParents(lease, target);
            Usage usage = scan(lease);
            BasicFileAttributes existing = attributesIfExists(target);
            if (existing != null && !existing.isRegularFile()) {
                throw error(Code.UNSAFE_PATH, "A fixture file must be regular");
            }
            long oldSize = existing == null ? 0 : existing.size();
            Long reserved = lease.reservations.get(target);
            if (reserved != null && bytes.length > reserved) {
                throw error(Code.QUOTA_EXCEEDED, "Write exceeds the file reservation");
            }
            long oldAccounted = reserved == null ? oldSize : Math.max(oldSize, reserved);
            long newAccounted = reserved == null ? bytes.length : Math.max(bytes.length, reserved);
            boolean counted = existing != null || reserved != null;
            TreeReservation tree = containingTree(lease, target);
            if (tree == null) {
                checkLimits(usage.bytes - oldAccounted + newAccounted,
                        usage.entries + (counted ? 0 : 1));
            } else {
                Usage actual = subtreeUsage(usage, tree.path);
                checkTreeLimits(tree, actual.bytes - oldSize + bytes.length,
                        actual.entries + (existing == null ? 1 : 0));
            }
            Set<OpenOption> options = new HashSet<>();
            options.add(StandardOpenOption.WRITE);
            options.add(LinkOption.NOFOLLOW_LINKS);
            options.add(StandardOpenOption.CREATE_NEW);
            verifyParents(lease, target);
            checkCancelled();
            // Never truncate a pre-existing inode: even a regular file may be a
            // hard link. Unlink only this owned directory entry and create a new
            // inode, so an outside hard-link target cannot be modified.
            if (existing != null) Files.delete(target);
            try (SeekableByteChannel channel = Files.newByteChannel(target, options)) {
                int offset = 0;
                while (offset < bytes.length) {
                    checkCancelled();
                    ByteBuffer chunk = ByteBuffer.wrap(bytes, offset,
                            Math.min(8192, bytes.length - offset));
                    while (chunk.hasRemaining()) {
                        checkCancelled();
                        channel.write(chunk);
                    }
                    offset = chunk.position();
                }
            }
            validate();
            return target;
        }

        /** A bounded read: validate first, allocate at most 4 MiB, detect growth. */
        public byte[] read(String relative) throws IOException {
            checkCancelled();
            Path target = resolve(lease, relative);
            verifyParents(lease, target);
            scan(lease);
            BasicFileAttributes attributes = Files.readAttributes(target,
                    BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            if (!attributes.isRegularFile()) {
                throw error(Code.UNSAFE_PATH, "A fixture file must be regular");
            }
            if (attributes.size() < 0 || attributes.size() > MAX_BYTES) {
                throw error(Code.QUOTA_EXCEEDED, "File exceeds the bounded read size");
            }
            byte[] result = new byte[(int) attributes.size()];
            Set<OpenOption> options = new HashSet<>();
            options.add(StandardOpenOption.READ);
            options.add(LinkOption.NOFOLLOW_LINKS);
            verifyParents(lease, target);
            try (SeekableByteChannel channel = Files.newByteChannel(target, options)) {
                ByteBuffer destination = ByteBuffer.wrap(result);
                while (destination.hasRemaining()) {
                    checkCancelled();
                    if (channel.read(destination) < 0) {
                        throw new IOException("Fixture file shrank during bounded read");
                    }
                }
                if (channel.read(ByteBuffer.allocate(1)) != -1) {
                    throw error(Code.QUOTA_EXCEEDED, "Fixture file grew during bounded read");
                }
            }
            validate();
            return result;
        }

        public void validate() throws IOException {
            checkCancelled();
            scan(lease);
            checkCancelled();
        }
    }

    private CloseResult closeOrWait(Lease lease) throws IOException {
        if (lease.operations != 0) return CloseResult.CLOSING;
        cleanup(lease);
        return CloseResult.CLOSED;
    }

    private Lease requireHandle(String handle) throws LeaseException {
        if (handle == null || handle.length() != 64 || shared.current == null
                || !shared.current.handle.equals(handle)) {
            throw error(Code.INVALID_HANDLE, "Unknown or stale diagnostic handle");
        }
        return shared.current;
    }

    private void markExpired(Lease lease) {
        long elapsed = shared.nanos.getAsLong() - lease.startedNanos;
        if (elapsed < 0 || elapsed >= LIFETIME_NANOS) {
            lease.expired = true;
            lease.cancelled = true;
            lease.closing = true;
        }
    }

    private void expireIfNeeded() throws IOException {
        if (shared.current == null) return;
        markExpired(shared.current);
        if (shared.current.closing && shared.current.operations == 0) {
            cleanup(shared.current);
        }
    }

    private void ensureValid(Lease lease) throws IOException {
        if (shared.current != lease) {
            throw error(Code.INVALID_HANDLE, "Unknown or stale diagnostic handle");
        }
        markExpired(lease);
        if (lease.expired) {
            if (lease.operations == 0) cleanup(lease);
            throw error(Code.EXPIRED, "Diagnostic lease deadline elapsed");
        }
        if (lease.cancelled || lease.closing) {
            throw error(Code.CANCELLED, "Diagnostic lease is cancelled or closing");
        }
    }

    private static final class Usage {
        long bytes;
        int entries;
        final Map<Path, Long> actual = new HashMap<>();
    }

    private static final class TreeReservation {
        final Path path;
        final long bytes;
        final int entries;

        TreeReservation(Path path, long bytes, int entries) {
            this.path = path;
            this.bytes = bytes;
            this.entries = entries;
        }
    }

    private static TreeReservation containingTree(Lease lease, Path path) {
        for (TreeReservation tree : lease.trees.values()) {
            if (path.startsWith(tree.path)) return tree;
        }
        return null;
    }

    private static Usage subtreeUsage(Usage usage, Path root) {
        Usage subtree = new Usage();
        for (Map.Entry<Path, Long> entry : usage.actual.entrySet()) {
            if (entry.getKey().startsWith(root)) {
                subtree.entries++;
                subtree.bytes += entry.getValue();
            }
        }
        return subtree;
    }

    private static void checkTreeLimits(TreeReservation tree, long bytes, int entries)
            throws LeaseException {
        if (bytes < 0 || bytes > tree.bytes || entries < 0 || entries > tree.entries) {
            throw error(Code.QUOTA_EXCEEDED, "Native fixture exceeded subtree reservation");
        }
    }

    private static void checkDirectoryAdditions(Lease lease, Usage usage, List<Path> missing)
            throws LeaseException {
        int globalAdded = 0;
        Map<TreeReservation, Integer> treeAdded = new HashMap<>();
        for (Path path : missing) {
            TreeReservation tree = containingTree(lease, path);
            if (tree == null) globalAdded++;
            else treeAdded.put(tree, treeAdded.getOrDefault(tree, 0) + 1);
        }
        checkLimits(usage.bytes, usage.entries + globalAdded);
        for (Map.Entry<TreeReservation, Integer> addition : treeAdded.entrySet()) {
            Usage actual = subtreeUsage(usage, addition.getKey().path);
            checkTreeLimits(addition.getKey(), actual.bytes, actual.entries + addition.getValue());
        }
    }

    private Usage scan(Lease lease) throws IOException {
        verifyRoot(lease);
        Usage usage = new Usage();
        scanDirectory(lease.scratchRoot, 0, usage);
        for (Map.Entry<Path, Long> reservation : lease.reservations.entrySet()) {
            Path path = reservation.getKey();
            BasicFileAttributes attributes = attributesIfExists(path);
            if (attributes != null) {
                if (!attributes.isRegularFile() || attributes.size() > reservation.getValue()) {
                    throw error(Code.QUOTA_EXCEEDED, "Native fixture exceeded its reservation");
                }
                usage.bytes += reservation.getValue() - attributes.size();
            } else {
                usage.bytes += reservation.getValue();
                usage.entries++;
            }
            checkLimits(usage.bytes, usage.entries);
        }
        for (TreeReservation tree : lease.trees.values()) {
            Usage actual = subtreeUsage(usage, tree.path);
            checkTreeLimits(tree, actual.bytes, actual.entries);
            usage.bytes += tree.bytes - actual.bytes;
            usage.entries += tree.entries - actual.entries;
            checkLimits(usage.bytes, usage.entries);
        }
        return usage;
    }

    private static void scanDirectory(Path directory, int depth, Usage usage)
            throws IOException {
        if (depth > MAX_DEPTH) throw error(Code.QUOTA_EXCEEDED, "Scratch depth exceeded");
        directoryAttributes(directory);
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(directory)) {
            for (Path child : stream) {
                if (depth + 1 > MAX_DEPTH) {
                    throw error(Code.QUOTA_EXCEEDED, "Scratch depth exceeded");
                }
                BasicFileAttributes attributes = Files.readAttributes(child,
                        BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
                usage.entries++;
                checkLimits(usage.bytes, usage.entries);
                if (attributes.isSymbolicLink()) {
                    throw error(Code.UNSAFE_PATH, "Symbolic links are forbidden in scratch");
                }
                if (attributes.isDirectory()) {
                    usage.actual.put(child, 0L);
                    scanDirectory(child, depth + 1, usage);
                } else if (attributes.isRegularFile()) {
                    if (attributes.size() < 0 || attributes.size() > MAX_BYTES) {
                        throw error(Code.QUOTA_EXCEEDED, "Scratch file exceeds byte limit");
                    }
                    usage.bytes += attributes.size();
                    usage.actual.put(child, attributes.size());
                    checkLimits(usage.bytes, usage.entries);
                } else {
                    throw error(Code.UNSAFE_PATH, "Non-regular scratch entry is forbidden");
                }
            }
        }
    }

    private static void checkLimits(long bytes, int entries) throws LeaseException {
        if (bytes < 0 || bytes > MAX_BYTES || entries < 0 || entries > MAX_FILES) {
            throw error(Code.QUOTA_EXCEEDED, "Scratch quota exceeded");
        }
    }

    private Path resolve(Lease lease, String relative) throws IOException {
        verifyRoot(lease);
        if (relative == null || relative.isEmpty() || relative.length() > 1024
                || relative.startsWith("/") || relative.indexOf('\\') >= 0) {
            throw error(Code.UNSAFE_PATH, "Invalid fixture relative path");
        }
        String[] components = relative.split("/", -1);
        if (components.length > MAX_DEPTH) {
            throw error(Code.QUOTA_EXCEEDED, "Fixture path depth exceeds limit");
        }
        for (String component : components) {
            if (component.equals(".") || component.equals("..")
                    || !component.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")) {
                throw error(Code.UNSAFE_PATH, "Invalid fixture path component");
            }
        }
        Path path = lease.scratchRoot.resolve(Paths.get(relative));
        if (!path.normalize().equals(path) || !path.startsWith(lease.scratchRoot)) {
            throw error(Code.UNSAFE_PATH, "Fixture escaped its scratch root");
        }
        return path;
    }

    private List<Path> missingDirectories(Lease lease, Path target) throws IOException {
        List<Path> missing = new ArrayList<>();
        Path current = lease.scratchRoot;
        for (Path component : lease.scratchRoot.relativize(target)) {
            current = current.resolve(component);
            BasicFileAttributes attributes = attributesIfExists(current);
            if (attributes == null) missing.add(current);
            else if (!attributes.isDirectory() || attributes.isSymbolicLink()) {
                throw error(Code.UNSAFE_PATH, "Fixture directory is not a real directory");
            }
        }
        return missing;
    }

    private void verifyParents(Lease lease, Path target) throws IOException {
        verifyRoot(lease);
        Path current = lease.scratchRoot;
        Path parent = target.getParent();
        if (parent == null || !parent.startsWith(current)) {
            throw error(Code.UNSAFE_PATH, "Fixture parent escaped root");
        }
        for (Path component : current.relativize(parent)) {
            current = current.resolve(component);
            directoryAttributes(current);
        }
    }

    private void verifyRoot(Lease lease) throws IOException {
        verifyAnchors(shared);
        sameDirectory(lease.scratchRoot, lease.rootKey);
    }

    private static void verifyAnchors(Shared state) throws IOException {
        verifyAncestors(state.cacheRoot);
        sameDirectory(state.cacheRoot, state.cacheKey);
        sameDirectory(state.parent, state.parentKey);
    }

    private static void verifyAncestors(Path path) throws IOException {
        Path current = path.getRoot();
        directoryAttributes(current);
        for (Path component : path) {
            current = current.resolve(component);
            directoryAttributes(current);
        }
    }

    private static void sameDirectory(Path directory, Object key) throws IOException {
        if (!key.equals(requireKey(directoryAttributes(directory)))) {
            throw error(Code.UNSAFE_PATH, "Scratch ownership anchor was replaced");
        }
    }

    private static BasicFileAttributes directoryAttributes(Path path) throws IOException {
        BasicFileAttributes attributes = Files.readAttributes(path,
                BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (!attributes.isDirectory() || attributes.isSymbolicLink()) {
            throw error(Code.UNSAFE_PATH, "Expected a real directory, not a link");
        }
        return attributes;
    }

    private static Object requireKey(BasicFileAttributes attributes) throws IOException {
        if (attributes.fileKey() == null) {
            throw error(Code.UNSAFE_PATH, "Filesystem lacks stable ownership identity");
        }
        return attributes.fileKey();
    }

    private static BasicFileAttributes attributesIfExists(Path path) throws IOException {
        try {
            return Files.readAttributes(path, BasicFileAttributes.class,
                    LinkOption.NOFOLLOW_LINKS);
        } catch (java.nio.file.NoSuchFileException missing) {
            return null;
        }
    }

    /**
     * Only the captured root is removed, never its parent, siblings or old runs.
     * NOFOLLOW attributes prevent link traversal; replaced anchors fail closed.
     * The app-private directory must not be concurrently mutated by other native
     * code. Portable Java cannot sandbox malicious same-UID filesystem writers.
     */
    private void cleanup(Lease lease) throws IOException {
        if (lease.operations != 0) throw error(Code.BUSY, "Operation has not unwound");
        try {
            verifyAnchors(shared);
            BasicFileAttributes rootAttributes = attributesIfExists(lease.scratchRoot);
            if (rootAttributes != null) {
                if (rootAttributes.isSymbolicLink()) {
                    // Delete only the substituted link, never its destination.
                    Files.delete(lease.scratchRoot);
                } else {
                    sameDirectory(lease.scratchRoot, lease.rootKey);
                    int[] count = { 0 };
                    deleteOwnedTree(lease.scratchRoot, 0, count);
                }
            }
            if (Files.exists(lease.scratchRoot, LinkOption.NOFOLLOW_LINKS)) {
                throw new IOException("Scratch root still exists after cleanup");
            }
            lease.reservations.clear();
            lease.trees.clear();
            if (lease.expiration != null) lease.expiration.cancel(false);
            if (shared.current == lease) {
                shared.current = null;
                shared.lastClosedHandle = lease.handle;
            }
        } catch (IOException exception) {
            lease.closing = true;
            lease.cancelled = true;
            throw new LeaseException(Code.CLEANUP_FAILED,
                    "Own scratch cleanup failed; new leases remain blocked", exception);
        }
    }

    private static void deleteOwnedTree(Path target, int depth, int[] count)
            throws IOException {
        // Broader than fixture limits to clean a failed oversized native builder,
        // but bounded to avoid an unbounded walk after corruption.
        if (++count[0] > 4096 || depth > 64) {
            throw new IOException("Corrupt scratch exceeds bounded cleanup limits");
        }
        BasicFileAttributes attributes = Files.readAttributes(target,
                BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (attributes.isDirectory() && !attributes.isSymbolicLink()) {
            Object key = requireKey(attributes);
            try (DirectoryStream<Path> children = Files.newDirectoryStream(target)) {
                for (Path child : children) {
                    sameDirectory(target, key);
                    deleteOwnedTree(child, depth + 1, count);
                }
            }
            sameDirectory(target, key);
        }
        Files.delete(target);
    }

    private static String randomHex(int byteCount) {
        byte[] bytes = new byte[byteCount];
        RANDOM.nextBytes(bytes);
        char[] chars = new char[byteCount * 2];
        char[] alphabet = "0123456789abcdef".toCharArray();
        for (int i = 0; i < bytes.length; i++) {
            chars[i * 2] = alphabet[(bytes[i] & 0xff) >>> 4];
            chars[i * 2 + 1] = alphabet[bytes[i] & 0x0f];
        }
        return new String(chars);
    }

    private static LeaseException error(Code code, String message) {
        return new LeaseException(code, message);
    }
}
