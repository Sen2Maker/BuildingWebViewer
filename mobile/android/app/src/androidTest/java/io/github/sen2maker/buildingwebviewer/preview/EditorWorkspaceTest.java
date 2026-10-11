package io.github.sen2maker.buildingwebviewer.preview;
import android.content.Context;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.util.concurrent.*;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class EditorWorkspaceTest {
 boolean js(ActivityScenario<MainActivity> s,String code)throws Exception{ArrayBlockingQueue<String> q=new ArrayBlockingQueue<>(1);s.onActivity(a->a.getBridge().getWebView().evaluateJavascript(code,q::offer));return "true".equals(q.poll(5,TimeUnit.SECONDS));}
 void waitFor(ActivityScenario<MainActivity> s,String code)throws Exception{for(int i=0;i<100;i++){if(js(s,code))return;SystemClock.sleep(300);}ArrayBlockingQueue<String> q=new ArrayBlockingQueue<>(1);s.onActivity(a->a.getBridge().getWebView().evaluateJavascript("JSON.stringify({url:location.href,body:document.body.innerText})",q::offer));fail("Timed out: "+code+" STATE "+q.poll(5,TimeUnit.SECONDS));}
 @Test public void studioEditsSurviveNativeReloadWithAttributes()throws Exception{
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ProjectStore store=new ProjectStore(c);JSONObject p=store.create("Studio regression");String id=p.getString("id");
  File input=new File(c.getCacheDir(),"studio-native-fixture.txt");try(FileOutputStream out=new FileOutputStream(input)){out.write("x y z intensity\n0 0 0 10\n1 0 0 20\n0 1 0 30\n".getBytes("UTF-8"));}p.getJSONArray("files").put(store.object(input,"cloud.txt"));store.put(p);
  WebUpdater updates=new WebUpdater(c);String ack="announcement."+updates.bundledVersion();boolean oldAck=updates.prefs.getBoolean(ack,false);updates.prefs.edit().putBoolean(ack,true).commit();
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   waitFor(scenario,"document.readyState==='complete'&&!!document.getElementById('projects')?.children.length");
   scenario.onActivity(a->a.getBridge().getWebView().loadUrl("https://localhost/generate.html?project="+id+"&lang=en"));
   waitFor(scenario,"!!document.getElementById('scene-stats')&&document.getElementById('scene-stats').textContent.includes('3 points')&&document.querySelector('.mobile-save-status')?.textContent==='Saved'");
   String initialSnapshot=store.get(id).getJSONObject("states").getJSONObject("generate").getString("snapshotKey");
   assertTrue(js(scenario,"document.querySelector('[data-workflow=edit]').click();document.getElementById('edit-all').click();document.getElementById('edit-delete').click();true"));
   waitFor(scenario,"document.getElementById('scene-stats').textContent.includes('0 points')");
   SystemClock.sleep(1500);
   assertEquals("Edits must not save after each interaction",initialSnapshot,store.get(id).getJSONObject("states").getJSONObject("generate").getString("snapshotKey"));
   assertTrue(js(scenario,"window.dispatchEvent(new Event('bwvPause'));true"));
   for(int i=0;i<100&&initialSnapshot.equals(store.get(id).getJSONObject("states").getJSONObject("generate").getString("snapshotKey"));i++)SystemClock.sleep(100);
   String savedSnapshot=store.get(id).getJSONObject("states").getJSONObject("generate").getString("snapshotKey");assertNotEquals(initialSnapshot,savedSnapshot);
   assertTrue(js(scenario,"window.dispatchEvent(new Event('bwvResume'));true"));
   assertTrue(js(scenario,"window.__reloadMarker=true;true"));
   scenario.onActivity(a->a.getBridge().getWebView().reload());
   waitFor(scenario,"typeof window.__reloadMarker==='undefined'&&document.readyState==='complete'");
   waitFor(scenario,"!!document.getElementById('scene-stats')&&document.getElementById('scene-stats').textContent.includes('0 points')&&document.querySelector('.mobile-save-status')?.textContent==='Saved'");
   assertEquals("Reopening must not rewrite snapshot",savedSnapshot,store.get(id).getJSONObject("states").getJSONObject("generate").getString("snapshotKey"));
   assertTrue(js(scenario,"document.getElementById('editor-properties').textContent.includes('intensity')"));
   assertTrue(js(scenario,"Array.from(document.getElementById('editor-properties').querySelectorAll('button')).find(b=>b.textContent==='Restore deleted points').click();true"));
   waitFor(scenario,"document.getElementById('scene-stats').textContent.includes('3 points')");
   InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);
   waitFor(scenario,"location.pathname==='/assets/mobile/index.html'&&!!document.getElementById('projects')?.children.length");
   assertNotEquals("Back must save the restored points",savedSnapshot,store.get(id).getJSONObject("states").getJSONObject("generate").getString("snapshotKey"));
   assertTrue(js(scenario,"document.querySelector('.mobile-footer-links a').textContent==='Sen2Maker'&&!document.querySelector('.mobile-more').open&&!document.querySelector('.project-management').open&&document.documentElement.scrollWidth<=innerWidth"));
   android.graphics.Bitmap screenshot=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
   try(FileOutputStream output=new FileOutputStream(new File(c.getFilesDir(),"mobile-home-141.png"))){screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,output);}finally{screenshot.recycle();}
   assertTrue(js(scenario,"window.scrollTo(0,document.body.scrollHeight);true"));SystemClock.sleep(300);
   screenshot=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
   try(FileOutputStream output=new FileOutputStream(new File(c.getFilesDir(),"mobile-home-footer-141.png"))){screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,output);}finally{screenshot.recycle();}
   assertEquals(2,store.get(id).getJSONArray("files").length());
  }finally{new android.util.AtomicFile(store.manifest(id)).delete();input.delete();updates.prefs.edit().putBoolean(ack,oldAck).commit();}
 }
}
