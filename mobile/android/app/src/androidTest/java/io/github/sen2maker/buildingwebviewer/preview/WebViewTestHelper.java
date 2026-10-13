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
public class WebViewTestHelper {
 boolean js(ActivityScenario<MainActivity> s,String code)throws Exception{ArrayBlockingQueue<String> q=new ArrayBlockingQueue<>(1);s.onActivity(a->a.getBridge().getWebView().evaluateJavascript("try {"+code+"} catch(e) {String(e.stack)}",q::offer));String result=q.poll(15,TimeUnit.SECONDS);if(result==null)throw new AssertionError("WebView evaluation timed out: "+code);if(result.startsWith("\""))throw new AssertionError(result);return "true".equals(result);}
 void waitFor(ActivityScenario<MainActivity> s,String code)throws Exception{for(int i=0;i<150;i++){if(js(s,code))return;SystemClock.sleep(200);}ArrayBlockingQueue<String> q=new ArrayBlockingQueue<>(1);s.onActivity(a->a.getBridge().getWebView().evaluateJavascript("document.body.innerText",q::offer));fail(code+" STATE "+q.poll(5,TimeUnit.SECONDS));}

}
