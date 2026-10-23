package bwv.update;

import java.io.IOException;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECFieldFp;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.time.Clock;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static bwv.update.StrictJson.exactKeys;
import static bwv.update.StrictJson.int32;
import static bwv.update.StrictJson.integer;
import static bwv.update.StrictJson.object;
import static bwv.update.StrictJson.string;

/**
 * Native-owned schema-2 authentication boundary, independent of Android APIs.
 * Uses JCA SHA256withECDSA over the fixed domain followed by exact payload bytes.
 * This host-JVM implementation is not evidence of Android provider validation.
 */
public final class SignedManifest {
    private SignedManifest() { }
    private static final byte[] DOMAIN = UpdateModel.SIGNATURE_DOMAIN.getBytes(StandardCharsets.UTF_8);
    private static final String RELEASE_ROOT = "https://github.com/Sen2Maker/BuildingWebViewer/releases/download/";
    private static final ECParameterSpec P256 = p256();
    public static final int HARD_MAX_ENVELOPE_BYTES = 1024 * 1024;
    public static final int HARD_MAX_PAYLOAD_BYTES = 512 * 1024;
    public static final long HARD_MAX_WEB_BYTES = 16L * 1024 * 1024 * 1024;
    public static final long HARD_MAX_APK_BYTES = 2L * 1024 * 1024 * 1024;
    public static final int HARD_MAX_INVENTORY_BYTES = 32 * 1024 * 1024;

    public enum Failure { FORMAT, LIMIT, TRUST, SIGNATURE, IDENTITY, TIME, ARTIFACT }
    public static final class VerificationException extends IOException {
        private static final long serialVersionUID = 1L;
        private final Failure failure;
        public VerificationException(Failure failure, String message) { super(message); this.failure = failure; }
        public Failure failure() { return failure; }
    }

    /** Bounds are global wire bounds, not the current installation's web-update budget. */
    public record Policy(UpdateModel.Identity identity, Map<String, PublicKey> trustedKeys,
                         Set<String> appSigningCerts, Clock clock, int maxEnvelopeBytes,
                         int maxPayloadBytes, int maxJsonDepth, long maxLifetimeSeconds,
                         long allowedClockSkewSeconds, long maxWebBytes, long maxApkBytes,
                         int maxInventoryBytes) {
        public Policy {
            Objects.requireNonNull(identity); Objects.requireNonNull(clock);
            trustedKeys = Map.copyOf(trustedKeys); appSigningCerts = Set.copyOf(appSigningCerts);
            if (trustedKeys.isEmpty() || trustedKeys.size() > 32 || appSigningCerts.isEmpty() || appSigningCerts.size() > 32
                    || maxEnvelopeBytes < 1 || maxEnvelopeBytes > HARD_MAX_ENVELOPE_BYTES
                    || maxPayloadBytes < 1 || maxPayloadBytes > HARD_MAX_PAYLOAD_BYTES
                    || maxJsonDepth < 2 || maxJsonDepth > 32 || maxLifetimeSeconds < 1 || maxLifetimeSeconds > 366L * 86_400
                    || allowedClockSkewSeconds < 0 || allowedClockSkewSeconds > 3_600
                    || maxWebBytes < 1 || maxWebBytes > HARD_MAX_WEB_BYTES
                    || maxApkBytes < 1 || maxApkBytes > HARD_MAX_APK_BYTES
                    || maxInventoryBytes < 1 || maxInventoryBytes > HARD_MAX_INVENTORY_BYTES)
                throw new IllegalArgumentException("Invalid manifest policy bounds");
            trustedKeys.forEach((id, key) -> { UpdateModel.key(id); requireP256(key); });
            appSigningCerts.forEach(UpdateModel::hash);
        }
        /** Caller must explicitly choose an operational lifetime; no implicit production expiry. */
        public static Policy standardBounds(UpdateModel.Identity identity, Map<String, PublicKey> trustedKeys,
                                      Set<String> appSigningCerts, Clock clock, long maxLifetimeSeconds) {
            return new Policy(identity, trustedKeys, appSigningCerts, clock, 128 * 1024, 64 * 1024,
                    8, maxLifetimeSeconds, 300, 2L * 1024 * 1024 * 1024, 1024L * 1024 * 1024, 2 * 1024 * 1024);
        }
    }
    public record WebArtifact(String url, long bytes, String sha256, String inventorySha256, int inventoryBytes) { }
    public record ApkArtifact(String url, long bytes, String sha256, long versionCode, String signingCertSha256) { }

