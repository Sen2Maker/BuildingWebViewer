/** Local point / line readers. Coordinates stay Float64 until the renderer recenters them. */
const POINT_TYPES = {
  char: ['getInt8', 1], int8: ['getInt8', 1], uchar: ['getUint8', 1], uint8: ['getUint8', 1],
  short: ['getInt16', 2], int16: ['getInt16', 2], ushort: ['getUint16', 2], uint16: ['getUint16', 2],
  int: ['getInt32', 4], int32: ['getInt32', 4], uint: ['getUint32', 4], uint32: ['getUint32', 4],
  float: ['getFloat32', 4], float32: ['getFloat32', 4], double: ['getFloat64', 8], float64: ['getFloat64', 8],
};
const POINT_DECODER = new TextDecoder('utf-8');
const POINT_TEXT_CHUNK_BYTES = 1024 * 1024;
const POINT_TEXT_MAX_LINE_CHARS = 1024 * 1024;

function pointBounds() { return [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]]; }
function extendPointBounds(bounds, xyz) {
  for (let a = 0; a < 3; a++) { bounds[0][a] = Math.min(bounds[0][a], xyz[a]); bounds[1][a] = Math.max(bounds[1][a], xyz[a]); }
}
function pointError(message) { throw Error(message); }
function pointNames(names) {
  const used = new Set();
  return names.map((raw, i) => {
    const name = String(raw).trim().replace(/^['"]|['"]$/g, '').toLowerCase() || `column_${i + 1}`;
    if (used.has(name)) pointError(`点云字段名称重复：${name}`);
    used.add(name); return name;
  });
}
function numericPoint(value, where) {
  const text = String(value).trim().replace(/^['"]|['"]$/g, '');
  if (text === '') pointError(`${where}：缺少数值`);
  const number = Number(text);
  if (!Number.isFinite(number)) pointError(`${where}：存在无效或非有限数值`);
  return number;
}

/** Read OBJ polylines. Face boundary edges are used only when no l records exist. */
export function parseWireOBJ(text, id = '') {
  const vertices = [], lineEdges = [], faceEdges = [], bounds = pointBounds();
  let hasContent = false, hasKnownRecord = false;
  let lineNumber = 0;
  for (const line of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    lineNumber++;
    const fields = line.split('#')[0].trim().split(/\s+/);
    if (fields[0]) hasContent = true;
    if (/^(v|vt|vn|vp|l|f|o|g|s|mtllib|usemtl)$/.test(fields[0])) hasKnownRecord = true;
    if (fields[0] === 'v') {
      if (fields.length < 4) pointError(`OBJ 第 ${lineNumber} 行：顶点缺少 XYZ`);
      const vertex = fields.slice(1, 4).map(value => numericPoint(value, `OBJ 第 ${lineNumber} 行`));
      vertices.push(vertex); extendPointBounds(bounds, vertex);
    } else if (fields[0] === 'l' || fields[0] === 'f') {
      const isFace = fields[0] === 'f';
      if (fields.length < (isFace ? 4 : 3)) pointError(`OBJ 第 ${lineNumber} 行：索引数量不足`);
      const indices = fields.slice(1).map(token => {
        const raw = token.split('/')[0];
        if (!/^[+-]?\d+$/.test(raw)) pointError(`OBJ 第 ${lineNumber} 行：面或线索引无效`);
        const index = Number(raw);
        if (!Number.isSafeInteger(index) || index === 0) pointError(`OBJ 第 ${lineNumber} 行：索引无效`);
        const resolved = index > 0 ? index - 1 : vertices.length + index;
        if (resolved < 0) pointError(`OBJ 第 ${lineNumber} 行：负索引越界`);
        return resolved;
      });
      const target = isFace ? faceEdges : lineEdges;
      for (let i = 1; i < indices.length; i++) target.push([indices[i - 1], indices[i]]);
      if (isFace) target.push([indices[indices.length - 1], indices[0]]);
    }
  }
  if ([...lineEdges, ...faceEdges].some(edge => edge.some(i => i >= vertices.length))) pointError('OBJ 索引超出顶点范围');
  const source = lineEdges.length ? lineEdges : faceEdges;
  if (!source.length) {
    if (hasContent && !hasKnownRecord) pointError('OBJ 没有可识别的顶点或线框记录');
    return {id, vertices, edges: [], bounds: vertices.length ? bounds : null, empty: true};
  }
  const seen = new Set(), edges = [];
  for (const [a, b] of source) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (a !== b && !seen.has(key)) { seen.add(key); edges.push([a, b]); }
  }
  if (!edges.length) pointError('OBJ 只含退化线段');
  return {id, vertices, edges, bounds, empty: false};
}

const POINT_STORAGE_CHUNK_POINTS = 16384;
const POINT_RESERVOIR_SEED = 0x9e3779b9;

function pointLimit(maxPoints) {
  if (!Number.isSafeInteger(maxPoints) || maxPoints < 0) pointError('maxPoints 必须为非负整数；0 表示全量');
  return maxPoints;
}

function pointRandom() {
  let state = POINT_RESERVOIR_SEED;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Algorithm R with a fixed seed. The selected rows are sorted back into source order. */
function pointSampleIndices(totalCount, maxPoints) {
  const count = Math.min(totalCount, maxPoints), indices = new Float64Array(count), random = pointRandom();
  for (let i = 0; i < totalCount; i++) {
    if (i < count) indices[i] = i;
    else {
      const slot = Math.floor(random() * (i + 1));
      if (slot < count) indices[slot] = i;
    }
  }
  indices.sort();
  return indices;
}

/** Unknown-size input grows in TypedArray blocks, never in per-point JS object arrays. */
function pointCollector(names, expectedCount, maxPoints, notes, hints = {}) {
  pointLimit(maxPoints);
  names = pointNames(names);
  if (expectedCount !== null && (!Number.isSafeInteger(expectedCount) || expectedCount < 1)) pointError('点云没有有效点，或点数无效');
  const axes = ['x', 'y', 'z'].map(name => names.indexOf(name));
  if (axes.some(i => i < 0)) pointError('点云表头必须包含 x、y、z 字段');
  const rgbNames = [['r', 'g', 'b'], ['red', 'green', 'blue'], ['diffuse_red', 'diffuse_green', 'diffuse_blue']].find(group => group.every(name => names.includes(name)));
  const rgbAxes = rgbNames?.map(name => names.indexOf(name));
  const packedName = !rgbNames && ['rgb', 'rgba'].find(name => names.includes(name));
  const packedAxis = packedName ? names.indexOf(packedName) : -1;
  const hasRGB = Boolean(rgbNames || packedName), chunks = [], bounds = pointBounds(), random = pointRandom();
  let totalCount = 0, count = 0, maxRGB = 0, invalidRGB = false;
  const capacity = Math.min(POINT_STORAGE_CHUNK_POINTS, maxPoints || Infinity, expectedCount || Infinity);
  function newChunk() {
    const chunk = {positions: new Float64Array(capacity * 3), fields: names.map(() => new Float32Array(capacity))};
    if (maxPoints) chunk.indices = new Float64Array(capacity);
    if (hasRGB) chunk.rgb = new Float32Array(capacity * 3);
    chunks.push(chunk);
    return chunk;
  }
  function rowSource(slot) { return chunks[Math.floor(slot / capacity)].indices[slot % capacity]; }
  return {
    add(values, index = totalCount) {
      if (index !== totalCount) pointError('点云行序不连续');
      if (values.length !== names.length) pointError(`点 ${index + 1} 的字段数量不一致`);
      for (let axis = 0; axis < 3; axis++) {
        const value = values[axes[axis]];
        if (!Number.isFinite(value)) pointError(`点 ${index + 1} 的 XYZ 无效或非有限`);
        bounds[0][axis] = Math.min(bounds[0][axis], value); bounds[1][axis] = Math.max(bounds[1][axis], value);
      }
      // Inspect every original RGB value, including rows not retained by the reservoir.
      if (rgbAxes) for (const axis of rgbAxes) {
        const value = values[axis];
        if (!Number.isFinite(value) || value < 0 || value > 255) invalidRGB = true;
        maxRGB = Math.max(maxRGB, value);
      }
      else if (packedName) {
        const raw = values[packedAxis];
        if (!Number.isInteger(raw) || raw < 0 || raw > 0xffffffff) invalidRGB = true;
      }
      totalCount++;
      if (!Number.isSafeInteger(totalCount)) pointError('点云点数超出可表示范围');
      let slot = index;
      if (maxPoints && index >= maxPoints) {
        slot = Math.floor(random() * totalCount);
        if (slot >= maxPoints) return;
      } else count++;
      const chunkIndex = Math.floor(slot / capacity), local = slot % capacity;
      const chunk = chunks[chunkIndex] || newChunk(), base = local * 3;
      for (let axis = 0; axis < 3; axis++) chunk.positions[base + axis] = values[axes[axis]];
      for (let field = 0; field < names.length; field++) chunk.fields[field][local] = values[field];
      if (chunk.indices) chunk.indices[local] = index;
      if (rgbAxes) for (let channel = 0; channel < 3; channel++) chunk.rgb[base + channel] = values[rgbAxes[channel]];
      else if (packedName) {
        const packed = values[packedAxis] >>> 0;
        chunk.rgb[base] = (packed >>> 16 & 255) / 255;
        chunk.rgb[base + 1] = (packed >>> 8 & 255) / 255;
        chunk.rgb[base + 2] = (packed & 255) / 255;
      }
    },
    finish() {
      if (!totalCount) pointError('点云文件为空');
      if (expectedCount !== null && totalCount !== expectedCount) pointError(`点云截断：期望 ${expectedCount} 点，读取 ${totalCount} 点`);
      const sampled = count < totalCount, fields = Object.create(null);
      let positions, rgb = hasRGB && !invalidRGB ? new Float32Array(count * 3) : null;
      let sampleIndices;
      if (!sampled && chunks.length === 1) {
        // No consolidation copy is needed for a single block.
        positions = chunks[0].positions.subarray(0, count * 3);
        names.forEach((name, i) => { fields[name] = chunks[0].fields[i].subarray(0, count); });
        if (rgb) rgb = chunks[0].rgb.subarray(0, count * 3);
      } else {
        positions = new Float64Array(count * 3);
        for (const name of names) fields[name] = new Float32Array(count);
        if (sampled) {
          const order = new Uint32Array(count);
          for (let i = 0; i < count; i++) order[i] = i;
          order.sort((a, b) => rowSource(a) - rowSource(b));
          sampleIndices = new Float64Array(count);
          for (let target = 0; target < count; target++) {
            const slot = order[target], chunk = chunks[Math.floor(slot / capacity)], local = slot % capacity;
            for (let axis = 0; axis < 3; axis++) positions[target * 3 + axis] = chunk.positions[local * 3 + axis];
            names.forEach((name, i) => { fields[name][target] = chunk.fields[i][local]; });
            if (rgb) for (let channel = 0; channel < 3; channel++) rgb[target * 3 + channel] = chunk.rgb[local * 3 + channel];
            sampleIndices[target] = chunk.indices[local];
          }
        } else {
          for (let i = 0; i < chunks.length; i++) {
            const start = i * capacity, take = Math.min(capacity, count - start), chunk = chunks[i];
            positions.set(chunk.positions.subarray(0, take * 3), start * 3);
            names.forEach((name, field) => fields[name].set(chunk.fields[field].subarray(0, take), start));
            if (rgb) rgb.set(chunk.rgb.subarray(0, take * 3), start * 3);
            chunks[i] = null;
          }
        }
      }
      chunks.length = 0;
      if (invalidRGB) notes.push('RGB 字段超出有效范围，已保留属性并停用原始颜色。');
      else if (rgbAxes) {
        const divisor = rgbNames.some(name => hints[name] === 'byte') || maxRGB > 1 ? 255 : 1;
        for (let i = 0; i < rgb.length; i++) rgb[i] /= divisor;
        notes.push(`RGB 按 0–${divisor} 范围归一化。`);
      }
      if (sampled) notes.push(`总计 ${totalCount.toLocaleString()} 点，使用固定种子蓄水池采样显示 ${count.toLocaleString()} 点；坐标范围仍覆盖全部原始点。`);
      else notes.push(`完整读取 ${totalCount.toLocaleString()} 点；范围为全部点范围。`);
      const result = {positions, count, totalCount, bounds, fields, rgb, notes};
      if (sampleIndices) result.sampleIndices = sampleIndices;
      return result;
    },
  };
}

/** Reuse a parsed cloud in memory; 0 or a non-reducing limit returns the same object. */
export function samplePointCloud(cloud, maxPoints = 0) {
  pointLimit(maxPoints);
  if (!cloud || !Number.isSafeInteger(cloud.count) || cloud.count < 1 || !cloud.positions || cloud.positions.length !== cloud.count * 3) pointError('内存点云的点数或 XYZ 数组无效');
  if (!maxPoints || maxPoints >= cloud.count) return cloud;
  const selected = pointSampleIndices(cloud.count, maxPoints), count = selected.length;
  const positions = new Float64Array(count * 3), fields = Object.create(null), rgb = cloud.rgb ? new Float32Array(count * 3) : null;
  const sampleIndices = new Float64Array(count);
  for (const [name, values] of Object.entries(cloud.fields || {})) {
    if (!values || values.length !== cloud.count) pointError(`属性 ${name} 长度与点数不一致`);
    fields[name] = new Float32Array(count);
  }
  if (cloud.rgb && cloud.rgb.length !== cloud.count * 3) pointError('RGB 数组长度与点数不一致');
  for (let target = 0; target < count; target++) {
    const source = selected[target];
    for (let axis = 0; axis < 3; axis++) positions[target * 3 + axis] = cloud.positions[source * 3 + axis];
    for (const name of Object.keys(fields)) fields[name][target] = cloud.fields[name][source];
    if (rgb) for (let channel = 0; channel < 3; channel++) rgb[target * 3 + channel] = cloud.rgb[source * 3 + channel];
    sampleIndices[target] = cloud.sampleIndices ? cloud.sampleIndices[source] : source;
  }
  const notes = [...(cloud.notes || []), `从已读取的 ${cloud.count.toLocaleString()} 点中使用固定种子蓄水池采样显示 ${count.toLocaleString()} 点；未重新读取文件，坐标范围仍覆盖全部原始点。`];
  const result = {...cloud, positions, fields, rgb, count, sampleIndices, bounds: cloud.bounds.map(point => Array.from(point)), notes};
  if (cloud.sources) {
    let cursor = 0;
    result.sources = cloud.sources.map(source => {
      const start = cursor, end = source.start + source.count;
      while (cursor < count && selected[cursor] < end) cursor++;
      return {...source, start, count: cursor - start};
    }).filter(source => source.count);
  }
  return result;
}

function* pointTextLines(text) {
  let start = 0, line = 1;
  while (start < text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline < 0 ? text.length : newline;
    yield {text: text.slice(start, end), line};
    start = end + 1; line++;
  }
}

function pointTextTokens(line) {
  return /[;,]/.test(line) ? line.trim().split(/[;,]/).map(value => value.trim()) : line.trim().split(/\s+/);
}

function pointTextCheckLine(record) {
  if (record.text.length > POINT_TEXT_MAX_LINE_CHARS) pointError(`第 ${record.line} 行过长（超过 1,048,576 字符）；请检查换行符或文件格式`);
}

/** Consume each text line once, infer its schema, validate, and retain typed point blocks. */
function pointTextParser(filename, maxPoints) {
  const notes = [];
  let header = null, declared = null, collector = null, values = null, totalCount = 0;
  return {
    add(record) {
      pointTextCheckLine(record);
      let line = record.text.trim();
      if (!line) return;
      if (line.startsWith('#') || line.startsWith('//')) {
        if (!collector && !header) {
          const possible = pointTextTokens(line.replace(/^(#|\/\/)\s*/, '')).map(value => value.replace(/^['"]|['"]$/g, '').toLowerCase());
          if (['x', 'y', 'z'].every(name => possible.includes(name))) header = pointNames(possible);
        }
        return;
      }
      line = line.split('#')[0].trim();
      if (!line) return;
      const parts = pointTextTokens(line);
      if (!collector) {
        if (!header && declared === null && /\.pts$/i.test(filename) && parts.length === 1 && /^\d+$/.test(parts[0])) {
          declared = Number(parts[0]);
          if (!Number.isSafeInteger(declared) || declared < 0) pointError('PTS 声明点数无效');
          return;
        }
        if (!header && parts.some(value => !Number.isFinite(Number(value.replace(/^['"]|['"]$/g, ''))))) {
          const candidate = pointNames(parts);
          if (!['x', 'y', 'z'].every(name => candidate.includes(name))) pointError(`第 ${record.line} 行不是 XYZ 数值或有效的 x/y/z 表头`);
          header = candidate;
          return;
        }
        if (!header) {
          if (parts.length < 3) pointError('点云每行至少需要 XYZ 三列');
          header = parts.map((_, index) => ['x', 'y', 'z'][index] || `column_${index + 1}`);
          if (header.length > 3) notes.push('无属性表头：额外列保留为 column_4、column_5 等，不自动认定为 RGB 或强度。');
        }
        collector = pointCollector(header, null, maxPoints, notes);
        values = new Float64Array(header.length);
      }
      if (parts.length !== header.length) pointError(`第 ${record.line} 行：字段数量不一致（需要 ${header.length} 列，读取 ${parts.length} 列）`);
      for (let i = 0; i < parts.length; i++) values[i] = numericPoint(parts[i], `第 ${record.line} 行`);
      collector.add(values); totalCount++;
    },
    finish() {
      if (!collector) pointError('点云文件为空');
      if (declared !== null && declared !== totalCount) pointError(`PTS 声明 ${declared} 点，实际读取 ${totalCount} 点`);
      return collector.finish();
    },
  };
}

function parsePointText(bytes, filename, maxPoints) {
  const text = POINT_DECODER.decode(bytes).replace(/^\uFEFF/, '');
  const parser = pointTextParser(filename, maxPoints);
  for (const record of pointTextLines(text)) parser.add(record);
  return parser.finish();
}

function pointAbort(signal) {
  if (signal?.aborted) throw new DOMException('点云读取已取消', 'AbortError');
}

async function pointTextScanFile(file, firstChunk, consume, signal, onProgress) {
  const decoder = new TextDecoder('utf-8');
  let carry = '', lineNumber = 1, offset = 0;
  const progress = loaded => { if (typeof onProgress === 'function') onProgress({phase: 'parse', loaded, total: file.size}); };
  pointAbort(signal); progress(0);
  while (offset < file.size) {
    pointAbort(signal);
    const end = Math.min(offset + POINT_TEXT_CHUNK_BYTES, file.size);
    const bytes = offset === 0 ? firstChunk : new Uint8Array(await file.slice(offset, end).arrayBuffer());
    pointAbort(signal);
    if (bytes.byteLength !== end - offset) pointError(`文件读取不完整：需要 ${end - offset} 字节，实际读取 ${bytes.byteLength} 字节`);
    const block = carry + decoder.decode(bytes, {stream: true});
    let start = 0, newline;
    while ((newline = block.indexOf('\n', start)) !== -1) {
      consume({text: block.slice(start, newline), line: lineNumber++});
      start = newline + 1;
    }
    carry = block.slice(start);
    pointTextCheckLine({text: carry, line: lineNumber});
    offset = end;
    progress(offset);
    // Yield between bounded chunks so progress, rendering and cancellation can run.
    await new Promise(resolve => setTimeout(resolve, 0));
    pointAbort(signal);
  }
  carry += decoder.decode();
  if (carry.length) consume({text: carry, line: lineNumber});
  pointAbort(signal);
}

/** Extract a newline-terminated ASCII header while leaving the binary payload untouched. */
function pointHeader(bytes, lastLine) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < bytes.length && i < 1024 * 1024; i++) {
    if (bytes[i] !== 10) continue;
    const line = POINT_DECODER.decode(bytes.subarray(start, i)).replace(/\r$/, '');
    lines.push(line); start = i + 1;
    if (lastLine(line.trim())) return {lines, offset: start};
  }
  pointError('点云文件缺少完整表头（或表头超过 1 MB）');
}
function pointBinaryReader(bytes, offset, little) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    read(type) {
      const spec = POINT_TYPES[type];
      if (!spec) pointError(`不支持二进制数值类型：${type}`);
      if (offset + spec[1] > view.byteLength) pointError('二进制点云数据截断');
      const value = view[spec[0]](offset, little); offset += spec[1]; return value;
    },
    get offset() { return offset; },
  };
}

function parsePointPLY(bytes, maxPoints) {
  const {lines, offset} = pointHeader(bytes, line => line === 'end_header');
  if (lines[0].trim().replace(/^\uFEFF/, '') !== 'ply') pointError('PLY 文件头无效');
  const elements = [], notes = [];
  let format = null, current = null;
  for (const line of lines.slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'format') format = parts[1];
    else if (parts[0] === 'element') {
      const count = Number(parts[2]);
      if (!Number.isSafeInteger(count) || count < 0) pointError('PLY element 点数无效');
      current = {name: parts[1], count, properties: []}; elements.push(current);
    } else if (parts[0] === 'property') {
      if (!current) pointError('PLY property 缺少 element');
      const list = parts[1] === 'list';
      const property = list ? {name: parts[4], list: true, countType: parts[2], type: parts[3]} : {name: parts[2], type: parts[1], list: false};
      if (!property.name || !POINT_TYPES[property.type] || (list && !POINT_TYPES[property.countType])) pointError('PLY property 类型无效或不受支持');
      current.properties.push(property);
    }
  }
  if (!['ascii', 'binary_little_endian', 'binary_big_endian'].includes(format)) pointError(`不支持的 PLY 格式：${format}`);
  const vertexElements = elements.filter(element => element.name === 'vertex');
  if (vertexElements.length !== 1) pointError('PLY 需要且只允许一个 vertex element');
  const vertex = vertexElements[0], properties = vertex.properties.filter(property => !property.list);
  const hints = Object.fromEntries(properties.filter(p => ['uchar', 'uint8'].includes(p.type)).map(p => [p.name.toLowerCase(), 'byte']));
  if (vertex.properties.some(property => property.list)) notes.push('PLY 顶点的可变长度列表属性已跳过，保留所有标量属性。');
  const collector = pointCollector(properties.map(p => p.name), vertex.count, maxPoints, notes, hints);
  const asciiRows = format === 'ascii' ? POINT_DECODER.decode(bytes.subarray(offset)).split(/\r?\n/).map(line => line.trim()).filter(Boolean) : null;
  let rowIndex = 0;
  const binary = format === 'ascii' ? null : pointBinaryReader(bytes, offset, format === 'binary_little_endian');
  for (const element of elements) {
    for (let i = 0; i < element.count; i++) {
      const fields = asciiRows ? asciiRows[rowIndex++]?.split(/\s+/) : null;
      if (asciiRows && !fields) pointError('PLY ASCII 数据截断');
      let token = 0;
      const read = type => binary ? binary.read(type) : numericPoint(fields[token++], `PLY 数据行 ${rowIndex}`);
      const values = [];
      for (const property of element.properties) {
        if (property.list) {
          const length = read(property.countType);
          if (!Number.isSafeInteger(length) || length < 0 || length > bytes.length) pointError('PLY list 长度无效');
          for (let n = 0; n < length; n++) read(property.type);
        } else {
          const value = read(property.type);
          if (element === vertex) values.push(value);
        }
      }
      if (fields && token !== fields.length) pointError(`PLY 数据行 ${rowIndex} 字段数量不匹配`);
      if (element === vertex) collector.add(values, i);
    }
  }
  return collector.finish();
}

function parsePointPCD(bytes, maxPoints) {
  const {lines, offset} = pointHeader(bytes, line => /^DATA\s+/i.test(line));
  const header = Object.create(null), notes = [];
  for (const line of lines) {
    const parts = line.split('#')[0].trim().split(/\s+/);
    if (parts[0]) header[parts[0].toUpperCase()] = parts.slice(1);
  }
  const mode = header.DATA?.[0]?.toLowerCase();
  if (mode === 'binary_compressed') pointError('暂不支持 PCD binary_compressed；请转为 ASCII 或未压缩 binary PCD');
  if (!['ascii', 'binary'].includes(mode)) pointError(`不支持的 PCD DATA 类型：${mode}`);
  const names = header.FIELDS || header.FIELD, sizes = header.SIZE?.map(Number), types = header.TYPE;
  const counts = header.COUNT ? header.COUNT.map(Number) : names?.map(() => 1);
  if (!names?.length || !sizes || !types || [sizes, types, counts].some(values => values.length !== names.length)) pointError('PCD FIELDS/SIZE/TYPE/COUNT 表头不匹配');
  const declared = header.POINTS?.[0];
  const totalCount = declared === undefined ? Number(header.WIDTH?.[0]) * Number(header.HEIGHT?.[0] || 1) : Number(declared);
  const descriptors = [], flatNames = [], hints = {};
  names.forEach((rawName, index) => {
    const name = rawName.toLowerCase(), size = sizes[index], kind = types[index].toUpperCase(), count = counts[index];
    if (![1, 2, 4, 8].includes(size) || !Number.isSafeInteger(count) || count < 1 || count > 10000) pointError('PCD SIZE/COUNT 无效');
    const type = {F: {4: 'float', 8: 'double'}, U: {1: 'uchar', 2: 'ushort', 4: 'uint'}, I: {1: 'char', 2: 'short', 4: 'int'}}[kind]?.[size];
    if (!type) pointError(`不支持的 PCD 字段类型 ${kind}${size}`);
    if (['x', 'y', 'z'].includes(name) && count !== 1) pointError('PCD XYZ 字段 COUNT 必须为 1');
    for (let component = 0; component < count; component++) {
      const fieldName = count === 1 ? name : `${name}_${component + 1}`;
      flatNames.push(fieldName); descriptors.push({name: fieldName, type, packedFloat: ['rgb', 'rgba'].includes(fieldName) && kind === 'F' && size === 4});
      if (type === 'uchar') hints[fieldName] = 'byte';
    }
  });
  const collector = pointCollector(flatNames, totalCount, maxPoints, notes, hints);
  const bitBuffer = new ArrayBuffer(4), bitView = new DataView(bitBuffer);
  const packed = value => { bitView.setFloat32(0, value, true); return bitView.getUint32(0, true); };
  if (mode === 'ascii') {
    const rows = POINT_DECODER.decode(bytes.subarray(offset)).split(/\r?\n/).map(line => line.split('#')[0].trim()).filter(Boolean);
    if (rows.length !== totalCount) pointError(`PCD 声明 ${totalCount} 点，实际读取 ${rows.length} 点`);
    rows.forEach((line, index) => {
      const tokens = line.split(/\s+/);
      if (tokens.length !== descriptors.length) pointError(`PCD 点 ${index + 1} 字段数量不一致`);
      const values = descriptors.map((descriptor, field) => {
        const value = numericPoint(tokens[field], `PCD 点 ${index + 1}`);
        return descriptor.packedFloat ? packed(value) : value;
      });
      collector.add(values, index);
    });
  } else {
    const stride = descriptors.reduce((sum, descriptor) => sum + POINT_TYPES[descriptor.type][1], 0);
    if (totalCount * stride > bytes.length - offset) pointError('PCD binary 数据截断');
    // PCL's common uncompressed binary format stores interleaved little-endian records.
    const binary = pointBinaryReader(bytes, offset, true);
    for (let index = 0; index < totalCount; index++) {
      const values = descriptors.map(descriptor => descriptor.packedFloat ? binary.read('uint') : binary.read(descriptor.type));
      collector.add(values, index);
    }
    notes.push('PCD binary 按常见 PCL 小端、逐点交错布局读取。');
  }
  return collector.finish();
}

function pointCloudFormat(filename, start) {
  const extension = String(filename).split('.').pop().toLowerCase();
  if (['las', 'laz'].includes(extension)) pointError('当前查看器暂不支持 LAS/LAZ，请先导出 XYZ、PLY 或 PCD');
  if (extension === 'ply' || /^ply\r?\n/.test(start)) return 'ply';
  if (extension === 'pcd' || /^#.*\.PCD/i.test(start) || /^VERSION\s+\.7/m.test(start)) return 'pcd';
  if (['xyz', 'txt', 'csv', 'pts'].includes(extension) || !filename) return 'text';
  pointError(`不支持的点云格式 .${extension}；请选择 XYZ、TXT、CSV、PTS、PLY 或 PCD`);
}

/** XYZ/TXT/CSV/PTS, ASCII/binary PLY, and ASCII/uncompressed-binary PCD. No LAS/LAZ. */
export function parsePointCloud(arrayBuffer, filename = '', {maxPoints = 0} = {}) {
  pointLimit(maxPoints);
  const bytes = arrayBuffer instanceof ArrayBuffer ? new Uint8Array(arrayBuffer) : ArrayBuffer.isView(arrayBuffer) ? new Uint8Array(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength) : null;
  if (!bytes) pointError('点云读取器需要 ArrayBuffer');
  if (!bytes.byteLength) pointError('点云文件为空');
  const start = POINT_DECODER.decode(bytes.subarray(0, Math.min(256, bytes.length))).replace(/^\uFEFF/, '');
  const format = pointCloudFormat(filename, start);
  if (format === 'ply') return parsePointPLY(bytes, maxPoints);
  if (format === 'pcd') return parsePointPCD(bytes, maxPoints);
  return parsePointText(bytes, filename, maxPoints);
}

/** One-pass bounded text reads; 0 means unlimited points. PLY/PCD use the buffer parser. */
export async function readPointCloud(file, {maxPoints = 0, signal, onProgress} = {}) {
  pointLimit(maxPoints); pointAbort(signal);
  if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) || file.size < 0) pointError('点云读取器需要 File 或 Blob');
  if (!file.size) pointError('点云文件为空');
  const filename = String(file.name || '');
  // This first chunk is passed into the text scanner, not read again after sniffing.
  const firstSize = Math.min(POINT_TEXT_CHUNK_BYTES, file.size);
  const first = new Uint8Array(await file.slice(0, firstSize).arrayBuffer());
  pointAbort(signal);
  if (first.byteLength !== firstSize) pointError('文件头读取不完整，请重新选择文件');
  const start = POINT_DECODER.decode(first.subarray(0, Math.min(256, first.length))).replace(/^\uFEFF/, '');
  const format = pointCloudFormat(filename, start);
  if (format !== 'text') {
    if (typeof onProgress === 'function') onProgress({phase: 'parse', loaded: 0, total: file.size});
    pointAbort(signal);
    let buffer = first;
    if (first.byteLength !== file.size) {
      buffer = new Uint8Array(file.size); buffer.set(first);
      const rest = new Uint8Array(await file.slice(firstSize, file.size).arrayBuffer());
      pointAbort(signal);
      if (rest.byteLength !== file.size - firstSize) pointError('点云文件读取不完整，请重新选择文件');
      buffer.set(rest, firstSize);
    }
    if (typeof onProgress === 'function') onProgress({phase: 'parse', loaded: file.size, total: file.size});
    await new Promise(resolve => setTimeout(resolve, 0)); pointAbort(signal);
    return parsePointCloud(buffer, filename, {maxPoints});
  }
  const parser = pointTextParser(filename, maxPoints);
  await pointTextScanFile(file, first, record => parser.add(record), signal, onProgress);
  const result = parser.finish();
  pointAbort(signal);
  return result;
}
