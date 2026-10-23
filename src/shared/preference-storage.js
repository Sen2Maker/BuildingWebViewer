/** Shared preview tabs keep every viewer preference in memory, never in the user's saved profile. */
const sessions = new WeakMap();
const isolated = new WeakSet();
export function isPreviewSession(host = globalThis) {
  if (isolated.has(host)) return true;
  try { if (!host.Capacitor?.isNativePlatform?.() && ['preview','compare'].some(key=>new URLSearchParams(host.location?.hash?.slice(1) || '').has(key))) isolated.add(host); } catch {}
  return isolated.has(host);
}
export function preferenceStorage(host = globalThis) {
  if (!isPreviewSession(host)) return host.localStorage;
  if (!sessions.has(host)) {
    const values = new Map();
    sessions.set(host, {getItem:key=>values.get(String(key))??null,setItem:(key,value)=>values.set(String(key),String(value)),removeItem:key=>values.delete(String(key)),clear:()=>values.clear()});
  }
  return sessions.get(host);
}
