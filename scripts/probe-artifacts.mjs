/**
 * Read-only production-artifact probes. Run after build:vite and check:vite.
 * Adapted from the independent review's recreated 200/80/worker harness.
 * These are not browser, actual Worker isolation, WASM, or native App tests.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {parseAst} from 'rolldown/parseAst';
import {computePointFeatures} from '../src/pointcloud/point-operations.js';
import {GS_SORT_WORKER} from '../src/gaussian/sort-worker.js';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const folder = resolve(output, 'assets/js');
const chunks = readdirSync(folder)
  .filter(name => name.endsWith('.js'))
  .map(name => {
    const text = readFileSync(resolve(folder, name), 'utf8');
    return {name, text, ast: parseAst(text)};
  });

function unique(predicate, label) {
  const matches = chunks.filter(predicate);
  assert.equal(matches.length, 1, label);
  return matches[0];
}

const isKernel = node => node.type === 'FunctionDeclaration'
  && node.id?.name === 'computePointFeatures';
const cloud = unique(chunk => chunk.ast.body.some(isKernel), 'One emitted point kernel');
const kernelNode = cloud.ast.body.find(isKernel);
const kernel = vm.runInNewContext(`(${cloud.text.slice(kernelNode.start, kernelNode.end)})`);

// Normalize cross-realm containers without losing NaN/Infinity, unlike JSON encoding.
function plain(value) {
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  }
  return value;
}

for (let iteration = 0; iteration < 80; iteration++) {
  const points = Float64Array.from({length: 60}, (_, index) => Math.sin(index + iteration) * 10);
  const options = {
    k: 3 + iteration % 15,
    radius: iteration % 2 ? 0 : 12,
    orientation: ['+x', '-x', '+y', '-y', '+z', '-z'][iteration % 6],
    features: [
      ['normals'], ['slope'], ['planarity', 'roughness'],
      ['normals', 'slope', 'planarity', 'roughness'],
    ][iteration % 4],
  };
  assert.deepEqual(plain(kernel(points, options)), plain(computePointFeatures(points, options)));
}
console.log('PASS 80 emitted point-kernel cases across features, orientations and radius modes.');

const isWorker = node => node.type === 'VariableDeclaration'
  && node.declarations.some(item => item.id?.name === 'GS_SORT_WORKER');
const gaussian = unique(chunk => chunk.ast.body.some(isWorker), 'One emitted Gaussian worker string');
const declaration = gaussian.ast.body.find(isWorker);
const worker = vm.runInNewContext(
  gaussian.text.slice(declaration.start, declaration.end) + '; GS_SORT_WORKER',
);
assert.equal(worker, GS_SORT_WORKER, 'The emitted Blob worker must equal its source bytes');
const replies = [];
const context = vm.createContext({performance: {now: () => 0}, postMessage: reply => replies.push(reply)});
vm.runInContext(worker, context);
const send = data => context.onmessage({data});
send({type: 'data', generation: 1, centers: new Float32Array([0, 0, 3, 0, 0, -2, 0, 0, 1]).buffer});
send({type: 'sort', generation: 1, forward: [0, 0, 1]});
const first = replies.pop();
assert.deepEqual([...new Uint32Array(first.order)], [1, 2, 0]);
send({type: 'recycle', generation: 1, order: first.order});
send({type: 'sort', generation: 1, forward: [0, 0, -1]});
const second = replies.pop();
assert.equal(second.order, first.order, 'Recycled capacity must be reused');
assert.deepEqual([...new Uint32Array(second.order)], [0, 2, 1]);
send({type: 'sort', generation: 0, forward: [0, 0, 1]});
assert.equal(replies.length, 0, 'Stale generations must not produce a reply');
console.log('PASS emitted Gaussian Blob worker bytes, sort/recycle protocol and stale-generation rejection.');

const inventory = readFileSync(resolve(output, 'asset-inventory.json'));
console.log('Inventory SHA256:', createHash('sha256').update(inventory).digest('hex'));
console.log('Scope: production-artifact code only; no DOM, actual Worker isolation, WASM or native App proof.');
