import { METADATA_MAX_BYTES, normalizeManifest, normalizePublicUrl } from '../shared/online-preview-core.js';
import { fetchPreviewSource } from '../shared/online-preview-source.js';
import { fetchPreviewDataset } from '../shared/online-preview-data.js';
import { parseOBJ } from '../lod/obj-parser.js';
import { readPointCloud } from '../cloud/point-io.js';

export const COMPARISON_CACHE_BYTES = 32 * 1024 * 1024;
export const COMPARISON_DEFAULT_MAX_POINTS = 250000;
export const COMPARISON_MAX_POINTS = 1000000;
const MAX_CACHE_PAIRS = 3;
const abortError = () => new DOMException('Comparison selection cancelled', 'AbortError');
const checkAbort = signal => { if (signal?.aborted) throw abortError(); };
const fileName = entry => `${entry.id}.${entry.format}`;
const descriptor = entry => ({schemaVersion: entry.chunks ? 2 : 1, ...entry});

/** Preserve first appearance in the original index. A missing side is an error
 * in that pane, never an excuse to combine two unrelated building IDs. */
export function normalizeComparisonCatalog(value, options) {
  const pairs = new Map();
  for (const entry of normalizeManifest(value, options)) {
    const match = /^(.+)\/(mesh|point_cloud)$/.exec(entry.id);
    if (!match) continue;
    const [, id, role] = match;
    if (role === 'mesh' && (entry.viewer !== 'lod' || entry.format !== 'obj') || role === 'point_cloud' && entry.viewer !== 'pointcloud') {
      throw Error(`Comparison dataset has the wrong viewer for its role: ${entry.id}`);
    }
    if (!pairs.has(id)) pairs.set(id, {id, mesh: null, cloud: null});
    pairs.get(id)[role === 'mesh' ? 'mesh' : 'cloud'] = entry;
  }
  if (!pairs.size) throw Error('The index contains no building/mesh or building/point_cloud datasets. / 索引没有可对比的建筑数据。');
  return [...pairs.values()];
}

function makeWorker() {
  return typeof globalThis.Worker === 'function' ? new Worker(new URL('./point-worker.js', import.meta.url), {type: 'module'}) : null;
}

/** A session owns one current selection, at most one speculative download, and
 * at most three raw-byte cache records. Parsing never starts on speculative data.
 * The 32 MiB budget bounds retained cache + speculative reservations, NOT the
 * current foreground file (transport retains its existing 8/64 MiB caps).
 * Sampling limits displayed points, not the network transfer or hash checking.
 * No localStorage, persistent cache, credentials, or provider API key is used.
 * Injected transports/parsers are for deterministic tests; production defaults
 * always use the existing credential-free bounded transport and exact digests.
 */
