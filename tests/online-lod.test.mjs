import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {comparisonLink, demonstrationLink, readCompareDescriptor} from '../src/shared/online-compare-core.js';
import {readPresentation,withPresentation} from '../src/shared/online-presentation.js';
import {objectNavigationDirection} from '../src/shared/object-selection.js';

// A semantic fixture for the adapter attached to the existing Mesh workspace.
// Layout, canvas rendering, and real browser loading are verified separately.
class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  dispatch(type, values = {}) {
    const event = {type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...values};
    this[`on${type}`]?.(event);
    for (const callback of [...this.listeners.get(type) || []]) callback(event);
    return event;
  }
}
class Node extends Events {
  constructor(tag, document) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.attributes = new Map(); this.dataset = {}; this.value = ''; this._text = '';
    this.className = ''; this.hidden = false; this.disabled = false;
    this.classList = {add: name => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), name])].join(' '); }};
  }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  append(...items) {
    for (let node of items) {
      if (typeof node === 'string') { const text = new Node('#text', this.ownerDocument); text.textContent = node; node = text; }
      if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(item => item !== node);
      node.parentElement = this; this.children.push(node);
    }
  }
  replaceChildren(...items) { for (const child of this.children) child.parentElement = null; this.children = []; this._text = ''; this.append(...items); }
  before(node) { this.insertSibling(node, 0); }
  after(node) { this.insertSibling(node, 1); }
  insertSibling(node, offset) {
    const parent = this.parentElement;
    if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(item => item !== node);
    node.parentElement = parent; parent.children.splice(parent.children.indexOf(this) + offset, 0, node);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  closest(selector) {
    if (selector === 'label') return this.tagName === 'LABEL' ? this : this.parentElement?.closest(selector) || null;
    if (/input,select,textarea/.test(selector) && ['INPUT','SELECT','TEXTAREA','BUTTON','A'].includes(this.tagName)) return this;
    return this.parentElement?.closest(selector) || null;
  }
  click() { if (!this.disabled) this.dispatch('click'); }
}
function all(root, predicate) { return [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => all(child, predicate))]; }
const byClass = (root, name) => all(root, node => node.className.split(' ').includes(name));
let sequence = 0;

