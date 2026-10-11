import { gsCovariance } from './covariance.js';
import { gsFrameQuality } from './quality.js';
import { gsReanchorOrbit, gsSetOrbitBasis, gsOrbitRotate } from '../shared/orbit-camera.js';
import { CameraNavigation, cameraNavigationSettings, cameraNavigationScale, CAMERA_NAV_STORAGE } from '../shared/camera-navigation.js';
import { gsViewSpec, gsTrainingPose, gsProjectPosition } from '../shared/camera-geometry.js';
import { GS_SORT_WORKER } from './sort-worker.js';
import { currentPresentation } from '../shared/render-style.js';
import { updateSceneGuides } from '../shared/scene-guides.js';
import { t } from '../shared/i18n.js';
import { mountTouchCamera } from '../shared/touch-camera.js';

const GS_DEG = Math.PI / 180;
const GS_DOT = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const GS_CLAMP = (value, low, high) => Math.max(low, Math.min(high, value));
const GS_BACKGROUNDS = {gray: [0.951, 0.960, 0.965, 1], black: [0, 0, 0, 1], white: [1, 1, 1, 1]};
const GS_SORT_F32 = new Float32Array(1);
const GS_SORT_U32 = new Uint32Array(GS_SORT_F32.buffer);

const GS_VERTEX = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
layout(location=0) in vec2 aCorner;
uniform usampler2D uOrder;
uniform sampler2D uCenter;
uniform sampler2D uScale;
uniform sampler2D uQuat;
uniform sampler2D uDc;
uniform sampler2D uRest;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uView;
uniform vec3 uEye;
uniform vec2 uFocal;
uniform float uNear;
uniform bool uPerspective;
uniform sampler2D uFlags;
uniform vec3 uTarget;
uniform vec2 uPan;
uniform vec2 uViewport;
uniform float uBaseHeight;
uniform float uZoom;
uniform float uScaleMul;
uniform float uCutoff;
uniform int uWidth;
uniform int uRestWidth;
uniform int uDegree;
uniform bool uPointPreview;
uniform float uFar;
out vec4 vColor;
out vec2 vPos;
// SH coefficients are packed four per texel. Fetch each texel once per channel.
vec4 gsBands(int id, int channel, int group) {
  int texel=id*12+channel*4+group;
  return texelFetch(uRest,ivec2(texel%uRestWidth,texel/uRestWidth),0);
}
vec3 gsShade(vec3 dc, int id, vec3 direction) {
  vec3 color=0.28209479177387814*dc;
  if(uDegree>0){
    float x=direction.x,y=direction.y,z=direction.z;
    float xx=x*x,yy=y*y,zz=z*z,xy=x*y,yz=y*z,xz=x*z;
    vec4 b0=vec4(-0.4886025119029199*y,0.4886025119029199*z,-0.4886025119029199*x,uDegree>1?1.0925484305920792*xy:0.0);
    vec4 b1=vec4(-1.0925484305920792*yz,0.31539156525252005*(2.0*zz-xx-yy),-1.0925484305920792*xz,0.5462742152960396*(xx-yy));
    vec4 b2=vec4(-0.5900435899266435*y*(3.0*xx-yy),2.890611442640554*xy*z,-0.4570457994644658*y*(4.0*zz-xx-yy),0.3731763325901154*z*(2.0*zz-3.0*xx-3.0*yy));
    vec4 b3=vec4(-0.4570457994644658*x*(4.0*zz-xx-yy),1.445305721320277*z*(xx-yy),-0.5900435899266435*x*(xx-3.0*yy),0.0);
    for(int c=0;c<3;c++){
      color[c]+=dot(gsBands(id,c,0),b0);
      if(uDegree>1)color[c]+=dot(gsBands(id,c,1),b1);
      if(uDegree>2)color[c]+=dot(gsBands(id,c,2),b2)+dot(gsBands(id,c,3),b3);
    }
  }
  return clamp(color+vec3(0.5),0.0,1.0);
}

