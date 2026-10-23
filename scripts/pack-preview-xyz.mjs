#!/usr/bin/env node
/**
 * Offline, lossless XYZ packer. No network requests or uploads are made.
 *
 * node scripts/pack-preview-xyz.mjs --input source.xyz --output NEW_DIRECTORY \
 *   --base-url https://public.example/path/ [--id dataset] [--name "Dataset name"]
 *
 * The existing point reader validates every row while retaining only one sampled
 * point. Its sequential 1 MiB file slices also feed a fatal UTF-8 decoder and a
 * raw-byte line-aligned writer: numeric values, order, BOM, CRLF, comments and a
 * missing final newline are never rewritten. Working buffers are bounded, not a
 * full-source Blob/string. Sources are limited to 64 MiB, chunks to 16 MiB / 64.
 *
 * A temporary sibling is staged first. The destination is reserved with exclusive
 * mkdir, then files are linked exclusively and manifest.json is published last.
 * The manifest is the completion marker; the directory itself is not an atomic
 * rename, because POSIX rename can overwrite somebody else's empty directory.
 * Failure cleanup removes only this invocation's staging and unchanged links.
 */
import {constants} from 'node:fs';
import {lstat, open, mkdtemp, mkdir, link, unlink, rmdir, rm, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename, dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {normalizePublicUrl} from '../src/shared/online-preview-core.js';
import {readPointCloud} from '../src/cloud/point-io.js';

export const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
export const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
export const MAX_CHUNKS = 64;
const READ_BYTES = 1024 * 1024;
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;

function label(value, name, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${name} must be non-empty text (maximum ${maximum} characters)`);
  }
  return value;
}

function directoryUrl(value) {
  const url = new URL(normalizePublicUrl(value));
  if (!url.pathname.endsWith('/') || url.search) throw new Error('Base URL must be an HTTPS directory ending in /, without a query');
  return url.href;
}

async function absent(path) {
  try { await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('Output path already exists; choose a new directory');
}

async function readExactly(handle, start, size) {
  const bytes = new Uint8Array(size);
  let loaded = 0;
  while (loaded < size) {
    const result = await handle.read(bytes, loaded, size - loaded, start + loaded);
    if (!result.bytesRead) throw new Error('Input changed or was truncated while reading');
    loaded += result.bytesRead;
  }
  return bytes;
}

function chunkWriter(directory, baseUrl, limit) {
  const chunks = [], filenames = [], urls = new Set();
  let pending = Buffer.alloc(0), current = null, currentHash = null, currentBytes = 0, currentName = '';
  async function write(bytes) {
    if (!bytes.length) return;
    if (!current) {
      if (chunks.length >= MAX_CHUNKS) throw new Error(`Input requires more than ${MAX_CHUNKS} chunks`);
      currentName = `part-${String(chunks.length + 1).padStart(4, '0')}.xyz`;
      current = await open(join(directory, currentName), 'wx', 0o600);
      currentHash = createHash('sha256');
    }
    await current.writeFile(bytes);
    currentHash.update(bytes);
  }
  async function finishChunk() {
    if (!current) return;
    await current.close(); current = null;
    const url = normalizePublicUrl(new URL(currentName, baseUrl).href);
    if (urls.has(url)) throw new Error('Duplicate chunk URL');
    urls.add(url);
    filenames.push(currentName);
    chunks.push({url, bytes: currentBytes, sha256: currentHash.digest('hex')});
    currentBytes = 0;
  }
  return {
    chunks, filenames,
    async consume(bytes) {
      const block = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const combined = pending.length ? Buffer.concat([pending, block]) : block;
      let lineStart = 0, runStart = 0;
      for (let newline = combined.indexOf(10); newline >= 0; newline = combined.indexOf(10, lineStart)) {
        const end = newline + 1, lineBytes = end - lineStart;
        if (lineBytes > limit) throw new Error('A source line exceeds the chunk byte limit; lines cannot be split');
        if (currentBytes + lineBytes > limit) {
          await write(combined.subarray(runStart, lineStart));
          await finishChunk();
          runStart = lineStart;
        }
        currentBytes += lineBytes;
        lineStart = end;
      }
      await write(combined.subarray(runStart, lineStart));
      pending = combined.subarray(lineStart);
      if (pending.length > limit) throw new Error('A source line exceeds the chunk byte limit; lines cannot be split');
    },
    async finish() {
      if (pending.length) {
        if (currentBytes + pending.length > limit) await finishChunk();
        currentBytes += pending.length;
        await write(pending);
        pending = Buffer.alloc(0);
      }
      await finishChunk();
      if (!chunks.length) throw new Error('Input XYZ file is empty');
    },
    async close() { if (current) { await current.close(); current = null; } },
  };
}

async function cleanupPublished(output, directoryStat, published) {
  // Never recursively remove the final directory: another process may have added
  // a file, replaced a link, or taken over the path after it was reserved.
  let actual;
  try { actual = await lstat(output); } catch { return; }
  if (!sameFile(actual, directoryStat) || !actual.isDirectory()) return;
  for (const {name, stat} of published.reverse()) {
    const path = join(output, name);
    try { if (sameFile(await lstat(path), stat)) await unlink(path); } catch {}
  }
  try { if (sameFile(await lstat(output), directoryStat)) await rmdir(output); } catch {}
}

/** chunkBytes is a bounded test seam, not a CLI option or a way to raise limits. */
export async function packPreviewXYZ({input, output, baseUrl, id, name, chunkBytes = MAX_CHUNK_BYTES} = {}) {
  if (typeof input !== 'string' || !input || typeof output !== 'string' || !output) throw new Error('Explicit --input and --output local paths are required');
  if (!/\.xyz$/i.test(input)) throw new Error('Input must be an explicit local .xyz file');
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > MAX_CHUNK_BYTES) throw new Error('Chunk byte limit must be between 1 byte and 16 MiB');
  const source = resolve(input), destination = resolve(output), publicBase = directoryUrl(baseUrl);
  const datasetId = label(id ?? basename(source).replace(/\.xyz$/i, ''), 'Dataset ID', 256);
  const datasetName = label(name ?? basename(source), 'Dataset name', 512);
  const sourceStat = await lstat(source);
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) throw new Error('Input must be a regular file, not a symlink or directory');
  if (!Number.isSafeInteger(sourceStat.size) || sourceStat.size < 1 || sourceStat.size > MAX_SOURCE_BYTES) throw new Error('Input must contain between 1 byte and 64 MiB');
  await absent(destination);

  let handle, staging, writer, reservedStat;
  const published = [];
  try {
    handle = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const openedStat = await handle.stat();
    if (!openedStat.isFile() || !sameFile(sourceStat, openedStat) || openedStat.size !== sourceStat.size) throw new Error('Input changed before it could be opened safely');
    staging = await mkdtemp(join(dirname(destination), '.preview-xyz-pack-'));
    writer = chunkWriter(staging, publicBase, chunkBytes);
    const decoder = new TextDecoder('utf-8', {fatal: true}), sourceHash = createHash('sha256');
    let offset = 0;
    const file = {
      name: basename(source), size: openedStat.size,
      slice(start, end) {
        return {async arrayBuffer() {
          if (start !== offset || !Number.isSafeInteger(end) || end <= start || end > openedStat.size || end - start > READ_BYTES) throw new Error('Only bounded, sequential text XYZ reads are supported');
          const bytes = await readExactly(handle, start, end - start);
          try {
            decoder.decode(bytes, {stream: true});
            if (end === openedStat.size) decoder.decode();
          } catch { throw new Error('Input must be valid UTF-8; invalid or truncated byte sequences are not accepted'); }
          if (start === 0) {
            const prefix = new TextDecoder().decode(bytes.subarray(0, 256)).replace(/^\uFEFF/, '');
            if (/^ply\r?\n/.test(prefix) || /^#.*\.PCD/i.test(prefix) || /^VERSION\s+\.7/m.test(prefix)) throw new Error('Input must contain text XYZ, not a PLY or PCD file renamed to .xyz');
          }
          await writer.consume(bytes);
          sourceHash.update(bytes);
          offset = end;
          return bytes.buffer;
        }};
      },
    };
    // maxPoints only bounds retained sample storage: the parser still checks all
    // rows, attributes and line lengths, including rows absent from the sample.
    await readPointCloud(file, {maxPoints: 1});
    if (offset !== openedStat.size) throw new Error('Input was not completely validated');
    const after = await handle.stat();
    if (after.size !== openedStat.size || after.mtimeMs !== openedStat.mtimeMs || after.ctimeMs !== openedStat.ctimeMs) throw new Error('Input changed while packing; retry with an unchanged source');
    await writer.finish();
    await handle.close(); handle = null;
    const manifest = {schemaVersion: 2, datasets: [{id: datasetId, name: datasetName, viewer: 'pointcloud', format: 'xyz', bytes: offset, sha256: sourceHash.digest('hex'), chunks: writer.chunks}]};
    await writeFile(join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {flag: 'wx', mode: 0o600});
    // mkdir is the final no-overwrite gate even if another process won a race
    // after the preliminary absent() check. Existing paths are never deleted.
    await mkdir(destination, {mode: 0o700});
    reservedStat = await lstat(destination);
    for (const filename of [...writer.filenames, 'manifest.json']) {
      if (!sameFile(await lstat(destination), reservedStat)) throw new Error('Output directory changed during publication');
      const path = join(staging, filename), stat = await lstat(path);
      await link(path, join(destination, filename));
      published.push({name: filename, stat});
    }
    return {manifest, outputDirectory: destination, manifestPath: join(destination, 'manifest.json')};
  } catch (error) {
    if (reservedStat) await cleanupPublished(destination, reservedStat, published);
    if (error.code === 'EEXIST') throw new Error('Output path already exists; nothing was overwritten', {cause: error});
    throw error;
  } finally {
    try {
      if (handle) await handle.close();
    } finally {
      try {
        if (writer) await writer.close();
      } finally {
        if (staging) await rm(staging, {recursive: true, force: true});
      }
    }
  }
}

const usage = 'Usage: node scripts/pack-preview-xyz.mjs --input FILE.xyz --output NEW_DIRECTORY --base-url https://public.example/path/ [--id dataset] [--name "Dataset name"]';
export function parsePackArgs(argv) {
  const options = {}, names = new Map([['--input', 'input'], ['--output', 'output'], ['--base-url', 'baseUrl'], ['--id', 'id'], ['--name', 'name']]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = names.get(argv[index]), value = argv[index + 1];
    if (!key || value === undefined || value.startsWith('--') || Object.hasOwn(options, key)) throw new Error(`Invalid or duplicate CLI option. ${usage}`);
    options[key] = value;
  }
  if (!options.input || !options.output || !options.baseUrl) throw new Error(usage);
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length === 3 && ['--help', '-h'].includes(process.argv[2])) {
    process.stdout.write(`${usage}\nOffline only. Existing output paths are never overwritten. manifest.json marks completion.\n`);
  } else {
    try {
      const result = await packPreviewXYZ(parsePackArgs(process.argv.slice(2)));
      process.stdout.write(`Packed ${result.manifest.datasets[0].bytes} bytes into ${result.manifest.datasets[0].chunks.length} chunks.\nManifest: ${result.manifestPath}\nNo files were uploaded.\n`);
    } catch (error) {
      process.stderr.write(`XYZ pack failed: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
