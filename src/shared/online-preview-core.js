/** Pure validation and bounded downloads for explicit, read-only online previews.
 * URL checks are lexical: they do not resolve DNS or prove a resource is public.
 * Drive link normalization does not grant access or bypass CORS/sign-in/redirects.
 * Nothing in this module reads or writes local display preferences.
 */
export const METADATA_MAX_BYTES = 5 * 1024 * 1024;
export const FILE_MAX_BYTES = 64 * 1024 * 1024;
export const MANIFEST_MAX_ENTRIES = 10000;
export const XYZ_CHUNK_MAX_BYTES = 16 * 1024 * 1024;
export const XYZ_CHUNK_MAX_COUNT = 64;

const POINT_FORMATS = ['xyz', 'txt', 'csv', 'pts', 'ply', 'pcd'];
const FORMATS = Object.freeze({lod: ['obj'], pointcloud: POINT_FORMATS, wireframe: ['obj']});
const PALETTES = ['current', 'viridis', 'inferno', 'grayscale', 'blue-white-red'];
const COMMON_PRESET_KEYS = ['grid', 'palette', 'reverse'];
const POINT_PRESET_KEYS = ['pointSize', 'pointOpacity', 'pointColor', 'colorMode'];
const PRESET_KEYS = Object.freeze({lod: COMMON_PRESET_KEYS, pointcloud: [...COMMON_PRESET_KEYS, ...POINT_PRESET_KEYS], wireframe: [...COMMON_PRESET_KEYS, ...POINT_PRESET_KEYS, 'wireColor']});
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const own = (value, key) => Object.hasOwn(value, key);

function record(value, label, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be a plain object`);
  for (const key of Reflect.ownKeys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || DANGEROUS_KEYS.has(key) || !property.enumerable || !own(property, 'value')) throw new Error(`${label} contains an unsafe property`);
    if (allowed && !allowed.includes(key)) throw new Error(`${label} has unsupported option: ${key}`);
  }
  return value;
}

function text(value, label, maximum = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${label} must be non-empty text (maximum ${maximum} characters)`);
  return value;
}

function viewerName(value) {
  if (typeof value !== 'string' || !own(FORMATS, value)) throw new Error('Unsupported online preview viewer; use lod, pointcloud or wireframe');
  return value;
}

function steppedNumber(value, min, max, step) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && Math.abs((value - min) / step - Math.round((value - min) / step)) < 1e-8;
}

function privateIPv4(host) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  const [a, b, c] = host.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 88 && c === 99) ||
    a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113;
}

function publicIPv6(host) {
  // WHATWG URL already canonicalizes IPv4-embedded and compressed IPv6 literals.
  const source = host.slice(1, -1), halves = source.split('::');
  const left = halves[0] ? halves[0].split(':') : [], right = halves[1] ? halves[1].split(':') : [];
  const words = (halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left).map(word => parseInt(word, 16));
  // Accept native global-unicast only; conservatively reject translation/tunnel ranges.
  return words.length === 8 && words[0] >= 0x2000 && words[0] <= 0x3fff &&
    words[0] !== 0x2002 && !(words[0] === 0x2001 && (words[1] === 0 || words[1] === 0xdb8));
}

/** Normalize an absolute HTTPS URL without network access. Obvious local/private
 * literal addresses, credentials, fragments and common secret query keys fail.
 */
