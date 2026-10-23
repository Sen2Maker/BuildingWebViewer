import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createServer} from 'node:http';

// Synthetic test data only. These reserved names are never resolved on the network.
export const FIXTURE_LOGICAL_ORIGIN = 'https://fixtures.example';
export const FIXTURE_VIEWER_ORIGIN = 'https://viewer.example';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function createPreviewFixtures() {
  const points = Buffer.from('0 0 0\n1 0 0\n0 1 0\n0 0 1\n');
  const triangle = Buffer.from('# Synthetic triangular mesh\nmtllib synthetic.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  const entry = (id, path, viewer, format, bytes) => ({
    id, name: path.split('/').at(-1), url: FIXTURE_LOGICAL_ORIGIN + path,
    viewer, format, bytes: bytes.length, sha256: digest(bytes),
  });
  const pointsEntry = entry('points', '/fixtures/points.xyz', 'pointcloud', 'xyz', points);
  const triangleEntry = entry('triangle', '/fixtures/triangle.obj', 'lod', 'obj', triangle);
  const chunkParts=[points.subarray(0,12),points.subarray(12)];
  const {url:ignored,...chunkBase}=pointsEntry;
  const chunkEntry={...chunkBase,id:'chunked-points',chunks:chunkParts.map((part,index)=>({url:FIXTURE_LOGICAL_ORIGIN+`/fixtures/chunks/part-${index+1}.xyz`,bytes:part.length,sha256:digest(part)}))};
  return {
    points, triangle,chunkParts,
    chunkManifest:{schemaVersion:2,datasets:[chunkEntry,triangleEntry]},
    chunkTamperManifest:{schemaVersion:2,datasets:[{...chunkEntry,chunks:chunkEntry.chunks.map((part,index)=>index===0?{...part,url:FIXTURE_LOGICAL_ORIGIN+'/errors/chunk-tamper.xyz'}:part)}]},
    chunkSlowManifest:{schemaVersion:2,datasets:[{...chunkEntry,chunks:chunkEntry.chunks.map((part,index)=>index===1?{...part,url:FIXTURE_LOGICAL_ORIGIN+'/slow/chunk-last.xyz'}:part)}]},
    // The changed coordinate preserves byte count, isolating the checksum failure.
    corruptedPoints: Buffer.from(points.toString().replace('1 0 0', '9 0 0')),
    manifest: {schemaVersion: 1, datasets: [pointsEntry, triangleEntry]},
    integrityManifest: {schemaVersion: 1, datasets: [{...pointsEntry, id: 'integrity-mismatch', url: `${FIXTURE_LOGICAL_ORIGIN}/errors/integrity-mismatch.xyz`}]},
  };
}

/** Map exactly one reserved HTTPS origin to this loopback server, only in tests.
 * Production validation still receives the logical HTTPS URL. The response URL
 * is its logical identity; actual redirect flags and response type stay intact.
 * Node fetch does NOT enforce browser CORS. Origin and response-header checks
 * here are transport/contract evidence, never proof of browser CORS behavior.
 */
export function createFixtureFetch(origin, {onResponse, transportFetch = globalThis.fetch} = {}) {
  const local = new URL(origin);
  if (local.protocol !== 'http:' || local.hostname !== '127.0.0.1' || local.pathname !== '/' || local.search || local.hash || local.username || local.password) {
    throw new Error('Fixture transport must be an explicit loopback HTTP origin');
  }
  if (typeof transportFetch !== 'function') throw new Error('Fixture transport requires a fetch function');
  return async (input, options = {}) => {
    const logical = new URL(input);
    if (logical.origin !== FIXTURE_LOGICAL_ORIGIN || logical.username || logical.password || logical.hash) {
      throw new Error('Fixture adapter accepts only the fixed synthetic HTTPS origin');
    }
    const transport = new URL(logical.pathname + logical.search, local);
    // A path beginning with // must never turn the local URL into an external URL.
    if (transport.origin !== local.origin) throw new Error('Fixture path must stay on loopback');
    if (options.redirect !== 'error') throw new Error('Fixture adapter requires production redirect:error; it must not hide a caller regression');
    const headers = new Headers(options.headers);
    headers.set('Origin', FIXTURE_VIEWER_ORIGIN);
    // Capture native fetch at adapter creation so installing the adapter on
    // globalThis.fetch for a production-runtime test cannot recurse into itself.
    const response = await transportFetch(transport, {...options, headers});
    if (response.url !== transport.href) {
      await response.body?.cancel();
      throw new Error('Unexpected fixture transport response URL');
    }
    const logicalResponse = {
      ok: response.ok, status: response.status, statusText: response.statusText,
      headers: response.headers, body: response.body,
      redirected: response.redirected, type: response.type, url: logical.href,
    };
    onResponse?.({logicalUrl: logical.href, transportUrl: transport.href, options, response: logicalResponse});
    return logicalResponse;
  };
}

/** Small dependency-free resource center. No filesystem reads or external access.
 * Every listener is loopback-only; default port 0 asks the OS for an ephemeral port.
 * close() clears streams/timers and destroys sockets, including unfinished fetches.
 */
