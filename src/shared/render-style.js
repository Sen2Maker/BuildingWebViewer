/** Shared display-only options. Geometry and exported point attributes stay unchanged. */
export const PRESENTATION_DEFAULTS = {pointStyle:'disc', pointRatio:100, lineStyle:'native', lineWidth:2, lineGradient:false, lineEndColor:'#417ec4', surfaceStyle:'matte', axes:true, ruler:true, legend:true, pointCountLabel:true};
let presentationPreferences = {...PRESENTATION_DEFAULTS};
export function currentPresentation() { return {...presentationPreferences}; }
export function rememberPresentation(options) { presentationPreferences = {...presentationPreferences, ...options}; }
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
