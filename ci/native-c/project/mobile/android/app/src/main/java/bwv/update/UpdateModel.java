package bwv.update;

import java.nio.file.Path;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/** Android-independent model. No record in this file performs signature verification. */
public final class UpdateModel {
    private UpdateModel() {}
    public static final String PACKAGE = "io.github.sen2maker.buildingwebviewer";
    public static final String GENERATION = "stable-v1";
    public static final String CHANNEL = "stable";
    public static final int SCHEMA = 2;
    public static final String SIGNATURE_DOMAIN = "BuildingWebViewer stable update schema 2\n";
    private static final Pattern HASH = Pattern.compile("[0-9a-f]{64}");

    public record Identity(String packageName, String generation, String channel) {
        public Identity {
            Objects.requireNonNull(packageName); Objects.requireNonNull(generation); Objects.requireNonNull(channel);
            if (!packageName.matches("[a-zA-Z][a-zA-Z0-9_.]{1,179}") || !generation.matches("[a-z0-9-]{1,40}")
                    || !channel.matches("[a-z0-9-]{1,20}")) throw new IllegalArgumentException("Invalid identity");
        }
        public static Identity stable() { return new Identity(PACKAGE, GENERATION, CHANNEL); }
    }

    public record Version(int major, int minor, int patch) implements Comparable<Version> {
        public Version { if (major < 0 || minor < 0 || patch < 0) throw new IllegalArgumentException("Negative version"); }
        public static Version parse(String value) {
            if (value == null || !value.matches("(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)") || value.length() > 32)
                throw new IllegalArgumentException("Invalid version");
            String[] parts = value.split("\\.");
            return new Version(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]), Integer.parseInt(parts[2]));
        }
        @Override public int compareTo(Version other) {
            int result = Integer.compare(major, other.major);
            if (result == 0) result = Integer.compare(minor, other.minor);
            return result == 0 ? Integer.compare(patch, other.patch) : result;
        }
        @Override public String toString() { return major + "." + minor + "." + patch; }
    }

    /** Must be constructed by a future bounded parser AFTER native signature/expiry verification. */
    public record AuthenticatedRelease(int schema, Identity identity, Version version, String tag, long sequence,
            String metadataDigest, String keyId, String inventoryDigest, String buildId, int nativeApi, long minNativeVersionCode, long webBytes) {
        public AuthenticatedRelease {
            Objects.requireNonNull(identity); Objects.requireNonNull(version); Objects.requireNonNull(tag);
            hash(metadataDigest); key(keyId); hash(inventoryDigest);
            if (buildId == null || !buildId.matches("[a-zA-Z0-9._-]{1,80}")) throw new IllegalArgumentException("Invalid build ID");
            if (schema != SCHEMA || !tag.equals("stable-v" + version) || sequence <= 0 || nativeApi <= 0
                    || minNativeVersionCode <= 0 || webBytes <= 0) throw new IllegalArgumentException("Invalid authenticated release");
        }
    }

    /** contentId is the hash of the exact signed-bound inventory; root is an immutable private directory. */
    public record Bundle(Identity identity, String contentId, String root, Version version, String buildId,
            int nativeApi, long minNativeVersionCode, long sequence, String metadataDigest, String keyId) {
        public Bundle {
            Objects.requireNonNull(identity); Objects.requireNonNull(version); hash(contentId); hash(metadataDigest); key(keyId);
            if (buildId == null || !buildId.matches("[a-zA-Z0-9._-]{1,80}") || nativeApi <= 0
                    || minNativeVersionCode <= 0 || sequence < 0) throw new IllegalArgumentException("Invalid bundle");
            Path p = java.nio.file.Paths.get(Objects.requireNonNull(root));
            if (!p.isAbsolute() || !p.normalize().toString().equals(root)) throw new IllegalArgumentException("Noncanonical bundle root");
        }
    }

    public record NativeConfig(Identity identity, int nativeApi, long versionCode, Bundle bundled,
            long minimumSequence, Set<String> trustedKeys, long maximumWebBytes) {
        public NativeConfig {
            Objects.requireNonNull(identity); Objects.requireNonNull(bundled); trustedKeys = Set.copyOf(trustedKeys);
            if (nativeApi <= 0 || versionCode <= 0 || minimumSequence < 0 || maximumWebBytes <= 0
                    || !identity.equals(bundled.identity) || nativeApi != bundled.nativeApi
                    || bundled.minNativeVersionCode > versionCode) throw new IllegalArgumentException("Invalid native configuration");
            trustedKeys.forEach(UpdateModel::key);
        }
    }

    public record Trust(long sequence, String digest, Version highestVersion) {
        public Trust {
            Objects.requireNonNull(digest); Objects.requireNonNull(highestVersion);
            if (sequence < 0) throw new IllegalArgumentException("Invalid trust sequence");
            if (!digest.isEmpty()) hash(digest);
        }
    }
    public record Trial(Bundle bundle, int attempts, String attemptToken) {
        public Trial {
            Objects.requireNonNull(bundle); token(attemptToken);
            if (attempts < 1 || attempts > 2) throw new IllegalArgumentException("Invalid trial attempt count");
        }
    }
    public record State(Identity identity, Trust trust, Bundle lastKnownGood, Bundle pending, Trial trial,
            Set<String> failedContentIds) {
        public State {
            Objects.requireNonNull(identity); Objects.requireNonNull(trust); failedContentIds = Set.copyOf(failedContentIds);
            if (failedContentIds.size() > 1024) throw new IllegalArgumentException("Too many failed content IDs");
            failedContentIds.forEach(UpdateModel::hash);
            for (Bundle b : new Bundle[]{lastKnownGood, pending, trial == null ? null : trial.bundle})
                if (b != null && !identity.equals(b.identity)) throw new IllegalArgumentException("Cross-identity journal bundle");
        }
        public State withTrust(Trust next) { return new State(identity, next, lastKnownGood, pending, trial, failedContentIds); }
    }
    public static void hash(String value) {
        if (value == null || !HASH.matcher(value).matches()) throw new IllegalArgumentException("Invalid hash");
    }
    public static void key(String value) {
        if (value == null || !value.matches("[a-zA-Z0-9._-]{1,80}")) throw new IllegalArgumentException("Invalid key ID");
    }
    public static void token(String value) {
        if (value == null || !value.matches("[a-zA-Z0-9_-]{1,100}")) throw new IllegalArgumentException("Invalid operation token");
    }
}