void main() {
  ivec2 orderUv = ivec2(gl_InstanceID % uWidth, gl_InstanceID / uWidth);
  int id = int(texelFetch(uOrder, orderUv, 0).r);
  ivec2 uv = ivec2(id % uWidth, id / uWidth);
  vec4 centerA = texelFetch(uCenter, uv, 0);
  vec3 center = centerA.xyz;
  float opacity = centerA.w;
  if(uFar>0.0)opacity*=clamp((uFar-length(center-uEye))/(uFar*.1),0.0,1.0);
  vPos = aCorner * 3.0;
  int flags = int(texelFetch(uFlags, uv, 0).r + 0.5);
  float depth = -dot(center - uEye, -uView);
  if (opacity <= 0.0 || opacity < uCutoff || (flags & 6) != 0 || (uPerspective && depth <= uNear)) { vColor = vec4(0.0); gl_Position = vec4(2.0, 2.0, 0.0, 1.0); return; }
  if (uPointPreview) {
    vec3 rel = center - uEye;
    float h = uBaseHeight / uZoom;
    vec2 clip = vec2((dot(center-uTarget,uRight)-uPan.x)/(h*uViewport.x/uViewport.y), (dot(center-uTarget,uUp)-uPan.y)/h)*2.0;
    if(uPerspective) clip=vec2(dot(rel,uRight),dot(rel,uUp))/depth*uFocal*2.0/uViewport;
    gl_Position=vec4(clip+aCorner*4.0/uViewport,0.0,1.0);
    vec3 rgb=clamp(texelFetch(uDc,uv,0).xyz*0.28209479177387814+0.5,0.0,1.0);
    vColor=vec4(rgb*opacity,opacity);vPos=aCorner;return;
  }
  vec4 shapeA=texelFetch(uScale,uv,0);
  vec2 shapeB=texelFetch(uQuat,uv,0).xy;
  mat3 covariance=mat3(shapeA.x,shapeA.y,shapeA.z,shapeA.y,shapeA.w,shapeB.x,shapeA.z,shapeB.x,shapeB.y)*(uScaleMul*uScaleMul);
  float worldHeight = uBaseHeight / uZoom;
  float worldWidth = worldHeight * uViewport.x / max(uViewport.y, 1.0);
  float pixelsPerWorld = uViewport.y / worldHeight;
  vec3 relative = center - uEye;
  float vx = dot(relative, uRight), vy = dot(relative, uUp);
  // Bound the off-screen Jacobian: perspective linearization diverges near
  // the eye plane. This changes projection stability, never source scales.
  vec2 slopeLimit = 0.65 * uViewport / uFocal;
  vec2 slope = clamp(vec2(vx, vy) / max(depth, uNear), -slopeLimit, slopeLimit);
  vec3 jx = uPerspective ? uFocal.x / depth * (uRight + slope.x * (-uView)) : uRight * pixelsPerWorld;
  vec3 jy = uPerspective ? uFocal.y / depth * (uUp + slope.y * (-uView)) : uUp * pixelsPerWorld;
  float cov00=dot(jx,covariance*jx)+0.3;
  float cov11=dot(jy,covariance*jy)+0.3;
  float cov01=dot(jx,covariance*jy);
  float mid = 0.5 * (cov00 + cov11);
  float disc = sqrt(max(0.0, mid * mid - (cov00 * cov11 - cov01 * cov01)));
  float lambda1 = mid + disc;
  float lambda2 = max(mid - disc, 1e-4);
  vec2 eigen = abs(cov01) < 1e-4 ? (cov00 >= cov11 ? vec2(1.0, 0.0) : vec2(0.0, 1.0)) : normalize(vec2(cov01, lambda1 - cov00));
  vec2 ortho = vec2(-eigen.y, eigen.x);
  vec2 offset = aCorner.x * eigen * (3.0 * sqrt(lambda1)) + aCorner.y * ortho * (3.0 * sqrt(lambda2));
  float cx = dot(uTarget, uRight) + uPan.x;
  float cy = dot(uTarget, uUp) + uPan.y;
  vec2 clip = vec2((dot(center, uRight) - cx) / worldWidth, (dot(center, uUp) - cy) / worldHeight) * 2.0;
  if (uPerspective) clip = vec2(vx, vy) / depth * uFocal * 2.0 / uViewport;
  clip += offset * vec2(2.0 / uViewport.x, 2.0 / uViewport.y);
  gl_Position = vec4(clip, 0.0, 1.0);
  vec3 rgb = gsShade(texelFetch(uDc, uv, 0).xyz, id, uPerspective ? normalize(center - uEye) : uView);
  if ((flags & 1) != 0) rgb = mix(rgb, vec3(1.0, 0.55, 0.08), 0.65);
  vColor = vec4(rgb * opacity, opacity);
}`;

const GS_FRAGMENT = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vPos;
out vec4 fragColor;
void main() {
  float alpha = vColor.a * exp(-0.5 * dot(vPos, vPos));
  if (alpha < 1.0 / 255.0) discard;
  fragColor = vec4(vColor.rgb * (alpha / max(vColor.a, 1e-6)), alpha);
}`;

export function gsFloatSortKey(value) {
  GS_SORT_F32[0] = value;
  const bits = GS_SORT_U32[0];
  return (bits & 0x80000000 ? (~bits) : (bits | 0x80000000)) >>> 0;
}

function gsRadixSort(keys, order, temp) {
  const count = order.length, counts = new Uint32Array(256);
  let src = order, dst = temp;
  for (let shift = 0; shift < 32; shift += 8) {
    counts.fill(0);
    for (let index = 0; index < count; index += 1) counts[(keys[src[index]] >>> shift) & 255] += 1;
    let sum = 0;
    for (let bin = 0; bin < 256; bin += 1) { const next = counts[bin]; counts[bin] = sum; sum += next; }
    for (let index = 0; index < count; index += 1) {
      const id = src[index];
      dst[counts[(keys[id] >>> shift) & 255]++] = id;
    }
    const swap = src; src = dst; dst = swap;
  }
  if (src !== order) order.set(src);
}

/** Drop the outer 5% on each side so distant floaters do not shrink the trained subject. */
function gsDisplayBounds(models, min, max) {
  let total = 0;
  for (const model of models) total += model.count;
  if (total < 64) return [min, max];
  const values = new Float32Array(total);
  const low = Math.floor(0.05 * (total - 1));
  const high = total - 1 - low;
  const bounds = [[0, 0, 0], [0, 0, 0]];
  for (let axis = 0; axis < 3; axis += 1) {
    let write = 0;
    for (const model of models) for (let index = 0; index < model.count; index += 1) values[write++] = model.centers[index * 3 + axis];
    values.sort();
    bounds[0][axis] = values[low];
    bounds[1][axis] = values[high];
    if (!(bounds[1][axis] > bounds[0][axis])) return [min, max];
  }
  return bounds;
}

