import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdtemp, writeFile, readFile, readdir, lstat, open, mkdir, symlink, rm} from 'node:fs/promises';
import {join, basename, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {packPreviewXYZ, parsePackArgs, MAX_SOURCE_BYTES, MAX_CHUNK_BYTES, MAX_CHUNKS} from '../scripts/pack-preview-xyz.mjs';

const execute = promisify(execFile);
const baseUrl = 'https://public.example.test/synthetic/';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'online-preview-pack-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  return {root, input: join(root, 'synthetic.xyz'), output: join(root, 'packed')};
}

async function assertNoPack(root, output) {
  await assert.rejects(lstat(output), {code: 'ENOENT'});
  assert.equal((await readdir(root)).filter(name => name.startsWith('.preview-xyz-pack-')).length, 0);
}

async function packedBytes(result) {
  return Buffer.concat(await Promise.all(result.manifest.datasets[0].chunks.map(chunk => readFile(join(result.outputDirectory, basename(new URL(chunk.url).pathname))))));
}

async function fileHash(path) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

test('offline pack preserves BOM, Unicode comments/header, CRLF, attributes and final non-newline bytes exactly', async t => {
  const paths = await fixture(t);
  const source = Buffer.from('\uFEFF# 合成点云 😀\r\n// z x y intensity 温度\r\n3 1 2 .25 7 # 第一行\r\n6 4 5 NaN 9');
  await writeFile(paths.input, source);
  const result = await packPreviewXYZ({...paths, baseUrl, id: 'synthetic', name: '合成点云', chunkBytes: 48});
  assert.deepEqual(await packedBytes(result), source);
  const [dataset] = result.manifest.datasets;
  assert.equal(result.manifest.schemaVersion, 2);
  assert.equal(dataset.id, 'synthetic'); assert.equal(dataset.name, '合成点云');
  assert.equal(dataset.viewer, 'pointcloud'); assert.equal(dataset.format, 'xyz');
  assert.equal(dataset.bytes, source.length); assert.equal(dataset.sha256, sha256(source));
  assert.equal(Object.hasOwn(dataset, 'url'), false);
  assert(dataset.chunks.length > 1);
  for (const [index, chunk] of dataset.chunks.entries()) {
    assert.deepEqual(Object.keys(chunk).sort(), ['bytes', 'sha256', 'url']);
    assert.equal(chunk.url, `${baseUrl}part-${String(index + 1).padStart(4, '0')}.xyz`);
    const bytes = await readFile(join(paths.output, basename(new URL(chunk.url).pathname)));
    assert.equal(chunk.bytes, bytes.length); assert.equal(chunk.sha256, sha256(bytes));
    assert(bytes.length <= 48);
    if (index < dataset.chunks.length - 1) assert.equal(bytes.at(-1), 10);
  }
  assert.deepEqual(JSON.parse(await readFile(result.manifestPath, 'utf8')), result.manifest);
  assert.equal((await readdir(paths.root)).filter(name => name.startsWith('.preview-xyz-pack-')).length, 0);
});

