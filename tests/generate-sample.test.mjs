import assert from 'node:assert/strict';
import { genCheck, genEstimate, genPreviewPart, genSample, genWire, GEN_LIMIT, GEN_PREVIEW } from '../src/generate/sample.js';
import { writePointExport } from '../src/pointcloud/point-export.js';
import { parsePointCloud } from '../src/cloud/point-io.js';

const place = {x: 0, y: 0, z: 0};
const sampling = {spacing: 1, pattern: 'grid', noise: 0, seed: 1};
const ground = (extra = {}) => ({id: 1, place: {...place}, sampling: {...sampling}, shape: {type: 'ground', width: 2, depth: 2, groundZ: 0}, ...extra});
let checks = 0;
function check(name, work) { return Promise.resolve(work()).then(() => { checks += 1; console.log('PASS', name); }); }

function gable(shape, sample = {}) {
  return {id: 2, place: {...place, ...sample.place}, sampling: {...sampling, ...sample.sampling}, shape: {type: 'gable', width: 4, depth: 4, eaveHeight: 2, ridgeHeight: 4, overhang: 0, groundZ: 0, walls: false, gables: false, ...shape}};
}

await check('Ground grid keeps spacing, normal and a moved origin', () => {
  const cloud = genSample(ground());
  assert.equal(cloud.count, 9);
  assert.equal(genEstimate(ground()), 9);
  assert.equal(cloud.positions[2], 0);
  assert.equal(cloud.fields.nz[0], 1);
  assert.equal(cloud.fields.normal_valid[0], 1);
  const moved = genSample(ground({place: {x: 10, y: 0, z: 3}}));
  assert.equal(moved.positions[0], 9);
  assert.equal(moved.positions[2], 3);
});

await check('Gable roof points stay on the two planes and point outward', () => {
  const part = gable({});
  const cloud = genSample(part);
  assert.equal(cloud.count, genEstimate(part));
  let left = 0, right = 0;
  for (let i = 0; i < cloud.count; i++) {
    const x = cloud.positions[i * 3], y = cloud.positions[i * 3 + 1], z = cloud.positions[i * 3 + 2];
    assert.ok(y >= -2 - 1e-8 && y <= 2 + 1e-8);
    const expected = x <= 0 ? x + 4 : 4 - x;
    assert.ok(Math.abs(z - expected) < 1e-8, `${x},${z} off the roof`);
    const normal = [cloud.fields.nx[i], cloud.fields.ny[i], cloud.fields.nz[i]];
    assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-12);
    assert.ok(normal[2] > 0);
    if (x < -1e-8) { assert.ok(normal[0] < 0); left += 1; }
    else if (x > 1e-8) { assert.ok(normal[0] > 0); right += 1; }
  }
  assert.ok(left > 0 && right > 0);
});

await check('Overhang passes the walls, and a flat roof has one up-facing plane', () => {
  const part = gable({overhang: 1, walls: true}, {sampling: {spacing: 1}});
  const cloud = genSample(part);
  let outside = false, wall = false;
  for (let i = 0; i < cloud.count; i++) {
    const x = cloud.positions[i * 3];
    if (cloud.fields.surface[i] === 3 && Math.abs(x) > 2 + 1e-8) outside = true;
    if (cloud.fields.surface[i] === 2 && Math.abs(Math.abs(x) - 2) < 1e-8) wall = true;
  }
  assert.equal(outside && wall, true);
  const flat = genSample(gable({ridgeHeight: 2, walls: false, gables: false}));
  assert.ok([...flat.positions].filter((_, index) => index % 3 === 2).every(z => Math.abs(z - 2) < 1e-8));
  assert.ok(flat.fields.nz.every(value => value > 0.9));
});

await check('Gable ends stay inside the triangle and box interior is separate', () => {
  const part = gable({gables: true, walls: false}, {sampling: {spacing: 1}});
  const cloud = genSample(part);
  const ends = [...cloud.fields.surface].filter(value => value === 4).length;
  assert.ok(ends > 0);
  for (let i = 0; i < cloud.count; i++) if (cloud.fields.surface[i] === 4) {
    const x = cloud.positions[i * 3], y = cloud.positions[i * 3 + 1], z = cloud.positions[i * 3 + 2];
    assert.ok(Math.abs(Math.abs(y) - 2) < 1e-8);
    assert.ok(z >= 2 - 1e-8 && z <= 4 + 1e-8);
    const half = 2 * (4 - z) / 2;
    assert.ok(Math.abs(x) <= half + 1e-6);
  }
  const box = {id: 3, place, sampling: {...sampling, spacing: 0.5}, shape: {type: 'box', width: 1, depth: 1, height: 1, groundZ: 0, interior: true}};
  const solid = genSample(box);
  assert.equal(solid.count, genEstimate(box));
  const inside = [...solid.fields.normal_valid].reduce((hits, value, index) => value === 0 ? index : hits, -1);
  assert.ok(inside >= 0);
  assert.ok(Math.abs(solid.positions[inside * 3]) < 1e-8);
  assert.ok(Math.abs(solid.positions[inside * 3 + 1]) < 1e-8);
  assert.ok(Math.abs(solid.positions[inside * 3 + 2] - 0.5) < 1e-8);
});

