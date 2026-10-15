import { validateCameraSnapshot } from './camera-controls.js';
import { gsSetOrbitBasis } from './orbit-camera.js';

/** Renderer-independent, one-based camera timeline. No DOM, storage or video encoder. */
export const CA_FORMAT='BuildingWebViewer.camera-animation';
export const CA_EASINGS=['linear','smooth','ease-in','ease-out','hold'];
export function caFrameCount(duration,fps){
 if(!Number.isFinite(duration)||duration<=0||duration>300||!Number.isInteger(fps)||fps<1||fps>60)throw Error('时长需大于 0 且不超过 300 秒，帧率为 1–60 的整数 / Duration: (0, 300] seconds; FPS: 1–60');
 return Math.max(1,Math.round(duration*fps));
}
export function caTime(frame,fps){return (frame-1)/fps;}
export function caEase(t,mode){t=Math.max(0,Math.min(1,t));if(mode==='hold')return t>=1?1:0;if(mode==='smooth')return t*t*(3-2*t);if(mode==='ease-in')return t*t;if(mode==='ease-out')return 1-(1-t)*(1-t);return t;}
const caClone=value=>JSON.parse(JSON.stringify(value));
const caMix=(a,b,t)=>a+(b-a)*t;
const caLogMix=(a,b,t)=>Math.exp(caMix(Math.log(a),Math.log(b),t));
const caSameScene=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function caNormalizeSnapshot(raw){
 const s=validateCameraSnapshot(raw,{space:raw?.space,checkScene:false}),c=s.camera;
 return validateCameraSnapshot({...s,version:2,camera:{...c,roll:c.roll||0,distance:c.distance||c.baseHeight*2,fov:c.fov||55,near:c.near||.001}},{space:s.space,checkScene:false});
}
export function caOutput(raw={}){
 const value={format:'mp4',width:1280,height:720,bitrate:8e6,guides:false,...raw};
 if(!['mp4','webm','png'].includes(value.format)||!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<64||value.height<64||value.width>4096||value.height>4096||value.width%2||value.height%2||value.width*value.height>3840*2160||!Number.isFinite(value.bitrate)||value.bitrate<1e5||value.bitrate>1e8||typeof value.guides!=='boolean')throw Error('视频尺寸需为 64–4096 的偶数、总像素不超过 4K，码率为 0.1–100 Mbps / Invalid output size, bitrate or format');
 return {format:value.format,width:value.width,height:value.height,bitrate:value.bitrate,guides:value.guides};
}
export function caValidateProject(value){
 if(value?.format!==CA_FORMAT||value.version!==1||!['lod-arrangement','raw-world'].includes(value.space)||!Array.isArray(value.keys)||value.keys.length>200)throw Error('无效的相机动画文件（最多 200 个关键帧） / Invalid camera animation (at most 200 keyframes)');
 const frames=caFrameCount(value.duration,value.fps),ids=new Set(),used=new Set();let scene=null,hasScene=false;
 const keys=value.keys.map((k,i)=>{
  if(!k||typeof k.id!=='string'||!k.id||k.id.length>128||ids.has(k.id)||!Number.isInteger(k.frame)||k.frame<1||k.frame>frames||used.has(k.frame)||typeof k.name!=='string'||k.name.length>80||!CA_EASINGS.includes(k.easing))throw Error('关键帧编号、名称或帧位置无效；同一帧不能有两个关键帧 / Invalid or duplicate keyframe');
  ids.add(k.id);used.add(k.frame);const snapshot=caNormalizeSnapshot(k.snapshot);if(snapshot.space!==value.space)throw Error('相机坐标空间不一致 / Camera spaces differ');
  if(hasScene&&!caSameScene(scene,snapshot.scene))throw Error('所有关键帧必须使用相同的模型布局 / Keyframes must use the same scene layout');scene=snapshot.scene;hasScene=true;
  return {id:k.id,frame:k.frame,name:k.name,easing:k.easing,snapshot};
 }).sort((a,b)=>a.frame-b.frame);
 return {format:CA_FORMAT,version:1,space:value.space,duration:frames/value.fps,fps:value.fps,keys,output:caOutput(value.output)};
}
export function caNewProject(space='lod-arrangement'){return {format:CA_FORMAT,version:1,space,duration:5,fps:30,keys:[],output:caOutput()};}
export function caSerialize(project){return JSON.stringify(caValidateProject(project),null,2);}
export function caParse(text){if(typeof text!=='string'||text.length>2*1024*1024)throw Error('动画文件超过 2 MB / Animation file exceeds 2 MB');return caValidateProject(JSON.parse(text));}
/** Quaternion columns are camera right/up/back, avoiding azimuth wrap and gimbal interpolation. */
function caQuat(camera){
 const az=camera.azimuth*Math.PI/180,el=camera.elevation*Math.PI/180,roll=(camera.roll||0)*Math.PI/180;
 const r=[-Math.sin(az),Math.cos(az),0],u=[-Math.cos(az)*Math.sin(el),-Math.sin(az)*Math.sin(el),Math.cos(el)],b=[Math.cos(el)*Math.cos(az),Math.cos(el)*Math.sin(az),Math.sin(el)];
 const right=r.map((v,i)=>v*Math.cos(roll)+u[i]*Math.sin(roll)),up=u.map((v,i)=>v*Math.cos(roll)-r[i]*Math.sin(roll));
 const m=[right[0],up[0],b[0],right[1],up[1],b[1],right[2],up[2],b[2]],tr=m[0]+m[4]+m[8];let q;
 if(tr>0){const s=Math.sqrt(tr+1)*2;q=[(m[7]-m[5])/s,(m[2]-m[6])/s,(m[3]-m[1])/s,s/4];}
 else if(m[0]>m[4]&&m[0]>m[8]){const s=Math.sqrt(1+m[0]-m[4]-m[8])*2;q=[s/4,(m[1]+m[3])/s,(m[2]+m[6])/s,(m[7]-m[5])/s];}
 else if(m[4]>m[8]){const s=Math.sqrt(1+m[4]-m[0]-m[8])*2;q=[(m[1]+m[3])/s,s/4,(m[5]+m[7])/s,(m[2]-m[6])/s];}
 else{const s=Math.sqrt(1+m[8]-m[0]-m[4])*2;q=[(m[2]+m[6])/s,(m[5]+m[7])/s,s/4,(m[3]-m[1])/s];}
 const n=Math.hypot(...q);return q.map(v=>v/n);
}
function caSlerp(a,b,t){let dot=a.reduce((s,v,i)=>s+v*b[i],0);if(dot<0){b=b.map(v=>-v);dot=-dot;}let q;
 if(dot>.9995)q=a.map((v,i)=>caMix(v,b[i],t));else{const theta=Math.acos(Math.max(-1,Math.min(1,dot))),sn=Math.sin(theta);q=a.map((v,i)=>(v*Math.sin((1-t)*theta)+b[i]*Math.sin(t*theta))/sn);}const n=Math.hypot(...q);return q.map(v=>v/n);
}
function caBasis([x,y,z,w]){return [[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w)],[2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w)],[2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y)]];}
export function caInterpolate(a,b,t){
 if(t<=0)return caClone(a);if(t>=1)return caClone(b);if(a.projection!==b.projection)return caClone(a);
 const x=caNormalizeSnapshot(a),y=caNormalizeSnapshot(b),c=x.camera,d=y.camera,rot={camera:{}};gsSetOrbitBasis(rot,caBasis(caSlerp(caQuat(c),caQuat(d),t)));
 return {...x,camera:{...c,...rot.camera,zoom:caLogMix(c.zoom,d.zoom,t),baseHeight:caLogMix(c.baseHeight,d.baseHeight,t),distance:caLogMix(c.distance,d.distance,t),fov:caMix(c.fov,d.fov,t),near:caLogMix(c.near,d.near,t),pan:c.pan.map((v,i)=>caMix(v,d.pan[i],t)),target:c.target.map((v,i)=>caMix(v,d.target[i],t))}};
}
/** Project is validated on edits, not once per rendered frame. End regions hold nearest key. */
export function caSample(project,frame){
 const keys=project.keys;if(!keys.length)return null;if(!Number.isFinite(frame))throw Error('Invalid playhead');
 if(frame<=keys[0].frame)return caClone(keys[0].snapshot);if(frame>=keys.at(-1).frame)return caClone(keys.at(-1).snapshot);
 let high=keys.findIndex(k=>k.frame>=frame);if(keys[high].frame===frame)return caClone(keys[high].snapshot);
 const a=keys[high-1],b=keys[high];return caInterpolate(a.snapshot,b.snapshot,caEase((frame-a.frame)/(b.frame-a.frame),a.easing));
}
export function caPutKey(project,{frame,snapshot,name,easing='smooth',id=null}){
 const next=caClone(project),existing=next.keys.find(k=>k.frame===frame);const key={id:existing?.id||id||`key-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`,frame,name:name??existing?.name??`视角 ${frame}`,easing:existing?.easing||easing,snapshot:caNormalizeSnapshot(snapshot)};
 next.keys=next.keys.filter(k=>k.frame!==frame);next.keys.push(key);return caValidateProject(next);
}
export function caMoveKey(project,id,frame){const next=caClone(project),key=next.keys.find(k=>k.id===id);if(!key)throw Error('Keyframe missing');key.frame=frame;return caValidateProject(next);}
export function caResize(project,duration,fps,{stretch=true}={}){
 const next=caClone(project),oldTotal=caFrameCount(project.duration,project.fps),total=caFrameCount(duration,fps);next.duration=total/fps;next.fps=fps;
 if(stretch)for(const k of next.keys)k.frame=oldTotal===1?1:1+Math.round((k.frame-1)*(total-1)/(oldTotal-1));
 return caValidateProject(next);
}
export function caOrbit(project,snapshot){const total=caFrameCount(project.duration,project.fps);if(total<5)throw Error('环绕示例至少需要 5 帧 / Orbit needs at least 5 frames');
 const result={...caClone(project),keys:[]},base=caNormalizeSnapshot(snapshot);
 for(let i=0;i<5;i++){const s=caClone(base);s.camera.azimuth+=i*90;result.keys.push({id:'orbit-'+i,frame:1+Math.round(i*(total-1)/4),name:`${i*90}°`,easing:'linear',snapshot:s});}return caValidateProject(result);
}
