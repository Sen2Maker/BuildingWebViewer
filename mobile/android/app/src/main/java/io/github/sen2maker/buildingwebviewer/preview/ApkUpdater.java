package io.github.sen2maker.buildingwebviewer.preview;

import android.app.Activity;
import android.content.*;
import android.content.pm.*;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Download and verify first; Android retains final installation approval. */
final class ApkUpdater {
  final WebUpdater updates; final File folder,apk,receipt;
  ApkUpdater(WebUpdater updates){this.updates=updates;folder=new File(updates.context.getCacheDir(),"app-updates");folder.mkdirs();apk=new File(folder,"verified.apk");receipt=new File(folder,"verified.json");}
  void download(WebUpdater.Progress progress)throws Exception{
    if(updates.candidate==null)throw new IOException("Check update first");
    JSONObject envelope=updates.candidate;updates.candidate=null;
    JSONObject signed=updates.verifyFresh(envelope);File partial=new File(folder,"download.part");
    try{
      updates.download(signed.getJSONObject("apk"),partial,SignedUpdate.MAX_APK,progress);
      validate(partial,signed);updates.verifyFresh(envelope);
      if(apk.exists()&&!apk.delete())throw new IOException("Cannot replace previous download");
      if(!partial.renameTo(apk))throw new IOException("Cannot save APK");
      try(FileOutputStream out=new FileOutputStream(receipt)){out.write(envelope.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
    }finally{partial.delete();}
  }
  JSONObject verified()throws Exception{
    JSONObject signed=updates.verifyFresh(WebUpdater.readJson(receipt));validate(apk,signed);return signed;
  }
  void validate(File file,JSONObject signed)throws Exception{
    JSONObject expected=signed.getJSONObject("apk");
    if(!file.isFile()||file.length()!=expected.getLong("size"))throw new IOException("APK size mismatch");
    MessageDigest hash=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)hash.update(b,0,n);}
    if(!UpdateSignature.hex(hash.digest()).equals(expected.getString("sha256")))throw new IOException("APK checksum mismatch");
    PackageManager pm=updates.context.getPackageManager();
    PackageInfo archive=pm.getPackageArchiveInfo(file.getPath(),PackageManager.GET_SIGNATURES);
    PackageInfo installed=pm.getPackageInfo(updates.context.getPackageName(),PackageManager.GET_SIGNATURES);
    verifyIdentity(archive,installed,expected,Build.VERSION.SDK_INT);
  }
  static void verifyIdentity(PackageInfo archive,PackageInfo installed,JSONObject expected,int sdk)throws Exception {
    if(archive==null||!installed.packageName.equals(archive.packageName)||!SignedUpdate.PACKAGE.equals(archive.packageName)||archive.versionCode!=expected.getLong("versionCode")||archive.versionCode<=installed.versionCode||!archive.versionName.equals(expected.getString("version")+"-preview.1"))throw new IOException("APK package or version mismatch");
    if(archive.applicationInfo==null||archive.applicationInfo.minSdkVersion>sdk)throw new IOException("APK requires a newer Android version");
    if(archive.signatures==null||installed.signatures==null||archive.signatures.length!=1||installed.signatures.length!=1)throw new IOException("Unexpected APK signers");
    String signer=UpdateSignature.digest(archive.signatures[0].toByteArray());
    if(!signer.equals(expected.getString("certificateSha256"))||!signer.equals(UpdateSignature.digest(installed.signatures[0].toByteArray())))throw new IOException("APK signing certificate mismatch");
  }
  boolean needsPermission(){return Build.VERSION.SDK_INT>=26&&!updates.context.getPackageManager().canRequestPackageInstalls();}
  void permission(Activity activity){if(Build.VERSION.SDK_INT>=26)activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));}
  void install(Activity activity)throws Exception{
    // verified() is performed off the main thread immediately before this call.
    if(needsPermission())throw new IOException("Installation permission required");
    Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".fileprovider",apk);
    activity.startActivity(new Intent(Intent.ACTION_INSTALL_PACKAGE).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
  }
  void cleanInstalled(){
    try{JSONObject signed=SignedUpdate.verify(WebUpdater.readJson(receipt),updates.trust(),System.currentTimeMillis()/1000,false);
      if(updates.context.getPackageManager().getPackageInfo(updates.context.getPackageName(),0).versionCode>=signed.getJSONObject("apk").getLong("versionCode")){apk.delete();receipt.delete();}
    }catch(Exception ignored){}
  }
}
