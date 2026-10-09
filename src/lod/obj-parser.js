import { t } from '../shared/i18n.js';
/** Parse triangular OBJ geometry without altering source coordinates. */
export function parseOBJ(text, id, bytes = 0) {
  const vertices = [], faces = [];
  const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  let lineNumber = 0;
  for (const line of text.split(/\r?\n/)) {
    lineNumber++;
    const tokens = line.split('#')[0].trim().split(/\s+/);
    if (tokens[0] === 'v') {
      const vertex = tokens.slice(1, 4).map(Number);
      if (vertex.length !== 3 || vertex.some(v => !Number.isFinite(v))) throw Error(t("第 {0} 行顶点坐标无效", [lineNumber]));
      vertices.push(vertex);
      vertex.forEach((value, axis) => { bounds[0][axis] = Math.min(bounds[0][axis], value); bounds[1][axis] = Math.max(bounds[1][axis], value); });
    } else if (tokens[0] === 'f') {
      if (tokens.length !== 4) throw Error(t("第 {0} 行不是三角面，当前查看器需要三角化 OBJ", [lineNumber]));
      faces.push(tokens.slice(1).map(token => {
        const index = Number(token.split('/')[0]);
        if (!Number.isSafeInteger(index) || index === 0) throw Error(t("第 {0} 行面索引无效", [lineNumber]));
        const resolved = index > 0 ? index - 1 : vertices.length + index;
        if (resolved < 0) throw Error(t("第 {0} 行面索引越界", [lineNumber]));
        return resolved;
      }));
    }
  }
  if (!vertices.length || !faces.length) throw Error(t('OBJ 中没有可显示的顶点和三角面'));
  if (faces.some(face => face.some(index => index >= vertices.length))) throw Error(t('OBJ 面索引超出顶点范围'));
  return {id, vertices, faces, bounds, stats: {vertices: vertices.length, triangles: faces.length, bytes}};
}
