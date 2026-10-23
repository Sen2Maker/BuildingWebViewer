import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, readFile, readdir, lstat, open, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  checkPreviewResources, parsePreflightArgs, PREFLIGHT_MAX_FILES,
  PREFLIGHT_MAX_FILE_BYTES, PREFLIGHT_MAX_READ_BYTES, PREFLIGHT_MAX_DEPTH,
} from '../scripts/check-preview-resources.mjs';
import {METADATA_MAX_BYTES, normalizeManifest} from '../src/shared/online-preview-core.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const baseUrl = 'https://assets.example.test/bundle/';
const script = fileURLToPath(new URL('../scripts/check-preview-resources.mjs', import.meta.url));
const metadata = bytes => ({bytes: bytes.length, sha256: hash(bytes)});

async function fixture(t, {chunked = false, parts = ['\uFEFF# Synthetic 合成\r\n0 0 0\r\n', '1 2 3'], manifest = 'manifest.json'} = {}) {
  const temporary = await mkdtemp(join(tmpdir(), 'online-preview-preflight-'));
  t.after(() => rm(temporary, {recursive: true, force: true}));
  const root = join(temporary, 'resources'); await mkdir(root);
  const files = new Map();
  async function put(relative, content) {
    await mkdir(dirname(join(root, relative)), {recursive: true});
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    await writeFile(join(root, relative), bytes); files.set(relative, bytes);
    return bytes;
  }
  let entry;
  if (chunked) {
    const chunks = [];
    for (const [index, part] of parts.entries()) {
      const name = `data/part-${index + 1}.xyz`, bytes = await put(name, part);
      chunks.push({url: baseUrl + name, ...metadata(bytes)});
    }
    const combined = Buffer.concat([...files.values()]);
    entry = {id: 'synthetic-cloud', viewer: 'pointcloud', format: 'xyz', ...metadata(combined), chunks};
  } else {
    const bytes = await put('data/cloud.xyz', '0 0 0\n1 2 3\n');
    entry = {id: 'synthetic-cloud', viewer: 'pointcloud', format: 'xyz', url: baseUrl + 'data/cloud.xyz', ...metadata(bytes)};
  }
  const data = {schemaVersion: chunked ? 2 : 1, datasets: [entry]};
  async function save() { await put(manifest, `${JSON.stringify(data, null, 2)}\n`); }
  await save();
  return {temporary, root, manifest, baseUrl, data, files, put, save};
}

async function snapshot(root, relative = '') {
  const result = [];
  for (const name of (await readdir(join(root, relative))).sort()) {
    const path = relative ? `${relative}/${name}` : name, info = await lstat(join(root, path));
    result.push(info.isDirectory() ? [path, 'directory'] : [path, info.size, hash(await readFile(join(root, path)))]);
    if (info.isDirectory()) result.push(...await snapshot(root, path));
  }
  return result;
}

test('valid v1 is offline, read-only, root-relative, and explicitly not publication/CORS proof', async t => {
  const paths = await fixture(t, {manifest: 'indexes/manifest.json'}), before = await snapshot(paths.root);
  const previousFetch = globalThis.fetch; let networkCalls = 0;
  globalThis.fetch = () => { networkCalls++; throw new Error('Network is forbidden'); };
  try {
    const result = await checkPreviewResources(paths);
    assert.equal(result.ok, true); assert.equal(result.offline, true);
    assert.equal(result.datasets, 1); assert.equal(result.files, 2); assert.equal(result.referencedFiles, 1);
    assert.equal(result.readBytes, result.bundleBytes);
    assert.match(result.notice, /Offline local readiness only/);
    assert.match(result.notice, /No upload, publication, public-access, CORS, browser/);
    assert.equal(networkCalls, 0); assert.deepEqual(await snapshot(paths.root), before);
  } finally { globalThis.fetch = previousFetch; }
});

