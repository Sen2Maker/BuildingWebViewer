package io.github.sen2maker.buildingwebviewer;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
  StartupDiagnostics diagnostics;
  ProcessRuntime runtime;
  private boolean runtimeReady,recovering;
  private MainActivityOperations operations;
  private static final String OPERATION_STATE_KEY="bwv.native.pendingOperationKey";
  private static final String OPERATION_COUNT_KEY="bwv.native.restoredOperationCount";
  private void recovery(){if(recovering)return;recovering=true;invalidateOperations();if(bridge!=null)com.getcapacitor.BwvBridgeCallGuard.destroyed(bridge.getWebView());startActivity(new android.content.Intent(this,RecoveryActivity.class));finish();}
  BackNavigation backNavigation;
  public void showDiagnostics(){if(diagnostics!=null)diagnostics.show();}
  @Override protected void load(){
    if(!runtimeReady)return;
    super.load();
    if(bridge==null){recovery();return;}
    runtime.assertBound();
    if(!"public".equals(bridge.getServerBasePath())||!bridge.isMinimumWebViewInstalled()){recovery();return;}
    backNavigation=new BackNavigation(this,bridge);diagnostics.install(bridge);
  }
  @Override public void onCreate(Bundle state){
    diagnostics=new StartupDiagnostics(this);
    try{runtime=((BwvApplication)getApplication()).runtime();runtimeReady=runtime!=null;}catch(RuntimeException failed){runtimeReady=false;}
    if(runtimeReady){if(!BuildConfig.NATIVE_COMPILE_FIXTURE)registerPlugin(BWVProjectsPlugin.class);if(BuildConfig.DIAGNOSTIC_ENABLED)registerPlugin(BWVSelfTestPlugin.class);bridgeBuilder.setServerPath(runtime.serverPath());}
    try{super.onCreate(state);}catch(RuntimeException failed){diagnostics.record("BRIDGE_FAILURE",failed.getClass().getSimpleName());recovery();return;}
    try{initializeOperations(state);}catch(RuntimeException failed){diagnostics.record("OPERATION_RESTORE_FAILURE",failed.getClass().getSimpleName());recovery();return;}
    if(!runtimeReady||bridge==null)recovery();
  }
  private void initializeOperations(Bundle state){
    String key=state==null?null:state.getString(OPERATION_STATE_KEY);
    String count="0";
    if(state!=null){
      count=state.getString(OPERATION_COUNT_KEY);
      if(count==null||!count.matches("(?:0|[1-9]|1[0-6])"))throw new IllegalStateException("INVALID_OPERATION_RESTORE_COUNT");
    }
    operations=new MainActivityOperations(getActivityResultRegistry(),Integer.parseInt(count));
    operations.restore(key);
  }
  void launchOperation(MainActivityOperations.Kind kind,android.content.Intent intent,MainActivityOperations.Owner owner){
    if(operations==null||recovering||isFinishing()||isDestroyed())throw new IllegalStateException("SYSTEM_ACTIVITY_UNAVAILABLE");
    try{operations.launch(kind,intent,owner);}catch(MainActivityOperations.LaunchFailure uncertain){diagnostics.record("SYSTEM_ACTIVITY_LAUNCH_UNCERTAIN","Original operation remains quarantined; no automatic retry");recovery();throw uncertain;}
  }
  void invalidateOperations(){if(operations!=null)operations.invalidate();}
  private void saveOperations(Bundle state){if(operations!=null){state.putString(OPERATION_STATE_KEY,operations.savedKey());state.putString(OPERATION_COUNT_KEY,Integer.toString(operations.restoredCount()));}}
  private void closeOperations(){if(operations!=null)operations.close();}
  @Override public void onSaveInstanceState(Bundle state){saveOperations(state);super.onSaveInstanceState(state);}
  @Override public void onPause(){super.onPause();if(bridge!=null&&!diagnostics.rendererGone)bridge.getWebView().onPause();}
  @Override public void onResume(){super.onResume();if(bridge!=null&&!diagnostics.rendererGone)bridge.getWebView().onResume();}
  void documentStarted(String url){
    invalidateOperations();
    if(bridge==null)return;
    com.getcapacitor.BwvBridgeCallGuard.documentStarted(bridge.getWebView(),url);
    com.getcapacitor.PluginHandle projects=bridge.getPlugin("BWVProjects");if(projects!=null&&projects.getInstance() instanceof BWVProjectsPlugin)((BWVProjectsPlugin)projects.getInstance()).documentStarted();
    com.getcapacitor.PluginHandle tests=bridge.getPlugin("BWVSelfTest");if(tests!=null&&tests.getInstance() instanceof BWVSelfTestPlugin)((BWVSelfTestPlugin)tests.getInstance()).documentStarted();
  }
  @Override public void onDestroy(){closeOperations();if(bridge!=null)com.getcapacitor.BwvBridgeCallGuard.destroyed(bridge.getWebView());if(diagnostics!=null)diagnostics.dispose();super.onDestroy();}
  @Override public void onTrimMemory(int level){super.onTrimMemory(level);if(bridge!=null&&!diagnostics.rendererGone&&level>=TRIM_MEMORY_UI_HIDDEN)bridge.getWebView().evaluateJavascript(NativeRoutes.lifecycle("bwvMemoryPressure"),null);}
}
