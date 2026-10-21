package bwv.update;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Verifies the APK's public/ resources without pretending AssetManager is a filesystem.
 * The inventory digest, exact length and native-web identity must be independent,
 * build-generated native pins. This is content validation, not release authentication,
 * extraction, publication, a runtime-root selector, or a data-schema migration.
 *
 * <p>The Source is a trusted adapter: it must enumerate its complete file namespace,
 * enforce the supplied enumeration budgets while traversing, and open only relative
 * resources in one captured source. For AssetManager this means one captured manager
 * and the fixed public/ prefix, never a mutable external-root selector. No adapter can
 * be protected from lying about omitted files by this interface. A list is checked
 * before and after verification, but arbitrary mutable Sources are not atomic snapshots.
 * Each subsequent read independently verifies exact length and digest before returning
 * bytes; a mutable source cannot cause unpinned data or a mixed-release shader pair to
 * be returned. APK resources themselves are immutable for a running process.
 */
public final class BundledAssetVerifier {
    public static final String NATIVE_WEB = "native-web.json";
    public static final String VERTEX_SHADER = "assets/native/gaussian-vertex.glsl";
    public static final String FRAGMENT_SHADER = "assets/native/gaussian-fragment.glsl";
    private static final int MAX_ARRAY_BYTES = Integer.MAX_VALUE - 8;

    private BundledAssetVerifier() { }

    public interface Source {
        /**
         * Complete flat relative file paths, excluding directory entries. Fail instead
         * of truncating. Enforce budgets during traversal, before accumulating children.
         * Reject ambiguous/non-file entries rather than silently skipping them. Empty
         * directories are not representable and must be rejected by adapters when visible.
         * maxDepth counts path components, and maxPathBytes is an ASCII byte budget.
         */
        List<String> listFiles(int maxFiles, int maxDepth, int maxPathBytes) throws IOException;
        /** Returns a new stream for exactly this relative path in the captured source. */
        InputStream open(String relative) throws IOException;
    }

    public record Identity(String product, String packageId, String generation, String channel,
                           String version, String build, int nativeApi, long minNativeVersionCode) {
        public Identity {
            if (!matches(product, "[A-Za-z][A-Za-z0-9._-]{0,79}")
                    || !matches(packageId, "[A-Za-z][A-Za-z0-9_.]{1,179}")
                    || !matches(generation, "[a-z0-9-]{1,40}")
                    || !matches(channel, "[a-z0-9-]{1,20}")
                    || !matches(build, "[A-Za-z0-9._-]{1,80}")
                    || nativeApi < 1 || minNativeVersionCode < 1) {
                throw new IllegalArgumentException("Invalid bundled identity");
            }
            UpdateModel.Version.parse(version);
        }
    }

    public record Pins(Identity identity, String inventorySha256, long inventoryBytes) {
        public Pins {
            Objects.requireNonNull(identity, "identity");
            if (!matches(inventorySha256, "[0-9a-f]{64}") || inventoryBytes < 1
                    || inventoryBytes > MAX_ARRAY_BYTES) {
                throw new IllegalArgumentException("Invalid bundled inventory pin");
            }
        }
    }

    public record Limits(InventoryVerifier.Limits inventory, int maxNativeWebBytes, int maxShaderBytes) {
        public Limits {
            Objects.requireNonNull(inventory, "inventory");
            if (inventory.maxInventoryBytes() > StrictJson.HARD_MAX_BYTES
                    || inventory.maxEntries() == Integer.MAX_VALUE
                    || inventory.maxFileBytes() > MAX_ARRAY_BYTES
                    || maxNativeWebBytes < 1 || maxNativeWebBytes > StrictJson.HARD_MAX_BYTES
                    || maxShaderBytes < 1 || maxShaderBytes > MAX_ARRAY_BYTES) {
                throw new IllegalArgumentException("Invalid bundled verification limits");
            }
        }
        public static Limits defaults() {
            return new Limits(InventoryVerifier.Limits.defaults(), 65_536, 65_536);
        }
    }

    /** Both immutable strings belong to the same captured/pinned inventory. */
    public record ShaderPair(String vertex, String fragment) {
        public ShaderPair {
            Objects.requireNonNull(vertex, "vertex");
            Objects.requireNonNull(fragment, "fragment");
        }
    }

