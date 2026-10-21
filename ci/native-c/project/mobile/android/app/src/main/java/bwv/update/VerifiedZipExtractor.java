package bwv.update;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.OpenOption;
import java.nio.file.Path;
import java.nio.file.SecureDirectoryStream;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.CRC32;
import java.util.zip.DataFormatException;
import java.util.zip.Inflater;

/**
 * Bounded, deliberately constrained ZIP reader. This is not a general ZIP importer.
 * Supports STORED/DEFLATED files and stored empty directories, ASCII resource paths,
 * UTF8 flag and optional SIGNED 16-byte data descriptors. Extra fields, comments,
 * encryption, ZIP64, multidisk archives, unsupported Unix file types, gaps, prefixes
 * and trailing bytes are rejected. Central and local records must agree exactly.
 *
 * <p>Expected archive length/digest and inventory length/digest MUST already come
 * from authenticated metadata. Exact archive bytes are checked before a destination
 * is created and rechecked before returning. No signature or native metadata check
 * is performed here. Publisher owns durable writes, publication and cleanup.
 *
 * <p>Caller owns a private immutable archive and destination parent throughout this
 * operation. No-follow handle-relative file writes and verification are used, but
 * Java mkdir has no secure-directory-relative API; concurrent privileged writers
 * are outside this contract. A fresh destination is created exactly once. Any later
 * failure leaves that directory quarantined and MUST NOT be retried into that same
 * path. Nothing is deleted or published. SecureDirectoryStream and Unix hardlink
 * checks are required; Android needs a separately reviewed filesystem adapter.
 */
public final class VerifiedZipExtractor {
    private static final long LOCAL = 0x04034b50L;
    private static final long CENTRAL = 0x02014b50L;
    private static final long EOCD = 0x06054b50L;
    private static final long DESCRIPTOR = 0x08074b50L;
    private static final String EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    private static final Set<OpenOption> NEW_FILE = Set.of(StandardOpenOption.WRITE,
            StandardOpenOption.CREATE_NEW, LinkOption.NOFOLLOW_LINKS);

    private VerifiedZipExtractor() { }

    public record Limits(long maxArchiveBytes, int maxZipEntries, int maxCentralDirectoryBytes,
                         InventoryVerifier.Limits inventoryLimits) {
        public Limits {
            if (maxArchiveBytes < 22 || maxArchiveBytes > 0xfffffffeL || maxZipEntries < 1
                    || maxZipEntries >= 65535 || maxCentralDirectoryBytes < 46 || inventoryLimits == null) {
                throw new IllegalArgumentException("Invalid constrained ZIP limits");
            }
        }

        public static Limits defaults() {
            return new Limits(64L * 1024 * 1024, 6001, 2 * 1024 * 1024,
                    InventoryVerifier.Limits.defaults());
        }
    }

    public record ExtractedResult(Path root, List<InventoryVerifier.Entry> entries,
                                  byte[] exactInventoryBytes, InventoryVerifier.Result verification) {
        public ExtractedResult {
            entries = List.copyOf(entries);
            exactInventoryBytes = exactInventoryBytes.clone();
        }
        @Override public byte[] exactInventoryBytes() { return exactInventoryBytes.clone(); }
    }

    private record ZipEntry(String name, byte[] nameBytes, boolean directory, int version, long timestamp, int flags, int method,
                            long crc, long compressed, long expanded, long localOffset, long dataOffset) {
        ZipEntry withDataOffset(long value) {
            return new ZipEntry(name, nameBytes, directory, version, timestamp, flags, method, crc, compressed, expanded, localOffset, value);
        }
    }

