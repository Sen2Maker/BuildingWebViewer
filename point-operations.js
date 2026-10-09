/** Self-contained kernel: also serialized into a local Blob Worker for offline use. */
export function computePointFeatures(positions, {k = 32, radius = 0, orientation = '+z', features = ['normals','slope','planarity','roughness']} = {}, progress = () => {}) {
  if (!Array.isArray(features) || !features.length || features.some(name => !['normals','slope','planarity','roughness'].includes(name))) throw Error('请选择有效的计算项目');
  const selected = new Set(features);
  const count = positions.length / 3;
  if (!Number.isSafeInteger(count) || count < 3) throw Error('至少需要 3 个点');
  if (!Number.isInteger(k) || k < 3 || k > 256) throw Error('邻域点数必须是 3–256 的整数');
  if (!Number.isFinite(radius) || radius < 0) throw Error('邻域半径必须为非负数');
  if (!['+x', '-x', '+y', '-y', '+z', '-z'].includes(orientation)) throw Error('法向量方向无效');
  const ids = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    ids[i] = i;
    if (![positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]].every(Number.isFinite)) throw Error('XYZ 包含无效数值');
  }
  const coord = (i, axis) => positions[ids[i] * 3 + axis];
  function select(lo, hi, mid, axis) {
    while (lo < hi) {
      const pivot = coord((lo + hi) >>> 1, axis);
      let i = lo, j = hi;
      while (i <= j) {
        while (coord(i, axis) < pivot) i++;
        while (coord(j, axis) > pivot) j--;
        if (i <= j) { const a = ids[i]; ids[i++] = ids[j]; ids[j--] = a; }
      }
      if (mid <= j) hi = j; else if (mid >= i) lo = i; else break;
    }
  }
  let built = 0, nextBuild = 0;
  function build(lo, hi, depth) {
    if (lo >= hi) return;
    if (hi - lo <= 16) { built += hi - lo; }
    else {
      const mid = (lo + hi) >>> 1; select(lo, hi - 1, mid, depth % 3); built++;
      build(lo, mid, depth + 1); build(mid + 1, hi, depth + 1);
    }
    if (built >= nextBuild) { progress({phase: 'index', done: built, total: count}); nextBuild = built + 16384; }
  }
  progress({phase: 'index', done: 0, total: count}); build(0, count, 0);
  const cap = Math.min(k, count), near = new Uint32Array(cap), distances = new Float64Array(cap);
  let used = 0;
  const r2 = radius > 0 ? radius * radius : Infinity;
  function insert(id, distance) {
    if (distance > r2 || (used === cap && distance >= distances[0])) return;
    let pos;
    if (used < cap) {
      pos = used++;
      while (pos > 0) {
        const parent = (pos - 1) >>> 1;
        if (distances[parent] >= distance) break;
        distances[pos] = distances[parent]; near[pos] = near[parent]; pos = parent;
      }
    } else {
      pos = 0;
      while (pos * 2 + 1 < used) {
        let child = pos * 2 + 1;
        if (child + 1 < used && distances[child + 1] > distances[child]) child++;
        if (distances[child] <= distance) break;
        distances[pos] = distances[child]; near[pos] = near[child]; pos = child;
      }
    }
    distances[pos] = distance; near[pos] = id;
  }
  function query(lo, hi, depth, x, y, z) {
    if (lo >= hi) return;
    const visit = i => {
      const id = ids[i], p = id * 3;
      insert(id, (positions[p] - x) ** 2 + (positions[p + 1] - y) ** 2 + (positions[p + 2] - z) ** 2);
    };
    if (hi - lo <= 16) { for (let i = lo; i < hi; i++) visit(i); return; }
    const mid = (lo + hi) >>> 1, axis = depth % 3;
    const delta = (axis === 0 ? x : axis === 1 ? y : z) - coord(mid, axis);
    visit(mid);
    if (delta <= 0) query(lo, mid, depth + 1, x, y, z); else query(mid + 1, hi, depth + 1, x, y, z);
    if (delta * delta <= Math.min(r2, used === cap ? distances[0] : Infinity)) {
      if (delta <= 0) query(mid + 1, hi, depth + 1, x, y, z); else query(lo, mid, depth + 1, x, y, z);
    }
  }
  const fields = Object.create(null);
  for (const name of [...(selected.has('normals') ? ['nx','ny','nz'] : []), ...['slope','planarity','roughness'].filter(name=>selected.has(name))]) fields[name] = new Float64Array(count).fill(NaN);
  fields.normal_valid = new Uint8Array(count);
  let valid = 0;
  const directionAxis = 'xyz'.indexOf(orientation[1]), sign = orientation[0] === '-' ? -1 : 1;
  for (let index = 0; index < count; index++) {
    const p = index * 3, x = positions[p], y = positions[p + 1], z = positions[p + 2];
    used = 0; query(0, count, 0, x, y, z);
    if (used >= 3) {
      // Relative coordinates avoid subtracting two large world-coordinate sums.
      let mx = 0, my = 0, mz = 0;
      for (let j = 0; j < used; j++) { const q = near[j] * 3; mx += positions[q] - x; my += positions[q + 1] - y; mz += positions[q + 2] - z; }
      mx /= used; my /= used; mz /= used;
      const a = new Float64Array(9), vectors = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      for (let j = 0; j < used; j++) {
        const q = near[j] * 3, dx = positions[q] - x - mx, dy = positions[q + 1] - y - my, dz = positions[q + 2] - z - mz;
        a[0] += dx * dx; a[1] += dx * dy; a[2] += dx * dz; a[4] += dy * dy; a[5] += dy * dz; a[8] += dz * dz;
      }
      a[3] = a[1]; a[6] = a[2]; a[7] = a[5];
      for (let sweep = 0; sweep < 24; sweep++) {
        let u = 0, v = 1;
        if (Math.abs(a[2]) > Math.abs(a[1])) v = 2;
        if (Math.abs(a[5]) > Math.abs(a[u * 3 + v])) { u = 1; v = 2; }
        const uv = a[u * 3 + v];
        if (Math.abs(uv) <= 1e-14 * (Math.abs(a[0]) + Math.abs(a[4]) + Math.abs(a[8]))) break;
        const angle = 0.5 * Math.atan2(2 * uv, a[v * 3 + v] - a[u * 3 + u]);
        const c = Math.cos(angle), s = Math.sin(angle), uu = a[u * 3 + u], vv = a[v * 3 + v];
        a[u * 3 + u] = c * c * uu - 2 * s * c * uv + s * s * vv;
        a[v * 3 + v] = s * s * uu + 2 * s * c * uv + c * c * vv;
        a[u * 3 + v] = a[v * 3 + u] = 0;
        for (let w = 0; w < 3; w++) {
          if (w !== u && w !== v) {
            const wu = a[w * 3 + u], wv = a[w * 3 + v];
            a[w * 3 + u] = a[u * 3 + w] = c * wu - s * wv;
            a[w * 3 + v] = a[v * 3 + w] = s * wu + c * wv;
          }
          const wu = vectors[w * 3 + u], wv = vectors[w * 3 + v];
          vectors[w * 3 + u] = c * wu - s * wv; vectors[w * 3 + v] = s * wu + c * wv;
        }
      }
      const order = [0, 1, 2].sort((u, v) => a[u * 3 + u] - a[v * 3 + v]);
      const low = Math.max(0, a[order[0] * 3 + order[0]]), mid = Math.max(0, a[order[1] * 3 + order[1]]), high = a[order[2] * 3 + order[2]];
      if (high > 0 && mid > high * 1e-10) {
        const n = [vectors[order[0]], vectors[3 + order[0]], vectors[6 + order[0]]];
        let orient = n[directionAxis];
        if (Math.abs(orient) < 1e-12) orient = n.find(value => Math.abs(value) >= 1e-12) || 1;
        if (orient * sign < 0) for (let axis = 0; axis < 3; axis++) n[axis] *= -1;
        if (selected.has('normals')) { fields.nx[index] = n[0]; fields.ny[index] = n[1]; fields.nz[index] = n[2]; }
        if (selected.has('slope')) fields.slope[index] = Math.acos(Math.min(1, Math.abs(n[2]))) * 180 / Math.PI;
        if (selected.has('planarity')) fields.planarity[index] = Math.max(0, Math.min(1, (mid - low) / high));
        if (selected.has('roughness')) fields.roughness[index] = Math.abs(mx * n[0] + my * n[1] + mz * n[2]);
        fields.normal_valid[index] = 1; valid++;
      }
    }
    if (index % 2048 === 0 || index === count - 1) progress({phase: 'features', done: index + 1, total: count});
  }
  return {fields, valid, count};
}

