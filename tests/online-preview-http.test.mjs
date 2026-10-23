import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fetchBounded, normalizeManifest, normalizePublicUrl, METADATA_MAX_BYTES} from '../src/shared/online-preview-core.js';
import {readPointCloud, parseWireOBJ} from '../src/cloud/point-io.js';
import {parseOBJ} from '../src/lod/obj-parser.js';
import {startPreviewResourceServer, createFixtureFetch, createPreviewFixtures} from './helpers/preview-resource-server.mjs';

const decoder = new TextDecoder();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = server => server.requests.map(row => row.path);
async function fixture(t) {
  const server = await startPreviewResourceServer();
  t.after(() => server.close());
  return server;
}
async function readManifest(server, path = '/manifest.json') {
  const bytes = await fetchBounded(server.logicalOrigin + path, {maxBytes: METADATA_MAX_BYTES, fetchImpl: server.fetchImpl});
  return normalizeManifest(JSON.parse(decoder.decode(bytes)));
}
// Consumer-side assertion deliberately mirrors the browser's pre-parser checks.
// normalizeManifest validates metadata syntax; fetchBounded does not verify SHA.
async function verifiedParse(server, entry, parse) {
  const bytes = await fetchBounded(entry.url, {fetchImpl: server.fetchImpl});
  if (entry.bytes !== undefined && bytes.length !== entry.bytes) throw new Error('Downloaded file size does not match index');
  if (entry.sha256 && digest(bytes) !== entry.sha256) throw new Error('Downloaded file checksum does not match index');
  return parse(bytes);
}

test('synthetic HTTP manifest is deterministic and initially downloads only metadata', async t => {
  const server = await fixture(t);
  assert.deepEqual(createPreviewFixtures().manifest, createPreviewFixtures().manifest);
  const entries = await readManifest(server);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(row => row.id), ['points', 'triangle']);
  assert.deepEqual(paths(server), ['/manifest.json']);
  assert.equal(server.requests[0].origin, server.allowedOrigin);
  assert.notEqual(server.logicalOrigin, server.allowedOrigin);
  assert.match(server.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.throws(() => normalizePublicUrl(server.origin + '/manifest.json'), /HTTPS/);
});