    /** Parses only canonical schema-1 inventories and returns an immutable bounded list. */
    public static List<InventoryVerifier.Entry> parseInventory(byte[] exactBytes, Limits limits) throws IOException {
        require(exactBytes != null && limits != null, "Missing inventory or limits");
        InventoryVerifier.Limits bounds = limits.inventoryLimits();
        require(exactBytes.length <= bounds.maxInventoryBytes(), "Inventory byte limit exceeded");
        exactBytes = exactBytes.clone();
        Map<String, Object> object = StrictJson.object(StrictJson.parse(exactBytes, bounds.maxInventoryBytes(), 8));
        StrictJson.exactKeys(object, "schema", "files");
        require(StrictJson.integer(object, "schema") == 1, "Unsupported inventory schema");
        List<Object> raw = StrictJson.array(object.get("files"));
        require(raw.size() <= bounds.maxEntries(), "Inventory entry count exceeded");
        List<InventoryVerifier.Entry> entries = new ArrayList<>(raw.size());
        for (Object value : raw) {
            Map<String, Object> entry = StrictJson.object(value);
            StrictJson.exactKeys(entry, "path", "bytes", "sha256");
            entries.add(new InventoryVerifier.Entry(StrictJson.string(entry, "path"),
                    StrictJson.integer(entry, "bytes"), StrictJson.string(entry, "sha256")));
        }
        require(Arrays.equals(exactBytes, InventoryVerifier.canonicalBytes(entries, bounds)),
                "Inventory bytes are not the exact canonical representation");
        return List.copyOf(entries);
    }

