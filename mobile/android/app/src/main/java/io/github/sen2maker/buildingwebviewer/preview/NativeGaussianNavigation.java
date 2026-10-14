package io.github.sen2maker.buildingwebviewer.preview;
/** Free-flight movement uses the displayed camera frame, independent of dataset up axes. */
final class NativeGaussianNavigation {
 static float clamp(float n){return Float.isFinite(n)?Math.max(-1,Math.min(1,n)):0;}
 static float[][] basis(float elevation,float azimuth){double e=Math.toRadians(elevation),a=Math.toRadians(azimuth);return new float[][]{{(float)-Math.sin(a),(float)Math.cos(a),0},{(float)(-Math.cos(a)*Math.sin(e)),(float)(-Math.sin(a)*Math.sin(e)),(float)Math.cos(e)},{(float)(Math.cos(a)*Math.cos(e)),(float)(Math.sin(a)*Math.cos(e)),(float)Math.sin(e)}};}
 static float[] direction(float[][] basis,float right,float forward,float up){float r=clamp(right),f=clamp(forward),u=clamp(up);float normal=(float)Math.max(1,Math.sqrt(r*r+f*f+u*u));float[] v=new float[3];for(int a=0;a<3;a++)v[a]=(basis[0][a]*r-basis[2][a]*f+basis[1][a]*u)/normal;return v;}
}