/** Ascending depth: orthographic camera looks along -forward, so smaller dots are farther away. */
export function gsSortedOrder(depths) {
  const count = depths.length, keys = new Uint32Array(count), order = new Uint32Array(count), temp = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) { keys[index] = gsFloatSortKey(depths[index]); order[index] = index; }
  gsRadixSort(keys, order, temp);
  return order;
}

export class GaussianViewer {
  constructor(canvas, {onError = () => {}} = {}) {
    this.canvas = canvas;
    this.onError = onError;
    this.options = {...currentPresentation(), showPoints: true, pointRatio: 100, legend: false};
    this.gauss = {scale: 1, opacityCutoff: 0, background: 'black', shDegree: 3};
    this.projection = 'perspective'; this.fov = 55; this.distance = 10; this.near = .001; this.trainingPose = null;
    this.editMode = 'orbit'; this.generation = 0; this.sortedReady = false; this.sortBusy = false;
    this.workerUrl = URL.createObjectURL(new Blob([GS_SORT_WORKER], {type:'text/javascript'}));
    try { this.sortWorker = new Worker(this.workerUrl); this.sortWorker.onmessage = event => this.receiveSort(event.data); this.sortWorker.onerror = () => {this.sortWorker.terminate();this.sortWorker=null;this.sortBusy=false;this.sortDirty=true;this.requestRender();}; } catch { this.sortWorker = null; }
    this.camera = {elevation: 38, azimuth: -55, zoom: 1, pan: [0, 0], roll: 0};
    let navigationSettings = {};
    try { navigationSettings = JSON.parse(localStorage.getItem(CAMERA_NAV_STORAGE) || '{}'); } catch {}
    this.navigation = new CameraNavigation(navigationSettings);
    this.target = [0, 0, 0];
    this.origin = [0, 0, 0];
    this.baseHeight = 10;
    this.bounds = null;
    this.buffers = {};
    this.models = [];
    this.activeClouds = [];
    this.pointCount = 0;
    this.edgeCount = 0;
    this.triangleCount = 0;
    this.count = 0;
    this.exportTarget = null;
    this.disposed = false;
    this.frame = null;
    this.contextLost = false;
    this.interacting = false;
    this.sortDirty = true;
    this.listeners = [];
    try {
      this.gl = canvas.getContext('webgl2', {antialias: false, alpha: false, preserveDrawingBuffer: false, depth: false});
      if (!this.gl) throw Error(t('无法启用 WebGL2，请使用 Chrome 或 Edge，并打开硬件加速。'));
      const rendererInfo=this.gl.getExtension('WEBGL_debug_renderer_info');
      this.softwareRendering=Boolean(rendererInfo&&/swiftshader|llvmpipe|softpipe|software/i.test(this.gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)||''));
      this.initGL();
    } catch (error) { this.onError(error.message); throw error; }
    this.installEvents();
    this.onNavVisibility = () => { if (document.hidden) this.stopNavigation(); };
    document.addEventListener('visibilitychange', this.onNavVisibility);
    this.resizeObserver = new ResizeObserver(() => this.requestRender());
    this.resizeObserver.observe(canvas);
    this.render();
  }

  initGL() {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || '';
        gl.deleteShader(shader);
        throw Error(t('WebGL 着色器编译失败：{0}', [message]));
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, GS_VERTEX);
    let fragment;
    try { fragment = compile(gl.FRAGMENT_SHADER, GS_FRAGMENT); }
    catch (error) { gl.deleteShader(vertex); throw error; }
    const program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || '';
      gl.deleteProgram(program);
      throw Error(t('WebGL 程序链接失败：{0}', [message]));
    }
    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    this.locations = {};
    for (const name of ['uOrder','uCenter','uScale','uQuat','uDc','uRest','uRight','uUp','uView','uTarget','uPan','uViewport','uBaseHeight','uZoom','uScaleMul','uCutoff','uWidth','uRestWidth','uDegree','uPointPreview','uFar','uEye','uFocal','uNear','uPerspective','uFlags']) {
      this.locations[name] = gl.getUniformLocation(program, name);
    }
    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    this.cornerBuffer = corners;
    this.textures = {};
    for (const name of ['order','center','scale','quat','dc','rest','flags']) this.textures[name] = gl.createTexture();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  installEvents() {
    const listen = (name, fn, options) => { this.canvas.addEventListener(name, fn, options); this.listeners.push([name, fn, options]); };
    this.canvas.style.touchAction = 'none';
    this.canvas.style.cursor = 'grab';
    listen('contextmenu', event => event.preventDefault());
    mountTouchCamera(this, listen);
    listen('pointerdown', event => {
      if (this.fly?.active) return;
      if (this.editMode !== 'orbit' && event.button === 0 && !event.altKey && event.pointerType !== 'touch') return;
      this.interacting = true;
      if (event.pointerType === 'touch' || ![0, 1, 2].includes(event.button)) return;
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      this.beginOrbit(event.button !== 0 || event.shiftKey);
      this.drag = {id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button !== 0 || event.shiftKey};
      this.canvas.style.cursor = 'grabbing';
    });
    listen('pointermove', event => {
      if (this.fly?.active || event.pointerType === 'touch' || !this.drag || this.drag.id !== event.pointerId) return;
      const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
      this.drag.x = event.clientX; this.drag.y = event.clientY;
      this.navigatePixels(dx, dy, this.drag.pan || event.shiftKey, event.ctrlKey || event.metaKey);
      this.requestRender();
    });
    const finish = event => {
      this.interacting = false;
      if (this.drag?.id === event.pointerId) {
        this.drag = null; this.canvas.style.cursor = 'grab';
        if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      }
      this.requestRender();
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(name, finish);
    listen('dblclick', event => {
      if(this.fly?.active || this.editMode!=='orbit' || event.button!==0)return;
      const rect=this.canvas.getBoundingClientRect();this.focusOrbit(event.clientX-rect.left,event.clientY-rect.top);
    });
    listen('wheel', event => {
      event.preventDefault();
      if (this.fly?.active) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1);
      this.zoomBy(Math.exp(-GS_CLAMP(delta, -500, 500) * 0.0015), event.ctrlKey || event.metaKey);
    }, {passive: false});
    listen('webglcontextlost', event => { event.preventDefault(); this.stopNavigation(); this.contextLost = true; this.onError(t('WebGL 显示上下文暂时丢失，正在等待浏览器恢复。')); });
    listen('webglcontextrestored', () => {
      this.contextLost = false;
      try { this.initGL(); this.sortedReady = false; this.sortDirty = true; this.upload(true); this.render(); this.onError(''); }
      catch (error) { this.onError(error.message); }
    });
  }

  basis() {
    if (this.flyPose) return this.flyPose.basis;
    if (this.trainingPose) return this.trainingPose.basis;
    const elevation = this.camera.elevation * GS_DEG, azimuth = this.camera.azimuth * GS_DEG;
    const right = [-Math.sin(azimuth), Math.cos(azimuth), 0];
    const up = [-Math.cos(azimuth)*Math.sin(elevation), -Math.sin(azimuth)*Math.sin(elevation), Math.cos(elevation)];
    const back = [Math.cos(azimuth)*Math.cos(elevation), Math.sin(azimuth)*Math.cos(elevation), Math.sin(elevation)];
    const roll = (this.camera.roll || 0) * GS_DEG, c = Math.cos(roll), sn = Math.sin(roll);
    return [right.map((v,i)=>v*c+up[i]*sn), up.map((v,i)=>v*c-right[i]*sn), back];
  }

  worldCenter() {
    if (!this.bounds) return [0, 0, 0];
    return this.bounds[0].map((value, axis) => (value + this.bounds[1][axis]) / 2);
  }

  fit() {
    this.fly?.leave();
    this.stopNavigation();
    this.leaveTraining(); this.orbitLens=null;
    const bounds = this.bounds ? this.bounds.map(point => point.map((value, axis) => value - this.origin[axis])) : [[-1, -1, -1], [1, 1, 1]];
    this.target = bounds[0].map((value, axis) => value + (bounds[1][axis] - value) / 2);
    const [right, up] = this.basis();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const x of [bounds[0][0], bounds[1][0]]) for (const y of [bounds[0][1], bounds[1][1]]) for (const z of [bounds[0][2], bounds[1][2]]) {
      const point = [x, y, z], px = GS_DOT(point, right), py = GS_DOT(point, up);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
    const aspect = Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight);
    this.baseHeight = Math.max(0.001, maxY - minY, (maxX - minX) / aspect) * 1.22;
    this.trainingPose = null;
    const extent = Math.hypot(...bounds[0].map((v,i)=>bounds[1][i]-v));
    this.distance = Math.max(.001, extent / (2 * Math.sin(Math.min(this.fov*Math.PI/180, 2*Math.atan(Math.tan(this.fov*Math.PI/360)*aspect))/2))) * 1.1;
    this.near = Math.max(1e-5, extent * .00001);
    this.camera.zoom = 1; this.camera.pan = [0, 0];
    this.render();
  }

  setView(view) {
    this.fly?.leave();
    this.stopNavigation();
    this.trainingPose = null; this.camera.roll = 0;
    const values = {iso: [38, -55], top: [90, -90], front: [0, -90]}[view];
    if (!values) throw Error(t('不支持的视角：{0}', [view]));
    [this.camera.elevation, this.camera.azimuth] = values;
    this.fit();
  }

  stopNavigation() { this.fly?.leave(); this.navigation?.reset(); }

  setNavigation(options) {
    this.stopNavigation();
    this.navigation.settings = cameraNavigationSettings({...this.navigation.settings, ...options});
    if(options.pivot && this.count) {
      if(options.pivot==='model')gsReanchorOrbit(this,{model:true});
      this.requestRender();
    }
    try { localStorage.setItem(CAMERA_NAV_STORAGE, JSON.stringify(this.navigation.settings)); } catch {}
  }

  applyNavigation(delta) {
    const [azimuth, elevation, x, y, zoom] = delta;
    if(azimuth||elevation) {
      const basis=this.basis(), yaw=basis.map(v=>gsOrbitRotate(v,basis[1],azimuth*GS_DEG));
      const turned=yaw.map(v=>gsOrbitRotate(v,yaw[0],-elevation*GS_DEG));
      gsSetOrbitBasis(this,turned);
    }
    this.camera.pan[0] += x; this.camera.pan[1] += y;
    this.camera.zoom = GS_CLAMP(this.camera.zoom * Math.exp(zoom), 0.02, 100);
    // Discard outward pressure at limits so reversing direction responds at once.
    if (this.camera.zoom === .02 || this.camera.zoom === 100) this.navigation.pending[4] = 0;

  }

  queueNavigation(delta) {
    this.navigation.enqueue(delta, performance.now());
    if (!this.navigation.settings.smoothing) this.applyNavigation(this.navigation.step(performance.now()));
    this.requestRender();
  }

  beginOrbit(pan = false) {
    if(!this.count || this.fly?.active)return;
    this.navigation.reset();
    const mode=this.navigation.settings.pivot;
    if(!pan && mode!=='fixed')gsReanchorOrbit(this,{model:mode==='model'});
    this.leaveTraining();
  }

  focusOrbit(x = null, y = null) {
    if(!this.count)return false;
    this.stopNavigation();
    const hit=gsReanchorOrbit(this,{x,y});
    if(hit)this.setNavigation({pivot:'fixed'});
    this.onOrbitAnchor?.(hit);this.requestRender();return hit;
  }

  navigatePixels(dx, dy, pan = false, precision = false) {
    if (!this.count) return;
    this.leaveTraining();
    const scale = cameraNavigationScale(this, this.navigation.settings), fine = precision ? .2 : 1;
    this.queueNavigation(pan ? [0, 0, -dx*scale.pan*fine, dy*scale.pan*fine, 0]
      : [-dx*scale.rotateX*fine, dy*scale.rotateY*fine, 0, 0, 0]);
  }

  zoomBy(factor, precision = false, repivot = true) {
    if (!Number.isFinite(factor) || factor <= 0 || !this.count) return;
    const now=performance.now();
    if(repivot && (!this.lastOrbitWheel || now-this.lastOrbitWheel>180))this.beginOrbit(false);
    this.lastOrbitWheel=now;
    this.leaveTraining();
    this.queueNavigation([0,0,0,0,Math.log(factor)*this.navigation.settings.zoomSpeed*(precision ? .2 : 1)]);
  }

  setOptions(options = {}) {
    for (const key of ['axes', 'ruler', 'legend', 'pointCountLabel']) if (key in options) this.options[key] = Boolean(options[key]);
    this.render();
  }

  setGaussianOptions(options = {}) {
    if (Number.isFinite(options.scale)) this.gauss.scale = GS_CLAMP(options.scale, 0.05, 8);
    if (Number.isFinite(options.opacityCutoff)) this.gauss.opacityCutoff = GS_CLAMP(options.opacityCutoff, 0, 0.99);
    if (options.background && GS_BACKGROUNDS[options.background]) this.gauss.background = options.background;
    if (Number.isInteger(options.shDegree)) this.gauss.shDegree = GS_CLAMP(options.shDegree, 0, this.packed?.rest ? 3 : 0);
    this.render();
  }

  clearSplats() {
    this.fly?.leave();
    this.stopNavigation();
    this.models = []; this.sourceMap = []; this.trainingPose = null; this.packed = null; this.generation++; this.sortBusy=false; this.sortedReady=false; this.count = 0; this.pointCount = 0; this.bounds = null;
    this.buffers = {}; this.activeClouds = []; this.sortDirty = true; this.render();
  }

  setModels(models, {preserveView = false, maxSplats = 0, shDegree = this.gauss.shDegree} = {}) {
    this.fly?.leave();
    this.stopNavigation();
    preserveView = preserveView && this.count > 0;
    const list = (models || []).filter(model => model?.count > 0);
    this.models = list;
    if (!list.length) { this.clearSplats(); return; }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let total = 0, sourceCount = 0;
    for (const model of list) {
      total += model.count; sourceCount += model.sourceCount || model.count;
      for (let axis = 0; axis < 3; axis += 1) { min[axis] = Math.min(min[axis], model.bounds.min[axis]); max[axis] = Math.max(max[axis], model.bounds.max[axis]); }
    }
    const stride = maxSplats > 0 && total > maxSplats ? Math.ceil(total / maxSplats) : 1;
    const displayed = Math.ceil(total / stride);
    const origin = min.map((value, axis) => (value + max[axis]) / 2);
    const frame = gsDisplayBounds(list, min, max);
    // Preserve all source scales; cleanup must be an explicit reversible edit.
    const previousOrigin = [...this.origin], previousTarget = [...this.target];
    const centers = new Float32Array(displayed * 3), dc = new Float32Array(displayed * 3), opacity = new Float32Array(displayed);
    const scale = new Float32Array(displayed * 3), quat = new Float32Array(displayed * 4);
    const withRest = shDegree > 0 && list.some(model => model.rest);
    const rest = withRest ? new Float32Array(displayed * 45) : null;
    this.sourceMap = [];
    const flags = new Float32Array(displayed);
    let write = 0, global = 0;
    for (const model of list) for (let index = 0; index < model.count; index += 1, global += 1) {
      if (global % stride) continue;
      centers.set([model.centers[index * 3] - origin[0], model.centers[index * 3 + 1] - origin[1], model.centers[index * 3 + 2] - origin[2]], write * 3);
      dc.set(model.dc.subarray(index * 3, index * 3 + 3), write * 3);
      opacity[write] = model.opacity[index];
      const sx = model.scale[index * 3], sy = model.scale[index * 3 + 1], sz = model.scale[index * 3 + 2];
      // Preserve approximate projected coverage after thinning: area scales with radius squared.
      const coverage = model.preview ? Math.sqrt(model.sampleStep || 1) : 1;
      scale.set([sx * coverage, sy * coverage, sz * coverage], write * 3);
      this.sourceMap.push([model, index]); flags[write] = model.editFlags?.[index] || 0;
      quat.set(model.quat.subarray(index * 4, index * 4 + 4), write * 4);
      if (rest && model.rest) rest.set(model.rest.subarray(index * 45, index * 45 + 45), write * 45);
      write += 1;
    }
    this.origin = origin; this.bounds = frame; this.pointCount = sourceCount; this.count = write;
    this.packed = {
      centers: centers.subarray(0, write * 3), dc: dc.subarray(0, write * 3), opacity: opacity.subarray(0, write),
      scale: scale.subarray(0, write * 3), quat: quat.subarray(0, write * 4), rest: rest ? rest.subarray(0, write * 45) : null,
    };
    this.flags = flags;
    this.buffers = {...this.packed};
    this.activeClouds = [{count: write, item: {displayColor: '#888888'}}];
    this.gauss.shDegree = withRest ? shDegree : 0;
    this.sortDirty = true;
    this.generation++; this.sortBusy=false; this.sortedReady=false;
    if(this.sortWorker) {const copy=this.packed.centers.slice();this.sortWorker.postMessage({type:'data',generation:this.generation,centers:copy.buffer},[copy.buffer]);}
    this.upload(false);
    if (preserveView) {
      this.target = previousTarget.map((value, axis) => value + previousOrigin[axis] - origin[axis]);
      if (this.trainingPose) this.trainingPose.eye = this.trainingPose.eye.map((value, axis) => value + previousOrigin[axis] - origin[axis]);
    }
    else { this.fit(); return; }
    this.render();
  }

  upload(force) {
    if (!this.packed || (!force && this.uploaded === this.packed)) return;
    const gl = this.gl, count = this.count, width = 2048, height = Math.max(1, Math.ceil(count / width));
    const pixels = (channels, fill) => {
      const data = new Float32Array(width * height * 4);
      for (let index = 0; index < count; index += 1) fill(data, index, index * 4);
      return data;
    };
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if(height>maxTexture || (this.packed.rest && Math.ceil(count*12/width)>maxTexture)) throw Error('超出当前 GPU 纹理容量，请选择较少显示数量 / GPU texture capacity exceeded');
    const center = pixels(4, (data, index, at) => { data.set(this.packed.centers.subarray(index * 3, index * 3 + 3), at); data[at + 3] = this.packed.opacity[index]; });
    const scale=new Float32Array(width*height*4), quat=new Float32Array(width*height*4);
    for(let i=0;i<count;i++){
      const a=i*3,b=i*4,p=this.packed;
      const cov=gsCovariance(p.scale[a],p.scale[a+1],p.scale[a+2],p.quat[b],p.quat[b+1],p.quat[b+2],p.quat[b+3]);
      scale[b]=cov[0];scale[b+1]=cov[1];scale[b+2]=cov[2];scale[b+3]=cov[3];quat[b]=cov[4];quat[b+1]=cov[5];
    }
    const dc = pixels(4, (data, index, at) => data.set(this.packed.dc.subarray(index * 3, index * 3 + 3), at));
    this.textureSize = {width, height};
    this.orderPixels=new Uint32Array(width*height);
    gl.bindTexture(gl.TEXTURE_2D,this.textures.order);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.R32UI,width,height,0,gl.RED_INTEGER,gl.UNSIGNED_INT,null);
    this.putFloat(this.textures.center, width, height, center);
    this.putFloat(this.textures.scale, width, height, scale);
    this.putFloat(this.textures.quat, width, height, quat);
    this.putFloat(this.textures.dc, width, height, dc);
    if (this.packed.rest) {
      const texelCount = count * 12, restWidth = 2048, restHeight = Math.ceil(texelCount / restWidth);
      const rest = new Float32Array(restWidth * restHeight * 4);
      for (let index = 0; index < count; index += 1) for (let channel = 0; channel < 3; channel += 1) for (let band = 0; band < 15; band += 1) {
        const texel = index * 12 + channel * 4 + (band >> 2);
        rest[texel * 4 + (band & 3)] = this.packed.rest[index * 45 + channel * 15 + band];
      }
      this.restSize = {width: restWidth, height: restHeight};
      this.putFloat(this.textures.rest, restWidth, restHeight, rest);
    } else {
      this.restSize = {width: 1, height: 1};
      this.putFloat(this.textures.rest, 1, 1, new Float32Array(4));
    }
    this.syncFlags(false);
    this.uploaded = this.packed;
    const error = gl.getError();
    if (error === gl.OUT_OF_MEMORY) throw Error(t('显存不足，请降低显示数量。'));
    if (error && error !== gl.NO_ERROR) throw Error(t('WebGL 缓冲区上传失败（{0}）。', [error]));
  }

  receiveSort(message) {
    if(message.generation!==this.generation)return;
    this.sortBusy=false;
    this.diagnosticProbe?.sort(message.sortMs,performance.now()-this.diagnosticSortStart);
    if(!this.packed || this.contextLost)return;
    this.uploadOrder(new Uint32Array(message.order));
    this.sortForward=message.forward;this.sortTarget=[...this.target];this.sortDirty=false;this.sortedReady=true;this.requestRender();
  }
  uploadOrder(order) {
    const started=performance.now(),gl=this.gl,{width,height}=this.textureSize;
    this.orderPixels.set(order);
    gl.bindTexture(gl.TEXTURE_2D,this.textures.order);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RED_INTEGER,gl.UNSIGNED_INT,this.orderPixels);
    this.diagnosticProbe?.upload(performance.now()-started);
  }
  syncFlags(redraw=true) {
    if(!this.packed)return;
    const {width,height}=this.textureSize, data=new Float32Array(width*height*4);
    for(let i=0;i<this.sourceMap.length;i++){const [model,id]=this.sourceMap[i];data[i*4]=model.editFlags?.[id]||0;this.flags[i]=data[i*4];}
    this.putFloat(this.textures.flags,width,height,data);
    if(redraw)this.requestRender();
  }
  applyTraining(camera) {
    this.fly?.leave();
    this.stopNavigation();
    this.orbitLens=null;this.trainingPose=gsTrainingPose(camera,this.origin);this.near=.2;this.projection='perspective';this.camera.zoom=1;this.camera.pan=[0,0];
    this.fov=2*Math.atan(camera.height/(2*camera.fy))*180/Math.PI;
    const center=this.worldCenter().map((v,i)=>v-this.origin[i]);
    const distance=Math.max(.01,Math.abs(GS_DOT(center.map((v,i)=>v-this.trainingPose.eye[i]),this.trainingPose.basis[2])));
    this.distance=distance;this.target=this.trainingPose.eye.map((v,i)=>v-this.trainingPose.basis[2][i]*distance);
    this.sortDirty=true;this.requestRender();
  }
  leaveTraining() {
    if(!this.trainingPose)return;
    const pose = this.trainingPose, back = pose.basis[2];
    this.camera.elevation = Math.asin(Math.max(-1,Math.min(1,back[2]))) / GS_DEG;
    this.camera.azimuth = Math.atan2(back[1],back[0]) / GS_DEG;
    this.trainingPose = null; this.camera.roll = 0; this.camera.pan = [0,0];
    const [right, up] = this.basis();
    this.camera.roll = Math.atan2(GS_DOT(pose.basis[0],up), GS_DOT(pose.basis[0],right)) / GS_DEG;
    const fit = Math.min(this.canvas.clientWidth/pose.width, this.canvas.clientHeight/pose.height);
    this.orbitLens={fx:pose.fx*fit/this.canvas.clientHeight,fy:pose.fy*fit/this.canvas.clientHeight};
    if (fit > 0) this.fov = 2*Math.atan(this.canvas.clientHeight/(2*pose.fy*fit)) / GS_DEG;

  }
  projectSource(model,index) {
    const rect=this.canvas.getBoundingClientRect();
    return gsProjectPosition(Array.from(model.centers.subarray(index*3,index*3+3),(v,a)=>v-this.origin[a]),gsViewSpec(this,rect.width,rect.height));
  }
  dispose() {
    this.fly?.dispose();
    this.stopNavigation(); document.removeEventListener('visibilitychange', this.onNavVisibility);
    clearTimeout(this.qualityTimer);this.diagnosticProbe?.stop();
    this.disposed=true;this.sortWorker?.terminate();URL.revokeObjectURL(this.workerUrl);this.resizeObserver.disconnect();
    for(const [name,fn,options] of this.listeners)this.canvas.removeEventListener(name,fn,options);
    if(this.frame!==null)cancelAnimationFrame(this.frame);
    for(const texture of Object.values(this.textures))this.gl.deleteTexture(texture);
    this.gl.deleteProgram(this.program);this.gl.deleteBuffer(this.cornerBuffer);
  }

  putFloat(texture, width, height, data) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
  }

  sort(forceSync = false) {
    if(this.sortWorker && !forceSync){if(this.sortBusy)return;this.sortBusy=true;this.diagnosticSortStart=performance.now();this.sortWorker.postMessage({type:'sort',generation:this.generation,forward:this.basis()[2]});return;}
    const count = this.count;
    if (!count || !this.packed) return;
    if (!this.sortKeys || this.sortKeys.length !== count) {
      this.sortKeys = new Uint32Array(count); this.sortOrder = new Uint32Array(count); this.sortTemp = new Uint32Array(count);
    }
    const [,, forward] = this.basis(), target = this.target, centers = this.packed.centers;
    for (let index = 0; index < count; index += 1) {
      const depth = (centers[index * 3] - target[0]) * forward[0] + (centers[index * 3 + 1] - target[1]) * forward[1] + (centers[index * 3 + 2] - target[2]) * forward[2];
      this.sortKeys[index] = gsFloatSortKey(depth); this.sortOrder[index] = index;
    }
    gsRadixSort(this.sortKeys, this.sortOrder, this.sortTemp);
    this.uploadOrder(this.sortOrder.subarray(0,count));
    this.sortedReady = true;
    this.sortForward = forward; this.sortTarget = [...target]; this.sortDirty = false;
  }

  needsSort() {
    if (this.sortDirty || !this.sortForward) return true;
    const [,, forward] = this.basis();
    const alignment = GS_DOT(forward, this.sortForward);
    // Translating the camera adds the same depth offset to every splat.
    return alignment < (this.interacting ? 0.999 : 0.999999);
  }

  requestRender() {
    if (this.frame !== null || this.disposed) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
  }

  render() {
    if (this.disposed || this.contextLost || !this.gl || (!this.exportTarget && globalThis.document?.hidden)) return;
    if (this.frame !== null) { cancelAnimationFrame(this.frame); this.frame = null; }
    const frameStarted=performance.now();
    if (!this.exportTarget && this.navigation.active) {
      this.applyNavigation(this.navigation.step(performance.now()));
      if (this.navigation.active) this.requestRender();
    }
    const gl = this.gl, canvas = this.canvas, rect = canvas.getBoundingClientRect();
    const specNow=gsViewSpec(this,rect.width,rect.height);
    const signature=[...specNow.eye,...specNow.basis.flat(),specNow.fx,specNow.fy,this.camera.zoom,...this.camera.pan];
    const changed=this.qualityPose && signature.some((n,i)=>Math.abs(n-this.qualityPose[i])>1e-9);
    if(!this.exportTarget){
      this.qualityPose=signature;
      if(changed){this.motionUntil=frameStarted+180;clearTimeout(this.qualityTimer);this.qualityTimer=setTimeout(()=>this.requestRender(),190);}
    }
    const moving=!this.exportTarget && frameStarted<(this.motionUntil||0);
    const quality=gsFrameQuality({pixelRatio:this.pixelRatioLimit||2,devicePixelRatio:globalThis.devicePixelRatio||1,moving,interactionScale:this.interactionScale??1,interactionDegree:this.interactionDegree??3,degree:this.gauss.shDegree,exporting:Boolean(this.exportTarget)});
    this.effectiveQuality={...quality,moving};
    const dpr = this.exportTarget?.scale || quality.dpr;
    const width = this.exportTarget?.width || Math.max(1, Math.round(rect.width * dpr));
    const height = this.exportTarget?.height || Math.max(1, Math.round(rect.height * dpr));
    if (!this.exportTarget && (canvas.width !== width || canvas.height !== height)) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height);
    const clear = this.exportTarget?.transparent ? [0, 0, 0, 0] : GS_BACKGROUNDS[this.gauss.background];
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (this.count && this.packed && this.needsSort()) {
      this.sort(Boolean(this.exportTarget));
      // Reproject the previous order immediately; the worker refines transparency next.
      if (!this.sortedReady) return;
    }
    gl.clearColor(clear[0], clear[1], clear[2], clear[3]); gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.count && this.packed) {
      const spec = gsViewSpec(this,width,height);
      const [right, up, forward] = spec.basis, loc = this.locations;
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(0, 0);
      const bind = (unit, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.textures[name]); };
      bind(0, 'order'); bind(1, 'center'); bind(2, 'scale'); bind(3, 'quat'); bind(4, 'dc'); bind(5, 'rest'); bind(6, 'flags');
      gl.uniform1i(loc.uOrder, 0); gl.uniform1i(loc.uCenter, 1); gl.uniform1i(loc.uScale, 2); gl.uniform1i(loc.uQuat, 3); gl.uniform1i(loc.uDc, 4); gl.uniform1i(loc.uRest, 5); gl.uniform1i(loc.uFlags, 6);
      gl.uniform3fv(loc.uEye,spec.eye); gl.uniform2f(loc.uFocal,spec.fx,spec.fy); gl.uniform1f(loc.uNear,spec.near); gl.uniform1i(loc.uPerspective,spec.perspective?1:0);
      gl.uniform3fv(loc.uRight, right); gl.uniform3fv(loc.uUp, up); gl.uniform3fv(loc.uView, [-forward[0], -forward[1], -forward[2]]);
      gl.uniform3fv(loc.uTarget, this.target); gl.uniform2fv(loc.uPan, this.camera.pan); gl.uniform2f(loc.uViewport, width, height);
      gl.uniform1f(loc.uBaseHeight, this.baseHeight); gl.uniform1f(loc.uZoom, this.camera.zoom);
      gl.uniform1f(loc.uScaleMul, this.gauss.scale); gl.uniform1f(loc.uCutoff, this.gauss.opacityCutoff);
      gl.uniform1i(loc.uWidth, this.textureSize.width); gl.uniform1i(loc.uRestWidth, this.restSize.width); gl.uniform1i(loc.uDegree, this.packed.rest ? quality.degree : 0);
      gl.uniform1i(loc.uPointPreview, this.pointPreview?1:0);
      gl.uniform1f(loc.uFar, this.viewDistance || 0);
      if(!this.exportTarget)this.diagnosticProbe?.begin();
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
      if(!this.exportTarget)this.diagnosticProbe?.end();
    }
    if (this.exportTarget) return;
    updateSceneGuides(this);
    this.onViewChange?.();
    this.diagnosticProbe?.frame(frameStarted,performance.now()-frameStarted,moving);
  }
}