    public static ExtractedResult extract(Path archive, Path freshDestination,
                                          String expectedArchiveHash, long expectedArchiveBytes,
                                          String inventoryHash, long inventoryBytes, Limits limits) throws IOException {
        require(archive != null && freshDestination != null && limits != null, "Missing extraction input");
        validateHash(expectedArchiveHash);
        validateHash(inventoryHash);
        require(expectedArchiveBytes >= 22 && expectedArchiveBytes <= limits.maxArchiveBytes(), "Archive byte limit exceeded");
        require(inventoryBytes > 0 && inventoryBytes <= limits.inventoryLimits().maxInventoryBytes(), "Inventory byte limit exceeded");
        Path archivePath = canonicalAbsolute(archive);
        Path destination = canonicalAbsolute(freshDestination);
        require(destination.getParent() != null, "Destination cannot be filesystem root");
        rejectSymlinkAncestors(archivePath);
        rejectSymlinkAncestors(destination.getParent());
        BasicFileAttributes before = Files.readAttributes(archivePath, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        require(before.isRegularFile() && !before.isSymbolicLink(), "Archive must be a regular no-follow file");
        require(before.size() == expectedArchiveBytes, "Signed archive size mismatch");
        requireSingleLink(archivePath);
        try (FileChannel channel = FileChannel.open(archivePath, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
            verifyArchiveHash(channel, expectedArchiveBytes, expectedArchiveHash);
            List<ZipEntry> entries = parseArchive(channel, expectedArchiveBytes, inventoryBytes, limits);
            // CREATE_NEW behavior for the root; even an existing empty directory is not reusable.
            Files.createDirectory(destination);
            byte[] exactInventory = null;
            Set<String> createdDirectories = new HashSet<>();
            long actualPayloadBytes = 0;
            try (DirectoryStream<Path> raw = Files.newDirectoryStream(destination)) {
                require(raw instanceof SecureDirectoryStream<?>, "Secure filesystem traversal unavailable");
                @SuppressWarnings("unchecked")
                SecureDirectoryStream<Path> root = (SecureDirectoryStream<Path>) raw;
                for (ZipEntry entry : entries) {
                    createParents(destination, entry.name(), entry.directory(), createdDirectories);
                    if (entry.directory()) continue;
                    boolean inventory = entry.name().equals(InventoryVerifier.INVENTORY_NAME);
                    long remainingPayload = limits.inventoryLimits().maxTotalBytes() - actualPayloadBytes;
                    long byteLimit = inventory ? inventoryBytes : Math.min(limits.inventoryLimits().maxFileBytes(), remainingPayload);
                    ByteArrayOutputStream capture = inventory ? new ByteArrayOutputStream((int) inventoryBytes) : null;
                    try (SeekableByteChannel output = createFile(root, entry.name())) {
                        long written = expand(channel, entry, output, capture, byteLimit);
                        if (!inventory) actualPayloadBytes += written;
                    }
                    if (inventory) exactInventory = capture.toByteArray();
                }
            }
            require(exactInventory != null && exactInventory.length == inventoryBytes, "Inventory missing or wrong size");
            require(MessageDigest.isEqual(digest().digest(exactInventory), PortableHex.parse(inventoryHash)),
                    "Signed inventory digest mismatch");
            List<InventoryVerifier.Entry> resources = parseInventory(exactInventory, limits);
            verifyArchiveHash(channel, expectedArchiveBytes, expectedArchiveHash);
            BasicFileAttributes after = Files.readAttributes(archivePath, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            require(after.isRegularFile() && !after.isSymbolicLink() && after.size() == before.size()
                            && after.lastModifiedTime().equals(before.lastModifiedTime())
                            && (before.fileKey() == null || before.fileKey().equals(after.fileKey())),
                    "Archive changed during extraction");
            requireSingleLink(archivePath);
            InventoryVerifier.Result verified = InventoryVerifier.verify(destination, resources,
                    inventoryHash, exactInventory, limits.inventoryLimits());
            require(verified.allHardLinkCountsChecked(), "Complete hardlink detection unavailable");
            return new ExtractedResult(destination, resources, exactInventory, verified);
        }
    }

    private static List<ZipEntry> parseArchive(FileChannel channel, long archiveBytes,
                                              long inventoryBytes, Limits limits) throws IOException {
        ByteBuffer end = read(channel, archiveBytes - 22, 22);
        require(u32(end, 0) == EOCD, "Missing terminal EOCD; prefixes, comments and trailing data are unsupported");
        int disk = u16(end, 4), centralDisk = u16(end, 6), diskCount = u16(end, 8), count = u16(end, 10);
        long centralBytes = u32(end, 12), centralOffset = u32(end, 16);
        require(disk == 0 && centralDisk == 0 && diskCount == count, "Multidisk ZIP is unsupported");
        require(count > 0 && count < 65535 && count <= limits.maxZipEntries(), "ZIP entry count exceeded or ZIP64 sentinel");
        require(centralBytes != 0xffffffffL && centralOffset != 0xffffffffL, "ZIP64 is unsupported");
        require(u16(end, 20) == 0, "Archive comments are unsupported");
        require(centralBytes <= limits.maxCentralDirectoryBytes(), "Central directory byte limit exceeded");
        require(centralOffset + centralBytes == archiveBytes - 22, "Central directory is not contiguous with terminal EOCD");
        ByteBuffer central = read(channel, centralOffset, (int) centralBytes);
        List<ZipEntry> entries = new ArrayList<>(count);
        int cursor = 0;
        for (int i = 0; i < count; i++) {
            require(central.remaining() >= 0 && central.limit() - cursor >= 46, "Truncated central record");
            require(u32(central, cursor) == CENTRAL, "Invalid central directory signature");
            int needed = u16(central, cursor + 6), flags = u16(central, cursor + 8), method = u16(central, cursor + 10);
            long crc = u32(central, cursor + 16), compressed = u32(central, cursor + 20), expanded = u32(central, cursor + 24);
            int nameLength = u16(central, cursor + 28), extraLength = u16(central, cursor + 30), commentLength = u16(central, cursor + 32);
            int startDisk = u16(central, cursor + 34);
            long attributes = u32(central, cursor + 38), offset = u32(central, cursor + 42);
            require(needed >= 10 && needed <= 20 && compressed != 0xffffffffL && expanded != 0xffffffffL
                    && offset != 0xffffffffL, "ZIP64 or unsupported ZIP version");
            require((flags & ~0x0808) == 0, "Encrypted or unsupported ZIP flags");
            require(method == 0 || method == 8, "Unsupported ZIP compression method");
            require(extraLength == 0 && commentLength == 0, "ZIP extra fields and entry comments are unsupported");
            require(startDisk == 0, "Multidisk central entry");
            require(nameLength > 0 && nameLength <= Math.max(limits.inventoryLimits().maxPathBytes(),
                    InventoryVerifier.INVENTORY_NAME.length()) + 1, "ZIP filename byte limit exceeded");
            require(nameLength <= central.limit() - cursor - 46, "Truncated central filename");
            byte[] nameBytes = new byte[nameLength];
            central.get(cursor + 46, nameBytes);
            String name = asciiName(nameBytes);
            boolean directory = name.endsWith("/");
            if (directory) name = name.substring(0, name.length() - 1);
            validateResourcePath(name, directory, limits);
            int mode = (int) ((attributes >>> 16) & 0xffff), type = mode & 0170000;
            require(type == 0 || type == (directory ? 0040000 : 0100000), "Unix links, devices or inconsistent file type are forbidden");
            require((mode & 07000) == 0, "Privileged Unix mode bits are forbidden");
            require((attributes & 0x10) == 0 || directory, "DOS directory attribute conflicts with filename");
            if (directory) {
                require(method == 0 && compressed == 0 && expanded == 0 && crc == 0 && (flags & 8) == 0,
                        "Directories must be stored empty records");
            } else if (method == 0) {
                require(compressed == expanded, "Stored file compressed/expanded sizes disagree");
            }
            entries.add(new ZipEntry(name, nameBytes, directory, needed, u32(central, cursor + 12), flags, method,
                    crc, compressed, expanded, offset, 0));
            cursor += 46 + nameLength;
        }
        require(cursor == central.limit(), "Unparsed central directory records or bytes");
        validatePathsAndBudgets(entries, inventoryBytes, limits);
        entries.sort(Comparator.comparingLong(ZipEntry::localOffset));
        List<ZipEntry> checked = new ArrayList<>(entries.size());
        long expectedOffset = 0;
        for (ZipEntry entry : entries) {
            require(entry.localOffset() == expectedOffset, "ZIP contains gaps, aliases or prepended data");
            require(centralOffset - expectedOffset >= 30, "Truncated local header");
            ByteBuffer local = read(channel, expectedOffset, 30);
            require(u32(local, 0) == LOCAL, "Invalid local header signature");
            require(u16(local, 4) == entry.version() && u16(local, 6) == entry.flags()
                    && u16(local, 8) == entry.method() && u32(local, 10) == entry.timestamp(),
                    "Central/local version, timestamp, flags or method mismatch");
            int localNameLength = u16(local, 26), localExtraLength = u16(local, 28);
            require(localExtraLength == 0 && localNameLength == entry.nameBytes().length, "Central/local name or extra-field mismatch");
            long dataOffset = expectedOffset + 30 + localNameLength;
            require(dataOffset <= centralOffset && entry.compressed() <= centralOffset - dataOffset,
                    "Local compressed data overlaps central directory");
            byte[] localName = read(channel, expectedOffset + 30, localNameLength).array();
            require(Arrays.equals(localName, entry.nameBytes()), "Central/local filename mismatch");
            long crc = u32(local, 14), compressed = u32(local, 18), expanded = u32(local, 22);
            boolean exact = crc == entry.crc() && compressed == entry.compressed() && expanded == entry.expanded();
            if ((entry.flags() & 8) == 0) require(exact, "Central/local CRC or sizes mismatch");
            else require(exact || (crc == 0 && compressed == 0 && expanded == 0), "Invalid data-descriptor placeholders");
            expectedOffset = dataOffset + entry.compressed();
            if ((entry.flags() & 8) != 0) {
                require(centralOffset - expectedOffset >= 16, "Truncated signed data descriptor");
                ByteBuffer descriptor = read(channel, expectedOffset, 16);
                require(u32(descriptor, 0) == DESCRIPTOR && u32(descriptor, 4) == entry.crc()
                        && u32(descriptor, 8) == entry.compressed() && u32(descriptor, 12) == entry.expanded(),
                        "Data descriptor does not match central metadata");
                expectedOffset += 16;
            }
            checked.add(entry.withDataOffset(dataOffset));
        }
        require(expectedOffset == centralOffset, "Trailing local records or unaccounted archive bytes");
        return List.copyOf(checked);
    }

    private static void validatePathsAndBudgets(List<ZipEntry> entries, long inventoryBytes, Limits limits) throws IOException {
        Map<String, Boolean> explicit = new HashMap<>();
        Map<String, String> spelling = new HashMap<>();
        Set<String> directoryPaths = new HashSet<>();
        long total = 0;
        int files = 0, inventoryCount = 0;
        for (ZipEntry entry : entries) {
            require(explicit.putIfAbsent(entry.name(), entry.directory()) == null, "Duplicate ZIP path");
            String prefix = "";
            String[] parts = entry.name().split("/", -1);
            for (int i = 0; i < parts.length; i++) {
                prefix = prefix.isEmpty() ? parts[i] : prefix + "/" + parts[i];
                String previous = spelling.putIfAbsent(prefix.toLowerCase(Locale.ROOT), prefix);
                require(previous == null || previous.equals(prefix), "Case-colliding ZIP path");
                if (i < parts.length - 1 || entry.directory()) directoryPaths.add(prefix);
            }
            if (entry.directory()) continue;
            if (entry.name().equals(InventoryVerifier.INVENTORY_NAME)) {
                inventoryCount++;
                require(entry.expanded() == inventoryBytes, "Signed inventory length differs from ZIP entry");
            } else {
                require(++files <= limits.inventoryLimits().maxEntries(), "ZIP resource count exceeded");
                require(entry.expanded() <= limits.inventoryLimits().maxFileBytes(), "Declared per-file expansion limit exceeded");
                require(entry.expanded() <= limits.inventoryLimits().maxTotalBytes() - total, "Declared total expansion limit exceeded");
                total += entry.expanded();
            }
        }
        require(inventoryCount == 1, "ZIP must contain exactly one root inventory");
        for (ZipEntry entry : entries) {
            require(entry.directory() || !directoryPaths.contains(entry.name()), "ZIP file/directory conflict");
        }
    }

    private static long expand(FileChannel archive, ZipEntry entry, SeekableByteChannel output,
                               ByteArrayOutputStream capture, long byteLimit) throws IOException {
        byte[] input = new byte[16 * 1024], buffer = new byte[16 * 1024];
        CRC32 crc = new CRC32();
        long[] written = {0};
        if (entry.method() == 0) {
            long position = entry.dataOffset(), remaining = entry.compressed();
            while (remaining > 0) {
                int count = (int) Math.min(input.length, remaining);
                readInto(archive, position, input, count);
                writeExpanded(output, capture, crc, written, input, count, entry.expanded(), byteLimit);
                remaining -= count;
                position += count;
            }
        } else {
            Inflater inflater = new Inflater(true);
            try {
                long position = entry.dataOffset(), remaining = entry.compressed();
                while (!inflater.finished()) {
                    if (inflater.needsInput()) {
                        require(remaining > 0, "Truncated deflate stream");
                        int count = (int) Math.min(input.length, remaining);
                        readInto(archive, position, input, count);
                        position += count;
                        remaining -= count;
                        inflater.setInput(input, 0, count);
                    }
                    int count = inflater.inflate(buffer);
                    if (count > 0) writeExpanded(output, capture, crc, written, buffer, count, entry.expanded(), byteLimit);
                    else require(inflater.finished() || inflater.needsInput(), "Deflate stalled or requires dictionary");
                    require(!inflater.needsDictionary(), "Deflate dictionary is unsupported");
                }
                require(remaining == 0 && inflater.getBytesRead() == entry.compressed(), "Extra bytes after deflate stream");
            } catch (DataFormatException malformed) {
                throw new IOException("Invalid deflate stream", malformed);
            } finally {
                inflater.end();
            }
        }
        require(written[0] == entry.expanded(), "Actual expansion does not match declared size");
        require(crc.getValue() == entry.crc(), "ZIP CRC mismatch");
        return written[0];
    }

    private static void writeExpanded(SeekableByteChannel output, ByteArrayOutputStream capture, CRC32 crc,
                                       long[] written, byte[] bytes, int count, long expected, long limit) throws IOException {
        require(count <= expected - written[0] && count <= limit - written[0], "Actual ZIP expansion limit exceeded");
        ByteBuffer data = ByteBuffer.wrap(bytes, 0, count);
        while (data.hasRemaining()) require(output.write(data) > 0, "File write made no progress");
        if (capture != null) capture.write(bytes, 0, count);
        crc.update(bytes, 0, count);
        written[0] += count;
    }

    private static void createParents(Path root, String name, boolean directory, Set<String> created) throws IOException {
        String[] segments = name.split("/");
        int count = directory ? segments.length : segments.length - 1;
        Path current = root;
        String relative = "";
        for (int i = 0; i < count; i++) {
            current = current.resolve(segments[i]);
            relative = relative.isEmpty() ? segments[i] : relative + "/" + segments[i];
            if (created.add(relative)) Files.createDirectory(current);
            BasicFileAttributes attributes = Files.readAttributes(current, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            require(attributes.isDirectory() && !attributes.isSymbolicLink(), "Extraction parent is not a real directory");
        }
    }

    private static SeekableByteChannel createFile(SecureDirectoryStream<Path> root, String name) throws IOException {
        String[] components = name.split("/");
        List<SecureDirectoryStream<Path>> opened = new ArrayList<>();
        SecureDirectoryStream<Path> parent = root;
        try {
            for (int i = 0; i < components.length - 1; i++) {
                parent = parent.newDirectoryStream(java.nio.file.Paths.get(components[i]), LinkOption.NOFOLLOW_LINKS);
                opened.add(parent);
            }
            return parent.newByteChannel(java.nio.file.Paths.get(components[components.length - 1]), NEW_FILE);
        } finally {
            for (int i = opened.size() - 1; i >= 0; i--) opened.get(i).close();
        }
    }

    private static void verifyArchiveHash(FileChannel channel, long expectedBytes, String expectedHash) throws IOException {
        require(channel.size() == expectedBytes, "Signed archive byte length mismatch");
        MessageDigest digest = digest();
        byte[] buffer = new byte[16 * 1024];
        long position = 0;
        while (position < expectedBytes) {
            int count = (int) Math.min(buffer.length, expectedBytes - position);
            readInto(channel, position, buffer, count);
            digest.update(buffer, 0, count);
            position += count;
        }
        require(channel.size() == expectedBytes && MessageDigest.isEqual(digest.digest(),
                PortableHex.parse(expectedHash)), "Signed archive SHA256 mismatch");
    }

    private static void validateResourcePath(String name, boolean directory, Limits limits) throws IOException {
        if (!directory && name.equals(InventoryVerifier.INVENTORY_NAME)) return;
        InventoryVerifier.canonicalBytes(List.of(new InventoryVerifier.Entry(name, 0, EMPTY_HASH)), limits.inventoryLimits());
    }

    private static String asciiName(byte[] bytes) throws IOException {
        for (byte value : bytes) require(value >= 0x21 && value <= 0x7e, "ZIP names must be canonical printable ASCII");
        return new String(bytes, StandardCharsets.US_ASCII);
    }

    private static Path canonicalAbsolute(Path path) throws IOException {
        Path result = path.toAbsolutePath();
        require(result.equals(result.normalize()), "Filesystem path has dot segments");
        return result;
    }

    private static void rejectSymlinkAncestors(Path path) throws IOException {
        Path current = path.getRoot();
        for (Path segment : path) {
            current = current.resolve(segment);
            BasicFileAttributes attributes = Files.readAttributes(current, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            require(!attributes.isSymbolicLink(), "Filesystem path has a symbolic-link ancestor");
        }
    }

    private static void requireSingleLink(Path path) throws IOException {
        require(path.getFileSystem().supportedFileAttributeViews().contains("unix"), "Unix hardlink detection unavailable");
        Object links = Files.getAttribute(path, "unix:nlink", LinkOption.NOFOLLOW_LINKS);
        require(links instanceof Number && ((Number) links).longValue() == 1, "Archive has hardlinks");
    }

    private static ByteBuffer read(FileChannel channel, long position, int count) throws IOException {
        require(position >= 0 && count >= 0 && position <= channel.size() && count <= channel.size() - position,
                "Archive read exceeds exact bounds");
        byte[] bytes = new byte[count];
        readInto(channel, position, bytes, count);
        return ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
    }

    private static void readInto(FileChannel channel, long position, byte[] bytes, int count) throws IOException {
        ByteBuffer buffer = ByteBuffer.wrap(bytes, 0, count);
        while (buffer.hasRemaining()) {
            int read = channel.read(buffer, position + buffer.position());
            require(read > 0, "Truncated archive or read made no progress");
        }
    }

    private static int u16(ByteBuffer buffer, int offset) { return Short.toUnsignedInt(buffer.getShort(offset)); }
    private static long u32(ByteBuffer buffer, int offset) { return Integer.toUnsignedLong(buffer.getInt(offset)); }
    private static void validateHash(String hash) throws IOException { require(hash != null && hash.matches("[0-9a-f]{64}"), "Invalid SHA256"); }
    private static MessageDigest digest() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private static void require(boolean condition, String message) throws IOException {
        if (!condition) throw new IOException(message);
    }
}
