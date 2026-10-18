/** Camera synchronization shared by Mesh and Wireframe. Call pause during data rebuild/export. */
export function copyViewerCamera(source,target){
  target.navigation?.reset();target.camera={...source.camera,pan:[...source.camera.pan]};target.target=[...source.target];target.baseHeight=source.baseHeight;
  for(const key of ['projection','distance','fov','near'])target[key]=source[key];
  target.flyPose=source.flyPose?{eye:[...source.flyPose.eye],basis:source.flyPose.basis.map(v=>[...v])}:null;
}
export function createViewerComparison(getViewers,isEnabled=()=>true){
  let paused=0,guard=false;const originals=new WeakMap();
  const pause=fn=>{paused++;try{return fn();}finally{paused--;}};
  function install(viewer){if(originals.has(viewer))return;const original=viewer.render.bind(viewer);originals.set(viewer,original);
    viewer.render=function(){const result=original(),all=getViewers();if(paused||guard||!isEnabled()||this.flyPose&&!this.fly?.active||all.some(v=>v!==this&&v.fly?.active))return result;
      guard=true;try{for(const other of all)if(other!==viewer){copyViewerCamera(viewer,other);(originals.get(other)||other.render.bind(other))();}}finally{guard=false;}return result;};
  }
  return {install,pause,sync(source=getViewers()[0]){if(source)pause(()=>{for(const v of getViewers())if(v!==source){copyViewerCamera(source,v);v.render();}});}};
}
