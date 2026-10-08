// Run from the project directory: node point-io.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('./point-io.js', import.meta.url), 'utf8');
const {parsePointCloud, readPointCloud, samplePointCloud, parseWireOBJ} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const bytes = text => new TextEncoder().encode(text);
const cloud = (text, name = 'sample.xyz', options) => parsePointCloud(bytes(text), name, options);
let checks = 0;
function check(name, work) { work(); checks++; console.log('PASS', name); }

check('OBJ polyline / negative index / face fallback', () => {
  const vertices = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\n';
  assert.deepEqual(parseWireOBJ(vertices + 'l -4 -3 -2\nl 2 1').edges, [[0, 1], [1, 2]]);
  assert.equal(parseWireOBJ(vertices + 'f 1 2 3 4').edges.length, 4);
  assert.equal(parseWireOBJ(vertices + 'l 1 2\nf 1 2 3 4').edges.length, 1);
  for (const text of ['not an OBJ', 'v NaN 0 0\nl 1 1', vertices + 'l 0 1', vertices + 'l 1 5', vertices + 'l -5 -1', 'l 1 2']) assert.throws(() => parseWireOBJ(text));
});
check('Empty wireframes are explicit, malformed and degenerate geometry still fails', () => {
  for (const text of ['', '# empty line prediction\n', 'o empty\ng group\n', 'v 1 2 3\n']) {
    const parsed = parseWireOBJ(text, 'empty.obj');
    assert.equal(parsed.id, 'empty.obj'); assert.equal(parsed.empty, true);
    assert.deepEqual(parsed.edges, []);
  }
  assert.equal(parseWireOBJ('').bounds, null);
  assert.throws(() => parseWireOBJ('v 0 0 0\nl 1 1'), /退化/);
});
check('Double precision and unknown columns remain independent attributes', () => {
  const value = cloud('832129.50060046 816457.03489984 17.94589928 0.58543605\n832129.37269985 816457.06679993 17.43709992 0.54385465', 'pc.xyz');
  assert(value.positions instanceof Float64Array);
  assert.equal(value.positions[0], 832129.50060046);
  assert.equal(value.count, 2); assert.equal(value.totalCount, 2);
  assert(value.fields.column_4 instanceof Float32Array); assert.equal(value.rgb, null);
  const six = cloud('1 2 3 255 0 0'); assert.equal(six.rgb, null); assert.equal(six.fields.column_6[0], 0);
});
check('CSV header / comments / reordered XYZ / named colors', () => {
  const value = cloud('z,x,y,intensity,r,g,b\n3,1,2,0.4,255,128,0\n6,4,5,0.9,0,0,255', 'color.csv');
  assert.deepEqual([...value.positions], [1, 2, 3, 4, 5, 6]);
  assert.equal(value.rgb[0], 1); assert.equal(value.rgb[2], 0);
  assert.equal(value.fields.intensity.length, 2);
  const unit = cloud('# x y z r g b\n1 2 3 0.5 0.25 1'); assert.deepEqual([...unit.rgb], [0.5, 0.25, 1]);
  assert.deepEqual([...cloud('"x","y","z"\n"1","2","3"', 'quoted.csv').positions], [1, 2, 3]);
  assert.throws(() => cloud('1,,2,3', 'missing.csv'));
});
check('PTS count and deterministic reservoir / full bounds include unsampled extremes', () => {
  const value = cloud('5\n0 0 0\n1 100 0\n2 2 0\n3 3 0\n4 4 0', 'points.pts', {maxPoints: 3});
  assert.equal(value.count, 3); assert.equal(value.totalCount, 5);
  assert.equal(new Set(value.sampleIndices).size, 3);
  const original = [[0, 0, 0], [1, 100, 0], [2, 2, 0], [3, 3, 0], [4, 4, 0]];
  assert.deepEqual([...value.positions], [...value.sampleIndices].flatMap(index => original[index]));
  assert.deepEqual(value, cloud('5\n0 0 0\n1 100 0\n2 2 0\n3 3 0\n4 4 0', 'points.pts', {maxPoints: 3}));
  assert.deepEqual(value.bounds, [[0, 0, 0], [4, 100, 0]]);
  for (const field of Object.values(value.fields)) assert.equal(field.length, 3);
  assert(value.notes.some(note => note.includes('全部原始点')));
  assert.throws(() => cloud('2\n0 0 0', 'broken.pts'));
});
check('Text single pass preserves comments, final lines and invalid unsampled rows', () => {
  const value = cloud('\uFEFF# header\r\n# z x y strength\r\n3 1 2 4 # first\r\n\r\n// skipped\r\n6 4 5 7', 'sample.xyz', {maxPoints: 1});
  assert.equal(value.totalCount, 2);
  assert.deepEqual([...value.positions], value.sampleIndices[0] === 0 ? [1, 2, 3] : [4, 5, 6]);
  assert.deepEqual(value.bounds, [[1, 2, 3], [4, 5, 6]]);
  assert.throws(() => cloud('0 0 0\n1 NaN 2\n3 3 3', 'bad.xyz', {maxPoints: 2}), /第 2 行/);
  assert.throws(() => cloud('0 0 0\n1 2\n3 3 3', 'bad.xyz', {maxPoints: 2}), /数量不一致/);
});
check('PLY ASCII list faces and properties', () => {
  const value = cloud('ply\nformat ascii 1.0\nelement vertex 2\nproperty double x\nproperty double y\nproperty double z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n1000000.0001 2 3 1 0 0\n4 5 6 0 255 0\n3 0 1 0\n', 'mesh.ply');
  assert.equal(value.positions[0], 1000000.0001); assert.equal(value.rgb[0], Math.fround(1 / 255)); assert.equal(value.rgb[4], 1);
});
function binaryPLY(little) {
  const header = bytes(`ply\nformat binary_${little ? 'little' : 'big'}_endian 1.0\nelement vertex 2\nproperty double x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`);
  const result = new Uint8Array(header.length + 38); result.set(header); const view = new DataView(result.buffer);
  for (let i = 0; i < 2; i++) { const at = header.length + 19 * i; view.setFloat64(at, 832000.12345678 + i, little); view.setFloat32(at + 8, 2 + i, little); view.setFloat32(at + 12, 3 + i, little); result.set([255, 128, 0], at + 16); }
  return result;
}
for (const little of [true, false]) check(`PLY binary ${little ? 'little' : 'big'} endian`, () => {
  const input = binaryPLY(little), value = parsePointCloud(input, 'binary.ply');
  assert.equal(value.positions[0], 832000.12345678); assert.equal(value.positions[3], 832001.12345678); assert.equal(value.rgb[0], 1);
  assert.throws(() => parsePointCloud(input.subarray(0, input.length - 1), 'broken.ply'));
});
check('PCD ASCII scalar + COUNT vector + packed RGB float', () => {
  const colorBuffer = new ArrayBuffer(4); const dv = new DataView(colorBuffer); dv.setUint32(0, 0x00ff8000, true); const encoded = dv.getFloat32(0, true);
  const value = cloud(`VERSION .7\nFIELDS x y z intensity rgb normal\nSIZE 4 4 4 4 4 4\nTYPE F F F F F F\nCOUNT 1 1 1 1 1 3\nWIDTH 1\nHEIGHT 1\nPOINTS 1\nDATA ascii\n1 2 3 0.4 ${encoded} 0 0 1\n`, 'sample.pcd');
  assert.equal(value.rgb[0], 1); assert.equal(value.rgb[1], Math.fround(128 / 255)); assert.equal(value.fields.normal_3[0], 1);
});
check('PCD binary float64 coordinates / uint32 rgba', () => {
  const header = bytes('VERSION .7\nFIELDS x y z rgba\nSIZE 8 4 4 4\nTYPE F F F U\nWIDTH 1\nHEIGHT 1\nPOINTS 1\nDATA binary\n');
  const input = new Uint8Array(header.length + 20); input.set(header); const view = new DataView(input.buffer);
  view.setFloat64(header.length, 832000.12345678, true); view.setFloat32(header.length + 8, 2, true); view.setFloat32(header.length + 12, 3, true); view.setUint32(header.length + 16, 0xffff8000, true);
  const value = parsePointCloud(input, 'sample.pcd'); assert.equal(value.positions[0], 832000.12345678); assert.equal(value.rgb[0], 1); assert.equal(value.rgb[1], Math.fround(128 / 255));
});
check('Malformed inputs and unsupported compression fail explicitly', () => {
  for (const text of ['', '1 2', '1 2 Infinity', '1 2 3\n4 5', 'x y z x\n1 2 3 4']) assert.throws(() => cloud(text));
  for (const maxPoints of [-1, .5, Infinity, NaN]) assert.throws(() => cloud('1 2 3', 'sample.xyz', {maxPoints}));
  assert.throws(() => cloud('VERSION .7\nDATA binary_compressed\n', 'sample.pcd'), /binary_compressed/);
  assert.throws(() => cloud('anything', 'sample.laz'), /LAS\/LAZ/);
});

