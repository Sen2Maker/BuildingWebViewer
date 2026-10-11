/** Quality changes pixels and shading only; never the source population. */
export function gsFrameQuality({pixelRatio=1,devicePixelRatio=1,moving=false,interactionScale=1,interactionDegree=3,degree=3,exporting=false}={}) {
  const active=moving&&!exporting;
  return {dpr:Math.min(devicePixelRatio,pixelRatio)*(active?interactionScale:1),degree:active?Math.min(degree,interactionDegree):degree};
}