export function runPointFeatures(positions, options, {signal, onProgress = () => {}} = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('已取消', 'AbortError')); return; }
    const source = `const compute = ${computePointFeatures.toString()}; onmessage = event => { try { const result = compute(event.data.positions, event.data.options, progress => postMessage({progress})); postMessage({result}, Object.values(result.fields).map(a => a.buffer)); } catch (error) { postMessage({error: error.message}); } };`;
    const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
    let worker;
    const cleanup = () => { worker?.terminate(); URL.revokeObjectURL(url); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new DOMException('已取消', 'AbortError')); };
    try {
      worker = new Worker(url);
      signal?.addEventListener('abort', abort, {once: true});
      worker.onmessage = ({data}) => {
        if (data.progress) { onProgress(data.progress); return; }
        cleanup(); if (data.error) reject(Error(data.error)); else resolve(data.result);
      };
      worker.onerror = event => { cleanup(); reject(Error(event.message || '后台计算失败')); };
      // Transfer an owned copy; never detach the viewer/cache's coordinate buffer.
      const copy = positions.slice(); worker.postMessage({positions: copy, options}, [copy.buffer]);
    } catch (error) { cleanup(); reject(error); }
  });
}

export function derivedPointCloud(cloud, result, parameters, scope) {
  const fields = Object.assign(Object.create(null), cloud.fields), mapping = {};
  for (const [name, values] of Object.entries(result.fields)) {
    let key = name, suffix = 2;
    while (Object.hasOwn(fields, key)) key = `${name}_${suffix++}`;
    fields[key] = values; mapping[name] = key;
  }
  const columnOrder = cloud.columnOrder ? [...cloud.columnOrder] : ['x','y','z',...Object.keys(cloud.fields||{}).filter(key=>!['x','y','z'].includes(key))];
  const added=Object.values(mapping);
  let at=columnOrder.length;
  if(parameters.placement==='after-xyz')at=Math.max(...['x','y','z'].map(key=>columnOrder.indexOf(key)))+1;
  if(parameters.placement==='index') {
    if(!Number.isInteger(parameters.insertColumn)||parameters.insertColumn<1||parameters.insertColumn>columnOrder.length+1)throw Error(`插入列号需为 1–${columnOrder.length+1}`);
    at=parameters.insertColumn-1;
  }
  columnOrder.splice(at,0,...added);
  const semantics=cloud.semantics?JSON.parse(JSON.stringify(cloud.semantics)):null;
  if(semantics) {
    semantics.order=columnOrder;
    for(const [name,key] of Object.entries(mapping)) {
      if(['nx','ny','nz'].includes(name)) {
        for(const old of Object.keys(semantics.tags))if(semantics.tags[old]===name)semantics.tags[old]='scalar';
        semantics.tags[key]=name;
      } else semantics.tags[key]='scalar';
    }
  }
  return {...cloud, fields, columnOrder, semantics, count: cloud.count, totalCount: cloud.count, featureMapping: mapping,
    notes: [...(cloud.notes || []), `计算结果（${scope}）：${result.valid} / ${cloud.count} 个有效邻域；k=${parameters.k}，半径=${parameters.radius || '不限'}，方向=${parameters.orientation}。`],
    processing: {parameters, scope, originalTotal: cloud.totalCount, fields: mapping, valid: result.valid}};
}
