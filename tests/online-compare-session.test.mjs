import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createComparisonSession, normalizeComparisonCatalog, COMPARISON_CACHE_BYTES} from '../src/compare/session.js';
import {parseComparisonCloudMessage} from '../src/compare/point-worker.js';
import {parseOBJ} from '../src/lod/obj-parser.js';
import {readPointCloud} from '../src/cloud/point-io.js';

const origin = 'https://comparison-fixture.example';
const manifest = `${origin}/index.json`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
const tick = () => new Promise(resolve => setTimeout(resolve, 1));
async function waitFor(predicate) {
  const end = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > end) throw Error('Synthetic comparison condition timed out'); await tick(); }
}
function fixture(ids = ['1', '2', '3', '4']) {
  const files = new Map(), datasets = [], calls = [], holds = new Map();
  for (const id of ids) {
    const number = Number(id) || 0;
    const mesh = Buffer.from(`v ${number} 0 0\nv ${number + 1} 0 0\nv ${number} 1 0\nf 1 2 3\n`);
    const cloud = Buffer.from(`${number} 0 0\n${number + 1} 1 1\n${number + 2} 2 2\n`);
    // Point-cloud-first is intentional: index order must not decide fetch order.
    for (const [role, format, viewer, bytes] of [['point_cloud', 'xyz', 'pointcloud', cloud], ['mesh', 'obj', 'lod', mesh]]) {
      const url = `${origin}/${id}/${role}.${format}`;
      files.set(url, bytes);
      datasets.push({id: `${id}/${role}`, name: `${role}.${format}`, url, format, viewer, bytes: bytes.length, sha256: hash(bytes)});
    }
  }
  const index = {schemaVersion: 1, datasets};
  const fetchImpl = async (url, options) => {
    calls.push({url, options});
    if (holds.has(url)) await holds.get(url).promise;
    if (url === manifest) return new Response(JSON.stringify(index));
    if (!files.has(url)) return new Response('not found', {status: 404});
    return new Response(files.get(url));
  };
  return {index, files, calls, holds, fetchImpl, mesh: id => `${origin}/${id}/mesh.obj`, cloud: id => `${origin}/${id}/point_cloud.xyz`};
}
function setup(data, options = {}) {
  const states = [], errors = [], meshes = [], clouds = [], catalogs = [];
  const session = createComparisonSession({manifest, initialId: '2', fetchImpl: data.fetchImpl, prefetch: false, workerFactory: null,
    onState: value => states.push(value), onError: value => errors.push(value),
    onMesh: value => meshes.push(value), onCloud: value => clouds.push(value), onCatalog: value => catalogs.push(value), ...options});
  return {session, states, errors, meshes, clouds, catalogs};
}
const assets = data => data.calls.filter(call => call.url !== manifest).map(call => call.url);

test('catalog preserves original pair IDs and public relative index resolution', () => {
  const data = fixture(['21', '2', '9']);
  const catalog = normalizeComparisonCatalog(data.index, {manifestUrl: manifest});
  assert.deepEqual(catalog.map(pair => pair.id), ['21', '2', '9']);
  assert.equal(catalog[1].mesh.id, '2/mesh');
  assert.equal(catalog[1].cloud.id, '2/point_cloud');
  const relative = {schema_version: 1, public_base_url: `${origin}/`, path_base: 'directory_containing_index', buildings: [{id: '2', mesh: {path: 'mesh.obj', bytes: 1, sha256: 'a'.repeat(64)}, point_cloud: {path: 'cloud.xyz', bytes: 1, sha256: 'b'.repeat(64)}}]};
  assert.equal(normalizeComparisonCatalog(relative, {manifestUrl: manifest})[0].mesh.url, `${origin}/mesh.obj`);
  assert.throws(() => normalizeComparisonCatalog(relative, {manifestUrl: `${origin}/wrong/index.json`}), /base must match/);
});

