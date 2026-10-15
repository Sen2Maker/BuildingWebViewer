/** Shared display-only options. Geometry and exported point attributes stay unchanged. */
export const PRESENTATION_DEFAULTS = Object.freeze({pointStyle:'disc', pointRatio:100, lineStyle:'native', lineWidth:2, lineGradient:false, lineEndColor:'#417ec4', surfaceStyle:'matte', axes:true, ruler:true, legend:true, pointCountLabel:true});
export const PRESENTATION_STORAGE_KEY = 'BuildingWebViewer.presentation.v1';
const presentationEnums = {pointStyle:['disc','square','sphere'],lineStyle:['native','cylinder','box'],surfaceStyle:['matte','unlit','gloss']};
/** Only capability-independent visual preferences travel between tools. Sampling is always explicit. */
export function normalizePresentation(options = {}) {
  const clean = {};
  if (!options || typeof options !== 'object' || Array.isArray(options)) return clean;
  for (const [key, fallback] of Object.entries(PRESENTATION_DEFAULTS)) {
    const value=options[key];
    if (presentationEnums[key]?.includes(value) || typeof fallback==='boolean'&&typeof value==='boolean' || key==='pointRatio'&&Number.isFinite(value)&&value>=1&&value<=100 || key==='lineWidth'&&Number.isFinite(value)&&value>=.5&&value<=24 || key==='lineEndColor'&&typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)) clean[key]=value;
  }
  return clean;
}
function portablePresentation(options) {
  const clean=normalizePresentation(options);
  // A saved cylinder style may be unsupported by a new renderer. Never silently sample another dataset.
  delete clean.lineStyle; delete clean.pointRatio;
  return clean;
}
let presentationPreferences = {...PRESENTATION_DEFAULTS};
try { Object.assign(presentationPreferences,portablePresentation(JSON.parse(globalThis.localStorage?.getItem(PRESENTATION_STORAGE_KEY)||'null'))); } catch {}
export function currentPresentation() { return {...presentationPreferences}; }
export function rememberPresentation(options) {
  presentationPreferences = {...presentationPreferences, ...normalizePresentation(options)};
  try { globalThis.localStorage?.setItem(PRESENTATION_STORAGE_KEY,JSON.stringify(portablePresentation(presentationPreferences))); } catch {}
}
export function displaySampleIndices(total, ratio) {
  if (!Number.isSafeInteger(total) || total < 0 || total > 0xffffffff || !Number.isFinite(ratio) || ratio < 1 || ratio > 100) throw Error('Invalid display sampling size or percentage');
  const count = Math.floor(total * ratio / 100);
  const indices = total > 65535 ? new Uint32Array(count) : new Uint16Array(count);
  // One deterministic jittered sample per index stratum avoids scan-row aliasing.
  for (let i = 0; i < count; i++) {
    const low=Math.floor(i*total/count),high=Math.floor((i+1)*total/count);
    let hash=(i+0x9e3779b9)>>>0;hash=Math.imul(hash^(hash>>>16),0x21f0aaad);hash=Math.imul(hash^(hash>>>15),0x735a2d97);hash=(hash^(hash>>>15))>>>0;
    indices[i]=low+Math.floor(hash/4294967296*(high-low));
  }
  return indices;
}
export function niceScale(unitsPerPixel, pixels = 90) {
  if (!(unitsPerPixel > 0) || !Number.isFinite(unitsPerPixel)) return null;
  const raw = unitsPerPixel * pixels, power = 10 ** Math.floor(Math.log10(raw)), n = raw / power;
  const length = (n >= 5 ? 5 : n >= 2 ? 2 : 1) * power;
  return {length, pixels:length / unitsPerPixel};
}
export function rgbHex(hex) { return [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255); }
