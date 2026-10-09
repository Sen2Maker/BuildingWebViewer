import { orderedPointExportSchema } from './point-dataset.js';
/** Streaming serializers. Coordinates are always taken from the original Float64 positions. */
export function pointExportSchema(items, {sourceIds = true} = {}) {
  if (!items.length) throw Error('没有可导出的点云');
  if(items.some(item=>item.cloud?.columnOrder || item.cloud?.semantics))return orderedPointExportSchema(items,{sourceIds});
  let count = 0;
  const keys = new Set();
  for (const {cloud} of items) {
    if (!cloud || !Number.isSafeInteger(cloud.count) || cloud.count < 1 || cloud.positions.length !== cloud.count * 3) throw Error('点云数据不完整');
    count += cloud.count;
    for (const [key, values] of Object.entries(cloud.fields || {})) {
      if (values.length !== cloud.count) throw Error(`属性 ${key} 长度不匹配`);
      if (!['x', 'y', 'z'].includes(key.toLowerCase())) keys.add(key);
    }
  }
  if (!Number.isSafeInteger(count) || count > 4294967295) throw Error('导出点数超过支持范围');
  const properties = ['x', 'y', 'z'].map((name, axis) => ({name, axis})), used = new Set(['x', 'y', 'z']);
  function unique(raw) {
    const base = raw.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'attribute';
    let name = base, suffix = 2;
    while (used.has(name)) name = `${base}_${suffix++}`;
    used.add(name); return name;
  }
  const hasRGB = items.some(({cloud}) => cloud.rgb);
  // Canonical colors remain usable even when only some sources have RGB.
  if (hasRGB) {
    for (const [channel, name] of ['red', 'green', 'blue'].entries()) properties.push({name: unique(name), channel});
    properties.push({name: unique('rgb_valid'), rgbValid: true});
  }
  const colorKeys = new Set(['r', 'g', 'b', 'red', 'green', 'blue', 'diffuse_red', 'diffuse_green', 'diffuse_blue', 'rgb', 'rgba', 'rgb_valid']);
  for (const key of keys) properties.push({name: unique(hasRGB && colorKeys.has(key.toLowerCase()) ? `original_${key}` : key), key});
  if (sourceIds) properties.push({name: unique('source_id'), source: true});
  return {count, properties};
}

export async function writePointExport(items, {format = 'ply', sourceIds = true, signal, onProgress = () => {}, write, chunkPoints = 4096} = {}) {
  if (!['ply', 'txt'].includes(format) || typeof write !== 'function') throw Error('导出格式或写入目标无效');
  if (!Number.isInteger(chunkPoints) || chunkPoints < 1 || chunkPoints > 65536) throw Error('写出块大小无效');
  const {count, properties} = pointExportSchema(items, {sourceIds});
  const encoder = new TextEncoder();
  const check = () => { if (signal?.aborted) throw new DOMException('已取消', 'AbortError'); };
  const comments = ['BuildingWebViewer: coordinates as selected; concatenation without registration or deduplication.'];
  if(properties.some(p=>p.sources)) {
    const first=items[0].cloud.semantics||{}, tags=Object.create(null), custom=Object.create(null);
    for(const property of properties) {
      const index=property.sources?.findIndex(Boolean) ?? -1, spec=property.sources?.[index], semantics=items[index]?.cloud.semantics;
      tags[property.name]=semantics?.tags?.[spec?.key]||'scalar';
      if(tags[property.name]==='custom')custom[property.name]=semantics.custom[spec.key];
    }
    comments.push(`bwv_columns ${JSON.stringify({tags,custom,rgbScale:first.rgbScale||'auto',hsvScale:first.hsvScale||'degrees',colorSpace:first.colorSpace||'auto'})}`);
  }
  items.forEach(({name, cloud}, id) => {
    comments.push(`source ${id} ${JSON.stringify({name, count: cloud.count, originalTotal: cloud.totalCount, processing: cloud.processing || null, semantics: cloud.semantics || null, columnOrder: cloud.columnOrder || null})}`);
  });
  for (const property of properties) if (property.key && property.name !== property.key) comments.push(`property_map ${property.name} ${JSON.stringify(property.key)}`);
  // ASCII-safe metadata keeps the PLY header compatible with byte-oriented readers.
  const safe = text => text.replace(/[^\x20-\x7e]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const header = format === 'ply'
    ? ['ply', 'format binary_little_endian 1.0', ...comments.map(text => `comment ${safe(text)}`), `element vertex ${count}`, ...properties.map(p => `property double ${p.name}`), 'end_header', ''].join('\n')
    : [...comments.map(text => `# ${safe(text)}`), properties.map(p => p.name).join(' '), ''].join('\n');
  check(); await write(encoder.encode(header));
  let done = 0;
  for (const [source, {cloud}] of items.entries()) {
    const value = (property, i) => {
      if(property.sources) {const spec=property.sources[source];return spec?.axis!==undefined?cloud.positions[i*3+spec.axis]:spec?cloud.fields[spec.key][i]:NaN;}
      if (property.axis !== undefined) return cloud.positions[i * 3 + property.axis];
      if (property.channel !== undefined) return cloud.rgb?.[i * 3 + property.channel] ?? 0;
      if (property.rgbValid) return cloud.rgb && cloud.fields.rgb_valid?.[i] !== 0 ? 1 : 0;
      if (property.source) return source;
      return cloud.fields[property.key]?.[i] ?? NaN;
    };
    for (let start = 0; start < cloud.count; start += chunkPoints) {
      check(); const end = Math.min(start + chunkPoints, cloud.count);
      let bytes;
      if (format === 'ply') {
        bytes = new Uint8Array((end - start) * properties.length * 8); const view = new DataView(bytes.buffer);
        let offset = 0;
        for (let i = start; i < end; i++) for (const property of properties) { view.setFloat64(offset, value(property, i), true); offset += 8; }
      } else {
        const lines = [];
        for (let i = start; i < end; i++) lines.push(properties.map(property => String(value(property, i))).join(' '));
        bytes = encoder.encode(lines.join('\n') + '\n');
      }
      await write(bytes); done += end - start; onProgress({done, total: count});
      // Yield for cancellation and canvas interaction, including Blob fallback writes.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  check(); return {count, properties};
}
