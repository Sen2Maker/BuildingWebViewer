package io.github.sen2maker.buildingwebviewer.preview;

import org.json.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Parses metadata only after authenticating the exact signed bytes. */
final class SignedUpdate {
  static final String REPO = "https://github.com/Sen2Maker/BuildingWebViewer";
  static final String PACKAGE = "io.github.sen2maker.buildingwebviewer.preview";
  static final long MAX_WEB = 32L*1024*1024, MAX_APK = 128L*1024*1024;
  static JSONObject verify(JSONObject envelope, JSONObject trust, long now, boolean fresh) throws Exception {
    String keyId=envelope.getString("keyId"), payload=envelope.getString("payload");
    UpdateSignature.verify(trust.getJSONObject("keys").getString(keyId),payload,envelope.getString("signature"));
    JSONObject signed = new JSONObject(payload);
    if (signed.getInt("schema")!=1 || !signed.getString("channel").equals("preview") || !signed.getString("packageName").equals(PACKAGE)) fail("Wrong update channel");
    String version=signed.getString("version"); VersionPolicy.parse(version);
    if(signed.getLong("sequence")<trust.getLong("minimumSequence") || signed.getInt("nativeApi")<1) fail("Old update metadata");
    long issued=signed.getLong("issuedAt"), expires=signed.getLong("expiresAt");
    if(issued<0 || expires<=issued || expires-issued>366L*86400) fail("Invalid validity period");
    if(fresh && (now<issued-86400 || now>=expires)) fail("Expired update or incorrect device clock");
    artifact(signed.getJSONObject("web"),version,"BuildingWebViewer-Update-v"+version+".bwvupdate",MAX_WEB);
    JSONObject apk=signed.getJSONObject("apk");
    String apkVersion=apk.getString("version"); VersionPolicy.parse(apkVersion);
    if(apk.getInt("nativeApi")!=signed.getInt("nativeApi") || VersionPolicy.compare(apkVersion,version)>0) fail("APK compatibility mismatch");
    artifact(apk,apkVersion,"BuildingWebViewer-Android-v"+apkVersion+"-preview.1.apk",MAX_APK);
    if(apk.getLong("versionCode")<1 || !apk.getString("certificateSha256").matches("[0-9a-f]{64}")) fail("Invalid APK identity");
    JSONObject notes=signed.getJSONObject("notes");
    for(String locale:new String[]{"zh","en"}) if(notes.getString(locale).length()>6000) fail("Oversized release notes");
    return signed;
  }
  static void artifact(JSONObject file,String version,String name,long maximum)throws Exception {
    if(!file.getString("url").equals(REPO+"/releases/download/v"+version+"/"+name) || !file.getString("sha256").matches("[0-9a-f]{64}") || file.getLong("size")<=0 || file.getLong("size")>maximum) fail("Invalid update artifact");
  }
  static void monotonic(JSONObject update,long sequence,String digest,String version,String currentDigest)throws Exception {
    long next=update.getLong("sequence");
    if(next<sequence || (next==sequence && !digest.isEmpty() && !digest.equals(currentDigest)) || (!version.isEmpty() && VersionPolicy.compare(update.getString("version"),version)<0)) fail("Replayed or conflicting update metadata");
  }
  static String identity(JSONObject envelope)throws Exception {
    return UpdateSignature.digest(envelope.getString("payload").getBytes(StandardCharsets.UTF_8));
  }
  static void fail(String message)throws IOException {throw new IOException(message);}
}
