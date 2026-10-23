import test from 'node:test';
import assert from 'node:assert/strict';
import {
  METADATA_MAX_BYTES, FILE_MAX_BYTES, MANIFEST_MAX_ENTRIES,
  normalizePublicUrl, validatePreset, validateDescriptor, normalizeManifest, fetchBounded,
} from '../src/shared/online-preview-core.js';

const url = 'https://files.example.test/synthetic.xyz';
const descriptor = (extra = {}) => ({schemaVersion: 1, url, viewer: 'pointcloud', format: 'xyz', ...extra});
const entry = (extra = {}) => ({id: 'synthetic-points', url, viewer: 'pointcloud', format: 'xyz', ...extra});
const sha256 = 'a1'.repeat(32);
const tick = () => new Promise(resolve => setImmediate(resolve));

function byteResponse(chunks, {headers = {}, status = 200, type = 'basic', redirected = false, responseUrl = ''} = {}) {
  let index = 0;
  const state = {cancelled: false, released: false, reads: 0};
  const reader = {
    async read() { state.reads++; return index < chunks.length ? {done: false, value: chunks[index++]} : {done: true}; },
    async cancel() { state.cancelled = true; },
    releaseLock() { state.released = true; },
  };
  const body = {getReader: () => reader, async cancel() { state.cancelled = true; }};
  return {state, reader, response: {ok: status >= 200 && status < 300, status, type, redirected, url: responseUrl, headers: new Headers(headers), body}};
}

test('public HTTPS URLs normalize without disclosing credentials or changing ordinary query parameters', () => {
  assert.equal(normalizePublicUrl('https://EXAMPLE.test:443/a%20b.xyz?v=2'), 'https://example.test/a%20b.xyz?v=2');
  assert.equal(normalizePublicUrl('https://8.8.8.8/model.obj'), 'https://8.8.8.8/model.obj');
  assert.equal(normalizePublicUrl('https://[2606:4700:4700::1111]/model.obj'), 'https://[2606:4700:4700::1111]/model.obj');
  assert.equal(normalizePublicUrl('https://files.example.test/model.xyz?monkey=1&author=example'), 'https://files.example.test/model.xyz?monkey=1&author=example');
});

test('reject schemes, credentials, fragments, whitespace and malformed URLs', () => {
  for (const value of ['http://example.test/a', '//example.test/a', '/a.xyz', 'https:example.test/a', 'data:text/plain,1', 'javascript:alert(1)', 'file:///tmp/a', 'https%3A%2F%2Fexample.test/a', 'https%253A%252F%252Fexample.test/a', 'https://u:p@example.test/a', 'https://user@example.test/a', 'https://example.test/a#secret', 'https://example.test/a#', ' https://example.test/a', 'https://example.test/a\n', 'https://example.test\\@localhost/a', 'https://']) {
    assert.throws(() => normalizePublicUrl(value), Error, value);
  }
});

test('reject obvious local/private, reserved, integer, hex, mapped and tunnel addresses', () => {
  for (const host of ['localhost', 'localhost.', 'a.localhost', 'nas', 'nas.local', 'nas.lan', 'server.internal', 'router.home', '127.0.0.1', '127.1', '2130706433', '0x7f000001', '0177.0.0.1', '0.0.0.0', '10.1.2.3', '172.16.1.2', '172.31.255.255', '192.168.1.2', '169.254.169.254', '100.64.0.1', '100.127.255.255', '198.18.0.1', '224.0.0.1', '255.255.255.255', '[::]', '[::1]', '[::ffff:127.0.0.1]', '[::ffff:a00:1]', '[fc00::1]', '[fd12::1]', '[fe80::1]', '[ff02::1]', '[2001:db8::1]', '[2002:7f00:1::1]', '[64:ff9b::7f00:1]']) {
    assert.throws(() => normalizePublicUrl(`https://${host}/a.xyz`), Error, host);
  }
  assert.equal(normalizePublicUrl('https://172.32.0.1/a.xyz'), 'https://172.32.0.1/a.xyz');
  assert.equal(normalizePublicUrl('https://192.2.1.1/a.xyz'), 'https://192.2.1.1/a.xyz');
});