    /** Only this verifier can mint this immutable capability; wire bytes never escape by reference. */
    public static final class VerifiedRelease {
        private final UpdateModel.AuthenticatedRelease release;
        private final WebArtifact web;
        private final ApkArtifact apk;
        private final byte[] envelopeBytes;
        private final byte[] payloadBytes;
        private VerifiedRelease(UpdateModel.AuthenticatedRelease release, WebArtifact web, ApkArtifact apk,
                                byte[] envelopeBytes, byte[] payloadBytes) {
            this.release = release; this.web = web; this.apk = apk;
            this.envelopeBytes = envelopeBytes.clone(); this.payloadBytes = payloadBytes.clone();
        }
        public UpdateModel.AuthenticatedRelease release() { return release; }
        public WebArtifact web() { return web; }
        public ApkArtifact apk() { return apk; }
        public byte[] envelopeBytes() { return envelopeBytes.clone(); }
        public byte[] payloadBytes() { return payloadBytes.clone(); }
    }

    /** The only entry point for a newly fetched network manifest. Expiry is strict; skew applies to issuance only. */
    public static VerifiedRelease verify(byte[] envelopeBytes, Policy policy) throws IOException {
        return authenticate(envelopeBytes, policy, true);
    }

    /**
     * Offline receipt validation only, never fresh update acceptance. Preserves every
     * signature/current-key/current-certificate/schema/identity/metadata check and
     * structural lifetime bound, skipping only comparisons with the current clock.
     * The coordinator's cached-bundle/high-water/data-reader checks still apply.
     */
    public static VerifiedRelease verifyCached(byte[] envelopeBytes, Policy policy) throws IOException {
        return authenticate(envelopeBytes, policy, false);
    }

