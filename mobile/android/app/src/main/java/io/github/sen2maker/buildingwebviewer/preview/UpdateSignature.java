package io.github.sen2maker.buildingwebviewer.preview;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.X509EncodedKeySpec;

/** Standard JCA ECDSA verification; no downloaded keys or selectable algorithms. */
final class UpdateSignature {
  static final String DOMAIN = "BuildingWebViewer update v1\n";
  static byte[] unhex(String value) {
    if (value == null || value.length() % 2 != 0 || !value.matches("[0-9a-f]+"))
      throw new IllegalArgumentException("Invalid hex");
    byte[] bytes = new byte[value.length() / 2];
    for (int i = 0; i < bytes.length; i++) bytes[i] = (byte)Integer.parseInt(value.substring(i*2,i*2+2),16);
    return bytes;
  }
  static String hex(byte[] bytes) {
    StringBuilder out = new StringBuilder();
    for (byte b : bytes) out.append(String.format(java.util.Locale.ROOT,"%02x",b & 255));
    return out.toString();
  }
  static String digest(byte[] bytes) throws GeneralSecurityException {
    return hex(MessageDigest.getInstance("SHA-256").digest(bytes));
  }
  static void verify(String key, String payload, String signature) throws GeneralSecurityException {
    if (payload.length() > 48000 || signature.length() > 160) throw new SignatureException("Oversized signature envelope");
    PublicKey publicKey = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(unhex(key)));
    Signature verifier = Signature.getInstance("SHA256withECDSA");
    verifier.initVerify(publicKey);
    verifier.update((DOMAIN+payload).getBytes(StandardCharsets.UTF_8));
    if (!verifier.verify(unhex(signature))) throw new SignatureException("Update signature rejected");
  }
}
