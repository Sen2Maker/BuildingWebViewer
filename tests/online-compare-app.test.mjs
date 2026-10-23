import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {readCompareDescriptor} from '../src/shared/online-compare-core.js';

// Semantic DOM fixture only. It does not launch a browser, emulate layout, or
// claim visual/WebGL validation; those are covered separately where available.
class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  dispatch(type, event = {}) {
    event.type = type; event.target ||= this; event.preventDefault ||= () => {};
    this[`on${type}`]?.(event);
    for (const handler of [...this.listeners.get(type) || []]) handler(event);
  }
}
class Node extends Events {
  constructor(tagName, document) {
    super(); this.tagName = tagName.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.attributes = new Map(); this._text = ''; this.value = ''; this.hidden = false;
  }
  set textContent(value) { this._text = String(value); this.replaceChildren(); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = []; this.append(...nodes);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  get firstElementChild() { return this.children[0] || null; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  focus() { this.ownerDocument.activeElement = this; }
}
function all(node, predicate) { return [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => all(child, predicate))]; }
function byClass(root, name) { return all(root, node => (node.className || '').split(' ').includes(name)); }
const baseDescriptor = {schemaVersion: 1, manifest: 'https://example.com/public/index.json', buildingId: 'A-001', maxPoints: 125000,
  preset: {pointSize: 3, grid: false, colorMode: 'height', palette: 'viridis'}};
let importSequence = 0;

async function fixture(t, {online = true, native = false, protocol = 'https:', descriptor = baseDescriptor, hash: explicitHash} = {}) {
  const saved = new Map();
  const install = (key, value) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {value, writable: true, configurable: true});
  };
  const document = {title: '', activeElement: null};
  document.documentElement = new Node('html', document);
  document.createElement = tag => new Node(tag, document);
  const root = document.createElement('main'); root.id = 'compare-app';
  document.getElementById = id => id === 'compare-app' ? root : null;
  const window = new Events(), sessions = [], renderers = [], historyUpdates = [];
  const location = {protocol, hash: explicitHash ?? `#${new URLSearchParams({compare: JSON.stringify(descriptor)})}`};
  location.href = `https://example.com/compare.html${location.hash}`;
  let bootReady = 0;
  function createComparisonSession(options) {
    const session = {options, starts: 0, selections: [], disposed: false,
      start() { this.starts++; return this.select(options.initialId); },
      select(id) {
        this.selections.push(id);
        options.onState({id, phase: 'selection', mesh: 'idle', cloud: 'idle', index: -1, total: 2});
        return Promise.resolve();
      }, previous() { return Promise.resolve(); }, next() { return Promise.resolve(); },
      dispose() { this.disposed = true; },
    };
    sessions.push(session); return session;
  }
  class Renderer {
    constructor(cloudCanvas, meshCanvas, options) {
      Object.assign(this, {cloudCanvas, meshCanvas, options, selections: [], mesh: null, cloud: null, disposed: false});
      renderers.push(this);
    }
    select(id) { this.id = id; this.selections.push(id); this.mesh = this.cloud = null; }
    setMesh(id, mesh) { if (id === this.id) this.mesh = mesh; }
    setCloud(id, cloud) { if (id === this.id) this.cloud = cloud; }
    dispose() { this.disposed = true; }
  }
  install('document', document); install('window', window); install('location', location);
  install('navigator', {onLine: online}); install('Capacitor', {isNativePlatform: () => native});
  install('history', {replaceState(_state, _title, url) { historyUpdates.push(String(url)); location.href = String(url); location.hash = new URL(url).hash; }});
  install('BuildingViewerBoot', {ready: () => bootReady++});
  install('__comparisonAppTest', {readCompareDescriptor, getLanguage: () => 'en', createComparisonSession, PairedComparisonRenderer: Renderer});
  t.after(() => {
    window.dispatch('pagehide');
    for (const [key, property] of saved) {
      if (property) Object.defineProperty(globalThis, key, property); else delete globalThis[key];
    }
  });
  const source = readFileSync(new URL('../src/compare/app.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const injected = `const {readCompareDescriptor, getLanguage, createComparisonSession, PairedComparisonRenderer} = globalThis.__comparisonAppTest;\n${source}\n// fixture ${++importSequence}`;
  const module = await import(`data:text/javascript;base64,${Buffer.from(injected).toString('base64')}`);
  return {root, document, window, location, sessions, renderers, historyUpdates, module, get bootReady() { return bootReady; }};
}

test('actual app automatically starts the configured ID with cloud on the left and mesh on the right', async t => {
  const f = await fixture(t), session = f.sessions[0], renderer = f.renderers[0];
  assert.equal(f.sessions.length, 1); assert.equal(session.starts, 1);
  assert.equal(session.options.initialId, 'A-001'); assert.equal(session.options.maxPoints, 125000);
  assert.deepEqual(session.selections, ['A-001']);
  assert.equal(byClass(f.root, 'compare-id')[0].textContent, 'A-001');
  const panes = byClass(f.root, 'compare-panes')[0].children;
  assert.match(panes[0].className, /compare-cloud/); assert.match(panes[1].className, /compare-mesh/);
  assert.equal(renderer.cloudCanvas.parentElement, panes[0]); assert.equal(renderer.meshCanvas.parentElement, panes[1]);
  assert.equal(f.bootReady, 1); assert.equal(f.historyUpdates.length, 1);
});

test('mesh callback renders immediately and stays present while the cloud is loading', async t => {
  const f = await fixture(t), {options} = f.sessions[0], renderer = f.renderers[0];
  const mesh = {id: 'A-001', faces: [[0, 1, 2]], vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 1]]};
  options.onMesh({id: 'A-001', mesh});
  options.onState({id: 'A-001', phase: 'loading', mesh: 'ready', cloud: 'parsing', index: 0, total: 2});
  assert.equal(renderer.mesh, mesh); assert.equal(renderer.cloud, null);
  assert.equal(byClass(f.root, 'compare-mesh')[0].children[0].children[1].textContent, '1 triangles');
  const cloud = {count: 25, totalCount: 100}; options.onCloud({id: 'A-001', cloud});
  options.onState({id: 'A-001', phase: 'ready', mesh: 'ready', cloud: 'ready', index: 0, total: 2});
  assert.equal(renderer.mesh, mesh); assert.equal(renderer.cloud, cloud);
  assert.equal(byClass(f.root, 'compare-cloud')[0].children[0].children[1].textContent, '25 / 100 points');
  assert.deepEqual(renderer.selections, ['A-001'], 'ordinary loading callbacks must not clear either pane');
  options.onCloud({id: 'stale', cloud: {count: 99}}); assert.equal(renderer.cloud, cloud);
});

