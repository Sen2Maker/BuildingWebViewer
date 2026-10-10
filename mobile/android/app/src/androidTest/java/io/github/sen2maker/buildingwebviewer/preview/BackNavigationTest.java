package io.github.sen2maker.buildingwebviewer.preview;

import android.content.Context;
import android.os.SystemClock;
import android.view.KeyEvent;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class BackNavigationTest {
  private void back(){InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);}
  private boolean js(ActivityScenario<MainActivity> scenario,String script)throws Exception{
    ArrayBlockingQueue<String> result=new ArrayBlockingQueue<>(1);
    scenario.onActivity(a->a.getBridge().getWebView().evaluateJavascript(script,result::offer));
    return "true".equals(result.poll(5,TimeUnit.SECONDS));
  }
  private void waitFor(ActivityScenario<MainActivity> scenario,String script)throws Exception{
    for(int i=0;i<120;i++){if(js(scenario,script))return;SystemClock.sleep(500);}fail("Timed out: "+script);
  }
  @Test public void allViewersReturnToProjectHomeAndHomeLeavesActivity()throws Exception{
    Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();ProjectStore store=new ProjectStore(context);
    String id=store.create("Back regression").getString("id");
    try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
      waitFor(scenario,"!!(document.getElementById('projects')&&document.getElementById('projects').children.length)");
      for(String tool:new String[]{"pointcloud","wireframe","lod"}){
        scenario.onActivity(a->a.getBridge().getWebView().loadUrl("https://localhost/"+tool+".html?project="+id+"&lang=en"));
        waitFor(scenario,"typeof window.bwvReturnToProjectHome==='function' && !!document.querySelector('.mobile-save-status') && document.querySelector('.mobile-save-status').textContent==='Saved'");
        assertTrue(store.get(id).getJSONObject("states").has(tool));
        back();
        waitFor(scenario,"location.pathname==='/assets/mobile/index.html' && document.documentElement.lang==='en' && !!(document.getElementById('projects')&&document.getElementById('projects').children.length)");
      }
      // Native dialogs consume Back before Activity navigation.
      scenario.onActivity(MainActivity::showDiagnostics);SystemClock.sleep(500);back();
      scenario.onActivity(a->{assertFalse(a.diagnostics.showing);assertFalse(a.isFinishing());});
      back();
      for(int i=0;i<40&&scenario.getState()==Lifecycle.State.RESUMED;i++)SystemClock.sleep(250);
      assertNotEquals("Home Back must leave foreground rather than replay a viewer",Lifecycle.State.RESUMED,scenario.getState());
    }finally{new android.util.AtomicFile(store.manifest(id)).delete();}
  }
}
