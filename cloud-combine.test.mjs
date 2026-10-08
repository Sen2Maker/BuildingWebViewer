// Run from the project directory: node cloud-combine.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('./cloud-combine.js', import.meta.url), 'utf8');
const {mergePointClouds} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
let checks = 0;
function check(name, work) { work(); checks++; console.log('PASS', name); }
function cloud(positions, {fields = {}, rgb = null, totalCount, bounds, notes = []} = {}) {
  const count = positions.length / 3;
  return {
    positions: new Float64Array(positions), count, totalCount: totalCount ?? count,
    bounds: bounds || [
      [0, 1, 2].map(axis => Math.min(...positions.filter((_, i) => i % 3 === axis))),
      [0, 1, 2].map(axis => Math.max(...positions.filter((_, i) => i % 3 === axis))),
    ],
    fields: Object.fromEntries(Object.entries(fields).map(([name, values]) => [name, new Float32Array(values)])),
    rgb: rgb && new Float32Array(rgb), notes,
  };
}
check('No files returns null', () => assert.equal(mergePointClouds([]), null));
check('Original doubles, sampled order and full source bounds are preserved', () => {
  const first = cloud([832129.50060046, 816457.03489984, 1, 832130.000001, 816458.25, 2], {
    totalCount: 100, bounds: [[832000, 816000, -10], [833000, 817000, 999]],
  });
  const second = cloud([1, 2, 3], {totalCount: 5, bounds: [[-100, -200, -300], [100, 200, 300]]});
  const merged = mergePointClouds([{name: 'a.txt', cloud: first}, {name: 'b.txt', cloud: second}]);
  assert(merged.positions instanceof Float64Array);
  assert.deepEqual([...merged.positions], [...first.positions, ...second.positions]);
  assert.deepEqual(merged.bounds, [[-100, -200, -300], [833000, 817000, 999]]);
  assert.equal(merged.count, 3); assert.equal(merged.totalCount, 105);
  assert.deepEqual(merged.sources.map(({name, start, count, totalCount}) => ({name, start, count, totalCount})), [
    {name: 'a.txt', start: 0, count: 2, totalCount: 100}, {name: 'b.txt', start: 2, count: 1, totalCount: 5},
  ]);
});
check('Field union retains intensity, generic attributes and NaN gaps', () => {
  const first = cloud([0, 0, 1, 2, 3, 4], {fields: {x: [0, 2], intensity: [.25, .5]}});
  const second = cloud([5, 6, 7], {fields: {x: [5], column_4: [.75], classification: [6]}});
  const merged = mergePointClouds([{name: 'named.csv', cloud: first}, {name: 'plain.txt', cloud: second}]);
  assert.deepEqual(Object.keys(merged.fields), ['x', 'intensity', 'column_4', 'classification']);
  assert.deepEqual([...merged.fields.x], [0, 2, 5]);
  assert.deepEqual([...merged.fields.intensity], [.25, .5, NaN]);
  assert.deepEqual([...merged.fields.column_4], [NaN, NaN, .75]);
  assert.deepEqual([...merged.fields.classification], [NaN, NaN, 6]);
  for (const values of Object.values(merged.fields)) { assert(values instanceof Float32Array); assert.equal(values.length, merged.count); }
  assert(merged.notes.some(note => note.includes('缺少属性')));
});
check('Partial RGB uses NaN; no source RGB stays null', () => {
  const first = cloud([0, 0, 0], {rgb: [1, .5, 0]}), second = cloud([1, 1, 1]);
  const merged = mergePointClouds([{name: 'color.ply', cloud: first}, {name: 'gray.txt', cloud: second}]);
  assert.deepEqual([...merged.rgb], [1, .5, 0, NaN, NaN, NaN]);
  assert(merged.notes.some(note => note.includes('gray.txt') && note.includes('没有 RGB')));
  assert.equal(mergePointClouds([{name: 'gray.txt', cloud: second}]).rgb, null);
});
check('Stable normalized colors and duplicate filenames are accepted', () => {
  const value = cloud([1, 2, 3]);
  const first = mergePointClouds([{name: 'a.txt', cloud: value}, {name: 'b.txt', cloud: value}]);
  const reverse = mergePointClouds([{name: 'b.txt', cloud: value}, {name: 'a.txt', cloud: value}]);
  assert.deepEqual(first.sources[0].color, reverse.sources[1].color);
  for (const {color} of first.sources) { assert.equal(color.length, 3); assert(color.every(v => v >= 0 && v <= 1)); }
  const duplicate = mergePointClouds([{name: 'same.txt', cloud: value}, {name: 'same.txt', cloud: value}]);
  assert.deepEqual(duplicate.sources.map(s => s.start), [0, 1]);
});
check('Singleton and multi-source results do not mutate cached inputs', () => {
  const original = cloud([1, 2, 3], {fields: {intensity: [.25]}, rgb: [1, .5, 0], notes: ['one note']});
  Object.freeze(original); Object.freeze(original.notes); Object.freeze(original.fields);
  const single = mergePointClouds([{name: 'one.txt', cloud: original}]);
  assert.notEqual(single, original); assert.equal(single.positions, original.positions);
  assert.equal(single.fields.intensity, original.fields.intensity); assert.equal(single.rgb, original.rgb);
  assert.notEqual(single.fields, original.fields);
  single.bounds[0][0] = -10; single.notes.push('new');
  const merged = mergePointClouds([{name: 'one.txt', cloud: original}, {name: 'two.txt', cloud: original}]);
  assert.notEqual(merged.positions, original.positions);
  merged.positions[0] = 100; merged.fields.intensity[0] = .75; merged.rgb[0] = 0;
  assert.equal(original.positions[0], 1); assert.equal(original.fields.intensity[0], .25); assert.equal(original.rgb[0], 1);
  assert.equal(original.bounds[0][0], 1); assert.deepEqual(original.notes, ['one note']); assert.equal(original.sources, undefined);
});
check('Common parser notes are deduplicated with source scope', () => {
  const merged = mergePointClouds([
    {name: 'a.txt', cloud: cloud([1, 2, 3], {notes: ['shared', 'only A', 'shared']})},
    {name: 'b.txt', cloud: cloud([4, 5, 6], {notes: ['shared', 'only B']})},
  ]);
  assert.equal(merged.notes.filter(note => note.includes('shared')).length, 1);
  assert(merged.notes.some(note => note === 'a.txt：only A')); assert(merged.notes.some(note => note === 'b.txt：only B'));
});
check('Malformed arrays and inconsistent source counts fail explicitly', () => {
  const value = cloud([1, 2, 3]);
  for (const invalid of [null, {...value, count: 2}, {...value, totalCount: 0}, {...value, bounds: [[0, 0, 0], [NaN, 1, 1]]}, {...value, fields: {intensity: new Float32Array(2)}}, {...value, rgb: new Float32Array(2)}]) {
    assert.throws(() => mergePointClouds([{name: 'invalid.txt', cloud: invalid}]), /点云 invalid.txt/);
  }
});
console.log(`${checks} checks passed.`);
