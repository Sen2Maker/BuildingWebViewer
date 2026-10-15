/** Change ordinary orbit-camera projection while preserving its apparent target-plane span. */
export function setViewerProjection(viewers, projection, pauseSync = callback => callback()) {
  if (!['orthographic','perspective'].includes(projection)) throw new Error('Unsupported camera projection');
  pauseSync(() => {
    for (const viewer of viewers) {
      viewer.stopNavigation?.();
      if (viewer.projection !== projection) {
        // Training cameras own calibrated focal lengths. Convert that pose to an
        // orbit lens only on an actual projection change; changing a dropdown to
        // its current value must not discard a calibrated view.
        viewer.leaveTraining?.();
        const fy = viewer.orbitLens?.fy;
        const tangent = Number.isFinite(fy) && fy > 0 ? 1 / (2 * fy) : Math.tan((viewer.fov || 55) * Math.PI / 360);
        if (projection === 'perspective') viewer.distance = viewer.baseHeight / (2 * tangent);
        else viewer.baseHeight = 2 * viewer.distance * tangent;
        viewer.projection = projection;
      }
      viewer.requestRender();
    }
  });
}
