package io.github.sen2maker.buildingwebviewer.preview;
import android.content.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;import org.junit.runner.RunWith;import org.json.*;
import java.io.*;import java.net.*;import java.security.*;import java.security.spec.ECGenParameterSpec;import java.nio.charset.StandardCharsets;import java.util.*;import java.util.zip.*;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class SignedUpdateTest {
 KeyPair pair;JSONObject trust;long now;File work;Context context;byte[] archive;JSONObject data,envelope;
 @Before public void setup()throws Exception{
  KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));pair=generator.generateKeyPair();now=System.currentTimeMillis()/1000;
  trust=new JSONObject().put("minimumSequence",1).put("keys",new JSONObject().put("test",UpdateSignature.hex(pair.getPublic().getEncoded())));
  Context base=InstrumentationRegistry.getInstrumentation().getTargetContext();work=new File(base.getCacheDir(),"signed-test-"+UUID.randomUUID());String key=work.getName();
  context=new ContextWrapper(base){@Override public File getFilesDir(){return work;}@Override public SharedPreferences getSharedPreferences(String name,int mode){return super.getSharedPreferences(key,mode);}};
  JSONObject notes=new JSONObject().put("zh","测试更新").put("en","Test update");
  ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(ZipOutputStream zip=new ZipOutputStream(bytes)){
   for(String[] item:new String[][]{{"native-web.json",new JSONObject().put("nativeApi",WebUpdater.NATIVE_API).put("version","9.0.1").toString()},{"assets/mobile/index.html","<html>test</html>"},{"assets/js/capacitor.js","// test"},{"release-notes.json",new JSONObject().put("version","9.0.1").put("notes",notes).toString()}}){zip.putNextEntry(new ZipEntry(item[0]));zip.write(item[1].getBytes(StandardCharsets.UTF_8));zip.closeEntry();}
  }archive=bytes.toByteArray();
  String baseUrl=SignedUpdate.REPO+"/releases/download/v9.0.1/";
  data=new JSONObject().put("schema",1).put("channel","preview").put("packageName",SignedUpdate.PACKAGE).put("version","9.0.1").put("nativeApi",WebUpdater.NATIVE_API).put("sequence",10).put("issuedAt",now-100).put("expiresAt",now+3600).put("notes",notes)
    .put("web",new JSONObject().put("url",baseUrl+"BuildingWebViewer-Update-v9.0.1.bwvupdate").put("sha256",UpdateSignature.digest(archive)).put("size",archive.length))
    .put("apk",new JSONObject().put("url",baseUrl+"BuildingWebViewer-Android-v9.0.1-preview.1.apk").put("sha256",UpdateSignature.digest(new byte[]{1})).put("size",1).put("version","9.0.1").put("nativeApi",WebUpdater.NATIVE_API).put("versionCode",9000101).put("certificateSha256",UpdateSignature.digest(new byte[]{2})));
  envelope=sign(data);
 }
 JSONObject sign(JSONObject data)throws Exception{String payload=data.toString();Signature s=Signature.getInstance("SHA256withECDSA");s.initSign(pair.getPrivate());s.update((UpdateSignature.DOMAIN+payload).getBytes(StandardCharsets.UTF_8));return new JSONObject().put("keyId","test").put("payload",payload).put("signature",UpdateSignature.hex(s.sign()));}
 WebUpdater updater(byte[] response){return new WebUpdater(context){@Override JSONObject trust(){return trust;}@Override HttpURLConnection connect(String address)throws Exception{return new HttpURLConnection(new URL(address)){public void connect(){} public void disconnect(){} public boolean usingProxy(){return false;}public InputStream getInputStream(){return new ByteArrayInputStream(response);}};}};}
 interface Action{void run()throws Exception;}
 void rejected(Action action)throws Exception{try{action.run();fail("Must reject");}catch(AssertionError error){throw error;}catch(Exception expected){}}
 @After public void cleanup(){context.getSharedPreferences("bwv-updates",0).edit().clear().commit();ProjectStore.deleteTree(work);}
 @Test public void metadataRejectsTamperingUnknownKeyExpiryAndRollback()throws Exception{
  assertEquals("9.0.1",SignedUpdate.verify(envelope,trust,now,true).getString("version"));
  JSONObject bad=new JSONObject(envelope.toString()).put("payload",envelope.getString("payload")+" ");rejected(()->SignedUpdate.verify(bad,trust,now,true));
  JSONObject unknown=new JSONObject(envelope.toString()).put("keyId","attacker");rejected(()->SignedUpdate.verify(unknown,trust,now,true));
  rejected(()->SignedUpdate.verify(envelope,trust,now+7200,true));
  rejected(()->SignedUpdate.monotonic(data,11,"","",SignedUpdate.identity(envelope)));
  rejected(()->SignedUpdate.monotonic(data,10,"wrong","",SignedUpdate.identity(envelope)));
  rejected(()->SignedUpdate.monotonic(data,9,"","9.1.0",SignedUpdate.identity(envelope)));
  SignedUpdate.monotonic(data,10,SignedUpdate.identity(envelope),"9.0.1",SignedUpdate.identity(envelope));
  JSONObject wrong=new JSONObject(data.toString());wrong.getJSONObject("web").put("url","https://evil.example/update");JSONObject signedWrong=sign(wrong);rejected(()->SignedUpdate.verify(signedWrong,trust,now,true));
 }
 @Test public void verifiedWebInstallPersistsNotesAndRollsBackOnFailedBoot()throws Exception{
  WebUpdater updater=updater(archive);updater.candidate=envelope;String path=updater.install();
  assertEquals(path,updater.startupPath());updater.healthy();assertEquals(path,updater.startupPath());updater.healthy();
  assertTrue(updater.announcement(path).getBoolean("unread"));updater.prefs.edit().putBoolean("announcement.9.0.1",true).commit();assertFalse(updater.announcement(path).getBoolean("unread"));
  updater.startupPath();assertNull(updater.startupPath());
 }
 @Test public void corruptedPackageNeverActivates()throws Exception{
  byte[] bad=archive.clone();bad[bad.length-1]^=1;WebUpdater updater=updater(bad);updater.candidate=envelope;rejected(()->updater.install());assertNull(updater.prefs.getString("active",null));
 }
 @Test public void unsignedPreviousCacheAndApkTamperingAreRejected()throws Exception{
  WebUpdater updater=updater(archive);File folder=new File(updater.root,"old");new File(folder,"assets/mobile").mkdirs();new File(folder,"assets/mobile/index.html").createNewFile();try(FileOutputStream out=new FileOutputStream(new File(folder,"native-web.json"))){out.write("{\"version\":\"9.0.1\",\"nativeApi\":5}".getBytes(StandardCharsets.UTF_8));}
  updater.prefs.edit().putString("active","old").commit();assertNull(updater.startupPath());
  ApkUpdater apk=new ApkUpdater(updater);File bad=new File(work,"bad.apk");try(FileOutputStream out=new FileOutputStream(bad)){out.write(3);}rejected(()->apk.validate(bad,data));
 }
 @Test public void acceptedMetadataPersistsReplayProtection()throws Exception{
  WebUpdater first=updater(envelope.toString().getBytes(StandardCharsets.UTF_8));assertEquals("feature",first.check(null).getString("kind"));
  JSONObject older=new JSONObject(data.toString()).put("sequence",9);JSONObject oldEnvelope=sign(older);
  WebUpdater next=updater(oldEnvelope.toString().getBytes(StandardCharsets.UTF_8));rejected(()->next.check(null));
  assertEquals(10,next.prefs.getLong("sequence",0));
 }
 @Test public void actualApkSignerAndVersionMustMatchInstalledIdentity()throws Exception{
  android.content.pm.PackageManager pm=context.getPackageManager();
  android.content.pm.PackageInfo archive=pm.getPackageArchiveInfo(context.getPackageCodePath(),android.content.pm.PackageManager.GET_SIGNATURES);
  android.content.pm.PackageInfo installed=pm.getPackageInfo(context.getPackageName(),android.content.pm.PackageManager.GET_SIGNATURES);
  installed.versionCode--;
  JSONObject expected=new JSONObject().put("version",archive.versionName.replace("-preview.1", "")).put("versionCode",archive.versionCode).put("certificateSha256",UpdateSignature.digest(archive.signatures[0].toByteArray()));
  ApkUpdater.verifyIdentity(archive,installed,expected,android.os.Build.VERSION.SDK_INT);
  installed.versionCode=archive.versionCode;rejected(()->ApkUpdater.verifyIdentity(archive,installed,expected,android.os.Build.VERSION.SDK_INT));
  installed.versionCode--;installed.signatures=new android.content.pm.Signature[]{new android.content.pm.Signature(new byte[]{1,2,3})};rejected(()->ApkUpdater.verifyIdentity(archive,installed,expected,android.os.Build.VERSION.SDK_INT));
 }

}
