import { drawCheck, drawSurfaces, drawWire } from './drawing-geometry.js';
import { t } from '../shared/i18n.js';

/** Parametric sampling into an ordinary point cloud. Includes drawn lines, planar polygons and extruded volumes. */
export const GEN_LIMIT = 2000000;
export const GEN_PREVIEW = 40000;
const GEN_TINY = 1e-9;

const genLen = value => Math.hypot(value[0], value[1], value[2]);
function genUnit(value) {
  const length = genLen(value);
  if (!(length > GEN_TINY)) throw Error(t('法向长度无效'));
  return [value[0] / length, value[1] / length, value[2] / length];
}
function genFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error(t('{0}必须是有限数值', [t(label)]));
  return value;
}
function genPositive(value, label) {
  const number = genFinite(value, label);
  if (!(number > 0)) throw Error(t('{0}必须大于 0', [t(label)]));
  return number;
}
function genFlag(value, label) {
  if (typeof value !== 'boolean') throw Error(t('{0}开关无效', [t(label)]));
  return value;
}
function genRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
function genGauss(rng) {
  let u = rng(), v = rng();
  if (u < 1e-12) u = 1e-12;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}
function genIntervals(length, spacing) {
  return Math.max(1, Math.round(length / spacing));
}

export function genCheck(part) {
  if (!part || typeof part !== 'object') throw Error(t('形体参数无效'));
  if (!Number.isInteger(part.id) || part.id < 1) throw Error(t('部件编号无效'));
  const place = part.place || {}, shape = part.shape || {}, sampling = part.sampling || {};
  for (const [value, label] of [[place.x, '位置 X'], [place.y, '位置 Y'], [place.z, '位置 Z']]) genFinite(value, label);
  const spacing = genPositive(sampling.spacing, '间距');
  if (spacing > 1e6) throw Error(t('间距过大'));
  const noise = genFinite(sampling.noise, '噪声');
  if (noise < 0) throw Error(t('噪声不能为负'));
  if (!Number.isInteger(sampling.seed) || sampling.seed < 0 || sampling.seed > 4294967295) throw Error(t('种子需为 0 到 4294967295 的整数'));
  if (!['grid', 'stratified'].includes(sampling.pattern)) throw Error(t('采样分布无效'));
  const type = shape.type;
  if (['stroke','polygon','extrusion'].includes(type)) { drawCheck(shape); return part; }
  if (!['ground', 'box', 'gable'].includes(type)) throw Error(t('未知形体'));
  genPositive(shape.width, type === 'gable' ? '开间' : '宽度');
  genPositive(shape.depth, type === 'gable' ? '进深' : '深度');
  genFinite(shape.groundZ, '地面标高');
  if (type === 'box') genPositive(shape.height, '高度');
  if (type === 'gable') {
    const eave = genFinite(shape.eaveHeight, '檐高');
    const ridge = genFinite(shape.ridgeHeight, '脊高');
    if (eave < 0) throw Error(t('檐高不能为负'));
    if (ridge < eave) throw Error(t('脊高不能低于檐高'));
    const overhang = genFinite(shape.overhang, '出檐');
    if (overhang < 0) throw Error(t('出檐不能为负'));
    genFlag(shape.walls, '墙');
    genFlag(shape.gables, '山墙');
  }
  if (type === 'box') genFlag(shape.interior, '内部');
  return part;
}

function genPushQuad(list, origin, u, v, normal, surface) {
  if (genLen(u) > GEN_TINY && genLen(v) > GEN_TINY) list.push({kind: 'quad', origin, u, v, normal, surface});
}