test('selected mesh fetch, parse, and callback finish before slow cloud is fetched', async t => {
  const data = fixture(), cloudGate = deferred(), meshCallback = deferred(), order = [];
  data.holds.set(data.cloud('2'), cloudGate);
  const result = setup(data, {onMesh: async ({id}) => { order.push(`mesh:${id}`); await meshCallback.promise; }, onCloud: ({id}) => order.push(`cloud:${id}`)});
  t.after(() => { result.session.dispose(); cloudGate.resolve(); meshCallback.resolve(); });
  const pending = result.session.start();
  await waitFor(() => order.length === 1);
  assert.deepEqual(assets(data), [data.mesh('2')]);
  meshCallback.resolve();
  await waitFor(() => data.calls.some(call => call.url === data.cloud('2')));
  assert.deepEqual(order, ['mesh:2']);
  assert.equal(result.session.getState().mesh, 'ready');
  assert.equal(result.session.getState().cloud, 'loading');
  cloudGate.resolve(); await pending;
  assert.deepEqual(order, ['mesh:2', 'cloud:2']);
  assert.equal(result.session.getState().phase, 'ready');
  assert.equal(result.session.getState().parseMode, 'main-thread');
  assert.ok(data.calls.every(call => call.options.credentials === 'omit' && call.options.cache === 'no-store' && call.options.redirect === 'error'));
});

test('missing explicit ID never silently loads the first pair', async t => {
  for (const initialId of [undefined, '', 'missing']) {
    const data = fixture(), result = setup(data, {initialId}); t.after(() => result.session.dispose());
    await result.session.start();
    assert.equal(result.session.getState().phase, 'error');
    assert.equal(assets(data).length, 0);
    assert.equal(result.errors[0].pane, 'catalog');
    assert.match(result.errors[0].error.message, /ID/);
  }
});

test('missing pane keeps same building identity and reports only that pane', async t => {
  const data = fixture(); data.index.datasets = data.index.datasets.filter(entry => entry.id !== '2/point_cloud');
  const result = setup(data); t.after(() => result.session.dispose());
  await result.session.start();
  assert.deepEqual(result.meshes.map(value => value.id), ['2']);
  assert.deepEqual(assets(data), [data.mesh('2')]);
  assert.equal(result.errors.length, 1); assert.equal(result.errors[0].pane, 'cloud');
  assert.equal(result.session.getState().mesh, 'ready'); assert.equal(result.session.getState().cloud, 'error');
});

test('existing exact hash and size verification reject tampered files before parsing', async t => {
  for (const kind of ['hash', 'size']) {
    const data = fixture(), original = data.files.get(data.cloud('2'));
    data.files.set(data.cloud('2'), kind === 'hash' ? Buffer.from(original.toString().replace('2 0 0', '9 0 0')) : Buffer.from('0 0 0'));
    const result = setup(data); t.after(() => result.session.dispose());
    await result.session.start();
    assert.equal(result.meshes.length, 1); assert.equal(result.clouds.length, 0);
    assert.equal(result.errors[0].pane, 'cloud'); assert.match(result.errors[0].error.message, /checksum|size does not match/);
  }
});

test('late mesh parser completion cannot attach an old mesh or start its cloud', async t => {
  const data = fixture(), firstParse = deferred(), started = deferred();
  const result = setup(data, {parseMesh: async (text, id, bytes) => { if (id === '2') { started.resolve(); await firstParse.promise; } return parseOBJ(text, id, bytes); }});
  t.after(() => { result.session.dispose(); firstParse.resolve(); });
  const old = result.session.start(); await started.promise;
  await result.session.select('3'); firstParse.resolve(); await old;
  assert.deepEqual(result.meshes.map(value => value.id), ['3']);
  assert.deepEqual(result.clouds.map(value => value.id), ['3']);
  assert.ok(!assets(data).includes(data.cloud('2')));
  assert.equal(result.session.getState().id, '3');
});

test('late cloud fallback parser completion cannot attach to a newer selection', async t => {
  const data = fixture(), firstParse = deferred(), started = deferred();
  const result = setup(data, {parseCloud: async (file, options) => { if (file.name === '2/point_cloud.xyz') { started.resolve(); await firstParse.promise; } return readPointCloud(file, options); }});
  t.after(() => { result.session.dispose(); firstParse.resolve(); });
  const old = result.session.start(); await started.promise;
  await result.session.select('3'); firstParse.resolve(); await old;
  assert.deepEqual(result.clouds.map(value => value.id), ['3']);
  assert.equal(result.session.getState().phase, 'ready');
});

class SyntheticWorker {
  constructor({hold, fail = false} = {}) { this.hold = hold; this.fail = fail; this.terminated = false; this.received = null; }
  postMessage(message, transfers) {
    this.received = structuredClone(message, {transfer: transfers});
    this.detachedOriginalBytes = message.buffer.byteLength;
    const deliver = this.onmessage;
    this.pending = (async () => {
      if (this.hold) await this.hold.promise;
      if (this.fail) { this.onerror?.({message: 'Synthetic module worker failed', preventDefault() {}}); return; }
      // Deliberately retain the old listener even after terminate to exercise the
      // session's generation guard, not just the browser's termination behavior.
      await parseComparisonCloudMessage(this.received, (value, transfer = []) => {
        const data = structuredClone(value, {transfer}); deliver?.({data});
      });
    })();
  }
  terminate() { this.terminated = true; }
}

