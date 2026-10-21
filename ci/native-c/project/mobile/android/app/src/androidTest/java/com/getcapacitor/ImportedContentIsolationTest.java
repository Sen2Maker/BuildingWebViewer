package com.getcapacitor;

import android.content.Context;
import android.net.Uri;
import android.os.SystemClock;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import androidx.core.content.FileProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.annotation.CapacitorPlugin;
import io.github.sen2maker.buildingwebviewer.MainActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Source-only until compiled and run on an explicitly authorized test device. No project mutations. */
@RunWith(AndroidJUnit4.class)
public final class ImportedContentIsolationTest {
    @CapacitorPlugin(name="BwvSecurityProbe")
    public static final class ProbePlugin extends Plugin {
        static final AtomicInteger HITS = new AtomicInteger();
        @PluginMethod public void hit(PluginCall call) { HITS.incrementAndGet(); call.resolve(); }
    }
    private static final String ATTACK = "(function(){var m=JSON.stringify({callbackId:'-1',pluginId:'BwvSecurityProbe',methodName:'hit',options:{}});"+
        "try{androidBridge.postMessage(m)}catch(e){}try{parent.androidBridge.postMessage(m)}catch(e){}"+
        "try{parent.Capacitor.nativePromise('BwvSecurityProbe','hit',{})}catch(e){}})();";

