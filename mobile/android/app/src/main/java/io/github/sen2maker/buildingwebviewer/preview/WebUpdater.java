package io.github.sen2maker.buildingwebviewer.preview;

import android.content.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;

/** Local-first updates. All network update decisions require native signature verification. */
class WebUpdater {
  static final int NATIVE_API=5;
  static final String SITE="https://sen2maker.github.io/BuildingWebViewer/";
  static final String REPO=SignedUpdate.REPO;
  final Context context; final File root; final SharedPreferences prefs;
  JSONObject candidate;
  WebUpdater(Context context){this.context=context;root=new File(context.getFilesDir(),"web-updates");root.mkdirs();prefs=context.getSharedPreferences("bwv-updates",0);}
  JSONObject trust()throws Exception{try(InputStream in=context.getResources().openRawResource(R.raw.update_trust)){return new JSONObject(readLimited(in,65536));}}
  String bundledVersion()throws Exception{try(InputStream in=context.getAssets().open("public/native-web.json")){return new JSONObject(readLimited(in,65536)).getString("version");}}
  String currentVersion(String path)throws Exception{File meta=new File(path==null?"":path,"native-web.json");if(path!=null&&meta.isFile())try(InputStream in=new FileInputStream(meta)){return new JSONObject(readLimited(in,65536)).getString("version");}return bundledVersion();}
  String startupPath(){
    String active=prefs.getString("active",null);
    if(prefs.getBoolean("booting",false)){active=prefs.getString("previous",null);prefs.edit().putString("active",active).putBoolean("booting",false).commit();}
    if(active==null)return null;
    try{File folder=ArchivePolicy.within(root,active);if(!compatible(folder)||!new File(folder,"assets/mobile/index.html").isFile()||VersionPolicy.compare(currentVersion(folder.getPath()),bundledVersion())<=0)return null;
      // Installed content stays usable offline after metadata expiry. Trust is checked again.
      JSONObject receipt=readJson(new File(folder,"update-receipt.json"));
      JSONObject verified=SignedUpdate.verify(receipt,trust(),System.currentTimeMillis()/1000,false);
      if(!verified.getString("version").equals(currentVersion(folder.getPath()))||verified.getInt("nativeApi")!=NATIVE_API)return null;
      prefs.edit().putBoolean("booting",true).commit();return folder.getAbsolutePath();
    }catch(Exception ignored){return null;}
  }
  boolean compatible(File folder){try{return readJson(new File(folder,"native-web.json")).getInt("nativeApi")==NATIVE_API;}catch(Exception ignored){return false;}}
  void healthy(){prefs.edit().putBoolean("booting",false).apply();}
  static String readLimited(InputStream in,int maximum)throws IOException{
    ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] bytes=new byte[8192];int n;
    while((n=in.read(bytes))!=-1){if(out.size()+n>maximum)throw new IOException("Metadata too large");out.write(bytes,0,n);}return out.toString("UTF-8");
  }
  static JSONObject readJson(File file)throws Exception{try(InputStream in=new FileInputStream(file)){return new JSONObject(readLimited(in,65536));}}
  HttpURLConnection connect(String address)throws Exception{
    URL url=new URL(address);
    for(int hop=0;hop<6;hop++){
      String host=url.getHost().toLowerCase(Locale.ROOT);
      if(!url.getProtocol().equals("https")||url.getUserInfo()!=null||(url.getPort()!=-1&&url.getPort()!=443)||!Arrays.asList("sen2maker.github.io","github.com","release-assets.githubusercontent.com","objects.githubusercontent.com").contains(host))throw new IOException("Untrusted update host");
      HttpURLConnection c=(HttpURLConnection)url.openConnection();c.setConnectTimeout(2500);c.setReadTimeout(10000);c.setUseCaches(false);c.setInstanceFollowRedirects(false);c.setRequestProperty("User-Agent","BuildingWebViewer-Android");int code=c.getResponseCode();
      if(code>=300&&code<400){String redirect=c.getHeaderField("Location");c.disconnect();if(redirect==null)throw new IOException("Missing update redirect");url=new URL(url,redirect);continue;}
      if(code!=200){c.disconnect();throw new IOException("Update server HTTP "+code);}return c;
    }throw new IOException("Too many redirects");
  }
  JSONObject json(String address)throws Exception{HttpURLConnection c=connect(address);try(InputStream in=c.getInputStream()){return new JSONObject(readLimited(in,65536));}finally{c.disconnect();}}
  JSONObject verifyFresh(JSONObject envelope)throws Exception{
    JSONObject signed=SignedUpdate.verify(envelope,trust(),System.currentTimeMillis()/1000,true);
    SignedUpdate.monotonic(signed,prefs.getLong("sequence",0),prefs.getString("metadataDigest",""),prefs.getString("highestVersion",""),SignedUpdate.identity(envelope));
    return signed;
  }
  JSONObject check(String path)throws Exception{
    candidate=null;String current=currentVersion(path);
    JSONObject envelope=json(SITE+"mobile-update.json?check="+System.currentTimeMillis());
    JSONObject update=verifyFresh(envelope);String remote=update.getString("version");
    if(Thread.currentThread().isInterrupted())throw new IOException("Check cancelled");
    if(!prefs.edit().putLong("sequence",update.getLong("sequence")).putString("metadataDigest",SignedUpdate.identity(envelope)).putString("highestVersion",remote).commit())throw new IOException("Cannot save update trust state");
    JSONObject result=new JSONObject().put("current",current).put("website",remote).put("notes",update.getJSONObject("notes")).put("kind","none");
    if(VersionPolicy.compare(remote,current)<=0)return result;
    candidate=envelope;
    if(update.getInt("nativeApi")!=NATIVE_API)return result.put("kind","apk");
    return result.put("kind",VersionPolicy.patch(current,remote)?"patch":"feature");
  }
  interface Progress {void report(long received,long total);}
  void download(JSONObject file,File destination,long maximum,Progress progress)throws Exception{
    long expected=file.getLong("size");if(expected<=0||expected>maximum)throw new IOException("Invalid update size");
    HttpURLConnection c=connect(file.getString("url"));MessageDigest sha=MessageDigest.getInstance("SHA-256");long size=0,last=0;long start=System.currentTimeMillis();
    try(InputStream in=c.getInputStream();FileOutputStream out=new FileOutputStream(destination)){
      byte[] b=new byte[65536];int n;
      while((n=in.read(b))!=-1){if(Thread.currentThread().isInterrupted()||System.currentTimeMillis()-start>10*60*1000)throw new IOException("Download cancelled or timed out");size+=n;if(size>expected||destination.getParentFile().getUsableSpace()<96L*1024*1024)throw new IOException("Update size or storage limit exceeded");sha.update(b,0,n);out.write(b,0,n);if(progress!=null&&System.currentTimeMillis()-last>200){last=System.currentTimeMillis();progress.report(size,expected);}}out.getFD().sync();
    }finally{c.disconnect();}
    if(size!=expected||!UpdateSignature.hex(sha.digest()).equals(file.getString("sha256")))throw new IOException("Update checksum mismatch");
    if(progress!=null)progress.report(size,expected);
  }
  String install()throws Exception{
    if(candidate==null)throw new IOException("Check update first");JSONObject envelope=candidate;candidate=null;JSONObject update=verifyFresh(envelope);
    if(update.getInt("nativeApi")!=NATIVE_API)throw new IOException("APK update required");
    File work=new File(root,"download-"+UUID.randomUUID());work.mkdirs();File zip=new File(work,"payload.bwvupdate"),web=new File(work,"web");web.mkdirs();
    try{
      download(update.getJSONObject("web"),zip,SignedUpdate.MAX_WEB,null);
      Set<String> names=new HashSet<>();long expanded=0;int count=0;
      try(ZipInputStream in=new ZipInputStream(new FileInputStream(zip))){ZipEntry e;byte[] b=new byte[65536];while((e=in.getNextEntry())!=null){if(++count>3000)throw new IOException("Too many update entries");String name=ArchivePolicy.path(e.getName());if(!names.add(name)||name.equals("update-receipt.json"))throw new IOException("Duplicate or reserved update entry");File f=ArchivePolicy.within(web,name);if(e.isDirectory()){f.mkdirs();continue;}if(!name.matches(".*\\.(html|js|css|json|svg|png|ico|xml|md|txt)$")&&!name.equals(".nojekyll"))throw new IOException("Unexpected update file");f.getParentFile().mkdirs();try(FileOutputStream out=new FileOutputStream(f)){int n;while((n=in.read(b))!=-1){expanded+=n;if(expanded>64L*1024*1024)throw new IOException("Expanded update too large");out.write(b,0,n);}}}}
      if(!compatible(web)||!new File(web,"assets/mobile/index.html").isFile()||!new File(web,"assets/js/capacitor.js").isFile()||!currentVersion(web.getPath()).equals(update.getString("version")))throw new IOException("Incomplete web update");
      JSONObject notes=readJson(new File(web,"release-notes.json"));
      if(!notes.getString("version").equals(update.getString("version"))||!notes.getJSONObject("notes").getString("zh").equals(update.getJSONObject("notes").getString("zh"))||!notes.getJSONObject("notes").getString("en").equals(update.getJSONObject("notes").getString("en")))throw new IOException("Release notes mismatch");
      try(FileOutputStream out=new FileOutputStream(new File(web,"update-receipt.json"))){out.write(envelope.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
      verifyFresh(envelope);
      String name="v"+update.getString("version")+"-"+System.currentTimeMillis();File target=new File(root,name);if(!web.renameTo(target))throw new IOException("Cannot commit update");
      if(!prefs.edit().putString("previous",prefs.getString("active",null)).putString("active",name).commit())throw new IOException("Cannot activate update");
      for(File f:Objects.requireNonNull(root.listFiles()))if(f.isDirectory()&&!f.equals(target)&&!f.getName().equals(prefs.getString("previous",""))&&!f.equals(work))ProjectStore.deleteTree(f);
      return target.getAbsolutePath();
    }finally{ProjectStore.deleteTree(work);}
  }
  JSONObject announcement(String path)throws Exception{
    JSONObject notes;
    if(path!=null&&new File(path).isAbsolute())notes=readJson(new File(path,"release-notes.json"));
    else try(InputStream in=context.getAssets().open("public/release-notes.json")){notes=new JSONObject(readLimited(in,65536));}
    String version=currentVersion(path);
    if(!notes.getString("version").equals(version))throw new IOException("Release notes mismatch");
    return notes.put("unread",!prefs.getBoolean("announcement."+version,false));
  }
}
