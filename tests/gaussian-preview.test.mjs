import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {gsReadPreview,gsViewingProfile} from '../src/gaussian/preview.js';
import {gsProjectBlob,gsReadProjectBlob} from '../src/gaussian/project-state.js';
import {gsExportPly} from '../src/gaussian/edit-state.js';
import {GaussianViewer,gsSortedOrder} from '../src/gaussian/renderer.js';
import {GS_SORT_WORKER} from '../src/gaussian/sort-worker.js';
function file(count){
 const names=['x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3',...Array.from({length:45},(_,i)=>'f_rest_'+i)];
 const head=new TextEncoder().encode('ply\nformat binary_little_endian 1.0\nelement vertex '+count+'\n'+names.map(n=>'property float '+n).join('\n')+'\nend_header\n');
 const data=new Float32Array(count*names.length);for(let i=0;i<count;i++){data[i*names.length]=i;data[i*names.length+10]=1;}
 const blob=new Blob([head,data]);let maxRead=0;return {size:blob.size,slice(a,b){maxRead=Math.max(maxRead,Math.min(b,blob.size)-a);return blob.slice(a,b);},get maxRead(){return maxRead;}};
}
test('bounded preview samples the entire file without whole-file reads or SH allocation',async()=>{
 const source=file(100003),model=await gsReadPreview(source,{limit:20000});
 assert.equal(model.sourceCount,100003);assert.equal(model.count,16668);assert.equal(model.sampleStep,6);assert.equal(model.centers.at(-3),100002);assert.equal(model.rest,null);assert.equal(model.source,null);assert(model.preview);assert(source.maxRead<=1048576);
 assert.throws(()=>gsExportPly(model),/full data/);
 const fullFlags=new Uint8Array(100003);fullFlags[777]=4;fullFlags[12]=2;model.editFlags=new Uint8Array(model.count);
 const restored=await gsReadProjectBlob(gsProjectBlob([{id:'test',parsed:model,savedFlags:fullFlags}]));assert.deepEqual(restored.get('test'),fullFlags);
 const fresh=await gsReadProjectBlob(gsProjectBlob([{id:'new',parsed:model}]));assert.equal(fresh.size,0);
});
test('preview validates bounds and supports cancellation',async()=>{
 const f=file(10);await assert.rejects(()=>gsReadPreview({size:f.size-1,slice:f.slice}),/Incomplete/);
 await assert.rejects(()=>gsReadPreview(f,{cancelled:()=>true}),/cancelled/);
 await assert.rejects(()=>gsReadPreview(f,{limit:0}),/budget/);
 assert.equal(gsViewingProfile('auto',true).limit,20000);assert.equal(gsViewingProfile('auto',true,true).points,false);assert.equal(gsViewingProfile('auto',true,true).limit,20000);assert.equal(gsViewingProfile('full',true,true).limit,0);
});
test('camera translation never requires reordering; rotation does',()=>{
 const viewer={sortDirty:false,sortForward:[0,0,1],target:[100,200,300],sortTarget:[0,0,0],basis:()=>[[1,0,0],[0,1,0],[0,0,1]]};
 assert.equal(GaussianViewer.prototype.needsSort.call(viewer),false);viewer.basis=()=>[[1,0,0],[0,0,1],[0,1,0]];assert.equal(GaussianViewer.prototype.needsSort.call(viewer),true);
});
test('reused worker scratch buffers sort correctly for consecutive views and generations',()=>{
 const results=[],ctx=vm.createContext({Float32Array,Uint32Array,postMessage:m=>results.push(m)});vm.runInContext(GS_SORT_WORKER,ctx);
 const centers=new Float32Array([1,2,3,-1,1,0,3,5,-2]);ctx.onmessage({data:{type:'data',generation:1,centers:centers.buffer}});
 for(const forward of [[0,0,1],[1,0,0],[0,-1,0]]){ctx.onmessage({data:{type:'sort',generation:1,forward}});const depths=Array.from({length:3},(_,i)=>forward.reduce((n,v,j)=>n+v*centers[i*3+j],0));assert.deepEqual([...new Uint32Array(results.at(-1).order)],[...gsSortedOrder(depths)]);}
 ctx.onmessage({data:{type:'sort',generation:0,forward:[0,0,1]}});assert.equal(results.length,3);
});

test('history releases old geometry without losing undo across preview/full transitions',async()=>{
 const {GaussianEdits}=await import('../src/gaussian/edit-state.js');const edits=new GaussianEdits();const old={count:3,centers:new Float32Array(9)};
 edits.apply([old],f=>f|4);const flags=old.editFlags;edits.releaseGeometry(old);assert.equal(edits.undoStack[0].changes[0].model.centers,undefined);
 const reloaded={count:3,editFlags:flags};edits.undo();assert.deepEqual([...reloaded.editFlags],[0,0,0]);edits.redo();assert.deepEqual([...reloaded.editFlags],[4,4,4]);
});