function genSurfaces(part) {
  const {shape, place} = part, list = [];
  if (['stroke','polygon','extrusion'].includes(shape.type)) return drawSurfaces(part);
  if (shape.type === 'ground') {
    genPushQuad(list, [place.x - shape.width / 2, place.y - shape.depth / 2, place.z + shape.groundZ], [shape.width, 0, 0], [0, shape.depth, 0], [0, 0, 1], 1);
    return list;
  }
  if (shape.type === 'box') {
    const min = [place.x - shape.width / 2, place.y - shape.depth / 2, place.z + shape.groundZ];
    const size = [shape.width, shape.depth, shape.height];
    const max = min.map((value, axis) => value + size[axis]);
    const face = (origin, u, v, normal) => genPushQuad(list, origin, u, v, normal, 2);
    face(min, [size[0], 0, 0], [0, size[1], 0], [0, 0, -1]);
    face([min[0], min[1], max[2]], [size[0], 0, 0], [0, size[1], 0], [0, 0, 1]);
    face(min, [0, size[1], 0], [0, 0, size[2]], [-1, 0, 0]);
    face([max[0], min[1], min[2]], [0, size[1], 0], [0, 0, size[2]], [1, 0, 0]);
    face(min, [size[0], 0, 0], [0, 0, size[2]], [0, -1, 0]);
    face([min[0], max[1], min[2]], [size[0], 0, 0], [0, 0, size[2]], [0, 1, 0]);
    if (shape.interior) list.push({kind: 'interior', min, max});
    return list;
  }
  const hx = shape.width / 2, hy = shape.depth / 2, span = hx + shape.overhang;
  const y0 = place.y - hy - shape.overhang, yLen = shape.depth + shape.overhang * 2;
  const z0 = place.z + shape.groundZ, zE = z0 + shape.eaveHeight, rise = shape.ridgeHeight - shape.eaveHeight;
  if (rise === 0) genPushQuad(list, [place.x - span, y0, zE], [0, yLen, 0], [span * 2, 0, 0], [0, 0, 1], 3);
  else {
    genPushQuad(list, [place.x - span, y0, zE], [0, yLen, 0], [span, 0, rise], [-rise, 0, span], 3);
    genPushQuad(list, [place.x + span, y0, zE], [0, yLen, 0], [-span, 0, rise], [rise, 0, span], 3);
  }
  if (shape.walls) {
    const x0 = place.x - hx, x1 = place.x + hx, ya = place.y - hy, yb = place.y + hy;
    genPushQuad(list, [x0, ya, z0], [0, shape.depth, 0], [0, 0, shape.eaveHeight], [-1, 0, 0], 2);
    genPushQuad(list, [x1, ya, z0], [0, shape.depth, 0], [0, 0, shape.eaveHeight], [1, 0, 0], 2);
    genPushQuad(list, [x0, ya, z0], [shape.width, 0, 0], [0, 0, shape.eaveHeight], [0, -1, 0], 2);
    genPushQuad(list, [x0, yb, z0], [shape.width, 0, 0], [0, 0, shape.eaveHeight], [0, 1, 0], 2);
  }
  if (shape.gables && rise > 0) {
    const spanAcross = Math.max(shape.width, rise);
    for (const [y, direction] of [[place.y - hy, -1], [place.y + hy, 1]]) {
      list.push({kind: 'triangle', span: spanAcross, normal: [0, direction, 0], surface: 4,
        a: [place.x - hx, y, zE], b: [place.x + hx, y, zE], c: [place.x, y, zE + rise]});
    }
  }
  return list;
}

function genQuadCount(surface, sampling) {
  const uLen = genLen(surface.u), vLen = genLen(surface.v);
  if (!(uLen > GEN_TINY) || !(vLen > GEN_TINY)) return 0;
  const stepsU = genIntervals(uLen, sampling.spacing), stepsV = genIntervals(vLen, sampling.spacing);
  const across = sampling.pattern === 'grid' ? stepsU + 1 : stepsU;
  const along = sampling.pattern === 'grid' ? stepsV + 1 : stepsV;
  return across * along;
}
function genTriangleCount(surface, sampling) {
  const n = genIntervals(surface.span, sampling.spacing);
  return sampling.pattern === 'grid' ? (n + 1) * (n + 2) / 2 : n * (n + 1) / 2;
}
function genInteriorCount(surface, sampling) {
  const counts = [0, 1, 2].map(axis => {
    const length = surface.max[axis] - surface.min[axis];
    if (!(length > GEN_TINY)) return 0;
    return Math.max(0, Math.round(length / sampling.spacing) - 1);
  });
  return counts[0] * counts[1] * counts[2];
}
function genSurfaceCount(surface, sampling) {
  if (surface.kind === 'line') return Math.max(1,Math.ceil(surface.span/sampling.spacing))+1;
  if (surface.kind === 'prism') return genTriangleCount(surface,sampling)*(genIntervals(surface.height,sampling.spacing)+1);
  if (surface.kind === 'quad') return genQuadCount(surface, sampling);
  if (surface.kind === 'triangle') return genTriangleCount(surface, sampling);
  return genInteriorCount(surface, sampling);
}

export function genEstimate(part) {
  genCheck(part);
  const count = genSurfaces(part).reduce((sum, surface) => sum + genSurfaceCount(surface, part.sampling), 0);
  if (!Number.isSafeInteger(count)) throw Error(t('生成点数超出可表示范围'));
  return count;
}

