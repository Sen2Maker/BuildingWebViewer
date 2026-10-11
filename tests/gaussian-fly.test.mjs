import test from 'node:test';
import assert from 'node:assert/strict';
import {FlyCameraPose, flyCameraSettings} from '../src/shared/fly-camera.js';
import {gsDot3, gsViewSpec} from '../src/shared/camera-geometry.js';
const basis=[[1,0,0],[0,1,0],[0,0,1]], near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
test('mouse right looks right, mouse down looks down; eye does not orbit',()=>{
 const p=new FlyCameraPose([3,4,5],basis);p.look(90,0,1);near(-p.basis[2][0],1);assert.deepEqual(p.eye,[3,4,5]);
 const q=new FlyCameraPose([0,0,0],basis);q.look(0,45,1);assert.ok(-q.basis[2][1]<0);
});
test('orientation stays orthonormal and cannot flip at the pitch poles',()=>{
 const p=new FlyCameraPose([0,0,0],basis);p.look(10000,-10000,.12);
 p.basis.forEach(v=>near(Math.hypot(...v),1));near(gsDot3(p.basis[0],p.basis[1]),0);near(gsDot3(p.basis[1],p.basis[2]),0);
 assert.ok(Math.abs(p.pitch)<Math.PI/2);p.look(0,1,.12);assert.ok(p.pitch<Math.PI*.495);
});
test('W moves forward; D right; up follows the entry camera vertical; diagonals stay bounded',()=>{
 const p=new FlyCameraPose([0,0,0],basis);p.move(0,1,0,2);assert.deepEqual(p.eye,[0,0,-2]);p.move(1,0,0,1);p.move(0,0,1,1);assert.deepEqual(p.eye,[1,1,-2]);
 const q=new FlyCameraPose([0,0,0],basis);q.move(1,1,1,2);near(Math.hypot(...q.eye),2);
 const r=new FlyCameraPose([0,0,0],[[0,1,0],[-1,0,0],[0,0,1]]);r.move(0,0,1,2);assert.deepEqual(r.eye,[-2,0,0]);
 q.eye=[0,0,0];q.look(0,-800,.12);q.move(0,1,1,1);near(Math.hypot(...q.eye),1);
});
test('movement is frame-rate independent and analog input allows slow travel',()=>{
 for(const hz of [30,60,120]){const p=new FlyCameraPose([0,0,0],basis);for(let i=0;i<hz;i++)p.move(.1,0,0,2/hz);near(p.eye[0],.2);}
});
test('fly projection uses independent eye with the same calibrated lens',()=>{
 const v={basis:()=>basis,projection:'perspective',trainingPose:{eye:[0,0,2],width:640,height:480,fx:700,fy:650},target:[0,0,0],camera:{zoom:1,pan:[0,0]},distance:2,baseHeight:10};
 const before=gsViewSpec(v,640,480);v.flyPose=new FlyCameraPose(before.eye,basis);const entry=gsViewSpec(v,640,480);assert.deepEqual(entry,before);
 v.flyPose.move(0,1,0,1);assert.deepEqual(gsViewSpec(v,640,480).eye,[0,0,1]);near(gsViewSpec(v,640,480).fx,700);
});
test('preference limits reject invalid stored input',()=>{assert.deepEqual(flyCameraSettings(null),{sensitivity:.12,speed:.15,rollSpeed:30});assert.deepEqual(flyCameraSettings({sensitivity:-5,speed:Infinity}),{sensitivity:.01,speed:.15,rollSpeed:30});});

