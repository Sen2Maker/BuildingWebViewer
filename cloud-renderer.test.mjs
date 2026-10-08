// Geometry checks without a browser or GPU: use the real bounds and recentering code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('./cloud-renderer.js', import.meta.url), 'utf8');
const {CloudViewer} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function viewer() {
  const value = Object.create(CloudViewer.prototype);
  Object.assign(value, {
    canvas: {clientWidth: 400, clientHeight: 400}, buffers: {}, captured: [],
    gl: {deleteBuffer() {}}, onError(error) { throw Error(error); },
    options: {showPoints: true, showWire: true, colorMode: 'solid', rgbFields: null},
    camera: {elevation: 90, azimuth: -90, zoom: 1, pan: [0, 0]},
    render() {},
  });
  value.makeBuffer = values => {
    value.captured.push(new Float32Array(values));
    return {buffer: null, count: values.length / 3};
  };
  return value;
}

const bounds = [[1000000, 2000000, 0], [1000004, 2000004, 3]];
const origin = [1000002, 2000002, 1.5];
const wide = {vertices: [[1000000, 2000000, 0], [1000004, 2000000, 0]], edges: [[0, 1]]};
const narrow = {vertices: [[1000001, 2000000, 0], [1000003, 2000000, 0]], edges: [[0, 1]]};
const a = viewer(), b = viewer(), empty = viewer();
a.setData({wire: wide, bounds, origin}); b.setData({wire: narrow, bounds, origin});
empty.setData({wire: {vertices: [], edges: [], bounds: null}, bounds, origin});
assert.deepEqual([...a.captured[0]], [-2, -2, -1.5, 2, -2, -1.5]);
assert.deepEqual([...b.captured[0]], [-1, -2, -1.5, 1, -2, -1.5]);
for (const item of [a, b, empty]) {
  item.options.showPoints = false;
  assert.deepEqual(item.visibleBounds(), bounds);
  item.fit();
  assert.equal(item.baseHeight, a.baseHeight);
  assert.deepEqual(item.target, a.target);
}
assert.equal(empty.edgeCount, 0);
console.log('PASS shared world origin and equal fit for sparse/empty wireframes');

const cloud = {positions: new Float64Array([1000000, 2000000, 0]), count: 1, bounds};
const sampled = viewer(); sampled.setData({cloud});
assert.deepEqual(sampled.cloudBounds, bounds);
assert.deepEqual(sampled.origin, origin);
console.log('PASS full point-cloud bounds survive rendering an interior subset');

empty.setData({});
assert.equal(empty.referenceBounds, null); assert.equal(empty.bounds, null);
assert.equal(empty.visibleBounds(), null); assert.deepEqual(empty.origin, [0, 0, 0]);
console.log('PASS clear removes previous comparison bounds and origin');

const combined = {
  positions: new Float64Array([
    1000000, 2000000, 1, 1000000.125, 2000000.25, 2,
    1000100, 2000200, 11, 1000100.125, 2000200.25, 12,
  ]),
  count: 4,
  bounds: [[1000000, 2000000, 1], [1000100.125, 2000200.25, 12]],
  fields: {intensity: new Float32Array([10, 20, NaN, NaN]), file: new Float32Array([2, 3, 5, 7])},
  rgb: new Float32Array([1, 0, 0, 0, 1, 0, NaN, NaN, NaN, NaN, NaN, NaN]),
  sources: [
    {name: 'a.xyz', start: 0, count: 2, totalCount: 2, color: [.2, .4, .8]},
    {name: 'b.xyz', start: 2, count: 2, totalCount: 20, color: [.9, .3, .1]},
  ],
};
const overlay = viewer();
overlay.setData({cloud: combined, wire: {vertices: [[1000000, 2000000, 1], [1000100, 2000200, 11]], edges: [[0, 1]]}});
assert.deepEqual(overlay.origin, [1000050.0625, 2000100.125, 6.5]);
const localPoints = overlay.captured[0], localWire = overlay.captured[2];
for (let index = 0; index < combined.count; index++) for (let axis = 0; axis < 3; axis++) {
  assert.equal(localPoints[index * 3 + axis], combined.positions[index * 3 + axis] - overlay.origin[axis]);
}
assert.deepEqual([...localWire.slice(0, 3)], [...localPoints.slice(0, 3)]);
assert.deepEqual([...localWire.slice(3, 6)], [...localPoints.slice(6, 9)]);
assert.equal(localPoints[3] - localPoints[0], .125);
assert.deepEqual([localPoints[6] - localPoints[0], localPoints[7] - localPoints[1], localPoints[8] - localPoints[2]], [100, 200, 10]);
console.log('PASS multiple clouds retain shared origin, fractional precision, relative position, and wire alignment');

const uploadsBefore = overlay.captured.length, positionBuffer = overlay.buffers.points, wireBuffer = overlay.buffers.wire;
overlay.setOptions({colorMode: 'file'});
assert.equal(overlay.captured.length, uploadsBefore + 1);
assert.equal(overlay.buffers.points, positionBuffer); assert.equal(overlay.buffers.wire, wireBuffer);
assert.equal(overlay.effectiveColorMode, 'file'); assert.equal(overlay.colorRange, null); assert.equal(overlay.colorFallback, null);
const fileColors = overlay.captured.at(-1);
for (const source of combined.sources) for (let index = source.start; index < source.start + source.count; index++) {
  assert.deepEqual([...fileColors.slice(index * 3, index * 3 + 3)], source.color.map(Math.fround));
}
console.log('PASS per-file coloring uses source ranges and changes only the color buffer');

for (const sources of [undefined, [], [{start: 0, count: 2, color: [1, 0, 0]}], [{start: 0, count: 4, color: [NaN, 0, 0]}]]) {
  const result = overlay.buildColors({...combined, sources}, combined.count);
  assert.equal(result.mode, 'height'); assert.deepEqual(result.range, {min: 1, max: 12}); assert(result.fallback);
}
console.log('PASS missing or incomplete file metadata falls back to height safely');

overlay.setOptions({colorMode: 'field:file'});
assert.equal(overlay.effectiveColorMode, 'field:file'); assert.deepEqual(overlay.colorRange, {min: 2, max: 7});
overlay.setOptions({colorMode: 'field:intensity'});
assert.deepEqual(overlay.colorRange, {min: 10, max: 20});
assert.deepEqual([...overlay.captured.at(-1).slice(6, 9)], [.55, .59, .61].map(Math.fround));
overlay.setOptions({colorMode: 'rgb'}); assert.equal(overlay.colorRange, null);
assert.deepEqual([...overlay.captured.at(-1).slice(0, 3)], [1, 0, 0]);
assert.deepEqual([...overlay.captured.at(-1).slice(6, 9)], [.55, .55, .55].map(Math.fround));
overlay.setOptions({colorMode: 'solid'}); assert.equal(overlay.effectiveColorMode, 'solid');
overlay.setOptions({colorMode: 'height'}); assert.deepEqual(overlay.colorRange, {min: 1, max: 12});
console.log('PASS explicit field:file and existing field, RGB, solid, and height modes remain independent');
