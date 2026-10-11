import { gsViewSpec, gsDot3 } from './camera-geometry.js';

export function gsOrbitRotate(v, axis, angle) {
  const c=Math.cos(angle),s=Math.sin(angle),d=gsDot3(v,axis);
  const cross=[axis[1]*v[2]-axis[2]*v[1],axis[2]*v[0]-axis[0]*v[2],axis[0]*v[1]-axis[1]*v[0]];
  return v.map((x,i)=>x*c+cross[i]*s+axis[i]*d*(1-c));
}
export function gsSetOrbitBasis(viewer, basis) {
  const [right,,back]=basis, deg=180/Math.PI;
  const az=Math.atan2(back[1],back[0]), el=Math.asin(Math.max(-1,Math.min(1,back[2])));
  const r=[-Math.sin(az),Math.cos(az),0], u=[-Math.cos(az)*Math.sin(el),-Math.sin(az)*Math.sin(el),Math.cos(el)];
  viewer.camera.azimuth=az*deg;viewer.camera.elevation=el*deg;
  viewer.camera.roll=Math.atan2(gsDot3(right,u),gsDot3(right,r))*deg;
}
/** Estimate depth from the nearest 32 projected Gaussian centers. Not a surface raycast.
 * Runs once at gesture start; hidden/deleted/very transparent splats are excluded.
 */
export function gsOrbitDepth(viewer, spec, x=spec.width/2, y=spec.height/2) {
  if(viewer.pickOrbitDepth)return viewer.pickOrbitDepth(spec,x,y);
  if(!viewer.packed)return null;
  const {centers,opacity}=viewer.packed, [r,u,b]=spec.basis;
  const radius=Math.max(12,Math.min(spec.width,spec.height)*.045), candidates=[];
  let limit=radius*radius;
  for(let i=0;i<viewer.count;i++) {
    if((viewer.flags?.[i]||0)&6 || opacity[i]<Math.max(.05,viewer.gauss.opacityCutoff))continue;
    const dx=centers[i*3]-spec.eye[0],dy=centers[i*3+1]-spec.eye[1],dz=centers[i*3+2]-spec.eye[2];
    const depth=-(dx*b[0]+dy*b[1]+dz*b[2]);if(depth<=spec.near)continue;
    const vx=dx*r[0]+dy*r[1]+dz*r[2],vy=dx*u[0]+dy*u[1]+dz*u[2];
    const px=spec.width/2+(spec.perspective?spec.fx*vx/depth:vx*spec.height/spec.worldHeight)-x;
    const py=spec.height/2-(spec.perspective?spec.fy*vy/depth:vy*spec.height/spec.worldHeight)-y;
    const d=px*px+py*py;if(d>limit)continue;
    candidates.push({d,depth});candidates.sort((a,b)=>a.d-b.d);if(candidates.length>32)candidates.pop();
    if(candidates.length===32)limit=candidates[31].d;
  }
  if(!candidates.length)return null;
  // A lower quartile resists isolated near-camera floaters and favors foreground geometry.
  candidates.sort((a,b)=>a.depth-b.depth);return candidates[Math.floor((candidates.length-1)*.25)].depth;
}
export function gsReanchorOrbit(viewer, {model=false,x=null,y=null}={}) {
  const spec=gsViewSpec(viewer,viewer.canvas.clientWidth,viewer.canvas.clientHeight), back=spec.basis[2];
  const picked=model?null:gsOrbitDepth(viewer,spec,x??spec.width/2,y??spec.height/2);
  if(!model&&x!==null&&picked===null)return false;
  const fallback=Math.max(spec.near*2,viewer.distance/viewer.camera.zoom);
  let depth=picked??fallback;
  let target=model?viewer.worldCenter().map((v,i)=>v-viewer.origin[i]):spec.eye.map((v,i)=>v-back[i]*depth);
  if(!model&&x!==null) {
    const sx=spec.perspective?(x-spec.width/2)*depth/spec.fx:(x-spec.width/2)*spec.worldHeight/spec.height;
    const sy=spec.perspective?-(y-spec.height/2)*depth/spec.fy:-(y-spec.height/2)*spec.worldHeight/spec.height;
    target=target.map((v,i)=>v+spec.basis[0][i]*sx+spec.basis[1][i]*sy);
  }
  const offset=spec.eye.map((v,i)=>v-target[i]);depth=gsDot3(offset,back);
  if(depth<=spec.near)return false;
  // Reparameterize the same eye and lens; changing the pivot must not pan or zoom the image.
  viewer.target=target;viewer.distance=depth*viewer.camera.zoom;
  viewer.camera.pan=[gsDot3(offset,spec.basis[0]),gsDot3(offset,spec.basis[1])];
  if(viewer.trainingPose){viewer.leaveTraining();viewer.camera.pan=[gsDot3(offset,spec.basis[0]),gsDot3(offset,spec.basis[1])];viewer.orbitLens={fx:spec.fx/spec.height,fy:spec.fy/spec.height};}
  viewer.orbitAnchorHit=picked!==null;return picked!==null||model;
}
