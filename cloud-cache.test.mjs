import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const asModule = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const ioURL = asModule(await readFile(new URL('./point-io.js', import.meta.url), 'utf8'));
const source = (await readFile(new URL('./cloud-cache.js', import.meta.url), 'utf8')).replace("'./point-io.js'", JSON.stringify(ioURL));
const {CloudFileCache} = await import(asModule(source));
const {parsePointCloud} = await import(ioURL);
const full = parsePointCloud(new TextEncoder().encode(Array.from({length: 30}, (_, i) => `${i} ${i + 1000000} ${i % 7} ${i / 30}`).join('\n')).buffer, 'full.txt');
const fileA = {name: 'a.txt'}, fileB = {name: 'b.txt'};
let calls = 0;
const cache = new CloudFileCache({readCloud: async () => {calls++; return full;}});
cache.setActive([fileA]);
const first = await cache.read(fileA, 'cloud');
cache.setActive([fileA, fileB]);
assert.equal(await cache.read(fileA, 'cloud'), first);
await cache.read(fileB, 'cloud');
assert.equal(calls, 2, 'adding B must not read A again');
cache.setActive([fileA]);
assert.equal(await cache.read(fileA, 'cloud'), first);
assert.equal(calls, 2);
console.log('PASS add/remove selections reuse parsed entities');
const sampled = await cache.read(fileA, 'cloud', {maxPoints: 5});
assert.equal(sampled.count, 5); assert.equal(sampled.totalCount, 30);
assert.deepEqual(sampled.bounds, full.bounds);
assert.equal(await cache.read(fileA, 'cloud', {maxPoints: 5}), sampled);
assert.equal(await cache.read(fileA, 'cloud', {maxPoints: 0}), first);
assert.equal(calls, 2, 'full cached points satisfy any display limit');
console.log('PASS changing limits samples memory and retains stable variants');
let smallReads = 0;
const {samplePointCloud} = await import(ioURL);
const limited = new CloudFileCache({readCloud: async (_, {maxPoints}) => {smallReads++; return samplePointCloud(full, maxPoints);}});
await limited.read(fileA, 'cloud', {maxPoints: 5});
await limited.read(fileA, 'cloud', {maxPoints: 3});
assert.equal(smallReads, 1);
await limited.read(fileA, 'cloud', {maxPoints: 10});
assert.equal(smallReads, 2);
await limited.read(fileA, 'cloud', {maxPoints: 0});
assert.equal(smallReads, 3);
console.log('PASS only insufficient detail requires another parse');
const tiny = new CloudFileCache({budget: 1, readCloud: async () => full});
tiny.setActive([fileA, fileB]); await tiny.read(fileA, 'cloud'); await tiny.read(fileB, 'cloud');
assert.equal(tiny.records.size, 2, 'active data protected regardless of budget');
tiny.setActive([fileB]); assert.equal(tiny.records.has(fileA), false); assert.equal(tiny.records.has(fileB), true);
tiny.setActive([]); assert.equal(tiny.records.size, 0);
console.log('PASS inactive LRU eviction protects active files');
const aborted = new AbortController(); aborted.abort();
await assert.rejects(() => cache.read(fileA, 'cloud', {signal: aborted.signal}), {name: 'AbortError'});
let failCalls = 0;
const failure = new CloudFileCache({readCloud: async () => {failCalls++; throw Error('broken');}});
await assert.rejects(() => failure.read(fileA, 'cloud'), /broken/);
assert.equal(failure.records.size, 0);
let cancelled = new AbortController();
const cancellation = new CloudFileCache({readCloud: async () => {cancelled.abort(); return full;}});
await assert.rejects(() => cancellation.read(fileA, 'cloud', {signal: cancelled.signal}), {name: 'AbortError'});
assert.equal(cancellation.records.size, 0);
console.log('PASS failed/aborted results never enter cache');