export function createComparisonSession({
  manifest, initialId, preset, maxPoints = COMPARISON_DEFAULT_MAX_POINTS,
  onCatalog = () => {}, onMesh = () => {}, onCloud = () => {},
  onState = () => {}, onError = () => {},
  fetchImpl, fetchSource, fetchDataset = fetchPreviewDataset,
  parseMesh = parseOBJ, parseCloud = readPointCloud, workerFactory = makeWorker,
  cacheBudgetBytes = COMPARISON_CACHE_BYTES, prefetch = true, host = globalThis, parseTimeoutMs = 60000,
} = {}) {
  if (!Number.isSafeInteger(maxPoints) || maxPoints < 1 || maxPoints > COMPARISON_MAX_POINTS) throw Error('Comparison maxPoints must be between 1 and 1000000');
  if (!Number.isInteger(parseTimeoutMs) || parseTimeoutMs < 1 || parseTimeoutMs > 120000) throw Error('Comparison parse timeout must be between 1 and 120000 ms');
  if (!Number.isSafeInteger(cacheBudgetBytes) || cacheBudgetBytes < 0 || cacheBudgetBytes > COMPARISON_CACHE_BYTES) throw Error('Comparison cache budget must be between 0 and 32 MiB');
  const transport = fetchImpl || globalThis.fetch;
  const source = fetchSource || ((url, options) => fetchPreviewSource(url, {...options, fetchImpl: transport}));
  const speculativeSource = fetchSource || ((url, options) => fetchPreviewSource(url, {...options,
    fetchImpl: (value, init) => transport(value, {...init, priority: 'low'}),
  }));
  const cache = new Map();
  let cacheBytes = 0, generation = 0, disposed = false, catalog = null, catalogPromise = null;
  let catalogController = null, catalogNotified = false, foreground = null, background = null;
  let attempts = new Set(), activeWorker = null;
  let state = {id: null, index: -1, total: 0, mesh: 'idle', cloud: 'idle', phase: 'idle', parseMode: null};
  const current = token => !disposed && token === generation;
  const snapshot = () => ({...state, cacheBytes, reservedBytes: background?.reserved || 0, cachePairs: [...cache.keys()]});
  const emit = () => { if (!disposed) onState(snapshot()); };
  function update(token, patch) {
    if (!current(token)) return false;
    state = {...state, ...patch}; emit();
    return current(token);
  }
  function available() {
    if (host.Capacitor?.isNativePlatform?.()) throw Error('Online comparison is available in the web app only. / 在线对比仅供网页版使用。');
    if (host.navigator?.onLine === false) throw Error('You are offline. Reconnect and retry this building. / 当前离线，请联网后重试。');
  }
  function report(token, pane, error) {
    if (!current(token) || error?.name === 'AbortError') return;
    onError({id: state.id, pane, error});
  }
  function removeCached(id) {
    const item = cache.get(id);
    if (!item) return;
    cacheBytes -= item.bytes; cache.delete(id);
  }
  function touch(id) {
    const item = cache.get(id);
    if (item) { cache.delete(id); cache.set(id, item); }
    return item;
  }
  function cacheRaw(id, pane, bytes, speculative = false) {
    const old = cache.get(id), previous = old?.[pane]?.byteLength || 0;
    const extra = bytes.byteLength - previous, reserved = background?.reserved || 0;
    if (bytes.byteLength > cacheBudgetBytes || (old?.bytes || 0) + extra > cacheBudgetBytes - reserved) return false;
    if (speculative && cacheBytes + extra + reserved > cacheBudgetBytes) return false;
    for (const other of [...cache.keys()]) {
      if (cacheBytes + extra + reserved <= cacheBudgetBytes && (old || cache.size < MAX_CACHE_PAIRS)) break;
      if (other !== id && other !== state.id) removeCached(other);
    }
    if (cacheBytes + extra + reserved > cacheBudgetBytes || !old && cache.size >= MAX_CACHE_PAIRS) return false;
    const item = old || {bytes: 0, mesh: null, cloud: null};
    item[pane] = bytes; item.bytes += extra; cacheBytes += extra;
    cache.delete(id); cache.set(id, item);
    return true;
  }
  function neighbors() {
    if (!catalog || state.index < 0) return [];
    return [catalog[state.index + 1], catalog[state.index - 1]].filter(Boolean);
  }
  function pruneCache() {
    const retain = new Set([state.id, ...neighbors().map(pair => pair.id)]);
    for (const id of cache.keys()) if (!retain.has(id)) removeCached(id);
  }
  function cancelSelection() {
    foreground?.controller.abort();
    activeWorker?.cancel();
    background?.controller.abort();
  }
  async function loadCatalog() {
    if (catalog) return catalog;
    if (!catalogPromise) {
      catalogController = new AbortController();
      catalogPromise = (async () => {
        const manifestUrl = normalizePublicUrl(manifest);
        const bytes = await source(manifestUrl, {signal: catalogController.signal, maxBytes: METADATA_MAX_BYTES, timeoutMs: 30000});
        checkAbort(catalogController.signal);
        // Preserve the 5 MiB contract even for a caller-supplied source.
        if (!(bytes instanceof Uint8Array) || bytes.byteLength > METADATA_MAX_BYTES) throw Error('Comparison index exceeds the 5 MiB metadata limit or returned invalid bytes');
        let value;
        try { value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
        catch { throw Error('Comparison index is not valid UTF-8 JSON. / 对比索引不是有效的 UTF-8 JSON。'); }
        catalog = normalizeComparisonCatalog(value, {manifestUrl});
        return catalog;
      })().finally(() => { catalogPromise = null; });
    }
    return catalogPromise;
  }
  async function parsePoints(bytes, entry, operation) {
    const {controller, token} = operation, signal = controller.signal;
    checkAbort(signal);
    let worker = null;
    try { worker = workerFactory?.(); } catch { /* Unsupported/CSP-blocked workers use the honest async fallback. */ }
    if (!worker) {
      update(token, {parseMode: 'main-thread'});
      checkAbort(signal);
      // Existing readPointCloud yields between bounded input chunks and checks signal.
      const cloud = await parseCloud(new File([bytes], fileName(entry)), {maxPoints, signal});
      checkAbort(signal);
      return {cloud, parseMode: 'main-thread'};
    }
    update(token, {parseMode: 'worker'});
    return new Promise((resolve, reject) => {
      let settled = false, timer;
      const finish = (error, cloud) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        worker.onmessage = worker.onerror = worker.onmessageerror = null;
        worker.terminate();
        if (activeWorker?.worker === worker) activeWorker = null;
        if (error) reject(error); else resolve({cloud, parseMode: 'worker'});
      };
      const cancel = () => finish(abortError());
      activeWorker = {worker, cancel};
      worker.onmessage = event => {
        const message = event.data;
        if (!current(token) || signal.aborted) { cancel(); return; }
        if (message?.id !== token) return;
        if (message.type === 'result') finish(null, message.cloud);
        else if (message.type === 'error') {
          const error = Error(message.error?.message || 'Point-cloud worker could not parse this file');
          error.name = message.error?.name || 'Error'; finish(error);
        }
        // Progress stays inside the worker. Pane phases are intentionally quiet.
      };
      worker.onerror = event => {
        event.preventDefault?.();
        finish(Error(event.message || 'Point-cloud worker failed. Retry this building.'));
      };
      worker.onmessageerror = () => finish(Error('Point-cloud worker returned an unreadable result'));
      signal.addEventListener('abort', cancel, {once: true});
      if (signal.aborted) { cancel(); return; }
      timer = setTimeout(() => {
        const error = Error('Point-cloud parsing timed out. Retry or choose a smaller resource. / 点云解析超时，请重试或选择更小的数据。');
        error.code = 'COMPARE_PARSE_TIMEOUT'; finish(error);
      }, parseTimeoutMs);
      try {
        // Never transfer the cache's own buffer: revisiting must retain exact bytes.
        const buffer = bytes.slice().buffer;
        worker.postMessage({type: 'parse', id: token, buffer, filename: fileName(entry), maxPoints}, [buffer]);
      } catch (error) { finish(error); }
    });
  }
  async function loadPane(pair, pane, operation) {
    const {token, controller} = operation, entry = pair[pane];
    if (!current(token)) return;
    try {
      if (!entry) throw Error(`Building ${pair.id} has no ${pane === 'mesh' ? 'mesh' : 'point cloud'} entry in this index. / 索引缺少该建筑的${pane === 'mesh' ? '模型' : '点云'}。`);
      update(token, {[pane]: 'loading'});
      checkAbort(controller.signal);
      let bytes = touch(pair.id)?.[pane];
      if (!bytes) {
        const pending = fetchDataset(descriptor(entry), {signal: controller.signal, fetchSource: source});
        // The current cloud is issued first. Only then may a single low-priority
        // neighbor mesh compete for bandwidth while that foreground request runs.
        if (pane === 'cloud') schedulePrefetch();
        bytes = await pending;
        checkAbort(controller.signal);
        if (!current(token)) return;
        cacheRaw(pair.id, pane, bytes);
      }
      if (pane === 'cloud') schedulePrefetch();
      if (!update(token, {[pane]: 'parsing'})) return;
      checkAbort(controller.signal);
      if (pane === 'mesh') {
        const mesh = await parseMesh(new TextDecoder('utf-8', {fatal: true}).decode(bytes), pair.id, bytes.byteLength);
        checkAbort(controller.signal);
        if (!current(token)) return;
        await onMesh({id: pair.id, mesh, entry, preset});
      } else {
        const {cloud, parseMode} = await parsePoints(bytes, entry, operation);
        checkAbort(controller.signal);
        if (!current(token)) return;
        await onCloud({id: pair.id, cloud, entry, preset, parseMode});
      }
      update(token, {[pane]: 'ready'});
    } catch (error) {
      if (!current(token) || controller.signal.aborted || error?.name === 'AbortError') return;
      update(token, {[pane]: 'error'});
      report(token, pane, error);
    }
  }
  function schedulePrefetch() {
    if (disposed || foreground && foreground.stage !== 'cloud' || background || !prefetch || !cacheBudgetBytes || !catalog || state.index < 0 || host.navigator?.connection?.saveData) return;
    try { available(); } catch { return; }
    const nearby = neighbors(), panes = foreground ? ['mesh'] : ['mesh', 'cloud'];
    const eligible = nearby.some(pair => panes.some(pane => {
      const entry = pair[pane];
      return entry && !cache.get(pair.id)?.[pane] && !attempts.has(`${pair.id}/${pane}`) &&
        Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= cacheBudgetBytes - cacheBytes;
    }));
    if (!eligible) return;
    const token = generation, controller = new AbortController();
    const job = {controller, reserved: 0};
    background = job;
    job.promise = (async () => {
      // A running foreground cloud permits mesh-only speculation. Both neighbor
      // meshes precede neighbor clouds, which wait for the foreground to finish.
      for (const pane of panes) for (const pair of nearby) {
        if (!current(token) || controller.signal.aborted || foreground && foreground.stage !== 'cloud') return;
        const entry = pair[pane], key = `${pair.id}/${pane}`;
        if (!entry || cache.get(pair.id)?.[pane] || attempts.has(key)) continue;
        attempts.add(key);
        // Unknown-length files are never speculative. Exact declared bytes are
        // reserved before fetch; the shared loader still verifies the final size.
        if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > cacheBudgetBytes - cacheBytes) continue;
        if (!cache.has(pair.id) && cache.size >= MAX_CACHE_PAIRS) continue;
        job.reserved = entry.bytes; emit();
        try {
          const bytes = await fetchDataset(descriptor(entry), {signal: controller.signal,
            fetchSource: (url, options) => speculativeSource(url, {...options, maxBytes: Math.min(options.maxBytes, entry.bytes)}),
          });
          checkAbort(controller.signal);
          if (!current(token)) return;
          job.reserved = 0;
          cacheRaw(pair.id, pane, bytes, true);
        } catch (error) {
          if (controller.signal.aborted || !current(token)) return;
          // Best-effort neighbors never replace the active pane with an error.
        } finally { job.reserved = 0; if (current(token)) emit(); }
      }
    })().finally(() => {
      if (background === job) background = null;
      // The eligibility check above is essential: exhausted/skipped attempts
      // cannot create an endless chain of empty background jobs.
      if (!disposed) { emit(); schedulePrefetch(); }
    });
  }
  async function select(id) {
    if (disposed) return snapshot();
    const token = ++generation;
    cancelSelection(); attempts = new Set();
    const operation = {token, controller: new AbortController(), stage: 'mesh'};
    foreground = operation;
    state = {id: typeof id === 'string' ? id : null, index: -1, total: catalog?.length || 0, mesh: 'idle', cloud: 'idle', phase: 'selection', parseMode: null};
    emit();
    try {
      available();
      if (typeof id !== 'string' || !id.trim() || id !== id.trim() || /[\u0000-\u001f\u007f]/u.test(id)) throw Error('An explicit building ID is required for comparison. / 对比链接必须指定建筑 ID。');
      if (!catalog) update(token, {phase: 'catalog'});
      const buildings = await loadCatalog();
      if (!current(token)) return snapshot();
      const index = buildings.findIndex(pair => pair.id === id);
      if (!catalogNotified) {
        catalogNotified = true;
        onCatalog({buildings, selectedId: id});
      }
      if (!current(token)) return snapshot();
      if (index < 0) throw Error(`Building ID ${id} was not found in this index; no different building was loaded. / 索引中没有该建筑 ID，不会自动改为其他建筑。`);
      if (!update(token, {index, total: buildings.length, mesh: 'loading', cloud: 'idle', phase: 'loading'})) return snapshot();
      pruneCache();
      // Deliberately await mesh fetch, parse, and callback before touching cloud.
      await loadPane(buildings[index], 'mesh', operation);
      if (!current(token)) return snapshot();
      operation.stage = 'cloud';
      await loadPane(buildings[index], 'cloud', operation);
      update(token, {phase: state.mesh === 'ready' && state.cloud === 'ready' ? 'ready' : 'error'});
    } catch (error) {
      if (current(token) && !operation.controller.signal.aborted) {
        update(token, {phase: 'error'});
        report(token, 'catalog', error);
      }
    } finally {
      if (foreground === operation) { foreground = null; schedulePrefetch(); }
    }
    return snapshot();
  }
  return {
    start: () => select(initialId), select,
    previous: () => state.index > 0 ? select(catalog[state.index - 1].id) : Promise.resolve(snapshot()),
    next: () => catalog && state.index >= 0 && state.index + 1 < catalog.length ? select(catalog[state.index + 1].id) : Promise.resolve(snapshot()),
    getState: snapshot,
    dispose() {
      if (disposed) return;
      disposed = true; generation++;
      cancelSelection(); catalogController?.abort();
      foreground = null;
      if (background) background.reserved = 0;
      background = null; cache.clear(); cacheBytes = 0;
    },
  };
}