test('worker invokes existing sampled reader, transfers arrays, and preserves cached input', async t => {
  const data = fixture(), workers = [];
  const result = setup(data, {maxPoints: 2, workerFactory: () => { const worker = new SyntheticWorker(); workers.push(worker); return worker; }});
  t.after(() => result.session.dispose());
  await result.session.start(); await result.session.select('2');
  assert.equal(workers.length, 2); assert.ok(workers.every(worker => worker.terminated));
  assert.ok(workers.every(worker => worker.detachedOriginalBytes === 0));
  assert.equal(assets(data).filter(url => url === data.cloud('2')).length, 1);
  assert.equal(result.clouds.length, 2);
  assert.equal(result.clouds[0].parseMode, 'worker');
  assert.equal(result.clouds[0].cloud.count, 2); assert.equal(result.clouds[0].cloud.totalCount, 3);
  assert.deepEqual(result.clouds[0].cloud.bounds, [[2, 0, 0], [4, 2, 2]]);
  assert.ok(result.clouds[0].cloud.positions instanceof Float64Array);
  assert.deepEqual(result.clouds[0].cloud.positions, result.clouds[1].cloud.positions);
});

test('navigation terminates worker and ignores its queued old result', async t => {
  const data = fixture(), gate = deferred(), workers = [];
  const result = setup(data, {workerFactory: () => { const worker = new SyntheticWorker({hold: workers.length === 0 ? gate : null}); workers.push(worker); return worker; }});
  t.after(() => { result.session.dispose(); gate.resolve(); });
  const old = result.session.start(); await waitFor(() => workers.length === 1 && workers[0].received);
  await result.session.next();
  assert.equal(workers[0].terminated, true);
  gate.resolve(); await old; await workers[0].pending;
  assert.deepEqual(result.clouds.map(value => value.id), ['3']);
  assert.equal(result.session.getState().id, '3');
});

test('worker construction fallback is explicitly main-thread; runtime failure stays local to cloud', async t => {
  for (const unavailable of [true, false]) {
    const data = fixture(), result = setup(data, {workerFactory: () => { if (unavailable) throw Error('Worker unavailable'); return new SyntheticWorker({fail: true}); }});
    t.after(() => result.session.dispose()); await result.session.start();
    assert.equal(result.meshes.length, 1);
    if (unavailable) { assert.equal(result.clouds[0].parseMode, 'main-thread'); assert.equal(result.errors.length, 0); }
    else { assert.equal(result.clouds.length, 0); assert.equal(result.errors[0].pane, 'cloud'); assert.match(result.errors[0].error.message, /worker failed/); }
  }
});

test('only previous and next pairs prefetch after current cloud; all neighbor meshes precede clouds', async t => {
  const data = fixture(['0', '1', '2', '3', '4', '5']);
  const result = setup(data, {prefetch: true}); t.after(() => result.session.dispose());
  await result.session.start(); await waitFor(() => assets(data).length === 6 && result.session.getState().reservedBytes === 0);
  assert.deepEqual(assets(data), [data.mesh('2'), data.cloud('2'), data.mesh('3'), data.mesh('1'), data.cloud('3'), data.cloud('1')]);
  assert.ok(result.states.every(state => state.cachePairs.length <= 3 && state.cacheBytes + state.reservedBytes <= COMPARISON_CACHE_BYTES));
  const count = assets(data).length; await tick(); await tick(); assert.equal(assets(data).length, count);
});

test('one speculative request with exact reservation; foreground navigation preempts it', async t => {
  const data = fixture(), gate = deferred(); data.holds.set(data.mesh('3'), gate);
  const result = setup(data, {prefetch: true}); t.after(() => { result.session.dispose(); gate.resolve(); });
  await result.session.start(); await waitFor(() => assets(data).includes(data.mesh('3')));
  const prefetchRequest = data.calls.find(call => call.url === data.mesh('3'));
  assert.equal(result.session.getState().reservedBytes, data.files.get(data.mesh('3')).length);
  assert.ok(!assets(data).includes(data.mesh('1')));
  await result.session.select('1');
  assert.equal(prefetchRequest.options.signal.aborted, true);
  assert.equal(result.clouds.at(-1).id, '1');
  gate.resolve();
  await waitFor(() => result.session.getState().reservedBytes === 0);
  assert.ok(result.states.every(state => state.cacheBytes + state.reservedBytes <= COMPARISON_CACHE_BYTES));
});