const turn = () => new Promise(resolve => setImmediate(resolve));
function delayedReader() {
  const calls = [];
  return {calls, readCloud(file, options) {
    return new Promise((resolve, reject) => calls.push({file, options, resolve, reject}));
  }};
}
{
  const reader = delayedReader(), shared = new CloudFileCache({readCloud: reader.readCloud});
  const older = new AbortController(), newer = new AbortController();
  const olderProgress = [], newerProgress = [];
  shared.setActive([fileA]);
  const first = shared.read(fileA, 'cloud', {signal: older.signal, onProgress: value => olderProgress.push(value)}).catch(error => error.name);
  await turn();
  const taskA = reader.calls[0];
  taskA.options.onProgress({phase: 'parse', loaded: 1, total: 10});
  // This is the app's actual ordering: cancel the old UI, then update selected Files.
  older.abort(); shared.setActive([fileA, fileB]);
  const sameA = shared.read(fileA, 'cloud', {signal: newer.signal, onProgress: value => newerProgress.push(value)});
  const newB = shared.read(fileB, 'cloud');
  await turn();
  assert.equal(reader.calls.filter(call => call.file === fileA).length, 1, 'unfinished A must not restart when B is added');
  assert.equal(reader.calls.length, 2);
  assert.equal(taskA.options.signal.aborted, false);
  taskA.options.onProgress({phase: 'parse', loaded: 5, total: 10});
  assert.equal(olderProgress.length, 1, 'cancelled consumer receives no new progress');
  assert.deepEqual(newerProgress.map(event => event.loaded), [1, 5], 'new consumer receives current progress then updates');
  taskA.resolve(full); reader.calls.find(call => call.file === fileB).resolve(full);
  assert.equal(await first, 'AbortError');
  assert.equal(await sameA, full); assert.equal(await newB, full);
  assert.equal(shared.pending.size, 0); assert.equal(shared.records.size, 2);
  assert.deepEqual(shared.stats, {reads: 2, hits: 1});
  console.log('PASS adding B reuses unfinished A; old UI cancellation only detaches its subscription');
}
{
  const reader = delayedReader(), shared = new CloudFileCache({readCloud: reader.readCloud});
  shared.setActive([fileA]);
  const result = shared.read(fileA, 'cloud').catch(error => error.name);
  await turn(); const pending = reader.calls[0];
  shared.setActive([fileB]);
  assert.equal(await result, 'AbortError'); assert.equal(pending.options.signal.aborted, true);
  assert.equal(shared.pending.size, 0);
  pending.options.onProgress({phase: 'parse', loaded: 10, total: 10});
  pending.resolve(full); await turn();
  assert.equal(shared.records.has(fileA), false, 'late result from a removed file cannot enter cache');
  console.log('PASS removing an active File aborts its parser immediately and rejects late results');
}
{
  const reader = delayedReader(), shared = new CloudFileCache({readCloud: reader.readCloud});
  const controller = new AbortController();
  const result = shared.read(fileA, 'cloud', {signal: controller.signal}).catch(error => error.name);
  await turn(); controller.abort();
  assert.equal(await result, 'AbortError');
  assert.equal(reader.calls[0].options.signal.aborted, true, 'no active File and no subscriber must abort the parser');
  reader.calls[0].resolve(full); await turn();
  assert.equal(shared.records.size, 0); assert.equal(shared.pending.size, 0);
  console.log('PASS an unselected pending task stops when its last subscriber cancels');
}
{
  const reader = delayedReader(), shared = new CloudFileCache({readCloud: reader.readCloud});
  shared.setActive([fileA]);
  const smaller = shared.read(fileA, 'cloud', {maxPoints: 5});
  await turn(); const oldTask = reader.calls[0];
  const bigger = shared.read(fileA, 'cloud', {maxPoints: 0});
  await turn();
  assert.equal(reader.calls.length, 2); assert.equal(oldTask.options.signal.aborted, true);
  assert.equal(reader.calls[1].options.maxPoints, 0);
  oldTask.resolve(samplePointCloud(full, 5)); await turn();
  assert.equal(shared.records.size, 0, 'outdated low-detail task cannot overwrite the replacement');
  const another = shared.read(fileA, 'cloud', {maxPoints: 10});
  await turn(); assert.equal(reader.calls.length, 2, 'unlimited pending task satisfies a later finite limit');
  reader.calls[1].resolve(full);
  assert.equal((await smaller).count, 5, 'live older consumers move to the upgraded parser');
  assert.equal(await bigger, full); assert.equal((await another).count, 10);
  assert.equal(shared.records.get(fileA).value, full);
  console.log('PASS only insufficient in-flight detail restarts; live consumers transfer to the replacement');
}
{
  const reader = delayedReader(), shared = new CloudFileCache({readCloud: reader.readCloud});
  shared.setActive([fileA]);
  const first = shared.read(fileA, 'cloud').catch(error => error.message);
  const second = shared.read(fileA, 'cloud', {maxPoints: 10}).catch(error => error.message);
  await turn(); assert.equal(reader.calls.length, 1);
  reader.calls[0].reject(Error('read failed'));
  assert.equal(await first, 'read failed'); assert.equal(await second, 'read failed');
  assert.equal(shared.pending.size, 0); assert.equal(shared.records.size, 0);
  const retry = shared.read(fileA, 'cloud'); await turn();
  assert.equal(reader.calls.length, 2); reader.calls[1].resolve(full);
  assert.equal(await retry, full);
  console.log('PASS shared parser failure reaches its consumers and can be retried');
}
{
  const reader = delayedReader(), shared = new CloudFileCache({readCloud: reader.readCloud});
  shared.setActive([fileA, fileB]);
  const results = [fileA, fileB].map(file => shared.read(file, 'cloud').catch(error => error.name));
  await turn(); shared.clear();
  assert.deepEqual(await Promise.all(results), ['AbortError', 'AbortError']);
  assert(reader.calls.every(call => call.options.signal.aborted));
  for (const call of reader.calls) call.resolve(full);
  await turn();
  assert.equal(shared.records.size, 0); assert.equal(shared.pending.size, 0); assert.equal(shared.active.size, 0);
  console.log('PASS clear aborts all pending parsers and cannot be repopulated by late completions');
}
{
  const reader = delayedReader(), shared = new CloudFileCache({readCloud: reader.readCloud});
  shared.setActive([fileA]);
  const brokenSubscriber = shared.read(fileA, 'cloud', {onProgress() {throw Error('bad UI callback');}}).catch(error => error.message);
  const goodSubscriber = shared.read(fileA, 'cloud'); await turn();
  reader.calls[0].options.onProgress({phase: 'parse', loaded: 1, total: 2});
  assert.equal(await brokenSubscriber, 'bad UI callback');
  assert.equal(reader.calls[0].options.signal.aborted, false);
  reader.calls[0].resolve(full); assert.equal(await goodSubscriber, full);
  console.log('PASS one bad progress subscriber does not stop other consumers');
}

const deletion = new CloudFileCache({readCloud: async () => full});
await deletion.read(fileA, 'cloud'); await deletion.read(fileB, 'cloud');
deletion.forget(fileA); assert(!deletion.records.has(fileA)); assert(deletion.records.has(fileB));
let resolveRemoved;
const delayedDeletion = new CloudFileCache({readCloud: () => new Promise(resolve => {resolveRemoved=resolve;})});
delayedDeletion.setActive([fileA]);
const deletingRead = delayedDeletion.read(fileA,'cloud'); const rejectedDeletion = assert.rejects(deletingRead,{name:'AbortError'});
await Promise.resolve(); delayedDeletion.forget(fileA); resolveRemoved(full); await rejectedDeletion;
await Promise.resolve(); assert(!delayedDeletion.records.has(fileA)); assert(!delayedDeletion.pending.has(fileA)); assert(!delayedDeletion.active.has(fileA));
console.log('PASS removal releases only the target and prevents in-flight reads from reviving deleted files');
