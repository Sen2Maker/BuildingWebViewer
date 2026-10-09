import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {t} from '../src/shared/i18n.js';
import {capturePointDrop,scanPointDrop,mountPointDrop} from '../src/shared/point-drop.js';
const accepts = name => /\.(xyz|txt|csv|pts|ply|pcd)$/i.test(name);
const file = (name, extra = {}) => ({ name, size: 42, lastModified: 123, ...extra });
const leaf = value => ({ name: value.name, isFile: true, file: resolve => resolve(value) });
const directory = (name, children) => ({ name, isDirectory: true, createReader() {
  let index = 0;
  return { readEntries(resolve) { const batch = children.slice(index, index + 100); index += 100; resolve(batch); } };
} });
const transfer = roots => ({ types: ['Files'], items: roots.map(entry => ({ kind: 'file', webkitGetAsEntry: () => entry })), files: [] });
const a = file('A.TXT'), b = file('B.ply');
let live = true;
const captured = capturePointDrop({items: [a, b].map(value => ({kind: 'file', getAsFile() { assert(live); return value; }}))});
live = false;
assert.deepEqual((await scanPointDrop(captured, accepts)).files.map(item => item.file), [a, b]);
console.log('PASS captures multiple files synchronously before drag store is protected');
const children = Array.from({length: 205}, (_, i) => leaf(file(`${i}.xyz`)));
children.push(directory('nested', [leaf(file('A.TXT')), leaf(file('notes.md'))]));
let progress = 0;
const nested = await scanPointDrop(capturePointDrop(transfer([directory('dataset', children)])), accepts, () => progress++);
assert.equal(nested.files.length, 206); assert.equal(nested.skipped, 1); assert.equal(nested.directories, 2);
assert(nested.files.some(item => item.path === 'dataset/nested/A.TXT')); assert(progress >= 2);
console.log('PASS recursively reads every directory batch beyond 100 entries and reports progress');
const sameNames = await scanPointDrop(capturePointDrop(transfer([directory('one', [leaf(a)]), directory('two', [leaf(a)])])), accepts);
assert.deepEqual(sameNames.files.map(item => item.path), ['one/A.TXT', 'two/A.TXT']);
console.log('PASS same basenames in different directories retain distinct paths');
const broken = {name: 'locked', isDirectory: true, createReader: () => ({readEntries: (_, reject) => reject(new Error('Access denied'))})};
const partial = await scanPointDrop(capturePointDrop(transfer([broken, leaf(a), directory('empty', [])])), accepts);
assert.equal(partial.files.length, 1); assert.equal(partial.errors[0].path, 'locked');
console.log('PASS inaccessible and empty folders do not discard other readable files');
const unreadable = {name: 'bad.txt', isFile: true, file: (_, reject) => reject(new Error('File disappeared'))};
assert.equal((await scanPointDrop([{entry: unreadable}], accepts)).errors.length, 1);
const fallback = capturePointDrop({items: [{kind: 'file', webkitGetAsEntry() {throw Error();}, getAsFile: () => a}]});
assert.equal(fallback[0].file, a);
assert.equal(capturePointDrop({files: [b]})[0].file, b);
assert.equal(capturePointDrop({items: [{kind: 'file', getAsEntry: () => leaf(a)}]})[0].entry.name, a.name);
console.log('PASS unreadable files, FileList fallback and both entry API names');
const zero = await scanPointDrop([{file: file('empty.txt', {size: 0})}], accepts);
assert.equal(zero.files.length, 1);
console.log('PASS empty supported files reach the parser for its normal validation');

