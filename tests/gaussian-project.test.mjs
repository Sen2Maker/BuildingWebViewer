import assert from 'node:assert/strict';
import { gsProjectBlob,gsReadProjectBlob } from '../src/gaussian/project-state.js';
const flags=new Uint8Array([1,2,4,0]);const blob=gsProjectBlob([{id:'a',parsed:{editFlags:flags}},{id:'b',savedFlags:new Uint8Array([4,0])}]);flags[0]=0;
const result=await gsReadProjectBlob(blob);assert.deepEqual([...result.get('a')],[1,2,4,0]);assert.deepEqual([...result.get('b')],[4,0]);
await assert.rejects(()=>gsReadProjectBlob(blob.slice(0,blob.size-1)));await assert.rejects(()=>gsReadProjectBlob(new Blob(['bad'])));
assert.equal((await gsReadProjectBlob(gsProjectBlob([]))).size,0);
console.log('PASS Gaussian edit snapshot roundtrip and input validation');
