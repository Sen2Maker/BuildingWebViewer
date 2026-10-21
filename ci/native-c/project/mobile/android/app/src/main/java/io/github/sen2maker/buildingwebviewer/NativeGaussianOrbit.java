package io.github.sen2maker.buildingwebviewer;
import java.nio.FloatBuffer;
import java.util.Arrays;
/** Match the browser's view-center depth estimate: lower quartile of the nearest 32 projected centers.
 * This estimates an orbit anchor, not an exact surface hit. Source/render counts never change. */
final class NativeGaussianOrbit {
 static float depth(float[] positions,FloatBuffer centers,float[] eye,float[][] basis,float near,boolean perspective,float focal,float worldHeight,int width,int height){
  double radius=Math.max(12,Math.min(width,height)*.045),limit=radius*radius;double[] distances=new double[32];float[] depths=new float[32];int count=0;
  for(int i=0;i<positions.length/3;i++){if(centers.get(i*4+3)<.05f)continue;float x=positions[i*3]-eye[0],y=positions[i*3+1]-eye[1],z=positions[i*3+2]-eye[2];float depth=-(x*basis[2][0]+y*basis[2][1]+z*basis[2][2]);if(depth<=near)continue;float vx=x*basis[0][0]+y*basis[0][1]+z*basis[0][2],vy=x*basis[1][0]+y*basis[1][1]+z*basis[1][2];double scale=perspective?focal/depth:height/worldHeight;double distance=(vx*vx+vy*vy)*scale*scale;if(distance>limit)continue;int at=Math.min(count,31);while(at>0&&distances[at-1]>distance){if(at<32){distances[at]=distances[at-1];depths[at]=depths[at-1];}at--;}distances[at]=distance;depths[at]=depth;if(count<32)count++;if(count==32)limit=distances[31];}
  if(count==0)return Float.NaN;Arrays.sort(depths,0,count);return depths[(count-1)/4];
 }
}
