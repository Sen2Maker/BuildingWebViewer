package io.github.sen2maker.buildingwebviewer.preview;
import androidx.test.platform.app.InstrumentationRegistry;import java.io.*;import android.graphics.Bitmap;import android.content.*;import android.webkit.*;import android.os.SystemClock;import androidx.test.core.app.ActivityScenario;import androidx.test.ext.junit.runners.AndroidJUnit4;import org.junit.*;import org.junit.runner.RunWith;import java.util.concurrent.*;import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class StartupTest {
 @Test public void realActivityOpensBundledProjectsAndKeepsNativeDiagnostics()throws Exception{
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   boolean ready=false;
   for(int attempt=0;attempt<120;attempt++){
    final ArrayBlockingQueue<String> value=new ArrayBlockingQueue<>(1);
    scenario.onActivity(a->{assertEquals("https://localhost",a.getBridge().getLocalUrl());a.getBridge().getWebView().evaluateJavascript("JSON.stringify({url:location.href,home:!!document.getElementById('projects'),rendered:!!(document.getElementById('projects')&&document.getElementById('projects').children.length),native:!!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform())})",v->value.offer(v));});
    String state=value.poll(5,TimeUnit.SECONDS);if(state!=null&&state.contains("rendered\\\":true")&&state.contains("native\\\":true")){ready=true;break;}SystemClock.sleep(500);
   }
   assertTrue("Real native project home did not render",ready);
   SystemClock.sleep(1500);snapshot("startup-home.png");
   scenario.onActivity(a->{String report=a.diagnostics.report();assertTrue(report.contains("https://localhost/assets/mobile/index.html"));assertTrue(report.contains("Actual URL: https://localhost/assets/mobile/index.html"));assertEquals("",a.diagnostics.lastFailure);assertTrue(report.contains("Bundled asset OK"));a.showDiagnostics();});
   SystemClock.sleep(1500);snapshot("startup-diagnostics.png");
  }
 }
 @Test public void failedAddressProducesNativeErrorReport()throws Exception{
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   scenario.onActivity(a->a.getBridge().getWebView().loadUrl("https://localhostassets/mobile/index.html"));
   boolean captured=false;
   for(int attempt=0;attempt<60;attempt++){
    final boolean[] found={false};scenario.onActivity(a->found[0]=!a.diagnostics.lastFailure.isEmpty()&&a.diagnostics.showing);
    if(found[0]){captured=true;break;}SystemClock.sleep(500);
   }
   assertTrue("Failed main-frame load must expose native diagnostics",captured);
   scenario.onActivity(a->{String report=a.diagnostics.report();assertTrue(report.contains("WEB_ERROR main code="));assertTrue(report.contains("localhostassets"));assertFalse(report.contains("WebView below configured minimum"));});
   SystemClock.sleep(1500);snapshot("startup-error-diagnostics.png");
  }
 }
 private void snapshot(String name)throws Exception{
  Bitmap bitmap=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
  assertNotNull(bitmap);
  try(FileOutputStream out=new FileOutputStream(new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),name))){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}finally{bitmap.recycle();}
 }
}
