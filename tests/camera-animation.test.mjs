import assert from 'node:assert/strict';
import {caNewProject,caPutKey,caSample,caResize,caMoveKey,caOrbit,caValidateProject,caParse,caSerialize,caFrameCount,caTime,caEase} from '../src/shared/camera-animation.js';
const pose=(az=0,zoom=1)=>({format:'BuildingWebViewer.camera',version:2,space:'lod-arrangement',projection:'orthographic',scene:{ids:['house'],scale:'real'},camera:{azimuth:az,elevation:30,roll:0,zoom,baseHeight:10,distance:20,fov:55,near:.001,pan:[0,0],target:[0,0,0]}});
let p=caNewProject();p=caPutKey(p,{frame:1,snapshot:pose(170),easing:'linear'});p=caPutKey(p,{frame:8,snapshot:pose(-170,4)});
assert.equal(caTime(1,30),0);assert.equal(caTime(8,30),7/30);assert.equal(caFrameCount(10,30),300);
assert.equal(caSample(p,1).camera.azimuth,170);assert.equal(caSample(p,8).camera.azimuth,-170);assert.equal(caSample(p,149).camera.zoom,4);
assert(Math.abs(Math.abs(caSample(p,4.5).camera.azimuth)-180)<1e-6);assert(Math.abs(caSample(p,4.5).camera.zoom-2)<1e-8);
assert.equal(caEase(.5,'hold'),0);assert.equal(caEase(1,'hold'),1);assert(caEase(.1,'smooth')<.1);assert(caEase(.9,'smooth')>.9);
p.keys[0].easing='hold';assert.equal(caSample(p,7.9).camera.azimuth,170);assert.equal(caSample(p,8).camera.azimuth,-170);
assert.throws(()=>caMoveKey(p,p.keys[1].id,1));assert.throws(()=>caMoveKey(p,p.keys[0].id,151));
const updated=caPutKey(p,{frame:8,snapshot:pose(45)});assert.equal(updated.keys.length,2);assert.equal(updated.keys[1].id,p.keys[1].id);assert.equal(updated.keys[1].snapshot.camera.azimuth,45);
assert.deepEqual(caParse(caSerialize(p)),p);assert.throws(()=>caParse(caSerialize(p).replace('"version": 1','"version": 999')));
assert.throws(()=>caValidateProject({...p,keys:[p.keys[0],{...p.keys[1],snapshot:{...p.keys[1].snapshot,scene:{ids:['other'],scale:'real'}}}]}));
const resized=caResize(p,1,60);assert.equal(resized.duration,1);assert.equal(resized.keys[1].frame,4);assert.throws(()=>caResize(p,.1,30,{stretch:false}));assert.equal(p.keys[1].frame,8);
const orbit=caOrbit(caNewProject(),pose());assert.equal(orbit.keys.length,5);assert.equal(orbit.keys.at(-1).frame,150);for(const frame of [10,45,80,125])assert(Number.isFinite(caSample(orbit,frame).camera.azimuth));
for(const elevation of [-89,0,89]){const a=pose(-90);a.camera.elevation=elevation;a.camera.roll=40;const b=pose(90);b.camera.elevation=elevation;b.camera.roll=-40;const q=caPutKey(caPutKey(caNewProject(),{frame:1,snapshot:a}),{frame:150,snapshot:b});for(let f=1;f<=150;f++)assert(caSample(q,f).camera.elevation>=-90&&caSample(q,f).camera.elevation<=90);}
console.log('PASS one-based frame timing, exact keys, shortest quaternion rotation, logarithmic zoom, easing/hold, validation, rescaling and orbit');

// Output preferences survive a JSON backup; unsupported sizes and formats fail validation.
const preferences=caNewProject();preferences.output={format:'webm',width:1080,height:1920,bitrate:5e6,guides:true};assert.deepEqual(caParse(caSerialize(preferences)).output,preferences.output);
for(const patch of [{width:1279},{height:0},{format:'unknown'},{bitrate:NaN},{guides:'true'}])assert.throws(()=>caValidateProject({...preferences,output:{...preferences.output,...patch}}));