export function normalizePublicUrl(value) {
  text(value, 'Online URL', 8192);
  if (value !== value.trim() || /[\u0000-\u0020\u007f\\]/u.test(value)) throw new Error('Online URL contains whitespace or an invalid character');
  let url;
  try { url = new URL(value); } catch { throw new Error('Online URL must be an absolute HTTPS URL'); }
  if (url.protocol !== 'https:' || !/^https:\/\//i.test(value)) throw new Error('Online URL must use HTTPS');
  if (url.username || url.password) throw new Error('Online URL must not include credentials');
  if (value.includes('#')) throw new Error('Online URL must not include a fragment');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || /(?:^|\.)(?:localhost|local|localdomain|internal|lan|home|onion)$/.test(host) ||
      !host.includes('.') && !host.startsWith('[') || !host.startsWith('[') && host.split('.').some(part => !part) || privateIPv4(host) || host.startsWith('[') && !publicIPv6(host)) throw new Error('Online URL must not target localhost or a private/reserved address');
  for (const key of url.searchParams.keys()) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/(?:token|password|passwd|secret|signature|credential)/.test(normalized) || /^(?:key|auth|authorization|authentication|apikey|accesskey|resourcekey|sig)$/.test(normalized)) throw new Error('Online URL must not contain secret or authentication query parameters');
  }
  if (host === 'drive.google.com') {
    const file = /^\/file\/d\/([A-Za-z0-9_-]{1,200})\/(?:view|preview)\/?$/.exec(url.pathname);
    if (file) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(file[1])}`;
  }
  return url.href;
}

/** Strict visual-only preset. Omitted viewer permits common options only, so a
 * mixed-viewer manifest cannot accidentally apply point options to a mesh.
 */
export function recommendedPreviewPreset(viewer) {
  if (viewer !== undefined) viewerName(viewer);
  return validatePreset({grid:false,palette:'viridis',reverse:false,...(viewer==='pointcloud'||viewer==='wireframe'?{pointSize:3,pointOpacity:1,colorMode:'height'}:{})},viewer);
}

export function validatePreset(value, viewer) {
  if (viewer !== undefined) viewerName(viewer);
  if (value === undefined) return {};
  const allowed = viewer === undefined ? COMMON_PRESET_KEYS : PRESET_KEYS[viewer];
  record(value, 'Preview preset', allowed);
  const clean = {};
  for (const [key, option] of Object.entries(value)) {
    let valid = false;
    if (key === 'pointSize') valid = steppedNumber(option, 1, 32, .5);
    else if (key === 'pointOpacity') valid = steppedNumber(option, .1, 1, .05);
    else if (key === 'grid' || key === 'reverse') valid = typeof option === 'boolean';
    else if (key === 'pointColor' || key === 'wireColor') valid = typeof option === 'string' && /^#[0-9a-f]{6}$/i.test(option);
    else if (key === 'colorMode') valid = ['solid', 'height'].includes(option);
    else if (key === 'palette') valid = PALETTES.includes(option);
    if (!valid) throw new Error(`Invalid preview preset option: ${key}`);
    clean[key] = option;
  }
  return clean;
}

/** v1 file descriptor {url,viewer,format,name?,preset?}, or a manifest reference
 * {manifest,entry?,viewer?,preset?}; both require schemaVersion:1. File descriptors
 * also permit validated id/bytes/sha256 metadata copied from a manifest entry.
 */
export function validateDescriptor(value) {
  record(value, 'Preview descriptor');
  if (![1,2].includes(value.schemaVersion)) throw new Error('Preview descriptor requires schemaVersion: 1 or 2');
  const isManifest = own(value, 'manifest');
  if(isManifest && value.schemaVersion!==1)throw new Error('Manifest references use schemaVersion: 1');
  record(value, 'Preview descriptor', isManifest ? ['schemaVersion', 'manifest', 'entry', 'viewer', 'preset'] : ['schemaVersion', ...(value.schemaVersion===2?['chunks']:['url']), 'viewer', 'format', 'name', 'preset', 'id', 'bytes', 'sha256']);
  const clean = {schemaVersion: value.schemaVersion};
  if (isManifest) {
    clean.manifest = normalizePublicUrl(value.manifest);
    if (own(value, 'entry')) clean.entry = text(value.entry, 'Manifest entry ID');
    if (own(value, 'viewer')) clean.viewer = viewerName(value.viewer);
  } else {
    if(value.schemaVersion===1)clean.url = normalizePublicUrl(value.url);
    clean.viewer = viewerName(value.viewer);
    if (typeof value.format !== 'string' || !FORMATS[clean.viewer].includes(value.format)) throw new Error(`Unsupported ${clean.viewer} preview format`);
    clean.format = value.format;
    if (own(value, 'name')) clean.name = text(value.name, 'Preview name', 512);
    if (own(value, 'id')) clean.id = text(value.id, 'Dataset ID');
    metadata(value, clean);
    if(value.schemaVersion===2){
      if(clean.viewer!=='pointcloud'||clean.format!=='xyz')throw new Error('Chunk transport supports only pointcloud XYZ');
      if(!Number.isSafeInteger(clean.bytes)||clean.bytes<1||clean.bytes>FILE_MAX_BYTES||!clean.sha256)throw new Error('Chunked XYZ requires total bytes (1..64 MiB) and sha256');
      if(!Array.isArray(value.chunks)||!value.chunks.length||value.chunks.length>XYZ_CHUNK_MAX_COUNT)throw new Error('Chunked XYZ requires 1..64 ordered chunks');
      const urls=new Set();let total=0;clean.chunks=[];
      for(const part of value.chunks){record(part,'XYZ chunk',['url','bytes','sha256']);const chunk=metadata(part,{url:normalizePublicUrl(part.url)});
        if(!Number.isSafeInteger(chunk.bytes)||chunk.bytes<1||chunk.bytes>XYZ_CHUNK_MAX_BYTES||!chunk.sha256)throw new Error('Each XYZ chunk requires bytes (1..16 MiB) and sha256');
        if(urls.has(chunk.url))throw new Error('Duplicate XYZ chunk URL');urls.add(chunk.url);total+=chunk.bytes;clean.chunks.push(chunk);
      }
      if(total!==clean.bytes)throw new Error('XYZ chunk sizes must equal total bytes');
    }
  }
  if (own(value, 'preset')) clean.preset = validatePreset(value.preset, clean.viewer);
  return clean;
}

function metadata(value, clean) {
  if (own(value, 'bytes')) {
    if (!Number.isSafeInteger(value.bytes) || value.bytes < 0) throw new Error('Dataset bytes must be a non-negative safe integer');
    clean.bytes = value.bytes;
  }
  if (own(value, 'sha256')) {
    if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sha256)) throw new Error('Dataset sha256 must be 64 hexadecimal characters');
    clean.sha256 = value.sha256.toLowerCase();
  }
  return clean;
}

function manifestEntry(value, version=1) {
  record(value, 'Manifest dataset', ['id', 'name', ...(version===2?['chunks']:['url']), 'viewer', 'format', 'bytes', 'sha256', 'preset']);
  const descriptor = {...value, schemaVersion:version};
  const {schemaVersion, ...clean} = validateDescriptor(descriptor);
  return { ...clean, id:text(value.id,'Dataset ID') };
}

function driveEntry(building, kind, data) {
  record(data, `Drive ${kind} entry`);
  const path = text(data.path, 'Drive file path', 2048);
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Drive file path must be a safe relative path');
  const format = /\.([^.\/]+)$/.exec(path)?.[1].toLowerCase();
  const fileId = own(data, 'file_id') ? text(data.file_id, 'Drive file ID', 200) : undefined;
  if (fileId !== undefined && !/^[A-Za-z0-9_-]+$/.test(fileId)) throw new Error('Invalid Drive file ID');
  const url = own(data, 'drive_url') ? normalizePublicUrl(data.drive_url) : fileId ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}` : undefined;
  if (!url) throw new Error('Drive entry requires drive_url or file_id; a local path cannot be downloaded');
  return manifestEntry({id: `${building}/${kind}`, name: path.split('/').at(-1), url, viewer: kind === 'mesh' ? 'lod' : 'pointcloud', format,
    ...(own(data, 'bytes') ? {bytes: data.bytes} : {}), ...(own(data, 'sha256') ? {sha256: data.sha256} : {})});
}