    private static VerifiedRelease authenticate(byte[] envelopeBytes, Policy policy, boolean fresh) throws IOException {
        if (envelopeBytes == null || policy == null) throw bad(Failure.FORMAT, "Missing envelope/policy");
        if (envelopeBytes.length > policy.maxEnvelopeBytes()) throw bad(Failure.LIMIT, "Envelope exceeds byte bound");
        byte[] envelope = envelopeBytes.clone();
        try {
            Map<String, Object> outer = object(StrictJson.parse(envelope, policy.maxEnvelopeBytes(), policy.maxJsonDepth()));
            exactKeys(outer, "schema", "keyId", "payload", "signature");
            if (int32(outer, "schema") != UpdateModel.SCHEMA) throw bad(Failure.FORMAT, "Wrong envelope schema");
            String keyId = string(outer, "keyId");
            UpdateModel.key(keyId);
            PublicKey key = policy.trustedKeys().get(keyId);
            if (key == null) throw bad(Failure.TRUST, "Unknown or revoked signing key");
            byte[] payload = decodeCanonicalBase64(string(outer, "payload"), policy.maxPayloadBytes());
            byte[] signature = decodeCanonicalBase64(string(outer, "signature"), 72);
            requireDer(signature);
            Signature verifier = Signature.getInstance("SHA256withECDSA");
            verifier.initVerify(key); verifier.update(DOMAIN); verifier.update(payload);
            if (!verifier.verify(signature)) throw bad(Failure.SIGNATURE, "Manifest signature mismatch");
            // Do not parse or act on authoritative payload fields until authentication succeeds.
            Map<String, Object> body = object(StrictJson.parse(payload, policy.maxPayloadBytes(), policy.maxJsonDepth()));
            exactKeys(body, "schema", "product", "packageId", "generation", "channel", "version", "tag", "sequence",
                    "keyId", "build", "nativeApi", "minNativeVersionCode", "issuedAt", "expiresAt", "web", "apk");
            if (int32(body, "schema") != UpdateModel.SCHEMA || !string(body, "product").equals("BuildingWebViewer"))
                throw bad(Failure.IDENTITY, "Wrong product/schema");
            UpdateModel.Identity identity = new UpdateModel.Identity(string(body, "packageId"), string(body, "generation"), string(body, "channel"));
            if (!identity.equals(policy.identity()) || !string(body, "keyId").equals(keyId))
                throw bad(Failure.IDENTITY, "Manifest identity/key binding mismatch");
            UpdateModel.Version version = UpdateModel.Version.parse(string(body, "version"));
            String tag = string(body, "tag");
            if (!tag.equals("stable-v" + version)) throw bad(Failure.IDENTITY, "Noncanonical release tag");
            long sequence = positive(integer(body, "sequence"), Long.MAX_VALUE, "sequence");
            int nativeApi = int32(body, "nativeApi");
            if (nativeApi <= 0) throw bad(Failure.FORMAT, "nativeApi must be positive");
            long minNativeVersionCode = positive(integer(body, "minNativeVersionCode"), Long.MAX_VALUE, "minimum native version");
            long issuedAt = integer(body, "issuedAt");
            long expiresAt = integer(body, "expiresAt");
            if (issuedAt < 0 || expiresAt <= issuedAt || expiresAt - issuedAt > policy.maxLifetimeSeconds())
                throw bad(Failure.TIME, "Invalid manifest lifetime");
            if (fresh) {
                long now = policy.clock().instant().getEpochSecond();
                if (now < 0 || issuedAt > Math.addExact(now, policy.allowedClockSkewSeconds()) || expiresAt <= now)
                    throw bad(Failure.TIME, "Manifest is expired or issued in the future");
            }
            Map<String, Object> w = object(body.get("web"));
            exactKeys(w, "url", "bytes", "sha256", "inventorySha256", "inventoryBytes");
            String webUrl = string(w, "url");
            String expectedRoot = RELEASE_ROOT + tag + "/buildingwebviewer-" + version;
            if (!webUrl.equals(expectedRoot + "-web.zip")) throw bad(Failure.ARTIFACT, "Web URL not bound to exact release");
            long webBytes = positive(integer(w, "bytes"), policy.maxWebBytes(), "web artifact bytes");
            String webHash = hash(string(w, "sha256"));
            String inventoryHash = hash(string(w, "inventorySha256"));
            int inventoryBytes = int32(w, "inventoryBytes");
            positive(inventoryBytes, policy.maxInventoryBytes(), "inventory bytes");
            WebArtifact web = new WebArtifact(webUrl, webBytes, webHash, inventoryHash, inventoryBytes);
            Map<String, Object> a = object(body.get("apk"));
            exactKeys(a, "url", "bytes", "sha256", "versionCode", "signingCertSha256");
            String apkUrl = string(a, "url");
            if (!apkUrl.equals(expectedRoot + ".apk")) throw bad(Failure.ARTIFACT, "APK URL not bound to exact release");
            long apkBytes = positive(integer(a, "bytes"), policy.maxApkBytes(), "APK bytes");
            String apkHash = hash(string(a, "sha256"));
            long versionCode = positive(integer(a, "versionCode"), Long.MAX_VALUE, "APK versionCode");
            if (versionCode < minNativeVersionCode) throw bad(Failure.ARTIFACT, "APK versionCode below native minimum");
            String certificate = hash(string(a, "signingCertSha256"));
            if (!policy.appSigningCerts().contains(certificate)) throw bad(Failure.TRUST, "Unpinned APK signing certificate");
            ApkArtifact apk = new ApkArtifact(apkUrl, apkBytes, apkHash, versionCode, certificate);
            String metadataDigest = PortableHex.format(MessageDigest.getInstance("SHA-256").digest(payload));
            UpdateModel.AuthenticatedRelease release = new UpdateModel.AuthenticatedRelease(UpdateModel.SCHEMA,
                    identity, version, tag, sequence, metadataDigest, keyId, inventoryHash, string(body, "build"),
                    nativeApi, minNativeVersionCode, webBytes);
            return new VerifiedRelease(release, web, apk, envelope, payload);
        } catch (StrictJson.ParseException invalid) {
            throw bad(Failure.FORMAT, invalid.getMessage());
        } catch (GeneralSecurityException invalid) {
            throw bad(Failure.SIGNATURE, "Cryptographic verification failed");
        } catch (IllegalArgumentException | ArithmeticException invalid) {
            throw bad(Failure.FORMAT, "Invalid manifest field");
        }
    }

