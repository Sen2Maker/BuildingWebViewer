import { samplePalette, paletteUniforms, validatePaletteOptions, PALETTE_GLSL } from './palettes.js';
/** Point clouds and edge networks share one origin, preserving their original coordinate alignment. */
const CLOUD_DEG = Math.PI / 180;
const CLOUD_DOT = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const CLOUD_CLAMP = (value, low, high) => Math.max(low, Math.min(high, value));
const CLOUD_VERTEX_SOURCE = `
precision highp float;
attribute vec3 position;
attribute vec3 vertexColor;
attribute vec2 scalarValue;
uniform vec3 originOffset;
uniform vec2 scalarTransform;
uniform int colorMode;
${PALETTE_GLSL}
uniform mat4 matrix;
uniform float pointSize;
uniform int useVertexColor;
uniform vec3 solidColor;
varying vec3 color;
void main() {
  gl_Position = matrix * vec4(position + originOffset, 1.0);
  gl_PointSize = pointSize;
  color = useVertexColor == 1 ? vertexColor : solidColor;
  if (colorMode == 2) color = paletteColor(position.z * scalarTransform.y + scalarTransform.x);
  if (colorMode == 3) color = scalarValue.y > .5 ? paletteColor(scalarValue.x * scalarTransform.y + scalarTransform.x) : vec3(.55, .59, .61);
}`;
const CLOUD_FRAGMENT_SOURCE = `
precision mediump float;
uniform int isPoint;
uniform float opacity;
varying vec3 color;
void main() {
  float alpha = opacity;
  if (isPoint == 1) {
    float radius = length(gl_PointCoord - vec2(.5));
    if (radius > .5) discard;
    alpha *= 1.0 - smoothstep(.40, .50, radius);
  }
  gl_FragColor = vec4(color, alpha);
}`;

function CLOUD_HEX(value, fallback) {
  const text = String(value || '').replace(/^#/, '');
  const hex = /^[\da-f]{3}$/i.test(text) ? text.split('').map(char => char + char).join('') : text;
  if (!/^[\da-f]{6}$/i.test(hex)) return fallback;
  return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
}

function CLOUD_BOUNDS(value) {
  const bounds = Array.isArray(value) && value.length === 2 ? value : value?.min && value?.max ? [value.min, value.max] : null;
  if (!bounds || bounds.some(point => point.length !== 3 || !Array.from(point).every(Number.isFinite))) return null;
  if (bounds[0].some((value, i) => value > bounds[1][i])) return null;
  return bounds.map(point => Array.from(point));
}

function CLOUD_UNION(bounds) {
  const valid = bounds.filter(Boolean);
  if (!valid.length) return null;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const item of valid) for (let i = 0; i < 3; i++) {
    min[i] = Math.min(min[i], item[0][i]); max[i] = Math.max(max[i], item[1][i]);
  }
  return [min, max];
}

