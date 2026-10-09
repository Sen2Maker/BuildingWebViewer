import assert from 'node:assert/strict';
import {captureCameraSnapshot, validateCameraSnapshot, applyCameraSnapshot, parseCameraBookmarks, serializeCameraBookmarks, mountCameraControls} from '../src/shared/camera-controls.js';
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
function panelFixture(storage = new Map()) {
  const nodes = [], frames = new Map(), windowEvents = new Map(); let nextFrame = 0;
  const doc = {activeElement: null};
  doc.defaultView = {
    addEventListener(event, fn) { if (!windowEvents.has(event)) windowEvents.set(event, new Set()); windowEvents.get(event).add(fn); },
    removeEventListener(event, fn) { windowEvents.get(event)?.delete(fn); },
    localStorage: storage instanceof Map ? {getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); }} : storage,
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
      dispatch(event) { return Promise.all((listeners.get(event) || []).map(fn => fn({preventDefault() {}}))); },
      classList: {toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); }},
    };
    // Browser range values clamp and align to step; this must not quantize the camera.
    let storedValue = '';
    Object.defineProperty(node, 'value', {get() { return storedValue; }, set(raw) {
      if (node.type !== 'range') { storedValue = String(raw); return; }
      const min = Number(node.min ?? 0), max = Number(node.max ?? 100), step = Number(node.step ?? 1);
      const numeric = Number(raw), value = Number.isFinite(numeric) ? numeric : (min + max) / 2;
      const aligned = min + Math.round((Math.max(min, Math.min(max, value)) - min) / step) * step;
      storedValue = String(Number(Math.max(min, Math.min(max, aligned)).toPrecision(12)));
    }});
    nodes.push(node); return node;
  };
  doc.createTextNode = text => ({textContent: text});
  return {doc, container: doc.createElement('div'), nodes, storage, frames, windowEvents,
    storageEvent(key) { for (const fn of windowEvents.get('storage') || []) fn({key}); },
    button(text) { return nodes.find(node => node.tag === 'button' && node.textContent === text); },
    byClass(className) { return nodes.find(node => node.className?.split(' ').includes(className)); },
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


check('Angle sliders and precise inputs synchronize both ways, including external mouse renders', () => {
  const fixture = panelFixture(), camera = viewer(); camera.bounds = [[0, 0, 0], [1, 1, 1]];
  const panel = mountCameraControls({container: fixture.container, getViewers: () => [camera], space: 'raw-world'});
  const slider = fixture.byLabel('方位角（°）滑块'), number = fixture.byLabel('方位角（°）');
  assert.equal(slider.min, '-180'); assert.equal(slider.max, '180'); assert.equal(slider.step, '.1');
  slider.value = '23.4'; slider.dispatch('input');
  assert(Math.abs(camera.camera.azimuth - 23.4) < 1e-10); assert.equal(number.value, '23.4');
  fixture.doc.activeElement = number; number.value = '71.23'; number.dispatch('input');
  assert.equal(slider.value, '71.2'); assert(Math.abs(camera.camera.azimuth - 71.23) < 1e-10); assert.equal(number.value, '71.23');
  fixture.doc.activeElement = null; fixture.byLabel('增大方位角（°）').dispatch('click');
  assert.equal(slider.value, '71.3'); assert(Math.abs(camera.camera.azimuth - 71.33) < 1e-10);
  camera.camera.azimuth = -33.2; camera.camera.elevation = 47.7; camera.camera.zoom = 8; camera.render(); fixture.flush();
  assert.equal(number.value, '-33.2'); assert(Math.abs(Number(slider.value) + 33.2) < 1e-10);
  assert.equal(fixture.byLabel('仰角（°）滑块').value, '47.7');
  assert.equal(Number(fixture.byLabel('缩放倍率滑块').value), Math.round(1000 * Math.log(8 / .02) / Math.log(100 / .02)));
  const snapshot = panel.capture(); snapshot.camera.azimuth = 17.1; snapshot.camera.zoom = .2; panel.restore(snapshot);
  assert.equal(number.value, '17.1'); assert.equal(fixture.byLabel('缩放倍率').value, '0.2'); panel.destroy();
});
check('Dragging stays stable across RAF and the +180 endpoint does not jump to the left', () => {
  const fixture = panelFixture(), camera = viewer(); camera.bounds = [[0, 0, 0], [1, 1, 1]];
  const panel = mountCameraControls({container: fixture.container, getViewers: () => [camera], space: 'raw-world'});
  const slider = fixture.byLabel('方位角（°）滑块'); fixture.doc.activeElement = slider; slider.dispatch('pointerdown');
  for (const angle of ['179.8', '179.9', '180']) {
    slider.value = angle; slider.dispatch('input'); fixture.flush(); assert.equal(slider.value, angle);
  }
  assert.equal(camera.camera.azimuth, -180); slider.dispatch('pointerup'); fixture.flush(); assert.equal(slider.value, '180');
  slider.value = '179.9'; slider.dispatch('input'); fixture.flush(); assert(Math.abs(camera.camera.azimuth - 179.9) < 1e-9);
  const number = fixture.byLabel('方位角（°）'); fixture.doc.activeElement = number; number.value = '725'; number.dispatch('input');
  assert.equal(camera.camera.azimuth, 5); assert.equal(slider.value, '5'); panel.destroy();
});
check('Zoom is logarithmic with exact renderer-specific endpoints and valid elevation ranges', () => {
  for (const [space, minZoom, maxZoom, minElevation] of [['raw-world', .02, 100, -89], ['lod-arrangement', .15, 30, 0]]) {
    const fixture = panelFixture(), camera = viewer(); camera.bounds = [[0, 0, 0], [1, 1, 1]]; camera.models = [1];
    const panel = mountCameraControls({container: fixture.container, getViewers: () => [camera], space, getScene: () => scene});
    const zoom = fixture.byLabel('缩放倍率滑块'), elevation = fixture.byLabel('仰角（°）滑块');
    assert.equal(zoom.min, '0'); assert.equal(zoom.max, '1000'); assert.equal(zoom.step, '1');
    assert.equal(elevation.min, String(minElevation)); assert.equal(elevation.max, '90');
    zoom.value = '0'; zoom.dispatch('input'); assert.equal(camera.camera.zoom, minZoom);
    zoom.value = '1000'; zoom.dispatch('input'); assert.equal(camera.camera.zoom, maxZoom);
    zoom.value = '500'; zoom.dispatch('input'); assert(Math.abs(camera.camera.zoom - Math.sqrt(minZoom * maxZoom)) < 1e-12);
    elevation.value = String(minElevation); elevation.dispatch('input'); assert.equal(camera.camera.elevation, minElevation);
    const renders = camera.renders;
    for (const [label, invalid] of [['仰角（°）', String(minElevation - 1)], ['缩放倍率', String(maxZoom + 1)]]) {
      const number = fixture.byLabel(label); fixture.doc.activeElement = number; number.value = invalid; number.dispatch('input'); assert.equal(camera.renders, renders);
    }
    panel.destroy();
  }
});
check('Separate bookmark mount keeps parameters and bookmark controls in their own containers', () => {
  const fixture = panelFixture(), bookmarkContainer = fixture.doc.createElement('div'), camera = viewer(); camera.bounds = [[0, 0, 0], [1, 1, 1]];
  const panel = mountCameraControls({container: fixture.container, bookmarkContainer, getViewers: () => [camera], space: 'raw-world'});
  assert.equal(fixture.container.children[0].tag, 'section'); assert.equal(bookmarkContainer.children[0].className, 'camera-bookmarks');
  assert(!fixture.container.children[0].children[0].children.includes(bookmarkContainer.children[0]));
  assert.match(fixture.byClass('camera-bookmark-storage').textContent, /保存在此浏览器，下次打开仍可使用/);
  assert.equal(fixture.byClass('camera-advanced').tag, 'details');
  assert.equal(fixture.byLabel('已保存书签数量').textContent, '0 / 100'); panel.destroy();
});
check('Saved bookmarks and preserve preference survive destroy and a new panel mount', () => {
  const storage = new Map(), key = 'BuildingWebViewer.camera-bookmarks.v1.raw-world';
  let fixture = panelFixture(storage), camera = viewer(); camera.bounds = [[0, 0, 0], [1, 1, 1]];
  const originalRender = camera.render;
  let panel = mountCameraControls({container: fixture.container, getViewers: () => [camera], space: 'raw-world'});
  fixture.byLabel('视角书签名称').value = '屋顶角度'; fixture.button('保存新书签').dispatch('click');
  const preserve = fixture.byLabel('增删文件时保持当前视角'); preserve.checked = false; preserve.dispatch('change');
  const saved = JSON.parse(storage.get(key)); assert.equal(saved.bookmarks.length, 1); assert.equal(saved.preserveView, false);
  assert(Number.isFinite(Date.parse(saved.bookmarks[0].updatedAt))); assert.equal(fixture.byLabel('已保存书签数量').textContent, '1 / 100');
  camera.camera.zoom = 9; camera.render(); assert(fixture.frames.size); panel.destroy();
  assert.equal(camera.render, originalRender); assert.equal(fixture.frames.size, 0);
  fixture = panelFixture(storage); panel = mountCameraControls({container: fixture.container, getViewers: () => [camera], space: 'raw-world'});
  assert.equal(panel.preserveView, false); assert.equal(fixture.byLabel('已保存视角').children[0].textContent, '屋顶角度');
  assert.equal(camera.camera.zoom, 9); // Opening the panel never silently restores a bookmark.
  const select = fixture.byLabel('已保存视角'); select.value = saved.bookmarks[0].id; select.dispatch('change');
  assert.match(fixture.byLabel('选中书签信息').textContent, /屋顶角度\n更新：/);
  fixture.button('加载所选').dispatch('click'); assert.equal(camera.camera.zoom, 2);
  assert.equal(fixture.byLabel('缩放倍率').value, '2');
  assert.equal(Number(fixture.byLabel('缩放倍率滑块').value), Math.round(1000 * Math.log(2 / .02) / Math.log(100 / .02)));
  panel.destroy();
});
check('New, update, rename and delete bookmark actions preserve their distinct meanings', () => {
  const fixture = panelFixture(), camera = viewer(); camera.bounds = [[0, 0, 0], [1, 1, 1]];
  const panel = mountCameraControls({container: fixture.container, getViewers: () => [camera], space: 'raw-world'}), key = 'BuildingWebViewer.camera-bookmarks.v1.raw-world';
  const name = fixture.byLabel('视角书签名称'); name.value = '全景'; fixture.button('保存新书签').dispatch('click');
  camera.camera.zoom = 4; fixture.button('保存新书签').dispatch('click');
  let saved = JSON.parse(fixture.storage.get(key)); assert.deepEqual(saved.bookmarks.map(b => b.name), ['全景', '全景 (2)']);
  assert.deepEqual(saved.bookmarks.map(b => b.snapshot.camera.zoom), [2, 4]);
  camera.camera.zoom = 7; fixture.button('更新视角').dispatch('click'); name.value = '细节'; fixture.button('重命名').dispatch('click');
  saved = JSON.parse(fixture.storage.get(key)); assert.deepEqual(saved.bookmarks.map(b => b.name), ['全景', '细节']);
  assert.deepEqual(saved.bookmarks.map(b => b.snapshot.camera.zoom), [2, 7]);
  name.value = '全景'; fixture.button('重命名').dispatch('click'); assert.match(fixture.status().textContent, /同名/);
  assert.equal(JSON.parse(fixture.storage.get(key)).bookmarks[1].name, '细节');
  fixture.button('删除所选').dispatch('click'); assert.equal(JSON.parse(fixture.storage.get(key)).bookmarks.length, 1);
  assert.equal(fixture.byLabel('已保存书签数量').textContent, '1 / 100'); panel.destroy();
});
check('Old v1 browser data without timestamps remains intact and timestamps round trip', () => {
  const snapshot = captureCameraSnapshot(viewer(), {space: 'raw-world'}), key = 'BuildingWebViewer.camera-bookmarks.v1.raw-world';
  const old = {format: 'BuildingWebViewer.camera-bookmarks', version: 1, space: 'raw-world', bookmarks: [{id: 'legacy', name: '旧视角', snapshot}]};
  const storage = new Map([[key, JSON.stringify(old)]]), fixture = panelFixture(storage), camera = viewer(); camera.bounds = [[0, 0, 0], [1, 1, 1]];
  const panel = mountCameraControls({container: fixture.container, getViewers: () => [camera], space: 'raw-world'});
  assert.equal(panel.preserveView, true); assert.equal(storage.get(key), JSON.stringify(old));
  const select = fixture.byLabel('已保存视角'); select.value = 'legacy'; select.dispatch('change');
  assert.match(fixture.byLabel('选中书签信息').textContent, /旧版书签/);
  fixture.button('加载所选').dispatch('click'); assert.deepEqual(panel.capture().camera.target, snapshot.camera.target);
  const stamp = '2026-10-08T12:30:00.000Z', records = [{...old.bookmarks[0], updatedAt: stamp}];
  assert.equal(parseCameraBookmarks(serializeCameraBookmarks(records, 'raw-world'), 'raw-world').bookmarks[0].updatedAt, stamp);
  panel.destroy();
});
check('Storage failures keep controls usable and clearly offer JSON backup', () => {
  const fixture = panelFixture({getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); }}), camera = viewer(); camera.bounds = [[0, 0, 0], [1, 1, 1]];
  const panel = mountCameraControls({container: fixture.container, getViewers: () => [camera], space: 'raw-world'});
  fixture.byLabel('视角书签名称').value = '临时'; fixture.button('保存新书签').dispatch('click');
  assert.equal(fixture.byLabel('已保存书签数量').textContent, '1 / 100');
  assert.match(fixture.byClass('camera-bookmark-storage').textContent, /无法持久保存/);
  assert.equal(fixture.button('导出 JSON').disabled, false);
  const slider = fixture.byLabel('仰角（°）滑块'); slider.value = '20'; slider.dispatch('input'); assert.equal(camera.camera.elevation, 20);
  panel.destroy();
});