test('reject common secret-bearing query parameter names before fetching', () => {
  for (const key of ['token', 'access_token', 'id-token', 'key', 'api_key', 'auth', 'authorization', 'password', 'client_secret', 'X-Amz-Signature', 'X-Goog-Credential', 'resourcekey', '%74oken']) {
    assert.throws(() => normalizePublicUrl(`https://example.test/data?${key}=DO_NOT_INCLUDE`), /secret|authentication/, key);
  }
});

test('Drive file links normalize only to the ordinary download URL; no access bypass', () => {
  assert.equal(normalizePublicUrl('https://drive.google.com/file/d/synthetic-file-id/view?usp=sharing'), 'https://drive.google.com/uc?export=download&id=synthetic-file-id');
  assert.equal(normalizePublicUrl('https://drive.google.com/file/d/synthetic-file-id/preview'), 'https://drive.google.com/uc?export=download&id=synthetic-file-id');
  assert.equal(normalizePublicUrl('https://drive.google.com/uc?export=download&id=synthetic-file-id'), 'https://drive.google.com/uc?export=download&id=synthetic-file-id');
  assert.throws(() => normalizePublicUrl('https://drive.google.com/file/d/synthetic/view?resourcekey=private'), /secret/);
});

test('presets are copied, strictly bounded and viewer-specific without changing their input', () => {
  const input = {pointSize: 2.5, pointOpacity: .15, grid: false, pointColor: '#aAbB01', colorMode: 'height', palette: 'viridis', reverse: true};
  const clean = validatePreset(input, 'pointcloud');
  assert.deepEqual(clean, input); assert.notEqual(clean, input);
  clean.grid = true; assert.equal(input.grid, false);
  assert.deepEqual(validatePreset(undefined, 'lod'), {});
  assert.deepEqual(validatePreset({grid: true, palette: 'current', reverse: false}, 'lod'), {grid: true, palette: 'current', reverse: false});
  assert.deepEqual(validatePreset({wireColor: '#123456'}, 'wireframe'), {wireColor: '#123456'});
  assert.throws(() => validatePreset({pointSize: 2}, 'lod'), /unsupported/);
  assert.throws(() => validatePreset({wireColor: '#123456'}, 'pointcloud'), /unsupported/);
});

test('invalid preset types, unknown fields, non-finite numbers and unavailable settings fail', () => {
  for (const preset of [null, [], 'grid', {pointSize: NaN}, {pointSize: Infinity}, {pointSize: .5}, {pointSize: 33}, {pointSize: 1.25}, {pointSize: '2'}, {pointOpacity: 0}, {pointOpacity: 1.1}, {pointOpacity: .12}, {pointOpacity: NaN}, {grid: 1}, {reverse: 'true'}, {pointColor: '#abc'}, {wireColor: 'red'}, {colorMode: 'rgb'}, {colorMode: 'field:secret'}, {palette: 'constructor'}, {background: '#ffffff'}, {camera: {x: 1}}, {persist: true}]) {
    assert.throws(() => validatePreset(preset, 'wireframe'), Error, JSON.stringify(preset));
  }
  for (const pointSize of [1, 1.5, 32]) assert.equal(validatePreset({pointSize}, 'pointcloud').pointSize, pointSize);
  for (const pointOpacity of [.1, .15, .95, 1]) assert.equal(validatePreset({pointOpacity}, 'pointcloud').pointOpacity, pointOpacity);
});

