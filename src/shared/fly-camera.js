import { gsDot3, gsCross3 } from './camera-geometry.js';

export const FLY_CAMERA_DEFAULTS = Object.freeze({sensitivity: .12, speed: .15, rollSpeed: 30});
export function flyCameraSettings(value = {}) {
  const v = value || {}, number = (key, low, high) => Number.isFinite(v[key]) ? Math.max(low, Math.min(high, v[key])) : FLY_CAMERA_DEFAULTS[key];
  return {sensitivity: number('sensitivity', .01, 1), speed: number('speed', .005, 2), rollSpeed: number('rollSpeed', 5, 120)};
}
function gsFlyRotate(vector, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), cross = gsCross3(axis, vector), dot = gsDot3(axis, vector);
  return vector.map((v, i) => v*c + cross[i]*s + axis[i]*dot*(1-c));
}
/** Independent eye, with the entry view's up axis as the local vertical. */
export class FlyCameraPose {
  constructor(eye, basis) {
    this.eye = [...eye]; this.initial = basis.map(v => [...v]);
    this.vertical = [...basis[1]]; this.yaw = 0; this.pitch = 0; this.roll = 0; this.basis = basis.map(v => [...v]);
  }
  look(dx, dy, sensitivity) {
    const c=Math.cos(this.roll),s=Math.sin(this.roll),sx=dx*c+dy*s,sy=-dx*s+dy*c;
    dx=sx;dy=sy;
    this.yaw = (this.yaw - dx*sensitivity*Math.PI/180) % (2*Math.PI);
    this.pitch = Math.max(-Math.PI*.495, Math.min(Math.PI*.495, this.pitch - dy*sensitivity*Math.PI/180));
    this.rebuild();
  }
  rollBy(degrees) { this.roll=(this.roll+degrees*Math.PI/180)%(2*Math.PI);this.rebuild(); }
  rebuild() {
    const yawed = this.initial.map(v => gsFlyRotate(v, this.vertical, this.yaw));
    this.basis = [yawed[0], gsFlyRotate(yawed[1], yawed[0], this.pitch), gsFlyRotate(yawed[2], yawed[0], this.pitch)];
    this.basis=this.basis.map(v=>gsFlyRotate(v,this.basis[2],this.roll));
  }
  move(right, forward, up, distance) {
    const direction = this.eye.map((_, i) => this.basis[0][i]*right - this.basis[2][i]*forward + this.vertical[i]*up);
    // Keep diagonal travel bounded, including when the view points toward the vertical.
    const length = Math.hypot(...direction), input = Math.min(1, Math.hypot(right, forward, up));
    if (length > 1e-8) this.eye = this.eye.map((v, i) => v + direction[i]/length*distance*input);
  }
}
