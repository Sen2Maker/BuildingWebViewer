// Run: node camera-controls.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('./camera-controls.js', import.meta.url), 'utf8');
const {captureCameraSnapshot, validateCameraSnapshot, applyCameraSnapshot, parseCameraBookmarks, serializeCameraBookmarks, mountCameraControls} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
let checks = 0;
function check(name, work) { work(); checks++; console.log('PASS', name); }
function viewer(origin = [832000, 816000, 12]) {
  return {camera: {azimuth: -55, elevation: 38, zoom: 2, pan: [1.25, -2.5]}, target: [.50060046, .03489984, 1], origin: [...origin], baseHeight: 30,
    fits: 0, renders: 0, fit() { this.fits++; }, render() { this.renders++; }};
}
const scene = {ids: ['1', '3'], scale: 'real'};
check('Raw snapshots preserve doubles, world target and independent arrays', () => {
  const original = viewer(), snapshot = captureCameraSnapshot(original, {space: 'raw-world', scene: {ids: ['a.xyz']}});
  assert.equal(snapshot.camera.target[0], 832000.50060046); assert.equal(snapshot.camera.target[2], 13);
  assert.equal(snapshot.camera.baseHeight / snapshot.camera.zoom, 15);
  snapshot.camera.pan[0] = 99; snapshot.scene.ids.push('b.xyz');
  assert.equal(original.camera.pan[0], 1.25); assert.deepEqual(scene.ids, ['1', '3']);
});
check('Restore converts world targets after recentering and never fits', () => {
  const snapshot = captureCameraSnapshot(viewer(), {space: 'raw-world'}), target = viewer([831500, 815500, 0]);
  applyCameraSnapshot([target], snapshot, {space: 'raw-world'});
  assert.deepEqual(target.target.map((value, axis) => value + target.origin[axis]), snapshot.camera.target);
  assert.equal(target.fits, 0); assert.equal(target.renders, 1); assert.equal(target.baseHeight, 30);
  assert.deepEqual(target.camera, {azimuth: -55, elevation: 38, zoom: 2, pan: [1.25, -2.5]});
});
check('All comparison panels update atomically while sync is paused', () => {
  const a = viewer([100, 200, 300]), b = viewer([400, 500, 600]), snapshot = captureCameraSnapshot(viewer(), {space: 'raw-world'});
  let paused = false, calls = 0;
  for (const item of [a, b]) item.render = () => {
    assert(paused); assert.equal(a.camera.zoom, 2); assert.equal(b.camera.zoom, 2); calls++;
  };
  applyCameraSnapshot([a, b], snapshot, {space: 'raw-world', pauseSync(fn) { paused = true; try { fn(); } finally { paused = false; } }});
  assert.equal(calls, 2); assert.notEqual(a.camera.pan, b.camera.pan);
  assert.deepEqual(a.target.map((v, i) => v + a.origin[i]), b.target.map((v, i) => v + b.origin[i]));
});
check('LOD layout snapshots include target, IDs and scale and reject mismatches', () => {
  const original = viewer(), snapshot = captureCameraSnapshot(original, {space: 'lod-arrangement', scene});
  assert.deepEqual(snapshot.camera.target, original.target);
  assert.throws(() => validateCameraSnapshot(snapshot, {space: 'raw-world'}), /坐标空间/);
  for (const other of [{ids: ['3', '1'], scale: 'real'}, {ids: ['1', '3'], scale: 'normalized'}, {ids: ['1'], scale: 'real'}]) {
    assert.throws(() => applyCameraSnapshot([viewer()], snapshot, {space: 'lod-arrangement', scene: other}), /布局不匹配/);
  }
  applyCameraSnapshot([original], snapshot, {space: 'lod-arrangement', scene});
  applyCameraSnapshot([original], snapshot, {space: 'lod-arrangement', scene: {ids: ['2'], scale: 'real'}, checkScene: false});
});
check('Invalid camera input fails before mutating any panel', () => {
  const snapshot = captureCameraSnapshot(viewer(), {space: 'raw-world'});
  for (const change of [{zoom: 0}, {zoom: NaN}, {elevation: 91}, {pan: [1]}, {target: [1, 2, Infinity]}, {baseHeight: -1}, {azimuth: '30'}]) {
    const target = viewer(), before = JSON.stringify(target);
    assert.throws(() => applyCameraSnapshot([target], {...snapshot, camera: {...snapshot.camera, ...change}}, {space: 'raw-world'}));
    assert.equal(JSON.stringify(target), before);
  }
  const valid = viewer(), invalid = viewer([Infinity, 0, 0]);
  assert.throws(() => applyCameraSnapshot([valid, invalid], snapshot, {space: 'raw-world'})); assert.equal(valid.renders, 0);
  assert.throws(() => validateCameraSnapshot({...snapshot, projection: 'perspective'}, {space: 'raw-world'}), /正交/);
});
check('Renderer-specific elevation and zoom ranges are respected', () => {
  const raw = captureCameraSnapshot(viewer(), {space: 'raw-world'});
  validateCameraSnapshot({...raw, camera: {...raw.camera, elevation: -89, zoom: .02}}, {space: 'raw-world'});
  const lod = captureCameraSnapshot(viewer(), {space: 'lod-arrangement', scene});
  assert.throws(() => validateCameraSnapshot({...lod, camera: {...lod.camera, elevation: -1}}, {space: 'lod-arrangement', scene}), /仰角/);
  assert.throws(() => validateCameraSnapshot({...lod, camera: {...lod.camera, zoom: .1}}, {space: 'lod-arrangement', scene}), /缩放/);
  assert.equal(validateCameraSnapshot({...raw, camera: {...raw.camera, azimuth: 725}}, {space: 'raw-world'}).camera.azimuth, 5);
});
check('Multiple named bookmarks and preserve preference round trip as JSON', () => {
  const snapshot = captureCameraSnapshot(viewer(), {space: 'raw-world'});
  const bookmarks = [{id: 'a', name: '屋顶细节', snapshot}, {id: 'b', name: '正面', snapshot: {...snapshot, camera: {...snapshot.camera, elevation: 0}}}];
  const text = serializeCameraBookmarks(bookmarks, 'raw-world', false), restored = parseCameraBookmarks(text, 'raw-world');
  assert.deepEqual(restored, {preserveView: false, bookmarks});
  const single = parseCameraBookmarks(JSON.stringify(snapshot), 'raw-world'); assert.equal(single.bookmarks.length, 1);
  assert.throws(() => parseCameraBookmarks(text, 'lod-arrangement'), /坐标空间/);
});
check('Malformed bookmark files are rejected without accepting unknown projections or duplicates', () => {
  const snapshot = captureCameraSnapshot(viewer(), {space: 'raw-world'});
  const valid = {format: 'BuildingWebViewer.camera-bookmarks', version: 1, space: 'raw-world', bookmarks: [{id: 'a', name: 'view', snapshot}]};
  for (const invalid of [{...valid, version: 2}, {...valid, bookmarks: [{id: 'a', name: '', snapshot}]}, {...valid, bookmarks: [...valid.bookmarks, ...valid.bookmarks]}, {...valid, bookmarks: Array(101).fill(valid.bookmarks[0])}]) {
    assert.throws(() => parseCameraBookmarks(invalid, 'raw-world'));
  }
  assert.throws(() => parseCameraBookmarks('{bad json', 'raw-world'));
  assert.throws(() => parseCameraBookmarks({...snapshot, space: 'lod-arrangement'}, 'raw-world'), /坐标空间/);
});

