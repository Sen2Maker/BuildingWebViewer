import test from 'node:test';
import assert from 'node:assert/strict';
import {CameraNavigation, cameraNavigationSettings, cameraNavigationScale, CAMERA_NAV_DEFAULTS} from '../src/shared/camera-navigation.js';
import {GaussianViewer} from '../src/gaussian/renderer.js';
import {gsViewSpec} from '../src/shared/camera-geometry.js';

test('settings restore validates stale or malformed local preferences', () => {
  assert.deepEqual(cameraNavigationSettings(null), CAMERA_NAV_DEFAULTS);
  const s = cameraNavigationSettings({rotateSpeed: -10, panSpeed: 'fast', zoomSpeed: Infinity, smoothingMs: 50000, smoothing: false, adaptive:'no'});
  assert.equal(s.rotateSpeed, .05); assert.equal(s.panSpeed, .65); assert.equal(s.zoomSpeed, .55);
  assert.equal(s.smoothingMs, 350); assert.equal(s.smoothing, false); assert.equal(s.adaptive, true);
});

test('time-based smoothing gives the same displacement at 30, 60 and 120 Hz', () => {
  const sample = hz => {
    const nav = new CameraNavigation({smoothingMs:100}); nav.enqueue([10,-3,2,-7,.5],0);
    const total = [0,0,0,0,0];
    for (let i=1; i<=hz/5; i++) nav.step(i*1000/hz).forEach((v,j)=>total[j]+=v);
    return total;
  };
  const reference = sample(30);
  for (const hz of [60,120]) sample(hz).forEach((v,i)=>assert.ok(Math.abs(v-reference[i])<1e-12));
  assert.ok(reference[0]>8 && reference[0]<10);
});

test('smooth motion converges exactly and stops; immediate input has no tail', () => {
  const nav = new CameraNavigation(), received = [3,4,5,6,.7], total=[0,0,0,0,0]; nav.enqueue(received,0);
  for (let t=16;t<1200;t+=16) nav.step(t).forEach((v,i)=>total[i]+=v);
  total.forEach((v,i)=>assert.ok(Math.abs(v-received[i])<1e-12)); assert.equal(nav.active,false);
  const direct = new CameraNavigation({smoothing:false});direct.enqueue(received,0);
  assert.deepEqual(direct.step(0),received);assert.equal(direct.active,false);
  nav.enqueue(received,20);nav.reset();assert.deepEqual(nav.step(5000),[0,0,0,0,0]);
});

test('perspective pan tracks focal-plane scale; close-up orbit slows down', () => {
  const v={camera:{zoom:1},canvas:{clientHeight:500},projection:'perspective',distance:10,fov:55,baseHeight:100};
  const full = cameraNavigationScale(v,CAMERA_NAV_DEFAULTS);v.camera.zoom=4;
  const close = cameraNavigationScale(v,CAMERA_NAV_DEFAULTS);assert.ok(Math.abs(close.pan/full.pan-.25)<1e-12);assert.equal(close.rotateX/full.rotateX,.5);
  v.fov=25;assert.ok(cameraNavigationScale(v,CAMERA_NAV_DEFAULTS).rotateX<close.rotateX);
  const fixed = cameraNavigationScale(v,{...CAMERA_NAV_DEFAULTS,adaptive:false});assert.equal(fixed.rotateX,.35*.3);
});

test('leaving a rolled training view preserves orientation, eye and vertical focal length', () => {
  const angle=.7,c=Math.cos(angle),s=Math.sin(angle);
  const v={trainingPose:{basis:[[c,s,0],[-s,c,0],[0,0,1]],eye:[0,0,4],width:1000,height:500,fx:600,fy:600},canvas:{clientWidth:600,clientHeight:600},camera:{zoom:1,pan:[0,0]},target:[0,0,0],distance:4,projection:'perspective',fov:55,baseHeight:2,near:.1};
  v.basis=()=>GaussianViewer.prototype.basis.call(v);
  const before=gsViewSpec(v,600,600);GaussianViewer.prototype.leaveTraining.call(v);const after=gsViewSpec(v,600,600);
  before.basis.flat().forEach((n,i)=>assert.ok(Math.abs(n-after.basis.flat()[i])<1e-12));
  before.eye.forEach((n,i)=>assert.ok(Math.abs(n-after.eye[i])<1e-12));assert.ok(Math.abs(before.fy-after.fy)<1e-10);
});

test('touch orbit and pinch route through the same configurable navigation', async () => {
  const {mountTouchCamera}=await import('../src/shared/touch-camera.js');
  const handlers={},moves=[],zooms=[],captures=new Set();
  const viewer={canvas:{setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)},navigatePixels:(...args)=>moves.push(args),zoomBy:factor=>zooms.push(factor),requestRender(){}};
  mountTouchCamera(viewer,(name,handler)=>handlers[name]=handler);
  const fire=(name,id,x,y)=>handlers[name]({pointerType:'touch',pointerId:id,clientX:x,clientY:y,preventDefault(){}});
  fire('pointerdown',1,0,0);fire('pointermove',1,10,5);assert.deepEqual(moves.pop(),[10,5,false]);
  fire('pointerdown',2,30,5);fire('pointermove',2,50,5);assert.deepEqual(moves.pop(),[10,0,true]);assert.equal(zooms.pop(),2);
  fire('pointercancel',1);fire('pointercancel',2);assert.equal(captures.size,0);
});
