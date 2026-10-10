package io.github.sen2maker.buildingwebviewer.preview;
import java.net.URI;
/** Keep URLs useful for routing failures without retaining project IDs or query tokens. */
final class DiagnosticText {
  static String url(String value){try{URI u=new URI(value);String scheme=u.getScheme();if(!"https".equals(scheme)&&!"http".equals(scheme))return scheme==null?"[invalid URL]":scheme+":[redacted]";String path=u.getPath();if(path==null)path="";if(!path.matches("/(?:assets/(?:js|css|mobile)/[A-Za-z0-9_./-]+|mobile/index.html|index.html|lod.html|wireframe.html|pointcloud.html)?"))path="/[path redacted]";return scheme+"://"+u.getHost()+(u.getPort()<0?"":":"+u.getPort())+path;}catch(Exception ignored){return "[invalid URL]";}}
  static String message(String text){if(text==null)return "";text=text.replaceAll("[\\r\\n]+"," ").replaceAll("(?i)(https?://[^\\s?#]+)[?#][^\\s]*","$1?[redacted]");return text.length()>600?text.substring(0,600)+"…":text;}
}