export class CloudViewer {
  constructor(canvas, { onError = () => {}, onViewChange = () => {} } = {}) {
    this.canvas = canvas;
    this.onError = onError;
    this.onViewChange = onViewChange;
    this.options = { showPoints: true, showWire: true, pointSize: 2, pointOpacity: 1,
      colorMode: 'height', pointColor: '#547d99', wireColor: '#ed8e48', rgbFields: null, grid: true, palette: 'current', reverse: false, range: null };
    this.data = { cloud: null, wire: null };
    this.camera = { elevation: 38, azimuth: -55, zoom: 1, pan: [0, 0] };
    this.target = [0, 0, 0];
    this.origin = [0, 0, 0];
    this.baseHeight = 10;
    this.bounds = null;
    this.referenceBounds = null;
    this.cloudBounds = null;
    this.wireBounds = null;
    this.buffers = {};
    this.entityCache = new Map();
    this.activeClouds = [];
    this.wireEntry = null;
    this.cacheClock = 0;
    this.inactiveCacheLimit = 64 * 1024 * 1024;
    this.pointCount = 0;
    this.edgeCount = 0;
    this.colorRange = null;
    this.effectiveColorMode = 'height';
    this.colorFallback = null;
    this.frame = null;
    this.disposed = false;
    this.contextLost = false;
    this.listeners = [];
    try {
      this.gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: true });
      if (!this.gl) throw new Error('无法启用 WebGL，请检查浏览器的硬件加速设置。');
      this.initGL();
    } catch (error) { this.onError(error.message); throw error; }
    this.installEvents();
    this.resizeObserver = new ResizeObserver(() => this.requestRender());
    this.resizeObserver.observe(canvas);
    this.render();
  }

  initGL() {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`WebGL 着色器编译失败：${message}`);
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, CLOUD_VERTEX_SOURCE);
    let fragment;
    try { fragment = compile(gl.FRAGMENT_SHADER, CLOUD_FRAGMENT_SOURCE); }
    catch (error) { gl.deleteShader(vertex); throw error; }
    const program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`WebGL 程序链接失败：${message}`);
    }
    this.program = program;
    this.locations = { position: gl.getAttribLocation(program, 'position'), color: gl.getAttribLocation(program, 'vertexColor'), scalar: gl.getAttribLocation(program, 'scalarValue') };
    for (const name of ['matrix', 'pointSize', 'useVertexColor', 'solidColor', 'isPoint', 'opacity', 'originOffset', 'scalarTransform', 'colorMode', 'colorStops[0]']) this.locations[name] = gl.getUniformLocation(program, name);
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    this.pointSizeRange = range && range.length === 2 ? Array.from(range) : [1, 64];
  }

  installEvents() {
    const listen = (name, fn, options) => {
      this.canvas.addEventListener(name, fn, options);
      this.listeners.push([name, fn, options]);
    };
    this.canvas.style.touchAction = 'none';
    this.canvas.style.cursor = 'grab';
    listen('contextmenu', event => event.preventDefault());
    listen('pointerdown', event => {
      if (![0, 1, 2].includes(event.button)) return;
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button !== 0 || event.shiftKey };
      this.canvas.style.cursor = 'grabbing';
    });
    listen('pointermove', event => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
      this.drag.x = event.clientX; this.drag.y = event.clientY;
      if (this.drag.pan || event.shiftKey) {
        const step = this.baseHeight / this.camera.zoom / Math.max(1, this.canvas.clientHeight);
        this.camera.pan[0] -= dx * step; this.camera.pan[1] += dy * step;
      } else {
        this.camera.azimuth = (this.camera.azimuth - dx * .35) % 360;
        this.camera.elevation = CLOUD_CLAMP(this.camera.elevation + dy * .3, -89, 90);
      }
      this.requestRender();
    });
    const finish = event => {
      if (this.drag?.id !== event.pointerId) return;
      this.drag = null;
      this.canvas.style.cursor = 'grab';
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(name, finish);
    listen('wheel', event => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1);
      this.zoomBy(Math.exp(-CLOUD_CLAMP(delta, -500, 500) * .0015));
    }, { passive: false });
    listen('webglcontextlost', event => {
      event.preventDefault();
      this.contextLost = true;
      this.onError('WebGL 显示上下文暂时丢失，正在等待浏览器恢复。');
    });
    listen('webglcontextrestored', () => {
      this.contextLost = false;
      try {
        const camera = { ...this.camera, pan: [...this.camera.pan] }, target = [...this.target], height = this.baseHeight;
        this.buffers = {};
        this.initGL();
        const savedData = this.data;
        this.entityCache = new Map(); this.activeClouds = []; this.wireEntry = null; this.gridKey = null;
        if (savedData.clouds) this.setClouds(savedData.clouds, {...savedData, preserveView: false});
        else this.setData(savedData);
        this.camera = camera; this.target = target; this.baseHeight = height;
        this.render();
        this.onError('');
      } catch (error) { this.onError(error.message); }
    });
  }

  makeBuffer(values) {
    const gl = this.gl, buffer = gl.createBuffer();
    if (!buffer) throw new Error('无法分配显示缓冲区，请降低点云采样数量。');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
    const error = gl.getError();
    if (error && error !== gl.NO_ERROR) {
      gl.deleteBuffer(buffer);
      throw new Error(error === gl.OUT_OF_MEMORY ? '显存不足，请降低点云采样数量。' : `WebGL 缓冲区上传失败（${error}）。`);
    }
    return { buffer, count: values.length / 3 };
  }

  ensureCache() {
    this.entityCache ||= new Map(); this.activeClouds ||= []; this.cacheClock ||= 0;
    this.inactiveCacheLimit ??= 64 * 1024 * 1024;
  }

  deleteEntity(entry) {
    for (const item of [entry?.points, entry?.colors, entry?.scalar]) if (item) this.gl.deleteBuffer(item.buffer);
  }

  pruneCache() {
    const active = new Set(this.activeClouds.map(entry => entry.key));
    const inactive = [...this.entityCache.values()].filter(entry => !active.has(entry.key)).sort((a, b) => b.used - a.used);
    let bytes = 0;
    for (let i = 0; i < inactive.length; i++) {
      const entry = inactive[i];
      bytes += entry.retainedBytes + entry.gpuBytes;
      if (i >= 2 || bytes > this.inactiveCacheLimit) { this.deleteEntity(entry); this.entityCache.delete(entry.key); }
    }
  }

  forgetClouds(keys) {
    this.ensureCache();
    if (this.activeClouds.some(entry => keys.has(entry.key))) {
      this.setClouds(this.activeClouds.filter(entry => !keys.has(entry.key)).map(entry => entry.item));
    }
    for (const key of keys) {
      const entry = this.entityCache.get(key);
      if (entry) { this.deleteEntity(entry); this.entityCache.delete(key); }
    }
  }

  clearCache() {
    this.ensureCache();
    const active = new Set(this.activeClouds.map(entry => entry.key));
    for (const [key, entry] of this.entityCache) if (!active.has(key)) { this.deleteEntity(entry); this.entityCache.delete(key); }
  }

  createEntity(item) {
    const cloud = item.cloud;
    if (!cloud?.positions || cloud.positions.length % 3) throw new Error('点云坐标需要按 XYZ 三列排列。');
    const count = cloud.count ?? cloud.positions.length / 3;
    if (!Number.isSafeInteger(count) || count < 0 || count * 3 > cloud.positions.length) throw new Error('点云数量与坐标数组不匹配。');
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count * 3; i++) {
      const value = cloud.positions[i], axis = i % 3;
      if (!Number.isFinite(value)) throw new Error('点云包含非有限坐标。');
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
    }
    const bounds = count ? CLOUD_UNION([[min, max], CLOUD_BOUNDS(cloud.bounds)]) : null;
    const origin = bounds ? bounds[0].map((value, axis) => value + (bounds[1][axis] - value) / 2) : [0, 0, 0];
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < positions.length; i++) positions[i] = cloud.positions[i] - origin[i % 3];
    const arrays = [cloud.positions, cloud.rgb, ...Object.values(cloud.fields || {})].filter(ArrayBuffer.isView);
    const retainedBytes = [...new Set(arrays.map(array => array.buffer))].reduce((sum, buffer) => sum + buffer.byteLength, 0);
    const entry = {key: item.key, cloud, count, bounds, origin, ranges: new Map(), points: null,
      colors: null, scalar: null, retainedBytes, gpuBytes: positions.byteLength, used: ++this.cacheClock};
    entry.ranges.set('height', count ? {min: min[2], max: max[2]} : null);
    if (count) entry.points = this.makeBuffer(positions);
    return entry;
  }

  createWire(wire) {
    if (!wire) return null;
    if (!Array.isArray(wire.vertices) || !Array.isArray(wire.edges)) throw new Error('线框需要 vertices 和 edges 数组。');
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const edge of wire.edges) {
      if (edge.length !== 2 || !edge.every(index => Number.isInteger(index) && index >= 0 && index < wire.vertices.length)) throw new Error('线框包含无效边索引。');
      for (const index of edge) {
        const point = wire.vertices[index];
        if (point.length !== 3 || !point.every(Number.isFinite)) throw new Error('线框包含非有限坐标。');
        for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]); }
      }
    }
    const count = wire.edges.length, bounds = count ? CLOUD_UNION([[min, max], CLOUD_BOUNDS(wire.bounds)]) : null;
    const origin = bounds ? bounds[0].map((value, axis) => value + (bounds[1][axis] - value) / 2) : [0, 0, 0];
    const positions = new Float32Array(count * 6);
    let offset = 0;
    for (const edge of wire.edges) for (const index of edge) for (let axis = 0; axis < 3; axis++) positions[offset++] = wire.vertices[index][axis] - origin[axis];
    return {wire, count, bounds, origin, buffer: count ? this.makeBuffer(positions) : null};
  }

  setData({cloud = null, wire = null, bounds = null, origin = null} = {}) {
    this.setClouds(cloud ? [{key: cloud, name: '', cloud}] : [], {wire, bounds, origin, preserveView: false});
    this.data.cloud = cloud;
  }

  /** Independent immutable cloud objects share a camera; unchanged keys reuse GPU geometry. */
  setClouds(items, {wire = null, bounds: referenceBounds = null, origin: referenceOrigin = null, preserveView = true} = {}) {
    this.ensureCache();
    if (!Array.isArray(items)) throw new Error('setClouds 需要点云条目数组。');
    const keys = new Set(), created = [], next = [];
    let wireEntry = this.wireEntry, grid, colorPlan;
    try {
      for (const item of items) {
        if (!item || item.key === undefined || keys.has(item.key)) throw new Error('每个点云需要唯一且稳定的 key。');
        keys.add(item.key);
        let entry = this.entityCache.get(item.key);
        if (!entry || entry.cloud !== item.cloud) { entry = this.createEntity(item); created.push(entry); }
        next.push(entry);
      }
      if (wireEntry?.wire !== wire) wireEntry = this.createWire(wire);
      const cloudBounds = CLOUD_UNION(next.map(entry => entry.bounds)), wireBounds = wireEntry?.bounds || null;
      const sharedBounds = CLOUD_BOUNDS(referenceBounds), bounds = CLOUD_UNION([cloudBounds, wireBounds, sharedBounds]);
      const validOrigin = Array.isArray(referenceOrigin) && referenceOrigin.length === 3 && referenceOrigin.every(Number.isFinite);
      const origin = validOrigin ? [...referenceOrigin] : bounds ? bounds[0].map((value, axis) => value + (bounds[1][axis] - value) / 2) : [0, 0, 0];
      const gridKey = JSON.stringify([bounds, origin]);
      grid = gridKey === this.gridKey ? this.buffers.grid : bounds ? this.makeBuffer(this.buildGrid(bounds, origin)) : null;
      colorPlan = this.prepareColorState(next.map((entry, index) => ({...entry, item: items[index], actual: entry})));
      const previousWorldTarget = this.target.map((value, axis) => value + this.origin[axis]);
      const hadScene = !!this.bounds;
      for (const entry of created) {
        const replaced = this.entityCache.get(entry.key);
        if (replaced) this.deleteEntity(replaced);
        this.entityCache.set(entry.key, entry);
      }
      next.forEach((entry, index) => { entry.item = items[index]; entry.used = ++this.cacheClock; });
      if (this.wireEntry && this.wireEntry !== wireEntry && this.wireEntry.buffer) this.gl.deleteBuffer(this.wireEntry.buffer.buffer);
      if (this.buffers.grid && this.buffers.grid !== grid) this.gl.deleteBuffer(this.buffers.grid.buffer);
      this.activeClouds = next; this.wireEntry = wireEntry;
      this.buffers = {grid, wire: wireEntry?.buffer || null}; this.gridKey = gridKey;
      this.data = {cloud: items.length === 1 ? items[0].cloud : null, clouds: items.map(item => ({...item})), wire,
        bounds: sharedBounds, origin: validOrigin ? [...referenceOrigin] : null};
      this.cloudBounds = cloudBounds; this.wireBounds = wireBounds; this.referenceBounds = sharedBounds; this.bounds = bounds; this.origin = origin;
      this.pointCount = next.reduce((sum, entry) => sum + entry.count, 0); this.edgeCount = wireEntry?.count || 0;
      this.commitColorState(colorPlan); this.pruneCache();
      if (preserveView && hadScene && bounds) { this.target = previousWorldTarget.map((value, axis) => value - origin[axis]); this.render(); }
      else this.fit();
    } catch (error) {
      if (colorPlan && !colorPlan.committed) this.deleteColorPlan(colorPlan);
      for (const entry of created) if (this.entityCache.get(entry.key) !== entry) this.deleteEntity(entry);
      if (wireEntry !== this.wireEntry && wireEntry?.buffer) this.gl.deleteBuffer(wireEntry.buffer.buffer);
      if (grid && grid !== this.buffers.grid) this.gl.deleteBuffer(grid.buffer);
      this.onError(error.message); throw error;
    }
  }

  entryRange(entry, mode) {
    if (entry.ranges.has(mode)) return entry.ranges.get(mode);
    const name = mode.startsWith('field:') ? mode.slice(6) : mode;
    const values = entry.cloud.fields?.[name];
    let min = Infinity, max = -Infinity;
    if (values?.length >= entry.count) for (let i = 0; i < entry.count; i++) {
      const value = values[i]; if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value); }
    }
    const range = min === Infinity ? null : {min, max}; entry.ranges.set(mode, range); return range;
  }

  prepareColorState(entries = this.activeClouds || []) {
    let mode = this.options.colorMode || 'height', fallback = null;
    const field = mode.startsWith('field:') ? mode.slice(6) : mode;
    const hasRGB = entry => this.options.rgbFields?.length === 3 && this.options.rgbFields.every(name => entry.cloud.fields?.[name]?.length >= entry.count) || entry.cloud.rgb?.length >= entry.count * 3;
    if (mode === 'rgb' && entries.length && !entries.some(hasRGB)) { mode = 'height'; fallback = '未找到可用的 RGB 数据，已按高度着色。'; }
    if (mode === 'file' && entries.some(entry => !this.entryFileColor(entry) && this.fileSources(entry.cloud, entry.count) === null)) { mode = 'height'; fallback = '未找到完整的点云文件来源信息，已按高度着色。'; }
    if (!['height', 'rgb', 'solid', 'file'].includes(mode) && entries.length && !entries.some(entry => entry.cloud.fields?.[field]?.length >= entry.count)) { mode = 'height'; fallback = `字段 ${field} 不存在，已按高度着色。`; }
    const scalar = !['rgb', 'solid', 'file'].includes(mode);
    const ranges = scalar ? entries.map(entry => this.entryRange(entry, mode)).filter(Boolean) : [];
    const auto = ranges.length ? {min: Math.min(...ranges.map(range => range.min)), max: Math.max(...ranges.map(range => range.max))} : null;
    const plan = {mode, fallback, auto, range: scalar && auto ? this.options.range ? {...this.options.range} : {...auto} : null, updates: []};
    try {
      for (const entry of entries) {
        if (mode === 'rgb' || mode === 'file' && !this.entryFileColor(entry)) {
          const signature = mode === 'rgb' ? JSON.stringify(['rgb', this.options.rgbFields]) : 'file';
          if (entry.colorKey !== signature) {
            const colors = mode === 'rgb' && !hasRGB(entry) ? new Float32Array(entry.count * 3).fill(.55) : this.buildColors(entry.cloud, entry.count).values;
            const buffer = entry.count ? this.makeBuffer(colors) : null;
            plan.updates.push({entry: entry.actual || entry, colors: buffer, colorKey: signature});
          }
        } else if (scalar && mode !== 'height' && entry.scalarKey !== mode) {
          const name = mode.startsWith('field:') ? mode.slice(6) : mode, values = entry.cloud.fields?.[name];
          const range = this.entryRange(entry, mode), base = range?.min || 0, scalars = new Float32Array(entry.count * 2);
          for (let i = 0; i < entry.count; i++) if (Number.isFinite(values?.[i])) { scalars[i * 2] = values[i] - base; scalars[i * 2 + 1] = 1; }
          const buffer = entry.count ? this.makeBuffer(scalars) : null;
          plan.updates.push({entry: entry.actual || entry, scalar: buffer, scalarBase: base, scalarKey: mode});
        }
      }
    } catch (error) { this.deleteColorPlan(plan); throw error; }
    return plan;
  }

  deleteColorPlan(plan) {
    for (const update of plan.updates) for (const name of ['colors','scalar']) if (update[name]) this.gl.deleteBuffer(update[name].buffer);
  }

  commitColorState(plan) {
    for (const {entry, ...update} of plan.updates) {
      for (const name of ['colors','scalar']) if (Object.hasOwn(update,name) && entry[name]) this.gl.deleteBuffer(entry[name].buffer);
      Object.assign(entry, update);
      entry.gpuBytes = entry.count * (12 + (entry.colors ? 12 : 0) + (entry.scalar ? 8 : 0));
    }
    this.dataRange = plan.auto; this.colorRange = plan.range;
    this.effectiveColorMode = plan.mode; this.colorFallback = plan.fallback;
    plan.committed = true;
  }

  updateColorState() { this.commitColorState(this.prepareColorState()); }

  entryFileColor(entry) {
    const color = entry.item?.color;
    return color?.length === 3 && Array.from(color).every(Number.isFinite) ? Array.from(color, value => CLOUD_CLAMP(value, 0, 1)) : null;
  }

  fileSources(cloud, count) {
    const sources = Array.isArray(cloud.sources) ? [...cloud.sources].sort((a, b) => (a?.start ?? 0) - (b?.start ?? 0)) : [];
    let covered = 0;
    const valid = sources.length > 0 && sources.every(source => {
      if (!source || !Number.isSafeInteger(source.start) || !Number.isSafeInteger(source.count) || source.start !== covered || source.count < 0 || source.count > count - covered) return false;
      if ((!Array.isArray(source.color) && !ArrayBuffer.isView(source.color)) || source.color.length !== 3 || !Array.from(source.color).every(Number.isFinite)) return false;
      covered += source.count; return true;
    });
    return valid && covered === count ? sources : null;
  }

  buildGrid(bounds, origin) {
    const width = bounds[1][0] - bounds[0][0], depth = bounds[1][1] - bounds[0][1];
    const span = Math.max(width, depth, .01) * .65;
    const rough = span / 12, power = Math.pow(10, Math.floor(Math.log10(rough))), unit = rough / power;
    const step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
    const count = Math.ceil(span / step), extent = count * step;
    const z = bounds[0][2] - origin[2] - Math.max(width, depth, bounds[1][2] - bounds[0][2], .01) * .001;
    const values = new Float32Array((2 * count + 1) * 12);
    let index = 0;
    for (let k = -count; k <= count; k++) for (const point of [[k * step, -extent, z], [k * step, extent, z], [-extent, k * step, z], [extent, k * step, z]]) for (const value of point) values[index++] = value;
    return values;
  }

  buildColors(cloud, count) {
    const values = new Float32Array(count * 3), fields = cloud?.fields || {};
    let mode = this.options.colorMode, fallback = null, range = null;
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
      if (!valid || covered !== count) { mode = 'height'; fallback = '未找到完整的点云文件来源信息，已按高度着色。'; }
    } else if (mode === 'rgb') {
      if (this.options.rgbFields?.length === 3 && this.options.rgbFields.every(validField)) channels = this.options.rgbFields.map(name => fields[name]);
      else if (cloud.rgb?.length >= count * 3) rgb = cloud.rgb;
      else { mode = 'height'; fallback = '未找到可用的 RGB 数据，已按高度着色。'; }
    } else if (!['height', 'solid'].includes(mode) && !validField(fieldName)) {
      fallback = `字段 ${fieldName} 不存在，已按高度着色。`; mode = 'height';
    }
    if (mode === 'file') {
      for (const source of sources) {
        const color = Array.from(source.color, value => CLOUD_CLAMP(value, 0, 1));
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
        values[i * 3 + channel] = Number.isFinite(value) ? CLOUD_CLAMP(value / divisor, 0, 1) : .55;
      }
    } else if (mode !== 'solid') {
      const scalar = mode === 'height' ? index => cloud.positions[index * 3 + 2] : index => fields[fieldName][index];
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < count; i++) { const value = scalar(i); if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value); } }
      if (min !== Infinity) range = this.options.range ? {...this.options.range} : { min, max };
      if (range) { min = range.min; max = range.max; }
      for (let i = 0; i < count; i++) {
        const value = scalar(i);
        if (!Number.isFinite(value)) { values.set([.55, .59, .61], i * 3); continue; }
        const t = max > min ? CLOUD_CLAMP((value - min) / (max - min), 0, 1) : .5;
        values.set(samplePalette(t, this.options.palette, this.options.reverse), i * 3);
      }
    }
    return { values, mode, fallback, range };
  }

  applyColorState(colors) {
    this.effectiveColorMode = colors.mode;
    this.colorFallback = colors.fallback;
    this.colorRange = colors.range;
  }

  setOptions(options = {}) {
    const previous = this.options, next = {...previous, ...options};
    next.pointSize = CLOUD_CLAMP(Number.isFinite(Number(next.pointSize)) ? Number(next.pointSize) : 2, .5, 64);
    next.pointOpacity = CLOUD_CLAMP(Number.isFinite(Number(next.pointOpacity)) ? Number(next.pointOpacity) : 1, 0, 1);
    next.colorMode = String(next.colorMode || 'height');
    next.rgbFields = Array.isArray(next.rgbFields) ? [...next.rgbFields] : null;
    next.palette ||= 'current'; next.reverse = !!next.reverse; next.range = next.range ? {...next.range} : null;
    validatePaletteOptions(next);
    this.options = next;
    try { this.updateColorState(); } catch (error) { this.options = previous; this.onError(error.message); throw error; }
    this.render();
  }

  visibleBounds() {
    return CLOUD_UNION([this.referenceBounds, this.options.showPoints && this.pointCount ? this.cloudBounds : null, this.options.showWire && this.edgeCount ? this.wireBounds : null]);
  }

  basis() {
    const e = this.camera.elevation * CLOUD_DEG, a = this.camera.azimuth * CLOUD_DEG;
    return [[-Math.sin(a), Math.cos(a), 0], [-Math.cos(a) * Math.sin(e), -Math.sin(a) * Math.sin(e), Math.cos(e)], [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)]];
  }

  fit() {
    const visible = this.visibleBounds();
    const bounds = visible ? visible.map(point => point.map((value, axis) => value - this.origin[axis])) : [[-1, -1, -1], [1, 1, 1]];
    this.target = bounds[0].map((value, axis) => value + (bounds[1][axis] - value) / 2);
    const [right, up] = this.basis();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const x of [bounds[0][0], bounds[1][0]]) for (const y of [bounds[0][1], bounds[1][1]]) for (const z of [bounds[0][2], bounds[1][2]]) {
      const point = [x, y, z], px = CLOUD_DOT(point, right), py = CLOUD_DOT(point, up);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
    const aspect = Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight);
    this.baseHeight = Math.max(.001, maxY - minY, (maxX - minX) / aspect) * 1.22;
    this.camera.zoom = 1; this.camera.pan = [0, 0];
    this.render();
  }

  setView(view) {
    const values = { iso: [38, -55], top: [90, -90], front: [0, -90] }[view];
    if (!values) throw new Error(`不支持的视角：${view}`);
    [this.camera.elevation, this.camera.azimuth] = values;
    this.fit();
  }

  zoomBy(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.camera.zoom = CLOUD_CLAMP(this.camera.zoom * factor, .02, 100);
    this.render();
  }

  matrix() {
    const [r, u, t] = this.basis();
    const height = this.baseHeight / this.camera.zoom, width = height * this.canvas.width / Math.max(1, this.canvas.height);
    const cx = CLOUD_DOT(this.target, r) + this.camera.pan[0], cy = CLOUD_DOT(this.target, u) + this.camera.pan[1];
    const extent = this.bounds ? Math.hypot(...this.bounds[1].map((value, axis) => value - this.bounds[0][axis])) : 1;
    const depth = Math.max(.001, extent) * 4;
    return new Float32Array([2 * r[0] / width, 2 * u[0] / height, -t[0] / depth, 0,
      2 * r[1] / width, 2 * u[1] / height, -t[1] / depth, 0,
      2 * r[2] / width, 2 * u[2] / height, -t[2] / depth, 0,
      -2 * cx / width, -2 * cy / height, CLOUD_DOT(this.target, t) / depth, 1]);
  }

  requestRender() {
    if (this.frame !== null || this.disposed) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
  }

  render() {
    if (this.disposed || this.contextLost) return;
    if (this.frame !== null) { cancelAnimationFrame(this.frame); this.frame = null; }
    const gl = this.gl, canvas = this.canvas, loc = this.locations, rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height);
    gl.depthMask(true);
    gl.clearColor(.951, .960, .965, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(loc.matrix, false, this.matrix());
    gl.uniform1f(loc.pointSize, CLOUD_CLAMP(this.options.pointSize * dpr, this.pointSizeRange[0], this.pointSizeRange[1]));
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enableVertexAttribArray(loc.position);
    gl.uniform3fv(loc['colorStops[0]'], paletteUniforms(this.options.palette, this.options.reverse));
    const draw = (buffer, primitive, color, opacity, entry = null, mode = 0) => {
      if (!buffer?.count || opacity <= 0) return;
      const localOrigin = entry?.origin || this.origin;
      gl.uniform3fv(loc.originOffset, localOrigin.map((value, axis) => value - this.origin[axis]));
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
      gl.vertexAttribPointer(loc.position, 3, gl.FLOAT, false, 12, 0);
      if (mode === 1 && entry?.colors) {
        gl.enableVertexAttribArray(loc.color); gl.bindBuffer(gl.ARRAY_BUFFER, entry.colors.buffer);
        gl.vertexAttribPointer(loc.color, 3, gl.FLOAT, false, 12, 0);
      } else { gl.disableVertexAttribArray(loc.color); gl.vertexAttrib3f(loc.color, 1, 1, 1); }
      if (mode === 3 && entry?.scalar) {
        gl.enableVertexAttribArray(loc.scalar); gl.bindBuffer(gl.ARRAY_BUFFER, entry.scalar.buffer);
        gl.vertexAttribPointer(loc.scalar, 2, gl.FLOAT, false, 8, 0);
      } else { gl.disableVertexAttribArray(loc.scalar); gl.vertexAttrib2f(loc.scalar, 0, 0); }
      const range = this.colorRange, span = range ? range.max - range.min : 0;
      const base = mode === 2 ? entry.origin[2] : entry?.scalarBase || 0;
      gl.uniform2f(loc.scalarTransform, span > 0 ? (base - range.min) / span : .5, span > 0 ? 1 / span : 0);
      gl.uniform1i(loc.colorMode, mode);
      gl.uniform1i(loc.useVertexColor, mode === 1 ? 1 : 0);
      gl.uniform3fv(loc.solidColor, color); gl.uniform1f(loc.opacity, opacity);
      gl.uniform1i(loc.isPoint, primitive === gl.POINTS ? 1 : 0);
      gl.drawArrays(primitive, 0, buffer.count);
    };
    const anyVisible = (this.options.showPoints && this.pointCount && this.options.pointOpacity > 0) || (this.options.showWire && this.edgeCount);
    if (this.options.grid && anyVisible) { gl.depthMask(false); draw(this.buffers.grid, gl.LINES, [.60,.66,.70], .24); gl.depthMask(true); }
    if (this.options.showPoints) {
      gl.depthMask(this.options.pointOpacity >= 1);
      for (const entry of this.activeClouds || []) {
        const mode = this.effectiveColorMode;
        const fileColor = mode === 'file' ? this.entryFileColor(entry) : null;
        const kind = mode === 'solid' || fileColor ? 0 : mode === 'rgb' || mode === 'file' ? 1 : mode === 'height' ? 2 : 3;
        draw(entry.points, gl.POINTS, fileColor || CLOUD_HEX(this.options.pointColor, [.33,.49,.60]), this.options.pointOpacity, entry, kind);
      }
      gl.depthMask(true);
    }
    if (this.options.showWire) draw(this.wireEntry?.buffer, gl.LINES, CLOUD_HEX(this.options.wireColor, [.93,.56,.28]), 1, this.wireEntry);
    gl.depthMask(true);
    this.onViewChange?.(this.getState());
  }

  getState() {
    return { pointCount: this.pointCount, edgeCount: this.edgeCount,
      colorRange: this.colorRange ? { ...this.colorRange } : null, dataRange: this.dataRange ? {...this.dataRange} : null,
      requestedColorMode: this.options.colorMode, effectiveColorMode: this.effectiveColorMode,
      colorFallback: this.colorFallback, fields: [...new Set((this.activeClouds || []).flatMap(entry => Object.keys(entry.cloud.fields || {})))],
      sources: (this.activeClouds || []).map(entry => ({name: entry.item?.name || '', count: entry.count, totalCount: entry.cloud.totalCount || entry.count, color: this.entryFileColor(entry)})),
      cache: {entries: this.entityCache?.size || 0, active: this.activeClouds?.length || 0, gpuBytes: [...(this.entityCache?.values() || [])].reduce((sum, entry) => sum + entry.gpuBytes, 0)},
      camera: { ...this.camera, pan: [...this.camera.pan], target: [...this.target], origin: [...this.origin], baseHeight: this.baseHeight },
      bounds: this.bounds?.map(point => [...point]) || null,
      referenceBounds: this.referenceBounds?.map(point => [...point]) || null,
      options: { ...this.options, rgbFields: this.options.rgbFields ? [...this.options.rgbFields] : null } };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    for (const [name, fn, options] of this.listeners) this.canvas.removeEventListener(name, fn, options);
    for (const entry of this.entityCache?.values() || []) this.deleteEntity(entry);
    if (this.wireEntry?.buffer) this.gl.deleteBuffer(this.wireEntry.buffer.buffer);
    if (this.buffers.grid) this.gl.deleteBuffer(this.buffers.grid.buffer);
    this.entityCache?.clear(); this.activeClouds = []; this.wireEntry = null;
    this.gl.deleteProgram(this.program);
    this.buffers = {};
  }
}
