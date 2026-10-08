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
    render() {}, applyColorState() {},
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