await check('Stratified samples stay inside, and the seed repeats', () => {
  const part = ground({sampling: {spacing: 1, pattern: 'stratified', noise: 0, seed: 7}});
  const first = genSample(part), again = genSample(part);
  assert.equal(first.count, 4);
  assert.deepEqual([...first.positions], [...again.positions]);
  for (let i = 0; i < first.count; i++) {
    assert.ok(first.positions[i * 3] >= -1 && first.positions[i * 3] <= 1);
    assert.ok(first.positions[i * 3 + 1] >= -1 && first.positions[i * 3 + 1] <= 1);
    assert.equal(first.positions[i * 3 + 2], 0);
  }
  const other = genSample(ground({sampling: {spacing: 1, pattern: 'stratified', noise: 0, seed: 8}}));
  assert.notDeepEqual([...first.positions], [...other.positions]);
});

await check('Noise leaves the plane without changing a repeated seed', () => {
  const part = ground({sampling: {spacing: 1, pattern: 'grid', noise: 0.2, seed: 4}});
  const first = genSample(part), again = genSample(part);
  assert.deepEqual([...first.positions], [...again.positions]);
  assert.ok([...first.positions].some((value, index) => index % 3 === 2 && Math.abs(value) > 1e-6));
});

await check('Preview thins a large surface and wireframe edges stay valid', () => {
  const part = ground({shape: {type: 'ground', width: 200, depth: 200, groundZ: 2}, sampling: {spacing: 0.5, pattern: 'grid', noise: 0, seed: 1}});
  assert.ok(genEstimate(part) > GEN_PREVIEW);
  assert.ok(genEstimate(part) < GEN_LIMIT);
  const preview = genPreviewPart(part);
  assert.ok(preview.count <= GEN_PREVIEW);
  assert.ok([...preview.positions].filter((_, index) => index % 3 === 2).every(z => Math.abs(z - 2) < 1e-6));
  const wire = genWire([{...gable({walls: true, gables: true}), visible: true}, {...part, visible: false}]);
  assert.ok(wire.edges.length > 8);
  assert.ok(wire.edges.every(([a, b]) => a !== b && wire.vertices[a] && wire.vertices[b]));
});

await check('Invalid shapes and oversized samples fail before allocation', () => {
  assert.throws(() => genCheck(gable({ridgeHeight: 1})));
  assert.throws(() => genSample(ground({sampling: {spacing: 0, pattern: 'grid', noise: 0, seed: 1}})));
  assert.throws(() => genSample(ground({sampling: {spacing: 1, pattern: 'grid', noise: -1, seed: 1}})));
  const huge = ground({shape: {type: 'ground', width: 1000, depth: 1000, groundZ: 0}, sampling: {spacing: 0.01, pattern: 'grid', noise: 0, seed: 1}});
  assert.ok(genEstimate(huge) > GEN_LIMIT);
  assert.throws(() => genSample(huge), /间距/);
});

await check('Binary PLY round-trips coordinates and normals', async () => {
  const cloud = genSample(ground(), {color: [.2, .4, .6]});
  const chunks = [];
  await writePointExport([{name: '地面', cloud}], {format: 'ply', sourceIds: false, write: chunk => chunks.push(chunk)});
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const parsed = parsePointCloud(bytes, '地面.ply');
  assert.equal(parsed.count, cloud.count);
  assert.equal(parsed.positions[0], cloud.positions[0]);
  assert.equal(parsed.positions[2], 0);
  assert.equal(parsed.fields.nx[0], 0);
  assert.equal(parsed.fields.nz[0], 1);
  assert.ok(Math.abs(parsed.rgb[0] - .2) < 1e-6);
});

console.log(`PASS ${checks} generate sampler checks`);
