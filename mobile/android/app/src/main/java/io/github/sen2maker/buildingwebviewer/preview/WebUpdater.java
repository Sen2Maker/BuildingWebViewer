package io.github.sen2maker.buildingwebviewer.preview;
import android.content.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;
/** Only official HTTPS release assets; never downloads datasets or replaces native code. */
final class WebUpdater {
  static final int NATIVE_API=4;
  static final String SITE="https://sen2maker.github.io/BuildingWebViewer/";
  static final String REPO="https://github.com/Sen2Maker/BuildingWebViewer";
  final Context context;final File root;final SharedPreferences prefs;JSONObject candidate;
  WebUpdater(Context context){this.context=context;root=new File(context.getFilesDir(),"web-updates");root.mkdirs();prefs=context.getSharedPreferences("bwv-updates",0);}
  String bundledVersion()throws Exception{try(InputStream in=context.getAssets().open("public/native-web.json")){return new JSONObject(ProjectStore.readText(in)).getString("version");}}
  String currentVersion(String path)throws Exception{File meta=new File(path==null?"":path,"native-web.json");if(path!=null&&meta.isFile())try(InputStream in=new FileInputStream(meta)){return new JSONObject(ProjectStore.readText(in)).getString("version");}return bundledVersion();}
  String startupPath(){
    // An update that did not reach the project home is rolled back on next launch.
    String active=prefs.getString("active",null);
    if(prefs.getBoolean("booting",false)){active=prefs.getString("previous",null);prefs.edit().putString("active",active).putBoolean("booting",false).commit();}
    if(active==null)return null;
    try{File folder=new File(root,active);if(!compatible(folder)||!new File(folder,"assets/mobile/index.html").isFile()||VersionPolicy.compare(currentVersion(folder.getPath()),bundledVersion())<=0)return null;prefs.edit().putBoolean("booting",true).commit();return folder.getAbsolutePath();}catch(Exception ignored){return null;}
  }
  boolean compatible(File folder){try(InputStream in=new FileInputStream(new File(folder,"native-web.json"))){return new JSONObject(ProjectStore.readText(in)).getInt("nativeApi")==NATIVE_API;}catch(Exception ignored){return false;}}
  void healthy(){prefs.edit().putBoolean("booting",false).apply();}
  HttpURLConnection connect(String address)throws Exception{
    URL url=new URL(address);
    for(int hop=0;hop<6;hop++){
      String host=url.getHost().toLowerCase(Locale.ROOT);
      if(!url.getProtocol().equals("https")||!Arrays.asList("sen2maker.github.io","github.com","release-assets.githubusercontent.com","objects.githubusercontent.com").contains(host))throw new IOException("Untrusted update host");
      HttpURLConnection c=(HttpURLConnection)url.openConnection();c.setConnectTimeout(2500);c.setReadTimeout(2500);c.setUseCaches(false);c.setInstanceFollowRedirects(false);c.setRequestProperty("User-Agent","BuildingWebViewer-Android");int code=c.getResponseCode();
      if(code>=300&&code<400){String redirect=c.getHeaderField("Location");c.disconnect();if(redirect==null)throw new IOException("Missing update redirect");url=new URL(url,redirect);continue;}
      if(code!=200){c.disconnect();throw new IOException("Update server HTTP "+code);}return c;
    }throw new IOException("Too many redirects");
  }
  JSONObject json(String address)throws Exception{HttpURLConnection c=connect(address);try(InputStream in=c.getInputStream()){return new JSONObject(ProjectStore.readText(in));}finally{c.disconnect();}}
  JSONObject check(String path)throws Exception{
    candidate=null;String current=currentVersion(path);JSONObject web=json(SITE+"version.json?check="+System.currentTimeMillis());String remote=web.getString("version");VersionPolicy.parse(remote);
    JSONObject result=new JSONObject().put("current",current).put("website",remote).put("kind","none").put("release",REPO+"/releases/tag/v"+remote);
    if(VersionPolicy.compare(remote,current)<=0)return result;
    try{
      JSONObject update=json(SITE+"mobile-update.json?check="+System.currentTimeMillis());String expected=REPO+"/releases/download/v"+remote+"/BuildingWebViewer-web-v"+remote+".zip";
      if(!update.getString("version").equals(remote)||update.getInt("nativeApi")!=NATIVE_API||!update.getString("url").equals(expected)||!update.getString("sha256").matches("[a-f0-9]{64}"))return result.put("kind","apk");
      candidate=update;return result.put("kind",VersionPolicy.patch(current,remote)?"patch":"feature");
    }catch(Exception ignored){return result.put("kind","offline");}
  }
  String install()throws Exception{
    if(candidate==null)throw new IOException("Check update first");JSONObject update=candidate;candidate=null;
    File work=new File(root,"download-"+UUID.randomUUID());work.mkdirs();File zip=new File(work,"payload.zip"),web=new File(work,"web");web.mkdirs();
    try{
      HttpURLConnection c=connect(update.getString("url"));MessageDigest sha=MessageDigest.getInstance("SHA-256");long size=0;
      try(InputStream in=c.getInputStream();FileOutputStream out=new FileOutputStream(zip)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){size+=n;if(size>32L*1024*1024||work.getUsableSpace()<96L*1024*1024)throw new IOException("Update size or storage limit exceeded");sha.update(b,0,n);out.write(b,0,n);}out.getFD().sync();}finally{c.disconnect();}
      StringBuilder digest=new StringBuilder();for(byte b:sha.digest())digest.append(String.format(Locale.ROOT,"%02x",b&255));if(!digest.toString().equals(update.getString("sha256")))throw new IOException("Update checksum mismatch");
      Set<String> names=new HashSet<>();long expanded=0;int count=0;
      try(ZipInputStream in=new ZipInputStream(new FileInputStream(zip))){ZipEntry e;byte[] b=new byte[65536];while((e=in.getNextEntry())!=null){if(++count>3000)throw new IOException("Too many update entries");String name=ArchivePolicy.path(e.getName());if(!names.add(name))throw new IOException("Duplicate update entry");File f=ArchivePolicy.within(web,name);if(e.isDirectory()){f.mkdirs();continue;}if(!name.matches(".*\\.(html|js|css|json|svg|png|ico|xml|md|txt)$")&&!name.equals(".nojekyll"))throw new IOException("Unexpected update file");f.getParentFile().mkdirs();try(FileOutputStream out=new FileOutputStream(f)){int n;while((n=in.read(b))!=-1){expanded+=n;if(expanded>64L*1024*1024)throw new IOException("Expanded update too large");out.write(b,0,n);}}}}
      if(!compatible(web)||!new File(web,"assets/mobile/index.html").isFile()||!new File(web,"assets/js/capacitor.js").isFile()||!currentVersion(web.getPath()).equals(update.getString("version")))throw new IOException("Incomplete web update");
      String name="v"+update.getString("version")+"-"+System.currentTimeMillis();File target=new File(root,name);if(!web.renameTo(target))throw new IOException("Cannot commit update");
      prefs.edit().putString("previous",prefs.getString("active",null)).putString("active",name).commit();
      for(File f:Objects.requireNonNull(root.listFiles()))if(f.isDirectory()&&!f.equals(target)&&!f.getName().equals(prefs.getString("previous",""))&&!f.equals(work))ProjectStore.deleteTree(f);
      return target.getAbsolutePath();
    }finally{ProjectStore.deleteTree(work);}
  }
}
