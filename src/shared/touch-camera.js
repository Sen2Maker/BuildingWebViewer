/** Pointer gestures shared by mesh, wireframe and point-cloud renderers. */
export function mountTouchCamera(viewer, listen, {minElevation = -89} = {}) {
  const fingers = new Map();
  let previous = null;
  const pose = () => {
    const points = [...fingers.values()].slice(0, 2);
    return {count: points.length, x: points.reduce((n,p)=>n+p.x,0)/points.length,
      y: points.reduce((n,p)=>n+p.y,0)/points.length,
      distance: points.length === 2 ? Math.hypot(points[0].x-points[1].x, points[0].y-points[1].y) : 0};
  };
  listen('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    event.preventDefault(); fingers.set(event.pointerId, {x:event.clientX,y:event.clientY});
    viewer.canvas.setPointerCapture(event.pointerId); previous = pose();
  });
  listen('pointermove', event => {
    if (!fingers.has(event.pointerId)) return;
    event.preventDefault(); fingers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const next = pose();
    if (previous && next.count === previous.count) {
      const dx = next.x-previous.x, dy=next.y-previous.y;
      if (next.count === 1) {
        viewer.camera.azimuth = (viewer.camera.azimuth-dx*.35)%360;
        viewer.camera.elevation = Math.max(minElevation,Math.min(90,viewer.camera.elevation+dy*.3));
      } else {
        const step=viewer.baseHeight/viewer.camera.zoom/Math.max(1,viewer.canvas.clientHeight);
        viewer.camera.pan[0]-=dx*step; viewer.camera.pan[1]+=dy*step;
        if(previous.distance>2 && next.distance>2) viewer.zoomBy(next.distance/previous.distance);
      }
      viewer.requestRender();
    }
    previous=next;
  });
  const finish = event => {
    if(!fingers.delete(event.pointerId))return;
    previous=fingers.size?pose():null;
    if(viewer.canvas.hasPointerCapture(event.pointerId)) viewer.canvas.releasePointerCapture(event.pointerId);
  };
  for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(event,finish);
}
