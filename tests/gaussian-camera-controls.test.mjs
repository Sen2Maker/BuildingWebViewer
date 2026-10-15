import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyGaussianBookmark,migrateGaussianBookmarks,mountGaussianCameraControls,LEGACY_GAUSSIAN_BOOKMARK_KEY,GAUSSIAN_MIGRATION_KEY} from '../src/gaussian/camera-controls.js';
import {parseCameraBookmarks,serializeCameraBookmarks} from '../src/shared/camera-controls.js';
import {CAMERA_NAV_DEFAULTS} from '../src/shared/camera-navigation.js';
const sharedKey='BuildingWebViewer.camera-bookmarks.v1.raw-world';
const legacy=()=>({name:'Saved Gaussian',camera:{azimuth:-55,elevation:38,roll:0,zoom:2,pan:[1,-2]},projection:'perspective',fov:55,distance:10,baseHeight:20,near:.01,origin:[100,200,300],target:[1,2,3],trainingPose:null,orbitLens:null});
const store=initial=>{const values=new Map(Object.entries(initial||{}));return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};};
test('legacy Gaussian bookmarks keep world coordinates and calibrated training orientation',()=>{
 const saved=legacyGaussianBookmark(legacy());assert.deepEqual(saved.snapshot.camera.target,[101,202,303]);assert.equal(saved.snapshot.projection,'perspective');
 const record=legacy();record.camera.zoom=1;record.trainingPose={eye:[4,5,6],basis:[[1,0,0],[0,0,1],[0,-1,0]],width:1200,height:800,fx:900,fy:800};
 const trained=legacyGaussianBookmark(record,0,{clientWidth:800,clientHeight:600});assert.deepEqual(trained.snapshot.camera.target,[104,215,306]);assert.equal(trained.snapshot.camera.lens.fx,1);assert(Math.abs(trained.snapshot.camera.lens.fy-8/9)<1e-12);
 assert.throws(()=>legacyGaussianBookmark({...legacy(),origin:[NaN,0,0]}));
});
test('migration preserves original backup, avoids duplicates and does not resurrect deleted shared views',()=>{
 const original=JSON.stringify([legacy()]),storage=store({[LEGACY_GAUSSIAN_BOOKMARK_KEY]:original});const first=migrateGaussianBookmarks(storage);assert.equal(first.migrated,1);assert.equal(first.error,null);assert.equal(storage.getItem(LEGACY_GAUSSIAN_BOOKMARK_KEY),original);assert.equal(parseCameraBookmarks(storage.getItem(sharedKey),'raw-world').bookmarks.length,1);
 assert.equal(migrateGaussianBookmarks(storage).migrated,0);assert.equal(parseCameraBookmarks(storage.getItem(sharedKey),'raw-world').bookmarks.length,1);
 storage.setItem(sharedKey,serializeCameraBookmarks([],'raw-world'));migrateGaussianBookmarks(storage);assert.equal(parseCameraBookmarks(storage.getItem(sharedKey),'raw-world').bookmarks.length,0);assert.equal(JSON.parse(storage.getItem(GAUSSIAN_MIGRATION_KEY)).length,1);
});
test('migration leaves bookmarks accessible when storage is full or existing shared data is corrupt',()=>{
 const original=JSON.stringify([legacy()]),storage=store({[LEGACY_GAUSSIAN_BOOKMARK_KEY]:original});storage.setItem=()=>{throw Error('quota');};const failed=migrateGaussianBookmarks(storage);assert.match(failed.error.message,/quota/);assert.equal(failed.records.length,1);assert.equal(storage.getItem(LEGACY_GAUSSIAN_BOOKMARK_KEY),original);
 const corrupt=store({[LEGACY_GAUSSIAN_BOOKMARK_KEY]:original,[sharedKey]:'broken'});const result=migrateGaussianBookmarks(corrupt);assert(result.error);assert.equal(result.records.length,1);assert.equal(corrupt.getItem(sharedKey),'broken');
 const snapshot=legacyGaussianBookmark(legacy()).snapshot,full=store({[LEGACY_GAUSSIAN_BOOKMARK_KEY]:original,[sharedKey]:serializeCameraBookmarks(Array.from({length:100},(_,i)=>({id:String(i),name:String(i),snapshot})),'raw-world')});assert.equal(migrateGaussianBookmarks(full).remaining,1);assert.equal(parseCameraBookmarks(full.getItem(sharedKey),'raw-world').bookmarks.length,100);
});
function fixture(){
 const storage=store(),nodes=[],frames=new Map();let sequence=0;const doc={activeElement:null,documentElement:{lang:'zh-CN'}};
 function node(tag){const attrs=new Map(),handlers=new Map(),classes=new Set();const n={tagName:tag.toUpperCase(),ownerDocument:doc,children:[],style:{},value:'',textContent:'',dataset:{},hidden:false,clientWidth:800,clientHeight:600,append(...values){this.children.push(...values);for(const value of values)value.parentElement=this;},replaceChildren(...values){for(const child of this.children)child.parentElement=null;this.children=[];this.append(...values);},prepend(...values){this.children.unshift(...values);for(const value of values)value.parentElement=this;},setAttribute(k,v){attrs.set(k,String(v));},getAttribute:k=>attrs.get(k),addEventListener(k,fn){if(!handlers.has(k))handlers.set(k,new Set());handlers.get(k).add(fn);},removeEventListener(k,fn){handlers.get(k)?.delete(fn);},dispatch(k){for(const fn of handlers.get(k)||[])fn({target:n,preventDefault(){}});},focus(){doc.activeElement=this;},remove(){},closest(selector){if(selector==='[hidden]'){let at=this;while(at){if(at.hidden)return at;at=at.parentElement;}}return null;},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(k,on){on?classes.add(k):classes.delete(k);},contains:k=>classes.has(k)}};nodes.push(n);return n;}
 doc.createElement=node;doc.createTextNode=text=>({textContent:text});doc.addEventListener=()=>{};doc.removeEventListener=()=>{};
 const win={localStorage:storage,requestAnimationFrame(fn){frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id),addEventListener(){},removeEventListener(){}};doc.defaultView=win;
 const camera=node('div'),bookmarks=node('div'),toolbar=node('div'),stage=node('div'),canvas=node('canvas');stage.append(canvas);doc.getElementById=id=>({'camera-controls':camera,'bookmark-controls':bookmarks}[id]);doc.querySelector=selector=>selector==='.viewer-toolbar'?toolbar:null;
 const viewer={canvas,camera:{azimuth:-55,elevation:38,roll:0,zoom:1,pan:[0,0]},origin:[0,0,0],target:[0,0,0],baseHeight:20,distance:10,fov:55,near:.01,projection:'perspective',bounds:[[-1,-1,-1],[1,1,1]],count:1,navigation:{settings:{...CAMERA_NAV_DEFAULTS}},basis:()=>[[1,0,0],[0,1,0],[0,0,1]],render(){},requestRender(){this.render();},stopNavigation(){this.fly?.leave();},leaveTraining(){this.trainingPose=null;},setNavigation(){},focusOrbit(){}};
 const globals={document:doc,window:win,localStorage:storage,matchMedia:()=>({matches:false}),requestAnimationFrame:win.requestAnimationFrame,cancelAnimationFrame:win.cancelAnimationFrame},before=new Map();for(const[k,value]of Object.entries(globals)){before.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value,writable:true,configurable:true});}
 return {doc,nodes,viewer,camera,bookmarks,toolbar,byLabel:label=>nodes.find(n=>n.getAttribute?.('aria-label')===label),restore(){for(const[k,d]of before)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}};
}
test('Gaussian composition retains shared camera/bookmarks, fly settings, navigation and lens controls together',()=>{
 const f=fixture();try{
  const controls=mountGaussianCameraControls({viewer:f.viewer,root:f.doc});assert(controls);assert.equal(mountGaussianCameraControls({viewer:f.viewer,root:f.doc}),controls);
  for(const label of ['缩放倍率','已保存视角','旋转中心','转头灵敏度数值','投影模式','近裁剪距离','视野角 number']){const field=f.byLabel(label);assert(field,`Missing ${label}`);let at=field;while(at.parentElement)at=at.parentElement;assert([f.camera,f.bookmarks].includes(at),`Detached ${label}`);}
  const preserve=f.byLabel('增删文件时保持当前视角');preserve.checked=false;preserve.dispatch('change');assert.equal(controls.preserveView,false);
  assert.equal(f.toolbar.children.filter(n=>n.className==='gs-fly-entry').length,1);
  const fov=f.byLabel('视野角 number');f.viewer.orbitLens={fx:3,fy:4};f.viewer.trainingPose={};fov.value='60';fov.onchange();assert.equal(f.viewer.fov,60);assert.equal(f.viewer.orbitLens,null);assert.equal(f.viewer.trainingPose,null);
  const near=f.byLabel('近裁剪距离');near.value='';near.onchange();assert.equal(f.viewer.near,.01);near.value='.2';near.onchange();assert.equal(f.viewer.near,.2);
  const zoom=f.byLabel('缩放倍率');zoom.value='2';zoom.dispatch('input');assert.equal(f.viewer.camera.zoom,2);assert(f.byLabel('转头灵敏度数值').parentElement);
 }finally{f.restore();}
});
