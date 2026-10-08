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

function pointCollector(names, totalCount, maxPoints, notes, hints = {}) {
  names = pointNames(names);
  if (!Number.isSafeInteger(totalCount) || totalCount < 1) pointError('点云没有有效点，或点数无效');
  const axes = ['x', 'y', 'z'].map(name => names.indexOf(name));
  if (axes.some(i => i < 0)) pointError('点云表头必须包含 x、y、z 字段');
  const count = Math.min(totalCount, maxPoints), positions = new Float64Array(count * 3), bounds = pointBounds();
  const fields = Object.create(null);
  for (const name of names) fields[name] = new Float32Array(count);
  let taken = 0;
  const sampleAt = index => count === 1 ? 0 : Math.floor(index * (totalCount - 1) / (count - 1));
  const rgbNames = [['r', 'g', 'b'], ['red', 'green', 'blue'], ['diffuse_red', 'diffuse_green', 'diffuse_blue']].find(group => group.every(name => names.includes(name)));
  const packedName = !rgbNames && ['rgb', 'rgba'].find(name => names.includes(name));
  const colors = rgbNames || packedName ? new Float32Array(count * 3) : null;
  let maxRGB = 0, invalidRGB = false;
  return {
    add(values, index) {
      if (values.length !== names.length) pointError(`点 ${index + 1} 的字段数量不一致`);
      const xyz = axes.map(axis => values[axis]);
      if (xyz.some(v => !Number.isFinite(v))) pointError(`点 ${index + 1} 的 XYZ 无效或非有限`);
      extendPointBounds(bounds, xyz);
      if (taken >= count || index !== sampleAt(taken)) return;
      positions.set(xyz, taken * 3);
      names.forEach((name, field) => { fields[name][taken] = values[field]; });
      if (rgbNames) {
        rgbNames.forEach((name, channel) => {
          const value = values[names.indexOf(name)];
          if (!Number.isFinite(value) || value < 0 || value > 255) invalidRGB = true;
          maxRGB = Math.max(maxRGB, value); colors[taken * 3 + channel] = value;
        });
      } else if (packedName) {
        const raw = values[names.indexOf(packedName)];
        if (!Number.isInteger(raw) || raw < 0 || raw > 0xffffffff) invalidRGB = true;
        const packed = raw >>> 0;
        colors.set([(packed >>> 16 & 255) / 255, (packed >>> 8 & 255) / 255, (packed & 255) / 255], taken * 3);
      }
      taken++;
    },
    finish() {
      if (taken !== count) pointError(`点云截断：期望 ${count} 个展示点，读取 ${taken} 个`);
      let rgb = colors;
      if (invalidRGB) { rgb = null; notes.push('RGB 字段超出有效范围，已保留属性并停用原始颜色。'); }
      else if (rgbNames) {
        const bytes = rgbNames.some(name => hints[name] === 'byte');
        const divisor = bytes || maxRGB > 1 ? 255 : 1;
        for (let i = 0; i < colors.length; i++) colors[i] /= divisor;
        notes.push(`RGB 按 0–${divisor} 范围归一化。`);
      }
      if (count < totalCount) notes.push(`总计 ${totalCount.toLocaleString()} 点，按原顺序均匀抽样显示 ${count.toLocaleString()} 点；坐标范围仍覆盖全部原始点。`);
      else notes.push(`完整读取 ${totalCount.toLocaleString()} 点；范围为全部点范围。`);
      return {positions, count, totalCount, bounds, fields, rgb, notes};
    },
  };
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

/** Shared first pass for synchronous buffers and streaming File/Blob reads. */
function pointTextCounter(filename) {
  const notes = [];
  let header = null, declared = null, totalCount = 0, firstDataLine = 0, firstFields = null;
  return {
    add(record) {
      pointTextCheckLine(record);
      let line = record.text.trim();
      if (!line) return;
      if (line.startsWith('#') || line.startsWith('//')) {
        if (!totalCount && !header) {
          const possible = pointTextTokens(line.replace(/^(#|\/\/)\s*/, '')).map(v => v.replace(/^['"]|['"]$/g, '').toLowerCase());
          if (['x', 'y', 'z'].every(name => possible.includes(name))) header = possible;
        }
        return;
      }
      // Subsequent rows only need counting here; the second pass validates every row.
      if (!totalCount) {
        line = line.split('#')[0].trim();
        const parts = pointTextTokens(line);
        if (!header && declared === null && /\.pts$/i.test(filename) && parts.length === 1 && /^\d+$/.test(parts[0])) {
          declared = Number(parts[0]); return;
        }
        if (!header && parts.some(value => !Number.isFinite(Number(value.replace(/^['"]|['"]$/g, ''))))) {
          const candidate = pointNames(parts);
          if (!['x', 'y', 'z'].every(name => candidate.includes(name))) pointError(`第 ${record.line} 行不是 XYZ 数值或有效的 x/y/z 表头`);
          header = candidate; return;
        }
        firstDataLine = record.line; firstFields = parts;
      }
      totalCount++;
    },
    finish() {
      if (!totalCount) pointError('点云文件为空');
      if (declared !== null && declared !== totalCount) pointError(`PTS 声明 ${declared} 点，实际读取 ${totalCount} 点`);
      if (!header) {
        if (firstFields.length < 3) pointError('点云每行至少需要 XYZ 三列');
        header = firstFields.map((_, index) => ['x', 'y', 'z'][index] || `column_${index + 1}`);
        if (header.length > 3) notes.push('无属性表头：额外列保留为 column_4、column_5 等，不自动认定为 RGB 或强度。');
      }
      return {header, totalCount, firstDataLine, notes};
    },
  };
}

/** Shared second pass: validate all original rows, then let the collector sample. */
function pointTextParser(metadata, maxPoints) {
  const {header, totalCount, firstDataLine, notes} = metadata;
  const collector = pointCollector(header, totalCount, maxPoints, notes);
  let index = 0;
  return {
    add(record) {
      pointTextCheckLine(record);
      if (record.line < firstDataLine) return;
      let line = record.text.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) return;
      line = line.split('#')[0].trim();
      const values = pointTextTokens(line).map(value => numericPoint(value, `第 ${record.line} 行`));
      if (values.length !== header.length) pointError(`第 ${record.line} 行：字段数量不一致（需要 ${header.length} 列，读取 ${values.length} 列）`);
      collector.add(values, index++);
    },
    finish() {
      if (index !== totalCount) pointError(`两次扫描的点数不一致：首次 ${totalCount} 点，实际读取 ${index} 点；请重新选择文件`);
      return collector.finish();
    },
  };
}

function parsePointText(bytes, filename, maxPoints) {
  const text = POINT_DECODER.decode(bytes).replace(/^\uFEFF/, '');
  const counter = pointTextCounter(filename);
  for (const record of pointTextLines(text)) counter.add(record);
  const parser = pointTextParser(counter.finish(), maxPoints);
  for (const record of pointTextLines(text)) parser.add(record);
  return parser.finish();
}

function pointAbort(signal) {
  if (signal?.aborted) throw new DOMException('点云读取已取消', 'AbortError');
}

async function pointTextScanFile(file, consume, phase, signal, onProgress) {
  const decoder = new TextDecoder('utf-8');
  let carry = '', lineNumber = 1;
  const progress = loaded => { if (typeof onProgress === 'function') onProgress({phase, loaded, total: file.size}); };
  pointAbort(signal);
  progress(0);
  for (let offset = 0; offset < file.size; offset += POINT_TEXT_CHUNK_BYTES) {
    pointAbort(signal);
    const end = Math.min(offset + POINT_TEXT_CHUNK_BYTES, file.size);
    const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
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
    progress(end);
    // Yield between bounded chunks so rendering, progress, and cancellation remain responsive.
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
export function parsePointCloud(arrayBuffer, filename = '', {maxPoints = 500000} = {}) {
  if (!Number.isSafeInteger(maxPoints) || maxPoints < 1) pointError('maxPoints 必须为正整数');
  const bytes = arrayBuffer instanceof ArrayBuffer ? new Uint8Array(arrayBuffer) : ArrayBuffer.isView(arrayBuffer) ? new Uint8Array(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength) : null;
  if (!bytes) pointError('点云读取器需要 ArrayBuffer');
  if (!bytes.byteLength) pointError('点云文件为空');
  const start = POINT_DECODER.decode(bytes.subarray(0, Math.min(256, bytes.length))).replace(/^\uFEFF/, '');
  const format = pointCloudFormat(filename, start);
  if (format === 'ply') return parsePointPLY(bytes, maxPoints);
  if (format === 'pcd') return parsePointPCD(bytes, maxPoints);
  return parsePointText(bytes, filename, maxPoints);
}

/** Read File/Blob text clouds in bounded chunks; PLY/PCD retain their existing buffer parser. */
export async function readPointCloud(file, {maxPoints = 500000, signal, onProgress} = {}) {
  if (!Number.isSafeInteger(maxPoints) || maxPoints < 1) pointError('maxPoints 必须为正整数');
  pointAbort(signal);
  if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) || file.size < 0) pointError('点云读取器需要 File 或 Blob');
  if (!file.size) pointError('点云文件为空');
  const filename = String(file.name || '');
  const prefixSize = Math.min(256, file.size);
  const prefix = new Uint8Array(await file.slice(0, prefixSize).arrayBuffer());
  pointAbort(signal);
  if (!prefix.byteLength) pointError('文件头读取失败，请重新选择文件');
  const start = POINT_DECODER.decode(prefix).replace(/^\uFEFF/, '');
  const format = pointCloudFormat(filename, start);
  if (format !== 'text') {
    if (typeof onProgress === 'function') onProgress({phase: 'parse', loaded: 0, total: file.size});
    pointAbort(signal);
    const buffer = await file.slice(0, file.size).arrayBuffer();
    pointAbort(signal);
    if (buffer.byteLength !== file.size) pointError('点云文件读取不完整，请重新选择文件');
    if (typeof onProgress === 'function') onProgress({phase: 'parse', loaded: file.size, total: file.size});
    await new Promise(resolve => setTimeout(resolve, 0));
    pointAbort(signal);
    return parsePointCloud(buffer, filename, {maxPoints});
  }
  const counter = pointTextCounter(filename);
  await pointTextScanFile(file, record => counter.add(record), 'count', signal, onProgress);
  const parser = pointTextParser(counter.finish(), maxPoints);
  await pointTextScanFile(file, record => parser.add(record), 'parse', signal, onProgress);
  return parser.finish();
}
