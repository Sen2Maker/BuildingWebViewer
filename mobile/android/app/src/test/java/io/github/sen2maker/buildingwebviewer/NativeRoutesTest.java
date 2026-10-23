package io.github.sen2maker.buildingwebviewer;
import org.junit.Test;import static org.junit.Assert.*;
public class NativeRoutesTest {
 @Test public void onlyBrowserHubIsRedirected(){assertTrue(NativeRoutes.isWebHub("https://localhost/index.html?lang=en","https://localhost"));assertTrue(NativeRoutes.isWebHub("https://localhost/","https://localhost"));assertFalse(NativeRoutes.isWebHub("https://localhost/assets/mobile/index.html","https://localhost"));assertFalse(NativeRoutes.isWebHub("https://localhost/gaussian.html?project=id","https://localhost"));assertFalse(NativeRoutes.isWebHub("https://other/index.html","https://localhost"));}
 @Test public void lifecycleNeverCallsUninitializedCapacitorMethod(){String js=NativeRoutes.lifecycle("bwvResume");assertTrue(js.contains("window.Capacitor&&"));assertFalse(js.contains("triggerEvent"));try{NativeRoutes.lifecycle("injected'");fail();}catch(IllegalArgumentException expected){}}
}