function eventTarget() {
  const handlers = new Map();
  return { addEventListener: (type, handler) => handlers.set(type, handler),
    removeEventListener: type => handlers.delete(type),
    dispatch(type, event) { return handlers.get(type)?.(event); }, handlers };
}
const host = eventTarget(), zone = eventTarget(), classes = new Set(), child = {};
zone.contains = target => target === zone || target === child;
zone.classList = {add: name => classes.add(name), remove: name => classes.delete(name)};
const status = {hidden: true, textContent: ''}, received = [];
const dispose = mountPointDrop({host, zone, status, accepts, onFiles: async records => {
  received.push(records); return {added: records.length, duplicates: 0};
}});
const event = (dataTransfer, target = zone) => ({dataTransfer, target, prevented: false, preventDefault() {this.prevented = true;}});
const text = event({types: ['text/plain'], items: [{kind: 'string'}]});
host.dispatch('dragover', text); await host.dispatch('drop', text);
assert.equal(text.prevented, false); assert.equal(received.length, 0);
console.log('PASS internal column and text drags are untouched');
const over = event(transfer([leaf(a)]));
zone.dispatch('dragenter', over); zone.dispatch('dragenter', over); zone.dispatch('dragleave', over);
assert(classes.has('drop-active')); host.dispatch('dragover', over);
assert(over.prevented); assert.equal(over.dataTransfer.dropEffect, 'copy');
zone.dispatch('dragleave', over); assert(!classes.has('drop-active'));
console.log('PASS highlight stays active over nested children and clears after leaving');
const outside = event(transfer([leaf(a)]), {});
host.dispatch('dragover', outside); await host.dispatch('drop', outside);
assert(outside.prevented); assert.equal(outside.dataTransfer.dropEffect, 'none'); assert.equal(received.length, 0);
assert.match(status.textContent, /左侧/);
console.log('PASS dropping outside prevents browser navigation without importing');
const firstDrop = event(transfer([directory('many', children)]));
const firstTask = host.dispatch('drop', firstDrop);
const nextTransfer = {types: ['Files'], items: [{kind: 'file', getAsFile: () => b}]};
const secondTask = host.dispatch('drop', event(nextTransfer));
nextTransfer.items = []; // Event data is no longer available after dispatch.
await Promise.all([firstTask, secondTask]);
assert.equal(received.length, 2); assert.equal(received[0].length, 206); assert.equal(received[1][0].file, b);
assert(firstDrop.prevented); assert(!classes.has('drop-active')); assert.equal(status.hidden, false);
console.log('PASS overlapping drops capture immediately and append in order');
await host.dispatch('drop', event(transfer([leaf(file('readme.md'))])));
assert.match(status.textContent, /未找到支持的数据/); assert.equal(received.length, 2);
dispose(); assert.equal(host.handlers.size, 0); assert.equal(zone.handlers.size, 0);
console.log('PASS unsupported drops have actionable feedback and listeners are removable');

// Exercise the actual application's import function, including its pre-existing selection.
const app = await readFile(new URL('../src/cloud/cloud-app.js', import.meta.url), 'utf8');
const receiveSource = app.slice(app.indexOf('  function receiveCloudFiles('), app.indexOf('  function applyCloudSelection('));
const selected = {id: 'selected.txt', key: 'selected.txt\0' + '42\0' + '123', file: file('selected.txt')};
const existingEntries = [selected], selection = new Set([selected]), nodes = {};
const {ViewerProject} = await import('../src/shared/project-model.js');
const context = {t, pointProject: new ViewerProject(), entries: existingEntries, selectedCloudEntries: selection, pointExtension: /\.(xyz|txt|csv|pts|ply|pcd)$/i,
  natural: (a, b) => a.localeCompare(b), pretty: String, page: 2,
  $: id => nodes[id] ||= {}, list() {}, error() {}};
runInNewContext(receiveSource + '\nthis.receiveCloudFiles = receiveCloudFiles;', context);
const first = file('same.txt', {webkitRelativePath: 'folder/child/same.txt'});
assert.equal(context.receiveCloudFiles([first], true).added, 1);
const again = file('same.txt');
assert.equal(context.receiveCloudFiles([again], false, new Map([[again, 'folder/child/same.txt']])).duplicates, 1);
const other = file('same.txt');
assert.equal(context.receiveCloudFiles([other], false, new Map([[other, 'other/same.txt']])).added, 1);
assert.equal(existingEntries.length, 3); assert.equal(selection.size, 1); assert(selection.has(selected));
assert(existingEntries.includes(selected)); assert(existingEntries.some(entry => entry.id === 'other/same.txt'));
console.log('PASS picker/drop deduplication preserves selected entry objects and distinct paths');