test('prototype keys, inherited options, symbols and getters are rejected without executing getters', () => {
  for (const property of ['__proto__', 'constructor', 'prototype']) {
    const preset = JSON.parse(`{"${property}":{"polluted":true}}`);
    assert.throws(() => validatePreset(preset), /unsafe/);
    assert.throws(() => validateDescriptor({...descriptor(), ...preset}), /unsafe/);
    assert.throws(() => normalizeManifest({schemaVersion: 1, datasets: [{...entry(), ...preset}]}), /unsafe/);
  }
  assert.throws(() => validatePreset(Object.create({grid: false})), /plain/);
  assert.throws(() => validatePreset({[Symbol('grid')]: true}), /unsafe/);
  let executed = false;
  assert.throws(() => validatePreset({get grid() { executed = true; return true; }}), /unsafe/);
  assert.equal(executed, false);
  assert.equal({}.polluted, undefined);
  const nullPrototype = Object.assign(Object.create(null), {grid: false});
  assert.deepEqual(validatePreset(nullPrototype), {grid: false});
});

test('direct descriptors validate only implemented viewer and format combinations', () => {
  const clean = validateDescriptor(descriptor({name: 'Synthetic points', preset: {grid: false}, id: 'example', bytes: 3, sha256: sha256.toUpperCase()}));
  assert.equal(clean.schemaVersion, 1); assert.equal(clean.sha256, sha256); assert.equal(clean.id, 'example'); assert.equal(clean.bytes, 3);
  for (const format of ['xyz', 'txt', 'csv', 'pts', 'ply', 'pcd']) assert.equal(validateDescriptor(descriptor({format})).format, format);
  for (const viewer of ['lod', 'wireframe']) assert.equal(validateDescriptor(descriptor({viewer, format: 'obj'})).viewer, viewer);
  for (const extra of [{schemaVersion: 2}, {schemaVersion: '1'}, {viewer: 'gaussian', format: 'ply'}, {viewer: 'unknown'}, {viewer: 'constructor'}, {viewer: 'lod', format: 'ply'}, {viewer: 'wireframe', format: 'xyz'}, {format: 'obj'}, {format: 'las'}, {format: 'PLY'}, {format: 'zip'}, {bytes: -1}, {bytes: 1.5}, {sha256: 'abc'}, {name: ''}, {id: 'a\n'}, {headers: {Authorization: 'no'}}, {url: 'http://example.test/a'}]) {
    assert.throws(() => validateDescriptor(descriptor(extra)), Error, JSON.stringify(extra));
  }
});

test('manifest selection descriptors permit optional viewer, entry and a safe common preset', () => {
  const source = {schemaVersion: 1, manifest: 'https://files.example.test/index.json', entry: 'building/mesh', viewer: 'lod', preset: {grid: false}};
  assert.deepEqual(validateDescriptor(source), source);
  assert.deepEqual(validateDescriptor({schemaVersion: 1, manifest: source.manifest, preset: {grid: false}}).preset, {grid: false});
  assert.throws(() => validateDescriptor({schemaVersion: 1, manifest: source.manifest, preset: {pointSize: 2}}), /unsupported/);
  assert.deepEqual(validateDescriptor({schemaVersion: 1, manifest: source.manifest, viewer: 'pointcloud', preset: {pointSize: 2}}).preset, {pointSize: 2});
  assert.throws(() => validateDescriptor({...source, url}), /unsupported/);
  assert.throws(() => validateDescriptor({...source, format: 'obj'}), /unsupported/);
  assert.throws(() => validateDescriptor({...source, entry: ''}), /entry ID/);
  assert.throws(() => validateDescriptor({...source, preset: {pointSize: 2}}), /unsupported/);
});

test('strict manifests return independent sanitized entries and preserve integrity metadata', () => {
  const input = {schemaVersion: 1, datasets: [entry({bytes: FILE_MAX_BYTES + 1, sha256: sha256.toUpperCase(), preset: {grid: false}})]};
  const entries = normalizeManifest(input);
  assert.equal(entries.length, 1); assert.equal(entries[0].sha256, sha256); assert.equal(entries[0].bytes, FILE_MAX_BYTES + 1);
  assert.equal(entries[0].schemaVersion, undefined); assert.notEqual(entries[0], input.datasets[0]);
  entries[0].preset.grid = true; assert.equal(input.datasets[0].preset.grid, false);
  assert.deepEqual(normalizeManifest({schemaVersion: 1, datasets: []}), []);
});