export async function startPreviewResourceServer({port = 0} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Fixture port must be an integer from 0 to 65535');
  const fixtures = createPreviewFixtures(), requests = [], sockets = new Set(), timers = new Set();
  const changes = new EventEmitter();
  let origin, closed = false, closePromise;
  const changed = () => changes.emit('change');
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    const record = {
      method: request.method, path, origin: request.headers.origin ?? null,
      status: null, bytesWritten: 0, chunksWritten: 0,
      finished: false, closed: false, transportCancelled: false,
    };
    requests.push(record);
    const requestTimers = new Set();
    const clearTimers = () => {
      for (const timer of requestTimers) { clearTimeout(timer); timers.delete(timer); }
      requestTimers.clear();
    };
    const later = (callback, delay) => {
      const timer = setTimeout(() => {
        timers.delete(timer); requestTimers.delete(timer);
        if (!response.destroyed) callback();
      }, delay);
      timers.add(timer); requestTimers.add(timer);
    };
    response.on('finish', () => { record.finished = true; changed(); });
    response.on('close', () => {
      clearTimers(); record.closed = true;
      record.transportCancelled = !response.writableFinished;
      changed();
    });
    const headers = (status, contentType = 'text/plain; charset=utf-8', extra = {}) => {
      record.status = status;
      response.writeHead(status, {
        'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        ...(path === '/errors/no-cors.xyz' ? {} : {
          'Access-Control-Allow-Origin': FIXTURE_VIEWER_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Type',
          Vary: 'Origin',
        }), ...extra,
      });
      changed();
    };
    const send = (status, bytes, contentType, extra) => {
      const body = Buffer.from(bytes);
      headers(status, contentType, {'Content-Length': body.length, ...extra});
      if (request.method === 'HEAD') response.end();
      else { record.bytesWritten += body.length; record.chunksWritten++; response.end(body); }
    };
    const stream = ({count = 64, delay = 25, stall = false} = {}) => {
      headers(200); response.flushHeaders();
      if (request.method === 'HEAD') { response.end(); return; }
      const chunk = Buffer.from('0 0 0\n');
      const write = () => {
        if (response.destroyed) return;
        record.bytesWritten += chunk.length; record.chunksWritten++;
        response.write(chunk); changed();
        if (stall) return;
        if (record.chunksWritten === count) response.end();
        else later(write, delay);
      };
      write();
    };
    changed();
    if (request.method === 'OPTIONS') { headers(204); response.end(); return; }
    if (!['GET', 'HEAD'].includes(request.method)) { send(405, 'Read-only synthetic fixture server\n', undefined, {Allow: 'GET, HEAD, OPTIONS'}); return; }
    if (path === '/manifest.json') send(200, JSON.stringify(fixtures.manifest), 'application/json; charset=utf-8');
    else if (path === '/chunk-manifest.json') send(200,JSON.stringify(fixtures.chunkManifest),'application/json');
    else if (path === '/chunk-tamper-manifest.json') send(200,JSON.stringify(fixtures.chunkTamperManifest),'application/json');
    else if (path === '/chunk-slow-manifest.json') send(200,JSON.stringify(fixtures.chunkSlowManifest),'application/json');
    else if (path === '/fixtures/chunks/part-1.xyz') send(200,fixtures.chunkParts[0]);
    else if (path === '/fixtures/chunks/part-2.xyz') send(200,fixtures.chunkParts[1]);
    else if (path === '/errors/chunk-tamper.xyz') send(200,Buffer.from(fixtures.chunkParts[0].toString().replace('1 0 0','9 0 0')));
    else if (path === '/slow/chunk-last.xyz') later(()=>send(200,fixtures.chunkParts[1]),100);
    else if (path === '/integrity-manifest.json') send(200, JSON.stringify(fixtures.integrityManifest), 'application/json; charset=utf-8');
    else if (path === '/fixtures/points.xyz' || path === '/errors/no-cors.xyz') send(200, fixtures.points);
    else if (path === '/fixtures/triangle.obj') send(200, fixtures.triangle);
    else if (path === '/errors/integrity-mismatch.xyz') send(200, fixtures.corruptedPoints);
    else if (path === '/errors/retry.xyz') {
      if (requests.filter(row => row.path === path && row.method === 'GET').length === 1) send(503, 'Synthetic temporary failure\n');
      else send(200, fixtures.points);
    }
    else if (path === '/errors/declared-limit.xyz') send(200, Buffer.alloc(4096, 32));
    else if (path === '/errors/chunked-limit.xyz' || path === '/cancel/points.xyz') stream();
    else if (path === '/slow/points.xyz') stream({count: 4});
    else if (path === '/errors/stalled-body.xyz') stream({stall: true});
    else if (path === '/errors/delayed-headers.xyz') later(() => send(200, fixtures.points), 1000);
    else if (path === '/errors/redirect.xyz') send(302, 'Synthetic prohibited redirect\n', undefined, {Location: `${origin}/private-target`});
    else if (path === '/private-target') send(200, 'This target must never be reached by preview downloads\n');
    else send(404, 'Synthetic resource not found\n');
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin, logicalOrigin: FIXTURE_LOGICAL_ORIGIN, allowedOrigin: FIXTURE_VIEWER_ORIGIN,
    fixtures, requests, fetchImpl: createFixtureFetch(origin),
    waitForRequest(predicate, {timeoutMs = 2000} = {}) {
      const existing = requests.find(predicate);
      if (existing) return Promise.resolve(existing);
      if (closed) return Promise.reject(new Error('Fixture server is closed'));
      return new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timeout); changes.off('change', check); };
        const check = () => {
          const found = requests.find(predicate);
          if (found) { cleanup(); resolve(found); }
          else if (closed) { cleanup(); reject(new Error('Fixture server closed before matching request')); }
        };
        const timeout = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for synthetic request state')); }, timeoutMs);
        changes.on('change', check);
        check();
      });
    },
    close() {
      if (closePromise) return closePromise;
      closed = true; changed();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      closePromise = new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        for (const socket of sockets) socket.destroy();
      });
      return closePromise;
    },
  };
}
