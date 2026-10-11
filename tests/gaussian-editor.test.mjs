import assert from 'node:assert/strict';
import test from 'node:test';
import {GaussianEdits,gsExportPly,gsEditStats} from '../src/gaussian/edit-state.js';
import {gsParseGaussianPly} from '../src/gaussian/ply.js';
import {gsTrainingPose,gsProjectPosition,gsViewSpec} from '../src/shared/camera-geometry.js';
import {GaussianViewer} from '../src/gaussian/renderer.js';
import {GS_SORT_WORKER} from '../src/gaussian/sort-worker.js';
import vm from 'node:vm';
function model(n=4){return {count:n,editFlags:new Uint8Array(n)};}
function fixture(){
 const names=['x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3','custom'];
 const head=new TextEncoder().encode('ply\nformat binary_little_endian 1.0\nelement vertex 4\n'+names.map(n=>'property float '+n+'\n').join('')+'end_header\n');
 const out=new Uint8Array(head.length+4*names.length*4);out.set(head);const v=new DataView(out.buffer);
 for(let i=0;i<4;i++){const values=[i,0,2,0,0,0,1,-2,-2,-2,1,0,0,0,100+i];values.forEach((x,j)=>v.setFloat32(head.length+(i*names.length+j)*4,x,true));}
 return out;
}
test('selection, hide, delete and undo remain isolated across models',()=>{const a=model(),b=model(2),e=new GaussianEdits();e.apply([a],(f,i)=>i<2?f|1:f);e.apply([a,b],f=>f&1?(f|2)&~1:f);assert.deepEqual(gsEditStats([a,b]),{total:6,selected:0,hidden:2,deleted:0});e.undo();assert.deepEqual([...a.editFlags],[1,1,0,0]);e.undo();assert.equal(a.editFlags[0],0);e.redo();e.apply([a],f=>f&1?(f|4)&~1:f);assert.equal(e.redoStack.length,0);assert.deepEqual([...b.editFlags],[0,0]);e.undo();assert.equal(a.editFlags[0],1);});
test('undo budget rejects oversized transaction before mutation',()=>{const m=model(),e=new GaussianEdits();e.budget=1;assert.throws(()=>e.apply([m],f=>f|1));assert.equal(m.editFlags[0],0);});
test('export filters source records and preserves unknown fields byte for byte',async()=>{const m=await gsParseGaussianPly(fixture());new GaussianEdits().attach(m);m.editFlags.set([1,2,4,0]);const blob=gsExportPly(m);const p=await gsParseGaussianPly(await blob.arrayBuffer());assert.equal(p.count,2);assert.equal(p.centers[3],3);const stride=m.source.stride;assert.deepEqual(p.source.bytes.subarray(p.source.headerEnd,p.source.headerEnd+stride),m.source.bytes.subarray(m.source.headerEnd,m.source.headerEnd+stride));assert.equal((await gsParseGaussianPly(await gsExportPly(m,{includeHidden:true}).arrayBuffer())).count,3);assert.equal((await gsParseGaussianPly(await gsExportPly(m,{selectedOnly:true}).arrayBuffer())).count,1);});
test('Inria camera rotation and focal lengths reproduce pixel coordinates',()=>{const c={position:[10,20,30],rotation:[[1,0,0],[0,1,0],[0,0,1]],width:1000,height:500,fx:600,fy:650};const pose=gsTrainingPose(c,[10,20,0]);const viewer={basis:()=>pose.basis,trainingPose:pose,projection:'perspective',camera:{zoom:1,pan:[0,0]},distance:2,target:[0,0,32],baseHeight:2,near:.01};const spec=gsViewSpec(viewer,1000,500);assert.deepEqual(gsProjectPosition([0,0,32],spec),{x:500,y:250,depth:2});assert.deepEqual(gsProjectPosition([1,1,32],spec),{x:800,y:575,depth:2});assert.equal(gsProjectPosition([0,0,29],spec),null);const fitted=gsViewSpec(viewer,500,500);assert.equal(fitted.fx,300);assert.equal(fitted.fy,325);});
test('invalid training rotations rejected',()=>{assert.throws(()=>gsTrainingPose({position:[0,0,0],rotation:[[1,0,0],[1,0,0],[0,0,1]],width:100,height:100,fx:10,fy:10}));});
test('depth sorting re-runs on 180 degree camera reversal',()=>{const fake={sortDirty:false,sortForward:[0,0,1],basis:()=>[[1,0,0],[0,1,0],[0,0,-1]],sortTarget:[0,0,0],target:[0,0,0],interacting:false};assert.equal(GaussianViewer.prototype.needsSort.call(fake),true);});
test('worker sorts back-to-front and rejects stale data generations',()=>{const result=[],context={Float32Array,Uint32Array,postMessage:m=>result.push(m)};vm.createContext(context);vm.runInContext(GS_SORT_WORKER,context);context.onmessage({data:{type:'data',generation:7,centers:new Float32Array([0,0,1,0,0,-2,0,0,0]).buffer}});context.onmessage({data:{type:'sort',generation:6,forward:[0,0,1]}});assert.equal(result.length,0);context.onmessage({data:{type:'sort',generation:7,forward:[0,0,1]}});assert.deepEqual([...new Uint32Array(result[0].order)],[1,2,0]);});