test('small cache budget skips speculative oversized assets and keeps foreground working', async t => {
  const data = fixture(), budget = data.files.get(data.mesh('2')).length;
  const result = setup(data, {prefetch: true, cacheBudgetBytes: budget}); t.after(() => result.session.dispose());
  await result.session.start(); await tick();
  assert.deepEqual(assets(data), [data.mesh('2'), data.cloud('2')]);
  assert.equal(result.session.getState().phase, 'ready');
  assert.ok(result.states.every(state => state.cacheBytes + state.reservedBytes <= budget));
  assert.equal(result.session.getState().cacheBytes, budget);
});

test('large foreground file is not rejected by cache budget and remains uncached', async t => {
  const data = fixture(), raw = Buffer.alloc(COMPARISON_CACHE_BYTES + 1, 32);
  raw.set(Buffer.from('0 0 0\n'));
  const entry = data.index.datasets.find(item => item.id === '2/point_cloud');
  entry.bytes = raw.length; entry.sha256 = hash(raw); data.files.set(data.cloud('2'), raw);
  let parsed = 0;
  const result = setup(data, {parseCloud: async (file, {maxPoints}) => { parsed++; assert.equal(file.size, raw.length); assert.equal(maxPoints, 250000); return {count: 1, totalCount: 1, bounds: [[0, 0, 0], [0, 0, 0]]}; }});
  t.after(() => result.session.dispose());
  await result.session.start(); await result.session.select('2');
  assert.equal(parsed, 2); assert.equal(result.errors.length, 0);
  assert.equal(assets(data).filter(url => url === data.cloud('2')).length, 2);
  assert.equal(result.session.getState().cacheBytes, data.files.get(data.mesh('2')).length);
});

test('Save-Data suppresses prefetch; offline/native starts are clear and make no requests', async t => {
  const data = fixture(), saved = setup(data, {prefetch: true, host: {navigator: {onLine: true, connection: {saveData: true}}}});
  t.after(() => saved.session.dispose()); await saved.session.start(); await tick();
  assert.deepEqual(assets(data), [data.mesh('2'), data.cloud('2')]);
  for (const host of [{navigator: {onLine: false}}, {Capacitor: {isNativePlatform: () => true}}]) {
    const isolated = fixture(), result = setup(isolated, {host}); t.after(() => result.session.dispose());
    await result.session.start(); assert.equal(isolated.calls.length, 0); assert.equal(result.errors[0].pane, 'catalog');
    assert.match(result.errors[0].error.message, /offline|web app/);
  }
});

test('metadata cap, CORS/network failure, and disposal never attach partial or stale data', async t => {
  const oversized = fixture(), tooLarge = setup(oversized, {fetchImpl: async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1))});
  t.after(() => tooLarge.session.dispose()); await tooLarge.session.start(); assert.match(tooLarge.errors[0].error.message, /byte limit/);
  const network = setup(fixture(), {fetchImpl: async () => { throw new TypeError('Failed to fetch'); }});
  t.after(() => network.session.dispose()); await network.session.start(); assert.match(network.errors[0].error.message, /Failed to fetch/);
  const data = fixture(), gate = deferred(); data.holds.set(data.cloud('2'), gate);
  const disposed = setup(data); const pending = disposed.session.start(); await waitFor(() => assets(data).includes(data.cloud('2')));
  const count = disposed.states.length; disposed.session.dispose(); gate.resolve(); await pending; await tick();
  assert.equal(disposed.clouds.length, 0); assert.equal(disposed.states.length, count); assert.equal(disposed.session.getState().cacheBytes, 0);
});

test('worker protocol validates point limit and serializes parser failure', async () => {
  const output = [];
  await parseComparisonCloudMessage({type: 'parse', id: 5, buffer: new ArrayBuffer(1), filename: 'x.xyz', maxPoints: 0}, value => output.push(value));
  assert.equal(output[0].type, 'error'); assert.equal(output[0].id, 5); assert.match(output[0].error.message, /limit/);
});