test('26 MiB synthetic XYZ streams into <=16 MiB ordered chunks with exact whole-source SHA and bytes', async t => {
  const paths = await fixture(t), targetBytes = 26 * 1024 * 1024;
  const handle = await open(paths.input, 'wx');
  const header = Buffer.from('\uFEFF# Synthetic test only: 合成数据\r\n// x y z intensity\r\n');
  let bytes = header.length, row = 0;
  try {
    await handle.writeFile(header);
    while (bytes < targetBytes) {
      const lines = [];
      for (let index = 0; index < 2000; index++, row++) lines.push(`${row} ${row + 1} ${-row} .25 # synthetic-${row} 合成 ${'a'.repeat(80)}\r\n`);
      const block = Buffer.from(lines.join(''));
      await handle.writeFile(block); bytes += block.length;
    }
    const last = Buffer.from(`${row} 1 2 .75 # 最后一行`);
    await handle.writeFile(last); bytes += last.length;
  } finally { await handle.close(); }
  assert(bytes >= targetBytes && bytes < 27 * 1024 * 1024);
  const result = await packPreviewXYZ({...paths, baseUrl});
  const [dataset] = result.manifest.datasets;
  assert.equal(dataset.bytes, bytes); assert.equal(dataset.sha256, await fileHash(paths.input));
  assert.equal(dataset.chunks.length, 2);
  const concatenated = createHash('sha256'), input = await open(paths.input, 'r');
  let offset = 0;
  try {
    for (const [index, chunk] of dataset.chunks.entries()) {
      assert(chunk.bytes > 0 && chunk.bytes <= MAX_CHUNK_BYTES);
      assert.equal(chunk.url, `${baseUrl}part-${String(index + 1).padStart(4, '0')}.xyz`);
      const path = join(paths.output, basename(new URL(chunk.url).pathname));
      const partHash = createHash('sha256');
      let read = 0, lastByte;
      for await (const block of createReadStream(path)) {
        const expected = Buffer.alloc(block.length);
        assert.equal((await input.read(expected, 0, expected.length, offset)).bytesRead, expected.length);
        assert.deepEqual(block, expected, 'Chunk byte order must match the original source');
        concatenated.update(block); partHash.update(block); offset += block.length; read += block.length; lastByte = block.at(-1);
      }
      assert.equal(read, chunk.bytes); assert.equal(partHash.digest('hex'), chunk.sha256);
      if (index < dataset.chunks.length - 1) assert.equal(lastByte, 10);
    }
  } finally { await input.close(); }
  assert.equal(offset, bytes); assert.equal(concatenated.digest('hex'), dataset.sha256);
});

test('chunk boundary includes an entire CRLF and handles exact-size lines and trailing newline', async t => {
  const paths = await fixture(t);
  for (const [index, source, limit] of [
    [0, '1 2 3\r\n4 5 6\r\n', 7],
    [1, '1 2 3\n4 5 6\n7 8 9', 12],
    [2, '1 2 3', 5],
  ]) {
    await writeFile(paths.input, source);
    const result = await packPreviewXYZ({...paths, output: `${paths.output}-${index}`, baseUrl, chunkBytes: limit});
    assert.deepEqual(await packedBytes(result), Buffer.from(source));
    assert(result.manifest.datasets[0].chunks.every(chunk => chunk.bytes <= limit));
  }
});

test('UTF-8 multibyte character and CRLF crossing parser slice boundaries retain exact bytes', async t => {
  const paths = await fixture(t), readBytes = 1024 * 1024;
  for (const [index, source] of [
    [0, '\uFEFF#' + ' '.repeat(readBytes - 5) + '中\r\n1 2 3\r\n4 5 6'],
    [1, '#' + ' '.repeat(readBytes - 2) + '\r\n1 2 3\r\n4 5 6'],
  ]) {
    await writeFile(paths.input, source);
    const result = await packPreviewXYZ({...paths, output: `${paths.output}-${index}`, baseUrl});
    assert.deepEqual(await packedBytes(result), Buffer.from(source));
  }
});

test('existing XYZ parser supports reordered named columns, commas, semicolons and extra scalar columns', async t => {
  const paths = await fixture(t);
  for (const [index, source] of [
    [0, '"z","x","y","intensity"\r\n"3","1","2",".5"\r\n6,4,5,1'],
    [1, 'x;y;z;intensity\n1;2;3;.25\n4;5;6;.75'],
    [2, '// x y z r g b\n0 0 0 255 0 0 # first\n1 1 1 0 0 255'],
    [3, '0 0 0 1 2 3 4\n1 2 3 4 5 6 7'],
  ]) {
    await writeFile(paths.input, source);
    const result = await packPreviewXYZ({...paths, output: `${paths.output}-${index}`, baseUrl});
    assert.deepEqual(await packedBytes(result), Buffer.from(source));
  }
});

test('reject invalid UTF-8 including truncated multibyte sequences rather than replacing bytes', async t => {
  const paths = await fixture(t);
  for (const invalid of [
    Buffer.from([0xff]), Buffer.from([0xc0, 0xaf]), Buffer.from([0xed, 0xa0, 0x80]), Buffer.from([0xe4, 0xb8]),
  ]) {
    await writeFile(paths.input, Buffer.concat([Buffer.from('1 2 3\n# '), invalid]));
    await assert.rejects(packPreviewXYZ({...paths, baseUrl}), /valid UTF-8/);
    await assertNoPack(paths.root, paths.output);
  }
});

