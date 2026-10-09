import { t } from '../shared/i18n.js';
/** Combine already sampled clouds without moving their original coordinates. */
const CLOUD_SOURCE_PALETTE = [
  [57, 126, 179], [222, 123, 68], [65, 151, 113], [157, 102, 181],
  [205, 174, 56], [55, 157, 173], [206, 105, 148], [125, 139, 76],
  [105, 122, 183], [166, 117, 91], [106, 158, 158], [187, 120, 105],
];

function cloudSourceColor(name) {
  // FNV-1a keeps a file's color stable when the selection order changes.
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619) >>> 0;
  return CLOUD_SOURCE_PALETTE[hash % CLOUD_SOURCE_PALETTE.length].map(channel => channel / 255);
}

function cloudMergeError(name, message) { throw Error(t("点云 {0}：{1}", [name, message])); }

/**
 * items: [{name, cloud}], where each cloud is a parsePointCloud/readPointCloud result.
 * Preserves all scalar fields. Missing attributes / RGB samples are NaN, never zero.
 * Inputs are not mutated. A singleton shares its read-only sample arrays; merged arrays,
 * bounds, notes and source metadata are newly allocated.
 */
export function mergePointClouds(items) {
  if (!Array.isArray(items)) throw TypeError(t('点云合并需要文件列表'));
  if (!items.length) return null;
  let count = 0, totalCount = 0;
  const fieldNames = new Set(), records = [];
  const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (let index = 0; index < items.length; index++) {
    const item = items[index], cloud = item?.cloud, name = String(item?.name ?? t("文件 {0}", [index + 1]));
    if (!cloud || !Number.isSafeInteger(cloud.count) || cloud.count < 1 ||
        !Number.isSafeInteger(cloud.totalCount) || cloud.totalCount < cloud.count) {
      cloudMergeError(name, t('展示点数或总点数无效'));
    }
    if (!cloud.positions || cloud.positions.length !== cloud.count * 3) cloudMergeError(name, t('XYZ 数组长度与点数不一致'));
    if (!Array.isArray(cloud.bounds) || cloud.bounds.length !== 2 || cloud.bounds.some(point => !point || point.length !== 3)) cloudMergeError(name, t('坐标范围无效'));
    for (let axis = 0; axis < 3; axis++) {
      const low = cloud.bounds[0][axis], high = cloud.bounds[1][axis];
      if (!Number.isFinite(low) || !Number.isFinite(high) || low > high) cloudMergeError(name, t('坐标范围无效'));
      bounds[0][axis] = Math.min(bounds[0][axis], low); bounds[1][axis] = Math.max(bounds[1][axis], high);
    }
    for (const [field, values] of Object.entries(cloud.fields || {})) {
      if (!values || values.length !== cloud.count) cloudMergeError(name, t("属性 {0} 长度与点数不一致", [field]));
      fieldNames.add(field);
    }
    if (cloud.rgb != null && cloud.rgb.length !== cloud.count * 3) cloudMergeError(name, t('RGB 数组长度与点数不一致'));
    records.push({name, cloud, start: count});
    count += cloud.count; totalCount += cloud.totalCount;
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(totalCount)) cloudMergeError(name, t('合并点数超出可表示范围'));
  }
  if (records.length === 1) {
    const {name, cloud} = records[0];
    return {...cloud, bounds, fields: Object.assign(Object.create(null), cloud.fields || {}),
      notes: [...new Set((cloud.notes || []).filter(note => typeof note === 'string' && note.trim()))],
      sources: [{name, start: 0, count, totalCount, color: cloudSourceColor(name)}]};
  }
  const positions = new Float64Array(count * 3), fields = Object.create(null);
  for (const field of fieldNames) fields[field] = new Float32Array(count).fill(NaN);
  const anyRGB = records.some(({cloud}) => cloud.rgb != null);
  const rgb = anyRGB ? new Float32Array(count * 3).fill(NaN) : null;
  const sources = [], noteGroups = new Map(), missingRGB = [];
  for (const {name, cloud, start} of records) {
    positions.set(cloud.positions, start * 3);
    for (const [field, values] of Object.entries(cloud.fields || {})) fields[field].set(values, start);
    if (rgb && cloud.rgb != null) rgb.set(cloud.rgb, start * 3);
    else if (rgb) missingRGB.push(name);
    sources.push({name, start, count: cloud.count, totalCount: cloud.totalCount, color: cloudSourceColor(name)});
    for (const note of new Set(cloud.notes || [])) {
      if (typeof note !== 'string' || !note.trim()) continue;
      if (!noteGroups.has(note)) noteGroups.set(note, []);
      noteGroups.get(note).push(name);
    }
  }
  const notes = records.length > 1
    ? [t("叠加 {0} 个文件：显示 {1} / {2} 点；保留原始坐标，范围覆盖全部文件的原始点。", [records.length, count.toLocaleString(), totalCount.toLocaleString()])]
    : [];
  for (const [note, names] of noteGroups) {
    // Explain a shared parser note once, retaining its file scope.
    if (records.length === 1) notes.push(note);
    else notes.push(`${names.length === records.length ? t('各文件') : [...new Set(names)].join('、')}：${note}`);
  }
  const missingFields = [...fieldNames].filter(field => records.some(({cloud}) => !Object.hasOwn(cloud.fields || {}, field)));
  if (missingFields.length) notes.push(t("部分文件缺少属性 {0}，对应点的属性保留为 NaN。", [missingFields.join('、')]));
  if (missingRGB.length) notes.push(t("{0} 没有 RGB，合并后的对应 RGB 值保留为 NaN；可使用高度、属性或按文件着色。", [[...new Set(missingRGB)].join('、')]));
  return {positions, count, totalCount, bounds, fields, rgb, notes, sources};
}


/** Scene metadata only: no concatenation of point coordinates or scalar arrays. */
export function describePointClouds(items) {
  if (!items.length) return null;
  const fields = Object.create(null), bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  const sources = [], notes = new Set(); let count = 0, totalCount = 0, rgb = false;
  for (const {name, cloud} of items) {
    for (let axis = 0; axis < 3; axis++) {
      bounds[0][axis] = Math.min(bounds[0][axis], cloud.bounds[0][axis]);
      bounds[1][axis] = Math.max(bounds[1][axis], cloud.bounds[1][axis]);
    }
    for (const key of Object.keys(cloud.fields || {})) fields[key] = null;
    sources.push({name, start: count, count: cloud.count, totalCount: cloud.totalCount, color: cloudSourceColor(name)});
    count += cloud.count; totalCount += cloud.totalCount; rgb ||= !!cloud.rgb;
    for (const note of cloud.notes || []) notes.add(note);
  }
  return {count, totalCount, bounds, fields, rgb, sources, notes: [...notes]};
}