test('controller handles keys, simultaneous touch, cancellation, pointer lock loss and view handoff', async()=>{
 const {mountFlyCameraControls}=await import('../src/shared/fly-controls.js');
 class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.handlers={};this.style={};this.attrs={};this.classList={add(){},remove(){},toggle(){}};this.clientWidth=640;this.clientHeight=480;this.value='';}
  append(...children){this.children.push(...children);children.forEach(el=>el.parentElement=this);}
  setAttribute(k,v){this.attrs[k]=v;} addEventListener(k,fn){(this.handlers[k]||=[]).push(fn);} removeEventListener(k,fn){this.handlers[k]=this.handlers[k].filter(f=>f!==fn);}
  fire(k,props={}){const e={target:this,preventDefault(){},stopImmediatePropagation(){},...props};for(const fn of this.handlers[k]||[])fn(e);return e;}
  focus(){} remove(){} setPointerCapture(){} getBoundingClientRect(){return {left:0,top:0,width:120,height:120};}
 }
 const saved=new Map(), install=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});};
 const doc=new Element(), win=new Element(), toolbar=new Element(), panel=new Element(), stage=new Element(), canvas=new Element('canvas');stage.append(canvas);
 doc.documentElement={lang:'en'};doc.createElement=tag=>new Element(tag);doc.querySelector=()=>toolbar;doc.exitPointerLock=()=>{doc.pointerLockElement=null;doc.fire('pointerlockchange');};
 const raf=new Map();let sequence=0,now=0;install('document',doc);install('window',win);install('localStorage',{getItem:()=>null,setItem(){}});install('matchMedia',()=>({matches:true}));install('performance',{now:()=>now});install('requestAnimationFrame',fn=>{raf.set(++sequence,fn);return sequence;});install('cancelAnimationFrame',id=>raf.delete(id));
 const step=()=>{now+=16;const batch=[...raf.values()];raf.clear();batch.forEach(fn=>fn(now));};
 const v={canvas,count:1,basis(){return this.flyPose?.basis||this.trainingPose?.basis||basis;},projection:'perspective',fov:55,target:[0,0,0],camera:{zoom:1,pan:[0,0]},distance:2,baseHeight:10,stopNavigation(){this.fly?.leave();},requestRender(){}};
 const descendants=el=>[el,...el.children.flatMap(descendants)];
 try{
  const fly=mountFlyCameraControls(v,panel), entry=toolbar.children[0];const before=gsViewSpec(v,640,480);entry.onclick();assert.ok(fly.active);assert.deepEqual(gsViewSpec(v,640,480).eye,before.eye);
  doc.fire('keydown',{code:'KeyW'});for(let i=0;i<10;i++)step();doc.fire('keyup',{code:'KeyW'});step();assert.ok(v.flyPose.eye[2]<before.eye[2]);const stopped=[...v.flyPose.eye];assert.equal(raf.size,0);step();assert.deepEqual(v.flyPose.eye,stopped);
  const hud=stage.children.find(el=>el.className==='gs-fly-hud'), all=descendants(hud), pad=all.find(el=>el.className==='gs-fly-stick'), look=all.find(el=>el.className==='gs-fly-look'), rise=all.find(el=>el.textContent==='Rise');
  pad.fire('pointerdown',{pointerId:1,clientX:85,clientY:60});rise.fire('pointerdown',{pointerId:2});look.fire('pointerdown',{pointerId:3,button:0,clientX:0,clientY:0});look.fire('pointermove',{pointerId:3,clientX:50,clientY:0});step();assert.ok(v.flyPose.eye[0]>0);assert.ok(v.flyPose.eye[1]>0);assert.ok(-v.flyPose.basis[2][0]>0);
  pad.fire('pointercancel',{pointerId:1});rise.fire('pointercancel',{pointerId:2});look.fire('pointercancel',{pointerId:3});step();assert.equal(raf.size,0);
  doc.fire('keydown',{code:'KeyQ'});for(let i=0;i<10;i++)step();doc.fire('keyup',{code:'KeyQ'});step();assert.ok(v.flyPose.roll>0);const roll=v.flyPose.roll;doc.fire('keydown',{code:'KeyE'});step();doc.fire('keyup',{code:'KeyE'});step();assert.ok(v.flyPose.roll<roll);assert.equal(raf.size,0);
  const final=gsViewSpec(v,640,480);doc.fire('keydown',{code:'Escape'});assert.equal(fly.active,false);assert.equal(v.flyPose,null);assert.deepEqual(gsViewSpec(v,640,480).eye,final.eye);assert.deepEqual(gsViewSpec(v,640,480).basis,final.basis);
  entry.onclick();doc.pointerLockElement=canvas;doc.fire('pointerlockchange');doc.pointerLockElement=null;doc.fire('pointerlockchange');assert.equal(fly.active,false);
  entry.onclick();doc.fire('keydown',{code:'KeyW'});win.fire('blur');assert.equal(fly.active,false);assert.equal(raf.size,0);fly.dispose();
 }finally{for(const[key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}
});
