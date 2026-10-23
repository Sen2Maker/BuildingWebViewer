#!/usr/bin/env node
/**
 * Read-only, OFFLINE readiness check for an explicitly selected resource bundle.
 * No network, upload, writes, browser/CORS test, or publication is performed.
 * Keep the selected tree unchanged while checking. Only regular JSON, supported
 * preview assets, and _headers/_redirects are accepted; use a dedicated bundle,
 * not a source checkout. Obvious secret detection is NOT a complete secret scan.
 *
 * Directory handles anchor every descent/open, including root ancestors. User
 * symlinks are never followed. This needs O_NOFOLLOW and directory-descriptor
 * access through /proc/self/fd or /dev/fd; unsupported platforms fail closed.
 */
import {constants} from 'node:fs';
import {lstat, open, opendir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {extname, parse, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  normalizeManifest, normalizePublicUrl, METADATA_MAX_BYTES, FILE_MAX_BYTES,
  MANIFEST_MAX_ENTRIES, XYZ_CHUNK_MAX_BYTES, XYZ_CHUNK_MAX_COUNT,
} from '../src/shared/online-preview-core.js';

export const PREFLIGHT_MAX_FILES = 20000;
export const PREFLIGHT_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const PREFLIGHT_MAX_READ_BYTES = 8 * 1024 * 1024 * 1024;
export const PREFLIGHT_MAX_DIRECTORIES = 20000;
export const PREFLIGHT_MAX_DEPTH = 64;
const READ_BYTES = 64 * 1024;
const ASSET_EXTENSIONS = new Set(['.json', '.obj', '.xyz', '.txt', '.csv', '.pts', '.ply', '.pcd']);
const HOST_CONFIG_NAMES = new Set(['_headers', '_redirects']);
const PRIVATE_NAME = /(?:^|[._-])(?:private[._-]?key|keystore|credentials?|secrets?|passwords?|id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:[._-]|$)/i;
const SECRET_MARKERS = [
  /-----BEGIN (?:[A-Z0-9 ]{0,32})PRIVATE KEY-----/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,255}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,255}\b/,
  /\bAIza[A-Za-z0-9_-]{35}\b/,
  /\b(?:password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|authorization)["']?[ \t]{0,64}[:=][ \t]{0,64}["']?[^\s"',;}{]{4,256}/i,
];
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const unchanged = (a, b) => sameFile(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
const directoryFlags = () => constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const fileFlags = () => constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

function fail(message) {
  const error = new Error(message);
  error.code = 'PREVIEW_PREFLIGHT_FAILED';
  throw error;
}

function safeSegments(value, label) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\\\u0000-\u001f\u007f]/u.test(value)) fail(`${label} must be a safe relative path`);
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[:%?#]/u.test(part))) fail(`${label} must not contain absolute paths, traversal, escapes, queries or fragments`);
  return parts;
}

function checkName(name) {
  if (name.startsWith('.') || PRIVATE_NAME.test(name)) fail('Bundle contains a hidden or obvious credential/private-key filename; remove private material before deployment');
  safeSegments(name, 'Bundle filename');
}

/** Inspect original spelling BEFORE WHATWG URL can remove dot segments. Only
 * canonical, singly encoded URL segments map to filesystem names. */
