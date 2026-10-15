import {captureCameraSnapshot,applyCameraSnapshot,validateCameraSnapshot} from '../shared/camera-controls.js';
import {createAnimationRenderTarget} from '../shared/animation-render-target.js';
import {drawSceneGuides} from '../shared/scene-guides.js';

/** Mesh-specific boundary. Shared timeline/export modules never import this viewer. */
export function createMeshAnimationAdapter({getViewer,getModels,getScene}){
 let aspect=null,oldStyle=null;
 const resizePreview=()=>{const v=getViewer();if(!v?.canvas||!aspect)return;const c=v.canvas,p=c.parentElement,w=Math.min(p.clientWidth,p.clientHeight*aspect),h=w/aspect;c.style.inset='auto';c.style.position='absolute';c.style.left=`${(p.clientWidth-w)/2}px`;c.style.top=`${(p.clientHeight-h)/2}px`;c.style.width=`${w}px`;c.style.height=`${h}px`;v.requestRender();};
 const observer=new ResizeObserver(resizePreview);if(getViewer()?.canvas)observer.observe(getViewer().canvas.parentElement);
 const ready=()=>{const v=getViewer();return !!v&&!v.disposed&&!v.contextLost&&!!v.triangleCount&&getModels().length>0;};
 const requireViewer=()=>{if(!ready())throw Error('请先加载网格模型 / Load a mesh first');return getViewer();};
 return {space:'lod-arrangement',ready,
  capture(){const v=requireViewer(),snapshot=captureCameraSnapshot(v,{space:'lod-arrangement',scene:getScene()});return validateCameraSnapshot({...snapshot,version:2,camera:{...snapshot.camera,roll:snapshot.camera.roll||0,distance:snapshot.camera.distance??v.distance,fov:snapshot.camera.fov??v.fov,near:snapshot.camera.near??v.near}},{space:'lod-arrangement',scene:getScene()});},
  assert(snapshot){requireViewer();validateCameraSnapshot(snapshot,{space:'lod-arrangement',scene:getScene()});},
  apply(snapshot,{render=true}={}){const v=requireViewer();v.fly?.leave();applyCameraSnapshot([v],snapshot,{space:'lod-arrangement',scene:getScene(),render});},
  guard(){const models=getModels(),scale=getScene().scale,v=getViewer();return ()=>ready()&&getViewer()===v&&getModels()===models&&getScene().scale===scale;},
  createCapture(width,height){return createAnimationRenderTarget(requireViewer(),width,height);},
  drawGuides(ctx,width,height){const v=requireViewer();drawSceneGuides(ctx,v,Math.min(width,420*height/Math.max(1,v.canvas.clientHeight)),height,height/Math.max(1,v.canvas.clientHeight));},
  canvas(){return getViewer()?.canvas;},
  setPreviewAspect(value){const v=getViewer();if(!v?.canvas)return;const c=v.canvas;aspect=Number.isFinite(value)&&value>0?value:null;
   if(aspect){if(!oldStyle)oldStyle=Object.fromEntries(['inset','position','left','top','width','height'].map(k=>[k,c.style[k]]));c.parentElement.classList.add('ca-composition');resizePreview();}
   else if(oldStyle){for(const[k,v]of Object.entries(oldStyle))c.style[k]=v;oldStyle=null;c.parentElement.classList.remove('ca-composition');v.requestRender();}
  },
  destroy(){observer.disconnect();},
 };
}
