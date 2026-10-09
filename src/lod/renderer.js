import { currentPresentation } from '../shared/render-style.js';
import { updateSceneGuides } from '../shared/scene-guides.js';
import { StyledLineRenderer } from '../shared/line-renderer.js';
import { t } from '../shared/i18n.js';
import { mountTouchCamera } from '../shared/touch-camera.js';
import { paletteUniforms, validatePaletteOptions, PALETTE_GLSL } from '../shared/palettes.js';
/** Local, dependency-free mesh renderer. Building placement is synthetic; geometry and scale are preserved. */
const DEG = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const PALETTE = [[.39, .57, .67], [.64, .61, .46], [.50, .63, .58], [.62, .52, .64], [.67, .53, .43], [.45, .61, .72], [.65, .61, .69], [.55, .66, .46]];
const VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec3 buildingColor;
attribute float vertexHeight;
uniform vec2 heightTransform;
varying highp float heightValue;
uniform mat4 matrix;
uniform mediump int kind;
uniform mediump int colorByBuilding;
varying vec4 color;
varying vec3 surfaceNormal;
void main() {
  gl_Position = matrix * vec4(position, 1.0);
  surfaceNormal = normal;
  heightValue = vertexHeight * heightTransform.y + heightTransform.x;
  if (kind == 0) {
    vec3 base = abs(normal.z) > .22 ? vec3(.46, .59, .67) : vec3(.91, .89, .84);
    if (colorByBuilding == 1) base = buildingColor * (abs(normal.z) > .22 ? .86 : 1.13);
    float light = 1.0;
    color = vec4(base * light, 1.0);
  } else if (kind == 2) {
    color = vec4(.67, .71, .74, .24);
  } else if (kind == 3) {
    color = vec4(.23, .36, .43, .64);
  } else {
    color = vec4(.23, .31, .36, .65);
  }
}`;
const FRAGMENT_SHADER = `
precision mediump float;
varying vec4 color;
varying vec3 surfaceNormal;
uniform int surfaceStyle;
uniform vec3 viewDirection;
varying highp float heightValue;
uniform mediump int kind;
uniform mediump int colorByBuilding;
${PALETTE_GLSL}
void main() {
  gl_FragColor = colorByBuilding == 2 && (kind == 0 || kind == 3)
    ? vec4(paletteColor(heightValue), kind == 0 ? 1.0 : .9) : color;
  if(kind==0 && surfaceStyle!=1) {
    vec3 n=normalize(surfaceNormal),lightDirection=normalize(vec3(-.5,-.7,1.1));
    gl_FragColor.rgb *= .75+.25*abs(dot(n,lightDirection));
    if(surfaceStyle==2)gl_FragColor.rgb+=vec3(.3)*pow(abs(dot(n,normalize(lightDirection+viewDirection))),32.);
  }
}`;

export class MeshViewer {
  constructor(canvas, { onLabels = () => {}, onError = () => {}, onViewChange = () => {} } = {}) {
    this.canvas = canvas;
    this.onLabels = onLabels;
    this.onError = onError;
    this.onViewChange = onViewChange;
    this.options = { ...currentPresentation(), mode: 'solid', edges: true, colors: 'surface', grid: true, labels: true, scale: 'real', palette: 'current', reverse: false, range: null };
    this.camera = { elevation: 38, azimuth: -55, zoom: 1, pan: [0, 0] };
    this.baseHeight = 30;
    this.sceneBounds = [[-5, -5, 0], [5, 5, 10]];
    this.target = [0, 0, 5];
    this.models = [];
    this.labelAnchors = [];
    this.buffers = {};
    this.triangleCount = 0;
    this.disposed = false;
    this.contextLost = false;
    this.frame = null;
    this.listeners = [];
    try {
      this.gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: true });
      if (!this.gl) throw new Error(t('此浏览器无法启用 WebGL，请检查浏览器的硬件加速设置。'));
      this.initGL();
    } catch (error) {
      this.onError(error.message);
      throw error;
    }
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
        throw new Error(t("WebGL 着色器编译失败：{0}", [message]));
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(t("WebGL 程序链接失败：{0}", [message]));
    }
    this.program = program;
    this.styledLines = new StyledLineRenderer(gl);
    this.locations = {
      surfaceStyle: gl.getUniformLocation(program,'surfaceStyle'), viewDirection:gl.getUniformLocation(program,'viewDirection'),
      position: gl.getAttribLocation(program, 'position'),
      normal: gl.getAttribLocation(program, 'normal'),
      buildingColor: gl.getAttribLocation(program, 'buildingColor'),
      vertexHeight: gl.getAttribLocation(program, 'vertexHeight'),
      heightTransform: gl.getUniformLocation(program, 'heightTransform'),
      colorStops: gl.getUniformLocation(program, 'colorStops[0]'),
      matrix: gl.getUniformLocation(program, 'matrix'),
      kind: gl.getUniformLocation(program, 'kind'),
      colorByBuilding: gl.getUniformLocation(program, 'colorByBuilding'),
    };
  }

  installEvents() {
    const listen = (name, fn, options) => {
      this.canvas.addEventListener(name, fn, options);
      this.listeners.push([name, fn, options]);
    };
    this.canvas.style.touchAction = 'none';
    listen('contextmenu', event => event.preventDefault());
    mountTouchCamera(this, listen, {minElevation: 0});
    listen('pointerdown', event => {
      if (event.pointerType === 'touch') return;
      if (event.button !== 0 && event.button !== 2 && event.button !== 1) return;
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
        pan: event.button !== 0 || event.shiftKey };
      this.canvas.style.cursor = 'grabbing';
    });
    listen('pointermove', event => {
      if (event.pointerType === 'touch') return;
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      if (this.drag.pan || event.shiftKey) {
        const pixelSize = this.baseHeight / this.camera.zoom / Math.max(1, this.canvas.clientHeight);
        this.camera.pan[0] -= dx * pixelSize;
        this.camera.pan[1] += dy * pixelSize;
      } else {
        this.camera.azimuth = (this.camera.azimuth - dx * .35) % 360;
        this.camera.elevation = clamp(this.camera.elevation + dy * .3, 0, 90);
      }
      this.requestRender();
    });
    const finish = event => {
      if (this.drag?.pointerId !== event.pointerId) return;
      this.drag = null;
      this.canvas.style.cursor = 'grab';
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    };
    listen('pointerup', finish);
    listen('pointercancel', finish);
    listen('lostpointercapture', finish);
    listen('wheel', event => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1);
      this.zoomBy(Math.exp(-clamp(delta, -500, 500) * .0015));
    }, { passive: false });
    listen('webglcontextlost', event => {
      event.preventDefault();
      this.contextLost = true;
      this.onError(t('WebGL 显示上下文暂时丢失，正在等待浏览器恢复。'));
    });
    listen('webglcontextrestored', () => {
      this.contextLost = false;
      try {
        this.buffers = {};
        this.initGL();
        this.setModels(this.models);
        this.onError('');
      } catch (error) { this.onError(error.message); }
    });
  }

  makeBuffer(values) {
    const gl = this.gl, buffer = gl.createBuffer();
    if (!buffer) throw new Error(t('无法分配 WebGL 缓冲区，请减少同时查看的楼栋数量。'));
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
    if (gl.getError() === gl.OUT_OF_MEMORY) {
      gl.deleteBuffer(buffer);
      throw new Error(t('显存不足，请减少同时查看的楼栋数量。'));
    }
    return { buffer, count: values.length / 10, byteLength: values.length * 4 };
  }

  setModels(models) {
    if (!Array.isArray(models)) throw new TypeError(t('setModels 需要模型数组。'));
    const prepared = models.map(model => {
      if (!model.vertices?.length || !Array.isArray(model.faces)) throw new Error(t("楼栋 {0} 缺少有效网格。", [model.id]));
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const point of model.vertices) {
        if (point.length < 3 || !point.slice(0, 3).every(Number.isFinite)) throw new Error(t("楼栋 {0} 包含无效坐标。", [model.id]));
        for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], point[i]); max[i] = Math.max(max[i], point[i]); }
      }
      const extent = Math.max(...max.map((value, i) => value - min[i]));
      const scale = this.options.scale === 'normalized' && extent > 0 ? 30 / extent : 1;
      return { model, min, max, scale, width: (max[0] - min[0]) * scale, depth: (max[1] - min[1]) * scale };
    });
    const columns = Math.ceil(Math.sqrt(prepared.length)), rows = Math.ceil(prepared.length / (columns || 1));
    const widths = Array(columns).fill(0), depths = Array(rows).fill(0);
    for (let i = 0; i < prepared.length; i++) {
      widths[i % columns] = Math.max(widths[i % columns], prepared[i].width);
      depths[Math.floor(i / columns)] = Math.max(depths[Math.floor(i / columns)], prepared[i].depth);
    }
    const typical = prepared.map(item => Math.max(item.width, item.depth)).sort((a, b) => a - b);
    const gap = Math.max(2, (typical[Math.floor(typical.length / 2)] || 10) * .35);
    const totalWidth = widths.reduce((sum, value) => sum + value, 0) + Math.max(0, columns - 1) * gap;
    const totalDepth = depths.reduce((sum, value) => sum + value, 0) + Math.max(0, rows - 1) * gap;
    const centers = values => {
      let offset = 0;
      return values.map(value => { const center = offset + value / 2; offset += value + gap; return center; });
    };
    const xCenters = centers(widths), yCenters = centers(depths);
    const triangles = [], featureEdges = [], allEdges = [], labels = [];
    let maxHeight = 0, maxOriginalHeight = 0;
    const vertexOut = (array, position, normal, color, height = 0) => array.push(...position, ...normal, ...color, height);
    const featureCosine = Math.cos(10 * DEG);
    for (let modelIndex = 0; modelIndex < prepared.length; modelIndex++) {
      const { model, min, max, scale } = prepared[modelIndex];
      const cx = xCenters[modelIndex % columns] - totalWidth / 2;
      const cy = totalDepth / 2 - yCenters[Math.floor(modelIndex / columns)];
      const vertices = model.vertices.map(v => [(v[0] - (min[0] + max[0]) / 2) * scale + cx, (v[1] - (min[1] + max[1]) / 2) * scale + cy, (v[2] - min[2]) * scale]);
      const height = (max[2] - min[2]) * scale;
      maxHeight = Math.max(maxHeight, height);
      maxOriginalHeight = Math.max(maxOriginalHeight, max[2] - min[2]);
      labels.push({ id: model.id, bounds: [[cx - prepared[modelIndex].width / 2, cy - prepared[modelIndex].depth / 2, 0],
        [cx + prepared[modelIndex].width / 2, cy + prepared[modelIndex].depth / 2, height]] });
      let hash = 0;
      for (const char of String(model.id)) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
      const color = PALETTE[hash % PALETTE.length];
      // Exact-coordinate welding also handles OBJ files that duplicate vertices at material/normal seams.
      const unique = new Map();
      const welded = vertices.map((v, index) => { const key = v.join(','); if (!unique.has(key)) unique.set(key, index); return unique.get(key); });
      const edges = new Map();
      for (const face of model.faces) {
        if (face.length !== 3 || !face.every(index => Number.isInteger(index) && index >= 0 && index < vertices.length)) {
          throw new Error(t("楼栋 {0} 包含无效三角面。", [model.id]));
        }
        const [a, b, c] = face.map(index => vertices[index]);
        const ab = b.map((value, i) => value - a[i]), ac = c.map((value, i) => value - a[i]);
        const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const length = Math.hypot(...normal);
        if (length < 1e-12) continue;
        for (let i = 0; i < 3; i++) normal[i] /= length;
        for (const point of [a, b, c]) vertexOut(triangles, point, normal, color, point[2] / scale);
        for (let i = 0; i < 3; i++) {
          const ai = welded[face[i]], bi = welded[face[(i + 1) % 3]];
          const key = ai < bi ? `${ai}:${bi}` : `${bi}:${ai}`;
          if (!edges.has(key)) edges.set(key, { a: vertices[ai], b: vertices[bi], normals: [] });
          edges.get(key).normals.push(normal);
        }
      }
      for (const edge of edges.values()) {
        vertexOut(allEdges, edge.a, [0, 0, 1], color, edge.a[2] / scale);
        vertexOut(allEdges, edge.b, [0, 0, 1], color, edge.b[2] / scale);
        const normals = edge.normals;
        const feature = normals.length !== 2 || Math.abs(dot(normals[0], normals[1])) < featureCosine;
        if (feature) {
          vertexOut(featureEdges, edge.a, [0, 0, 1], color, edge.a[2] / scale);
          vertexOut(featureEdges, edge.b, [0, 0, 1], color, edge.b[2] / scale);
        }
      }
    }
    const nextBuffers = {};
    try {
      nextBuffers.triangles = this.makeBuffer(triangles);
      nextBuffers.featureEdges = this.makeBuffer(featureEdges);
      nextBuffers.allEdges = this.makeBuffer(allEdges);
      const grid = [], span = Math.max(totalWidth, totalDepth, 10) * .7 + gap;
      const roughStep = span / 15, power = Math.pow(10, Math.floor(Math.log10(roughStep)));
      const unit = roughStep / power;
      const step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
      const gridExtent = Math.ceil(span / step) * step;
      const z = -Math.max(.005, maxHeight * .0001);
      for (let k = -Math.floor(gridExtent / step); k <= Math.floor(gridExtent / step); k++) {
        for (const point of [[k * step, -gridExtent, z], [k * step, gridExtent, z], [-gridExtent, k * step, z], [gridExtent, k * step, z]]) vertexOut(grid, point, [0, 0, 1], [1, 1, 1]);
      }
      nextBuffers.grid = this.makeBuffer(grid);
    } catch (error) {
      for (const item of Object.values(nextBuffers)) this.gl.deleteBuffer(item.buffer);
      this.onError(error.message);
      throw error;
    }
    for (const item of Object.values(this.buffers)) this.gl.deleteBuffer(item.buffer);
    this.buffers = nextBuffers;
    const retainPositions = values => {
      const positions = new Float32Array(values.length / 10 * 3);
      for(let i=0,j=0;i<values.length;i+=10)for(let axis=0;axis<3;axis++)positions[j++]=values[i+axis];
      return positions;
    };
    this.edgePositions = {all: retainPositions(allEdges), feature: retainPositions(featureEdges)};
    this.models = models;
    this.labelAnchors = labels;
    this.triangleCount = triangles.length / 30;
    this.heightRange = models.length ? {min: 0, max: maxOriginalHeight} : null;
    this.sceneBounds = prepared.length ? [[-totalWidth / 2, -totalDepth / 2, 0], [totalWidth / 2, totalDepth / 2, maxHeight]] : [[-5, -5, 0], [5, 5, 10]];
    this.target = prepared.length ? [0, 0, maxHeight / 2] : [0, 0, 5];
    this.fit();
  }

  setOptions(options) {
    const next = { ...this.options, ...options };
    if (!['solid', 'wire', 'solid-wire'].includes(next.mode)) throw new Error(t("不支持的显示模式：{0}", [next.mode]));
    if (!['surface', 'building', 'height'].includes(next.colors)) throw new Error(t("不支持的配色模式：{0}", [next.colors]));
    if (!['real', 'normalized'].includes(next.scale)) throw new Error(t("不支持的比例模式：{0}", [next.scale]));
    next.palette ||= 'current'; next.reverse = !!next.reverse; next.range = next.range ? {...next.range} : null;
    validatePaletteOptions(next);
    if(next.lineStyle!=='native'&&!this.styledLines?.ext)throw Error(t('此浏览器不支持立体线，请使用细线。'));
    const rebuild = next.scale !== this.options.scale;
    this.options = next;
    if (rebuild) this.setModels(this.models);
    else this.render();
  }

  vectorSegments() {
    const values=this.options.mode==='wire'||this.options.mode==='solid-wire'?this.edgePositions?.all:this.options.edges?this.edgePositions?.feature:null;
    const segments=[];if(values)for(let i=0;i<values.length;i+=6)segments.push([Array.from(values.subarray(i,i+3)),Array.from(values.subarray(i+3,i+6))]);return segments;
  }

  setView(view) {
    const views = { iso: [38, -55], top: [90, -90], front: [0, -90] };
    if (!views[view]) throw new Error(t("不支持的视角：{0}", [view]));
    [this.camera.elevation, this.camera.azimuth] = views[view];
    this.fit();
  }

  basis() {
    const e = this.camera.elevation * DEG, a = this.camera.azimuth * DEG;
    return [[-Math.sin(a), Math.cos(a), 0], [-Math.cos(a) * Math.sin(e), -Math.sin(a) * Math.sin(e), Math.cos(e)], [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)]];
  }

  fit() {
    const [right, up] = this.basis(), [min, max] = this.sceneBounds;
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
      const point = [x, y, z], projectedX = dot(point, right), projectedY = dot(point, up);
      xMin = Math.min(xMin, projectedX); xMax = Math.max(xMax, projectedX);
      yMin = Math.min(yMin, projectedY); yMax = Math.max(yMax, projectedY);
    }
    const aspect = Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight);
    this.baseHeight = Math.max(2, yMax - yMin, (xMax - xMin) / aspect) * 1.3;
    this.camera.zoom = 1;
    this.camera.pan = [0, 0];
    this.render();
  }

  zoomBy(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.camera.zoom = clamp(this.camera.zoom * factor, .15, 30);
    this.render();
  }

  matrix() {
    const [r, u, t] = this.basis();
    const aspect = (this.exportTarget?.width || this.canvas.width) / Math.max(1, this.exportTarget?.height || this.canvas.height);
    const height = this.baseHeight / this.camera.zoom, width = height * aspect;
    const cx = dot(this.target, r) + this.camera.pan[0], cy = dot(this.target, u) + this.camera.pan[1];
    const depth = Math.max(10, Math.hypot(...this.sceneBounds[1].map((v, i) => v - this.sceneBounds[0][i]))) * 4;
    return new Float32Array([2 * r[0] / width, 2 * u[0] / height, -t[0] / depth, 0,
      2 * r[1] / width, 2 * u[1] / height, -t[1] / depth, 0,
      2 * r[2] / width, 2 * u[2] / height, -t[2] / depth, 0,
      -2 * cx / width, -2 * cy / height, dot(this.target, t) / depth, 1]);
  }

  requestRender() {
    if (this.frame !== null || this.disposed) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
  }

  render() {
    if (this.disposed || this.contextLost) return;
    if (this.frame !== null) { cancelAnimationFrame(this.frame); this.frame = null; }
    const canvas = this.canvas, gl = this.gl, rect = canvas.getBoundingClientRect();
    const dpr = this.exportTarget?.scale || Math.min(window.devicePixelRatio || 1, 2);
    const width = this.exportTarget?.width || Math.max(1, Math.round(rect.width * dpr)), height = this.exportTarget?.height || Math.max(1, Math.round(rect.height * dpr));
    if (!this.exportTarget && (canvas.width !== width || canvas.height !== height)) { canvas.width = width; canvas.height = height; }
    const matrix = this.matrix(), loc = this.locations;
    gl.viewport(0, 0, width, height);
    gl.depthMask(true);gl.clearColor(this.exportTarget?.transparent?0:.951, this.exportTarget?.transparent?0:.960, this.exportTarget?.transparent?0:.965, this.exportTarget?.transparent?0:1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(loc.matrix, false, matrix);
    gl.uniform1i(loc.surfaceStyle,this.options.surfaceStyle==='unlit'?1:this.options.surfaceStyle==='gloss'?2:0);gl.uniform3fv(loc.viewDirection,this.basis()[2]);
    gl.uniform1i(loc.colorByBuilding, this.options.colors === 'height' ? 2 : this.options.colors === 'building' ? 1 : 0);
    gl.uniform3fv(loc.colorStops, paletteUniforms(this.options.palette, this.options.reverse));
    const range = this.options.range || this.heightRange, span = range ? range.max - range.min : 0;
    gl.uniform2f(loc.heightTransform, span > 0 ? -range.min / span : .5, span > 0 ? 1 / span : 0);
    for (const location of [loc.position, loc.normal, loc.buildingColor, loc.vertexHeight]) gl.enableVertexAttribArray(location);
    gl.disable(gl.CULL_FACE); // Input meshes may use mixed winding; both sides must remain visible.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const draw = (buffer, kind, primitive) => {
      if (!buffer?.count) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
      gl.vertexAttribPointer(loc.position, 3, gl.FLOAT, false, 40, 0);
      gl.vertexAttribPointer(loc.normal, 3, gl.FLOAT, false, 40, 12);
      gl.vertexAttribPointer(loc.buildingColor, 3, gl.FLOAT, false, 40, 24);
      gl.vertexAttribPointer(loc.vertexHeight, 1, gl.FLOAT, false, 40, 36);
      gl.uniform1i(loc.kind, kind);
      gl.drawArrays(primitive, 0, buffer.count);
    };
    if (this.options.grid && this.models.length) draw(this.buffers.grid, 2, gl.LINES);
    if (this.options.mode !== 'wire') {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      draw(this.buffers.triangles, 0, gl.TRIANGLES);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    const all = this.options.mode === 'wire' || this.options.mode === 'solid-wire';
    const edgeBuffer=all?this.buffers.allEdges:this.options.edges?this.buffers.featureEdges:null;
    if(this.options.lineStyle==='native')draw(edgeBuffer,all?3:1,gl.LINES);
    else this.styledLines.draw({buffer:edgeBuffer,stride:40,matrix,radius:this.options.lineWidth/2*this.baseHeight/this.camera.zoom/Math.max(1,rect.height),style:this.options.lineStyle,color:[.23,.36,.43],endColor:this.options.lineGradient?this.options.lineEndColor:null});
    if(this.exportTarget)return;
    updateSceneGuides(this);
    this.onLabels(this.options.labels ? this.labelAnchors.map(({ id, bounds: [min, max] }) => {
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity;
      for (const px of [min[0], max[0]]) for (const py of [min[1], max[1]]) for (const pz of [min[2], max[2]]) {
        const x = matrix[0] * px + matrix[4] * py + matrix[8] * pz + matrix[12];
        const y = matrix[1] * px + matrix[5] * py + matrix[9] * pz + matrix[13];
        xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); yMin = Math.min(yMin, y);
      }
      const x = (xMin + xMax) / 2;
      const screenY = (1 - yMin) * rect.height / 2 + 8;
      return { id, x: (x + 1) * rect.width / 2, y: screenY,
        visible: x > -.99 && x < .99 && screenY >= 0 && screenY < rect.height - 24 };
    }) : []);
    this.onViewChange?.(this.getState());
  }

  getState() {
    return { buildingCount: this.models.length, triangleCount: this.triangleCount,
      featureEdgeCount: (this.buffers.featureEdges?.count || 0) / 2,
      allEdgeCount: (this.buffers.allEdges?.count || 0) / 2,
      syntheticArrangement: true, heightMeaning: 'height-above-building-min-z',
      dataRange: this.heightRange ? {...this.heightRange} : null,
      colorRange: this.options.colors === 'height' && this.heightRange ? {...(this.options.range || this.heightRange)} : null, camera: { ...this.camera, pan: [...this.camera.pan], baseHeight: this.baseHeight },
      options: { ...this.options }, bounds: this.sceneBounds.map(point => [...point]) };
  }

  destroy() {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    for (const [name, fn, options] of this.listeners) this.canvas.removeEventListener(name, fn, options);
    for (const item of Object.values(this.buffers)) this.gl.deleteBuffer(item.buffer);
    this.styledLines?.dispose();this.guideCanvas?.remove();
    this.gl.deleteProgram(this.program);
    this.onLabels([]);
  }
}