function genEmitQuad(surface, sampling, rng, put) {
  const uLen = genLen(surface.u), vLen = genLen(surface.v);
  if (!(uLen > GEN_TINY) || !(vLen > GEN_TINY)) return;
  const stepsU = genIntervals(uLen, sampling.spacing), stepsV = genIntervals(vLen, sampling.spacing);
  const grid = sampling.pattern === 'grid';
  const across = grid ? stepsU + 1 : stepsU, along = grid ? stepsV + 1 : stepsV;
  const normal = genUnit(surface.normal);
  for (let j = 0; j < along; j++) for (let i = 0; i < across; i++) {
    const su = grid ? i / stepsU : (i + rng()) / stepsU;
    const sv = grid ? j / stepsV : (j + rng()) / stepsV;
    let x = surface.origin[0] + surface.u[0] * su + surface.v[0] * sv;
    let y = surface.origin[1] + surface.u[1] * su + surface.v[1] * sv;
    let z = surface.origin[2] + surface.u[2] * su + surface.v[2] * sv;
    if (sampling.noise > 0) {
      const offset = genGauss(rng) * sampling.noise;
      x += normal[0] * offset; y += normal[1] * offset; z += normal[2] * offset;
    }
    put(x, y, z, normal, surface.surface, 1);
  }
}
function genEmitTriangle(surface, sampling, rng, put) {
  const n = genIntervals(surface.span, sampling.spacing), grid = sampling.pattern === 'grid', normal = genUnit(surface.normal);
  const emit = (u, v) => {
    const w = 1 - u - v;
    let x = surface.a[0] * w + surface.b[0] * u + surface.c[0] * v;
    let y = surface.a[1] * w + surface.b[1] * u + surface.c[1] * v;
    let z = surface.a[2] * w + surface.b[2] * u + surface.c[2] * v;
    if (sampling.noise > 0) {
      const offset = genGauss(rng) * sampling.noise;
      x += normal[0] * offset; y += normal[1] * offset; z += normal[2] * offset;
    }
    put(x, y, z, normal, surface.surface, 1);
  };
  if (grid) {
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) emit(i / n, j / n);
    return;
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
    let u = (i + rng()) / n, v = (j + rng()) / n;
    if (u + v > 1) v = 1 - u;
    emit(u, v);
  }
}
function genEmitInterior(surface, sampling, rng, put) {
  const spans = [0, 1, 2].map(axis => surface.max[axis] - surface.min[axis]);
  const steps = spans.map(length => Math.round(length / sampling.spacing));
  if (steps.some((step, axis) => !(spans[axis] > GEN_TINY) || step < 2)) return;
  const grid = sampling.pattern === 'grid';
  for (let i = 1; i <= steps[0] - 1; i++) for (let j = 1; j <= steps[1] - 1; j++) for (let k = 1; k <= steps[2] - 1; k++) {
    const coordinate = (index, axis) => {
      const fraction = grid ? index / steps[axis] : Math.min(steps[axis] - 1e-9, Math.max(1e-9, index + (rng() - 0.5) * 0.5)) / steps[axis];
      return surface.min[axis] + spans[axis] * fraction;
    };
    let x = coordinate(i, 0), y = coordinate(j, 1), z = coordinate(k, 2);
    if (sampling.noise > 0) {
      x += genGauss(rng) * sampling.noise; y += genGauss(rng) * sampling.noise; z += genGauss(rng) * sampling.noise;
    }
    put(x, y, z, [0, 0, 0], 0, 0);
  }
}

function genRespace(part, spacing) {
  return {id: part.id, place: {...part.place}, shape: {...part.shape}, sampling: {...part.sampling, spacing}};
}