test('strict manifests reject malformed schemas, duplicate IDs, bad metadata and excess entries', () => {
  for (const value of [null, [], {schemaVersion: 0, datasets: []}, {schemaVersion: 1, datasets: {}}, {schemaVersion: 1, datasets: [], extra: true}, {schemaVersion: 1, datasets: [entry(), entry()]}, {schemaVersion: 1, datasets: [entry({bytes: Number.MAX_SAFE_INTEGER + 1})]}, {schemaVersion: 1, datasets: [entry({sha256: 'a'.repeat(63)})]}, {schemaVersion: 1, datasets: [entry({url: 'https://127.0.0.1/a'})]}, {schemaVersion: 1, datasets: [entry({id: ''})]}, {schemaVersion: 1, datasets: [entry({unknown: true})]}, {schemaVersion: 1, datasets: Array(MANIFEST_MAX_ENTRIES + 1).fill(entry())}]) {
    assert.throws(() => normalizeManifest(value), Error);
  }
});

function driveFile(path, id) { return {path, bytes: 12, sha256, file_id: id, drive_url: `https://drive.google.com/file/d/${id}/view`}; }

test('Drive directory normalization uses individual file refs, never directory URLs or local paths', () => {
  const input = {schema_version: 1, dataset_name: 'Synthetic fixture', buildings: [{id: 'building-a', point_cloud: driveFile('building-a/points.xyz', 'synthetic-points'), mesh: driveFile('building-a/model.obj', 'synthetic-mesh')}, {id: 'building-b', point_cloud: {path: 'building-b/points.ply', file_id: 'synthetic-ply'}, mesh: null}]};
  const entries = normalizeManifest(input);
  assert.deepEqual(entries.map(({id, viewer, format}) => ({id, viewer, format})), [
    {id: 'building-a/point_cloud', viewer: 'pointcloud', format: 'xyz'},
    {id: 'building-a/mesh', viewer: 'lod', format: 'obj'},
    {id: 'building-b/point_cloud', viewer: 'pointcloud', format: 'ply'},
  ]);
  assert.equal(entries[0].url, 'https://drive.google.com/uc?export=download&id=synthetic-points');
  assert.equal(entries[0].name, 'points.xyz'); assert.equal(entries[0].bytes, 12); assert.equal(entries[0].sha256, sha256);
  assert.equal(entries[2].url, 'https://drive.google.com/uc?export=download&id=synthetic-ply');
  assert.equal(entries[0].file_id, undefined); assert.equal(entries[0].path, undefined);
});

test('Drive directory normalization rejects invalid paths, URLs, file IDs and duplicate building entries', () => {
  const directory = file => ({schema_version: 1, buildings: [{id: 'a', point_cloud: file}]});
  for (const file of [{path: 'points.xyz'}, {path: '../points.xyz', file_id: 'synthetic'}, {path: '/points.xyz', file_id: 'synthetic'}, {path: 'a\\points.xyz', file_id: 'synthetic'}, {path: 'a//points.xyz', file_id: 'synthetic'}, {path: 'points.laz', file_id: 'synthetic'}, {path: 'points.xyz', file_id: 'invalid/id'}, {path: 'points.xyz', drive_url: 'https://localhost/points.xyz'}]) assert.throws(() => normalizeManifest(directory(file)), Error);
  const building = {id: 'a', point_cloud: driveFile('a/points.xyz', 'synthetic')};
  assert.throws(() => normalizeManifest({schema_version: 1, buildings: [building, building]}), /Duplicate/);
  assert.throws(() => normalizeManifest({schema_version: 2, buildings: []}), /Unsupported/);
});

