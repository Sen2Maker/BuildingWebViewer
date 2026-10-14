package io.github.sen2maker.buildingwebviewer.preview;
import org.junit.Test;import static org.junit.Assert.*;
public class NativeGaussianMotionTest {
 @Test public void receivedInputConvergesAtDifferentFrameRates(){for(int frame:new int[]{8,16,33}){NativeGaussianMotion m=new NativeGaussianMotion();m.enqueue(new double[]{30,-20,2,3,.5},100);double[] total=new double[5];for(int t=100;t<1000;t+=frame){double[] v=m.step(t,true);for(int a=0;a<5;a++)total[a]+=v[a];}assertArrayEquals(new double[]{30,-20,2,3,.5},total,.00001);assertFalse(m.active());}}
 @Test public void immediateAndResetStopResidualMotion(){NativeGaussianMotion m=new NativeGaussianMotion();m.enqueue(new double[]{10,0,0,0,0},100);assertEquals(10,m.step(100,false)[0],0);assertFalse(m.active());m.enqueue(new double[]{10,0,0,0,0},100);m.reset();assertFalse(m.active());assertEquals(0,m.step(200,true)[0],0);}
 @Test public void shorterFilterRespondsFasterWithoutOvershoot(){NativeGaussianMotion m=new NativeGaussianMotion();m.enqueue(new double[]{10,0,0,0,0},100);double first=m.step(145,true,45)[0];assertTrue(first>6);double total=first;for(int t=160;t<500;t+=16)total+=m.step(t,true,45)[0];assertEquals(10,total,.00001);assertFalse(m.active());}

}
