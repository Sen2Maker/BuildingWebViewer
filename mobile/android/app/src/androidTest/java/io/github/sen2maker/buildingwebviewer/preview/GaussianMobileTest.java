package io.github.sen2maker.buildingwebviewer.preview;
import android.content.Context;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.nio.*;
import java.util.concurrent.*;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class GaussianMobileTest {
 boolean js(ActivityScenario<MainActivity> s,String code)throws Exception{ArrayBlockingQueue<String> q=new ArrayBlockingQueue<>(1);s.onActivity(a->a.getBridge().getWebView().evaluateJavascript("try {"+code+"} catch(e) {String(e.stack)}",q::offer));String result=q.poll(15,TimeUnit.SECONDS);if(result==null)throw new AssertionError("WebView evaluation timed out: "+code);if(result.startsWith("\""))throw new AssertionError(result);return "true".equals(result);}
 void waitFor(ActivityScenario<MainActivity> s,String code)throws Exception{for(int i=0;i<150;i++){if(js(s,code))return;SystemClock.sleep(200);}ArrayBlockingQueue<String> q=new ArrayBlockingQueue<>(1);s.onActivity(a->a.getBridge().getWebView().evaluateJavascript("document.body.innerText",q::offer));fail(code+" STATE "+q.poll(5,TimeUnit.SECONDS));}
 @Test public void mobilePreviewPreservesFullEditsAcrossBackgroundAndReload()throws Exception{
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ProjectStore store=new ProjectStore(c);JSONObject project=store.create("Gaussian regression");String id=project.getString("id");
  File input=new File(c.getCacheDir(),"mobile-gaussian.ply");
  String[] fields={"x","y","z","f_dc_0","f_dc_1","f_dc_2","opacity","scale_0","scale_1","scale_2","rot_0","rot_1","rot_2","rot_3"};
  String header="ply\nformat binary_little_endian 1.0\nelement vertex 100000\n";for(String field:fields)header+="property float "+field+"\n";header+="end_header\n";
  ByteBuffer data=ByteBuffer.allocate(100000*56).order(ByteOrder.LITTLE_ENDIAN);for(int i=0;i<100000;i++){double z=2*(i+.5)/100000-1,r=Math.sqrt(1-z*z),a=i*2.399963;for(float v:new float[]{(float)(r*Math.cos(a)),(float)(r*Math.sin(a)),(float)z,1,0,-.4f,2,-5,-5,-5,1,0,0,0})data.putFloat(v);}
  try(FileOutputStream out=new FileOutputStream(input)){out.write(header.getBytes("UTF-8"));out.write(data.array());}project.getJSONArray("files").put(store.object(input,"mobile-gaussian.ply"));store.put(project);
  WebUpdater updates=new WebUpdater(c);String ack="announcement."+updates.bundledVersion();boolean oldAck=updates.prefs.getBoolean(ack,false);updates.prefs.edit().putBoolean(ack,true).commit();
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   waitFor(scenario,"document.readyState==='complete'&&!!document.getElementById('projects')?.children.length");
   scenario.onActivity(a->a.getBridge().getWebView().loadUrl("https://localhost/gaussian.html?project="+id+"&lang=en"));
   waitFor(scenario,"!!document.querySelector('#splat-list input[type=checkbox]')&&typeof bwvReturnToProjectHome==='function'");
   assertTrue(js(scenario,"if(document.getElementById('gs-native-readonly')?.checked)document.getElementById('gs-native-readonly').click();document.querySelector('#splat-list input[type=checkbox]').click();true"));
   waitFor(scenario,"document.getElementById('scene-stats').textContent.includes('100,000 / 100,000')&&document.getElementById('loading').hidden");
   assertTrue(js(scenario,"!document.getElementById('gs-distance-enabled').checked&&!document.getElementById('settings-panel-edit').querySelector('fieldset').disabled&&document.getElementById('error').hidden"));
   assertTrue(js(scenario,"document.querySelector('[data-open-settings=edit]').click();document.querySelector('#settings-panel-edit>button').click();true"));
   waitFor(scenario,"!document.querySelector('#settings-panel-edit fieldset').disabled&&document.getElementById('scene-stats').textContent.includes('100,000 / 100,000')");
   assertTrue(js(scenario,"Array.from(document.querySelectorAll('.gs-edit-toolbar button')).find(b=>b.textContent==='Rectangle').click();document.querySelector('[data-close-settings]').click();!document.querySelector('.gs-active-edit').hidden&&document.getElementById('scene').style.cursor==='crosshair'"));
   assertTrue(js(scenario,"document.querySelector('.gs-active-edit').click();document.getElementById('scene').style.cursor==='grab'"));
   assertTrue(js(scenario,"Array.from(document.querySelectorAll('.gs-edit-toolbar button')).find(b=>b.textContent==='Select all').click();Array.from(document.querySelectorAll('.gs-edit-toolbar button')).find(b=>b.textContent==='Hide selected').click();true"));
   assertTrue(js(scenario,"document.getElementById('gs-profile').value='balanced';document.getElementById('gs-profile').dispatchEvent(new Event('change'));true"));
   waitFor(scenario,"document.getElementById('scene-stats').textContent.includes('100,000 / 100,000')&&document.getElementById('loading').hidden");
   String previous=store.get(id).getJSONObject("states").getJSONObject("gaussian").getString("snapshotKey");
   assertTrue(js(scenario,"window.dispatchEvent(new Event('bwvPause'));true"));
   for(int i=0;i<100&&previous.equals(store.get(id).getJSONObject("states").getJSONObject("gaussian").getString("snapshotKey"));i++)SystemClock.sleep(100);
   assertNotEquals(previous,store.get(id).getJSONObject("states").getJSONObject("gaussian").getString("snapshotKey"));
   assertTrue(js(scenario,"window.__gaussianReload=true;true"));
   scenario.onActivity(a->a.getBridge().getWebView().reload());
   waitFor(scenario,"typeof window.__gaussianReload==='undefined'&&document.readyState==='complete'&&!!document.querySelector('#settings-panel-edit>button')&&document.getElementById('scene-stats').textContent.includes('100,000 / 100,000')&&document.querySelector('.mobile-save-status').textContent==='Saved'");
   assertTrue(js(scenario,"document.querySelector('#settings-panel-edit>button').click();true"));
   waitFor(scenario,"document.querySelector('.gs-edit-status').textContent.includes('Hidden 100,000')&&!document.querySelector('#settings-panel-edit fieldset').disabled");
   assertTrue(js(scenario,"document.getElementById('error').hidden"));
  }finally{new android.util.AtomicFile(store.manifest(id)).delete();input.delete();updates.prefs.edit().putBoolean(ack,oldAck).commit();}
 }
}
