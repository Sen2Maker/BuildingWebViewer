/** Match variants by filename across IDs; a missing variant falls back to a usable file. */
export function wirePreference(files, value) {
  const index = value === '' ? -1 : Number(value), file = files[index];
  return file ? {name: file.name, index} : {none: true};
}
export function resolveWireFile(files, preference, fallback = 0, used = new Set()) {
  if (preference?.none) return null;
  const same = preference?.name == null ? -1 : files.findIndex(file => file.name.toLowerCase() === preference.name.toLowerCase());
  const candidates = [same, preference?.index, fallback, ...files.map((_, index) => index)];
  for (const index of candidates) if (Number.isInteger(index) && index >= 0 && files[index] && !used.has(files[index])) return files[index];
  return null;
}
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
export function adjacentWireEntry(entries, active, direction) {
  if (!entries.length) return null;
  const sorted = [...entries].sort((a,b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
  const index = sorted.indexOf(active);
  return sorted[index < 0 ? direction > 0 ? 0 : sorted.length - 1 : Math.max(0, Math.min(sorted.length - 1, index + direction))];
}
export function wireNavigationDirection(event, {multiple = false, flying = false} = {}) {
  if (multiple || flying || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return 0;
  if (event.target?.closest?.('input,select,textarea,button,a,[contenteditable]:not([contenteditable="false"]),[role="slider"],[role="tab"],[role="dialog"]')) return 0;
  return event.key === 'ArrowLeft' || event.key === '[' ? -1 : event.key === 'ArrowRight' || event.key === ']' ? 1 : 0;
}
export function normalizeWirePreferences(value) {
  const preference = item => item?.none === true ? {none:true} : item && typeof item.name === 'string' && item.name.length <= 1024 && Number.isSafeInteger(item.index) && item.index >= 0 ? {name:item.name,index:item.index} : null;
  return {wires:Array.from({length:3},(_,index)=>preference(value?.wires?.[index])),cloud:preference(value?.cloud),compare:value?.compare===true,count:value?.count===3?3:2};
}