async function checkAsync(name, work) { await work(); checks++; console.log('PASS', name); }
const chunkBytes = 1024 * 1024;
function blobFile(input, name = 'points.txt', {wholeRead = false} = {}) {
  const blob = new Blob([input]), reads = [];
  return {
    name, size: blob.size, reads,
    slice(start, end) { reads.push([start, end]); return blob.slice(start, end); },
    arrayBuffer() {
      assert(wholeRead, 'Text points must never request the entire file as an ArrayBuffer');
      return blob.arrayBuffer();
    },
  };
}
await checkAsync('Chunked TXT preserves UTF-8, BOM, CRLF, comments, attributes and progress', async () => {
  // Split a UTF-8 character and a CRLF across the 1 MiB boundary, respectively.
  for (const text of [
    '\uFEFF#' + ' '.repeat(chunkBytes - 5) + '中\r\n# z x y intensity\r\n3 1 2 .25\r\n6 4 5 .75',
    '#' + ' '.repeat(chunkBytes - 2) + '\r\n1 2 3 4\r\n5 6 7 8\r\n',
  ]) {
    const file = blobFile(text), progress = [];
    const value = await readPointCloud(file, {maxPoints: 1, onProgress: event => progress.push({...event})});
    assert.deepEqual(value, cloud(text, file.name, {maxPoints: 1}));
    assert(file.reads.every(([start, end], index) => end - start <= chunkBytes && start === (index ? file.reads[index - 1][1] : 0)));
    assert.equal(file.reads.at(-1)[1], file.size);
    assert(progress.every(event => event.phase === 'parse'), 'No counting/pre-scan progress');
    for (const phase of ['parse']) {
      const updates = progress.filter(item => item.phase === phase);
      assert(updates.length >= 2);
      assert.equal(updates.at(-1).loaded, file.size);
      assert(updates.every((item, i) => item.total === file.size && item.loaded >= 0 && item.loaded <= file.size && (!i || item.loaded >= updates[i - 1].loaded)));
    }
  }
});
await checkAsync('Numeric rows can cross chunks; full bounds include unsampled extremes', async () => {
  const prefix = '#' + ' '.repeat(chunkBytes - 9) + '\n';
  const text = prefix + '0 0 0 .25\n1 100 0 .5\n2 2 0 .75';
  const file = blobFile(text), value = await readPointCloud(file, {maxPoints: 2});
  assert.deepEqual(value, cloud(text, file.name, {maxPoints: 2}));
  assert.deepEqual(value.bounds, [[0, 0, 0], [2, 100, 0]]);
  assert.deepEqual([...value.fields.column_4], [...value.sampleIndices].map(index => [.25, .5, .75][index]));
});
await checkAsync('Streamed headers, CSV, PTS, empty inputs and invalid unsampled rows match sync parser', async () => {
  for (const [name, text] of [
    ['sample.pts', '3\n0 0 0 .1\n1 2 3 .2\n4 5 6 .3'],
    ['sample.csv', '"z","x","y","intensity"\r\n"3","1","2",".5"\r\n6,4,5,1'],
    ['sample.xyz', '// x y z r g b\n0 0 0 255 0 0 # first\n1 1 1 0 0 255'],
    ['sample.txt', 'x;y;z;intensity\n1;2;3;.25\n4;5;6;.75'],
  ]) assert.deepEqual(await readPointCloud(blobFile(text, name), {maxPoints: 1}), cloud(text, name, {maxPoints: 1}));
  for (const [text, pattern] of [
    ['', /空/], ['# comment\n \n', /空/],
    ['0 0 0 1\n1 NaN 2 1\n3 3 3 1', /第 2 行/],
    ['0 0 0 1\n1 2 3\n3 3 3 1', /数量不一致/],
  ]) await assert.rejects(readPointCloud(blobFile(text), {maxPoints: 2}), pattern);
  await assert.rejects(readPointCloud(blobFile('2\n0 0 0', 'broken.pts')), /PTS/);
  await assert.rejects(readPointCloud(blobFile('1 2 3'), {maxPoints: -1}), /maxPoints/);
  await assert.rejects(readPointCloud(blobFile('1 2 3', 'unsupported.laz')), /LAS\/LAZ/);
});
await checkAsync('Cancellation interrupts the only pass and does not continue reading', async () => {
  for (const phase of ['parse']) {
    const controller = new AbortController();
    const file = blobFile('1 2 3 .5\n'.repeat(250000));
    let readsAtAbort = null;
    await assert.rejects(readPointCloud(file, {maxPoints: 2, signal: controller.signal, onProgress(event) {
      if (event.phase === phase && event.loaded > 0 && event.loaded < event.total && readsAtAbort === null) {
        readsAtAbort = file.reads.length; controller.abort();
      }
    }}), {name: 'AbortError'});
    assert.notEqual(readsAtAbort, null);
    assert.equal(file.reads.length, readsAtAbort);
  }
  const controller = new AbortController(); controller.abort();
  const file = blobFile('1 2 3');
  await assert.rejects(readPointCloud(file, {signal: controller.signal}), {name: 'AbortError'});
  assert.equal(file.reads.length, 0);
});
await checkAsync('Read failures and overlong single lines are explicit, never called empty', async () => {
  let reads = 0;
  const first = bytes('0 0 0\n'.repeat(Math.ceil(chunkBytes / 6))).subarray(0, chunkBytes);
  const file = {name: 'unreadable.txt', size: chunkBytes + 1, slice() { return {arrayBuffer() {
    if (++reads === 1) return Promise.resolve(first.buffer.slice(first.byteOffset, first.byteOffset + first.byteLength));
    return Promise.reject(new Error('disk read failed'));
  }}; }};
  await assert.rejects(readPointCloud(file), /disk read failed/);
  await assert.rejects(readPointCloud(blobFile('1 '.repeat(1024 * 1024))), /单行|行.*超/);
});
await checkAsync('Blob reader retains PLY/PCD sniffing and binary compatibility', async () => {
  for (const input of [binaryPLY(true), binaryPLY(false)]) {
    assert.deepEqual(await readPointCloud(blobFile(input, 'misnamed.txt', {wholeRead: true})), parsePointCloud(input, 'misnamed.txt'));
  }
  const text = 'VERSION .7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nWIDTH 1\nHEIGHT 1\nPOINTS 1\nDATA ascii\n1 2 3 .5\n';
  assert.deepEqual(await readPointCloud(blobFile(text, 'sample.pcd', {wholeRead: true})), cloud(text, 'sample.pcd'));
});


