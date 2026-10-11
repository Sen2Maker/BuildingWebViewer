import { CameraNavigation, cameraNavigationSettings, cameraNavigationScale, CAMERA_NAV_STORAGE } from './camera-navigation.js';
import { gsViewSpec, gsDot3, gsProjectPosition } from './camera-geometry.js';
import { gsReanchorOrbit, gsSetOrbitBasis, gsOrbitRotate } from './orbit-camera.js';

export function navigationBasis(viewer) {
  if(viewer.flyPose)return viewer.flyPose.basis;
  const a=viewer.camera.azimuth*Math.PI/180,e=viewer.camera.elevation*Math.PI/180,roll=(viewer.camera.roll||0)*Math.PI/180;
  const r=[-Math.sin(a),Math.cos(a),0],u=[-Math.cos(a)*Math.sin(e),-Math.sin(a)*Math.sin(e),Math.cos(e)],b=[Math.cos(a)*Math.cos(e),Math.sin(a)*Math.cos(e),Math.sin(e)];
  return [r.map((v,i)=>v*Math.cos(roll)+u[i]*Math.sin(roll)),u.map((v,i)=>v*Math.cos(roll)-r[i]*Math.sin(roll)),b];
}
export function navigationMatrix(viewer) {
  const width=viewer.exportTarget?.width||viewer.canvas.width,height=viewer.exportTarget?.height||viewer.canvas.height;
  const spec=gsViewSpec(viewer,width,height),[r,u,b]=spec.basis,eye=spec.eye;
  const n=Math.max(1e-6,viewer.near),far=Math.max(n*100,viewer.baseHeight*1000,viewer.distance*10),a=(far+n)/(far-n),z=2*far*n/(far-n),sx=spec.fx*2/width,sy=spec.fy*2/height;
  return new Float32Array([sx*r[0],sy*u[0],-a*b[0],-b[0],sx*r[1],sy*u[1],-a*b[1],-b[1],sx*r[2],sy*u[2],-a*b[2],-b[2],-sx*gsDot3(r,eye),-sy*gsDot3(u,eye),a*gsDot3(b,eye)-z,gsDot3(b,eye)]);
}
/** Attach navigation to a renderer without owning its geometry, importing or GPU lifecycle. */
export function installCameraNavigation(viewer) {
  let saved;try{saved=JSON.parse(localStorage.getItem(CAMERA_NAV_STORAGE));}catch{}
  viewer.navigation=new CameraNavigation(saved);viewer.projection='orthographic';viewer.fov=55;viewer.distance=100;viewer.near=.001;viewer.origin ||= [0,0,0];
  viewer.hasNavigationData=()=>!!(viewer.pointCount||viewer.edgeCount||viewer.triangleCount);
  viewer.worldCenter=()=>{const bounds=viewer.sceneBounds||viewer.bounds;return bounds?bounds[0].map((v,i)=>(v+bounds[1][i])/2):[0,0,0];};
  viewer.stopNavigation=()=>{viewer.fly?.leave();viewer.navigation.reset();};
  viewer.setNavigation=options=>{viewer.stopNavigation();viewer.navigation.settings=cameraNavigationSettings({...viewer.navigation.settings,...options});if(options.pivot==='model')gsReanchorOrbit(viewer,{model:true});try{localStorage.setItem(CAMERA_NAV_STORAGE,JSON.stringify(viewer.navigation.settings));}catch{}viewer.requestRender();};
  viewer.beginOrbit=(pan=false)=>{if(!viewer.hasNavigationData()||viewer.fly?.active)return;viewer.navigation.reset();if(!pan&&viewer.navigation.settings.pivot!=='fixed')gsReanchorOrbit(viewer,{model:viewer.navigation.settings.pivot==='model'});};
  viewer.focusOrbit=(x=null,y=null)=>{if(!viewer.hasNavigationData())return false;viewer.stopNavigation();const hit=gsReanchorOrbit(viewer,{x,y});if(hit)viewer.setNavigation({pivot:'fixed'});viewer.onOrbitAnchor?.(hit);viewer.requestRender();return hit;};
  viewer.applyNavigation=delta=>{const[az,el,x,y,z]=delta;if(az||el){const basis=viewer.basis(),yaw=basis.map(v=>gsOrbitRotate(v,basis[1],az*Math.PI/180));gsSetOrbitBasis(viewer,yaw.map(v=>gsOrbitRotate(v,yaw[0],-el*Math.PI/180)));}viewer.camera.pan[0]+=x;viewer.camera.pan[1]+=y;viewer.camera.zoom=Math.max(.02,Math.min(100,viewer.camera.zoom*Math.exp(z)));if(viewer.camera.zoom===.02||viewer.camera.zoom===100)viewer.navigation.pending[4]=0;};
  viewer.queueNavigation=delta=>{viewer.navigation.enqueue(delta,performance.now());if(!viewer.navigation.settings.smoothing)viewer.applyNavigation(viewer.navigation.step(performance.now()));viewer.requestRender();};
  viewer.navigatePixels=(dx,dy,pan=false,precision=false)=>{if(!viewer.hasNavigationData()||viewer.fly?.active)return;const scale=cameraNavigationScale(viewer,viewer.navigation.settings),fine=precision?.2:1;viewer.queueNavigation(pan?[0,0,-dx*scale.pan*fine,dy*scale.pan*fine,0]:[-dx*scale.rotateX*fine,dy*scale.rotateY*fine,0,0,0]);};
  viewer.navigationZoom=(factor,precision=false,repivot=true)=>{if(viewer.fly?.active||!(factor>0)||!Number.isFinite(factor))return;const now=performance.now();if(repivot&&(!viewer.lastOrbitWheel||now-viewer.lastOrbitWheel>180))viewer.beginOrbit();viewer.lastOrbitWheel=now;viewer.queueNavigation([0,0,0,0,Math.log(factor)*viewer.navigation.settings.zoomSpeed*(precision?.2:1)]);};
  viewer.stepNavigation=()=>{if(!viewer.exportTarget&&viewer.navigation.active){viewer.applyNavigation(viewer.navigation.step(performance.now()));if(viewer.navigation.active)viewer.requestRender();}};
  viewer.prepareFly=()=>{if(viewer.projection==='orthographic')viewer.distance=viewer.baseHeight/(2*Math.tan(viewer.fov*Math.PI/360));viewer.projection='perspective';};
  viewer.adoptFlyPose=pose=>{viewer.trainingPose=null;gsSetOrbitBasis(viewer,pose.basis);viewer.distance=Math.max(.001,viewer.distance/viewer.camera.zoom);viewer.camera.zoom=1;viewer.camera.pan=[0,0];viewer.target=pose.eye.map((v,i)=>v-pose.basis[2][i]*viewer.distance);};
  viewer.resetNavigation=()=>{viewer.stopNavigation();viewer.projection='orthographic';viewer.camera.roll=0;};
  viewer.onNavigationVisibility=()=>{if(document.hidden)viewer.stopNavigation();};if(typeof document!=='undefined')document.addEventListener('visibilitychange',viewer.onNavigationVisibility);
}

