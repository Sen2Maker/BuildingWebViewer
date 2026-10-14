import assert from 'node:assert/strict';
import {mountDrawingControls} from '../src/generate/drawing-controls.js';

// Exercise real event handlers with a small DOM/canvas host; no WebGL is needed.
function fixture(){
 const nodes=[],keys=new Set(),ctx=new Proxy({}, {get:()=>()=>{}});
 function node(tag){
  const events=new Map(),captured=new Set(),attrs=new Map();
  const n={tagName:tag.toUpperCase(),children:[],style:{},hidden:false,textContent:'',value:'',clientWidth:800,clientHeight:600,
   append(...items){for(const item of items){this.children.push(item);item.parentElement=this;}},after(other){other.parentElement=this.parentElement;},
   setAttribute(k,v){attrs.set(k,String(v));},getAttribute(k){return attrs.get(k);},classList:{toggle(){}},
   querySelector(){return null;},getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0}),focus(){},remove(){},
   addEventListener(k,fn){events.set(k,[...(events.get(k)||[]),fn]);},
   fire(k,args={}){const e={type:k,target:n,button:0,pointerId:1,clientX:300,clientY:300,preventDefault(){},stopImmediatePropagation(){},...args};for(const f of events.get(k)||[])f(e);},
   setPointerCapture(id){captured.add(id);},hasPointerCapture:id=>captured.has(id),releasePointerCapture(id){captured.delete(id);n.fire('lostpointercapture',{pointerId:id});},
   click(){if(!n.disabled)n.onclick?.();},
  };nodes.push(n);return n;
 }
 globalThis.document={documentElement:{lang:'en'},createElement:node,createTextNode:text=>({textContent:text}),addEventListener(k,fn){if(k==='keydown')keys.add(fn);},removeEventListener(k,fn){keys.delete(fn);}};
 globalThis.window={devicePixelRatio:1};globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 const stage=node('div'),canvas=node('canvas'),toolbar=node('div'),container=node('div');stage.append(canvas,toolbar);
 const viewer={canvas,origin:[0,0,0],pointCount:0,camera:{zoom:1,pan:[0,0]},target:[0,0,0],baseHeight:20,distance:40,fov:55,near:.01,projection:'orthographic',basis:()=>[[1,0,0],[0,1,0],[0,0,1]],stopNavigation(){},requestRender(){},zoomBy(){}};
 let controls,busy=false;const committed=[],modes=[],errors=[];
 controls=mountDrawingControls({viewer,toolbar,container,isBusy:()=>busy,onError:e=>errors.push(e),onCommit:s=>committed.push(s),onModeChange:mode=>{modes.push(mode);controls.setEnabled(mode!=='navigate');}});
 const overlay=nodes.find(n=>n.className==='draw-overlay'),button=text=>nodes.find(n=>n.tagName==='BUTTON'&&n.textContent===text);
 return {controls,overlay,button,committed,modes,errors,nodes,busy:v=>{busy=v;},key(key,target={tagName:'CANVAS'}){for(const fn of keys)fn({key,target,preventDefault(){},stopImmediatePropagation(){}});}};
}
{
 const f=fixture();f.controls.setEnabled(true);f.overlay.fire('pointerdown');f.overlay.fire('pointermove',{clientX:450});
 const draft=f.controls.getDraft();assert(draft.points.length>=2);assert(f.overlay.hasPointerCapture(1));
 // The top-level Adjust view action disables drawing even with a captured draft.
 f.controls.setEnabled(false);assert.equal(f.overlay.style.pointerEvents,'none');assert.equal(f.overlay.hidden,false);assert(!f.overlay.hasPointerCapture(1));assert.deepEqual(f.controls.getDraft(),draft);
 f.overlay.fire('pointermove',{clientX:600});assert.deepEqual(f.controls.getDraft(),draft);
 f.button('Resume drawing').click();assert.equal(f.overlay.style.pointerEvents,'auto');f.overlay.fire('pointerdown',{clientX:500,clientY:340});f.overlay.fire('pointerup');assert(f.controls.getDraft().points.length>draft.points.length);
 const resumed=f.controls.getDraft();f.key('Escape');assert.equal(f.overlay.style.pointerEvents,'none');assert.deepEqual(f.controls.getDraft(),resumed);assert.equal(f.modes.at(-1),'navigate');
 f.key('Enter');assert.equal(f.committed.length,1);assert.equal(f.committed[0].type,'stroke');assert.deepEqual(f.committed[0].points,resumed.points);assert.equal(f.controls.hasDraft(),false);assert.equal(f.overlay.hidden,true);assert.equal(f.errors.length,0);f.controls.destroy();
 console.log('PASS top-level pause, pointer capture release, resume, Escape and generation preserve all draft vertices');
}
{
 const f=fixture();f.controls.setEnabled(true);f.key('Escape');assert.equal(f.overlay.style.pointerEvents,'none');assert.equal(f.controls.hasDraft(),false);
 f.controls.setEnabled(true);f.overlay.fire('pointerdown');f.overlay.fire('pointermove',{clientX:500});f.button('Discard draft').click();assert(!f.controls.hasDraft());assert.equal(f.overlay.style.pointerEvents,'none');assert(!f.overlay.hasPointerCapture(1));
 f.controls.setEnabled(true);f.overlay.fire('pointerdown');f.overlay.fire('pointercancel');assert(!f.controls.hasDraft());f.controls.destroy();
 console.log('PASS empty brush can stop, explicit discard exits drawing, and canceled touch strokes leave no ghost capture');
}
{
 const f=fixture();f.controls.setEnabled(true);f.button('Face').click();
 for(const [x,y] of [[300,300],[450,300],[450,400]]){f.overlay.fire('pointerdown',{clientX:x,clientY:y});f.overlay.fire('pointerup');}
 const before=f.controls.getDraft();f.key('Escape');f.button('Resume drawing').click();assert.deepEqual(f.controls.getDraft(),before);assert.equal(f.button('Face').getAttribute('aria-pressed'),'true');
 f.key('Escape',{tagName:'INPUT'});assert.equal(f.overlay.style.pointerEvents,'auto');
 f.busy(true);f.button('Pause · Adjust view').click();assert.equal(f.overlay.style.pointerEvents,'auto');f.busy(false);f.key('Enter');assert.equal(f.committed[0].type,'polygon');assert.deepEqual(f.committed[0].points,before.points);f.controls.destroy();
 console.log('PASS face type and locked work plane survive pause; text editing and busy operations do not steal mode shortcuts');
}
