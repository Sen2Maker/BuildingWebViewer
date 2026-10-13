import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeGaussianRequest} from '../src/gaussian/native-view.js';
test('native launch sends only project identity and owned file keys',()=>{const file={projectId:'project',nativeKey:'key',largeModel:new Float32Array(100)};assert.deepEqual(nativeGaussianRequest([{file}]),{id:'project',keys:['key'],lang:'zh'});assert.throws(()=>nativeGaussianRequest([]));assert.throws(()=>nativeGaussianRequest([{file},{file:{projectId:'other',nativeKey:'key'}}]));assert.throws(()=>nativeGaussianRequest([{file:{projectId:'project'}}]));});