check('Zero and default limits preserve all points beyond the previous implicit limit', () => {
  const total = 500003, value = cloud('1 2 3\n'.repeat(total));
  assert.equal(value.count, total); assert.equal(value.totalCount, total);
  assert.equal(value.positions.length, total * 3);
  assert.deepEqual(Array.from(value.positions.subarray(-3)), [1, 2, 3]);
  assert.equal(value.fields.x.length, total); assert.equal(value.fields.z.at(-1), 3);
  assert.equal(value.sampleIndices, undefined);
  assert.deepEqual(value.bounds, [[1, 2, 3], [1, 2, 3]]);
  for (const maxPoints of [0, 10]) assert.equal(cloud('1 2 3\n4 5 6', 'two.xyz', {maxPoints}).count, 2);
});
check('PLY and PCD zero limits mean all points', () => {
  assert.equal(parsePointCloud(binaryPLY(true), 'test.ply', {maxPoints: 0}).count, 2);
  const text = 'VERSION .7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nWIDTH 2\nHEIGHT 1\nPOINTS 2\nDATA ascii\n1 2 3\n4 5 6\n';
  assert.equal(cloud(text, 'test.pcd', {maxPoints: 0}).count, 2);
  assert.equal(cloud(text, 'test.pcd', {maxPoints: 1}).count, 1);
});
check('In-memory sampling reuses full data and preserves attributes, RGB and full bounds', () => {
  const rows = Array.from({length: 1200}, (_, i) => `${1000000 + i / 1000} ${i === 777 ? -9000 : i} ${i * 2} ${i / 1200} ${i % 256} ${255 - i % 256} 50`);
  const text = 'x y z intensity r g b\n' + rows.join('\n'), full = cloud(text);
  const before = full.positions.slice(), sampled = samplePointCloud(full, 73);
  assert.equal(samplePointCloud(full, 0), full);
  assert.equal(samplePointCloud(full, full.count), full);
  assert.equal(samplePointCloud(full, full.count + 100), full);
  assert.equal(sampled.count, 73); assert.equal(sampled.totalCount, full.totalCount);
  assert.deepEqual(sampled.bounds, full.bounds); assert.deepEqual(full.positions, before);
  assert.equal(new Set(sampled.sampleIndices).size, 73);
  assert(sampled.sampleIndices.every((value, i, all) => !i || value > all[i - 1]));
  for (let i = 0; i < sampled.count; i++) {
    const index = sampled.sampleIndices[i];
    assert.deepEqual(sampled.positions.slice(i * 3, i * 3 + 3), full.positions.slice(index * 3, index * 3 + 3));
    assert.deepEqual(sampled.rgb.slice(i * 3, i * 3 + 3), full.rgb.slice(index * 3, index * 3 + 3));
    for (const name of Object.keys(full.fields)) assert.equal(sampled.fields[name][i], full.fields[name][index]);
  }
  const direct = cloud(text, 'same.xyz', {maxPoints: 73});
  for (const key of ['positions', 'fields', 'rgb', 'sampleIndices', 'count', 'totalCount', 'bounds']) assert.deepEqual(sampled[key], direct[key], key);
  assert.deepEqual(samplePointCloud(full, 73), sampled);
  const smaller = samplePointCloud(sampled, 7);
  assert.equal(smaller.count, 7); assert.equal(smaller.totalCount, full.totalCount);
  assert([...smaller.sampleIndices].every(index => sampled.sampleIndices.includes(index)));
  assert.throws(() => samplePointCloud(full, -1), /maxPoints/);
});
check('Reservoir validates all rows and preserves RGB interpretation from unretained rows', () => {
  const rows = Array.from({length: 30}, (_, i) => `${i} 0 0 1 0 0`);
  const reference = cloud('x y z r g b\n' + rows.join('\n'), 'rgb.xyz', {maxPoints: 1});
  const unseen = (reference.sampleIndices[0] + 1) % 30;
  rows[unseen] = `${unseen} 0 0 255 0 0`;
  const value = cloud('x y z r g b\n' + rows.join('\n'), 'rgb.xyz', {maxPoints: 1});
  assert.equal(value.rgb[0], Math.fround(1 / 255));
  rows[unseen] = `${unseen} NaN 0 255 0 0`;
  assert.throws(() => cloud('x y z r g b\n' + rows.join('\n'), 'rgb.xyz', {maxPoints: 1}), /非有限/);
});
await checkAsync('Default streaming unlimited read visits every byte exactly once and has no counting pass', async () => {
  const rows = 40001, text = 'x y z intensity\n' + '1000000.123456 2000000.987654 3 .25\n'.repeat(rows);
  const file = blobFile(text), progress = [];
  const value = await readPointCloud(file, {onProgress: event => progress.push({...event})});
  assert.equal(value.count, rows); assert.equal(value.totalCount, rows);
  assert.equal(value.positions.at(-3), 1000000.123456); assert.equal(value.fields.intensity.at(-1), .25);
  let next = 0;
  for (const [start, end] of file.reads) { assert.equal(start, next); assert(end - start <= chunkBytes); next = end; }
  assert.equal(next, file.size);
  assert(progress.every(event => event.phase === 'parse'));
  assert.deepEqual(progress.at(-1), {phase: 'parse', loaded: file.size, total: file.size});
});
await checkAsync('Reservoir streaming result is independent of text chunk boundaries', async () => {
  const prefix = '#' + ' '.repeat(chunkBytes - 20) + '\n';
  const rows = Array.from({length: 1000}, (_, i) => `${i} ${i * 2} ${i * 3} ${i / 1000}`);
  const text = prefix + 'x y z intensity\n' + rows.join('\n');
  assert.deepEqual(await readPointCloud(blobFile(text), {maxPoints: 37}), cloud(text, 'points.txt', {maxPoints: 37}));
});
console.log(`${checks} checks passed.`);
