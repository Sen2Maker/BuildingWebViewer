import assert from 'node:assert/strict';
import {projectCanStartBox} from '../src/shared/project-tree.js';
import {mountProjectSidebar,PROJECT_SIDEBAR_STORAGE,projectSidebarPreferences} from '../src/shared/sidebar.js';

const event = (pointerType, button=0, interactive=false) => ({pointerType,button,target:{closest:()=>interactive}});
assert(projectCanStartBox(event('mouse')));
assert(projectCanStartBox(event(undefined)));
for(const pointerType of ['touch','pen']) assert(!projectCanStartBox(event(pointerType)));
assert(!projectCanStartBox(event('mouse',2)));
assert(!projectCanStartBox(event('mouse',0,true)));
console.log('PASS touch and pen preserve native project scrolling; mouse box selection excludes controls');
assert.deepEqual(projectSidebarPreferences(null),{width:300,desktopCollapsed:false,mobileCollapsed:true});
assert.deepEqual(projectSidebarPreferences({width:900,desktopCollapsed:'false',mobileCollapsed:false}),{width:500,desktopCollapsed:false,mobileCollapsed:false});

const stored = new Map(), watches=[];
const oldResize=globalThis.ResizeObserver,oldMutation=globalThis.MutationObserver;
class Observer {constructor(callback){this.callback=callback;watches.push(this);}observe(){}disconnect(){this.disconnected=true;}}
globalThis.ResizeObserver=globalThis.MutationObserver=Observer;
function node(){const classes=new Set();return {id:'sidebar',style:{setProperty(name,value){this[name]=value;}},classList:{contains:name=>classes.has(name),toggle(name,on){if(on)classes.add(name);else classes.delete(name);},add:name=>classes.add(name),remove:name=>classes.delete(name)},attributes:new Map(),setAttribute(name,value){this.attributes.set(name,value);},focus(){this.focused=true;},contains(){return false;}};}
const media={matches:false,listeners:new Set(),addEventListener(name,callback){this.callback=callback;this.listeners.add(callback);},removeEventListener(name,callback){assert(this.listeners.delete(callback));this.removed=true;}};
function mount(){
 const workspace=node(),sidebar=node(),toggle=node(),collapse=node(),separator=node();workspace.clientWidth=1400;
 const win={matchMedia:()=>media,localStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)}};
 sidebar.ownerDocument={defaultView:win,activeElement:null};
 const api=mountProjectSidebar({workspace,sidebar,toggle,collapse,separator});return {workspace,sidebar,toggle,collapse,separator,api};
}
try {
 const first=mount();assert.equal(first.workspace.style['--project-width'],'300px');assert.equal(first.sidebar.inert,false);
 const key=key=>first.separator.onkeydown({key,preventDefault(){}});
 for(let i=0;i<10;i++)key('ArrowRight');
 assert.equal(first.workspace.style['--project-width'],'460px');
 first.workspace.clientWidth=650;watches[0].callback();assert.equal(first.workspace.style['--project-width'],'290px');
 first.workspace.clientWidth=1400;watches[0].callback();assert.equal(first.workspace.style['--project-width'],'460px');
 first.collapse.onclick();assert.equal(first.sidebar.inert,true);
 assert.equal(JSON.parse(stored.get(PROJECT_SIDEBAR_STORAGE)).desktopCollapsed,true);
 const second=mount();assert.equal(second.workspace.style['--project-width'],'460px');assert.equal(second.sidebar.inert,true);
 second.toggle.onclick();assert.equal(second.sidebar.inert,false);
 media.matches=true;media.callback();assert.equal(second.sidebar.inert,true);
 second.toggle.onclick();assert.equal(second.sidebar.inert,false);
 media.matches=false;media.callback();assert.equal(second.sidebar.inert,false);
 assert.equal(JSON.parse(stored.get(PROJECT_SIDEBAR_STORAGE)).mobileCollapsed,false);
 first.api.destroy();second.api.destroy();assert(watches.every(observer=>observer.disconnected));assert(media.removed);
 assert.equal(second.toggle.onclick,null);assert.equal(second.separator.onkeydown,null);
 console.log('PASS project width and collapse preferences transfer between viewers, preserve desktop/mobile choices and survive narrow layouts');
 console.log('PASS sidebar teardown disconnects observers and pointer/keyboard listeners');
 stored.set(PROJECT_SIDEBAR_STORAGE,'broken JSON');const corrupted=mount();assert.equal(corrupted.workspace.style['--project-width'],'300px');corrupted.api.destroy();
 console.log('PASS corrupted stored preferences fall back to safe defaults');
} finally {globalThis.ResizeObserver=oldResize;globalThis.MutationObserver=oldMutation;}

