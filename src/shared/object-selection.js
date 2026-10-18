/** Common filename preferences and natural, filter-aware ID navigation. */
export function objectFilePreference(files, value) {
  const index = value === '' ? -1 : Number(value), file = files[index];
  return file ? {name: file.name, index} : {none: true};
}
export function resolveObjectFile(files, preference, fallback = 0, used = new Set()) {
  if (preference?.none) return null;
  const same = preference?.name == null ? -1 : files.findIndex(file => file.name.toLowerCase() === preference.name.toLowerCase());
  const candidates = [same, preference?.index, fallback, ...files.map((_, index) => index)];
  for (const index of candidates) if (Number.isInteger(index) && index >= 0 && files[index] && !used.has(files[index])) return files[index];
  return null;
}

export function adjacentObjectEntry(entries, active, direction) {
  if (!entries.length) return null;
  const sorted = [...entries].sort((a,b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
  const index = sorted.indexOf(active);
  return sorted[index < 0 ? direction > 0 ? 0 : sorted.length - 1 : Math.max(0, Math.min(sorted.length - 1, index + direction))];
}
export function objectNavigationDirection(event, {multiple = false, flying = false} = {}) {
  if (multiple || flying || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return 0;
  if (event.target?.closest?.('input,select,textarea,button,a,[contenteditable]:not([contenteditable="false"]),[role="slider"],[role="tab"],[role="dialog"]')) return 0;
  return event.key === 'ArrowLeft' || event.key === '[' ? -1 : event.key === 'ArrowRight' || event.key === ']' ? 1 : 0;
}
