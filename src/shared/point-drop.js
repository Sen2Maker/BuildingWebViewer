import { t } from './i18n.js';
// Capture drag handles synchronously: browsers protect the data store after drop returns.
export function capturePointDrop(dataTransfer) {
  const roots = [];
  for (const item of Array.from(dataTransfer?.items || [])) {
    if (item.kind !== 'file') continue;
    let entry = null, file = null;
    try { entry = (item.getAsEntry || item.webkitGetAsEntry)?.call(item); } catch {}
    try { file = item.getAsFile?.(); } catch {}
    if (entry || file) roots.push({ entry, file });
  }
  if (!roots.length) for (const file of Array.from(dataTransfer?.files || [])) roots.push({ file });
  return roots;
}

export async function scanPointDrop(roots, accepts, onProgress = () => {}) {
  const result = { files: [], skipped: 0, errors: [], directories: 0 };
  const pending = roots.map(root => ({ ...root, parent: '' })).reverse();
  let visited = 0;
  while (pending.length) {
    const { entry, file, parent } = pending.pop();
    const path = parent + (entry?.name || file?.webkitRelativePath || file?.name || t('未知文件'));
    try {
      if (entry?.isDirectory) {
        result.directories++;
        const reader = entry.createReader();
        // Chromium returns directory entries in batches (often 100 at a time).
        while (true) {
          const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
          if (!batch.length) break;
          for (const child of batch) pending.push({ entry: child, parent: path + '/' });
        }
      } else if (!accepts(entry?.name || file?.name || '')) {
        result.skipped++;
      } else {
        const resolved = entry?.isFile
          ? await new Promise((resolve, reject) => entry.file(resolve, reject)) : file;
        if (!resolved) throw new Error(t('无法读取文件'));
        result.files.push({ file: resolved, path });
      }
    } catch (err) {
      result.errors.push({ path, message: err?.message || t('无法读取') });
    }
    if (++visited % 100 === 0) {
      onProgress(result);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  return result;
}

export function mountPointDrop({ zone, status, accepts, onFiles, host = window }) {
  let depth = 0, queue = Promise.resolve();
  const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes('Files') ||
    Array.from(event.dataTransfer?.items || []).some(item => item.kind === 'file');
  const reset = () => { depth = 0; zone.classList.remove('drop-active'); };
  const say = message => { status.hidden = false; status.textContent = message; };
  const inside = event => zone.contains(event.target);
  const onEnter = event => {
    if (!hasFiles(event)) return;
    event.preventDefault(); depth++; zone.classList.add('drop-active');
  };
  const onLeave = event => {
    if (depth && --depth === 0) reset();
  };
  const onOver = event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = inside(event) ? 'copy' : 'none';
    if (inside(event)) zone.classList.add('drop-active'); else reset();
  };
  const onDrop = event => {
    if (!hasFiles(event)) return;
    event.preventDefault(); reset();
    if (!inside(event)) { say(t('请将数据文件或文件夹拖到左侧文件区域。')); return; }
    const roots = capturePointDrop(event.dataTransfer);
    say(t('正在整理拖入的文件…'));
    // A second drop can arrive during directory scanning; handles are already captured.
    queue = queue.then(async () => {
      const result = await scanPointDrop(roots, accepts, progress =>
        say(t("正在查找数据… 已找到 {0} 个文件", [progress.files.length.toLocaleString('zh-CN')])));
      const received = result.files.length ? await onFiles(result.files) : { added: 0, duplicates: 0 };
      const parts = [t("新增 {0} 个数据", [received.added])];
      if (received.duplicates) parts.push(t("{0} 个已存在", [received.duplicates]));
      if (result.skipped) parts.push(t("跳过 {0} 个其他格式文件", [result.skipped]));
      if (result.errors.length) parts.push(t("{0} 项无法读取：{1}", [result.errors.length, result.errors.slice(0, 3).map(error => error.path).join('、')]));
      if (!result.files.length) parts.push(t('未找到支持的数据；也可使用“添加数据文件夹…”按钮'));
      say(parts.join(' · '));
    }).catch(err => say(t("添加失败：{0}。可改用添加文件 / 文件夹按钮。", [err?.message || t('无法读取拖入的文件')])));
    return queue;
  };
  zone.addEventListener('dragenter', onEnter);
  zone.addEventListener('dragleave', onLeave);
  host.addEventListener('dragover', onOver);
  host.addEventListener('drop', onDrop);
  host.addEventListener('dragend', reset);
  return () => {
    zone.removeEventListener('dragenter', onEnter);
    zone.removeEventListener('dragleave', onLeave);
    host.removeEventListener('dragover', onOver);
    host.removeEventListener('drop', onDrop);
    host.removeEventListener('dragend', reset);
    reset();
  };
}
