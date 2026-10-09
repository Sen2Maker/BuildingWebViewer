import { t } from './i18n.js';
/** Shared, evenly spaced color stops for GPU rendering and matching UI legends. */
export const PALETTE_DEFINITIONS = Object.freeze({
  current: {label: t('当前色带'), stops: [[.20,.32,.65],[.13,.59,.70],[.35,.75,.55],[.90,.80,.32],[.88,.33,.23]]},
  viridis: {label: 'Viridis', stops: [[.267,.005,.329],[.279,.175,.483],[.230,.322,.546],[.173,.449,.558],[.128,.567,.551],[.158,.684,.502],[.369,.789,.383],[.678,.864,.190],[.993,.906,.144]]},
  inferno: {label: 'Inferno', stops: [[.001,.000,.014],[.129,.047,.291],[.342,.062,.429],[.541,.135,.415],[.735,.216,.330],[.894,.353,.194],[.978,.558,.035],[.974,.798,.206],[.988,.998,.645]]},
  grayscale: {label: t('灰度'), stops: [[.08,.08,.08],[.95,.95,.95]]},
  'blue-white-red': {label: t('蓝—白—红'), stops: [[.17,.35,.75],[.97,.97,.97],[.78,.16,.20]]},
});

export function samplePalette(t, palette = 'current', reverse = false) {
  const stops = (PALETTE_DEFINITIONS[palette] || PALETTE_DEFINITIONS.current).stops;
  let value = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : .5;
  if (reverse) value = 1 - value;
  const at = value * (stops.length - 1), low = Math.min(stops.length - 2, Math.floor(at)), fraction = at - low;
  return stops[low].map((channel, i) => channel * (1 - fraction) + stops[low + 1][i] * fraction);
}

export function paletteUniforms(palette = 'current', reverse = false) {
  const values = new Float32Array(27);
  for (let i = 0; i < 9; i++) values.set(samplePalette(i / 8, palette, reverse), i * 3);
  return values;
}

export function validatePaletteOptions(options) {
  if (!Object.hasOwn(PALETTE_DEFINITIONS, options.palette || 'current')) throw new Error(t("不支持的色带：{0}", [options.palette]));
  if (options.range !== null && options.range !== undefined) {
    const {min, max} = options.range;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) throw new Error(t('手动色域需要有限数值，且最小值必须小于最大值。'));
  }
}

export const PALETTE_GLSL = `
uniform vec3 colorStops[9];
vec3 paletteColor(float value) {
  float t = clamp(value, 0.0, 1.0) * 8.0;
  if (t <= 1.0) return mix(colorStops[0], colorStops[1], t);
  if (t <= 2.0) return mix(colorStops[1], colorStops[2], t - 1.0);
  if (t <= 3.0) return mix(colorStops[2], colorStops[3], t - 2.0);
  if (t <= 4.0) return mix(colorStops[3], colorStops[4], t - 3.0);
  if (t <= 5.0) return mix(colorStops[4], colorStops[5], t - 4.0);
  if (t <= 6.0) return mix(colorStops[5], colorStops[6], t - 5.0);
  if (t <= 7.0) return mix(colorStops[6], colorStops[7], t - 6.0);
  return mix(colorStops[7], colorStops[8], t - 7.0);
}`;