    private static byte[] decodeCanonicalBase64(String value, int maxBytes) throws VerificationException {
        if (value.isEmpty() || value.length() > ((long) maxBytes + 2) / 3 * 4)
            throw bad(Failure.LIMIT, "Base64 value exceeds byte bound");
        byte[] decoded;
        try { decoded = Base64.getDecoder().decode(value); }
        catch (IllegalArgumentException invalid) { throw bad(Failure.FORMAT, "Invalid base64"); }
        if (decoded.length > maxBytes) throw bad(Failure.LIMIT, "Decoded base64 exceeds byte bound");
        if (!Base64.getEncoder().encodeToString(decoded).equals(value)) throw bad(Failure.FORMAT, "Noncanonical base64");
        return decoded;
    }
    private static long positive(long value, long maximum, String field) throws VerificationException {
        if (value <= 0 || value > maximum) throw bad(Failure.LIMIT, "Invalid " + field);
        return value;
    }
    private static String hash(String value) { UpdateModel.hash(value); return value; }
    private static VerificationException bad(Failure failure, String message) { return new VerificationException(failure, message); }

    /** Require short-form canonical DER and nonzero P-256 scalars, independent of provider tolerance. */
    private static void requireDer(byte[] bytes) throws VerificationException {
        if (bytes.length < 8 || bytes.length > 72 || bytes[0] != 0x30 || (bytes[1] & 255) != bytes.length - 2)
            throw bad(Failure.SIGNATURE, "Noncanonical ECDSA DER sequence");
        int next = derInteger(bytes, 2);
        next = derInteger(bytes, next);
        if (next != bytes.length) throw bad(Failure.SIGNATURE, "Trailing ECDSA DER content");
    }
    private static int derInteger(byte[] bytes, int offset) throws VerificationException {
        if (offset + 2 > bytes.length || bytes[offset] != 0x02) throw bad(Failure.SIGNATURE, "Missing ECDSA scalar");
        int size = bytes[offset + 1] & 255;
        int start = offset + 2;
        if (size < 1 || size > 33 || size > bytes.length - start || (bytes[start] & 0x80) != 0
                || (size > 1 && bytes[start] == 0 && (bytes[start + 1] & 0x80) == 0))
            throw bad(Failure.SIGNATURE, "Noncanonical ECDSA scalar");
        BigInteger scalar = new BigInteger(1, Arrays.copyOfRange(bytes, start, start + size));
        if (scalar.signum() == 0 || scalar.compareTo(P256.getOrder()) >= 0) throw bad(Failure.SIGNATURE, "ECDSA scalar out of range");
        return start + size;
    }
    private static ECParameterSpec p256() {
        try {
            AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
            parameters.init(new ECGenParameterSpec("secp256r1"));
            return parameters.getParameterSpec(ECParameterSpec.class);
        } catch (GeneralSecurityException absent) { throw new ExceptionInInitializerError(absent); }
    }
    private static void requireP256(PublicKey key) {
        if (!(key instanceof ECPublicKey ec)) throw new IllegalArgumentException("Pinned key must be an EC P-256 key");
        ECParameterSpec p = ec.getParams();
        if (p == null || !P256.getCurve().equals(p.getCurve()) || !P256.getGenerator().equals(p.getGenerator())
                || !P256.getOrder().equals(p.getOrder()) || P256.getCofactor() != p.getCofactor())
            throw new IllegalArgumentException("Pinned key must use exactly secp256r1");
        ECPoint point = ec.getW();
        if (point == null || point.equals(ECPoint.POINT_INFINITY)) throw new IllegalArgumentException("Invalid P-256 public point");
        BigInteger x = point.getAffineX(), y = point.getAffineY();
        BigInteger prime = ((ECFieldFp) P256.getCurve().getField()).getP();
        if (x == null || y == null || x.signum() < 0 || y.signum() < 0 || x.compareTo(prime) >= 0 || y.compareTo(prime) >= 0
                || !y.multiply(y).mod(prime).equals(x.multiply(x).multiply(x).add(P256.getCurve().getA().multiply(x))
                .add(P256.getCurve().getB()).mod(prime))) throw new IllegalArgumentException("Invalid P-256 public point");
    }
}