function publicIndexBase(value, manifestUrl) {
  if(value.path_base!=='directory_containing_index')throw Error('Public index requires path_base: directory_containing_index');
  const raw=text(value.public_base_url,'Public index base URL',8192);
  if(/[%%?#\\]/.test(raw)||/\/(?:\.|\.\.)(?:\/|$)/.test(raw))throw Error('Public index base must not contain escapes, traversal, query or fragment');
  const base=new URL(normalizePublicUrl(raw));
  if(!base.pathname.endsWith('/'))throw Error('Public index base URL must end with /');
  if(!manifestUrl)throw Error('Public relative index requires its source manifest URL');
  const source=new URL(normalizePublicUrl(manifestUrl));
  if(source.search||source.hash||new URL('.',source).href!==base.href)throw Error('Public index base must match its source manifest directory');
  return base;
}
function publicIndexEntry(building,kind,data,base){
  record(data,'Public index file',['path','bytes','sha256']);
  if(!own(data,'bytes')||!own(data,'sha256'))throw Error('Public index files require bytes and sha256');
  const path=text(data.path,'Public relative path',2048),parts=path.split('/');
  if(/[%%?#:\\]/.test(path)||parts.some(part=>!part||part==='.'||part==='..'))throw Error('Public index file path must be a safe unescaped relative path');
  const url=new URL(parts.map(encodeURIComponent).join('/'),base);
  if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw Error('Public index file must remain inside its base directory');
  const format=/\.([^.\/]+)$/.exec(path)?.[1].toLowerCase();
  return manifestEntry({id:`${building}/${kind}`,name:parts.at(-1),url:url.href,viewer:kind==='mesh'?'lod':'pointcloud',format,...(own(data,'bytes')?{bytes:data.bytes}:{}),...(own(data,'sha256')?{sha256:data.sha256}:{})});
}

/** Return sanitized dataset entries, never downloading files. Accepts a strict
 * {schemaVersion:1,datasets:[...]} manifest or schema_version:1 Drive index.
 * sha256 is validated metadata, not a claim that downloaded bytes were verified.
 */
export function normalizeManifest(value, {manifestUrl} = {}) {
  record(value, 'Preview manifest');
  let entries;
  if (own(value, 'schemaVersion')) {
    record(value, 'Preview manifest', ['schemaVersion', 'datasets']);
    if (![1,2].includes(value.schemaVersion) || !Array.isArray(value.datasets)) throw new Error('Preview manifest requires schemaVersion: 1 or 2 and datasets array');
    if (value.datasets.length > MANIFEST_MAX_ENTRIES) throw new Error('Preview manifest exceeds 10000 datasets');
    entries = Array.from(value.datasets, entry=>manifestEntry(entry,value.schemaVersion===2&&entry&&own(entry,'chunks')?2:1));
  } else {
    if (value.schema_version !== 1 || !Array.isArray(value.buildings)) throw new Error('Unsupported manifest; expected schemaVersion: 1 or a schema_version: 1 Drive index');
    if (value.buildings.length > MANIFEST_MAX_ENTRIES) throw new Error('Drive index exceeds 10000 buildings');
    const publicBase=own(value,'public_base_url')||own(value,'path_base')?publicIndexBase(value,manifestUrl):null;
    entries = [];
    for (const building of value.buildings) {
      record(building, 'Drive building');
      const id = text(building.id, 'Drive building ID', 240);
      for (const kind of ['point_cloud', 'mesh']) {
        if (building[kind] === undefined || building[kind] === null) continue;
        if (entries.length >= MANIFEST_MAX_ENTRIES) throw new Error('Preview manifest exceeds 10000 datasets');
        entries.push(publicBase?publicIndexEntry(id,kind,building[kind],publicBase):driveEntry(id, kind, building[kind]));
      }
    }
  }
  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate dataset ID: ${entry.id}`);
    ids.add(entry.id);
  }
  return entries;
}

function abortError() {
  const error = new Error('Online preview download cancelled');
  error.name = 'AbortError';
  return error;
}

function checkAbort(signal) { if (signal?.aborted) throw abortError(); }

function abortable(promise, signal) {
  if (!signal) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(abortError()); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, {once: true});
    Promise.resolve(promise).then(value => { cleanup(); signal.aborted ? reject(abortError()) : resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}

function cancelQuietly(body, reason) {
  try { Promise.resolve(body?.cancel(reason)).catch(() => {}); } catch { /* Preserve the original error. */ }
}

/** Credential-free, no-referrer, CORS fetch. Redirects deliberately fail closed.
 * Hard cap 64 MiB; use METADATA_MAX_BYTES for JSON. onProgress({loaded,total})
 * uses total:null when the decoded length is unknown. No unbounded fallback.
 */
export async function fetchBounded(value, {signal, maxBytes = FILE_MAX_BYTES, onProgress, fetchImpl = globalThis.fetch} = {}) {
  const url = normalizePublicUrl(value);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > FILE_MAX_BYTES) throw new Error('Download byte limit must be between 1 byte and 64 MiB');
  if (typeof fetchImpl !== 'function') throw new Error('Online preview fetch is unavailable');
  if (onProgress !== undefined && typeof onProgress !== 'function') throw new Error('Download progress handler must be a function');
  if (signal !== undefined && (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) throw new Error('Invalid download AbortSignal');
  checkAbort(signal);
  let response, reader, completed = false;
  try {
    const pending = Promise.resolve(fetchImpl(url, {signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', mode: 'cors', cache: 'no-store'})).then(result => {
      if (signal?.aborted) { cancelQuietly(result?.body, abortError()); throw abortError(); }
      return result;
    });
    response = await abortable(pending, signal);
    checkAbort(signal);
    if (!response || !response.ok) throw new Error(`Online download failed${Number.isInteger(response?.status) ? ` (HTTP ${response.status})` : ''}`);
    if (response.redirected || ['opaque', 'opaqueredirect'].includes(response.type) || response.url && normalizePublicUrl(response.url) !== url) throw new Error('Online download redirects or opaque responses are not allowed');
    const declared = response.headers?.get?.('content-length');
    const encoding = response.headers?.get?.('content-encoding');
    let total = typeof declared === 'string' && /^\d+$/.test(declared.trim()) && Number.isSafeInteger(Number(declared)) && (!encoding || encoding === 'identity') ? Number(declared) : null;
    if (total !== null && total > maxBytes) throw new Error(`Online download exceeds ${maxBytes} byte limit`);
    let loaded = 0;
    onProgress?.({loaded, total});
    checkAbort(signal);
    if (response.body === null) { completed = true; return new Uint8Array(); }
    if (typeof response.body?.getReader !== 'function') throw new Error('Online download requires a readable byte stream');
    reader = response.body.getReader();
    const chunks = [];
    while (true) {
      const {done, value: chunk} = await abortable(reader.read(), signal);
      checkAbort(signal);
      if (done) break;
      if (!(chunk instanceof Uint8Array)) throw new Error('Online download returned an invalid byte stream');
      if (chunk.byteLength > maxBytes - loaded) throw new Error(`Online download exceeds ${maxBytes} byte limit`);
      loaded += chunk.byteLength;
      if (total !== null && loaded > total) total = null;
      if (chunk.byteLength) chunks.push(new Uint8Array(chunk));
      onProgress?.({loaded, total});
      checkAbort(signal);
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    checkAbort(signal);
    completed = true;
    return bytes;
  } finally {
    if (!completed) cancelQuietly(reader || response?.body, 'Online preview stopped');
    try { reader?.releaseLock(); } catch { /* A cancelled mock/stream may still hold a pending read. */ }
  }
}