async function fixture(t, {custom = false} = {}) {
  const saved = new Map();
  const install = (name, value) => { saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, {value, writable: true, configurable: true}); };
  const document = new Events(); document.visibilityState = 'visible';
  document.createElement = tag => new Node(tag, document); document.body = document.createElement('body');
  const ids = new Map(), selectors = new Map();
  const add = (tag, parent = document.body, id) => { const node = document.createElement(tag); parent.append(node); if (id) { node.id = id; ids.set(id, node); } return node; };
  const localTag = add('span'); localTag.textContent = 'Local mode'; selectors.set('.local-tag', localTag);
  const source = add('section'); add('input', source); selectors.set('.project-import', source);
  const sidebar = add('aside'); selectors.set('.sidebar', sidebar); selectors.set('.sidebar-heading h2', add('h2', sidebar));
  for (const [id, tag] of Object.entries({search:'input', 'selected-models':'div', 'project-controls':'div', 'model-list':'div', 'filter-count':'span', 'item-count':'span'})) add(tag, sidebar, id);
  const heading = add('header');
  const browserControls = add('div', heading); browserControls.className = 'object-browser-controls';
  selectors.set('[data-object-browser]', browserControls); selectors.set('[data-object-browser="mesh"]', browserControls);
  const buttonRow = add('div', browserControls); selectors.set('.main-heading .button-row', buttonRow);
  add('select', browserControls, 'mesh-mode-select').value = 'multiple';
  const navigation = add('div', heading); navigation.className = 'object-id-navigation';
  const previous = add('button', navigation, 'previous-mesh-id'); previous.textContent = '‹';
  add('button', navigation, 'previous-group').textContent = '上一组';
  const counter = add('span', navigation, 'mesh-navigation-position'); counter.textContent = '0 / 0';
  const next = add('button', navigation, 'next-mesh-id'); next.textContent = '›';
  add('button', navigation, 'next-group').textContent = '下一组';
  const meshVariant = add('label', browserControls); add('select', meshVariant, 'mesh-file-select');
  add('p', browserControls, 'mesh-mode-note');
  add('p', browserControls, 'mesh-version-note');
  const grid = add('div', document.body, 'viewer-grid'); grid.dataset.panels = '2';
  add('select', document.body, 'mesh-compare-count'); const syncLabel = add('label'); add('input', syncLabel, 'mesh-sync-camera');
  for (let i = 1; i <= 3; i++) {
    add('select', document.body, `mesh-layers-${i}`).value = i === 1 ? 'cloud' : 'mesh';
    add('span', document.body, `mesh-panel-label-${i}`); add('select', document.body, `mesh-variant-${i}`); add('div', document.body, `mesh-slot-${i}`);
  }
  for (const [id, tag] of Object.entries({'mesh-cloud-file':'select', error:'div', 'scene-stats':'span', loading:'div', 'empty-state':'div', retry:'button'})) add(tag, document.body, id);
  document.getElementById = id => ids.get(id) || null; document.querySelector = selector => selectors.get(selector) || null;
  const descriptor = custom ? readCompareDescriptor(`#${new URLSearchParams({compare: JSON.stringify({schemaVersion:1, manifest:'https://data.example/buildings.json', buildingId:'B-10', maxPoints:10000})})}`, '') : readCompareDescriptor('', '?dataset=bwv-test4000&building=2');
  let current = new URL(custom ? comparisonLink(descriptor, 'https://viewer.example/app/lod.html?lang=en') : 'https://viewer.example/app/lod.html?dataset=bwv-test4000&building=2&lang=en');
  const location = {get href() { return current.href; }, get search() { return current.search; }, get hash() { return current.hash; }, reloads: 0, reload() { this.reloads++; }};
  const window = new Events(), historyUpdates = [], copied = [], resets = [], meshes = [], clouds = [], refinements = [], errors = [];
  let options, shareOptions, refreshes = 0, flying = false;
  const session = {
    starts: 0, selections: [], previousCalls: 0, nextCalls: 0, pauses: [], resumes: 0, disposals: 0,
    start() { this.starts++; return Promise.resolve(); }, select(id) { this.selections.push(id); return Promise.resolve(); },
    previous() { this.previousCalls++; return Promise.resolve(); }, next() { this.nextCalls++; return Promise.resolve(); },
    pauseRefinement(reason) { this.pauses.push(reason); }, resumeRefinement() { this.resumes++; return Promise.resolve(); }, dispose() { this.disposals++; },
  };
  install('document', document); install('window', window); install('location', location);
  install('navigator', {clipboard: {writeText: async value => { copied.push(value); }}});
  install('history', {replaceState(_state, _title, url) { historyUpdates.push(String(url)); current = new URL(url, current); }});
  install('__onlineLodTest', {createComparisonSession: () => { throw Error('Use injected session factory'); }, comparisonLink, demonstrationLink, readPresentation,withPresentation,mountOnlineShare:()=>{},getLanguage: () => 'en', objectNavigationDirection});
  const sourceText = readFileSync(new URL('../src/lod/online.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  const injected = `const {createComparisonSession,comparisonLink,demonstrationLink,getLanguage,objectNavigationDirection,readPresentation,withPresentation,mountOnlineShare}=globalThis.__onlineLodTest;\n${sourceText}\n// fixture ${++sequence}`;
  const {mountOnlineLod} = await import(`data:text/javascript;base64,${Buffer.from(injected).toString('base64')}`);
  const adapter = mountOnlineLod({descriptor,shareFactory:value=>{shareOptions=value;return {loaded(){},loading(){},dispose(){}};}, onReset: id => resets.push(id), onMesh: value => meshes.push(value), onCloud: value => clouds.push(value), onRefinement: value => refinements.push(value), onError: (...args) => errors.push(args), refresh: () => refreshes++, isFlying: () => flying, sessionFactory: value => { options = value; return session; }});
  t.after(() => { adapter.dispose(); for (const [key, property] of saved) { if (property) Object.defineProperty(globalThis, key, property); else delete globalThis[key]; } });
  const state = (extra = {}) => options.onState({id: descriptor.buildingId, phase:'loading', mesh:'ready', cloud:'loading', index:1, total:3, ...extra});
  return {adapter, descriptor, document, window, location, localTag, source, get shareOptions(){return shareOptions;}, heading, browserControls, buttonRow, navigation, counter, previous, next, ids, options, session, state, copied, resets, meshes, clouds, refinements, errors, historyUpdates, get refreshes() { return refreshes; }, set flying(value) { flying = value; }};
}

test('online data mounts into the existing Mesh workspace controls and forwards geometry callbacks', async t => {
  const f = await fixture(t);
  assert.match(f.document.body.className, /online-workspace/); assert.equal(f.localTag.textContent.trim(), 'Online mode');
  assert.equal(f.source.children[0].href, 'lod.html?lang=en');
  assert.equal(byClass(f.document.body, 'online-building-navigation').length, 0, 'no separate online-only navigation bar');
  assert.equal(f.previous.parentElement, f.navigation); assert.equal(f.next.parentElement, f.navigation);
  assert.equal(f.counter.parentElement, f.navigation); assert.equal(f.navigation.parentElement, f.heading, 'keep shared navigation directly in the heading for centered layout');
  assert.equal(f.browserControls.parentElement, f.heading); assert.equal(f.buttonRow.parentElement, f.browserControls, 'keep sharing actions alongside the mode controls');
  assert.equal(f.ids.get('mesh-mode-select').parentElement, f.browserControls);
  assert.deepEqual(f.navigation.children.map(node => node.id), ['previous-mesh-id', 'previous-group', 'mesh-navigation-position', 'next-mesh-id', 'next-group'], 'reuse the shared controls without moving buttons');
  assert.equal(f.previous.textContent, '‹'); assert.equal(f.next.textContent, '›');
  assert.equal(f.ids.get('mesh-mode-select').value, 'single'); assert.equal(f.ids.get('mesh-mode-select').disabled, true);
  assert.equal(f.ids.get('previous-group').hidden, true); assert.equal(f.ids.get('next-group').hidden, true);
  assert.equal(f.session.starts, 0); await f.adapter.start(); assert.equal(f.session.starts, 1);
  assert.equal(f.options.manifest, f.descriptor.manifest); assert.equal(f.options.initialId, '2'); assert.equal(f.options.maxPoints, 120000);
  for (const [name, results] of [['onMesh', f.meshes], ['onCloud', f.clouds], ['onRefinement', f.refinements]]) {
    const payload = {id:'2', nodeId:'r0'}; f.options[name](payload); assert.equal(results[0], payload);
  }
  f.adapter.controls();
  assert.equal(f.ids.get('mesh-compare-count').value, '2'); assert.equal(f.ids.get('mesh-sync-camera').closest('label').hidden, false);
  assert.equal(f.ids.get('mesh-layers-1').value, 'cloud'); assert.equal(f.ids.get('mesh-layers-2').value, 'mesh');
  assert.equal(f.ids.get('mesh-panel-label-1').textContent, '2 · Points'); assert.equal(f.ids.get('mesh-panel-label-2').textContent, '2 · Mesh');
  assert.equal(f.ids.get('mesh-slot-3').hidden, true); assert.equal(f.ids.get('mesh-cloud-file').disabled, true);
  f.ids.get('viewer-grid').dataset.panels = '1'; f.adapter.controls(); assert.equal(f.ids.get('mesh-sync-camera').closest('label').hidden, true);
  f.adapter.refresh(); assert.equal(f.refreshes, 1);
});

test('selection resets once, updates the current share URL, and honors navigation boundaries', async t => {
  const f = await fixture(t);
  f.state({phase:'selection', mesh:'idle', cloud:'idle', index:-1}); f.state({phase:'selection', mesh:'idle', cloud:'idle', index:-1});
  assert.deepEqual(f.resets, ['2']);
  f.state({phase:'ready', cloud:'ready', cloudPoints:120, totalCloudPoints:300});
  assert.equal(f.ids.get('scene-stats').textContent, '120 / 300 points'); assert.equal(f.ids.get('loading').hidden, true);
  f.previous.click(); f.next.click(); assert.equal(f.session.previousCalls, 1); assert.equal(f.session.nextCalls, 1);
  f.state({id:'3', phase:'selection', mesh:'idle', index:-1}); f.state({id:'3', phase:'ready', cloud:'ready', cloudPoints:300, totalCloudPoints:300, index:2});
  assert.deepEqual(f.resets, ['2', '3']); assert.equal(f.next.disabled, true); f.next.click(); assert.equal(f.session.nextCalls, 1);
  const current = new URL(f.location.href); assert.equal(current.pathname, '/app/lod.html'); assert.equal(current.searchParams.get('building'), '3'); assert.equal(current.searchParams.get('lang'), 'en');
  assert.equal(f.counter.textContent, '3 / 3');
  assert.equal(readCompareDescriptor(new URL(f.shareOptions.link()).hash).buildingId,'3'); assert.equal(f.shareOptions.ready(),true);
  f.state({index:0}); assert.equal(f.previous.disabled, true); f.previous.click(); assert.equal(f.session.previousCalls, 1);
  assert.equal(f.counter.textContent, '1 / 3');
});

test('shared position counter clears stale selection while the new building index is unresolved', async t => {
  const f = await fixture(t);
  assert.equal(f.counter.textContent, '0 / 0'); assert.equal(f.previous.disabled, true); assert.equal(f.next.disabled, true);
  f.state({phase:'ready', index:1, total:3}); assert.equal(f.counter.textContent, '2 / 3');
  f.state({id:'3', phase:'selection', mesh:'idle', cloud:'idle', index:-1, total:3});
  assert.equal(f.counter.textContent, '0 / 3', 'do not show the previous building position while the new index is unresolved');
  assert.equal(f.previous.disabled, true); assert.equal(f.next.disabled, true);
  f.previous.click(); f.next.click(); assert.equal(f.session.previousCalls, 0); assert.equal(f.session.nextCalls, 0);
  f.state({id:'3', phase:'loading', index:2, total:3}); assert.equal(f.counter.textContent, '3 / 3');
  assert.equal(f.previous.disabled, false); assert.equal(f.next.disabled, true);
  f.state({phase:'error', index:-1, total:0}); assert.equal(f.counter.textContent, '0 / 0');
  assert.equal(f.previous.disabled, true); assert.equal(f.next.disabled, true);
});

test('catalog paging stays bounded and ID search does not fetch until a row or Enter is chosen', async t => {
  const f = await fixture(t); f.options.onCatalog({buildings:Array.from({length:4000}, (_, index) => ({id:String(index+1)}))});
  const list = f.ids.get('model-list'), search = f.ids.get('search'), pager = byClass(f.document.body, 'online-catalog-pages')[0];
  assert.equal(list.children.length, 40); assert.equal(list.children[0].textContent, 'Building 1'); assert.equal(pager.children[0].disabled, true);
  pager.children[2].click(); assert.equal(list.children[0].textContent, 'Building 41'); assert.equal(pager.children[1].textContent, '2 / 100');
  search.value = '#367'; search.dispatch('input'); assert.equal(f.session.selections.length, 0);
  assert.ok(list.children.length <= 40); search.dispatch('keydown', {key:'Enter'}); assert.deepEqual(f.session.selections, ['367']);
  search.value = '4000'; search.dispatch('input'); assert.equal(list.children.length, 1); list.children[0].click(); assert.deepEqual(f.session.selections, ['367','4000']);
  search.value = 'missing'; search.dispatch('input'); search.dispatch('keydown', {key:'Enter'}); assert.equal(f.session.selections.length, 2);
  assert.equal(list.children[0].textContent, 'No matching buildings'); assert.equal(pager.children[2].disabled, true);
});

test('refinement retains progress and exposes pause, budget continuation, retry, and completion', async t => {
  const f = await fixture(t); const refinement = byClass(f.document.body, 'online-refinement')[0], [detail, toggle] = refinement.children;
  f.state({cloud:'ready', refinement:'loading', refinementCompleted:2, refinementTotal:10});
  assert.equal(refinement.hidden, false); assert.equal(detail.textContent, 'Loading detail 2 / 10'); toggle.click(); assert.deepEqual(f.session.pauses, [undefined]);
  f.ids.get('viewer-grid').dispatch('pointerdown'); f.ids.get('viewer-grid').dispatch('wheel'); assert.deepEqual(f.session.pauses.slice(1), ['interaction','interaction']);
  f.state({refinement:'paused', refinementReason:'budget'}); assert.equal(detail.textContent, 'Point budget reached'); toggle.click(); assert.equal(f.session.resumes, 1);
  f.ids.get('viewer-grid').dispatch('pointerdown'); assert.equal(f.session.pauses.length, 3, 'already paused work is not paused again by interaction');
  f.state({refinement:'error'}); assert.equal(toggle.textContent, 'Retry detail'); toggle.click(); assert.equal(f.session.resumes, 2);
  f.state({refinement:'complete'}); assert.equal(toggle.hidden, true); assert.equal(detail.textContent, 'All detail loaded');
  f.document.visibilityState = 'hidden'; f.document.dispatch('visibilitychange'); assert.equal(f.session.pauses.at(-1), 'hidden');
});

test('catalog opens the page containing the building selected by the incoming link', async t => {
  const f = await fixture(t); f.state({id:'367', phase:'selection', index:-1});
  f.options.onCatalog({buildings:Array.from({length:4000}, (_, index) => ({id:String(index+1)}))});
  const list = f.ids.get('model-list'), pager = byClass(f.document.body, 'online-catalog-pages')[0];
  assert.equal(list.children.length, 40); assert.equal(list.children[0].textContent, 'Building 361');
  assert.equal(pager.children[1].textContent, '10 / 100'); assert.equal(list.children[6].getAttribute('aria-pressed'), 'true');
  assert.deepEqual(f.session.selections, [], 'catalog presentation must not select or download a second building');
});

test('keyboard navigation respects form controls and offline retry prevents stale session use', async t => {
  const f = await fixture(t); f.state();
  const keyboard = f.document.dispatch('keydown', {key:'ArrowRight', target:f.document.body}); assert.equal(keyboard.defaultPrevented, true); assert.equal(f.session.nextCalls, 1);
  f.document.dispatch('keydown', {key:'ArrowRight', target:f.ids.get('search')});
  f.document.dispatch('keydown', {key:'ArrowRight', target:f.document.body, ctrlKey:true});
  assert.equal(f.session.nextCalls, 1);
  f.flying = true;
  const flightKey = f.document.dispatch('keydown', {key:'ArrowRight', target:f.document.body});
  assert.equal(flightKey.defaultPrevented, false, 'flight controls keep their arrow keys'); assert.equal(f.session.nextCalls, 1);
  f.flying = false;
  f.document.dispatch('keydown', {key:'ArrowRight', target:f.document.body}); assert.equal(f.session.nextCalls, 2);
  f.window.dispatch('offline'); assert.equal(f.session.disposals, 1); assert.equal(f.next.disabled, true); assert.equal(f.previous.disabled, true);
  f.adapter.select('3'); assert.deepEqual(f.session.selections, []); assert.match(f.errors[0][0], /Offline/);
  f.ids.get('retry').click(); assert.equal(f.location.reloads, 1);
  f.adapter.dispose(); const before = f.ids.get('scene-stats').textContent; f.state({cloud:'ready', cloudPoints:999}); assert.equal(f.ids.get('scene-stats').textContent, before);
  assert.equal(f.document.listeners.get('keydown').size, 0); assert.equal(f.window.listeners.get('offline').size, 0);
});

test('custom manifest links keep their descriptor and locale while selecting a different building', async t => {
  const f = await fixture(t, {custom:true}); f.state({id:'B-11', phase:'selection', index:-1}); f.state({id:'B-11', index:2});
  const url = new URL(f.location.href), descriptor = readCompareDescriptor(url.hash, url.search);
  assert.equal(url.pathname, '/app/lod.html'); assert.equal(url.searchParams.get('lang'), 'en'); assert.equal(url.searchParams.has('dataset'), false);
  assert.equal(descriptor.buildingId, 'B-11'); assert.equal(descriptor.manifest, 'https://data.example/buildings.json'); assert.equal(descriptor.maxPoints, 10000);
  f.options.onError({error:Error('Digest mismatch')}); assert.deepEqual(f.errors.at(-1), ['Digest mismatch', true]);
});