test('malformed XYZ, empty/comment-only inputs and invalid unsampled rows never publish', async t => {
  const paths = await fixture(t);
  for (const source of ['', '# comment\r\n', '1 2\n', 'x y q\n1 2 3', '0 0 0\n1 NaN 2\n3 3 3', '0 0 0 1\n1 2 3\n3 3 3 1']) {
    await writeFile(paths.input, source);
    await assert.rejects(packPreviewXYZ({...paths, baseUrl}));
    await assertNoPack(paths.root, paths.output);
  }
});

test('reject overlong lines and too many chunks, even when source remains below 64 MiB', async t => {
  const paths = await fixture(t);
  for (const source of ['1 2 3\n', '1 2 3']) {
    await writeFile(paths.input, source);
    await assert.rejects(packPreviewXYZ({...paths, baseUrl, chunkBytes: 4}), /line exceeds the chunk byte limit/);
    await assertNoPack(paths.root, paths.output);
  }
  await writeFile(paths.input, '#' + ' '.repeat(1024 * 1024) + '\n1 2 3');
  await assert.rejects(packPreviewXYZ({...paths, baseUrl}), /1,048,576|过长|字符/);
  await assertNoPack(paths.root, paths.output);
  await writeFile(paths.input, '1 2 3\n'.repeat(MAX_CHUNKS + 1));
  await assert.rejects(packPreviewXYZ({...paths, baseUrl, chunkBytes: 6}), /more than 64 chunks/);
  await assertNoPack(paths.root, paths.output);
  await writeFile(paths.input, '1 2 3\n'.repeat(MAX_CHUNKS));
  assert.equal((await packPreviewXYZ({...paths, baseUrl, chunkBytes: 6})).manifest.datasets[0].chunks.length, MAX_CHUNKS);
});

test('reject renamed PLY/PCD rather than pretending their raw bytes are XYZ', async t => {
  const paths = await fixture(t);
  for (const source of ['ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n1 2 3\n', 'VERSION .7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nWIDTH 1\nHEIGHT 1\nPOINTS 1\nDATA ascii\n1 2 3\n']) {
    await writeFile(paths.input, source);
    await assert.rejects(packPreviewXYZ({...paths, baseUrl}), /not a PLY or PCD/);
    await assertNoPack(paths.root, paths.output);
  }
});

test('reject sources above 64 MiB before allocating or publishing, without weakening fixed caps', async t => {
  const paths = await fixture(t), handle = await open(paths.input, 'wx');
  try { await handle.truncate(MAX_SOURCE_BYTES + 1); } finally { await handle.close(); }
  await assert.rejects(packPreviewXYZ({...paths, baseUrl}), /64 MiB/);
  await assertNoPack(paths.root, paths.output);
  assert.equal(MAX_SOURCE_BYTES, 64 * 1024 * 1024); assert.equal(MAX_CHUNK_BYTES, 16 * 1024 * 1024); assert.equal(MAX_CHUNKS, 64);
  for (const chunkBytes of [0, -1, 1.5, Infinity, NaN, MAX_CHUNK_BYTES + 1]) await assert.rejects(packPreviewXYZ({...paths, baseUrl, chunkBytes}), /Chunk byte limit/);
});

test('reject symlink, nonregular and non-XYZ input; never alter their targets', async t => {
  const paths = await fixture(t), target = join(paths.root, 'target.xyz');
  await writeFile(target, '1 2 3');
  await symlink(target, paths.input);
  await assert.rejects(packPreviewXYZ({...paths, baseUrl}), /regular file/);
  assert.equal(await readFile(target, 'utf8'), '1 2 3');
  await assertNoPack(paths.root, paths.output);
  const directory = join(paths.root, 'directory.xyz'); await mkdir(directory);
  await assert.rejects(packPreviewXYZ({...paths, input: directory, baseUrl}), /regular file/);
  await assert.rejects(packPreviewXYZ({...paths, input: target.replace(/xyz$/, 'txt'), baseUrl}), /local .xyz/);
});

