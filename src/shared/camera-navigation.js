// Gaussian navigation settings are independent of camera bookmarks and model data.
export const CAMERA_NAV_DEFAULTS = Object.freeze({
  rotateSpeed: 0.3, panSpeed: 0.65, zoomSpeed: 0.55,
  pivot: 'view', adaptive: true, smoothing: true, smoothingMs: 100,
});
export const CAMERA_NAV_STORAGE = 'BuildingWebViewer.camera.navigation.v2';
export function cameraNavigationSettings(value = {}) {
  const result = {...CAMERA_NAV_DEFAULTS};
  for (const key of ['rotateSpeed', 'panSpeed', 'zoomSpeed', 'smoothingMs']) {
    const v = value?.[key], lo = key === 'smoothingMs' ? 20 : 0.05, hi = key === 'smoothingMs' ? 350 : 2;
    if (typeof v === 'number' && Number.isFinite(v)) result[key] = Math.max(lo, Math.min(hi, v));
  }
  for (const key of ['adaptive', 'smoothing']) if (typeof value?.[key] === 'boolean') result[key] = value[key];
  if (['view','fixed','model'].includes(value?.pivot)) result.pivot=value.pivot;
  return result;
}
export function cameraNavigationScale(viewer, settings) {
  const zoom = Math.max(0.02, viewer.camera.zoom), height = Math.max(1, viewer.canvas.clientHeight);
  const perspective = viewer.projection !== 'orthographic';
  const span = perspective ? 2 * viewer.distance / zoom * Math.tan(viewer.fov * Math.PI / 360) : viewer.baseHeight / zoom;
  const adaptive = settings.adaptive ? Math.max(0.1, Math.min(2, (perspective ? viewer.fov / 55 : 1) / Math.sqrt(zoom))) : 1;
  return {
    rotateX: 0.35 * settings.rotateSpeed * adaptive,
    rotateY: 0.3 * settings.rotateSpeed * adaptive,
    pan: settings.panSpeed * (settings.adaptive ? span : viewer.baseHeight / zoom) / height,
  };
}
/** Integrate remaining input with an elapsed-time exponential filter, not a
 * frame-count multiplier. This converges to the same pose at 30/60/120 Hz.
 * No velocity extrapolation: releasing the pointer only finishes received input.
 */
export class CameraNavigation {
  constructor(settings = {}) { this.settings = cameraNavigationSettings(settings); this.reset(); }
  reset() { this.pending = [0, 0, 0, 0, 0]; this.lastTime = null; this.age = 0; }
  get active() { return this.pending.some(value => value !== 0); }
  enqueue(delta, now) {
    if (!this.active) { this.lastTime = now; this.age = 0; }
    for (let i = 0; i < 5; i++) this.pending[i] += Number.isFinite(delta[i]) ? delta[i] : 0;
    this.age = 0;
  }
  step(now) {
    if (!this.active) return [0, 0, 0, 0, 0];
    const dt = Math.max(0, now - (this.lastTime ?? now)); this.lastTime = now; this.age += dt;
    const done = !this.settings.smoothing || this.age >= this.settings.smoothingMs * 8;
    const alpha = done ? 1 : -Math.expm1(-dt / this.settings.smoothingMs);
    return this.pending.map((value, i) => { const applied = value * alpha; this.pending[i] = done ? 0 : value - applied; return applied; });
  }
}