/** Point clouds use projected point centers; wireframes include the closest point on each edge. */
export function pickCloudNavigationDepth(viewer,spec,x,y) {
  let best=Infinity,depth=null;const radius=Math.max(12,Math.min(spec.width,spec.height)*.045);
  const consider=(p)=>{if(!p)return;const d=(p.x-x)**2+(p.y-y)**2;if(d<=radius*radius&&(d<best-1e-6||Math.abs(d-best)<1e-6&&p.depth<depth)){best=d;depth=p.depth;}};
  if(viewer.options.showPoints)for(const entry of viewer.activeClouds||[]){const points=entry.item.cloud.positions,stride=Math.max(1,Math.ceil(viewer.pointCount/200000))*3;for(let i=0;i<points.length;i+=stride)consider(gsProjectPosition([points[i]-viewer.origin[0],points[i+1]-viewer.origin[1],points[i+2]-viewer.origin[2]],spec));}
  const wire=viewer.options.showWire&&viewer.wireEntry?.wire;
  if(wire)for(const [a,b]of wire.edges){const p=gsProjectPosition(wire.vertices[a].map((v,i)=>v-viewer.origin[i]),spec),q=gsProjectPosition(wire.vertices[b].map((v,i)=>v-viewer.origin[i]),spec);if(!p||!q)continue;const dx=q.x-p.x,dy=q.y-p.y,t=Math.max(0,Math.min(1,((x-p.x)*dx+(y-p.y)*dy)/(dx*dx+dy*dy||1)));consider({x:p.x+t*dx,y:p.y+t*dy,depth:spec.perspective?1/((1-t)/p.depth+t/q.depth):p.depth*(1-t)+q.depth*t});}
  return depth;
}
/** Ray/triangle intersection uses displayed mesh coordinates, including LOD layout transforms. */
export function pickMeshNavigationDepth(viewer,spec,x,y) {
  const [r,u,b]=spec.basis, sx=(x-spec.width/2),sy=-(y-spec.height/2);
  const origin=spec.eye.map((v,i)=>v+(spec.perspective?0:(r[i]*sx+u[i]*sy)*spec.worldHeight/spec.height));
  const ray=b.map((v,i)=>-v+(spec.perspective?r[i]*sx/spec.fx+u[i]*sy/spec.fy:0));
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  let nearest=Infinity;const points=viewer.navigationTriangles||[];
  for(let i=0;i<points.length;i+=9){const a=[points[i],points[i+1],points[i+2]],ab=[points[i+3]-a[0],points[i+4]-a[1],points[i+5]-a[2]],ac=[points[i+6]-a[0],points[i+7]-a[1],points[i+8]-a[2]],h=cross(ray,ac),det=gsDot3(ab,h);if(Math.abs(det)<1e-12)continue;const s=origin.map((v,j)=>v-a[j]),u=gsDot3(s,h)/det;if(u<0||u>1)continue;const q=cross(s,ab),v=gsDot3(ray,q)/det;if(v<0||u+v>1)continue;const distance=gsDot3(ac,q)/det;if(distance>spec.near&&distance<nearest)nearest=distance;}
  return Number.isFinite(nearest)?nearest:null;
}