test('same-ID search retry clears prior pane errors and resets both sides exactly once', async t => {
  const f = await fixture(t), session = f.sessions[0], {options} = session, renderer = f.renderers[0];
  options.onCatalog({buildings: [{id: 'A-001'}, {id: 'A-002'}], selectedId: 'A-001'});
  options.onState({id: 'A-001', phase: 'error', mesh: 'ready', cloud: 'error', index: 0, total: 2});
  options.onError({id: 'A-001', pane: 'cloud', error: Error('Cloud parsing failed')});
  const cloudPane = byClass(f.root, 'compare-cloud')[0], message = byClass(cloudPane, 'compare-pane-message')[0];
  assert.equal(message.hidden, false); assert.equal(message.textContent, 'Cloud parsing failed');
  const searchForm = byClass(f.root, 'compare-search')[0], input = searchForm.children[0];
  input.value = 'A-001'; searchForm.dispatch('submit');
  assert.deepEqual(session.selections, ['A-001', 'A-001']);
  assert.deepEqual(renderer.selections, ['A-001', 'A-001']);
  assert.equal(message.hidden, true); assert.equal(message.textContent, '');
  options.onState({id: 'A-001', phase: 'selection', mesh: 'idle', cloud: 'idle', index: -1, total: 2});
  assert.equal(renderer.selections.length, 2, 'duplicate selection-phase notifications must not clear twice');
  options.onCloud({id: 'A-001', cloud: {count: 7, totalCount: 7}});
  options.onState({id: 'A-001', phase: 'ready', mesh: 'ready', cloud: 'ready', index: 0, total: 2});
  assert.equal(cloudPane.children[0].children[1].textContent, '7 points');
});

test('hash changes dispose the old session and renderer; pagehide disposes the new pair', async t => {
  const f = await fixture(t), firstSession = f.sessions[0], firstRenderer = f.renderers[0];
  const updated = {...baseDescriptor, buildingId: 'B-002'};
  f.location.hash = `#${new URLSearchParams({compare: JSON.stringify(updated)})}`;
  f.location.href = `https://example.com/compare.html${f.location.hash}`;
  f.window.dispatch('hashchange');
  assert.equal(firstSession.disposed, true); assert.equal(firstRenderer.disposed, true);
  assert.equal(f.sessions.length, 2); assert.deepEqual(f.sessions[1].selections, ['B-002']);
  assert.equal(f.root.listeners.get('pointerdown').size, 1, 'remount must not accumulate root listeners');
  assert.equal(f.window.listeners.get('offline').size, 1);
  f.window.dispatch('pagehide');
  assert.equal(f.sessions[1].disposed, true); assert.equal(f.renderers[1].disposed, true);
  assert.equal(f.root.listeners.get('pointerdown').size, 0); assert.equal(f.window.listeners.get('offline').size, 0);
  f.window.dispatch('pageshow', {persisted: true});
  assert.equal(f.sessions.length, 3); assert.deepEqual(f.sessions[2].selections, ['B-002']);
});

for (const [name, settings] of [['offline', {online: false}], ['native', {native: true}], ['file protocol', {protocol: 'file:'}],
  ['missing descriptor', {hash: ''}], ['malformed descriptor', {hash: '#compare=%7Bbad'}]]) {
  test(`${name} does not create a session or renderer`, async t => {
    const f = await fixture(t, settings);
    assert.equal(f.sessions.length, 0); assert.equal(f.renderers.length, 0);
    assert.equal(byClass(f.root, 'compare-notice')[0].hidden, false);
    assert.equal(f.bootReady, 1);
  });
}

test('search renders at most eight matching options rather than the full catalog', async t => {
  const f = await fixture(t), session = f.sessions[0];
  session.options.onCatalog({buildings: Array.from({length: 8000}, (_, index) => ({id: `Building-${index}`})), selectedId: 'A-001'});
  const form = byClass(f.root, 'compare-search')[0], input = form.children[0], suggestions = byClass(form, 'compare-suggestions')[0];
  assert.equal(suggestions.children.length, 0);
  input.value = 'Building'; input.dispatch('input');
  assert.equal(suggestions.children.length, 8); assert.equal(suggestions.hidden, false);
  input.dispatch('keydown', {key: 'ArrowDown'}); assert.equal(f.document.activeElement, suggestions.children[0]);
  form.dispatch('keydown', {key: 'Escape', target: suggestions.children[0]});
  assert.equal(suggestions.hidden, true); assert.equal(f.document.activeElement, input);
  assert.equal(session.selections.length, 1, 'typing and suggestion navigation must not download a building');
});
