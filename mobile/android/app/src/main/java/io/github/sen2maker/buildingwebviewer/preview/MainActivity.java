package io.github.sen2maker.buildingwebviewer.preview;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
  StartupDiagnostics diagnostics;
  BackNavigation backNavigation;
  public void showDiagnostics(){if(diagnostics!=null)diagnostics.show();}
  @Override protected void load(){super.load();if(bridge!=null){backNavigation=new BackNavigation(this,bridge);diagnostics.install(bridge);}}
  // startupPath reads verified local files only; network checks run after the home renders.
  @Override public void onCreate(Bundle state){diagnostics=new StartupDiagnostics(this);registerPlugin(BWVProjectsPlugin.class);String web=new WebUpdater(this).startupPath();if(web!=null)bridgeBuilder.setServerPath(new com.getcapacitor.ServerPath(com.getcapacitor.ServerPath.PathType.BASE_PATH,web));super.onCreate(state);}
  @Override public void onPause(){super.onPause();if(bridge!=null&&!diagnostics.rendererGone)bridge.getWebView().onPause();}
  @Override public void onResume(){super.onResume();if(bridge!=null&&!diagnostics.rendererGone)bridge.getWebView().onResume();}
  @Override public void onDestroy(){if(diagnostics!=null)diagnostics.dispose();super.onDestroy();}
  @Override public void onTrimMemory(int level){super.onTrimMemory(level);if(bridge!=null&&!diagnostics.rendererGone&&level>=TRIM_MEMORY_UI_HIDDEN)bridge.triggerWindowJSEvent("bwvMemoryPressure");}
}
