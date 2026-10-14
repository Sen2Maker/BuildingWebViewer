package io.github.sen2maker.buildingwebviewer.preview;
import java.nio.FloatBuffer;import org.junit.Test;import static org.junit.Assert.*;
public class NativeGaussianOrbitTest {
 @Test public void viewCenterUsesRobustDepthAndExcludesTransparentOrBehind(){float[] xyz={0,0,-1,0,0,-2,0,0,-3,0,0,-4,0,0,-5,0,0,1,10,0,-1,0,0,-.1f};FloatBuffer centers=FloatBuffer.allocate(32);for(int i=0;i<8;i++)centers.put(i*4+3,i==7?0:1);float depth=NativeGaussianOrbit.depth(xyz,centers,new float[3],new float[][]{{1,0,0},{0,1,0},{0,0,1}},.01f,true,500,4,1000,1000);assertEquals(2,depth,0);}
 @Test public void noHitIsExplicitAndFullDatasetRemainsUnmodified(){float[] xyz={100,100,-1};FloatBuffer centers=FloatBuffer.allocate(4);centers.put(3,1);assertTrue(Float.isNaN(NativeGaussianOrbit.depth(xyz,centers,new float[3],new float[][]{{1,0,0},{0,1,0},{0,0,1}},.01f,true,500,4,1000,1000)));assertArrayEquals(new float[]{100,100,-1},xyz,0);}
}
