import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {GS_SORT_WORKER} from '../src/gaussian/sort-worker.js';
import {GaussianViewer} from '../src/gaussian/renderer.js';
test('recycled sort output preserves order, reuses capacity and ignores stale generations',()=>{
 const replies=[],ctx=vm.createContext({performance,Float32Array,Uint32Array,postMessage:r=>replies.push(r)});vm.runInContext(GS_SORT_WORKER,ctx);
 const send=data=>{ctx.input=data;vm.runInContext('onmessage({data:input})',ctx);};
 send({type:'data',generation:1,centers:new Float32Array([0,0,3,0,0,1,0,0,2]).buffer});
 send({type:'sort',generation:1,forward:[0,0,1]});const first=replies.pop();assert.deepEqual([...new Uint32Array(first.order)],[1,2,0]);
 send({type:'recycle',generation:1,order:first.order});send({type:'sort',generation:1,forward:[0,0,-1]});const next=replies.pop();assert.equal(next.order,first.order);assert.deepEqual([...new Uint32Array(next.order)],[0,2,1]);
 send({type:'data',generation:2,centers:new Float32Array([0,0,1,0,0,2]).buffer});send({type:'recycle',generation:1,order:next.order});send({type:'sort',generation:2,forward:[0,0,1]});assert.equal(replies.pop().order.byteLength,8);
});
test('renderer returns result buffers after staging, including stale or lost-context results',()=>{
 let copies=0,renders=0;const recycled=[],viewer=Object.create(GaussianViewer.prototype);
 Object.assign(viewer,{generation:1,packed:{},target:[0,0,0],sortWorker:{postMessage:(m,transfer)=>recycled.push([m,transfer])},uploadOrder:a=>{copies++;assert.equal(a.length,3);},requestRender:()=>renders++});
 const message={generation:1,forward:[0,0,1],order:new Uint32Array([1,2,0]).buffer};viewer.receiveSort(message);
 assert.equal(copies,1);assert.equal(renders,1);assert.equal(recycled[0][0].order,message.order);assert.equal(recycled[0][1][0],message.order);
 viewer.contextLost=true;viewer.receiveSort(message);viewer.receiveSort({...message,generation:0});assert.equal(copies,1);assert.equal(recycled.length,3);
});
