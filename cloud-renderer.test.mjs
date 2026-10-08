// CPU/mock-GL regression checks; run: node cloud-renderer.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const encode = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const paletteURL = encode(fs.readFileSync(new URL('./palettes.js', import.meta.url), 'utf8'));
const source = fs.readFileSync(new URL('./cloud-renderer.js', import.meta.url), 'utf8').replace("'./palettes.js'", JSON.stringify(paletteURL));
const {CloudViewer} = await import(encode(source));
const {samplePalette, paletteUniforms, PALETTE_DEFINITIONS} = await import(paletteURL);
globalThis.window = {devicePixelRatio: 2};
globalThis.ResizeObserver = class {observe() {} disconnect() {}};
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

function fixture() {
  const uploads = [], deleted = [], draws = [], values = new Map(), uniforms = {}, events = {};
  let serial = 0, bound;
  const gl = new Proxy({
    POINTS: 0, LINES: 1, NO_ERROR: 0, OUT_OF_MEMORY: 1285,
    createShader: () => ({}), createProgram: () => ({}), getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: (_, name) => ['position','vertexColor','scalarValue'].indexOf(name), getUniformLocation: (_, name) => name,
    getParameter: () => [1, 64], getError: () => 0,
    createBuffer: () => ({id: ++serial}), bindBuffer: (_, buffer) => {bound = buffer;},
    bufferData: (_, array) => {uploads.push(bound); values.set(bound, new Float32Array(array));}, deleteBuffer: buffer => deleted.push(buffer),
    uniform3fv: (name, array) => {uniforms[name] = [...array];}, uniform2f: (name, a, b) => {uniforms[name] = [a,b];},
    uniform1i: (name, value) => {uniforms[name] = value;},
    drawArrays: (type, first, count) => draws.push({type,count,offset: [...uniforms.originOffset],mode:uniforms.colorMode}),
  }, {get: (object, name) => object[name] ?? (() => {})});
  const canvas = {getContext: () => gl, style: {}, clientWidth: 800, clientHeight: 600,
    getBoundingClientRect: () => ({width: 800,height: 600}), addEventListener: (name, fn) => {events[name] = fn;}, removeEventListener() {}};
  const viewer = new CloudViewer(canvas);
  return {viewer, gl, uploads, deleted, draws, values, uniforms, events};
}
function item(name, offset = 0, z = [0,10], intensity = [2,4]) {
  return {key: {name}, name, color: [.2,.4,.8], cloud: {
    positions: new Float64Array([1e6 + offset, 2e6, z[0], 1e6 + offset + .125, 2e6 + .25, z[1]]), count: 2,
    fields: {intensity: new Float32Array(intensity), file: new Float32Array([2,7])},
  }};
}

const qa = fixture(), v = qa.viewer, a = item('a'), b = item('b',100,[10,100],[4,10]), c = item('c',200,[100,200],[10,20]);
v.setClouds([a]); const entryA = v.activeClouds[0], pointsA = entryA.points;
v.zoomBy(2); v.camera.pan = [1,2]; const worldTarget = v.target.map((value, i) => value + v.origin[i]);
v.setClouds([a,b]);
assert.equal(v.activeClouds[0],entryA); assert.equal(v.activeClouds[0].points,pointsA); assert(!qa.deleted.includes(pointsA.buffer));
assert.deepEqual(v.target.map((value,i)=>value+v.origin[i]),worldTarget); assert.equal(v.camera.zoom,2); assert.deepEqual(v.camera.pan,[1,2]);
assert.deepEqual(v.colorRange,{min:0,max:100});
for(const entry of v.activeClouds) {
  const positions = qa.values.get(entry.points.buffer);
  for(let i=0;i<positions.length;i++) assert.equal(positions[i]+entry.origin[i%3],entry.cloud.positions[i]);
}
qa.draws.length=0; v.render();
assert.deepEqual(qa.draws.filter(draw=>draw.type===0).map(draw=>draw.offset),v.activeClouds.map(entry=>entry.origin.map((value,i)=>value-v.origin[i])));
assert.equal(qa.values.get(pointsA.buffer)[3]-qa.values.get(pointsA.buffer)[0],.125);
console.log('PASS independent point buffers survive scene growth; world camera and large-coordinate alignment remain stable');

v.setOptions({colorMode:'field:intensity'}); const scalarA = entryA.scalar;
v.setClouds([a,b,c]);
assert.equal(entryA.scalar,scalarA); assert.deepEqual(v.colorRange,{min:2,max:20});
const uploadsBefore=qa.uploads.length;
v.setOptions({palette:'viridis',reverse:true,range:{min:0,max:40}});
assert.equal(qa.uploads.length,uploadsBefore); assert.deepEqual(v.colorRange,{min:0,max:40}); assert.deepEqual(v.dataRange,{min:2,max:20});
assert.equal(entryA.points,pointsA); assert.equal(entryA.scalar,scalarA);
assert.throws(()=>v.setOptions({range:{min:4,max:4}}),/最小值/); assert.deepEqual(v.colorRange,{min:0,max:40});
v.setOptions({range:null,palette:'inferno',reverse:false}); assert.deepEqual(v.colorRange,{min:2,max:20});
console.log('PASS global scalar ranges cover all files; palette, reversal, and manual limits require no buffer upload');

