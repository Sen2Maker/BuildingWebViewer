package io.github.sen2maker.buildingwebviewer.preview;
import org.json.*;
/** Native camera files use absolute source coordinates; they contain no model data. */
final class NativeGaussianCamera {
 static JSONObject encode(NativeGaussianRenderer.Camera c,double[] origin)throws JSONException{
  JSONArray target=new JSONArray(),eye=new JSONArray();for(int a=0;a<3;a++){target.put(c.target[a]+origin[a]);eye.put(NativeGaussianRenderer.eye(c)[a]+origin[a]);}
  return new JSONObject().put("schema",1).put("space","raw-world").put("elevation",c.elevation).put("azimuth",c.azimuth).put("roll",c.roll).put("zoom",c.zoom).put("magnification",c.magnification).put("panX",c.panX).put("panY",c.panY).put("baseHeight",c.baseHeight).put("distance",c.distance).put("near",c.near).put("perspective",c.perspective).put("target",target).put("eye",eye).put("flying",c.flyEye!=null);
 }
 static float number(JSONObject o,String key,float lo,float hi)throws JSONException{double n=o.getDouble(key);if(!Double.isFinite(n)||n<lo||n>hi)throw new JSONException("Invalid camera value: "+key);return (float)n;}
 static NativeGaussianRenderer.Camera decode(JSONObject o,double[] origin)throws JSONException{
  if(o.getInt("schema")!=1||!o.getString("space").equals("raw-world"))throw new JSONException("Unsupported native camera file");NativeGaussianRenderer.Camera c=new NativeGaussianRenderer.Camera();c.elevation=number(o,"elevation",-90,90);c.azimuth=number(o,"azimuth",-1000000,1000000);c.roll=o.has("roll")?number(o,"roll",-360,360):0;c.zoom=number(o,"zoom",.01f,1000);c.magnification=o.has("magnification")?number(o,"magnification",.05f,20):1;c.panX=number(o,"panX",-1e9f,1e9f);c.panY=number(o,"panY",-1e9f,1e9f);c.baseHeight=number(o,"baseHeight",.000001f,1e9f);c.distance=number(o,"distance",.000001f,1e9f);c.near=number(o,"near",.00000001f,1e9f);c.perspective=o.getBoolean("perspective");JSONArray target=o.getJSONArray("target");if(target.length()!=3)throw new JSONException("Invalid target");for(int a=0;a<3;a++){double n=target.getDouble(a)-origin[a];if(!Double.isFinite(n)||Math.abs(n)>1e9)throw new JSONException("Invalid target");c.target[a]=(float)n;}
  if(o.optBoolean("flying")){JSONArray eye=o.getJSONArray("eye");if(eye.length()!=3)throw new JSONException("Invalid eye");c.flyEye=new float[3];for(int a=0;a<3;a++){double n=eye.getDouble(a)-origin[a];if(!Double.isFinite(n)||Math.abs(n)>1e9)throw new JSONException("Invalid eye");c.flyEye[a]=(float)n;}}
  return c;
 }
 static JSONArray importBookmarks(JSONObject file)throws JSONException{if(file.getInt("schema")!=1||!file.getString("kind").equals("bwv-native-gaussian-bookmarks"))throw new JSONException("Choose a native Gaussian bookmark JSON");JSONArray list=file.getJSONArray("bookmarks");if(list.length()>100)throw new JSONException("At most 100 bookmarks");for(int i=0;i<list.length();i++){JSONObject b=list.getJSONObject(i);String name=b.getString("name");if(name.isBlank()||name.length()>120)throw new JSONException("Invalid bookmark name");decode(b.getJSONObject("camera"),new double[3]);}return list;}
}