test('mesh parse failure preserves independent same-ID cloud and same-ID retry clears states', async t => {
  const data = fixture(); let fail = true;
  const result = setup(data, {parseMesh: (text, id, bytes) => { if (fail) throw Error('Synthetic mesh parse failure'); return parseOBJ(text, id, bytes); }});
  t.after(() => result.session.dispose()); await result.session.start();
  assert.equal(result.meshes.length, 0); assert.deepEqual(result.clouds.map(value => value.id), ['2']);
  assert.equal(result.errors[0].pane, 'mesh'); assert.equal(result.session.getState().cloud, 'ready');
  const previousStates = result.states.length; fail = false; await result.session.select('2');
  assert.equal(result.states[previousStates].phase, 'selection');
  assert.equal(result.states[previousStates].mesh, 'idle'); assert.equal(result.states[previousStates].cloud, 'idle');
  assert.equal(result.session.getState().phase, 'ready'); assert.equal(result.meshes[0].id, '2');
});

test('worker deadline terminates a nonresponding worker and preserves the ready mesh', async t => {
  const data = fixture(), worker = {postMessage() {}, terminate() { this.terminated = true; }};
  const result = setup(data, {workerFactory: () => worker, parseTimeoutMs: 5}); t.after(() => result.session.dispose());
  await result.session.start();
  assert.equal(worker.terminated, true); assert.equal(result.meshes.length, 1); assert.equal(result.clouds.length, 0);
  assert.equal(result.errors[0].error.code, 'COMPARE_PARSE_TIMEOUT'); assert.equal(result.errors[0].pane, 'cloud');
});

test('URL descriptor-compatible one-million limit is accepted without changing default sampling', async t => {
  const data = fixture(), workers = [];
  const result = setup(data, {maxPoints: 1000000, workerFactory: () => { const worker = new SyntheticWorker(); workers.push(worker); return worker; }});
  t.after(() => result.session.dispose()); await result.session.start();
  assert.equal(result.errors.length, 0); assert.equal(workers[0].received.maxPoints, 1000000);
  assert.equal(result.clouds[0].cloud.totalCount, 3); assert.equal(result.clouds[0].cloud.count, 3);
  assert.throws(() => createComparisonSession({maxPoints: 1000001}), /maxPoints/);
});

test('speculative response is capped to reserved declared bytes even for a misleading index', async t => {
  const data = fixture(); data.files.set(data.mesh('3'), Buffer.alloc(4096, 65));
  const result = setup(data, {prefetch: true}); t.after(() => result.session.dispose());
  await result.session.start(); await waitFor(() => assets(data).includes(data.cloud('1')) && result.session.getState().reservedBytes === 0);
  assert.equal(result.errors.length, 0); assert.equal(result.session.getState().phase, 'ready');
  const before = assets(data).filter(url => url === data.mesh('3')).length;
  await result.session.select('3');
  assert.equal(assets(data).filter(url => url === data.mesh('3')).length, before + 1, 'failed speculative bytes were not cached');
  assert.equal(result.errors.at(-1).pane, 'mesh');
  assert.ok(result.states.every(state => state.cacheBytes + state.reservedBytes <= COMPARISON_CACHE_BYTES));
});

test('a slow current cloud permits one low-priority neighbor mesh at a time, never neighbor clouds', async t => {
  const data = fixture(), cloudGate = deferred(), neighborGate = deferred();
  data.holds.set(data.cloud('2'), cloudGate); data.holds.set(data.mesh('3'), neighborGate);
  const result = setup(data, {prefetch: true});
  t.after(() => { result.session.dispose(); cloudGate.resolve(); neighborGate.resolve(); });
  const pending = result.session.start();
  await waitFor(() => assets(data).includes(data.mesh('3')));
  assert.deepEqual(assets(data), [data.mesh('2'), data.cloud('2'), data.mesh('3')]);
  assert.equal(result.meshes.length, 1); assert.equal(result.clouds.length, 0);
  assert.equal(result.session.getState().mesh, 'ready'); assert.equal(result.session.getState().cloud, 'loading');
  assert.equal(data.calls.find(call => call.url === data.mesh('3')).options.priority, 'low');
  assert.equal(data.calls.find(call => call.url === data.cloud('2')).options.priority, undefined);
  neighborGate.resolve();
  await waitFor(() => assets(data).includes(data.mesh('1')) && result.session.getState().reservedBytes === 0);
  await tick(); await tick();
  assert.deepEqual(assets(data), [data.mesh('2'), data.cloud('2'), data.mesh('3'), data.mesh('1')]);
  cloudGate.resolve(); await pending;
  await waitFor(() => assets(data).length === 6 && result.session.getState().reservedBytes === 0);
  assert.deepEqual(assets(data).slice(4), [data.cloud('3'), data.cloud('1')]);
  assert.ok(result.states.every(state => state.cacheBytes + state.reservedBytes <= COMPARISON_CACHE_BYTES));
});
