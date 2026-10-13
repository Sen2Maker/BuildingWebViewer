package io.github.sen2maker.buildingwebviewer.preview;
/** Walking axes follow the heading, never the pitch. Height is a separate world-Z axis. */
final class NativeGaussianNavigation {
 static float clamp(float n){return Float.isFinite(n)?Math.max(-1,Math.min(1,n)):0;}
 static float[] direction(float azimuth,float right,float forward,float up){double a=Math.toRadians(azimuth);double r=clamp(right),f=clamp(forward),u=clamp(up),normal=Math.max(1,Math.sqrt(r*r+f*f+u*u));return new float[]{(float)((-Math.sin(a)*r-Math.cos(a)*f)/normal),(float)((Math.cos(a)*r-Math.sin(a)*f)/normal),(float)(u/normal)};}
}