const beforeFile=qa.uploads.length;
v.setOptions({colorMode:'file'}); assert.equal(qa.uploads.length,beforeFile); assert.equal(v.colorRange,null);
assert.equal(v.effectiveColorMode,'file'); assert.deepEqual(v.getState().sources.map(source=>source.color),[a.color,b.color,c.color]);
v.setOptions({colorMode:'field:file'}); assert.deepEqual(v.colorRange,{min:2,max:7});
console.log('PASS file colors use uniforms and explicit field:file remains an independent scalar field');

v.setClouds([b,c]); assert(v.entityCache.has(a.key));
const beforeReturn=qa.uploads.length;
v.setClouds([a,b,c]); assert.equal(v.activeClouds[0].points,pointsA);
assert.equal(qa.uploads.slice(beforeReturn).filter(buffer=>buffer===pointsA.buffer).length,0);
const d=item('d',300), e=item('e',400); v.setClouds([a,b,c,d,e]); v.setClouds([]);
assert(v.entityCache.size<=2); assert(qa.deleted.includes(pointsA.buffer));
v.clearCache(); assert.equal(v.entityCache.size,0); assert.equal(v.pointCount,0);
qa.draws.length=0; v.render(); assert.equal(qa.draws.length,0);
console.log('PASS removal detaches scene instances; bounded inactive LRU reuses returning files and deletes evicted buffers');

const sharedBounds=[[1e6,2e6,0],[1e6+10,2e6+10,20]], origin=[1e6+5,2e6+5,10];
const wire1={vertices:[[1e6,2e6,0],[1e6+4,2e6,0]],edges:[[0,1]]};
const wire2={vertices:[[1e6+1,2e6,0],[1e6+3,2e6,0]],edges:[[0,1]]};
v.setOptions({colorMode:'height'}); v.setData({cloud:a.cloud,wire:wire1,bounds:sharedBounds,origin});
const oldPoints=v.activeClouds[0].points, oldWire=v.wireEntry.buffer;
v.setData({cloud:a.cloud,wire:wire2,bounds:sharedBounds,origin});
assert.equal(v.activeClouds[0].points,oldPoints); assert(qa.deleted.includes(oldWire.buffer));
assert.deepEqual(v.visibleBounds(),sharedBounds); assert.deepEqual(v.origin,origin);
const wirePositions=qa.values.get(v.wireEntry.buffer.buffer);
assert.deepEqual([...wirePositions].map((value,i)=>value+v.wireEntry.origin[i%3]),wire2.vertices.flat());
v.setData({wire:{vertices:[],edges:[]},bounds:sharedBounds,origin}); assert.deepEqual(v.visibleBounds(),sharedBounds); assert.equal(v.edgeCount,0);
console.log('PASS legacy setData shares cached points while switching wireframes and retains explicit comparison bounds');

v.setClouds([a]); v.setOptions({colorMode:'field:intensity'});
const beforeFailure = qa.uploads.length, oldActive = v.activeClouds, oldState = v.getState(), failed = item('failed',900);
qa.gl.getError = () => qa.uploads.length === beforeFailure + 3 ? 1285 : 0;
assert.throws(()=>v.setClouds([a,failed]),/显存不足/);
assert.equal(v.activeClouds,oldActive); assert.deepEqual(v.getState().bounds,oldState.bounds); assert.deepEqual(v.colorRange,oldState.colorRange);
assert(!v.entityCache.has(failed.key));
for(const buffer of qa.uploads.slice(beforeFailure)) assert(qa.deleted.includes(buffer));
qa.gl.getError = () => 0;
console.log('PASS a failed scalar GPU allocation rolls back the pending scene and releases all staged buffers');

v.setClouds([a,b]); v.setOptions({showPoints:false,showWire:false}); qa.draws.length=0; v.render(); assert.equal(qa.draws.length,0);
v.setOptions({showPoints:true,showWire:true,colorMode:'height'}); const camera=JSON.stringify(v.getState().camera);
qa.events.webglcontextlost({preventDefault(){}}); qa.events.webglcontextrestored();
assert.equal(v.pointCount,4); assert.equal(v.activeClouds.length,2); assert.equal(JSON.stringify(v.getState().camera),camera); assert(v.buffers.grid);
v.dispose(); assert.equal(v.entityCache.size,0);
console.log('PASS visibility toggles, context restoration, and disposal cover every cached entity');

for(const name of Object.keys(PALETTE_DEFINITIONS)) {
  const uniforms=paletteUniforms(name,false);
  for(let i=0;i<9;i++) assert.deepEqual([...uniforms.slice(i*3,i*3+3)],samplePalette(i/8,name,false).map(Math.fround));
  assert.deepEqual(samplePalette(0,name,true),samplePalette(1,name,false));
}
console.log('PASS five palettes share identical UI samples and GPU uniform stops');
