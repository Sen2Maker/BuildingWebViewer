import { t } from '../shared/i18n.js';

/** Inria 3DGS constants. f_dc is degree 0; f_rest is bands 1..15 per channel, R then G then B. */
export const GS_SH_C0 = 0.28209479177387814;
const GS_SH_C1 = 0.4886025119029199;
const GS_SH_C2 = [1.0925484305920792, -1.0925484305920792, 0.31539156525252005, -1.0925484305920792, 0.5462742152960396];
const GS_SH_C3 = [-0.5900435899266435, 2.890611442640554, -0.4570457994644658, 0.3731763325901154, -0.4570457994644658, 1.445305721320277, -0.5900435899266435];
const GS_PLY_TYPES = {char:1,uchar:1,int8:1,uint8:1,short:2,ushort:2,int16:2,uint16:2,int:4,uint:4,int32:4,uint32:4,float:4,float32:4,double:8,float64:8};


export function gsSigmoid(value) {
  if (value >= 0) { const e = Math.exp(-value); return 1 / (1 + e); }
  const e = Math.exp(value); return e / (1 + e);
}

/** Row-major rotation. Quaternion is Inria order (w, x, y, z), not (x, y, z, w). */
export function gsRotationRows(quaternion) {
  const w = quaternion[0], x = quaternion[1], y = quaternion[2], z = quaternion[3];
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}

/**
 * Final sRGB-ish color before clamping is 0.5 + SH(view).
 * `dir` is the Inria vector from the camera toward the Gaussian.
 */
export function gsShadeRGB(dc, rest, dir, degree) {
  const x = dir[0], y = dir[1], z = dir[2];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, yz = y * z, xz = x * z;
  return [0, 1, 2].map(channel => {
    let value = GS_SH_C0 * dc[channel];
    if (degree > 0 && rest) {
      const base = channel * 15;
      value += -GS_SH_C1 * y * rest[base] + GS_SH_C1 * z * rest[base + 1] - GS_SH_C1 * x * rest[base + 2];
      if (degree > 1) {
        value += GS_SH_C2[0] * xy * rest[base + 3] + GS_SH_C2[1] * yz * rest[base + 4] + GS_SH_C2[2] * (2 * zz - xx - yy) * rest[base + 5] + GS_SH_C2[3] * xz * rest[base + 6] + GS_SH_C2[4] * (xx - yy) * rest[base + 7];
        if (degree > 2) {
          value += GS_SH_C3[0] * y * (3 * xx - yy) * rest[base + 8] + GS_SH_C3[1] * xy * z * rest[base + 9] + GS_SH_C3[2] * y * (4 * zz - xx - yy) * rest[base + 10] + GS_SH_C3[3] * z * (2 * zz - 3 * xx - 3 * yy) * rest[base + 11] + GS_SH_C3[4] * x * (4 * zz - xx - yy) * rest[base + 12] + GS_SH_C3[5] * z * (xx - yy) * rest[base + 13] + GS_SH_C3[6] * x * (xx - 3 * yy) * rest[base + 14];
        }
      }
    }
    const color = value + 0.5;
    return color < 0 ? 0 : color > 1 ? 1 : color;
  });
}

function gsPlyBytes(buffer) {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  throw Error(t('只支持二进制小端、float 属性的高斯 PLY。'));
}

function gsPlyHeader(bytes) {
  const probe = Math.min(bytes.length, 262144);
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, probe));
  const marker = head.indexOf('end_header');
  if (marker < 0) throw Error(t('只支持二进制小端、float 属性的高斯 PLY。'));
  let end = marker + 'end_header'.length;
  if (head.charCodeAt(end) === 13) end += 1;
  if (head.charCodeAt(end) === 10) end += 1;
  const lines = head.slice(0, marker).split(/\r?\n/);
  if (lines[0]?.trim() !== 'ply') throw Error(t('只支持二进制小端、float 属性的高斯 PLY。'));
  const format = lines.find(line => line.startsWith('format '))?.trim();
  if (format !== 'format binary_little_endian 1.0') throw Error(t('只支持二进制小端、float 属性的高斯 PLY。'));
  let count = 0, inVertex = false, stride = 0;
  const fields = new Map();
  for (const line of lines) {
    if (line.startsWith('element ')) {
      inVertex = line.startsWith('element vertex ');
      if (!inVertex && Number(line.trim().split(/\s+/)[2]) > 0) throw Error('仅支持高斯 vertex PLY，不支持附加网格元素 / Non-vertex elements are not supported');
      if (inVertex) count = Number(line.slice('element vertex '.length));
      continue;
    }
    if (!inVertex || !line.startsWith('property ')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts[1] === 'list') throw Error(t('这个 PLY 不是三维高斯泼溅结果（需要 opacity、scale、rot 和 f_dc）。普通点云请使用点云查看器。'));
    const size = GS_PLY_TYPES[parts[1]];
    if (!size) throw Error(t('只支持二进制小端、float 属性的高斯 PLY。'));
    fields.set(parts[2], {offset: stride, size, type: parts[1]});
    stride += size;
  }
  if (!Number.isInteger(count) || count < 0) throw Error(t('高斯 PLY 为空。'));
  return {headerEnd: end, count, stride, fields, header: head.slice(0, end)};
}

function gsPlyFloat(fields, name) {
  const field = fields.get(name);
  if (!field || (field.type !== 'float' && field.type !== 'float32')) {
    throw Error(t('这个 PLY 不是三维高斯泼溅结果（需要 opacity、scale、rot 和 f_dc）。普通点云请使用点云查看器。'));
  }
  return field.offset;
}

