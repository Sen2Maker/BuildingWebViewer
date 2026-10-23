package io.github.sen2maker.buildingwebviewer;
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
  private ProjectStore store;private ProcessRuntime runtime;
  private static final class Export {final File file;final PluginCall owner;Export(File file,PluginCall owner){this.file=file;this.owner=owner;}}
  private final Map<String,Export> exports=new HashMap<>();
  private volatile boolean destroyed;
  private boolean authorized(PluginCall call){if(destroyed||!BwvBridgeCallGuard.current(call,bridge.getWebView())){call.reject("STALE_OR_UNAUTHORIZED_DOCUMENT");return false;}runtime.assertBound();return true;}
  void documentStarted(){removeAllListeners();}
  @Override protected void handleOnDestroy(){destroyed=true;removeAllListeners();}
  private File exported(PluginCall call,boolean remove)throws IOException{String token=call.getString("token");Export value=exports.get(token);if(value==null||!BwvBridgeCallGuard.sameDocument(value.owner,call))throw new IOException("Unknown or stale export");if(remove)exports.remove(token);return value.file;}

  @Override public void load(){store=((BwvApplication)getActivity().getApplication()).projects();runtime=((BwvApplication)getActivity().getApplication()).runtime();if(runtime==null)throw new IllegalStateException("No process runtime");runtime.assertBound();/* Export-cache reclamation needs an explicit active-export-aware maintenance policy, not plugin-load deletion. */Intent intent=getActivity().getIntent();if(isShare(intent)){getActivity().setIntent(new Intent());acceptShare(intent);}}
  interface Task{JSONObject run()throws Exception;}
  private void run(PluginCall call,Task task){IO.execute(()->{try{BwvBridgeCallGuard.require(call,bridge.getWebView());JSONObject result=task.run();BwvBridgeCallGuard.require(call,bridge.getWebView());call.resolve(JSObject.fromJSONObject(result));}catch(Exception error){call.reject(error.getMessage(),error);}});}
  // No legacy health preference or activation entry exists. A JS event is not native trial health.
  @PluginMethod public void showDiagnostics(PluginCall call){if(!authorized(call))return;getActivity().runOnUiThread(()->{if(!authorized(call))return;((MainActivity)getActivity()).showDiagnostics();call.resolve();});}
  @PluginMethod public void openRecovery(PluginCall call){if(!authorized(call))return;getActivity().runOnUiThread(()->{if(!authorized(call))return;getActivity().startActivity(new Intent(getActivity(),RecoveryActivity.class));call.resolve();});}
  @PluginMethod public void runtimeInfo(PluginCall call){if(!authorized(call))return;getActivity().runOnUiThread(()->{try{
    if(!authorized(call))return;String version="unknown";
    if(android.os.Build.VERSION.SDK_INT>=26){android.content.pm.PackageInfo engine=android.webkit.WebView.getCurrentWebViewPackage();if(engine!=null)version=engine.versionName;}
    else{java.util.regex.Matcher match=java.util.regex.Pattern.compile("Chrome/([0-9.]+)").matcher(bridge.getWebView().getSettings().getUserAgentString());if(match.find())version=match.group(1);}
    call.resolve(new JSObject().put("current",runtime.version()).put("apkVersion",getContext().getPackageManager().getPackageInfo(getContext().getPackageName(),0).versionName).put("nativeGaussianWorkspace",true).put("nativeGaussian",((android.app.ActivityManager)getContext().getSystemService(android.content.Context.ACTIVITY_SERVICE)).getDeviceConfigurationInfo().reqGlEsVersion>=0x30000).put("android",android.os.Build.VERSION.RELEASE).put("webview",version));
  }catch(Exception error){call.reject(error.getMessage());}});}
  @PluginMethod public void openCadAppDownload(PluginCall call){if(!authorized(call))return;
    // The independent CAD application's verified fixed download page is not finalized yet.
    // Never accept a URL/project/path from JS or signed update metadata.
    call.resolve(new JSObject().put("available",false).put("reason","CAD_APP_DOWNLOAD_PAGE_NOT_CONFIGURED"));
  }
  @PluginMethod public void checkUpdate(PluginCall call){if(!authorized(call))return;call.resolve(new JSObject().put("kind","disabled").put("reason",runtime.updateStatus));}
  @PluginMethod public void runtimeSnapshot(PluginCall call){if(!authorized(call))return;
    runtime.assertBound();
    call.resolve(new JSObject().put("sessionId",runtime.sessionId).put("contentId",runtime.contentId()).put("nativeApi",BuildConfig.NATIVE_API).put("webRootIdentity",runtime.rootIdentity()).put("shaderRootIdentity",runtime.rootIdentity()).put("fixtureOnly",BuildConfig.NATIVE_COMPILE_FIXTURE));
  }
  @PluginMethod public void showReleaseNotes(PluginCall call){if(!authorized(call))return;run(call,()->new JSONObject(runtime.text("release-notes.json",65536)));}
  // Download/install/activate APIs are deliberately absent until reviewed Android adapters are enabled.
  @PluginMethod public void openNativeGaussian(PluginCall call){if(!authorized(call))return;IO.execute(()->{try{
    if(!authorized(call))return;String id=call.getString("id");JSONArray keys=call.getData().getJSONArray("keys");if(keys.length()>0)NativeGaussianActivity.authorizedFiles(store,id,keys);else store.get(id);
    getActivity().runOnUiThread(()->{try{if(!authorized(call))return;Intent intent=new Intent(getContext(),NativeGaussianActivity.class).putExtra("project",id).putExtra("keys",keys.toString()).putExtra("lang",call.getString("lang","zh"));startActivityForResult(call,intent,"nativeGaussianReturned");}catch(Exception error){call.reject(error.getMessage());}});
  }catch(Exception error){call.reject(error.getMessage());}});}
  @ActivityCallback private void nativeGaussianReturned(PluginCall call,ActivityResult result){if(call==null||!authorized(call))return;boolean compatibility=result.getData()!=null&&result.getData().getBooleanExtra("compatibility",false);call.resolve(new JSObject().put("compatibility",compatibility));}
  @PluginMethod public void cleanupStorage(PluginCall call){if(!authorized(call))return;call.reject("MAINTENANCE_DISABLED_PENDING_BACKUP_ONLY_PROJECT_REVIEW");}
  @PluginMethod public void emptyTrash(PluginCall call){if(!authorized(call))return;call.reject("MAINTENANCE_DISABLED_PENDING_BACKUP_ONLY_PROJECT_REVIEW");}
  @PluginMethod public void backupProject(PluginCall call){if(!authorized(call))return;run(call,()->{File dir=new File(getContext().getCacheDir(),"exports/"+ProjectStore.id());File file=store.backup(call.getString("id"),dir);share(call,file,"application/zip");return new JSONObject();});}
  @PluginMethod public void listProjects(PluginCall call){if(!authorized(call))return;run(call,()->new JSONObject().put("projects",store.list()));}
  @PluginMethod public void createProject(PluginCall call){if(!authorized(call))return;run(call,()->store.create(call.getString("name")));}
  @PluginMethod public void getProject(PluginCall call){if(!authorized(call))return;run(call,()->store.get(call.getString("id")));}
  @PluginMethod public void saveState(PluginCall call){if(!authorized(call))return;run(call,()->store.saveState(call.getString("id"),call.getString("tool"),call.getObject("state",new JSObject())));}
  @PluginMethod public void renameProject(PluginCall call){if(!authorized(call))return;run(call,()->{store.rename(call.getString("id"),call.getString("name"));return new JSONObject();});}
  @PluginMethod public void trashProject(PluginCall call){if(!authorized(call))return;run(call,()->{store.trash(call.getString("id"),call.getBoolean("trashed",true));return new JSONObject();});}
  @PluginMethod public void retryImport(PluginCall call){if(!authorized(call))return;run(call,()->store.retry(call.getString("id")));}
  @PluginMethod public void discardImport(PluginCall call){if(!authorized(call))return;run(call,()->{JSONObject p=store.get(call.getString("id"));String job=p.optString("importJob");if(job.matches("[a-f0-9-]{36}"))ProjectStore.deleteTree(new File(store.inbox,job));p.remove("importJob");p.remove("error");p.put("status","ready");store.put(p);return p;});}
  @PluginMethod public void pickFiles(PluginCall call){if(!authorized(call))return;
    Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    getActivity().runOnUiThread(()->{if(authorized(call))startActivityForResult(call,intent,"picked");});
  }
  @ActivityCallback private void picked(PluginCall call,ActivityResult result){
    if(call==null||!authorized(call))return;if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null){call.resolve(new JSObject().put("cancelled",true));return;}
    List<Uri> uris=uris(result.getData());String id=call.getString("id");run(call,()->store.importUris(id,uris));
  }
  static boolean isShare(Intent intent){return intent!=null&&Arrays.asList(Intent.ACTION_SEND,Intent.ACTION_SEND_MULTIPLE,Intent.ACTION_VIEW).contains(intent.getAction());}
  @SuppressWarnings("deprecation") static List<Uri> uris(Intent intent){
    LinkedHashSet<Uri> values=new LinkedHashSet<>();if(intent.getClipData()!=null)for(int i=0;i<intent.getClipData().getItemCount();i++)if(intent.getClipData().getItemAt(i).getUri()!=null)values.add(intent.getClipData().getItemAt(i).getUri());
    if(Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())){ArrayList<Uri> list=intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);if(list!=null)values.addAll(list);}else{Uri stream=intent.getParcelableExtra(Intent.EXTRA_STREAM);if(stream!=null)values.add(stream);}
    if(intent.getData()!=null)values.add(intent.getData());values.removeIf(uri->!"content".equals(uri.getScheme()));return new ArrayList<>(values);
  }
  private void acceptShare(Intent intent){List<Uri> files=uris(intent);if(files.isEmpty())return;
    IO.execute(()->{try{JSONObject p=store.importUris(null,files);publishProjectEvent(JSObject.fromJSONObject(p));}catch(Exception error){publishProjectEvent(new JSObject().put("error",error.getMessage()));}});
  }
  private void publishProjectEvent(JSObject event){getActivity().runOnUiThread(()->{if(!destroyed)notifyListeners("projectsChanged",event,false);});}
  @Override protected void handleOnNewIntent(Intent intent){if(isShare(intent)){getActivity().setIntent(new Intent());acceptShare(intent);}}
  @Override protected void handleOnPause(){bridge.getWebView().evaluateJavascript(NativeRoutes.lifecycle("bwvPause"),null);}
  @Override protected void handleOnResume(){bridge.getWebView().evaluateJavascript(NativeRoutes.lifecycle("bwvResume"),null);}
  @PluginMethod public void readChunk(PluginCall call){if(!authorized(call))return;run(call,()->{
    String id=call.getString("id"),key=call.getString("key");JSONArray files=store.get(id).getJSONArray("files");boolean allowed=false;for(int i=0;i<files.length();i++)if(files.getJSONObject(i).getString("key").equals(key)){allowed=true;break;}if(!allowed)throw new IOException("File is not in project");
    long offset=call.getData().optLong("offset",0L);int length=call.getInt("length",1048576);if(offset<0||length<0||length>1048576)throw new IOException("Invalid read range");
    File file=store.objectFile(key);try(RandomAccessFile in=new RandomAccessFile(file,"r")){int count=(int)Math.min(length,Math.max(0,in.length()-offset));byte[] bytes=new byte[count];in.seek(Math.min(offset,in.length()));in.readFully(bytes);return new JSONObject().put("data",Base64.encodeToString(bytes,Base64.NO_WRAP));}
  });}
  @PluginMethod public void beginExport(PluginCall call){if(!authorized(call))return;run(call,()->{String token=ProjectStore.id(),name=call.getString("name","export.bin");name=new File(name.replace('\\','/')).getName();File folder=new File(getContext().getCacheDir(),"exports/"+token);folder.mkdirs();File file=new File(folder,name);exports.put(token,new Export(file,call));return new JSONObject().put("token",token);});}
  @PluginMethod public void appendExport(PluginCall call){if(!authorized(call))return;run(call,()->{File file=exported(call,false);String value=call.getString("data","");if(value.length()>400000)throw new IOException("Export chunk too large");if(file.getParentFile().getUsableSpace()<32L*1024*1024)throw new IOException("Not enough storage");try(FileOutputStream out=new FileOutputStream(file,true)){out.write(Base64.decode(value,Base64.DEFAULT));}return new JSONObject();});}
  @PluginMethod public void cancelExport(PluginCall call){if(!authorized(call))return;run(call,()->{File file=exported(call,true);ProjectStore.deleteTree(file.getParentFile());return new JSONObject();});}
  @PluginMethod public void finishExport(PluginCall call){if(!authorized(call))return;run(call,()->{File file=exported(call,true);share(call,file,call.getString("type","application/octet-stream"));return new JSONObject();});}
  @PluginMethod public void commitExport(PluginCall call){if(!authorized(call))return;run(call,()->{
    File file=exported(call,true);JSONObject record=store.object(file,call.getString("path"));JSONObject p=store.get(call.getString("id"));p.getJSONArray("files").put(record);store.put(p);ProjectStore.deleteTree(file.getParentFile());return record;
  });}
  @PluginMethod public void commitSnapshot(PluginCall call){if(!authorized(call))return;run(call,()->{
    String token=call.getString("token");File file=exported(call,false);
    JSONObject result=store.commitSnapshot(call.getString("id"),call.getString("tool"),file,call.getObject("state",new JSObject()));
    exports.remove(token);ProjectStore.deleteTree(file.getParentFile());return result;
  });}
  @Override @PluginMethod(returnType=PluginMethod.RETURN_NONE) public void addListener(PluginCall call){getActivity().runOnUiThread(()->{if(!authorized(call))return;if(!"projectsChanged".equals(call.getString("eventName"))){call.reject("UNKNOWN_EVENT");return;}super.addListener(call);});}
  @Override @PluginMethod(returnType=PluginMethod.RETURN_NONE) public void removeListener(PluginCall call){getActivity().runOnUiThread(()->{if(!authorized(call))return;PluginCall saved=bridge.getSavedCall(call.getString("callbackId"));if(!"projectsChanged".equals(call.getString("eventName"))||saved==null||!"BWVProjects".equals(saved.getPluginId())||!BwvBridgeCallGuard.sameDocument(saved,call)){call.reject("UNKNOWN_LISTENER");return;}super.removeListener(call);});}
  @Override @PluginMethod public void removeAllListeners(PluginCall call){getActivity().runOnUiThread(()->{if(authorized(call))super.removeAllListeners(call);});}
  @Override @PluginMethod public void checkPermissions(PluginCall call){if(!authorized(call))return;call.resolve(new JSObject());}
  @Override @PluginMethod public void requestPermissions(PluginCall call){if(!authorized(call))return;call.reject("NO_RUNTIME_PERMISSIONS_EXPOSED");}
  void share(PluginCall call,File file,String type){getActivity().runOnUiThread(()->{if(!authorized(call))return;Uri uri=FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".fileprovider",file);Intent intent=new Intent(Intent.ACTION_SEND).setType(type).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.setClipData(ClipData.newRawUri("export",uri));getActivity().startActivity(Intent.createChooser(intent,"保存或分享 / Save or share"));});}
}
