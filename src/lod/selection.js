import { t } from '../shared/i18n.js';

/** Expand ranges against imported IDs, never allocate an arbitrary numeric interval. */
export function parseLodIds(value, catalogById) {
  if (!value.trim()) return [];
  const tokens = value.trim().replace(/\s*[-–—~～]\s*/g, '-').split(/[\s,，;；、]+/).filter(Boolean);
  const result = new Set();
  for (const token of tokens) {
    if (catalogById.has(token)) { result.add(token); continue; }
    const match = token.match(/^#?(\d+)(?:-(\d+))?$/);
    if (!match) throw Error(t('无法识别“{0}”。请使用编号或范围，例如 1, 3, 100-105。', [token]));
    const start = Number(match[1]), end = match[2] ? Number(match[2]) : start;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) throw Error(t('编号范围不正确：{0}', [token]));
    if (!match[2]) { result.add(String(start)); continue; }
    const matches = [...catalogById.keys()].filter(id => String(Number(id)) === id && Number(id) >= start && Number(id) <= end).sort((a,b) => Number(a)-Number(b));
    if (matches.length !== end - start + 1) throw Error(t('编号范围 {0} 包含未导入的模型，请检查编号。', [token]));
    for (const id of matches) result.add(id);
  }
  return [...result];
}
