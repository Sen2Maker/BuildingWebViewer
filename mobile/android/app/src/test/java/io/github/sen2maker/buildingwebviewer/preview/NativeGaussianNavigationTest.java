package io.github.sen2maker.buildingwebviewer.preview;
import org.junit.Test;import static org.junit.Assert.*;
public class NativeGaussianNavigationTest {
 static float dot(float[] a,float[] b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
 @Test public void cameraAxesRemainDistinctAtEveryPitchAndHeading(){for(float elevation:new float[]{-89,-35,0,38,85,90})for(float heading:new float[]{0,90,180,-90,35}){float[][] basis=NativeGaussianNavigation.basis(elevation,heading);float[] f=NativeGaussianNavigation.direction(basis,0,1,0),u=NativeGaussianNavigation.direction(basis,0,0,1),r=NativeGaussianNavigation.direction(basis,1,0,0);assertEquals(-1,dot(f,basis[2]),.00001);assertEquals(0,dot(f,basis[1]),.00001);assertEquals(1,dot(u,basis[1]),.00001);assertEquals(0,dot(u,basis[2]),.00001);assertEquals(1,dot(r,basis[0]),.00001);assertEquals(0,dot(f,u),.00001);}}
 @Test public void oppositeInputsAndDiagonalSpeed(){float[][] basis=NativeGaussianNavigation.basis(85,35);float[] forward=NativeGaussianNavigation.direction(basis,0,1,0),back=NativeGaussianNavigation.direction(basis,0,-1,0);for(int a=0;a<3;a++)assertEquals(-forward[a],back[a],.00001);float[] combined=NativeGaussianNavigation.direction(basis,1,1,1);assertEquals(1,Math.sqrt(dot(combined,combined)),.00001);assertEquals(0,NativeGaussianNavigation.clamp(Float.NaN),0);}
}
