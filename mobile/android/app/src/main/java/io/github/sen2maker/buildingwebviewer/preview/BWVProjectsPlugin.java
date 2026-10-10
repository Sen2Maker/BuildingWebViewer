package io.github.sen2maker.buildingwebviewer.preview;
import android.app.Activity;
import android.content.*;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.*;

@CapacitorPlugin(name="BWVProjects")
public class BWVProjectsPlugin extends Plugin {
  private static final ExecutorService IO=Executors.newSingleThreadExecutor();
  private ProjectStore store;private WebUpdater updater;private static final ExecutorService NETWORK=Executors.newSingleThreadExecutor();
  private final Map<String,File> exports=new HashMap<>();
  @Override public void load(){store=new ProjectStore(getContext());updater=new WebUpdater(getContext());IO.execute(()->{File folder=new File(getContext().getCacheDir(),"exports");File[] old=folder.listFiles();if(old!=null)for(File file:old)if(System.currentTimeMillis()-file.lastModified()>7L*24*3600*1000)ProjectStore.deleteTree(file);});Intent intent=getActivity().getIntent();if(isShare(intent)){getActivity().setIntent(new Intent());acceptShare(intent);}}
  interface Task{JSONObject run()throws Exception;}
  private void run(PluginCall call,Task task){IO.execute(()->{try{call.resolve(JSObject.fromJSONObject(task.run()));}catch(Exception error){call.reject(error.getMessage(),error);}});}
  @PluginMethod public void updateHealthy(PluginCall call){updater.healthy();getActivity().runOnUiThread(()->((MainActivity)getActivity()).diagnostics.healthy());call.resolve();}
  private static final ScheduledExecutorService UPDATE_TIMEOUT=Executors.newSingleThreadScheduledExecutor();
  @PluginMethod public void showDiagnostics(PluginCall call){getActivity().runOnUiThread(()->((MainActivity)getActivity()).showDiagnostics());call.resolve();}
  @PluginMethod public void runtimeInfo(PluginCall call){getActivity().runOnUiThread(()->{try{
    String version="unknown";
    if(android.os.Build.VERSION.SDK_INT>=26){android.content.pm.PackageInfo engine=android.webkit.WebView.getCurrentWebViewPackage();if(engine!=null)version=engine.versionName;}
    else{java.util.regex.Matcher match=java.util.regex.Pattern.compile("Chrome/([0-9.]+)").matcher(bridge.getWebView().getSettings().getUserAgentString());if(match.find())version=match.group(1);}
    call.resolve(new JSObject().put("current",updater.currentVersion(bridge.getServerBasePath())).put("apkVersion",getContext().getPackageManager().getPackageInfo(getContext().getPackageName(),0).versionName).put("android",android.os.Build.VERSION.RELEASE).put("webview",version));
  }catch(Exception error){call.reject(error.getMessage());}});}
  @PluginMethod public void checkUpdate(PluginCall call){
    java.util.concurrent.atomic.AtomicBoolean delivered=new java.util.concurrent.atomic.AtomicBoolean();
    Future<?> task=NETWORK.submit(()->{try{JSObject result=JSObject.fromJSONObject(updater.check(bridge.getServerBasePath()));if(delivered.compareAndSet(false,true))call.resolve(result);}catch(Exception error){if(delivered.compareAndSet(false,true))call.resolve(new JSObject().put("kind","offline"));}});
    UPDATE_TIMEOUT.schedule(()->{if(delivered.compareAndSet(false,true)){task.cancel(true);call.resolve(new JSObject().put("kind","offline"));}},3,TimeUnit.SECONDS);
  }
  private volatile Future<?> apkDownload;
  private final java.util.concurrent.atomic.AtomicBoolean apkBusy=new java.util.concurrent.atomic.AtomicBoolean();
  @PluginMethod public void downloadApkUpdate(PluginCall call){
    if(!apkBusy.compareAndSet(false,true)){call.reject("A download is already running");return;}
    java.util.concurrent.atomic.AtomicBoolean delivered=new java.util.concurrent.atomic.AtomicBoolean();
    FutureTask<Void> task=new FutureTask<Void>(()->{try{new ApkUpdater(updater).download((received,total)->notifyListeners("apkUpdateProgress",new JSObject().put("received",received).put("total",total)));if(delivered.compareAndSet(false,true))call.resolve(new JSObject().put("ready",true));}catch(Exception error){if(delivered.compareAndSet(false,true))call.reject(error.getMessage());}finally{apkBusy.set(false);}return null;}){
      @Override protected void done(){if(isCancelled()){apkBusy.set(false);if(delivered.compareAndSet(false,true))call.reject("Download cancelled");}}
    };
    apkDownload=task;NETWORK.execute(task);
  }
  @PluginMethod public void cancelApkDownload(PluginCall call){Future<?> task=apkDownload;if(task!=null)task.cancel(true);call.resolve();}
  @PluginMethod public void apkUpdateStatus(PluginCall call){NETWORK.execute(()->{ApkUpdater apk=new ApkUpdater(updater);apk.cleanInstalled();try{apk.verified();call.resolve(new JSObject().put("ready",true).put("permissionRequired",apk.needsPermission()));}catch(Exception ignored){call.resolve(new JSObject().put("ready",false));}});}
  @PluginMethod public void allowApkInstall(PluginCall call){getActivity().runOnUiThread(()->{try{new ApkUpdater(updater).permission(getActivity());call.resolve();}catch(Exception error){call.reject(error.getMessage());}});}
  @PluginMethod public void installApkUpdate(PluginCall call){NETWORK.execute(()->{try{
    ApkUpdater apk=new ApkUpdater(updater);apk.verified();
    getActivity().runOnUiThread(()->{try{if(!getActivity().getLifecycle().getCurrentState().isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED))throw new IOException("Return to the app to install");if(apk.needsPermission()){call.resolve(new JSObject().put("permissionRequired",true));return;}apk.install(getActivity());call.resolve(new JSObject().put("installerOpened",true));}catch(Exception error){call.reject(error.getMessage());}});
  }catch(Exception error){call.reject(error.getMessage());}});}
  @PluginMethod public void showReleaseNotes(PluginCall call){IO.execute(()->{try{
    JSONObject info=updater.announcement(bridge.getServerBasePath());boolean manual=call.getBoolean("manual",false),english="en".equals(call.getString("lang","zh"));
    if(!manual&&!info.getBoolean("unread")){call.resolve();return;}
    getActivity().runOnUiThread(()->{try{if(!getActivity().getLifecycle().getCurrentState().isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED)){call.resolve();return;}
      new androidx.appcompat.app.AlertDialog.Builder(getActivity()).setTitle((english?"Release notes · v":"版本公告 · v")+info.getString("version")).setMessage(info.getJSONObject("notes").getString(english?"en":"zh")).setPositiveButton(english?"Got it":"知道了",(dialog,which)->{updater.prefs.edit().putBoolean("announcement."+info.optString("version"),true).apply();}).setOnDismissListener(dialog->call.resolve()).show();
    }catch(Exception error){call.reject(error.getMessage());}});
  }catch(Exception error){call.reject(error.getMessage());}});}
  @PluginMethod public void installWebUpdate(PluginCall call){NETWORK.execute(()->{try{String path=updater.install();call.resolve(new JSObject().put("installed",true));}catch(Exception error){call.reject(error.getMessage());}});}
  @PluginMethod public void activateWebUpdate(PluginCall call){String path=updater.startupPath();call.resolve();if(path!=null)getActivity().runOnUiThread(()->bridge.setServerBasePath(path));}
  @PluginMethod public void cleanupStorage(PluginCall call){run(call,()->new JSONObject().put("freed",store.cleanup()));}
  @PluginMethod public void emptyTrash(PluginCall call){run(call,()->new JSONObject().put("freed",store.emptyTrash()));}
  @PluginMethod public void backupProject(PluginCall call){run(call,()->{File dir=new File(getContext().getCacheDir(),"exports/"+ProjectStore.id());File file=store.backup(call.getString("id"),dir);share(file,"application/zip");return new JSONObject();});}
  @PluginMethod public void listProjects(PluginCall call){run(call,()->new JSONObject().put("projects",store.list()));}
  @PluginMethod public void createProject(PluginCall call){run(call,()->store.create(call.getString("name")));}
  @PluginMethod public void getProject(PluginCall call){run(call,()->store.get(call.getString("id")));}
  @PluginMethod public void saveState(PluginCall call){run(call,()->store.saveState(call.getString("id"),call.getString("tool"),call.getObject("state",new JSObject())));}
  @PluginMethod public void renameProject(PluginCall call){run(call,()->{store.rename(call.getString("id"),call.getString("name"));return new JSONObject();});}
  @PluginMethod public void trashProject(PluginCall call){run(call,()->{store.trash(call.getString("id"),call.getBoolean("trashed",true));return new JSONObject();});}
  @PluginMethod public void retryImport(PluginCall call){run(call,()->store.retry(call.getString("id")));}
  @PluginMethod public void discardImport(PluginCall call){run(call,()->{JSONObject p=store.get(call.getString("id"));String job=p.optString("importJob");if(job.matches("[a-f0-9-]{36}"))ProjectStore.deleteTree(new File(store.inbox,job));p.remove("importJob");p.remove("error");p.put("status","ready");store.put(p);return p;});}
  @PluginMethod public void pickFiles(PluginCall call){
    Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    startActivityForResult(call,intent,"picked");
  }
  @ActivityCallback private void picked(PluginCall call,ActivityResult result){
    if(call==null)return;if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null){call.resolve(new JSObject().put("cancelled",true));return;}
    List<Uri> uris=uris(result.getData());String id=call.getString("id");run(call,()->store.importUris(id,uris));
  }
  static boolean isShare(Intent intent){return intent!=null&&Arrays.asList(Intent.ACTION_SEND,Intent.ACTION_SEND_MULTIPLE,Intent.ACTION_VIEW).contains(intent.getAction());}
  @SuppressWarnings("deprecation") static List<Uri> uris(Intent intent){
    LinkedHashSet<Uri> values=new LinkedHashSet<>();if(intent.getClipData()!=null)for(int i=0;i<intent.getClipData().getItemCount();i++)if(intent.getClipData().getItemAt(i).getUri()!=null)values.add(intent.getClipData().getItemAt(i).getUri());
    if(Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())){ArrayList<Uri> list=intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);if(list!=null)values.addAll(list);}else{Uri stream=intent.getParcelableExtra(Intent.EXTRA_STREAM);if(stream!=null)values.add(stream);}
    if(intent.getData()!=null)values.add(intent.getData());values.removeIf(uri->!"content".equals(uri.getScheme()));return new ArrayList<>(values);
  }
  private void acceptShare(Intent intent){List<Uri> files=uris(intent);if(files.isEmpty())return;
    IO.execute(()->{try{JSONObject p=store.importUris(null,files);notifyListeners("projectsChanged",JSObject.fromJSONObject(p),true);}catch(Exception error){notifyListeners("projectsChanged",new JSObject().put("error",error.getMessage()),true);}});
  }
  @Override protected void handleOnNewIntent(Intent intent){if(isShare(intent)){getActivity().setIntent(new Intent());acceptShare(intent);}}
  @Override protected void handleOnPause(){ArchiveImporter.background=true;bridge.triggerWindowJSEvent("bwvPause");}
  @Override protected void handleOnResume(){ArchiveImporter.background=false;bridge.triggerWindowJSEvent("bwvResume");}
  @PluginMethod public void readChunk(PluginCall call){run(call,()->{
    String id=call.getString("id"),key=call.getString("key");JSONArray files=store.get(id).getJSONArray("files");boolean allowed=false;for(int i=0;i<files.length();i++)if(files.getJSONObject(i).getString("key").equals(key)){allowed=true;break;}if(!allowed)throw new IOException("File is not in project");
    long offset=call.getLong("offset",0L);int length=call.getInt("length",1048576);if(offset<0||length<0||length>1048576)throw new IOException("Invalid read range");
    File file=store.objectFile(key);try(RandomAccessFile in=new RandomAccessFile(file,"r")){int count=(int)Math.min(length,Math.max(0,in.length()-offset));byte[] bytes=new byte[count];in.seek(Math.min(offset,in.length()));in.readFully(bytes);return new JSONObject().put("data",Base64.encodeToString(bytes,Base64.NO_WRAP));}
  });}
  @PluginMethod public void beginExport(PluginCall call){run(call,()->{String token=ProjectStore.id(),name=call.getString("name","export.bin");name=new File(name.replace('\\','/')).getName();File folder=new File(getContext().getCacheDir(),"exports/"+token);folder.mkdirs();File file=new File(folder,name);exports.put(token,file);return new JSONObject().put("token",token);});}
  @PluginMethod public void appendExport(PluginCall call){run(call,()->{File file=exports.get(call.getString("token"));if(file==null)throw new IOException("Unknown export");String value=call.getString("data","");if(value.length()>400000)throw new IOException("Export chunk too large");if(file.getParentFile().getUsableSpace()<32L*1024*1024)throw new IOException("Not enough storage");try(FileOutputStream out=new FileOutputStream(file,true)){out.write(Base64.decode(value,Base64.DEFAULT));}return new JSONObject();});}
  @PluginMethod public void cancelExport(PluginCall call){run(call,()->{File file=exports.remove(call.getString("token"));if(file!=null)ProjectStore.deleteTree(file.getParentFile());return new JSONObject();});}
  @PluginMethod public void finishExport(PluginCall call){run(call,()->{File file=exports.remove(call.getString("token"));if(file==null)throw new IOException("Unknown export");share(file,call.getString("type","application/octet-stream"));return new JSONObject();});}
  @PluginMethod public void commitExport(PluginCall call){run(call,()->{
    File file=exports.remove(call.getString("token"));if(file==null)throw new IOException("Unknown export");JSONObject record=store.object(file,call.getString("path"));JSONObject p=store.get(call.getString("id"));p.getJSONArray("files").put(record);store.put(p);ProjectStore.deleteTree(file.getParentFile());return record;
  });}
  void share(File file,String type){getActivity().runOnUiThread(()->{Uri uri=FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".fileprovider",file);Intent intent=new Intent(Intent.ACTION_SEND).setType(type).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.setClipData(ClipData.newRawUri("export",uri));getActivity().startActivity(Intent.createChooser(intent,"保存或分享 / Save or share"));});}
}