    @Test public void adapterProtectsNormalRangeHeadErrorAndContentProviderResponses() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        File folder=new File(context.getCacheDir(),"exports/bwv-content-security-test");
        assertTrue(folder.isDirectory()||folder.mkdirs());
        File file=new File(folder,"attack.html"); write(file,"<!doctype html><script>"+ATTACK+"</script>");
        try {
            BwvDataOnlyAssetServer server=new BwvDataOnlyAssetServer(context);
            String[] routes=routes(context,file,"https://localhost");
            for(String route:routes) {
                WebResourceResponse normal=server.intercept(new Request(route,"GET",false,Collections.emptyMap()));
                assertProtected(normal); assertEquals(200,normal.getStatusCode()); assertEquals("application/octet-stream",normal.getMimeType());
                assertTrue(read(normal).contains(ATTACK));
                WebResourceResponse range=server.intercept(new Request(route,"GET",false,headers("Range","bytes=0-3")));
                assertProtected(range);
                if(range.getStatusCode()==206) assertEquals("<!do",read(range));
                else { assertEquals(200,range.getStatusCode()); assertTrue(read(range).startsWith("<!doctype")); }
                for(Map<String,String> destination:java.util.Arrays.asList(headers("Sec-Fetch-Dest","iframe"),headers("Sec-Fetch-Dest","script"),headers("Sec-Fetch-Mode","navigate"))) {
                    WebResourceResponse denied=server.intercept(new Request(route,"GET",false,destination));
                    assertProtected(denied);assertEquals(403,denied.getStatusCode());assertEquals("",read(denied));
                }
                WebResourceResponse navigation=server.intercept(new Request(route,"GET",true,headers("Range","bytes=0-")));
                assertProtected(navigation);assertEquals(403,navigation.getStatusCode());
                WebResourceResponse badRange=server.intercept(new Request(route,"GET",false,headers("Range","bytes=2-1")));
                assertProtected(badRange);assertEquals(416,badRange.getStatusCode());
                WebResourceResponse head=server.intercept(new Request(route,"HEAD",false,Collections.emptyMap()));
                assertProtected(head);assertEquals(200,head.getStatusCode());assertEquals("",read(head));
            }
        } finally { assertTrue(file.delete()); assertTrue(folder.delete()); }
    }

    @Test public void importedHtmlSvgAndJavaScriptCannotCallActualCapacitorProbePlugin() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        io.github.sen2maker.buildingwebviewer.RuntimeTestGate.awaitVerifiedBundle();
        File folder=new File(context.getCacheDir(),"exports/bwv-content-security-test-browser");
        assertTrue(folder.isDirectory()||folder.mkdirs());
        File html=new File(folder,"attack.html"),svg=new File(folder,"attack.svg"),js=new File(folder,"attack.js");
        write(html,"<!doctype html><html><script>"+ATTACK+"</script></html>");
        write(svg,"<svg xmlns='http://www.w3.org/2000/svg'><script><![CDATA["+ATTACK+"]]></script></svg>");
        write(js,ATTACK);
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<Bridge> holder=new AtomicReference<>();
            scenario.onActivity(activity->{assertNotNull(activity.getBridge());holder.set(activity.getBridge());activity.getBridge().registerPlugin(ProbePlugin.class);});
            Bridge bridge=holder.get();
            waitFor(bridge,"!!window.androidBridge && !!window.Capacitor",10000);
            ProbePlugin.HITS.set(0);
            evaluate(bridge,"androidBridge.postMessage(JSON.stringify({callbackId:'-1',pluginId:'BwvSecurityProbe',methodName:'hit',options:{}}));true");
            long deadline=SystemClock.elapsedRealtime()+5000;
            while(ProbePlugin.HITS.get()==0&&SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(25);
            assertEquals("Positive control must reach actual Capacitor plugin",1,ProbePlugin.HITS.get());
            String base=Uri.parse(bridge.getLocalUrl()).buildUpon().path(null).clearQuery().fragment(null).build().toString();
            JSONArray files=new JSONArray();
            for(File file:new File[]{html,svg,js})for(String route:routes(context,file,base))files.put(route);
            String matrix="window.__bwvContentSecurityDone=false;(async()=>{const urls="+files+";for(const url of urls){"+
                "for(const tag of ['iframe','object','embed','script']){const node=document.createElement(tag);if(tag==='object')node.data=url;else node.src=url;document.body.appendChild(node);}"+
                "const module=document.createElement('script');module.type='module';module.src=url;document.body.appendChild(module);"+
                "try{const worker=new Worker(url);worker.onerror=()=>worker.terminate();setTimeout(()=>worker.terminate(),500)}catch(e){}"+
                "const response=await fetch(url,{headers:{Range:'bytes=0-'}});const text=await response.text();"+
                "if(!response.ok||!text.includes('BwvSecurityProbe'))throw Error('raw byte read failed');}"+
                "await new Promise(r=>setTimeout(r,1500));window.__bwvContentSecurityDone=true;})().catch(e=>{window.__bwvContentSecurityError=String(e)});true";
            evaluate(bridge,matrix);
            waitFor(bridge,"window.__bwvContentSecurityDone===true",15000);
            assertEquals("Imported script must not reach same-origin native probe",1,ProbePlugin.HITS.get());
            String trusted=evaluate(bridge,"location.href");
            evaluate(bridge,"location.href="+JSONObject.quote(routes(context,html,base)[0])+";true");
            SystemClock.sleep(500);
            assertEquals("Reserved navigation is cancelled",trusted,evaluate(bridge,"location.href"));
            assertEquals(1,ProbePlugin.HITS.get());
        } finally { assertTrue(html.delete());assertTrue(svg.delete());assertTrue(js.delete());assertTrue(folder.delete()); }
    }

    private static String[] routes(Context context,File file,String base) {
        String fileRoute=Uri.parse(base).buildUpon().path(BwvDataOnlyRoutes.FILE+file.getAbsolutePath()).build().toString();
        Uri content=FileProvider.getUriForFile(context,context.getPackageName()+".fileprovider",file);
        String contentRoute=base+BwvDataOnlyRoutes.CONTENT+"/"+content.toString().substring("content://".length());
        return new String[]{fileRoute,contentRoute};
    }
    private static void write(File file,String value)throws Exception {try(FileOutputStream out=new FileOutputStream(file)){out.write(value.getBytes(StandardCharsets.UTF_8));}}
    private static String read(WebResourceResponse response)throws Exception {try(InputStream in=response.getData()){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int count;while((count=in.read(buffer))!=-1)out.write(buffer,0,count);return new String(out.toByteArray(),StandardCharsets.UTF_8);}}
    private static Map<String,String> headers(String key,String value){Map<String,String> result=new HashMap<>();result.put(key,value);return result;}
    private static void assertProtected(WebResourceResponse response){assertEquals("nosniff",response.getResponseHeaders().get("X-Content-Type-Options"));assertEquals(BwvDataOnlyRoutes.CSP,response.getResponseHeaders().get("Content-Security-Policy"));}
    private static String evaluate(Bridge bridge,String script)throws Exception {
        AtomicReference<String> value=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->bridge.getWebView().evaluateJavascript(script,result->{value.set(result);done.countDown();}));
        assertTrue("JavaScript callback timed out",done.await(5,TimeUnit.SECONDS));return value.get();
    }
    private static void waitFor(Bridge bridge,String predicate,long timeout)throws Exception {
        long deadline=SystemClock.elapsedRealtime()+timeout;
        while(SystemClock.elapsedRealtime()<deadline){if("true".equals(evaluate(bridge,predicate)))return;SystemClock.sleep(50);}
        fail("WebView condition not reached: "+predicate+"; "+evaluate(bridge,"window.__bwvContentSecurityError||''"));
    }
    private static final class Request implements WebResourceRequest {
        final Uri uri;final String method;final boolean main;final Map<String,String> headers;
        Request(String url,String method,boolean main,Map<String,String> headers){this.uri=Uri.parse(url);this.method=method;this.main=main;this.headers=headers;}
        @Override public Uri getUrl(){return uri;}
        @Override public boolean isForMainFrame(){return main;}
        @Override public boolean isRedirect(){return false;}
        @Override public boolean hasGesture(){return false;}
        @Override public String getMethod(){return method;}
        @Override public Map<String,String> getRequestHeaders(){return headers;}
    }
}