test('8000 directory file references normalize without fetching any resource', () => {
  const buildings = Array.from({length: 4000}, (_, i) => ({id: `synthetic-${i}`, point_cloud: driveFile(`${i}/points.xyz`, `synthetic-p-${i}`), mesh: driveFile(`${i}/model.obj`, `synthetic-m-${i}`)}));
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('must remain lazy'); };
  try { assert.equal(normalizeManifest({schema_version: 1, buildings}).length, 8000); assert.equal(calls, 0); }
  finally { globalThis.fetch = original; }
  assert.throws(() => normalizeManifest({schema_version: 1, buildings: [...buildings, ...buildings.slice(0, 1001)]}), /10000/);
});

test('bounded fetch forces credential/referrer/redirect policies and reports bytes', async () => {
  const data = byteResponse([new Uint8Array([1, 2]), new Uint8Array([3])], {headers: {'content-length': '3'}});
  const progress = [];
  let calledUrl, options;
  const bytes = await fetchBounded(url, {maxBytes: 3, onProgress: value => progress.push(value), fetchImpl: async (u, o) => { calledUrl = u; options = o; return data.response; }});
  assert.deepEqual(bytes, new Uint8Array([1, 2, 3])); assert.equal(calledUrl, url);
  assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.redirect, 'error'); assert.equal(options.mode, 'cors'); assert.equal(options.cache, 'no-store');
  assert.deepEqual(progress, [{loaded: 0, total: 3}, {loaded: 2, total: 3}, {loaded: 3, total: 3}]);
  assert.equal(data.state.cancelled, false); assert.equal(data.state.released, true);
  assert.equal(METADATA_MAX_BYTES, 5 * 1024 * 1024); assert.equal(FILE_MAX_BYTES, 64 * 1024 * 1024);
});

test('bounded fetch rejects oversize headers before reading and enforces the streamed byte cap', async () => {
  const declared = byteResponse([new Uint8Array([1])], {headers: {'content-length': '4'}});
  await assert.rejects(fetchBounded(url, {maxBytes: 3, fetchImpl: async () => declared.response}), /byte limit/);
  assert.equal(declared.state.reads, 0); assert.equal(declared.state.cancelled, true);
  for (const headers of [{}, {'content-length': '1'}, {'content-length': 'nonsense'}, {'content-length': '1', 'content-encoding': 'gzip'}]) {
    const data = byteResponse([new Uint8Array([1, 2]), new Uint8Array([3, 4])], {headers});
    await assert.rejects(fetchBounded(url, {maxBytes: 3, fetchImpl: async () => data.response}), /byte limit/);
    assert.equal(data.state.cancelled, true); assert.equal(data.state.released, true);
  }
});

test('unknown/compressed/lying lengths are not treated as a decoded-byte promise', async () => {
  for (const headers of [{}, {'content-length': 'bad'}, {'content-length': '9007199254740992'}, {'content-length': '1', 'content-encoding': 'gzip'}]) {
    const data = byteResponse([new Uint8Array([1, 2])], {headers});
    const progress = [];
    assert.equal((await fetchBounded(url, {maxBytes: 2, onProgress: p => progress.push(p), fetchImpl: async () => data.response})).byteLength, 2);
    assert.equal(progress.at(-1).total, null);
  }
  const progress = [], data = byteResponse([new Uint8Array([1, 2])], {headers: {'content-length': '1'}});
  await fetchBounded(url, {maxBytes: 2, onProgress: p => progress.push(p), fetchImpl: async () => data.response});
  assert.deepEqual(progress.at(-1), {loaded: 2, total: null});
});

