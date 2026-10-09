import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker as NodeWorker} from 'node:worker_threads';
const datasetURL=`data:text/javascript;base64,${Buffer.from(await readFile(new URL('point-dataset.js',import.meta.url))).toString('base64')}`;
const moduleFrom = async name => import(`data:text/javascript;base64,${Buffer.from((await readFile(new URL(name, import.meta.url),'utf8')).replaceAll("'./point-dataset.js'",JSON.stringify(datasetURL))).toString('base64')}`);
const {computePointFeatures, derivedPointCloud, runPointFeatures} = await moduleFrom('point-operations.js');
const {writePointExport, pointExportSchema} = await moduleFrom('point-export.js');
const {parsePointCloud, samplePointCloud} = await moduleFrom('point-io.js');
let passed = 0;
async function test(name, body) { await body(); console.log(`ok ${++passed} - ${name}`); }
function plane(size = 13, slope = 0, shift = 0) {
  const p = [];
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) p.push(shift + x, -shift + y, shift + slope * x);
  return Float64Array.from(p);
}
function cloud(positions, fields = {}, rgb = null) { const count = positions.length / 3; return {positions, fields, rgb, count, totalCount: count, notes: [], bounds: [[0, 0, 0], [20, 20, 20]]}; }
const tolerance = (a, b, e = 1e-8) => assert(Math.abs(a - b) <= e, `${a} != ${b}`);
const flat = plane();
await test('flat plane: normals, slope, roughness, progress and nonmutation', () => {
  const copy = flat.slice(), progress = [];
  const r = computePointFeatures(flat, {k: 16}, value => progress.push(value));
  assert.equal(r.valid, r.count); assert.deepEqual(flat, copy);
  for (let i = 0; i < r.count; i++) { tolerance(r.fields.nz[i], 1); tolerance(r.fields.slope[i], 0); tolerance(r.fields.roughness[i], 0); assert(r.fields.planarity[i] > 0 && r.fields.planarity[i] <= 1); }
  assert(progress.some(p => p.phase === 'index')); assert.equal(progress.at(-1).done, r.count);
});
await test('sloped plane and large coordinates retain the same geometry', () => {
  const a = computePointFeatures(plane(13, 0.5), {k: 24}), b = computePointFeatures(plane(13, 0.5, 1e9), {k: 24});
  assert.equal(b.valid, b.count);
  for (let i = 0; i < a.count; i++) { tolerance(a.fields.slope[i], Math.atan(0.5) * 180 / Math.PI); tolerance(a.fields.nx[i], -1 / Math.sqrt(5)); tolerance(a.fields.nz[i], 2 / Math.sqrt(5)); tolerance(a.fields.nx[i], b.fields.nx[i]); tolerance(b.fields.roughness[i], 0); }
});
await test('direction sign flips normals without changing slope', () => {
  const r = computePointFeatures(flat, {orientation: '-z'});
  for (let i = 0; i < r.count; i++) { tolerance(r.fields.nz[i], -1); tolerance(r.fields.slope[i], 0); }
});
await test('degenerate, duplicate and radius-isolated neighborhoods are invalid', () => {
  for (const p of [Float64Array.from([0,0,0, 1,0,0, 2,0,0]), new Float64Array(30)]) {
    const r = computePointFeatures(p); assert.equal(r.valid, 0); assert(r.fields.nx.every(Number.isNaN));
  }
  const r = computePointFeatures(flat, {radius: 0.1}); assert.equal(r.valid, 0);
  assert.throws(() => computePointFeatures(flat, {k: 2}));
  assert.throws(() => computePointFeatures(Float64Array.of(NaN,0,0, 0,1,0, 0,0,1)));
});
await test('KD neighborhoods agree with brute-force neighborhoods on irregular noisy data', () => {
  let seed = 9182;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const p = Float64Array.from({length: 900}, (_, i) => i % 3 === 2 ? rnd() * 0.8 : rnd() * 15);
  for (const radius of [0, 3]) {
    const result = computePointFeatures(p, {k: 15, radius});
    for (let i = 0; i < 300; i += 7) {
      const sorted = Array.from({length: 300}, (_, id) => ({id, d: [0,1,2].reduce((s, a) => s + (p[id*3+a]-p[i*3+a])**2, 0)})).filter(v => !radius || v.d <= radius ** 2).sort((a,b) => a.d-b.d).slice(0, 15);
      if (sorted.length < 3) { assert.equal(result.fields.normal_valid[i], 0); continue; }
      const local = Float64Array.from(sorted.flatMap(({id}) => Array.from(p.slice(id*3,id*3+3))));
      const expected = computePointFeatures(local, {k: local.length/3});
      for (const name of ['nx','ny','nz','slope','planarity','roughness']) tolerance(result.fields[name][i], expected.fields[name][0], 1e-7);
    }
  }
});
await test('sphere neighborhoods approximate radial normals', () => {
  const p = [];
  for (let i=0;i<800;i++) { const z=1-2*(i+0.5)/800, a=i*2.399963229728653, r=Math.sqrt(1-z*z); p.push(r*Math.cos(a),r*Math.sin(a),z); }
  const result=computePointFeatures(Float64Array.from(p),{k:24});
  for(let i=0;i<800;i++) { const dot=['nx','ny','nz'].reduce((s,key,a)=>s+result.fields[key][i]*p[i*3+a],0); assert(Math.abs(dot)>0.99); }
});
await test('derived fields do not overwrite originals; sample provenance remains explicit', () => {
  const original = cloud(flat, {nx: new Float64Array(flat.length / 3).fill(42)}); original.totalCount = 1000;
  const result = derivedPointCloud(original, computePointFeatures(flat), {k:32,radius:0,orientation:'+z'}, '当前显示点');
  assert.equal(result.fields.nx[0],42); assert.equal(result.featureMapping.nx,'nx_2'); assert(!original.fields.nx_2);
  assert.equal(result.totalCount,result.count); assert.equal(result.processing.originalTotal,1000);
  const sampled = samplePointCloud(result, 10); assert(sampled.fields.roughness instanceof Float64Array);
});
const a = cloud(Float64Array.of(1e9+0.0001,2,3, 4,5,6), {intensity: Float64Array.of(0.1234567890123, 7), source_id: Float64Array.of(90,91), red:Float64Array.of(255,0),green:Float64Array.of(0,255),blue:Float64Array.of(0,0)}, Float32Array.of(1,0,0,0,1,0));
const b = cloud(Float64Array.of(7,8,9), {roughness: Float64Array.of(NaN)});
async function serialized(items, format, extra={}) {
  const parts=[]; await writePointExport(items,{format,write:async chunk=>parts.push(chunk),...extra});
  return Buffer.concat(parts.map(p=>Buffer.from(p)));
}
for(const format of ['ply','txt']) await test(`${format}: merge round-trip with doubles, union, missing values, RGB and source IDs`, async () => {
  const bytes=await serialized([{name:'屋顶 A',cloud:a},{name:'B',cloud:b}],format,{chunkPoints:1});
  const result=parsePointCloud(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),`merged.${format}`);
  assert.equal(result.count,3); assert.equal(result.positions[0],a.positions[0]); assert.equal(result.fields.intensity[0],a.fields.intensity[0]);
  assert(Number.isNaN(result.fields.intensity[2])); assert(Number.isNaN(result.fields.roughness[0]));
  assert.deepEqual([...result.fields.source_id_2],[0,0,1]); assert.deepEqual([...result.fields.rgb_valid],[1,1,0]);
  assert.equal(result.fields.original_red[0],255); assert.equal(result.rgb[0],1); assert.equal(result.rgb[6],0);
});
await test('export names sanitized without collisions, source ID can be disabled', () => {
  const c=cloud(flat,{'a b':new Float64Array(169),'a-b':new Float64Array(169)});
  const schema=pointExportSchema([{cloud:c}],{sourceIds:false});
  assert.deepEqual(schema.properties.map(p=>p.name),['x','y','z','a_b','a_b_2']);
});
await test('stream cancellation stops writes and never reports completion', async () => {
  const controller=new AbortController(); let writes=0;
  await assert.rejects(writePointExport([{name:'A',cloud:cloud(flat)}],{signal:controller.signal,chunkPoints:10,write:async()=>{if(++writes===3)controller.abort();}}),{name:'AbortError'});
  assert.equal(writes,3);
});
await test('TXT NaN accepted only for scalar attributes; invalid XYZ and typo remain errors', () => {
  const parse=text=>parsePointCloud(new TextEncoder().encode(text).buffer,'a.txt');
  assert(Number.isNaN(parse('x y z intensity\n1 2 3 NaN').fields.intensity[0]));
  assert.throws(()=>parse('x y z intensity\nNaN 2 3 1'));
  assert.throws(()=>parse('x y z intensity\n1 2 3 oops'));
});
// Execute the actual browser Worker source in a Node worker thread, including transfers.
globalThis.Worker = class {
  constructor(url) {
    this.pending=fetch(url).then(r=>r.text()).then(source=>{
      if(this.closed)return;
      this.worker=new NodeWorker(`const {parentPort}=require('node:worker_threads'); globalThis.postMessage=(v,t)=>parentPort.postMessage(v,t); let onmessage; ${source}; parentPort.on('message',data=>onmessage({data}));`,{eval:true});
      this.worker.on('message',data=>this.onmessage?.({data})); this.worker.on('error',error=>this.onerror?.({message:error.message}));
    });
  }
  postMessage(data,transfer){this.pending.then(()=>{if(!this.closed)this.worker.postMessage(data,transfer);});}
  terminate(){this.closed=true;this.worker?.terminate();}
};
await test('worker returns computed buffers without detaching viewer coordinates', async () => {
  const result=await runPointFeatures(flat,{}); assert.equal(result.valid,169); assert.equal(flat.length,507);
});
await test('worker cancellation is prompt and subsequent jobs succeed', async () => {
  const controller=new AbortController(); const result=runPointFeatures(plane(200),{}, {signal:controller.signal,onProgress:()=>controller.abort()});
  await assert.rejects(result,{name:'AbortError'}); assert.equal((await runPointFeatures(flat,{})).valid,169);
});
console.log(`${passed} processing/export tests passed`);
