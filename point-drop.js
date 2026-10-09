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
    const path = parent + (entry?.name || file?.webkitRelativePath || file?.name || '未知文件');
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
        if (!resolved) throw new Error('无法读取文件');
        result.files.push({ file: resolved, path });
      }
    } catch (err) {
      result.errors.push({ path, message: err?.message || '无法读取' });
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
    if (!inside(event)) { say('请将点云文件或文件夹拖到左侧文件区域。'); return; }
    const roots = capturePointDrop(event.dataTransfer);
    say('正在整理拖入的文件…');
    // A second drop can arrive during directory scanning; handles are already captured.
    queue = queue.then(async () => {
      const result = await scanPointDrop(roots, accepts, progress =>
        say(`正在查找点云… 已找到 ${progress.files.length.toLocaleString('zh-CN')} 个文件`));
      const received = result.files.length ? await onFiles(result.files) : { added: 0, duplicates: 0 };
      const parts = [`新增 ${received.added} 个点云`];
      if (received.duplicates) parts.push(`${received.duplicates} 个已存在`);
      if (result.skipped) parts.push(`跳过 ${result.skipped} 个其他格式文件`);
      if (result.errors.length) parts.push(`${result.errors.length} 项无法读取：${result.errors.slice(0, 3).map(error => error.path).join('、')}`);
      if (!result.files.length) parts.push('未找到支持的点云；也可使用“添加点云文件夹…”按钮');
      say(parts.join(' · '));
    }).catch(err => say(`添加失败：${err?.message || '无法读取拖入的文件'}。可改用添加文件 / 文件夹按钮。`));
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