// Minimal DOM fixture exercises event binding without a browser or extra dependencies.
function panelFixture() {
  const nodes = [], frames = new Map(); let nextFrame = 0;
  const doc = {activeElement: null};
  doc.defaultView = {
    localStorage: {getItem() { return null; }, setItem() {}},
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  doc.createElement = tag => {
    const attributes = {}, listeners = new Map(), classes = new Set();
    const node = {tag, ownerDocument: doc, value: '', children: [], textContent: '',
      setAttribute(name, value) { attributes[name] = value; },
      getAttribute(name) { return attributes[name]; },
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; }, remove() {},
      addEventListener(event, fn) { if (!listeners.has(event)) listeners.set(event, []); listeners.get(event).push(fn); },
      dispatch(event) { for (const fn of listeners.get(event) || []) fn({preventDefault() {}}); },
      classList: {toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); }},
    };
    nodes.push(node); return node;
  };
  doc.createTextNode = text => ({textContent: text});
  return {doc, container: doc.createElement('div'),
    byLabel(label) { return nodes.find(node => node.getAttribute('aria-label') === label); },
    status() { return nodes.find(node => node.getAttribute('role') === 'status'); },
    flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); },
  };
}
check('Valid input applies immediately and plus starts from that new camera value', () => {
  const fixture = panelFixture(), camera = viewer(); camera.bounds = [[0, 0, 0], [1, 1, 1]];
  const panel = mountCameraControls({container: fixture.container, getViewers: () => [camera], space: 'raw-world'});
  const zoom = fixture.byLabel('缩放倍率'); fixture.doc.activeElement = zoom;
  zoom.value = '3.2'; zoom.dispatch('input');
  assert.equal(camera.camera.zoom, 3.2); assert.equal(camera.renders, 1);
  fixture.doc.activeElement = null;
  fixture.byLabel('增大缩放倍率').dispatch('click');
  assert.equal(camera.camera.zoom, 3.25); assert.equal(zoom.value, '3.25');
  const target = fixture.byLabel('世界目标 X'); fixture.doc.activeElement = target;
  target.value = '832000.123456789'; target.dispatch('input');
  assert.equal(panel.capture().camera.target[0], 832000.123456789);
  panel.destroy();
});
check('Partial or invalid input leaves camera untouched, while change reports the error', () => {
  const fixture = panelFixture(), camera = viewer(); camera.bounds = [[0, 0, 0], [1, 1, 1]];
  const panel = mountCameraControls({container: fixture.container, getViewers: () => [camera], space: 'raw-world'});
  const zoom = fixture.byLabel('缩放倍率'); fixture.doc.activeElement = zoom;
  for (const raw of ['', '-', '1e', 'Infinity', '0', '101']) {
    zoom.value = raw; zoom.dispatch('input');
    assert.equal(camera.camera.zoom, 2); assert.equal(camera.renders, 0);
    assert.equal(fixture.status().textContent, '');
  }
  zoom.dispatch('change'); assert.match(fixture.status().textContent, /缩放倍率/);
  zoom.value = '2.5'; zoom.dispatch('input'); assert.equal(camera.camera.zoom, 2.5);
  assert.equal(fixture.status().textContent, ''); panel.destroy();
});
check('Display removes floating point tails without rounding world targets or exported doubles', () => {
  const fixture = panelFixture(), camera = viewer(); camera.bounds = [[0, 0, 0], [1, 1, 1]];
  camera.camera.azimuth = -54.89999999999998;
  const panel = mountCameraControls({container: fixture.container, getViewers: () => [camera], space: 'raw-world'});
  const azimuth = fixture.byLabel('方位角（°）');
  assert.equal(azimuth.value, '-54.9');
  assert.equal(fixture.byLabel('世界目标 X').value, '832000.50060046');
  const snapshot = panel.capture(), json = serializeCameraBookmarks([{id: 'a', name: '精度', snapshot}], 'raw-world');
  assert.equal(JSON.parse(json).bookmarks[0].snapshot.camera.azimuth, snapshot.camera.azimuth);
  assert.equal(JSON.parse(json).bookmarks[0].snapshot.camera.target[0], 832000.50060046);
  fixture.doc.activeElement = azimuth; azimuth.value = '-54.89999999999998';
  azimuth.dispatch('input'); fixture.flush(); assert.equal(azimuth.value, '-54.89999999999998');
  fixture.doc.activeElement = null; azimuth.dispatch('blur'); fixture.flush(); assert.equal(azimuth.value, '-54.9');
  panel.destroy();
});

console.log(`${checks} checks passed.`);
