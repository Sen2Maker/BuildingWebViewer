package io.github.sen2maker.buildingwebviewer.preview;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle state){registerPlugin(BWVProjectsPlugin.class);String web=new WebUpdater(this).startupPath();if(web!=null)bridgeBuilder.setServerPath(new com.getcapacitor.ServerPath(com.getcapacitor.ServerPath.PathType.BASE_PATH,web));super.onCreate(state);}
  @Override public void onPause(){super.onPause();if(bridge!=null)bridge.getWebView().onPause();}
  @Override public void onResume(){super.onResume();if(bridge!=null)bridge.getWebView().onResume();}
  @Override public void onTrimMemory(int level){super.onTrimMemory(level);if(bridge!=null&&level>=TRIM_MEMORY_UI_HIDDEN)bridge.triggerWindowJSEvent("bwvMemoryPressure");}
}