    /** Immutable verification capability. The Source is never exposed or replaceable. */
    public static final class VerifiedAssets {
        private final Source source;
        private final Pins pins;
        private final Limits limits;
        private final Map<String, InventoryVerifier.Entry> files;
        private final int fileCount;
        private final long totalBytes;

        private VerifiedAssets(Source source, Pins pins, Limits limits,
                               Map<String, InventoryVerifier.Entry> files, int fileCount, long totalBytes) {
            this.source = source;
            this.pins = pins;
            this.limits = limits;
            this.files = Map.copyOf(files);
            this.fileCount = fileCount;
            this.totalBytes = totalBytes;
        }
        public Identity identity() { return pins.identity(); }
        public String inventorySha256() { return pins.inventorySha256(); }
        /** Resource count excludes the inventory itself. */
        public int fileCount() { return fileCount; }
        /** Payload length excludes the inventory itself. */
        public long totalBytes() { return totalBytes; }
        /**
         * Only exact canonical inventory paths (or asset-inventory.json) are accepted.
         * No URL decoding, normalization, fallback, or raw source stream is exposed.
         * All bytes are checked before returning a fresh caller-owned array.
         */
        public byte[] read(String relative, int maxBytes) throws IOException {
            require(relative != null, "Missing resource path");
            InventoryVerifier.Entry entry = files.get(relative);
            require(entry != null, "Resource is not in the verified inventory: " + relative);
            return readChecked(source, entry, maxBytes, true);
        }
        public ShaderPair shaderPair() throws IOException {
            String vertex = utf8(read(VERTEX_SHADER, limits.maxShaderBytes()));
            String fragment = utf8(read(FRAGMENT_SHADER, limits.maxShaderBytes()));
            return new ShaderPair(vertex, fragment);
        }
    }

    public static VerifiedAssets verify(Source source, Pins pins, Limits limits) throws IOException {
        require(source != null && pins != null && limits != null, "Missing bundled verification input");
        InventoryVerifier.Limits bounds = limits.inventory();
        require(pins.inventoryBytes() <= bounds.maxInventoryBytes(), "Pinned inventory exceeds byte limit");
        Set<String> before = listChecked(source, bounds);
        InventoryVerifier.Entry inventory = new InventoryVerifier.Entry(InventoryVerifier.INVENTORY_NAME,
                pins.inventoryBytes(), pins.inventorySha256());
        byte[] exact = readChecked(source, inventory, bounds.maxInventoryBytes(), true);
        // Reuse the frozen B parser and foundation canonical validation; do not invent
        // a permissive second inventory schema or duplicate its path/collision rules.
        VerifiedZipExtractor.Limits parseLimits = new VerifiedZipExtractor.Limits(22, 1, 46, bounds);
        List<InventoryVerifier.Entry> entries = VerifiedZipExtractor.parseInventory(exact, parseLimits);
        Map<String, InventoryVerifier.Entry> files = new LinkedHashMap<>();
        long total = 0;
        for (InventoryVerifier.Entry entry : entries) {
            files.put(entry.path(), entry);
            total += entry.size(); // Canonical parsing has already checked maxTotalBytes without overflow.
        }
        files.put(InventoryVerifier.INVENTORY_NAME, inventory);
        require(before.equals(files.keySet()), "Bundled files differ from the exact inventory");
        require(files.containsKey(NATIVE_WEB), "Missing native-web metadata");
        require(files.containsKey(VERTEX_SHADER) && files.containsKey(FRAGMENT_SHADER), "Missing shader pair");
        require(files.get(VERTEX_SHADER).size() <= limits.maxShaderBytes()
                && files.get(FRAGMENT_SHADER).size() <= limits.maxShaderBytes(), "Shader exceeds byte limit");
        Identity actual = null;
        for (InventoryVerifier.Entry entry : entries) {
            boolean metadata = entry.path().equals(NATIVE_WEB);
            byte[] bytes = readChecked(source, entry,
                    metadata ? limits.maxNativeWebBytes() : MAX_ARRAY_BYTES, metadata);
            if (metadata) actual = parseIdentity(bytes, limits.maxNativeWebBytes());
        }
        require(pins.identity().equals(actual), "native-web identity does not agree with native pins");
        require(listChecked(source, bounds).equals(before), "Bundled file list changed during verification");
        // Recheck the pinned inventory after the pass, too; no mutable bytes survive.
        readChecked(source, inventory, bounds.maxInventoryBytes(), false);
        return new VerifiedAssets(source, pins, limits, files, entries.size(), total);
    }

