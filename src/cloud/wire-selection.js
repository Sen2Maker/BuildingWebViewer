import { objectFilePreference, resolveObjectFile, adjacentObjectEntry, objectNavigationDirection } from '../shared/object-selection.js';
export function wirePreference(...args){return objectFilePreference(...args);}
export function resolveWireFile(...args){return resolveObjectFile(...args);}
export function adjacentWireEntry(...args){return adjacentObjectEntry(...args);}
export function wireNavigationDirection(...args){return objectNavigationDirection(...args);}
/** Match variants by filename across IDs; a missing variant falls back to a usable file. */
export function wireEntryFiles(entry, preferences, count = 1) {
  const used = new Set();
  const wires = Array.from({length: count}, (_, index) => {
    const file = resolveWireFile(entry.wires, preferences.wires[index], index, used);
    if (file) used.add(file); return file;
  });
  const preferredCloud = entry.clouds.findIndex(file => file.name.toLowerCase() === 'pc.xyz');
  return {wires, cloud: resolveWireFile(entry.clouds, preferences.cloud, Math.max(0, preferredCloud))};
}
/** Preserve source coordinates and edge topology; never deduplicate across independent files. */
export function combineWireframes(wires) {
  const valid = wires.filter(Boolean);
  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];
  const vertices = [], edges = [], bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  let hasBounds = false;
  for (const wire of valid) {
    const offset = vertices.length;
    for (const vertex of wire.vertices) vertices.push(vertex);
    for (const edge of wire.edges) edges.push(edge.map(index => index + offset));
    if (wire.bounds) {
      hasBounds = true;
      for (let axis = 0; axis < 3; axis++) {
        bounds[0][axis] = Math.min(bounds[0][axis], wire.bounds[0][axis]);
        bounds[1][axis] = Math.max(bounds[1][axis], wire.bounds[1][axis]);
      }
    }
  }
  return {vertices, edges, bounds: hasBounds ? bounds : null, empty: !edges.length};
}
export function normalizeWirePreferences(value) {
  const preference = item => item?.none === true ? {none:true} : item && typeof item.name === 'string' && item.name.length <= 1024 && Number.isSafeInteger(item.index) && item.index >= 0 ? {name:item.name,index:item.index} : null;
  return {wires:Array.from({length:3},(_,index)=>preference(value?.wires?.[index])),cloud:preference(value?.cloud),compare:value?.compare===true,count:value?.count===3?3:2};
}