function sharedPanel(storage) {
  const fixture = panelFixture(storage), camera = viewer(); camera.bounds = [[0, 0, 0], [1, 1, 1]];
  const panel = mountCameraControls({container: fixture.container, getViewers: () => [camera], space: 'raw-world'});
  return {...fixture, camera, panel,
    save(name) { fixture.byLabel('视角书签名称').value = name; fixture.button('保存新书签').dispatch('click'); },
    select(id) { const select = fixture.byLabel('已保存视角'); select.value = id; select.dispatch('change'); },
  };
}
const sharedKey = 'BuildingWebViewer.camera-bookmarks.v1.raw-world';
check('Two stale panels preserve each other’s new bookmarks and preserve-view preference before every write', () => {
  const storage = new Map(), a = sharedPanel(storage), b = sharedPanel(storage);
  a.save('点云新增');
  const preserve = b.byLabel('增删文件时保持当前视角'); preserve.checked = false; preserve.dispatch('change');
  assert.deepEqual(JSON.parse(storage.get(sharedKey)).bookmarks.map(bookmark => bookmark.name), ['点云新增']);
  b.save('线框新增'); a.save('第二视角');
  const saved = JSON.parse(storage.get(sharedKey));
  assert.deepEqual(saved.bookmarks.map(bookmark => bookmark.name), ['点云新增', '线框新增', '第二视角']);
  assert.equal(saved.preserveView, false); assert.equal(a.panel.preserveView, false);
  a.panel.destroy(); b.panel.destroy();
});
check('Storage events synchronize lists without applying cameras or overwriting an unfinished name', () => {
  const storage = new Map(), a = sharedPanel(storage), b = sharedPanel(storage);
  a.save('初始'); const name = a.byLabel('视角书签名称'); name.value = '尚未写完的名称'; a.doc.activeElement = name;
  const cameraBefore = a.panel.capture(), renders = a.camera.renders;
  b.save('另一页新增'); a.storageEvent(sharedKey);
  assert.equal(a.byLabel('已保存书签数量').textContent, '2 / 100'); assert.equal(name.value, '尚未写完的名称');
  assert.deepEqual(a.panel.capture(), cameraBefore); assert.equal(a.camera.renders, renders);
  b.save('再次新增'); a.storageEvent('BuildingWebViewer.camera-bookmarks.v1.lod-arrangement');
  assert.equal(a.byLabel('已保存书签数量').textContent, '2 / 100');
  a.storageEvent(sharedKey); assert.equal(a.byLabel('已保存书签数量').textContent, '3 / 100');
  a.panel.destroy(); assert.equal(a.windowEvents.get('storage').size, 0); b.panel.destroy();
});
check('Stale load/update/rename/delete detects remote removal even before its storage event arrives', () => {
  for (const action of ['加载所选', '更新视角', '重命名', '删除所选']) {
    const storage = new Map(), a = sharedPanel(storage); a.save('待删除');
    const id = JSON.parse(storage.get(sharedKey)).bookmarks[0].id, b = sharedPanel(storage); b.select(id); b.button('删除所选').dispatch('click');
    const name = a.byLabel('视角书签名称'); name.value = '未完成草稿'; a.doc.activeElement = name;
    const cameraBefore = a.panel.capture(); a.button(action).dispatch('click');
    assert.match(a.status().textContent, /另一页面删除/); assert.equal(a.byLabel('已保存视角').value, '');
    assert.equal(name.value, '未完成草稿'); assert.deepEqual(a.panel.capture(), cameraBefore);
    assert.equal(JSON.parse(storage.get(sharedKey)).bookmarks.length, 0);
    a.panel.destroy(); b.panel.destroy();
  }
});
check('An event for remote deletion clears selection, retains the draft, and never restores a camera', () => {
  const storage = new Map(), a = sharedPanel(storage); a.save('旧视角');
  const id = JSON.parse(storage.get(sharedKey)).bookmarks[0].id, b = sharedPanel(storage); b.select(id);
  a.byLabel('视角书签名称').value = '草稿'; a.camera.camera.zoom = 8;
  b.button('删除所选').dispatch('click'); a.storageEvent(sharedKey);
  assert.match(a.status().textContent, /另一页面删除/); assert.equal(a.byLabel('已保存视角').value, '');
  assert.equal(a.byLabel('视角书签名称').value, '草稿'); assert.equal(a.camera.camera.zoom, 8);
  a.panel.destroy(); b.panel.destroy();
});
check('Failed local writes retain additions while reconciling later remote additions', () => {
  const storage = new Map(); let failRead = false, failWrite = true;
  const localStorage = {getItem(key) { if (failRead) throw Error('blocked'); return storage.get(key) ?? null; }, setItem(key, value) { if (failWrite) throw Error('full'); storage.set(key, value); }};
  const a = sharedPanel(localStorage), b = sharedPanel(storage);
  a.save('会话书签'); assert.equal(a.byLabel('已保存书签数量').textContent, '1 / 100');
  b.save('另一页书签'); a.storageEvent(sharedKey);
  assert.equal(a.byLabel('已保存书签数量').textContent, '2 / 100');
  failRead = true; a.save('读取被阻止时新增'); assert.equal(a.byLabel('已保存书签数量').textContent, '3 / 100');
  assert.equal(JSON.parse(storage.get(sharedKey)).bookmarks.length, 1);
  failRead = false; failWrite = false;
  const preserve = a.byLabel('增删文件时保持当前视角'); preserve.checked = false; preserve.dispatch('change');
  const saved = JSON.parse(storage.get(sharedKey));
  assert.deepEqual(new Set(saved.bookmarks.map(bookmark => bookmark.name)), new Set(['会话书签', '另一页书签', '读取被阻止时新增']));
  assert.equal(saved.preserveView, false); a.panel.destroy(); b.panel.destroy();
});
check('A failed deletion stays pending through remote saves and adopts remote preference changes', () => {
  const storage = new Map(), seed = sharedPanel(storage); seed.save('删除目标'); seed.panel.destroy();
  let failWrite = true;
  const a = sharedPanel({getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { if (failWrite) throw Error('full'); storage.set(key, value); }}), b = sharedPanel(storage);
  const id = JSON.parse(storage.get(sharedKey)).bookmarks[0].id; a.select(id); a.button('删除所选').dispatch('click');
  b.save('保留新增'); const preserve = b.byLabel('增删文件时保持当前视角'); preserve.checked = false; preserve.dispatch('change');
  a.storageEvent(sharedKey); assert.equal(a.byLabel('已保存书签数量').textContent, '1 / 100'); assert.equal(a.panel.preserveView, false);
  failWrite = false; a.save('再次保存');
  const saved = JSON.parse(storage.get(sharedKey)); assert.deepEqual(saved.bookmarks.map(bookmark => bookmark.name), ['保留新增', '再次保存']); assert.equal(saved.preserveView, false);
  a.panel.destroy(); b.panel.destroy();
});
async function checkAsync(name, work) { await work(); checks++; console.log('PASS', name); }
await checkAsync('Import rereads shared storage after file reading so concurrent additions are retained', async () => {
  const storage = new Map(), a = sharedPanel(storage), b = sharedPanel(storage);
  const input = a.nodes.find(node => node.type === 'file'); let release;
  const waiting = new Promise(resolve => { release = resolve; }); input.files = [{size: 500, text: () => waiting}];
  const pending = input.dispatch('change'); b.save('导入等待期间新增');
  release(JSON.stringify(captureCameraSnapshot(viewer(), {space: 'raw-world'}))); await pending;
  const saved = JSON.parse(storage.get(sharedKey)); assert.deepEqual(saved.bookmarks.map(bookmark => bookmark.name), ['导入等待期间新增', '导入视角']);
  assert.equal(a.camera.renders, 0); a.panel.destroy(); b.panel.destroy();
});

console.log(`${checks} checks passed.`);
