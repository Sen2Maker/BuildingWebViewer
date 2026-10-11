// Gaussian camera conventions: right/up/back form an orthonormal world basis.
// Inria cameras.json stores camera-to-world columns right/down/forward.
export const gsDot3 = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function gsUnit3(v) { const n=Math.hypot(...v); if (!(n>1e-12)) throw Error('Invalid camera axis'); return v.map(x=>x/n); }
export function gsCross3(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
export function gsTrainingPose(camera, origin=[0,0,0]) {
  const r=camera.rotation;
  if (!Array.isArray(r)||r.length!==3||r.some(row=>!Array.isArray(row)||row.length!==3||!row.every(Number.isFinite)) || !camera.position?.every(Number.isFinite) || !(camera.fx>0&&camera.fy>0&&camera.width>0&&camera.height>0)) throw Error('训练相机缺少有效的 rotation、fx、fy 或图像尺寸 / Invalid training camera');
  const right=gsUnit3(r.map(row=>row[0])), up=gsUnit3(r.map(row=>-row[1])), back=gsUnit3(r.map(row=>-row[2]));
  if (Math.abs(gsDot3(right,up))>1e-3||Math.abs(gsDot3(right,back))>1e-3||Math.abs(gsDot3(up,back))>1e-3 || gsDot3(gsCross3(right,up),back)<.999) throw Error('Invalid camera rotation');
  return {eye:camera.position.map((v,i)=>v-origin[i]),basis:[right,up,back],fx:camera.fx,fy:camera.fy,width:camera.width,height:camera.height};
}
export function gsViewSpec(viewer, width, height) {
  const basis=viewer.basis(), perspective=viewer.projection!=='orthographic';
  const training=viewer.trainingPose;
  const focal=height/(2*Math.tan((viewer.fov||55)*Math.PI/360));
  const fit=training?Math.min(width/training.width,height/training.height):1;
  const fx=training?training.fx*fit:viewer.orbitLens?viewer.orbitLens.fx*height:focal, fy=training?training.fy*fit:viewer.orbitLens?viewer.orbitLens.fy*height:focal;
  const distance=viewer.distance/viewer.camera.zoom;
  const target=viewer.target.map((v,i)=>v+basis[0][i]*viewer.camera.pan[0]+basis[1][i]*viewer.camera.pan[1]);
  const eye=viewer.flyPose?viewer.flyPose.eye:training?training.eye:target.map((v,i)=>v+basis[2][i]*distance);
  return {basis,eye,target,width,height,fx,fy,perspective,near:viewer.near||.001,worldHeight:viewer.baseHeight/viewer.camera.zoom};
}
export function gsProjectPosition(point, spec) {
  const delta=point.map((v,i)=>v-spec.eye[i]), [right,up,back]=spec.basis;
  const depth=-gsDot3(delta,back);
  if (spec.perspective && depth<=spec.near) return null;
  const x=gsDot3(delta,right), y=gsDot3(delta,up);
  return {x:spec.width/2+(spec.perspective?spec.fx*x/depth:x*spec.height/spec.worldHeight),y:spec.height/2-(spec.perspective?spec.fy*y/depth:y*spec.height/spec.worldHeight),depth};
}