test('valid mixed v2 checks chunks in order, same OBJ in two viewers, extra files, and host config', async t => {
  const paths = await fixture(t, {chunked: true});
  const bytes = await paths.put('models/model.obj', '# Synthetic model\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  paths.data.datasets.push(...['lod', 'wireframe'].map(viewer => ({id: `synthetic-${viewer}`, viewer, format: 'obj', url: baseUrl + 'models/model.obj', ...metadata(bytes)})));
  await paths.put('extra/unused.csv', 'x,y,z\n0,0,0\n');
  await paths.put('_headers', '/*\n  Access-Control-Allow-Origin: *\n');
  await paths.put('_redirects', '/old /new 301\n');
  await paths.save();
  const result = await checkPreviewResources(paths);
  assert.equal(result.datasets, 3); assert.equal(result.chunkedDatasets, 1);
  assert.equal(result.files, 7); assert.equal(result.referencedFiles, 3);
  assert.equal(result.readBytes, result.bundleBytes + paths.data.datasets[0].bytes);
});

test('canonical percent-encoded Unicode filenames map to the exact in-root regular file', async t => {
  const paths = await fixture(t), relative = 'data/合成 点.xyz', bytes = await paths.put(relative, '1 2 3');
  Object.assign(paths.data.datasets[0], {url: baseUrl + relative.split('/').map(encodeURIComponent).join('/'), ...metadata(bytes)});
  await paths.save();
  assert.equal((await checkPreviewResources(paths)).referencedFiles, 1);
});

test('missing file and exact-size tampering both fail readiness', async t => {
  const paths = await fixture(t);
  await rm(join(paths.root, 'data/cloud.xyz'));
  await assert.rejects(checkPreviewResources(paths), /missing regular file/);
  await paths.put('data/cloud.xyz', '9 9 9\n8 8 8\n');
  await assert.rejects(checkPreviewResources(paths), /checksum/);
  await paths.put('data/cloud.xyz', '0 0 0');
  await assert.rejects(checkPreviewResources(paths), /byte length/);
});

test('optional v1 integrity remains valid production syntax but is not deployment-ready', async t => {
  const paths = await fixture(t), original = {...paths.data.datasets[0]};
  for (const missing of ['bytes', 'sha256']) {
    paths.data.datasets[0] = {...original}; delete paths.data.datasets[0][missing];
    assert.equal(normalizeManifest(paths.data).length, 1);
    await paths.save();
    await assert.rejects(checkPreviewResources(paths), /not deployment-ready.*bytes and sha256/);
  }
});

test('malformed JSON, schema, duplicate IDs, zero datasets and invalid hashes fail', async t => {
  const paths = await fixture(t), original = structuredClone(paths.data);
  await paths.put(paths.manifest, '{bad JSON');
  await assert.rejects(checkPreviewResources(paths), /valid UTF-8 JSON/);
  for (const mutation of [
    data => data.schemaVersion = 99,
    data => data.datasets.push({...data.datasets[0]}),
    data => data.datasets = [],
    data => data.datasets[0].sha256 = 'not-a-checksum',
    data => data.datasets[0].preset = {unexpected: true},
  ]) {
    paths.data.schemaVersion = original.schemaVersion;
    paths.data.datasets = structuredClone(original.datasets); mutation(paths.data); await paths.save();
    await assert.rejects(checkPreviewResources(paths));
  }
});

test('all original resource URLs reject source escape, traversal aliases and query/credential data', async t => {
  const paths = await fixture(t), original = paths.data.datasets[0].url;
  await writeFile(join(paths.temporary, 'outside.xyz'), 'outside synthetic data');
  for (const url of [
    'https://other.example.test/bundle/data/cloud.xyz',
    'https://assets.example.test/bundle-sibling/data/cloud.xyz',
    'https://assets.example.test/outside.xyz',
    baseUrl + '../outside.xyz', baseUrl + './data/cloud.xyz',
    baseUrl + '%2e%2e/outside.xyz', baseUrl + '%2E/data/cloud.xyz',
    baseUrl + 'data%2fcloud.xyz', baseUrl + 'data%5ccloud.xyz',
    baseUrl + '%252e%252e/outside.xyz', baseUrl + 'data/%63loud.xyz',
    baseUrl + 'data//cloud.xyz', baseUrl + 'data/cloud.xyz?',
    baseUrl + 'data/cloud.xyz?download=1', baseUrl + 'data/cloud.xyz?access_token=DO_NOT_ECHO_THIS_SECRET',
    'https://username:DO_NOT_ECHO_THIS_SECRET@assets.example.test/bundle/data/cloud.xyz',
    baseUrl + 'data/cloud.xyz#fragment', 'file:///tmp/outside.xyz',
  ]) {
    paths.data.datasets[0].url = url; await paths.save();
    await assert.rejects(checkPreviewResources(paths), error => {
      assert.equal(error.message.includes('DO_NOT_ECHO_THIS_SECRET'), false); return true;
    });
  }
  paths.data.datasets[0].url = original; await paths.save();
  assert.equal((await checkPreviewResources(paths)).ok, true);
  assert.equal(await readFile(join(paths.temporary, 'outside.xyz'), 'utf8'), 'outside synthetic data');
});

test('chunk URL original spelling is checked before URL normalization too', async t => {
  const paths = await fixture(t, {chunked: true});
  paths.data.datasets[0].chunks[0].url = baseUrl + 'data/../data/part-1.xyz'; await paths.save();
  await assert.rejects(checkPreviewResources(paths), /traversal/);
});

test('base URL and manifest paths must be explicit, canonical, safe and directory-relative', async t => {
  const paths = await fixture(t);
  for (const manifest of ['../outside.json', '/tmp/manifest.json', 'indexes/../manifest.json', 'a//manifest.json', 'C:/manifest.json', '%2e/manifest.json', 'manifest.json?key=secret', 'data/cloud.xyz']) {
    await assert.rejects(checkPreviewResources({...paths, manifest}));
  }
  for (const base of [baseUrl.slice(0, -1), baseUrl + '?', baseUrl + '?download=1', baseUrl + '../bundle/', baseUrl + '%2e%2e/', 'https://127.0.0.1/bundle/', 'http://assets.example.test/bundle/']) {
    await assert.rejects(checkPreviewResources({...paths, baseUrl: base}));
  }
  await assert.rejects(checkPreviewResources({...paths, root: ''}), /explicit --root/);
  await assert.rejects(checkPreviewResources({...paths, manifest: 'absent.json'}), /explicit manifest is missing/);
});

test('root, ancestor, manifest, resource and unreferenced symlinks are all rejected without following targets', async t => {
  const paths = await fixture(t), external = join(paths.temporary, 'outside.xyz');
  await writeFile(external, 'synthetic target unchanged');
  await symlink(paths.root, join(paths.temporary, 'root-link'));
  await assert.rejects(checkPreviewResources({...paths, root: join(paths.temporary, 'root-link')}), /symlink/);
  await symlink(paths.temporary, join(paths.temporary, 'parent-link'));
  await assert.rejects(checkPreviewResources({...paths, root: join(paths.temporary, 'parent-link/resources')}), /symlink/);
  for (const relative of ['extra.xyz', 'linked-dir', 'manifest.json', 'data/cloud.xyz']) {
    const original = paths.files.get(relative);
    if (original) await rm(join(paths.root, relative));
    await symlink(relative === 'linked-dir' ? paths.temporary : external, join(paths.root, relative));
    await assert.rejects(checkPreviewResources(paths), /symlink/);
    await rm(join(paths.root, relative));
    if (original) await paths.put(relative, original);
  }
  assert.equal(await readFile(external, 'utf8'), 'synthetic target unchanged');
});

test('special files fail without opening or blocking on them', async t => {
  const paths = await fixture(t);
  execFileSync('mkfifo', [join(paths.root, 'never-open.xyz')]);
  await assert.rejects(checkPreviewResources(paths), /special file/);
});

test('all files, including unreferenced assets, obey the exact 25 MiB cap', async t => {
  const paths = await fixture(t), file = await open(join(paths.root, 'unused.xyz'), 'wx');
  try {
    await file.truncate(PREFLIGHT_MAX_FILE_BYTES + 1);
    await assert.rejects(checkPreviewResources(paths), /25 MiB/);
    await file.truncate(PREFLIGHT_MAX_FILE_BYTES);
  } finally { await file.close(); }
  assert.equal((await checkPreviewResources(paths)).files, 3);
  assert.equal(PREFLIGHT_MAX_FILE_BYTES, 25 * 1024 * 1024);
});

test('all JSON metadata, even unreferenced, obeys the 5 MiB cap before reading', async t => {
  const paths = await fixture(t), file = await open(join(paths.root, 'extra.json'), 'wx');
  try { await file.truncate(METADATA_MAX_BYTES + 1); } finally { await file.close(); }
  await assert.rejects(checkPreviewResources(paths), /JSON metadata exceeds the 5 MiB/);
  await rm(join(paths.root, 'extra.json'));
  const manifest = await open(join(paths.root, paths.manifest), 'r+');
  try { await manifest.truncate(METADATA_MAX_BYTES + 1); } finally { await manifest.close(); }
  await assert.rejects(checkPreviewResources(paths), /5 MiB/);
});

test('inventory file-count cap includes every unreferenced regular file', async t => {
  const paths = await fixture(t), extra = join(paths.root, 'empty'); await mkdir(extra);
  // Existing source + manifest, plus 19999 empty synthetic files = 20001.
  for (let start = 0; start < PREFLIGHT_MAX_FILES - 1; start += 128) {
    await Promise.all(Array.from({length: Math.min(128, PREFLIGHT_MAX_FILES - 1 - start)}, (_, index) => writeFile(join(extra, `synthetic-${start + index}.txt`), '')));
  }
  await assert.rejects(checkPreviewResources(paths), /exceeds 20000 regular files/);
  assert.equal(PREFLIGHT_MAX_FILES, 20000);
});

test('total scan work is capped before reading oversized aggregate inventories', async t => {
  const paths = await fixture(t), count = Math.ceil(PREFLIGHT_MAX_READ_BYTES / PREFLIGHT_MAX_FILE_BYTES);
  for (let index = 0; index < count; index++) {
    const file = await open(join(paths.root, `synthetic-sparse-${index}.xyz`), 'wx');
    try { await file.truncate(PREFLIGHT_MAX_FILE_BYTES); } finally { await file.close(); }
  }
  await assert.rejects(checkPreviewResources(paths), /8 GiB total scan\/read budget/);
  assert.equal(PREFLIGHT_MAX_READ_BYTES, 8 * 1024 * 1024 * 1024);
});

test('directory depth is bounded even without regular files', async t => {
  const paths = await fixture(t);
  await mkdir(join(paths.root, ...Array(PREFLIGHT_MAX_DEPTH + 1).fill('nested')), {recursive: true});
  await assert.rejects(checkPreviewResources(paths), /directory levels/);
});

test('chunk ordering and aggregate checksum are independently verified', async t => {
  const paths = await fixture(t, {chunked: true, parts: ['0 0 0\n', '1 2 3\n']});
  paths.data.datasets[0].chunks.reverse(); await paths.save();
  await assert.rejects(checkPreviewResources(paths), /checksum/);
  paths.data.datasets[0].chunks.reverse(); paths.data.datasets[0].sha256 = '0'.repeat(64); await paths.save();
  await assert.rejects(checkPreviewResources(paths), /checksum/);
});

test('chunk byte/hash metadata and non-final LF boundaries fail closed', async t => {
  const paths = await fixture(t, {chunked: true, parts: ['0 0 0', '\n1 2 3']});
  await assert.rejects(checkPreviewResources(paths), /Non-final XYZ chunks.*LF/);
  paths.data.datasets[0].chunks[0].sha256 = '0'.repeat(64); await paths.save();
  await assert.rejects(checkPreviewResources(paths), /checksum/);
  paths.data.datasets[0].chunks[0].bytes++; await paths.save();
  await assert.rejects(checkPreviewResources(paths), /schema validation failed/);
});

test('each chunk needs complete UTF-8, including boundaries and final decoder flush', async t => {
  for (const parts of [
    [Buffer.from([0xff, 10]), '1 2 3'],
    [Buffer.from([0xe4, 0xb8]), Buffer.from([0xad, 10])],
    ['0 0 0\n', Buffer.from([0xe4, 0xb8])],
  ]) {
    const paths = await fixture(t, {chunked: true, parts});
    await assert.rejects(checkPreviewResources(paths), /complete UTF-8/);
  }
});

test('streaming UTF-8 handles multibyte characters crossing fixed read blocks', async t => {
  const parts = ['#' + ' '.repeat(64 * 1024 - 2) + '中\r\n0 0 0\n', '1 2 3'];
  const paths = await fixture(t, {chunked: true, parts});
  assert.equal((await checkPreviewResources(paths)).chunkedDatasets, 1);
});

test('obvious private filenames, unsupported assets and credential markers block even unreferenced files', async t => {
  const paths = await fixture(t);
  for (const name of ['.env', 'privatekey.xyz', 'credentials.json', 'keystore.txt', 'passwords.csv', 'script.js']) {
    await paths.put(name, 'synthetic');
    await assert.rejects(checkPreviewResources(paths), /hidden|credential|unsupported file type/);
    await rm(join(paths.root, name));
  }
  await mkdir(join(paths.root, '.git'));
  await assert.rejects(checkPreviewResources(paths), /hidden/);
  await rm(join(paths.root, '.git'), {recursive: true});
  for (const content of [
    '-----BEGIN PRIVATE KEY-----\nSYNTHETIC TEST ONLY\n',
    'password = SYNTHETIC_DO_NOT_ECHO',
    '#' + ' '.repeat(64 * 1024 - 10) + '-----BEGIN OPENSSH PRIVATE KEY-----',
    `{"api_key":"${'SYNTHETIC_NOT_A_REAL_KEY'}"}`,
  ]) {
    await paths.put('unused.txt', content);
    await assert.rejects(checkPreviewResources(paths), error => {
      assert.match(error.message, /obvious credential\/private-key content marker/);
      assert.equal(error.message.includes('SYNTHETIC_DO_NOT_ECHO'), false); return true;
    });
  }
});

test('strict CLI takes only all three explicit arguments, has fixed limits, and exits nonzero on errors', async t => {
  const paths = await fixture(t), args = ['--root', paths.root, '--manifest', paths.manifest, '--base-url', paths.baseUrl];
  assert.deepEqual(parsePreflightArgs(args), {root: paths.root, manifest: paths.manifest, baseUrl: paths.baseUrl});
  for (const argv of [[], args.slice(0, -2), [...args, '--root', paths.root], [...args, '--max-files', '999999'], [...args, '--upload', 'true']]) assert.throws(() => parsePreflightArgs(argv));
  const success = spawnSync(process.execPath, [script, ...args], {encoding: 'utf8', cwd: resolve(paths.temporary)});
  assert.equal(success.status, 0, success.stderr); assert.match(success.stdout, /Offline local readiness passed/);
  assert.match(success.stdout, /No upload, publication, public-access, CORS, browser/);
  paths.data.datasets[0].url += '?access_token=SYNTHETIC_DO_NOT_ECHO'; await paths.save();
  const failure = spawnSync(process.execPath, [script, ...args], {encoding: 'utf8'});
  assert.notEqual(failure.status, 0); assert.match(failure.stderr, /preflight failed/);
  assert.equal(failure.stderr.includes('SYNTHETIC_DO_NOT_ECHO'), false);
  delete paths.data.datasets[0].url;
  paths.data.datasets[0].SYNTHETIC_PRIVATE_KEY_NAME_DO_NOT_ECHO = true;
  await paths.save();
  const malformed = spawnSync(process.execPath, [script, ...args], {encoding: 'utf8'});
  assert.notEqual(malformed.status, 0); assert.match(malformed.stderr, /schema validation failed/);
  assert.equal(malformed.stderr.includes('SYNTHETIC_PRIVATE_KEY_NAME_DO_NOT_ECHO'), false);
});
test('public relative building index uses explicit manifest source context in offline preflight',async t=>{const paths=await fixture(t);const bytes=paths.files.get('data/cloud.xyz');await paths.put(paths.manifest,JSON.stringify({schema_version:1,public_base_url:baseUrl,path_base:'directory_containing_index',buildings:[{id:'synthetic',point_cloud:{path:'data/cloud.xyz',...metadata(bytes)}}]}));const result=await checkPreviewResources(paths);assert.equal(result.datasets,1);assert.equal(result.referencedFiles,1);await paths.put(paths.manifest,JSON.stringify({schema_version:1,public_base_url:'https://outside.example/bundle/',path_base:'directory_containing_index',buildings:[]}));await assert.rejects(checkPreviewResources(paths),/schema validation failed/);});
