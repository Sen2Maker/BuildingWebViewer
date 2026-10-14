package io.github.sen2maker.buildingwebviewer.preview;
/** Free-flight movement uses the displayed camera frame, independent of dataset up axes. */
final class NativeGaussianNavigation {
 static float clamp(float n){return Float.isFinite(n)?Math.max(-1,Math.min(1,n)):0;}
 static float[][] basis(float elevation,float azimuth){double e=Math.toRadians(elevation),a=Math.toRadians(azimuth);return new float[][]{{(float)-Math.sin(a),(float)Math.cos(a),0},{(float)(-Math.cos(a)*Math.sin(e)),(float)(-Math.sin(a)*Math.sin(e)),(float)Math.cos(e)},{(float)(Math.cos(a)*Math.cos(e)),(float)(Math.sin(a)*Math.cos(e)),(float)Math.sin(e)}};}
 static float[] direction(float[][] basis,float right,float forward,float up){float r=clamp(right),f=clamp(forward),u=clamp(up);float normal=(float)Math.max(1,Math.sqrt(r*r+f*f+u*u));float[] v=new float[3];for(int a=0;a<3;a++)v[a]=(basis[0][a]*r-basis[2][a]*f+basis[1][a]*u)/normal;return v;}
 static float[][] rolledBasis(float elevation,float azimuth,float roll){float[][] b=basis(elevation,azimuth);double angle=Math.toRadians(roll),c=Math.cos(angle),s=Math.sin(angle);float[] right=b[0].clone(),up=b[1].clone();for(int a=0;a<3;a++){b[0][a]=(float)(right[a]*c+up[a]*s);b[1][a]=(float)(up[a]*c-right[a]*s);}return b;}
 static float dot(float[] a,float[] b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
 static float[] rotate(float[] v,float[] axis,float degrees){double angle=Math.toRadians(degrees),c=Math.cos(angle),s=Math.sin(angle),d=dot(v,axis);float[] cross={axis[1]*v[2]-axis[2]*v[1],axis[2]*v[0]-axis[0]*v[2],axis[0]*v[1]-axis[1]*v[0]},out=new float[3];for(int a=0;a<3;a++)out[a]=(float)(v[a]*c+cross[a]*s+axis[a]*d*(1-c));return out;}
 static float[][] look(float[][] frame,float yaw,float pitch,float roll){float[][] b={frame[0].clone(),frame[1].clone(),frame[2].clone()};float[] axis=b[1].clone();for(int a=0;a<3;a++)b[a]=rotate(b[a],axis,-yaw);axis=b[0].clone();for(int a=0;a<3;a++)b[a]=rotate(b[a],axis,pitch);axis=b[2].clone();for(int a=0;a<3;a++)b[a]=rotate(b[a],axis,-roll);return b;}
 static float[] angles(float[][] b,float fallbackAzimuth){float elevation=(float)Math.toDegrees(Math.atan2(b[2][2],Math.hypot(b[2][0],b[2][1])));float azimuth=Math.hypot(b[2][0],b[2][1])<1e-6?fallbackAzimuth:(float)Math.toDegrees(Math.atan2(b[2][1],b[2][0]));float[][] base=basis(elevation,azimuth);float roll=(float)Math.toDegrees(Math.atan2(dot(b[0],base[1]),dot(b[0],base[0])));return new float[]{elevation,azimuth,roll};}
 static float sensitivity(double stored,int version){if(!Double.isFinite(stored))return 1;float value=(float)stored;if(version<2&&Math.abs(value-.3f)<.00001f)value=1;return Math.max(.1f,Math.min(3,value));}

}
