package io.github.sen2maker.buildingwebviewer.preview;
import org.junit.Test;import static org.junit.Assert.*;
public class NativeGaussianNavigationTest {
 @Test public void horizontalWalkingAndHeightAreDistinctForEveryHeading(){for(float heading:new float[]{0,90,180,-90,35}){float[] front=NativeGaussianNavigation.direction(heading,0,1,0),side=NativeGaussianNavigation.direction(heading,1,0,0),up=NativeGaussianNavigation.direction(heading,0,0,1);assertEquals(0,front[2],0);assertEquals(0,side[2],0);assertArrayEquals(new float[]{0,0,1},up,0);assertEquals(0,front[0]*side[0]+front[1]*side[1],.00001);assertEquals(1,Math.hypot(front[0],front[1]),.00001);}}
 @Test public void padAxesFollowHeadingAndOpposites(){assertArrayEquals(new float[]{0,1,0},NativeGaussianNavigation.direction(-90,0,1,0),.00001f);assertArrayEquals(new float[]{1,0,0},NativeGaussianNavigation.direction(-90,1,0,0),.00001f);float[] front=NativeGaussianNavigation.direction(52,0,1,0),back=NativeGaussianNavigation.direction(52,0,-1,0);for(int a=0;a<3;a++)assertEquals(-front[a],back[a],.00001);}
 @Test public void combinedMovementRetainsHeightAndHasBoundedSpeed(){float[] d=NativeGaussianNavigation.direction(0,1,1,1);assertTrue(d[2]>0);assertEquals(1,Math.sqrt(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]),.00001);assertEquals(0,NativeGaussianNavigation.clamp(Float.NaN),0);}
}
