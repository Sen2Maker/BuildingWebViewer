package io.github.sen2maker.buildingwebviewer.preview;
/** Density-independent HUD layout; no scaled touch targets or camera changes. */
final class NativeGaussianLayout {
 static final class Plan {
  final int width,height;final boolean compact,visible;
  Plan(int width,int height,boolean compact,boolean visible){this.width=width;this.height=height;this.compact=compact;this.visible=visible;}
 }
 static Plan plan(int width,int height){
  int controlsHeight=Math.max(112,Math.min(176,height-22));
  boolean compact=controlsHeight<160&&width>=480;
  return new Plan(Math.min(compact?660:420,Math.max(0,width-10)),controlsHeight,compact,height>=134&&width>=240);
 }
}