test('selected HTTP XYZ is integrity-checked and read by the existing point parser only', async t => {
  const server = await fixture(t), [entry] = await readManifest(server);
  const cloud = await verifiedParse(server, entry, bytes => readPointCloud(new File([bytes], entry.name), {}));
  assert.equal(cloud.count, 4);
  assert.deepEqual(Array.from(cloud.positions), [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.deepEqual(cloud.bounds, [[0, 0, 0], [1, 1, 1]]);
  assert.deepEqual(paths(server), ['/manifest.json', '/fixtures/points.xyz']);
});

test('selected HTTP triangular OBJ reaches real mesh and wire parsers without side fetches', async t => {
  const server = await fixture(t), entries = await readManifest(server);
  const entry = entries.find(row => row.id === 'triangle');
  const result = await verifiedParse(server, entry, bytes => ({
    mesh: parseOBJ(decoder.decode(bytes), entry.id, bytes.length),
    wire: parseWireOBJ(decoder.decode(bytes), entry.id),
  }));
  assert.equal(result.mesh.stats.vertices, 3);
  assert.equal(result.mesh.stats.triangles, 1);
  assert.equal(result.wire.edges.length, 3);
  assert.deepEqual(paths(server), ['/manifest.json', '/fixtures/triangle.obj']);
  assert.ok(!paths(server).some(path => path.endsWith('.mtl')));
});

test('HTTP CORS headers are explicit contract evidence, not a claim of browser enforcement', async t => {
  const server = await fixture(t), observations = [];
  const fetchImpl = createFixtureFetch(server.origin, {onResponse: value => observations.push(value)});
  await fetchBounded(server.logicalOrigin + '/manifest.json', {fetchImpl});
  const {response, options, logicalUrl, transportUrl} = observations[0];
  assert.equal(response.url, logicalUrl);
  assert.equal(transportUrl, server.origin + '/manifest.json');
  assert.equal(response.type, 'basic'); // Preserve Node's real type; never label this 'cors'.
  assert.equal(response.headers.get('access-control-allow-origin'), server.allowedOrigin);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.match(response.headers.get('access-control-expose-headers'), /Content-Length/);
  assert.equal(response.headers.get('vary'), 'Origin');
  assert.deepEqual({credentials: options.credentials, referrerPolicy: options.referrerPolicy, redirect: options.redirect, mode: options.mode, cache: options.cache},
    {credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', mode: 'cors', cache: 'no-store'});
  const preflight = await fetch(server.origin + '/manifest.json', {method: 'OPTIONS', headers: {Origin: server.allowedOrigin, 'Access-Control-Request-Method': 'GET'}});
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), server.allowedOrigin);
  assert.match(preflight.headers.get('access-control-allow-methods'), /GET/);
  // This deliberately succeeds in Node without ACAO, illustrating the test boundary.
  const noCors = await fetchBounded(server.logicalOrigin + '/errors/no-cors.xyz', {fetchImpl});
  assert.equal(noCors.length, server.fixtures.points.length);
  assert.equal(observations.at(-1).response.headers.get('access-control-allow-origin'), null);
});

test('fixture adapter refuses other destinations and preserves production response identity checks', async t => {
  const server = await fixture(t);
  await assert.rejects(server.fetchImpl('https://unrelated.example/file.xyz'), /fixed synthetic HTTPS origin/);
  await assert.rejects(server.fetchImpl(server.logicalOrigin + '//unrelated.example/file.xyz'), /stay on loopback/);
  assert.equal(server.requests.length, 0);
  await assert.rejects(fetchBounded(server.logicalOrigin + '/fixtures/points.xyz', {
    fetchImpl: async (url, options) => ({...await server.fetchImpl(url, options), url: server.logicalOrigin + '/different.xyz'}),
  }), /redirects or opaque/);
  assert.deepEqual(paths(server), ['/fixtures/points.xyz']);
});

test('fixture adapter captures transport fetch before a runtime installs it globally', async t => {
  const server = await fixture(t), nativeFetch = globalThis.fetch;
  try {
    globalThis.fetch = server.fetchImpl;
    const bytes = await fetchBounded(server.logicalOrigin + '/fixtures/points.xyz');
    assert.equal(bytes.length, server.fixtures.points.length);
    assert.deepEqual(paths(server), ['/fixtures/points.xyz']);
  } finally {
    globalThis.fetch = nativeFetch;
  }
});

test('HTTP missing resource fails and an explicit retry recovers from transient 503', async t => {
  const server = await fixture(t);
  await assert.rejects(fetchBounded(server.logicalOrigin + '/errors/not-found.xyz', {fetchImpl: server.fetchImpl}), /HTTP 404/);
  const url = server.logicalOrigin + '/errors/retry.xyz';
  await assert.rejects(fetchBounded(url, {fetchImpl: server.fetchImpl}), /HTTP 503/);
  const recovered = await fetchBounded(url, {fetchImpl: server.fetchImpl});
  assert.equal(decoder.decode(recovered), server.fixtures.points.toString());
  assert.deepEqual(paths(server), ['/errors/not-found.xyz', '/errors/retry.xyz', '/errors/retry.xyz']);
});

test('HTTP integrity mismatch stops the test consumer before any real parser runs', async t => {
  const server = await fixture(t), [entry] = await readManifest(server, '/integrity-manifest.json');
  assert.equal(server.fixtures.corruptedPoints.length, entry.bytes);
  assert.notEqual(digest(server.fixtures.corruptedPoints), entry.sha256);
  let parses = 0;
  await assert.rejects(verifiedParse(server, entry, bytes => { parses++; return readPointCloud(new File([bytes], 'bad.xyz'), {}); }), /checksum does not match/);
  assert.equal(parses, 0);
  assert.deepEqual(paths(server), ['/integrity-manifest.json', '/errors/integrity-mismatch.xyz']);
});

test('HTTP declared and chunked bodies enforce the same byte cap and stop excess transport', async t => {
  const server = await fixture(t);
  await assert.rejects(fetchBounded(server.logicalOrigin + '/errors/declared-limit.xyz', {fetchImpl: server.fetchImpl, maxBytes: 12}), /12 byte limit/);
  const progress = [];
  await assert.rejects(fetchBounded(server.logicalOrigin + '/errors/chunked-limit.xyz', {fetchImpl: server.fetchImpl, maxBytes: 12, onProgress: row => progress.push(row)}), /12 byte limit/);
  const stopped = await server.waitForRequest(row => row.path === '/errors/chunked-limit.xyz' && row.closed);
  assert.equal(stopped.transportCancelled, true);
  assert.equal(stopped.finished, false);
  assert.ok(stopped.chunksWritten < 64);
  assert.ok(progress.every(row => row.loaded <= 12 && row.total === null));
});

test('HTTP cancel closes the real streaming transport and a fresh retry stays usable', async t => {
  const server = await fixture(t), controller = new AbortController();
  await assert.rejects(fetchBounded(server.logicalOrigin + '/cancel/points.xyz', {
    fetchImpl: server.fetchImpl, signal: controller.signal,
    onProgress: ({loaded}) => { if (loaded) controller.abort(); },
  }), {name: 'AbortError'});
  const stopped = await server.waitForRequest(row => row.path === '/cancel/points.xyz' && row.closed);
  assert.equal(stopped.transportCancelled, true);
  assert.equal(stopped.finished, false);
  assert.ok(stopped.chunksWritten < 64);
  const fresh = await fetchBounded(server.logicalOrigin + '/fixtures/points.xyz', {fetchImpl: server.fetchImpl});
  assert.equal(fresh.length, server.fixtures.points.length);
});

test('HTTP delayed headers and stalled body remain cancellable without parser invocation', async t => {
  const server = await fixture(t);
  for (const path of ['/errors/delayed-headers.xyz', '/errors/stalled-body.xyz']) {
    const controller = new AbortController();
    const pending = fetchBounded(server.logicalOrigin + path, {fetchImpl: server.fetchImpl, signal: controller.signal});
    // Attach rejection handling before aborting, even if the transport finishes fast.
    const rejected = assert.rejects(pending, {name: 'AbortError'});
    await server.waitForRequest(row => row.path === path && (path.includes('headers') || row.chunksWritten > 0));
    controller.abort();
    await rejected;
    const stopped = await server.waitForRequest(row => row.path === path && row.closed);
    assert.equal(stopped.transportCancelled, true);
    assert.equal(stopped.finished, false);
  }
});

test('HTTP redirect to a prohibited loopback target is not followed', async t => {
  const server = await fixture(t);
  await assert.rejects(fetchBounded(server.logicalOrigin + '/errors/redirect.xyz', {fetchImpl: server.fetchImpl}), /fetch failed/);
  assert.deepEqual(paths(server), ['/errors/redirect.xyz']);
  assert.equal(server.requests.filter(row => row.path === '/private-target').length, 0);
});

test('HTTP slow stream reports bounded progress and server cleanup closes all unfinished work', async t => {
  const server = await fixture(t), progress = [];
  const bytes = await fetchBounded(server.logicalOrigin + '/slow/points.xyz', {fetchImpl: server.fetchImpl, onProgress: row => progress.push(row)});
  assert.equal(bytes.length, 24);
  assert.ok(progress.length >= 3);
  assert.equal(progress.at(-1).loaded, 24);
  assert.ok(progress.every(row => row.total === null));
  const response = await server.fetchImpl(server.logicalOrigin + '/errors/stalled-body.xyz', {redirect:'error'});
  const reader = response.body.getReader();
  assert.equal((await reader.read()).done, false);
  const pending = reader.read();
  const rejected = assert.rejects(pending);
  await server.close();
  await rejected;
  reader.releaseLock();
  await server.close(); // Closing twice is safe, including the test's after hook.
  assert.ok(server.requests.every(row => row.closed));
});

test('fixture adapter does not silently repair a production redirect policy regression', async t => {const server=await fixture(t);await assert.rejects(server.fetchImpl(server.logicalOrigin+'/errors/redirect.xyz',{redirect:'follow'}),/requires production redirect:error/);assert.equal(server.requests.length,0);});
