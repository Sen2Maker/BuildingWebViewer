import test from 'node:test';import assert from 'node:assert/strict';
import {gsProjectionCapacity,GS_PROJECTED_BYTES,GS_PROJECTED_LIMIT} from '../src/gaussian/projection-pass.js';
import {RenderDiagnosticProbe} from '../src/shared/render-diagnostics.js';
test('projection memory budget falls back without reducing source population',()=>{assert.equal(gsProjectionCapacity(594870),true);assert.equal(594870*GS_PROJECTED_BYTES,26174280);assert.equal(gsProjectionCapacity(Math.floor(GS_PROJECTED_LIMIT/GS_PROJECTED_BYTES)),true);assert.equal(gsProjectionCapacity(Math.floor(GS_PROJECTED_LIMIT/GS_PROJECTED_BYTES)+1),false);assert.equal(gsProjectionCapacity(-1),false);});
test('event delivery excludes incompatible timestamps; animation scheduling stays separate',()=>{const p=new RenderDiagnosticProbe({canvas:{addEventListener(){}},gl:{getExtension(){return null;},isContextLost(){return false;}}});p.start();p.input(120,100);p.input(130,1e12);p.raf(17);p.stop();assert.deepEqual(p.samples.eventDelivery,[20]);assert.deepEqual(p.samples.rafQueue,[17]);});
test('automatic orbit restores camera/training pose and never overwrites a replacement scene',()=>{const viewer={generation:2,count:1,canvas:{addEventListener(){}},gl:{getExtension(){return null;},isContextLost(){return false;}},camera:{azimuth:12,pan:[2,3]},target:[1,2,3],trainingPose:{eye:[4,5,6]},distance:7,orbitLens:{fx:1},flyPose:null,stopNavigation(){},leaveTraining(){this.trainingPose=null;},requestRender(){}};const saved=JSON.stringify(viewer.camera),p=new RenderDiagnosticProbe(viewer);p.start(true);p.motion(p.started+1000);assert.equal(viewer.camera.azimuth,32);p.stop();assert.equal(JSON.stringify(viewer.camera),saved);assert.deepEqual(viewer.trainingPose,{eye:[4,5,6]});p.start(true);viewer.generation++;viewer.camera.azimuth=99;p.motion(p.started+500);p.stop();assert.equal(viewer.camera.azimuth,99);});
import {gsOpacityRadius,GS_FRAGMENT_ALPHA} from '../src/gaussian/support.js';
test('transparent support skips only fragments already below the original alpha threshold',()=>{
 for(const opacity of [.001,GS_FRAGMENT_ALPHA,.005,.02,.1,.35,.7,1]){
  const radius=gsOpacityRadius(opacity);assert.ok(radius>=0&&radius<=3);
  for(let x=-3;x<=3;x+=.025){const alpha=opacity*Math.exp(-.5*x*x);if(alpha>=GS_FRAGMENT_ALPHA)assert.ok(Math.abs(x)<=radius+1e-9);}
 }
 assert.equal(gsOpacityRadius(.7),3);assert.equal(gsOpacityRadius(.001),0);
});