const {setViewerProjection}=await import('../src/shared/viewer-projection.js');
let paused=false,pauseCalls=0;
const makeViewer=(height,fov,zoom)=>({projection:'orthographic',baseHeight:height,distance:1,fov,camera:{zoom},stopNavigation(){assert(paused);this.stopped=true;},requestRender(){assert(paused);this.rendered=true;}});
const viewers=[makeViewer(12,55,2),makeViewer(50,70,3)];
const pauseSync=callback=>{paused=true;pauseCalls++;try{callback();}finally{paused=false;}};
setViewerProjection(viewers,'perspective',pauseSync);assert.equal(pauseCalls,1);
for(const viewer of viewers){assert(viewer.stopped&&viewer.rendered);assert.equal(viewer.projection,'perspective');assert(Math.abs(2*viewer.distance*Math.tan(viewer.fov*Math.PI/360)-viewer.baseHeight)<1e-10);}
setViewerProjection(viewers,'orthographic',pauseSync);assert(Math.abs(viewers[0].baseHeight-12)<1e-10);assert(Math.abs(viewers[1].baseHeight-50)<1e-10);
assert.equal(viewers[0].camera.zoom,2);assert.equal(viewers[1].camera.zoom,3);
viewers[0].distance=999;setViewerProjection(viewers,'orthographic',pauseSync);assert(Math.abs(viewers[0].baseHeight-12)<1e-10);
assert.throws(()=>setViewerProjection(viewers,'invalid',pauseSync),/Unsupported/);
console.log('PASS comparison projection switches preserve individual field of view and zoom inside one synchronization pause');

// An imported training camera can have independent horizontal and vertical focal
// lengths. Reuse the real renderer pose conversion without allocating WebGL.
const {GaussianViewer}=await import('../src/gaussian/renderer.js');
const {gsViewSpec,gsProjectPosition}=await import('../src/shared/camera-geometry.js');
const {captureCameraSnapshot,applyCameraSnapshot}=await import('../src/shared/camera-controls.js');
const trained=Object.create(GaussianViewer.prototype);
Object.assign(trained,{camera:{azimuth:0,elevation:0,roll:0,zoom:1,pan:[0,0]},projection:'perspective',fov:55,distance:10,near:.001,baseHeight:20,target:[0,0,0],origin:[0,0,0],canvas:{clientWidth:800,clientHeight:600},trainingPose:{eye:[0,0,10],basis:[[1,0,0],[0,1,0],[0,0,1]],width:1000,height:500,fx:900,fy:600},stopNavigation(){assert(paused);},requestRender(){assert(paused);},render(){}});
const point=[1,1,0],projectedBefore=gsProjectPosition(point,gsViewSpec(trained,800,600));
const pose=trained.trainingPose;
setViewerProjection([trained],'perspective',pauseSync);assert.equal(trained.trainingPose,pose);
setViewerProjection([trained],'orthographic',pauseSync);assert.equal(trained.trainingPose,null);
assert.deepEqual(trained.orbitLens,{fx:1.2,fy:.8});
assert(Math.abs(trained.baseHeight-12.5)<1e-12);
const ortho=gsProjectPosition(point,gsViewSpec(trained,800,600));assert(Math.abs(ortho.y-projectedBefore.y)<1e-10);
setViewerProjection([trained],'perspective',pauseSync);
const projectedAfter=gsProjectPosition(point,gsViewSpec(trained,800,600));
assert(Math.abs(projectedAfter.x-projectedBefore.x)<1e-10);assert(Math.abs(projectedAfter.y-projectedBefore.y)<1e-10);
// Transfer a calibrated view through the shared raw-world bookmark contract.
const snapshot=captureCameraSnapshot(trained,{space:'raw-world'}),other={...makeViewer(100,90,4),camera:{},origin:[0,0,0],target:[0,0,0],render(){},basis(){return [[1,0,0],[0,1,0],[0,0,1]];}};
applyCameraSnapshot([other],snapshot,{space:'raw-world',pauseSync});
assert.deepEqual(other.orbitLens,trained.orbitLens);
setViewerProjection([other],'orthographic',pauseSync);assert(Math.abs(other.baseHeight-12.5)<1e-10);
setViewerProjection([other],'perspective',pauseSync);
const transferred=gsProjectPosition(point,gsViewSpec(other,800,600));
assert(Math.abs(transferred.x-projectedBefore.x)<1e-10);assert(Math.abs(transferred.y-projectedBefore.y)<1e-10);
console.log('PASS calibrated fx/fy survive real training-pose conversion, projection round trips and cross-tool bookmarks without target-plane vertical zoom jumps');