test('fetch errors, non-OK HTTP, opaque responses and redirects fail without fallback downloads', async () => {
  await assert.rejects(fetchBounded(url, {fetchImpl: async () => { throw new TypeError('CORS or network failure'); }}), /CORS or network/);
  for (const options of [{status: 403}, {status: 404}, {status: 500}, {redirected: true}, {type: 'opaque'}, {type: 'opaqueredirect'}, {responseUrl: 'https://other.example.test/a.xyz'}, {responseUrl: 'https://127.0.0.1/a.xyz'}]) {
    const data = byteResponse([new Uint8Array([1])], options);
    await assert.rejects(fetchBounded(url, {fetchImpl: async () => data.response}), Error);
    assert.equal(data.state.reads, 0); assert.equal(data.state.cancelled, true);
  }
});

test('validation and pre-cancelled requests do not call fetch', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return byteResponse([]).response; };
  for (const maxBytes of [0, -1, 1.5, Infinity, FILE_MAX_BYTES + 1]) await assert.rejects(fetchBounded(url, {maxBytes, fetchImpl}), /byte limit/);
  await assert.rejects(fetchBounded('https://127.0.0.1/a.xyz', {fetchImpl}), /private/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchBounded(url, {signal: controller.signal, fetchImpl}), {name: 'AbortError'});
  assert.equal(called, false);
});

test('cancellation wins a pending fetch even if the fetch implementation ignores the signal', {timeout: 1000}, async () => {
  const controller = new AbortController();
  let resolveFetch;
  const pending = fetchBounded(url, {signal: controller.signal, fetchImpl: () => new Promise(resolve => { resolveFetch = resolve; })});
  controller.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  const late = byteResponse([new Uint8Array([99])]); resolveFetch(late.response); await tick();
  assert.equal(late.state.cancelled, true); assert.equal(late.state.reads, 0);
});

test('cancellation interrupts a pending stream read and releases its reader', {timeout: 1000}, async () => {
  const data = byteResponse([]), controller = new AbortController();
  data.reader.read = () => new Promise(() => {});
  const pending = fetchBounded(url, {signal: controller.signal, fetchImpl: async () => data.response});
  await tick(); controller.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  assert.equal(data.state.cancelled, true); assert.equal(data.state.released, true);
});

test('aborted older downloads cannot return stale bytes after a newer download completes', {timeout: 1000}, async () => {
  const controller = new AbortController(); let resolveOld;
  const old = fetchBounded(url, {signal: controller.signal, fetchImpl: () => new Promise(resolve => { resolveOld = resolve; })});
  controller.abort(); const oldRejected = assert.rejects(old, {name: 'AbortError'});
  const fresh = await fetchBounded(url, {fetchImpl: async () => byteResponse([new Uint8Array([7])]).response});
  resolveOld(byteResponse([new Uint8Array([1])]).response);
  await oldRejected; assert.deepEqual(fresh, new Uint8Array([7]));
});

test('cancellation from progress is checked before returning bytes', async () => {
  const controller = new AbortController(), data = byteResponse([new Uint8Array([1])]);
  await assert.rejects(fetchBounded(url, {signal: controller.signal, fetchImpl: async () => data.response, onProgress: ({loaded}) => { if (loaded) controller.abort(); }}), {name: 'AbortError'});
  assert.equal(data.state.cancelled, true);
});

test('stream failures, invalid chunk types and progress callback errors clean up without partial results', async () => {
  const failed = byteResponse([]); failed.reader.read = async () => { throw new Error('stream failed'); };
  await assert.rejects(fetchBounded(url, {fetchImpl: async () => failed.response}), /stream failed/);
  assert.equal(failed.state.cancelled, true); assert.equal(failed.state.released, true);
  const invalid = byteResponse(['not bytes']);
  await assert.rejects(fetchBounded(url, {fetchImpl: async () => invalid.response}), /invalid byte stream/);
  const callback = byteResponse([new Uint8Array([1])]);
  await assert.rejects(fetchBounded(url, {fetchImpl: async () => callback.response, onProgress: () => { throw new Error('callback failed'); }}), /callback failed/);
  assert.equal(callback.state.cancelled, true);
});

