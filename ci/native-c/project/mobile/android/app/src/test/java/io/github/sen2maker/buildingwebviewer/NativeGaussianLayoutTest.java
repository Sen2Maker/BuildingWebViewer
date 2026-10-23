package io.github.sen2maker.buildingwebviewer;
import org.junit.Test;
import static org.junit.Assert.*;
public class NativeGaussianLayoutTest {
 @Test public void portraitRetainsExistingPads(){NativeGaussianLayout.Plan p=NativeGaussianLayout.plan(390,500);assertTrue(p.visible);assertFalse(p.compact);assertEquals(176,p.height);assertEquals(380,p.width);}
 @Test public void shortLandscapeKeepsControlsInsideCanvasWithoutScalingTouchTargets(){for(int h:new int[]{134,150,162,180,202}){NativeGaussianLayout.Plan p=NativeGaussianLayout.plan(720,h);assertTrue(p.visible);assertTrue(p.height>=112);assertTrue(p.height+15<=h);assertTrue(p.width<=710);if(h<182)assertTrue(p.compact);}}
 @Test public void keyboardSizedCanvasDoesNotClipAnActiveHud(){assertFalse(NativeGaussianLayout.plan(720,100).visible);assertFalse(NativeGaussianLayout.plan(180,400).visible);}
}