test('existing output file, empty directory, populated directory and symlink are never overwritten', async t => {
  const paths = await fixture(t);
  await writeFile(paths.input, '1 2 3');
  const file = `${paths.output}-file`, directory = `${paths.output}-directory`, linked = `${paths.output}-symlink`;
  await writeFile(file, 'keep'); await mkdir(directory); await symlink(directory, linked);
  for (const output of [file, directory, linked]) await assert.rejects(packPreviewXYZ({...paths, output, baseUrl}), /already exists/);
  assert.equal(await readFile(file, 'utf8'), 'keep'); assert.deepEqual(await readdir(directory), []);
  await writeFile(join(directory, 'keep.txt'), 'keep');
  await assert.rejects(packPreviewXYZ({...paths, output: directory, baseUrl}), /already exists/);
  assert.equal(await readFile(join(directory, 'keep.txt'), 'utf8'), 'keep');
  assert((await lstat(linked)).isSymbolicLink());
  await assertNoPack(paths.root, paths.output);
});

test('two concurrent packs reserve a destination exclusively without replacing the winner', async t => {
  const paths = await fixture(t); await writeFile(paths.input, '1 2 3\n4 5 6');
  const results = await Promise.allSettled([packPreviewXYZ({...paths, baseUrl, id: 'first'}), packPreviewXYZ({...paths, baseUrl, id: 'second'})]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.message, /already exists/);
  const winner = results.find(result => result.status === 'fulfilled').value;
  assert.deepEqual(JSON.parse(await readFile(winner.manifestPath, 'utf8')), winner.manifest);
  assert.deepEqual(await packedBytes(winner), await readFile(paths.input));
  assert.equal((await readdir(paths.root)).filter(name => name.startsWith('.preview-xyz-pack-')).length, 0);
});

test('public base URL validation rejects private addresses, credentials, secrets, fragments and non-directory URLs', async t => {
  const paths = await fixture(t); await writeFile(paths.input, '1 2 3');
  for (const url of ['http://public.example/path/', 'https://localhost/path/', 'https://127.0.0.1/path/', 'https://192.168.1.1/path/', 'https://[::1]/path/', 'https://u:p@public.example/path/', 'https://public.example/path/?token=secret', 'https://public.example/path/#part', 'https://public.example/path/?v=2', 'https://public.example/path', 'https://drive.google.com/file/d/synthetic/view']) {
    await assert.rejects(packPreviewXYZ({...paths, baseUrl: url}));
    await assertNoPack(paths.root, paths.output);
  }
  for (const extra of [{id: ''}, {id: 'a'.repeat(257)}, {name: 'a\nb'}, {name: 'a'.repeat(513)}]) await assert.rejects(packPreviewXYZ({...paths, baseUrl, ...extra}), /non-empty text/);
});

test('CLI accepts only explicit documented options and creates a self-contained offline manifest', async t => {
  const paths = await fixture(t); await writeFile(paths.input, 'x y z intensity\n1 2 3 .25\n4 5 6 .5');
  const script = resolve('scripts/pack-preview-xyz.mjs');
  const {stdout} = await execute(process.execPath, [script, '--input', paths.input, '--output', paths.output, '--base-url', baseUrl, '--id', 'cli', '--name', 'Synthetic CLI']);
  assert.match(stdout, /No files were uploaded/);
  const manifest = JSON.parse(await readFile(join(paths.output, 'manifest.json'), 'utf8'));
  assert.equal(manifest.datasets[0].id, 'cli'); assert.equal(manifest.datasets[0].name, 'Synthetic CLI');
  assert.equal(manifest.datasets[0].sha256, sha256(await readFile(paths.input)));
  for (const args of [[], ['--input'], ['--input', 'a.xyz', '--input', 'b.xyz'], ['--chunk-bytes', '999999999'], ['--upload', 'yes']]) assert.throws(() => parsePackArgs(args), /Usage:/);
  assert.match((await execute(process.execPath, [script, '--help'])).stdout, /Offline only/);
  await assert.rejects(execute(process.execPath, [script, '--input', paths.input, '--output', paths.output, '--base-url', baseUrl]), error => error.code === 1 && /already exists/.test(error.stderr));
});
