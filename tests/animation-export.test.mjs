import assert from 'node:assert/strict';
import {caNewProject,caPutKey} from '../src/shared/camera-animation.js';
import {caRunFrames,caExportAnimation} from '../src/shared/animation-export.js';
import {createStoreZip} from '../src/shared/zip-writer.js';
import {readZipDirectory,zipCRC32} from '../src/shared/zip-import.js';
import {applyCameraSnapshot} from '../src/shared/camera-controls.js';
const pose=az=>({format:'BuildingWebViewer.camera',version:2,space:'lod-arrangement',projection:'orthographic',scene:{ids:['a'],scale:'real'},camera:{azimuth:az,elevation:35,roll:0,zoom:1,baseHeight:10,distance:20,fov:55,near:.001,pan:[0,0],target:[0,0,0]}});
let project=caNewProject();project.duration=1;project.fps=8;project=caPutKey(caPutKey(project,{frame:1,snapshot:pose(0),easing:'linear'}),{frame:8,snapshot:pose(90)});
const frames=[],times=[];await caRunFrames({project,render:(s,i)=>{frames.push(s.camera.azimuth);return i;},write:async(_,i,t,d)=>{times.push([i,t,d]);},yieldTask:async()=>{}});
assert.equal(frames.length,8);assert.equal(frames[0],0);assert.equal(frames[7],90);assert.deepEqual(times[7],[7,7/8,1/8]);assert.equal(times.reduce((sum,v)=>sum+v[2],0),1);
const aborter=new AbortController();let count=0;await assert.rejects(caRunFrames({project,signal:aborter.signal,render:()=>{},write:()=>{if(++count===3)aborter.abort();},yieldTask:async()=>{}}),e=>e.name==='AbortError');assert.equal(count,3);
await assert.rejects(caRunFrames({project,render:()=>{},write:()=>{},guard:()=>false,yieldTask:async()=>{}}),/Scene changed/);
// Stored PNG sequence archives can be read by the existing independent ZIP reader.
const blocks=[],zip=createStoreZip({write:async b=>blocks.push(b)}),payload=new TextEncoder().encode('sample-png-bytes');await zip.add('frame_000001.png',payload);await zip.add('animation.json',new TextEncoder().encode('{}'));await assert.rejects(zip.add('frame_000001.png',payload),/Duplicate/);await zip.close();const blob=new Blob(blocks);const entries=await readZipDirectory(blob);assert.equal(entries.length,2);assert.equal(entries[0].crc,zipCRC32(payload));assert.equal(entries[0].method,0);assert.equal(entries[0].length,payload.length);await assert.rejects(zip.add('x',payload));
const limited=createStoreZip({write:async()=>{},maxBytes:10});await assert.rejects(limited.add('x',payload),/output limit/);
// Non-presenting camera updates reuse the existing shared validator and setter.
let renders=0;const viewer={camera:{},render(){renders++;},target:[0,0,0],baseHeight:10};applyCameraSnapshot([viewer],pose(20),{space:'lod-arrangement',scene:{ids:['a'],scale:'real'},render:false});assert.equal(renders,0);assert.equal(viewer.camera.azimuth,20);applyCameraSnapshot([viewer],pose(30),{space:'lod-arrangement',scene:{ids:['a'],scale:'real'}});assert.equal(renders,1);
// Export cleanup restores the pre-export camera and releases the frame target on encoder failure.
let canceled=false,disposed=false,restored=false,encoded=0;
globalThis.document={createElement:()=>({getContext:()=>({putImageData(){}})})};globalThis.ImageData=class{constructor(){}};
globalThis.BWVVideoWriter={supported:async()=>true,create:async()=>({get info(){return {encodedFrames:encoded};},add:async()=>{encoded++;throw Error('encoder failed');},cancel:async()=>{canceled=true;},finish:async()=>new Blob()})};
const adapter={assert(){},guard:()=>()=>true,capture:()=>pose(-55),createCapture:()=>({render:()=>new Uint8ClampedArray(64*64*4),dispose(){disposed=true;}}),apply(s){if(s.camera.azimuth===-55)restored=true;}};
await assert.rejects(caExportAnimation({project,adapter,width:64,height:64}),/encoder failed/);assert(canceled&&disposed&&restored);
console.log('PASS exact frame counts/timestamps, cancellation, scene guards, ZIP CRCs, non-presenting camera update and failure cleanup');

// Successful export reports actual encoded packets and always restores the view.
encoded=0;disposed=restored=false;globalThis.BWVVideoWriter.create=async()=>({get info(){return {encodedFrames:encoded,codec:'test'};},add:async()=>{encoded++;},finish:async()=>new Blob(['video']),cancel:async()=>{}});
const done=await caExportAnimation({project,adapter,width:64,height:64});assert.equal(done.info.encodedFrames,8);assert.equal(done.info.duration,1);assert.equal(done.blob.size,5);assert(disposed&&restored);
// Reject an encoder which silently drops a frame.
globalThis.BWVVideoWriter.create=async()=>({info:{encodedFrames:7},add:async()=>{},finish:async()=>new Blob(),cancel:async()=>{}});
await assert.rejects(caExportAnimation({project,adapter,width:64,height:64}),/frame count mismatch/);
