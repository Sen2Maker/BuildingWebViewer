import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PairedComparisonRenderer, meshComparisonFrame} from '../src/compare/renderer.js';

globalThis.window = {devicePixelRatio: 1};
globalThis.ResizeObserver = class {observe() {} disconnect() {}};
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

function surface() {
  let bound, serial = 0;
  const values = new Map(), uniforms = {}, deleted = [];
  const gl = new Proxy({
    POINTS: 0, LINES: 1, NO_ERROR: 0, OUT_OF_MEMORY: 1285,
    createShader: () => ({}), createProgram: () => ({}), getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: (_, name) => ['position', 'normal', 'buildingColor', 'vertexHeight', 'vertexColor', 'scalarValue'].indexOf(name),
    getUniformLocation: (_, name) => name, getParameter: () => [1, 64], getError: () => 0,
    createBuffer: () => ({id: ++serial}), bindBuffer: (_, buffer) => { bound = buffer; },
    bufferData: (_, array) => values.set(bound, new Float32Array(array)), deleteBuffer: buffer => deleted.push(buffer),
    uniform3fv: (name, array) => { uniforms[name] = [...array]; },
    uniform2f: (name, a, b) => { uniforms[name] = [a, b]; },
    uniform1i: (name, value) => { uniforms[name] = value; },
  }, {get: (object, name) => object[name] ?? (() => {})});
  const canvas = {getContext: () => gl, style: {}, clientWidth: 400, clientHeight: 600,
    getBoundingClientRect: () => ({width: 400, height: 600}), addEventListener() {}, removeEventListener() {}};
  return {canvas, values, uniforms, deleted};
}
function fixture() {
  const cloud = surface(), mesh = surface();
  const renderer = new PairedComparisonRenderer(cloud.canvas, mesh.canvas, {preset: {pointSize: 3, palette: 'viridis'}});
  return {renderer, cloud, mesh};
}
function geometry(id = 'building-001') {
  return {id, vertices: [[1000000, 2000000, 120], [1000002.125, 2000000, 120],
    [1000002.125, 2000003.25, 124.5], [1000000, 2000003.25, 124.5]], faces: [[0, 1, 2], [0, 2, 3]]};
}
function cloudFor(mesh) {
  const positions = new Float64Array([...mesh.vertices.flat(), 999900, 2000400, 95]);
  return {positions, count: 5, totalCount: 500, bounds: [[999900, 2000000, 95], [1000002.125, 2000400, 124.5]], fields: {}};
}
function viewState(viewer) {
  return {camera: {...viewer.camera, pan: [...viewer.camera.pan]}, target: [...viewer.target], baseHeight: viewer.baseHeight,
    projection: viewer.projection, distance: viewer.distance, near: viewer.near, fov: viewer.fov};
}
function screenXY(matrix, point) {
  const w = matrix[3] * point[0] + matrix[7] * point[1] + matrix[11] * point[2] + matrix[15];
  return [(matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12]) / w,
    (matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13]) / w];
}

test('one real-scale mesh defines an explicit shared world origin', () => {
  const model = geometry(), frame = meshComparisonFrame(model);
  assert.deepEqual(frame.origin, [1000001.0625, 2000001.625, 120]);
  assert.equal(frame.scale, 1);
  assert.deepEqual(frame.bounds, [[1000000, 2000000, 120], [1000002.125, 2000003.25, 124.5]]);
  assert.throws(() => meshComparisonFrame({...model, vertices: [[NaN, 1, 2]]}), /coordinates/);
  assert.throws(() => meshComparisonFrame({...model, vertices: []}), /Invalid/);
});

test('actual mesh and cloud GPU coordinates coincide despite large offsets and different bounds', () => {
  const {renderer, cloud, mesh} = fixture(), model = geometry(), points = cloudFor(model);
  const originalPoints = Array.from(points.positions);
  renderer.select(model.id); renderer.setMesh(model.id, model); renderer.setCloud(model.id, points);
  assert.equal(renderer.mesh.options.scale, 'real');
  assert.deepEqual(renderer.cloud.origin, meshComparisonFrame(model).origin);
  assert.notDeepEqual(renderer.cloud.origin, points.bounds[0].map((v, i) => (v + points.bounds[1][i]) / 2));
  const meshUpload = mesh.values.get(renderer.mesh.buffers.triangles.buffer);
  const entry = renderer.cloud.activeClouds[0], cloudUpload = cloud.values.get(entry.points.buffer);
  renderer.cloud.render();
  assert.deepEqual(cloud.uniforms.originOffset, entry.origin.map((v, i) => v - renderer.cloud.origin[i]));
  const indices = model.faces.flat();
  for (let vertex = 0; vertex < indices.length; vertex++) {
    const meshPosition = Array.from(meshUpload.subarray(vertex * 10, vertex * 10 + 3));
    const cloudPosition = Array.from(cloudUpload.subarray(indices[vertex] * 3, indices[vertex] * 3 + 3), (v, i) => v + cloud.uniforms.originOffset[i]);
    assert.deepEqual(meshPosition, cloudPosition);
    assert.deepEqual(meshPosition, model.vertices[indices[vertex]].map((v, i) => v - renderer.cloud.origin[i]));
    assert.deepEqual(screenXY(renderer.mesh.matrix(), meshPosition), screenXY(renderer.cloud.matrix(), cloudPosition));
  }
  assert.deepEqual(Array.from(points.positions), originalPoints, 'original cloud coordinates must never be rewritten');
  assert.equal(renderer.cloud.options.pointRatio, 100, 'do not resample an already sampled cloud implicitly');
  renderer.dispose();
});

