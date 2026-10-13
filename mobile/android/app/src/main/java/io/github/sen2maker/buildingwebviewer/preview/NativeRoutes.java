package io.github.sen2maker.buildingwebviewer.preview;
import java.net.URI;
/** App navigation cannot enter the browser-only tool hub. Queries never affect the route. */
final class NativeRoutes {
  static boolean isWebHub(String address,String origin){
    try{URI target=new URI(address),local=new URI(origin);String path=target.getPath();
      return local.getScheme().equals(target.getScheme())&&local.getAuthority().equals(target.getAuthority())&&
        (path==null||path.isEmpty()||path.equals("/")||path.equals("/index.html"));
    }catch(Exception ignored){return false;}
  }
  static String lifecycle(String name){
    if(!name.matches("bwv(?:Pause|Resume|MemoryPressure)"))throw new IllegalArgumentException("Unknown lifecycle event");
    return "(function(){if(window.Capacitor&&document.readyState!=='loading'){window.dispatchEvent(new Event('"+name+"'));}})()";
  }
}
