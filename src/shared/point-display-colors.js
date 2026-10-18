import { t } from './i18n.js';
import { samplePalette } from './palettes.js';
const pointColorClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** Same RGB/scalar fallback rules for standalone clouds and mesh overlays. */
export function pointDisplayColors(cloud,count,options){
    const values = new Float32Array(count * 3), fields = cloud?.fields || {};
    let mode = options.colorMode, fallback = null, range = null;
    // Explicit field selection also supports attributes named height, solid, rgb, or file.
    const fieldName = mode.startsWith('field:') ? mode.slice(6) : mode;
    if (!cloud || !count) return { values, mode, fallback, range };
    const validField = name => fields[name] && fields[name].length >= count;
    let rgb = null, channels = null, sources = null;
    if (mode === 'file') {
      sources = Array.isArray(cloud.sources) ? [...cloud.sources].sort((a, b) => (a?.start ?? 0) - (b?.start ?? 0)) : [];
      let covered = 0;
      const valid = sources.length > 0 && sources.every(source => {
        if (!source || !Number.isSafeInteger(source.start) || !Number.isSafeInteger(source.count) || source.start !== covered || source.count < 0 || source.count > count - covered) return false;
        if ((!Array.isArray(source.color) && !ArrayBuffer.isView(source.color)) || source.color.length !== 3 || !Array.from(source.color).every(Number.isFinite)) return false;
        covered += source.count;
        return true;
      });
      if (!valid || covered !== count) { mode = 'height'; fallback = t('未找到完整的点云文件来源信息，已按高度着色。'); }
    } else if (mode === 'rgb') {
      if (options.rgbFields?.length === 3 && options.rgbFields.every(validField)) channels = options.rgbFields.map(name => fields[name]);
      else if (cloud.rgb?.length >= count * 3) rgb = cloud.rgb;
      else { mode = 'height'; fallback = t('未找到可用的 RGB 数据，已按高度着色。'); }
    } else if (!['height', 'solid'].includes(mode) && !validField(fieldName)) {
      fallback = t("字段 {0} 不存在，已按高度着色。", [fieldName]); mode = 'height';
    }
    if (mode === 'file') {
      for (const source of sources) {
        const color = Array.from(source.color, value => pointColorClamp(value, 0, 1));
        for (let i = source.start; i < source.start + source.count; i++) {
          values[i * 3] = color[0]; values[i * 3 + 1] = color[1]; values[i * 3 + 2] = color[2];
        }
      }
    } else if (mode === 'rgb') {
      let maximum = 0;
      for (let i = 0; i < count; i++) for (let channel = 0; channel < 3; channel++) {
        const value = channels ? channels[channel][i] : rgb[i * 3 + channel];
        if (Number.isFinite(value)) maximum = Math.max(maximum, value);
      }
      const divisor = maximum <= 1 ? 1 : maximum <= 255 ? 255 : maximum <= 65535 ? 65535 : maximum;
      for (let i = 0; i < count; i++) for (let channel = 0; channel < 3; channel++) {
        const value = channels ? channels[channel][i] : rgb[i * 3 + channel];
        values[i * 3 + channel] = Number.isFinite(value) ? pointColorClamp(value / divisor, 0, 1) : .55;
      }
    } else if (mode !== 'solid') {
      const scalar = mode === 'height' ? index => cloud.positions[index * 3 + 2] : index => fields[fieldName][index];
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < count; i++) { const value = scalar(i); if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value); } }
      if (min !== Infinity) range = options.range ? {...options.range} : { min, max };
      if (range) { min = range.min; max = range.max; }
      for (let i = 0; i < count; i++) {
        const value = scalar(i);
        if (!Number.isFinite(value)) { values.set([.55, .59, .61], i * 3); continue; }
        const t = max > min ? pointColorClamp((value - min) / (max - min), 0, 1) : .5;
        values.set(samplePalette(t, options.palette, options.reverse), i * 3);
      }
    }
    return { values, mode, fallback, range };
  }
