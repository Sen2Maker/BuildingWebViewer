package io.github.sen2maker.buildingwebviewer;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
  StartupDiagnostics diagnostics;
  ProcessRuntime runtime;
  private boolean runtimeReady;
  private void recovery(){startActivity(new android.content.Intent(this,RecoveryActivity.class));finish();}
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
    if(!runtimeReady||bridge==null)recovery();
  }
  @Override public void onPause(){super.onPause();if(bridge!=null&&!diagnostics.rendererGone)bridge.getWebView().onPause();}
  @Override public void onResume(){super.onResume();if(bridge!=null&&!diagnostics.rendererGone)bridge.getWebView().onResume();}
  @Override public void onDestroy(){if(diagnostics!=null)diagnostics.dispose();super.onDestroy();}
  @Override public void onTrimMemory(int level){super.onTrimMemory(level);if(bridge!=null&&!diagnostics.rendererGone&&level>=TRIM_MEMORY_UI_HIDDEN)bridge.getWebView().evaluateJavascript(NativeRoutes.lifecycle("bwvMemoryPressure"),null);}
}