    private static Set<String> listChecked(Source source, InventoryVerifier.Limits bounds) throws IOException {
        int maxFiles = bounds.maxEntries() + 1;
        int maxPathBytes = Math.max(bounds.maxPathBytes(), InventoryVerifier.INVENTORY_NAME.length());
        List<String> listed = source.listFiles(maxFiles, bounds.maxDepth(), maxPathBytes);
        require(listed != null && listed.size() <= maxFiles, "Source enumeration missing or over budget");
        Set<String> result = new HashSet<>();
        int count = 0;
        for (String path : listed) {
            require(++count <= maxFiles, "Source enumeration exceeded file limit");
            require(path != null && !path.isEmpty() && path.length() <= maxPathBytes,
                    "Source enumeration contains an invalid path");
            require(result.add(path), "Source enumeration contains duplicate paths");
        }
        require(count == listed.size(), "Source enumeration changed during traversal");
        return result;
    }

    private static Identity parseIdentity(byte[] bytes, int maxBytes) throws IOException {
        Map<String, Object> object = StrictJson.object(StrictJson.parse(bytes, maxBytes, 2));
        StrictJson.exactKeys(object, "schema", "product", "packageId", "generation", "channel", "version",
                "build", "nativeApi", "minNativeVersionCode");
        require(StrictJson.integer(object, "schema") == 1, "Unsupported native-web schema");
        try {
            return new Identity(StrictJson.string(object, "product"), StrictJson.string(object, "packageId"),
                    StrictJson.string(object, "generation"), StrictJson.string(object, "channel"),
                    StrictJson.string(object, "version"), StrictJson.string(object, "build"),
                    StrictJson.int32(object, "nativeApi"), StrictJson.integer(object, "minNativeVersionCode"));
        } catch (IllegalArgumentException malformed) {
            throw new IOException("Invalid native-web identity", malformed);
        }
    }

    private static byte[] readChecked(Source source, InventoryVerifier.Entry entry, int maxBytes,
                                      boolean capture) throws IOException {
        require(maxBytes >= 0 && entry.size() <= maxBytes, "Resource exceeds caller byte limit: " + entry.path());
        MessageDigest digest = sha256();
        ByteArrayOutputStream output = capture ? new ByteArrayOutputStream((int) Math.min(entry.size(), 8192)) : null;
        long count = 0;
        byte[] buffer = new byte[8192];
        try (InputStream input = source.open(entry.path())) {
            require(input != null, "Source returned no stream: " + entry.path());
            while (true) {
                // At most one byte beyond the exact expected length, even for infinite streams.
                int requested = (int) Math.min(buffer.length, entry.size() - count + 1);
                int read = input.read(buffer, 0, requested);
                if (read == -1) break;
                require(read > 0 && read <= requested, "Source read made no valid progress: " + entry.path());
                require(read <= entry.size() - count, "Resource exceeds pinned size: " + entry.path());
                count += read;
                digest.update(buffer, 0, read);
                if (output != null) output.write(buffer, 0, read);
            }
        }
        require(count == entry.size(), "Resource is shorter than pinned size: " + entry.path());
        require(MessageDigest.isEqual(digest.digest(), PortableHex.parse(entry.sha256())),
                "Resource SHA256 differs from pin: " + entry.path());
        return output == null ? null : output.toByteArray();
    }

    private static String utf8(byte[] value) throws IOException {
        try {
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(value)).toString();
        } catch (CharacterCodingException malformed) {
            throw new IOException("Shader contains malformed UTF-8", malformed);
        }
    }
    private static boolean matches(String value, String expression) {
        return value != null && value.matches(expression);
    }
    private static MessageDigest sha256() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException("SHA-256 unavailable", impossible); }
    }
    private static void require(boolean condition, String message) throws IOException {
        if (!condition) throw new IOException(message);
    }
}