export function genSample(part, {color = [.5, .55, .52], maxPoints = GEN_LIMIT} = {}) {
  genCheck(part);
  if (!Number.isInteger(maxPoints) || maxPoints < 1) throw Error(t('生成点数上限无效'));
  const count = genEstimate(part);
  if (count < 1) throw Error(t('当前形体没有可采样的点。'));
  if (count > maxPoints) throw Error(t('生成点数超过 {0}，请加大间距。', [maxPoints.toLocaleString('zh-CN')]));
  const rgbColor = color?.length === 3 && color.every(value => Number.isFinite(value)) ? color.map(value => Math.min(1, Math.max(0, value))) : [.5, .55, .52];
  const positions = new Float64Array(count * 3), nx = new Float64Array(count), ny = new Float64Array(count), nz = new Float64Array(count);
  const partId = new Float64Array(count), surfaceId = new Float64Array(count), normalValid = new Float64Array(count);
  const red = new Float64Array(count), green = new Float64Array(count), blue = new Float64Array(count), rgb = new Float32Array(count * 3);
  let cursor = 0;
  const rng = genRng(part.sampling.seed);
  const put = (x, y, z, normal, surface, valid) => {
    const index = cursor++;
    positions[index * 3] = x; positions[index * 3 + 1] = y; positions[index * 3 + 2] = z;
    nx[index] = normal[0]; ny[index] = normal[1]; nz[index] = normal[2];
    partId[index] = part.id; surfaceId[index] = surface; normalValid[index] = valid;
    red[index] = rgbColor[0]; green[index] = rgbColor[1]; blue[index] = rgbColor[2];
    rgb[index * 3] = rgbColor[0]; rgb[index * 3 + 1] = rgbColor[1]; rgb[index * 3 + 2] = rgbColor[2];
  };
  for (const surface of genSurfaces(part)) {
    if (surface.kind === 'line') {
      const n=Math.max(1,Math.ceil(surface.span/part.sampling.spacing));
      for(let i=0;i<=n;i++){const u=part.sampling.pattern==='grid'||i===0||i===n?i/n:(i-.5+rng())/n;const p=surface.a.map((v,k)=>v+(surface.b[k]-v)*u+(part.sampling.noise?genGauss(rng)*part.sampling.noise:0));put(...p,[0,0,0],6,0);}
    } else if(surface.kind === 'prism') {
      const n=genIntervals(surface.height,part.sampling.spacing);
      for(let layer=0;layer<=n;layer++){const z=part.sampling.pattern==='grid'||layer===0||layer===n?layer/n:(layer-.5+rng())/n;genEmitTriangle(surface,{...part.sampling,noise:0},rng,(x,y,z0)=>{const p=[x,y,z0].map((v,k)=>v+surface.normal[k]*z*surface.height+(part.sampling.noise?genGauss(rng)*part.sampling.noise:0));put(...p,[0,0,0],0,0);});}
    } else if (surface.kind === 'quad') genEmitQuad(surface, part.sampling, rng, put);
    else if (surface.kind === 'triangle') genEmitTriangle(surface, part.sampling, rng, put);
    else genEmitInterior(surface, part.sampling, rng, put);
  }
  if (cursor !== count) throw Error(t('采样数量和估计不一致。'));
  const order = ['x', 'y', 'z', 'nx', 'ny', 'nz', 'red', 'green', 'blue', 'part', 'surface', 'normal_valid'];
  return {count, totalCount: count, positions, rgb, fields: {nx, ny, nz, red, green, blue, part: partId, surface: surfaceId, normal_valid: normalValid},
    columnOrder: order, semantics: {order, tags: {nx: 'nx', ny: 'ny', nz: 'nz', red: 'red', green: 'green', blue: 'blue', part: 'classification', surface: 'scalar', normal_valid: 'scalar'},
      custom: {}, rgbScale: '1', hsvScale: 'degrees', colorSpace: 'rgb'},
    processing: {tool: 'generate', recipe: 1, shape: {...part.shape}, place: {...part.place}, sampling: {...part.sampling}}};
}

export function genPreviewPart(part, cap = GEN_PREVIEW) {
  genCheck(part);
  if (!Number.isInteger(cap) || cap < 4) throw Error(t('预览点数无效'));
  let spacing = part.sampling.spacing, estimate = genEstimate(part);
  if (estimate > cap) {
    spacing *= Math.sqrt(estimate / cap);
    for (let attempt = 0; attempt < 16 && estimate > cap; attempt++) {
      estimate = genEstimate(genRespace(part, spacing));
      if (estimate > cap) spacing *= 1.25;
    }
  }
  if (estimate > cap) throw Error(t('预览采样失败，请加大间距。'));
  return genSample(genRespace(part, spacing), {maxPoints: Math.max(cap, 1)});
}

export function genWire(parts) {
  const vertices = [], edges = [];
  const add = (start, end) => {
    edges.push([vertices.length, vertices.length + 1]);
    vertices.push([start[0], start[1], start[2]], [end[0], end[1], end[2]]);
  };
  for (const part of parts) {
    if (part.visible === false) continue;
    genCheck(part);
    if(['stroke','polygon','extrusion'].includes(part.shape.type)){const wire=drawWire(part);for(const[a,b]of wire.edges)add(wire.vertices[a],wire.vertices[b]);continue;}
    for (const surface of genSurfaces(part)) {
      if (surface.kind === 'quad') {
        const corner = (u, v) => [surface.origin[0] + surface.u[0] * u + surface.v[0] * v, surface.origin[1] + surface.u[1] * u + surface.v[1] * v, surface.origin[2] + surface.u[2] * u + surface.v[2] * v];
        const a = corner(0, 0), b = corner(1, 0), c = corner(1, 1), d = corner(0, 1);
        add(a, b); add(b, c); add(c, d); add(d, a);
      } else if (surface.kind === 'triangle') { add(surface.a, surface.b); add(surface.b, surface.c); add(surface.c, surface.a); }
    }
  }
  return {vertices, edges};
}