function strictUrl(value, directory = false) {
  const normalized = normalizePublicUrl(value);
  if (value.includes('?') || value.includes('#')) fail('Deployment URLs must not contain a query or fragment, including empty markers');
  const raw = /^https:\/\/[^/?#]+(\/[^?#]*)?$/i.exec(value);
  if (!raw) fail('Deployment URL must be an absolute HTTPS URL');
  const rawPath = raw[1] || '/';
  const url = new URL(normalized);
  if (url.search || url.hash || url.username || url.password) fail('Deployment URLs must not contain credentials, queries or fragments');
  if (directory && !rawPath.endsWith('/')) fail('Base URL must be a directory URL ending in /');
  if (!directory && rawPath.endsWith('/')) fail('A resource URL must identify a regular file, not a directory');
  const rawParts = rawPath.slice(1).split('/');
  if (directory) rawParts.pop();
  const parts = rawParts.map(part => {
    let decoded;
    try { decoded = decodeURIComponent(part); } catch { fail('Deployment URL contains an invalid percent escape or UTF-8 sequence'); }
    if (!decoded || decoded === '.' || decoded === '..' || /[\\/%:?#\u0000-\u001f\u007f]/u.test(decoded)) fail('Deployment URL contains traversal, an encoded slash, or an unsafe path segment');
    return decoded;
  });
  const canonicalPath = `/${parts.map(part => encodeURIComponent(part)).join('/')}${directory && parts.length ? '/' : ''}`;
  if (url.pathname !== canonicalPath) fail('Deployment URL path must use canonical encoding without traversal or alternate escaped spellings');
  return url;
}

function mappedPath(value, base) {
  const url = strictUrl(value);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) fail('Every resource URL must be on the exact provided base origin and under its directory');
  const suffix = url.pathname.slice(base.pathname.length);
  const relative = suffix.split('/').map(part => decodeURIComponent(part)).join('/');
  safeSegments(relative, 'Resource path');
  return relative;
}

async function descriptorAnchor(handle) {
  // These OS-owned links address an already-open directory, not a bundle link.
  for (const prefix of ['/proc/self/fd', '/dev/fd']) {
    try {
      const target = `${prefix}/${handle.fd}`;
      if (!sameFile(await handle.stat({bigint: true}), await stat(target, {bigint: true}))) continue;
      const probe = await open(`${target}/.`, directoryFlags());
      await probe.close();
      return prefix;
    } catch { /* Try the other supported directory-descriptor interface. */ }
  }
  fail('This platform cannot safely anchor directory reads; O_NOFOLLOW and /proc/self/fd or /dev/fd are required');
}

async function openRoot(path) {
  if (!constants.O_NOFOLLOW || !constants.O_DIRECTORY || !constants.O_NONBLOCK) fail('This platform does not provide the no-follow filesystem primitives required for this offline check');
  const absolute = resolve(path), filesystemRoot = parse(absolute).root;
  let handle = await open(filesystemRoot, directoryFlags());
  try {
    const anchor = await descriptorAnchor(handle);
    for (const part of absolute.slice(filesystemRoot.length).split('/').filter(Boolean)) {
      const candidate = `${anchor}/${handle.fd}/${part}`;
      const entry = await lstat(candidate, {bigint: true});
      if (entry.isSymbolicLink() || !entry.isDirectory()) fail('Root and all its ancestors must be directories, never symlinks or special files');
      const next = await open(candidate, directoryFlags());
      if (!unchanged(entry, await next.stat({bigint: true}))) { await next.close(); fail('Root changed while opening; retry with an unchanged directory'); }
      await handle.close(); handle = next;
    }
    return {handle, anchor, absolute, rootStat: await handle.stat({bigint: true})};
  } catch (error) { await handle.close(); throw error; }
}

async function scanTree(root) {
  const files = new Map(), directories = new Map();
  let totalBytes = 0, directoryCount = 1;
  directories.set('', await root.handle.stat({bigint: true}));
  async function visit(handle, relative, depth) {
    const before = await handle.stat({bigint: true});
    const entries = await opendir(`${root.anchor}/${handle.fd}`, {bufferSize: 32});
    for await (const entry of entries) {
      checkName(entry.name);
      const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
      if (relativePath.length > 4096) fail('Bundle path exceeds the bounded path length');
      const path = `${root.anchor}/${handle.fd}/${entry.name}`;
      const info = await lstat(path, {bigint: true});
      if (info.isSymbolicLink()) fail('Bundle contains a symlink; symlinks are never followed');
      if (info.isDirectory()) {
        if (++directoryCount > PREFLIGHT_MAX_DIRECTORIES || depth >= PREFLIGHT_MAX_DEPTH) fail(`Bundle exceeds ${PREFLIGHT_MAX_DIRECTORIES} directories or ${PREFLIGHT_MAX_DEPTH} directory levels`);
        const child = await open(path, directoryFlags());
        try {
          if (!unchanged(info, await child.stat({bigint: true}))) fail('Bundle directory changed during inventory');
          directories.set(relativePath, info);
          await visit(child, relativePath, depth + 1);
        } finally { await child.close(); }
      } else if (info.isFile()) {
        if (files.size >= PREFLIGHT_MAX_FILES) fail(`Bundle exceeds ${PREFLIGHT_MAX_FILES} regular files, including unreferenced files`);
        if (info.size > BigInt(PREFLIGHT_MAX_FILE_BYTES)) fail('Bundle contains a file above the 25 MiB deployment limit');
        const extension = extname(entry.name).toLowerCase();
        if (!ASSET_EXTENSIONS.has(extension) && !HOST_CONFIG_NAMES.has(entry.name)) fail('Bundle contains an unsupported file type; only JSON, OBJ, XYZ/TXT/CSV/PTS/PLY/PCD, _headers and _redirects are permitted');
        if (extension === '.json' && info.size > BigInt(METADATA_MAX_BYTES)) fail('Bundle JSON metadata exceeds the 5 MiB limit');
        totalBytes += Number(info.size);
        if (totalBytes > PREFLIGHT_MAX_READ_BYTES) fail('Bundle exceeds the 8 GiB total scan/read budget');
        files.set(relativePath, info);
      } else fail('Bundle contains a special file; only regular files and directories are permitted');
    }
    if (!unchanged(before, await handle.stat({bigint: true}))) fail('Bundle directory changed during inventory; retry with an unchanged tree');
  }
  await visit(root.handle, '', 0);
  return {files, directories, totalBytes};
}

async function openInventoriedFile(root, inventory, relative) {
  const parts = safeSegments(relative, 'Resource path');
  let parent = root.handle, ownParent = false, prefix = '';
  try {
    for (const part of parts.slice(0, -1)) {
      prefix = prefix ? `${prefix}/${part}` : part;
      const expected = inventory.directories.get(prefix);
      if (!expected) fail('Referenced directory was not in the selected root inventory');
      const child = await open(`${root.anchor}/${parent.fd}/${part}`, directoryFlags());
      if (!unchanged(expected, await child.stat({bigint: true}))) { await child.close(); fail('Bundle directory changed before reading'); }
      if (ownParent) await parent.close();
      parent = child; ownParent = true;
    }
    const expected = inventory.files.get(relative);
    if (!expected) fail('Manifest references a missing regular file inside the selected root');
    const handle = await open(`${root.anchor}/${parent.fd}/${parts.at(-1)}`, fileFlags());
    const opened = await handle.stat({bigint: true});
    if (!opened.isFile() || !unchanged(expected, opened)) { await handle.close(); fail('Bundle file changed or is no longer a regular file'); }
    return handle;
  } finally { if (ownParent) await parent.close(); }
}

async function readResource(root, inventory, relative, budget, {utf8 = false, collect = false, aggregate} = {}) {
  const expected = inventory.files.get(relative);
  if (!expected) fail('Manifest references a missing regular file inside the selected root');
  const size = Number(expected.size);
  if (size > PREFLIGHT_MAX_READ_BYTES - budget.bytes) fail('Verification exceeds the 8 GiB total scan/read budget');
  if (collect && size > METADATA_MAX_BYTES) fail('Manifest metadata exceeds the 5 MiB limit');
  const handle = await openInventoriedFile(root, inventory, relative);
  const digest = createHash('sha256'), decoder = utf8 ? new TextDecoder('utf-8', {fatal: true}) : null;
  const collected = collect ? Buffer.alloc(size) : undefined;
  const buffer = Buffer.alloc(Math.min(READ_BYTES, size || 1));
  let position = 0, tail = '', lastByte;
  try {
    while (position < size) {
      const {bytesRead} = await handle.read(buffer, 0, Math.min(buffer.length, size - position), position);
      if (!bytesRead) fail('Bundle file was truncated during verification');
      const block = buffer.subarray(0, bytesRead);
      // Fixed-size overlap detects markers split over read boundaries. Never
      // include matched material, URLs, or file contents in an error/report.
      const text = tail + block.toString('latin1');
      if (SECRET_MARKERS.some(pattern => pattern.test(text))) fail('Bundle contains an obvious credential/private-key content marker; remove private material before deployment');
      tail = text.slice(-1024);
      if (decoder) {
        try { decoder.decode(block, {stream: true}); } catch { fail('Text resource or XYZ chunk is not valid complete UTF-8'); }
      }
      collected?.set(block, position);
      digest.update(block); aggregate?.update(block);
      position += bytesRead; budget.bytes += bytesRead; lastByte = block.at(-1);
    }
    if (decoder) {
      try { decoder.decode(); } catch { fail('Text resource or XYZ chunk is not valid complete UTF-8'); }
    }
    if (!unchanged(expected, await handle.stat({bigint: true}))) fail('Bundle file changed during verification; retry with an unchanged tree');
    return {bytes: position, sha256: digest.digest('hex'), lastByte, collected};
  } finally { await handle.close(); }
}

function requireIntegrity(metadata, label = 'Dataset') {
  if (!Number.isSafeInteger(metadata.bytes) || !metadata.sha256) fail(`${label} is not deployment-ready: bytes and sha256 checksum metadata are required, including for v1 entries`);
}

function verifyIntegrity(actual, expected) {
  if (actual.bytes !== expected.bytes) fail('Resource byte length does not match manifest metadata');
  if (actual.sha256 !== expected.sha256) fail('Resource SHA-256 checksum does not match manifest metadata');
}

function rawSources(manifest) {
  if (Array.isArray(manifest.datasets)) return manifest.datasets.flatMap(entry => entry.chunks || [{url: entry.url}]);
  // normalizeManifest also supports legacy Drive indexes. Their generated or
  // explicit download URLs still fail the exact-base/no-query deployment gate.
  return manifest.buildings.flatMap(building => ['point_cloud', 'mesh'].flatMap(kind => building[kind]?.drive_url ? [{url: building[kind].drive_url}] : []));
}

/** All local inputs are explicit. Throws on any readiness failure; successful
 * output is only local integrity/readiness, never publication or CORS proof. */
export async function checkPreviewResources({root: rootPath, manifest: manifestPath, baseUrl} = {}) {
  if (typeof rootPath !== 'string' || !rootPath || /[\u0000-\u001f\u007f]/u.test(rootPath)) fail('An explicit --root directory is required');
  safeSegments(manifestPath, '--manifest');
  if (extname(manifestPath).toLowerCase() !== '.json') fail('--manifest must be a root-relative JSON file');
  const base = strictUrl(baseUrl, true);
  const root = await openRoot(rootPath);
  try {
    const inventory = await scanTree(root);
    const metadata = inventory.files.get(manifestPath);
    if (!metadata) fail('The explicit manifest is missing or is not a regular file inside --root');
    if (metadata.size > BigInt(METADATA_MAX_BYTES)) fail('Manifest metadata exceeds the 5 MiB limit');
    const budget = {bytes: 0};
    const manifestRead = await readResource(root, inventory, manifestPath, budget, {utf8: true, collect: true});
    let parsed;
    try { parsed = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(manifestRead.collected)); }
    catch { fail('Manifest is not valid UTF-8 JSON'); }
    let entries;
    try { entries = normalizeManifest(parsed,{manifestUrl:new URL(manifestPath.split('/').map(encodeURIComponent).join('/'),base).href}); }
    catch { fail('Manifest schema validation failed; check dataset fields, supported formats, IDs, byte counts and SHA-256 metadata'); }
    if (!entries.length) fail('Manifest must contain at least one dataset to be deployment-ready');
    // Do not let normalization erase malicious original path spellings.
    for (const source of rawSources(parsed)) mappedPath(source.url, base);
    const chunkPaths = new Set(), referenced = new Set(), plans = [];
    let aggregateReadBytes = 0;
    for (const entry of entries) {
      requireIntegrity(entry);
      if (entry.bytes > FILE_MAX_BYTES) fail('Dataset exceeds the existing 64 MiB preview limit');
      if (!entry.chunks && entry.format === 'obj' && entry.bytes > 8 * 1024 * 1024) fail('OBJ dataset exceeds the existing 8 MiB preview transport limit');
      const sources = entry.chunks || [entry];
      const paths = sources.map(source => {
        requireIntegrity(source, 'Resource');
        const relative = mappedPath(source.url, base), info = inventory.files.get(relative);
        if (!info) fail('Manifest references a missing regular file inside the selected root');
        if (Number(info.size) !== source.bytes) fail('Resource byte length does not match manifest metadata');
        referenced.add(relative);
        if (entry.chunks) { chunkPaths.add(relative); aggregateReadBytes += source.bytes; }
        return relative;
      });
      plans.push({entry, paths});
    }
    if (inventory.totalBytes + aggregateReadBytes > PREFLIGHT_MAX_READ_BYTES) fail('Bundle plus ordered chunk verification exceeds the 8 GiB total scan/read budget');
    const verified = new Map([[manifestPath, manifestRead]]);
    for (const [relative] of inventory.files) {
      if (relative === manifestPath) continue;
      const utf8 = chunkPaths.has(relative) || extname(relative).toLowerCase() === '.json' || HOST_CONFIG_NAMES.has(relative.split('/').at(-1));
      verified.set(relative, await readResource(root, inventory, relative, budget, {utf8}));
    }
    let chunkedDatasets = 0;
    for (const {entry, paths} of plans) {
      if (!entry.chunks) { verifyIntegrity(verified.get(paths[0]), entry); continue; }
      chunkedDatasets++;
      const aggregate = createHash('sha256');
      let bytes = 0;
      for (const [index, part] of entry.chunks.entries()) {
        const checked = verified.get(paths[index]);
        verifyIntegrity(checked, part);
        if (index < paths.length - 1 && checked.lastByte !== 10) fail('Non-final XYZ chunks must end at an LF line boundary');
        const current = await readResource(root, inventory, paths[index], budget, {utf8: true, aggregate});
        verifyIntegrity(current, part); bytes += current.bytes;
      }
      verifyIntegrity({bytes, sha256: aggregate.digest('hex')}, entry);
    }
    // A final anchored metadata pass catches new/replaced/removed resources too.
    const finalInventory = await scanTree(root);
    for (const key of ['files', 'directories']) {
      if (inventory[key].size !== finalInventory[key].size) fail('Bundle changed during verification');
      for (const [name, before] of inventory[key]) {
        const after = finalInventory[key].get(name);
        if (!after || !unchanged(before, after)) fail('Bundle changed during verification');
      }
    }
    const currentRoot = await openRoot(rootPath);
    try { if (!unchanged(root.rootStat, currentRoot.rootStat)) fail('Selected root changed during verification'); }
    finally { await currentRoot.handle.close(); }
    return {
      ok: true, offline: true, root: root.absolute, manifest: manifestPath, baseUrl: base.href,
      datasets: entries.length, chunkedDatasets, files: inventory.files.size,
      referencedFiles: referenced.size, bundleBytes: inventory.totalBytes, readBytes: budget.bytes,
      limits: {files: PREFLIGHT_MAX_FILES, fileBytes: PREFLIGHT_MAX_FILE_BYTES, metadataBytes: METADATA_MAX_BYTES,
        readBytes: PREFLIGHT_MAX_READ_BYTES, datasets: MANIFEST_MAX_ENTRIES, datasetBytes: FILE_MAX_BYTES,
        chunkBytes: XYZ_CHUNK_MAX_BYTES, chunks: XYZ_CHUNK_MAX_COUNT},
      notice: 'Offline local readiness only. No upload, publication, public-access, CORS, browser or comprehensive secret-scan proof.',
    };
  } finally { await root.handle.close(); }
}

const usage = 'Usage: node scripts/check-preview-resources.mjs --root DIR --manifest relative/path.json --base-url https://public.example/path/';
export function parsePreflightArgs(argv) {
  const options = {}, names = new Map([['--root', 'root'], ['--manifest', 'manifest'], ['--base-url', 'baseUrl']]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = names.get(argv[index]), value = argv[index + 1];
    if (!key || value === undefined || !value || value.startsWith('--') || Object.hasOwn(options, key)) fail(`Invalid or duplicate CLI option. ${usage}`);
    options[key] = value;
  }
  if (!options.root || !options.manifest || !options.baseUrl) fail(usage);
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length === 3 && ['--help', '-h'].includes(process.argv[2])) {
    process.stdout.write(`${usage}\nOffline and read-only. Dedicated bundle: <=20000 files, each <=25 MiB; JSON <=5 MiB; total scan/read <=8 GiB.\nRequires safe directory-descriptor access (/proc/self/fd or /dev/fd) and no-follow opens.\nNo publication, public-access, CORS, browser or comprehensive secret-scan proof.\n`);
  } else {
    try {
      const result = await checkPreviewResources(parsePreflightArgs(process.argv.slice(2)));
      process.stdout.write(`Offline local readiness passed: ${result.datasets} datasets, ${result.files} regular files, ${result.bundleBytes} bundle bytes, ${result.readBytes} bytes read.\n${result.notice}\n`);
    } catch (error) {
      process.stderr.write(`Offline resource preflight failed: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
