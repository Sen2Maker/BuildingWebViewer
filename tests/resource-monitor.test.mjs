import assert from 'node:assert/strict';
import {viewerResourceStats, readableMemory} from '../src/shared/resource-monitor.js';
const shared={byteLength:120}, other={byteLength:24};
const stats=viewerResourceStats([{models:[{},{}],triangleCount:4,buffers:{triangles:shared,grid:other}},{pointCount:10,edgeCount:3,buffers:{wire:shared},entityCache:new Map([[1,{points:{byteLength:120},colors:{byteLength:120}}]])}]);
assert.equal(stats.bufferBytes,384);assert.equal(stats.models,2);assert.equal(stats.points,10);assert.equal(stats.edges,3);
assert.equal(viewerResourceStats([{disposed:true,buffers:{grid:other}}]).bufferBytes,0);
assert.equal(readableMemory(undefined),'不可用');assert.equal(readableMemory(NaN),'不可用');assert.equal(readableMemory(0),'0 B');assert.equal(readableMemory(1024**3),'1.00 GiB');
console.log('PASS resource metrics avoid duplicate buffers, skip disposed viewers and label unavailable memory');