test('streamed chunks are copied before a producer reuses their underlying buffer', async () => {
  const chunk = new Uint8Array([1]), data = byteResponse([]); let reads = 0;
  data.reader.read = async () => {
    reads++;
    if (reads === 1) return {done: false, value: chunk};
    if (reads === 2) { chunk[0] = 2; return {done: false, value: chunk}; }
    return {done: true};
  };
  assert.deepEqual(await fetchBounded(url, {fetchImpl: async () => data.response}), new Uint8Array([1, 2]));
});

test('missing streaming support never falls back to an unbounded arrayBuffer', async () => {
  let buffered = false;
  await assert.rejects(fetchBounded(url, {fetchImpl: async () => ({ok: true, status: 200, headers: new Headers(), async arrayBuffer() { buffered = true; return new ArrayBuffer(1); }})}), /readable byte stream/);
  assert.equal(buffered, false);
  assert.deepEqual(await fetchBounded(url, {fetchImpl: async () => ({ok: true, status: 204, headers: new Headers(), body: null})}), new Uint8Array());
});

const publicIndex=()=>({schema_version:1,public_base_url:'https://data.example/bundle/',path_base:'directory_containing_index',buildings:[{id:'2',point_cloud:{path:'2/pc.xyz',bytes:6,sha256},mesh:{path:'2/final.obj',bytes:12,sha256}}]});
const publicContext={manifestUrl:'https://data.example/bundle/index.json'};
test('public relative building index resolves both viewers under exact source directory with integrity',()=>{const entries=normalizeManifest(publicIndex(),publicContext);assert.equal(entries.length,2);assert.deepEqual(entries.map(e=>[e.id,e.viewer,e.url,e.bytes,e.sha256]),[['2/point_cloud','pointcloud','https://data.example/bundle/2/pc.xyz',6,sha256],['2/mesh','lod','https://data.example/bundle/2/final.obj',12,sha256]]);});
test('public index requires source context, expected path_base and matching base directory/origin',()=>{assert.throws(()=>normalizeManifest(publicIndex()),/source manifest/);for(const base of ['https://other.example/bundle/','https://data.example/','https://data.example/bundle/other/','https://data.example/bundle','https://data.example/bundle/?token=secret','https://data.example/a/../bundle/','https://data.example/%62undle/']){const value=publicIndex();value.public_base_url=base;assert.throws(()=>normalizeManifest(value,publicContext));}const value=publicIndex();value.path_base='other';assert.throws(()=>normalizeManifest(value,publicContext));});
test('public index rejects every ambiguous relative path and mixed Drive source before use',()=>{for(const path of ['../pc.xyz','/pc.xyz','a//pc.xyz','./pc.xyz','a/../pc.xyz','a\\pc.xyz','%2e%2e/pc.xyz','a%2fpc.xyz','pc.xyz?x=1','pc.xyz#x','https://other.example/pc.xyz','a:pc.xyz','a/%252e/pc.xyz']){const value=publicIndex();value.buildings[0].point_cloud.path=path;assert.throws(()=>normalizeManifest(value,publicContext),path);}for(const extra of [{file_id:'fake'},{drive_url:'https://data.example/pc.xyz'}]){const value=publicIndex();Object.assign(value.buildings[0].point_cloud,extra);assert.throws(()=>normalizeManifest(value,publicContext));}});
test('public index requires checksums and safely encodes Unicode/spaces without mutating source',()=>{for(const key of ['bytes','sha256']){const value=publicIndex();delete value.buildings[0].point_cloud[key];assert.throws(()=>normalizeManifest(value,publicContext),/require bytes/);}const value=publicIndex();value.buildings[0].point_cloud.path='2/点 云.xyz';const copy=JSON.stringify(value);assert.equal(normalizeManifest(value,publicContext)[0].url,'https://data.example/bundle/2/%E7%82%B9%20%E4%BA%91.xyz');assert.equal(JSON.stringify(value),copy);});