test('mesh is usable first; cloud arrival preserves the user camera, target and scale', () => {
  const {renderer} = fixture(), model = geometry();
  renderer.select(model.id); renderer.setMesh(model.id, model);
  assert.equal(renderer.mesh.triangleCount, 2); assert.equal(renderer.cloud.pointCount, 0);
  renderer.mesh.camera = {elevation: 22, azimuth: -33, zoom: 1.8, pan: [2, -3], roll: 5};
  renderer.mesh.target = [4, 5, 6]; renderer.mesh.baseHeight = 42; renderer.mesh.distance = 77; renderer.mesh.near = .002;
  renderer.mesh.render();
  const before = viewState(renderer.mesh);
  renderer.setCloud(model.id, cloudFor(model));
  assert.deepEqual(viewState(renderer.mesh), before);
  assert.deepEqual(viewState(renderer.cloud), before);
  renderer.cloud.camera.pan = [11, 12]; renderer.cloud.camera.zoom = 2.4; renderer.cloud.render();
  assert.deepEqual(viewState(renderer.mesh), viewState(renderer.cloud), 'cloud navigation also updates mesh');
  renderer.mesh.projection = 'perspective'; renderer.mesh.render();
  assert.deepEqual(Array.from(renderer.mesh.matrix()), Array.from(renderer.cloud.matrix()));
  renderer.dispose();
});

test('changing ID clears both panes and ignores old asynchronous results', () => {
  const {renderer, cloud} = fixture(), first = geometry('a'), second = geometry('b');
  renderer.select('a'); renderer.setMesh('a', first); renderer.setCloud('a', cloudFor(first));
  const oldPointBuffer = renderer.cloud.activeClouds[0].points.buffer;
  renderer.select('b');
  assert.equal(renderer.mesh.triangleCount, 0); assert.equal(renderer.cloud.pointCount, 0);
  assert(cloud.deleted.includes(oldPointBuffer));
  assert.equal(renderer.setCloud('a', cloudFor(first)), false);
  assert.equal(renderer.setMesh('a', first), false);
  assert.throws(() => renderer.setMesh('b', first), /ID does not match/);
  renderer.setMesh('b', second);
  assert.equal(renderer.mesh.models[0].id, 'b'); assert.equal(renderer.cloud.pointCount, 0);
  renderer.dispose(); assert.equal(renderer.setMesh('b', second), false);
});

test('retrying the same ID explicitly clears previous geometry before loading', () => {
  const {renderer} = fixture(), model = geometry();
  renderer.select(model.id); renderer.setMesh(model.id, model); renderer.setCloud(model.id, cloudFor(model));
  renderer.select(model.id);
  assert.equal(renderer.mesh.triangleCount, 0); assert.equal(renderer.cloud.pointCount, 0);
  renderer.setMesh(model.id, model); assert.equal(renderer.mesh.triangleCount, 2);
  renderer.dispose();
});

test('an available cloud can render without a matching mesh, without borrowing another ID', () => {
  const {renderer} = fixture(), model = geometry('cloud-only');
  renderer.select(model.id); renderer.setCloud(model.id, cloudFor(model));
  assert.equal(renderer.cloud.pointCount, 5); assert.equal(renderer.mesh.triangleCount, 0); assert.equal(renderer.frame, null);
  renderer.setMesh(model.id, model);
  assert.deepEqual(renderer.cloud.origin, meshComparisonFrame(model).origin);
  assert.deepEqual(viewState(renderer.cloud), viewState(renderer.mesh));
  renderer.dispose();
});

test('comparison shell remains side by side on narrow screens and has no file-opening gate', () => {
  const css = readFileSync(new URL('../src/compare/compare.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/compare/app.js', import.meta.url), 'utf8');
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /grid-template-columns:\s*(?:1fr|100%)\s*;/);
  assert.match(app, /pane\('cloud'[\s\S]*pane\('mesh'/);
  assert.match(app, /state\.phase === 'selection' && lastPhase !== 'selection'/);
  assert.match(app, /void session\.start\(\)/);
  assert.match(app, /navigator\?\.onLine !== false/);
  assert.match(app, /isNativePlatform/);
  assert.doesNotMatch(app, /type\s*=\s*['"]file['"]|showModal\(|localStorage|indexedDB/);
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
});
