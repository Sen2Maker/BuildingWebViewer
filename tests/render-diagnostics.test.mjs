import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRenderer,diagnosticSummary,RenderDiagnosticProbe} from '../src/shared/render-diagnostics.js';
test('unavailable and generic renderer names remain unknown',()=>{assert.match(classifyRenderer(null),/^unknown/);assert.match(classifyRenderer('ANGLE'),/^unknown/);assert.match(classifyRenderer('ANGLE Adreno 740'),/^hardware/);assert.match(classifyRenderer('ANGLE SwiftShader Vulkan'),/^software/);assert.match(classifyRenderer('llvmpipe'),/^software/);});
test('missing timings remain null and invalid samples do not become zero',()=>{assert.equal(diagnosticSummary([]),null);assert.deepEqual(diagnosticSummary([NaN,2,Infinity,4,6]),{samples:3,medianMs:4,p95Ms:6});});
test('optional sampling stays idle by default and tolerates absent GPU timers',()=>{let queried=0;const viewer={canvas:{addEventListener(){}},gl:{getExtension(){queried++;return null;},isContextLost(){return false;}}};const p=new RenderDiagnosticProbe(viewer);p.begin();p.end();assert.equal(queried,0);assert.equal(p.samples.submit.length,0);p.start();p.begin();p.end();p.sort(2,4);p.stop();assert.equal(p.active,false);assert.equal(p.samples.submit.length,1);assert.equal(p.samples.gpu.length,0);assert.deepEqual(p.samples.sort,[2]);assert.deepEqual(p.samples.roundTrip,[4]);});

test('frame diagnostics separate idle gaps, interaction intervals and upload CPU cost',()=>{
 const p=new RenderDiagnosticProbe({canvas:{addEventListener(){}},gl:{getExtension(){return null;},isContextLost(){return false;}}});
 p.frame(1,2,true);assert.equal(p.samples.frameCpu.length,0);
 p.start();p.frame(100,3,true);p.frame(120,4,true);p.frame(5000,2,false);p.upload(7);p.stop();
 assert.equal(p.frameCount,3);assert.deepEqual(p.samples.frameInterval,[20,4880]);assert.deepEqual(p.samples.interactionInterval,[20]);assert.deepEqual(p.samples.upload,[7]);
});