export function gsTrainingAngles(position, target) {
  const dx = position[0] - target[0], dy = position[1] - target[1], dz = position[2] - target[2];
  const length = Math.hypot(dx, dy, dz) || 1;
  const elevation = Math.asin(Math.max(-1, Math.min(1, dz / length))) * 180 / Math.PI;
  const azimuth = Math.atan2(dy, dx) * 180 / Math.PI;
  return {elevation, azimuth};
}

export function gsParseCameras(text) {
  const value = JSON.parse(text);
  if (!Array.isArray(value)) throw Error(t('不是训练相机 JSON（需要 position 数组）。'));
  const cameras = [];
  for (const item of value) {
    if (!item || !Array.isArray(item.position) || item.position.length < 3 || item.position.slice(0, 3).some(number => !Number.isFinite(Number(number)))) continue;
    cameras.push({
      id: item.id ?? cameras.length,
      name: String(item.img_name || item.id || cameras.length + 1),
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      position: item.position.slice(0, 3).map(Number),
      rotation: item.rotation, fx: Number(item.fx), fy: Number(item.fy),
    });
  }
  if (!cameras.length) throw Error(t('不是训练相机 JSON（需要 position 数组）。'));
  return cameras;
}

/** Parse an Inria-style binary PLY into compact Gaussian arrays. `vertexLimit` is for truncated test buffers. */
export async function gsParseGaussianPly(buffer, {includeRest = true, vertexLimit = 0, onProgress = () => {}} = {}) {
  const bytes = gsPlyBytes(buffer);
  const header = gsPlyHeader(bytes);
  const fields = header.fields;
  const x = gsPlyFloat(fields, 'x'), y = gsPlyFloat(fields, 'y'), z = gsPlyFloat(fields, 'z');
  const dc = [0, 1, 2].map(index => gsPlyFloat(fields, `f_dc_${index}`));
  const opacity = gsPlyFloat(fields, 'opacity');
  const scale = [0, 1, 2].map(index => gsPlyFloat(fields, `scale_${index}`));
  const rot = [0, 1, 2, 3].map(index => gsPlyFloat(fields, `rot_${index}`));
  const restOffsets = [];
  for (let index = 0; index < 45; index += 1) {
    const field = fields.get(`f_rest_${index}`);
    if (!field || (field.type !== 'float' && field.type !== 'float32')) break;
    restOffsets.push(field.offset);
  }
  const hasRest = restOffsets.length === 45;
  let count = header.count;
  if (vertexLimit > 0) count = Math.min(count, vertexLimit);

  const available = Math.floor((bytes.length - header.headerEnd) / header.stride);
  if (count > available) throw Error(t('高斯 PLY 比文件头声明的更短，文件可能不完整。'));
  if (!count) throw Error(t('高斯 PLY 为空。'));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const centers = new Float32Array(count * 3), colors = new Float32Array(count * 3), alpha = new Float32Array(count);
  const scales = new Float32Array(count * 3), quat = new Float32Array(count * 4);
  const rest = includeRest && hasRest ? new Float32Array(count * 45) : null;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < count; index += 1) {
    const base = header.headerEnd + index * header.stride;
    const position = [view.getFloat32(base + x, true), view.getFloat32(base + y, true), view.getFloat32(base + z, true)];
    if (!position.every(Number.isFinite)) throw Error('PLY 包含无效坐标 / Invalid PLY coordinates');
    centers.set(position, index * 3);
    if (position.every(Number.isFinite)) for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], position[axis]); max[axis] = Math.max(max[axis], position[axis]);
    }
    colors[index * 3] = view.getFloat32(base + dc[0], true);
    colors[index * 3 + 1] = view.getFloat32(base + dc[1], true);
    colors[index * 3 + 2] = view.getFloat32(base + dc[2], true);
    alpha[index] = gsSigmoid(view.getFloat32(base + opacity, true));
    for (let axis = 0; axis < 3; axis += 1) {
      const value = Math.exp(view.getFloat32(base + scale[axis], true));
      if (!Number.isFinite(value) || value > 3.402823466e38) throw Error('PLY scale exceeds float32 range');
      scales[index * 3 + axis] = value;
    }
    let w = view.getFloat32(base + rot[0], true), qx = view.getFloat32(base + rot[1], true);
    let qy = view.getFloat32(base + rot[2], true), qz = view.getFloat32(base + rot[3], true);
    let length = Math.hypot(w, qx, qy, qz);
    if (!(length > 0)) { w = 1; qx = qy = qz = 0; length = 1; }
    quat.set([w / length, qx / length, qy / length, qz / length], index * 4);
    if (rest) for (let band = 0; band < 45; band += 1) { const coefficient = view.getFloat32(base + restOffsets[band], true); if (!Number.isFinite(coefficient)) throw Error('PLY contains invalid SH coefficients'); rest[index * 45 + band] = coefficient; }
    if (![colors[index*3],colors[index*3+1],colors[index*3+2],alpha[index],scales[index*3],scales[index*3+1],scales[index*3+2],...quat.subarray(index*4,index*4+4)].every(Number.isFinite)) throw Error('PLY contains non-finite Gaussian attributes');
    if ((index & 32767) === 0) { onProgress(index, count); await new Promise(resolve => setTimeout(resolve, 0)); }
  }
  onProgress(count, count);
  if (!min.every(Number.isFinite)) throw Error(t('高斯 PLY 没有有效坐标。'));
  return {count, sourceCount: header.count, centers, dc: colors, opacity: alpha, scale: scales, quat, rest, hasRest, bounds: {min, max}, source: {bytes, headerEnd: header.headerEnd, stride: header.stride, header: header.header}};
}
