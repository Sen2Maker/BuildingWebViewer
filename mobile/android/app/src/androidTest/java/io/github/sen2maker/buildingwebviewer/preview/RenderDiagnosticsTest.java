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
public class RenderDiagnosticsTest {
 boolean js(ActivityScenario<MainActivity> s,String code)throws Exception{ArrayBlockingQueue<String> q=new ArrayBlockingQueue<>(1);s.onActivity(a->a.getBridge().getWebView().evaluateJavascript("try {"+code+"} catch(e) {String(e.stack)}",q::offer));String result=q.poll(15,TimeUnit.SECONDS);if(result==null)throw new AssertionError("WebView evaluation timed out: "+code);if(result.startsWith("\""))throw new AssertionError(result);return "true".equals(result);}
 void waitFor(ActivityScenario<MainActivity> s,String code)throws Exception{for(int i=0;i<150;i++){if(js(s,code))return;SystemClock.sleep(200);}ArrayBlockingQueue<String> q=new ArrayBlockingQueue<>(1);s.onActivity(a->a.getBridge().getWebView().evaluateJavascript("document.body.innerText",q::offer));fail(code+" STATE "+q.poll(5,TimeUnit.SECONDS));}
 @Test public void diagnosticReportSurvivesReturnHome()throws Exception{
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ProjectStore store=new ProjectStore(c);JSONObject project=store.create("Gaussian regression");String id=project.getString("id");
  File input=new File(c.getCacheDir(),"mobile-gaussian.ply");
  String[] fields={"x","y","z","f_dc_0","f_dc_1","f_dc_2","opacity","scale_0","scale_1","scale_2","rot_0","rot_1","rot_2","rot_3"};
  String header="ply\nformat binary_little_endian 1.0\nelement vertex 1000\n";for(String field:fields)header+="property float "+field+"\n";header+="end_header\n";
  ByteBuffer data=ByteBuffer.allocate(1000*56).order(ByteOrder.LITTLE_ENDIAN);for(int i=0;i<1000;i++){double z=2*(i+.5)/1000-1,r=Math.sqrt(1-z*z),a=i*2.399963;for(float v:new float[]{(float)(r*Math.cos(a)),(float)(r*Math.sin(a)),(float)z,1,0,-.4f,2,-5,-5,-5,1,0,0,0})data.putFloat(v);}
  try(FileOutputStream out=new FileOutputStream(input)){out.write(header.getBytes("UTF-8"));out.write(data.array());}project.getJSONArray("files").put(store.object(input,"mobile-gaussian.ply"));store.put(project);
  WebUpdater updates=new WebUpdater(c);String ack="announcement."+updates.bundledVersion();boolean oldAck=updates.prefs.getBoolean(ack,false);updates.prefs.edit().putBoolean(ack,true).commit();
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   waitFor(scenario,"document.readyState==='complete'&&!!document.getElementById('projects')?.children.length");
   scenario.onActivity(a->a.getBridge().getWebView().loadUrl("https://localhost/gaussian.html?project="+id+"&lang=en"));
   waitFor(scenario,"!!document.querySelector('#splat-list input[type=checkbox]')&&typeof bwvReturnToProjectHome==='function'");
   assertTrue(js(scenario,"document.querySelector('#splat-list input[type=checkbox]').click();true"));
   waitFor(scenario,"document.getElementById('scene-stats').textContent.includes('1,000')&&document.getElementById('loading').hidden");
   assertTrue(js(scenario,"document.getElementById('gs-diagnostics').click();true"));
   waitFor(scenario,"!!document.querySelector('#render-diagnostic-dialog textarea')");
   assertTrue(js(scenario,"window.report=JSON.parse(document.querySelector('#render-diagnostic-dialog textarea').value);report.webVersion==='1.4.3'&&report.scene.sourceSplats===1000&&report.graphics.webgl.includes('WebGL 2')&&report.native.apkVersion.length>0"));
   assertTrue(js(scenario,"Array.from(document.querySelectorAll('#render-diagnostic-dialog button')).find(b=>b.textContent==='Sample for 10 seconds').click();document.querySelector('[data-view=top]').click();true"));
   SystemClock.sleep(11000);
   assertTrue(js(scenario,"window.saved=JSON.parse(localStorage.getItem('bwv-render-diagnostic-v1'));saved.measurement.durationMs>=9000&&saved.measurement.cpuDrawSubmission.samples>0"));
   assertTrue(js(scenario,"window.bwvReturnToProjectHome();true"));
   waitFor(scenario,"!!document.getElementById('show-diagnostics')");
   assertTrue(js(scenario,"document.getElementById('show-diagnostics').click();true"));
   waitFor(scenario,"!!document.querySelector('#render-diagnostic-dialog textarea')");
   assertTrue(js(scenario,"JSON.parse(document.querySelector('#render-diagnostic-dialog textarea').value).scene.sourceSplats===1000"));
  }finally{new android.util.AtomicFile(store.manifest(id)).delete();input.delete();updates.prefs.edit().putBoolean(ack,oldAck).commit();}
 }
}
