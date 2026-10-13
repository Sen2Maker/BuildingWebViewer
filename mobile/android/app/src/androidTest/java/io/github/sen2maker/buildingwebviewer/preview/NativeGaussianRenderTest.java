package io.github.sen2maker.buildingwebviewer.preview;
import android.content.*;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.opengl.GLES30;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.*;
import java.util.concurrent.*;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class NativeGaussianRenderTest {
 @Test public void fullNativeSceneCaptureSortAndDiagnostic()throws Exception {
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ProjectStore store=new ProjectStore(c);JSONObject project=store.create("Native render regression");String id=project.getString("id");File f=new File(c.getCacheDir(),"native-regression.ply");
  String[] fields={"x","y","z","f_dc_0","f_dc_1","f_dc_2","opacity","scale_0","scale_1","scale_2","rot_0","rot_1","rot_2","rot_3"};String head="ply\nformat binary_little_endian 1.0\nelement vertex 1000\n";for(String field:fields)head+="property float "+field+"\n";for(int i=0;i<45;i++)head+="property float f_rest_"+i+"\n";head+="end_header\n";
  ByteBuffer bytes=ByteBuffer.allocate(1000*59*4).order(ByteOrder.LITTLE_ENDIAN);for(int i=0;i<1000;i++){double z=2*(i+.5)/1000-1,r=Math.sqrt(1-z*z),angle=i*2.399963;for(float v:new float[]{(float)(r*Math.cos(angle)),(float)(r*Math.sin(angle)),(float)z,1,0,-.4f,2,-3,-3,-3,1,0,0,0})bytes.putFloat(v);for(int j=0;j<45;j++)bytes.putFloat(0);}
  try(OutputStream out=new FileOutputStream(f)){out.write(head.getBytes("US-ASCII"));out.write(bytes.array());}JSONObject record=store.object(f,"native-regression.ply");project.getJSONArray("files").put(record);store.put(project);JSONArray keys=new JSONArray().put(record.getString("key"));
  Intent intent=new Intent(c,NativeGaussianActivity.class).putExtra("project",id).putExtra("keys",keys.toString()).putExtra("lang","en");
  try(ActivityScenario<NativeGaussianActivity> scene=ActivityScenario.launch(intent)){
   boolean ready=false;for(int i=0;i<200;i++){ArrayBlockingQueue<Boolean> q=new ArrayBlockingQueue<>(1);scene.onActivity(a->q.offer(a.renderer.ready));if(q.poll(2,TimeUnit.SECONDS)){ready=true;break;}SystemClock.sleep(100);}assertTrue("Native source should render",ready);
   ArrayBlockingQueue<Bitmap> images=new ArrayBlockingQueue<>(1);scene.onActivity(a->a.renderer.capture(images::offer));Bitmap image=images.poll(20,TimeUnit.SECONDS);assertNotNull("Screenshot callback",image);int colored=0;for(int y=0;y<image.getHeight();y+=5)for(int x=0;x<image.getWidth();x+=5)if((image.getPixel(x,y)&0xffffff)!=0)colored++;assertTrue("Actual Gaussian pixels",colored>20);try(OutputStream out=new FileOutputStream(new File(c.getCacheDir(),"native-gaussian-test.png"))){image.compress(Bitmap.CompressFormat.PNG,100,out);}image.recycle();
   Bitmap ui=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();try(OutputStream out=new FileOutputStream(new File(c.getCacheDir(),"native-gaussian-ui.png"))){ui.compress(Bitmap.CompressFormat.PNG,100,out);}ui.recycle();
   ArrayBlockingQueue<Integer> errors=new ArrayBlockingQueue<>(1);scene.onActivity(a->a.surface.queueEvent(()->errors.offer(GLES30.glGetError())));assertEquals(0,(int)errors.poll(5,TimeUnit.SECONDS));
   scene.onActivity(a->a.renderer.sample(true));SystemClock.sleep(11000);ArrayBlockingQueue<JSONObject> reports=new ArrayBlockingQueue<>(1);scene.onActivity(a->reports.offer(a.lastReport));JSONObject report=reports.poll(5,TimeUnit.SECONDS);assertNotNull(report);assertEquals(1000,report.getInt("submittedSplats"));assertEquals(1000,report.getInt("sourceSplats"));assertTrue(report.getInt("drawnFrames")>2);assertTrue("Azimuth orbit must change the view",Math.abs(report.getDouble("orbitDegrees"))>190);assertTrue("Non-pole orbit must refresh depth order",report.getInt("appliedSorts")>10);assertEquals("automatic-orbit",report.getString("sampleMode"));assertFalse(report.toString().contains("native-regression.ply"));
   try{NativeGaussianActivity.authorizedFiles(store,id,new JSONArray().put("0".repeat(64)));fail("Unowned file rejected");}catch(IOException expected){}
  }finally{new android.util.AtomicFile(store.manifest(id)).delete();f.delete();}
 }
 @Test public void projectButtonOpensNativeAndReturnsWithSelection()throws Exception{
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ProjectStore store=new ProjectStore(c);JSONObject project=store.create("Native bridge regression");String id=project.getString("id");File f=new File(c.getCacheDir(),"native-bridge.ply");
  String head="ply\nformat binary_little_endian 1.0\nelement vertex 1\n";for(String field:new String[]{"x","y","z","f_dc_0","f_dc_1","f_dc_2","opacity","scale_0","scale_1","scale_2","rot_0","rot_1","rot_2","rot_3"})head+="property float "+field+"\n";try(OutputStream out=new FileOutputStream(f)){out.write((head+"end_header\n").getBytes("US-ASCII"));ByteBuffer row=ByteBuffer.allocate(56).order(ByteOrder.LITTLE_ENDIAN);for(float v:new float[]{0,0,0,1,0,0,2,-2,-2,-2,1,0,0,0})row.putFloat(v);out.write(row.array());}project.getJSONArray("files").put(store.object(f,"native-bridge.ply"));store.put(project);
  WebUpdater updater=new WebUpdater(c);String ack="announcement."+updater.bundledVersion();boolean oldAck=updater.prefs.getBoolean(ack,false);updater.prefs.edit().putBoolean(ack,true).commit();WebViewTestHelper helper=new WebViewTestHelper();
  try(ActivityScenario<MainActivity> scene=ActivityScenario.launch(MainActivity.class)){
   helper.waitFor(scene,"document.readyState==='complete'&&!!document.getElementById('projects')");
   android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();android.app.Instrumentation.ActivityMonitor monitor=instrumentation.addMonitor(NativeGaussianActivity.class.getName(),null,false);
   assertTrue(helper.js(scene,"Array.from(document.querySelectorAll('#projects article')).find(a=>a.querySelector('h2').textContent==='Native bridge regression').querySelectorAll('.mobile-tools button')[3].click();true"));
   NativeGaussianActivity nativeView=(NativeGaussianActivity)instrumentation.waitForMonitorWithTimeout(monitor,10000);assertNotNull(nativeView);instrumentation.removeMonitor(monitor);for(int i=0;i<100&&!nativeView.renderer.ready;i++)SystemClock.sleep(100);assertTrue(nativeView.renderer.ready);instrumentation.runOnMainSync(nativeView::finish);
   helper.waitFor(scene,"!!document.getElementById('projects')&&document.readyState==='complete'");
   for(int i=0;i<100&&!store.get(id).getJSONObject("states").has("gaussian-native");i++)SystemClock.sleep(50);assertEquals(1,store.get(id).getJSONObject("states").getJSONObject("gaussian-native").getJSONArray("selected").length());
  }finally{new android.util.AtomicFile(store.manifest(id)).delete();f.delete();updater.prefs.edit().putBoolean(ack,oldAck).commit();}
 }

}
