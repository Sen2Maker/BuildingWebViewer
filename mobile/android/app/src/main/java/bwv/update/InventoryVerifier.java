package bwv.update;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryIteratorException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.OpenOption;
import java.nio.file.Path;
import java.nio.file.SecureDirectoryStream;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributeView;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Isolated Java 17 foundation, not an Android installer or an authentication API.
 *
 * <p>The exact UTF-8 inventory wire format is:
 * {@code {"schema":1,"files":[{"path":"a.js","bytes":3,"sha256":"..."}]}} followed
 * by ONE LF. Fields have this order, there is no other whitespace, files are sorted
 * in ASCII path order, sizes use unsigned decimal without leading zeroes, and hashes
 * use 64 lowercase hexadecimal digits. Paths are printable, non-space portable
 * ASCII, so JSON escaping and locale-dependent sorting are unnecessary. No parser
 * is supplied: supplied entries are bound to the exact bytes by canonical encoding
 * equality, not merely assumed to match bytes whose digest was checked.
 *
 * <p>The root MUST contain {@link #INVENTORY_NAME}, which is checked against those
 * exact bytes but must not list itself. The receipt belongs OUTSIDE this payload
 * root. Receipt/inventory aliases are never payload. Empty/unlisted directories
 * are rejected as well as extra files. Verification never writes or follows links.
 * SecureDirectoryStream is required; unsupported providers fail closed. Duplicate
 * file keys catch internal hardlinks; Unix link counts additionally reject links
 * from outside the root. Result reports whether that stronger check was available.
 *
 * <p>The caller must own an immutable, private root throughout verification and
 * subsequent use. This is not a filesystem snapshot or a protection against a
 * concurrent privileged writer; portable Java cannot atomically fstat a channel's
 * link count. No-follow handle-relative traversal plus before/after checks reduce
 * races, but do not establish immutability. Production integration still needs a
 * strict bounded parser, signed-envelope authentication/metadata agreement, safe
 * extraction, durable publication and protected runtime roots. This class performs
 * none of those jobs and must be run again for every future cold launch.
 */
public final class InventoryVerifier {
    public static final String INVENTORY_NAME = "asset-inventory.json";
    public static final String RECEIPT_NAME = "update-receipt.json";
    public static final Set<String> RESERVED_METADATA_NAMES = Set.of(
            INVENTORY_NAME, "resource-inventory.json", "inventory.json",
            RECEIPT_NAME, ".update-receipt.json", "native-receipt.json",
            ".native-receipt.json", "receipt.json", ".receipt.json");

    private static final Set<OpenOption> READ_NOFOLLOW =
            Set.of(StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS);

    private InventoryVerifier() { }

    public record Entry(String path, long size, String sha256) { }

    /**
     * All byte limits are independent: inventory bytes do not use the payload
     * budget. maxPathBytes bounds payload paths, not the fixed inventory basename.
     */
    public record Limits(int maxInventoryBytes, int maxEntries, int maxPathBytes,
                         int maxDepth, long maxFileBytes, long maxTotalBytes) {
        public Limits {
            if (maxInventoryBytes < 1 || maxEntries < 0 || maxPathBytes < 1
                    || maxDepth < 1 || maxFileBytes < 0 || maxTotalBytes < 0) {
                throw new IllegalArgumentException("Limits must be nonnegative with positive path/format bounds");
            }
        }

        public static Limits defaults() {
            return new Limits(2 * 1024 * 1024, 3_000, 240, 32,
                    64L * 1024 * 1024, 64L * 1024 * 1024);
        }
    }

    public record Result(int fileCount, long totalBytes, String inventorySha256,
                         boolean allHardLinkCountsChecked) { }

    public enum Failure {
        BAD_INPUT, LIMIT, PATH, DUPLICATE, CASE_COLLISION, FILE_DIRECTORY_CONFLICT,
        RESERVED_METADATA, INVENTORY_BINDING, HASH, SIZE, MISSING, EXTRA,
        SYMLINK, HARDLINK, FILE_TYPE, CHANGED, UNSUPPORTED_FILESYSTEM
    }

    public static final class VerificationException extends IOException {
        private static final long serialVersionUID = 1L;
        private final Failure failure;

        public VerificationException(Failure failure, String message) {
            super(message);
            this.failure = failure;
        }

        public Failure failure() { return failure; }
    }

    /** Deterministic serializer for the explicitly documented foundation JSON schema. */
    public static byte[] canonicalBytes(List<Entry> entries, Limits limits) throws IOException {
        return encode(validateEntries(entries, limits), limits);
    }

    /**
     * Checks canonical byte binding, external inventory hash and an exact on-disk
     * bijection. A successful result is content validation, NOT signature validation.
     * expectedInventoryHash must already have come from an authenticated envelope.
     */
    public static Result verify(Path root, List<Entry> entries, String expectedInventoryHash,
                                byte[] exactInventoryBytes, Limits limits) throws IOException {
        if (root == null || exactInventoryBytes == null || limits == null) {
            throw bad(Failure.BAD_INPUT, "Missing root, inventory bytes or limits");
        }
        if (exactInventoryBytes.length > limits.maxInventoryBytes()) {
            throw bad(Failure.LIMIT, "Inventory byte limit exceeded");
        }
        validateHash(expectedInventoryHash);
        byte[] inventoryBytes = exactInventoryBytes.clone();
        Validated validated = validateEntries(entries, limits);
        if (!Arrays.equals(inventoryBytes, encode(validated, limits))) {
            throw bad(Failure.INVENTORY_BINDING, "Entries do not match exact canonical inventory bytes");
        }
        if (!MessageDigest.isEqual(sha256().digest(inventoryBytes),
                PortableHex.parse(expectedInventoryHash))) {
            throw bad(Failure.HASH, "Externally bound inventory SHA256 mismatch");
        }

        Path absoluteRoot = root.toAbsolutePath();
        if (!absoluteRoot.equals(absoluteRoot.normalize())) {
            throw bad(Failure.PATH, "Root path must not contain dot segments");
        }
        rejectSymlinkAncestors(absoluteRoot);
        BasicFileAttributes before = Files.readAttributes(absoluteRoot,
                BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (!before.isDirectory() || before.isSymbolicLink()) {
            throw bad(Failure.FILE_TYPE, "Payload root must be a real directory");
        }
        State state = new State(absoluteRoot, validated, inventoryBytes,
                expectedInventoryHash, limits);
        state.addFileKey(before, "<root>");
        try (DirectoryStream<Path> raw = Files.newDirectoryStream(absoluteRoot)) {
            if (!(raw instanceof SecureDirectoryStream<?>)) {
                throw bad(Failure.UNSUPPORTED_FILESYSTEM, "Secure no-follow traversal is unavailable");
            }
            @SuppressWarnings("unchecked")
            SecureDirectoryStream<Path> secure = (SecureDirectoryStream<Path>) raw;
            BasicFileAttributes pinned = secure.getFileAttributeView(BasicFileAttributeView.class)
                    .readAttributes();
            requireUnchanged(before, pinned, "<root>");
            state.walk(secure, "");
            requireUnchanged(pinned, secure.getFileAttributeView(BasicFileAttributeView.class)
                    .readAttributes(), "<root>");
        } catch (DirectoryIteratorException failure) {
            throw failure.getCause();
        }
        requireUnchanged(before, Files.readAttributes(absoluteRoot,
                BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS), "<root>");
        if (!state.inventorySeen || state.seenFiles.size() != validated.files.size()) {
            throw bad(Failure.MISSING, "Inventory or one or more listed files are missing");
        }
        return new Result(state.seenFiles.size(), validated.totalBytes,
                expectedInventoryHash, state.allLinkCountsChecked);
    }

    private record Validated(Map<String, Entry> files, Set<String> directories, long totalBytes) { }

    private static Validated validateEntries(List<Entry> entries, Limits limits) throws IOException {
        if (entries == null || limits == null) {
            throw bad(Failure.BAD_INPUT, "Missing entries or limits");
        }
        if (entries.size() > limits.maxEntries()) {
            throw bad(Failure.LIMIT, "Inventory entry count limit exceeded");
        }
        Map<String, Entry> files = new TreeMap<>();
        Set<String> directories = new HashSet<>();
        Map<String, String> spellings = new HashMap<>();
        long total = 0;
        int count = 0;
        for (Entry entry : entries) {
            if (++count > limits.maxEntries()) {
                throw bad(Failure.LIMIT, "Inventory entry count limit exceeded");
            }
            if (entry == null) throw bad(Failure.BAD_INPUT, "Null inventory entry");
            validatePath(entry.path(), limits);
            validateHash(entry.sha256());
            if (entry.size() < 0 || entry.size() > limits.maxFileBytes()) {
                throw bad(Failure.LIMIT, "Per-file size limit exceeded: " + entry.path());
            }
            if (entry.size() > limits.maxTotalBytes() - total) {
                throw bad(Failure.LIMIT, "Total payload size limit exceeded");
            }
            total += entry.size();
            if (files.putIfAbsent(entry.path(), entry) != null) {
                throw bad(Failure.DUPLICATE, "Duplicate inventory path: " + entry.path());
            }
            String prefix = "";
            String[] segments = entry.path().split("/", -1);
            for (int i = 0; i < segments.length; i++) {
                String segment = segments[i];
                if (RESERVED_METADATA_NAMES.contains(segment.toLowerCase(Locale.ROOT))) {
                    throw bad(Failure.RESERVED_METADATA, "Reserved metadata alias: " + entry.path());
                }
                prefix = prefix.isEmpty() ? segment : prefix + "/" + segment;
                String previous = spellings.putIfAbsent(prefix.toLowerCase(Locale.ROOT), prefix);
                if (previous != null && !previous.equals(prefix)) {
                    throw bad(Failure.CASE_COLLISION, "Case-colliding paths: " + previous + " and " + prefix);
                }
                if (i < segments.length - 1) directories.add(prefix);
            }
        }
        for (String path : files.keySet()) {
            if (directories.contains(path)) {
                throw bad(Failure.FILE_DIRECTORY_CONFLICT, "File/directory conflict: " + path);
            }
        }
        return new Validated(files, directories, total);
    }

    private static byte[] encode(Validated validated, Limits limits) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(Math.min(4096, limits.maxInventoryBytes()));
        append(output, "{\"schema\":1,\"files\":[", limits);
        boolean first = true;
        for (Entry entry : validated.files.values()) {
            if (!first) append(output, ",", limits);
            first = false;
            append(output, "{\"path\":\"" + entry.path() + "\",\"bytes\":" + entry.size()
                    + ",\"sha256\":\"" + entry.sha256() + "\"}", limits);
        }
        append(output, "]}\n", limits);
        return output.toByteArray();
    }

    private static void append(ByteArrayOutputStream output, String text, Limits limits) throws IOException {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > limits.maxInventoryBytes() - output.size()) {
            throw bad(Failure.LIMIT, "Canonical inventory byte limit exceeded");
        }
        output.write(bytes);
    }

    private static void validatePath(String path, Limits limits) throws IOException {
        if (path == null || path.isEmpty() || path.length() > limits.maxPathBytes()) {
            throw bad(Failure.PATH, "Empty or overlong path");
        }
        for (int i = 0; i < path.length(); i++) {
            char ch = path.charAt(i);
            if (ch < 0x21 || ch > 0x7e || "\\\"<>:|?*".indexOf(ch) >= 0) {
                throw bad(Failure.PATH, "Path contains a nonportable or noncanonical character");
            }
        }
        String[] segments = path.split("/", -1);
        if (segments.length > limits.maxDepth()) {
            throw bad(Failure.LIMIT, "Path depth limit exceeded");
        }
        for (String segment : segments) {
            if (segment.isEmpty() || segment.equals(".") || segment.equals("..")
                    || segment.endsWith(".")) {
                throw bad(Failure.PATH, "Path has an empty, dot or ambiguous segment");
            }
            String base = segment.split("\\.", 2)[0].toUpperCase(Locale.ROOT);
            if (base.equals("CON") || base.equals("PRN") || base.equals("AUX")
                    || base.equals("NUL") || base.matches("(?:COM|LPT)[1-9]")) {
                throw bad(Failure.PATH, "Path uses a reserved device name");
            }
        }
    }

    private static void validateHash(String hash) throws IOException {
        if (hash == null || !hash.matches("[0-9a-f]{64}")) {
            throw bad(Failure.BAD_INPUT, "SHA256 must be 64 lowercase hexadecimal characters");
        }
    }

    private static void rejectSymlinkAncestors(Path root) throws IOException {
        Path current = root.getRoot();
        if (current == null) throw bad(Failure.PATH, "Root must have an absolute filesystem root");
        for (Path component : root) {
            current = current.resolve(component);
            BasicFileAttributes attrs = Files.readAttributes(current,
                    BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            if (attrs.isSymbolicLink()) {
                throw bad(Failure.SYMLINK, "Root or root ancestor is a symbolic link");
            }
        }
    }

    private static void requireUnchanged(BasicFileAttributes before, BasicFileAttributes after,
                                         String path) throws IOException {
        if (before.isDirectory() != after.isDirectory() || before.isRegularFile() != after.isRegularFile()
                || before.isSymbolicLink() != after.isSymbolicLink() || before.size() != after.size()
                || !before.lastModifiedTime().equals(after.lastModifiedTime())
                || (before.fileKey() != null && !before.fileKey().equals(after.fileKey()))) {
            throw bad(Failure.CHANGED, "Entry changed during verification: " + path);
        }
    }

    private static final class State {
        final Path root;
        final Validated expected;
        final byte[] inventoryBytes;
        final String inventoryHash;
        final Limits limits;
        final Set<String> seenFiles = new HashSet<>();
        final Set<String> seenDirectories = new HashSet<>();
        final Map<Object, String> fileKeys = new HashMap<>();
        boolean inventorySeen;
        boolean allLinkCountsChecked;

        State(Path root, Validated expected, byte[] inventoryBytes, String inventoryHash, Limits limits) {
            this.root = root;
            this.expected = expected;
            this.inventoryBytes = inventoryBytes;
            this.inventoryHash = inventoryHash;
            this.limits = limits;
            this.allLinkCountsChecked = root.getFileSystem().supportedFileAttributeViews().contains("unix");
        }

        void addFileKey(BasicFileAttributes attrs, String path) throws IOException {
            if (attrs.fileKey() == null) return;
            String previous = fileKeys.putIfAbsent(attrs.fileKey(), path);
            if (previous != null) {
                throw bad(Failure.HARDLINK, "Entries alias the same filesystem object: " + previous + " and " + path);
            }
        }

        void checkLinkCount(String relative) throws IOException {
            if (!allLinkCountsChecked) return;
            Object value;
            try {
                value = Files.getAttribute(root.resolve(relative), "unix:nlink", LinkOption.NOFOLLOW_LINKS);
            } catch (UnsupportedOperationException unsupported) {
                allLinkCountsChecked = false;
                return;
            }
            if (!(value instanceof Number) || ((Number) value).longValue() != 1L) {
                throw bad(Failure.HARDLINK, "File has an external or internal hardlink: " + relative);
            }
        }

        void walk(SecureDirectoryStream<Path> directory, String prefix) throws IOException {
            for (Path item : directory) {
                Path name = item.getFileName();
                String relative = prefix.isEmpty() ? name.toString() : prefix + "/" + name;
                if (!relative.equals(INVENTORY_NAME)) validatePath(relative, limits);
                BasicFileAttributes attrs = directory.getFileAttributeView(name,
                        BasicFileAttributeView.class, LinkOption.NOFOLLOW_LINKS).readAttributes();
                if (attrs.isSymbolicLink()) {
                    throw bad(Failure.SYMLINK, "Symbolic link is forbidden: " + relative);
                }
                if (attrs.isDirectory()) {
                    if (!expected.directories.contains(relative)) {
                        throw bad(Failure.EXTRA, "Unlisted directory: " + relative);
                    }
                    if (!seenDirectories.add(relative)) {
                        throw bad(Failure.CHANGED, "Directory encountered twice: " + relative);
                    }
                    addFileKey(attrs, relative);
                    try (SecureDirectoryStream<Path> child = directory.newDirectoryStream(name,
                            LinkOption.NOFOLLOW_LINKS)) {
                        BasicFileAttributes pinned = child.getFileAttributeView(BasicFileAttributeView.class)
                                .readAttributes();
                        requireUnchanged(attrs, pinned, relative);
                        walk(child, relative);
                        requireUnchanged(pinned, child.getFileAttributeView(BasicFileAttributeView.class)
                                .readAttributes(), relative);
                    }
                    requireUnchanged(attrs, directory.getFileAttributeView(name,
                            BasicFileAttributeView.class, LinkOption.NOFOLLOW_LINKS).readAttributes(), relative);
                } else if (attrs.isRegularFile()) {
                    Entry entry;
                    if (relative.equals(INVENTORY_NAME)) {
                        if (inventorySeen) throw bad(Failure.CHANGED, "Inventory encountered twice");
                        inventorySeen = true;
                        entry = new Entry(relative, inventoryBytes.length, inventoryHash);
                    } else {
                        entry = expected.files.get(relative);
                        if (entry == null) throw bad(Failure.EXTRA, "Unlisted file: " + relative);
                        if (!seenFiles.add(relative)) throw bad(Failure.CHANGED, "File encountered twice: " + relative);
                    }
                    addFileKey(attrs, relative);
                    checkLinkCount(relative);
                    verifyFile(directory, name, attrs, entry);
                    checkLinkCount(relative);
                    requireUnchanged(attrs, directory.getFileAttributeView(name,
                            BasicFileAttributeView.class, LinkOption.NOFOLLOW_LINKS).readAttributes(), relative);
                } else {
                    throw bad(Failure.FILE_TYPE, "Nonregular payload entry: " + relative);
                }
            }
        }

        void verifyFile(SecureDirectoryStream<Path> directory, Path name,
                        BasicFileAttributes before, Entry expectedEntry) throws IOException {
            if (before.size() != expectedEntry.size()) {
                throw bad(Failure.SIZE, "File size mismatch: " + expectedEntry.path());
            }
            MessageDigest digest = sha256();
            long read = 0;
            ByteBuffer buffer = ByteBuffer.allocate(8192);
            try (SeekableByteChannel channel = directory.newByteChannel(name, READ_NOFOLLOW)) {
                if (channel.size() != expectedEntry.size()) {
                    throw bad(Failure.SIZE, "Opened file size mismatch: " + expectedEntry.path());
                }
                int size;
                while ((size = channel.read(buffer)) != -1) {
                    if (size == 0) throw bad(Failure.CHANGED, "Regular-file read made no progress");
                    if (size > expectedEntry.size() - read) {
                        throw bad(Failure.SIZE, "File grew beyond signed size: " + expectedEntry.path());
                    }
                    read += size;
                    buffer.flip();
                    if (expectedEntry.path().equals(INVENTORY_NAME)) {
                        int offset = (int) (read - size);
                        for (int i = 0; i < size; i++) {
                            if (buffer.get(i) != inventoryBytes[offset + i]) {
                                throw bad(Failure.INVENTORY_BINDING, "On-disk inventory differs from exact bytes");
                            }
                        }
                    }
                    digest.update(buffer);
                    buffer.clear();
                }
                if (read != expectedEntry.size() || channel.size() != expectedEntry.size()) {
                    throw bad(Failure.SIZE, "File shrank or changed size: " + expectedEntry.path());
                }
            }
            if (!MessageDigest.isEqual(digest.digest(), PortableHex.parse(expectedEntry.sha256()))) {
                throw bad(Failure.HASH, "File SHA256 mismatch: " + expectedEntry.path());
            }
        }
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("Java runtime lacks mandatory SHA-256", impossible);
        }
    }

    private static VerificationException bad(Failure failure, String message) {
        return new VerificationException(failure, message);
    }
}
