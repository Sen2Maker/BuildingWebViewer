import { runPointFeatures, derivedPointCloud } from './point-operations.js';
import { pointExportSchema, writePointExport } from './point-export.js';

export function mountPointProcessing({container, getSelection, readCloud, addResults, removeResults}) {
  if (!container) return null;
  container.innerHTML = `
    <section class="inspector-section"><h3>处理范围</h3><p class="processing-help">对左侧勾选的点云操作。计算逐文件进行，原始文件保持不变。</p>
    <fieldset class="processing-inputs"><label>数据范围<select id="process-scope"><option value="full">全部点</option><option value="display">当前显示点</option></select></label>
    <p class="processing-help">全部点会按需重新读取原文件；显示上限不影响全量处理。计算结果仅保留在本次页面中，请及时导出。</p></fieldset></section>
    <section class="inspector-section"><h3>法向量与几何特征</h3><fieldset class="processing-inputs">
    <label>邻域点数 k<input id="process-k" type="number" min="3" max="256" step="1" value="32"></label>
    <label>最大半径<input id="process-radius" type="number" min="0" step="any" value="0"></label>
    <p class="processing-help">k 包含点自身。半径单位与坐标相同；0 不限，非零时最多取半径内 k 个近邻。</p>
    <label>法向量朝向<select id="process-direction"><option value="+z">+Z（向上）</option><option value="-z">−Z（向下）</option><option value="+x">+X</option><option value="-x">−X</option><option value="+y">+Y</option><option value="-y">−Y</option></select></label>
    <button id="process-compute" class="processing-primary">计算并显示结果</button>
    <p class="processing-help">生成 nx / ny / nz、坡度 slope、平面度 planarity、粗糙度 roughness。完成后可在“显示 → 着色依据”选择这些属性。无效点以 NaN 和 normal_valid=0 标记。</p></fieldset></section>
    <section class="inspector-section"><h3>保存点云</h3><fieldset class="processing-inputs">
    <label>文件格式<select id="process-format"><option value="ply">二进制 PLY（推荐）</option><option value="txt">TXT（带属性表头）</option></select></label>
    <label>保存方式<select id="process-save-method"><option value="direct">直接保存（支持时）</option><option value="download">浏览器下载（≤256 MB）</option></select></label>
    <label class="processing-check"><input id="process-source" type="checkbox" checked>附加来源编号 source_id</label>
    <button id="process-export" class="processing-primary">导出所选 / 合并为一个文件</button>
    <p class="processing-help">保留 XYZ 和数值属性；多选时合并为一个文件，缺失属性填 NaN。按原坐标拼接，不配准、不去重。</p>
    <button id="process-remove">移除所选计算结果</button></fieldset></section>
    <section class="processing-feedback" aria-label="处理进度"><progress id="process-progress" max="1" value="0" hidden></progress><p id="process-status" role="status" aria-live="polite">选择点云后即可计算或导出。</p><button id="process-cancel" hidden>取消当前操作</button></section>`;
  const el = id => container.querySelector(`#${id}`);
  let controller = null;
  function busy(value) {
    for (const fieldset of container.querySelectorAll('fieldset')) fieldset.disabled = value;
    el('process-cancel').hidden = !value; el('process-progress').hidden = !value;
  }
  function status(text, fraction = 0) { el('process-status').textContent = text; el('process-progress').value = fraction; }
  function cancel() {
    if (controller) { controller.abort(); controller = null; busy(false); status('操作已取消，未添加计算结果。'); }
  }
  async function collect(selection, scope, signal) {
    const items = [];
    for (const [index, entry] of selection.entries()) {
      signal.throwIfAborted();
      status(`读取 ${index + 1} / ${selection.length}：${entry.id}`);
      const cloud = await readCloud(entry, scope, signal, ({loaded, total}) => status(`读取 ${entry.id} · ${Math.floor(100 * loaded / Math.max(1, total))}%`, loaded / Math.max(1, total)));
      signal.throwIfAborted();
      if (!cloud?.count) throw Error(`${entry.id} 没有可用的点`);
      items.push({name: entry.id, cloud});
    }
    return items;
  }
  async function perform(kind) {
    if (controller) return;
    let selected;
    try { selected = getSelection(); if (!selected.length) throw Error('请先勾选点云'); }
    catch (error) { status(error.message); return; }
    const scope = el('process-scope').value, scopeLabel = scope === 'full' ? '全部点' : '当前显示点';
    const parameters = {k: Number(el('process-k').value), radius: Number(el('process-radius').value), orientation: el('process-direction').value};
    if (kind === 'compute' && (!Number.isInteger(parameters.k) || parameters.k < 3 || parameters.k > 256 || !Number.isFinite(parameters.radius) || parameters.radius < 0)) {
      status('邻域点数需为 3–256 的整数，半径需为非负数。'); return;
    }
    const format = el('process-format').value, sourceIds = el('process-source').checked;
    const job = new AbortController(); controller = job; busy(true); status('准备处理…');
    let stream = null;
    try {
      // The picker must be invoked during the original button gesture, before any reads.
      let handle = null;
      const stem = selected.length > 1 ? `merged_${selected.length}_clouds` : selected[0].id.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_.-]/gu, '_');
      const filename = `${stem}_${scope === 'full' ? 'all' : 'display'}.${format}`;
      if (kind === 'export' && el('process-save-method').value === 'direct' && typeof window.showSaveFilePicker === 'function') {
        handle = await window.showSaveFilePicker({suggestedName: filename, types: [{description: format.toUpperCase(), accept: {[format === 'ply' ? 'application/octet-stream' : 'text/plain']: [`.${format}`]}}]});
        job.signal.throwIfAborted();
      }
      const items = await collect(selected, scope, job.signal);
      if (kind === 'compute') {
        const results = [];
        for (const [index, item] of items.entries()) {
          const result = await runPointFeatures(item.cloud.positions, parameters, {signal: job.signal, onProgress: ({phase, done, total}) => status(
            `${index + 1} / ${items.length} · ${item.name} · ${phase === 'index' ? '建立邻域索引' : '计算几何特征'} ${Math.floor(done / total * 100)}%`, (index + done / total) / items.length)});
          job.signal.throwIfAborted();
          results.push({name: `${item.name} · 特征（${scopeLabel}）`, cloud: derivedPointCloud(item.cloud, result, parameters, scopeLabel)});
        }
        controller = null; busy(false);
        await addResults(results);
        status(`完成：${results.length} 个独立结果，${results.reduce((n, r) => n + r.cloud.processing.valid, 0).toLocaleString()} 个有效法向量。已选中新结果，可调整着色并导出。`);
      } else {
        const schema = pointExportSchema(items, {sourceIds}), limit = 256 * 1024 * 1024;
        // A Blob download needs all output bytes in memory. Bound it before allocating.
        const estimate = schema.count * schema.properties.length * (format === 'ply' ? 8 : 25);
        if (!handle && estimate > limit) throw Error('预计导出文件较大。请在支持直接保存文件的 Chrome / Edge HTTPS 或 localhost 页面中导出，或选择“当前显示点”减小数据量。');
        if (handle) stream = await handle.createWritable();
        job.signal.throwIfAborted();
        const chunks = []; let bytes = 0;
        await writePointExport(items, {format, sourceIds, signal: job.signal, write: async chunk => {
          if (stream) await stream.write(chunk);
          else { bytes += chunk.byteLength; if (bytes > limit) throw Error('下载缓冲超过 256 MB，请使用支持直接保存文件的浏览器。'); chunks.push(chunk); }
        }, onProgress: ({done, total}) => status(`写出 ${done.toLocaleString()} / ${total.toLocaleString()} 点 · ${scopeLabel}`, done / total)});
        job.signal.throwIfAborted();
        if (stream) { await stream.close(); stream = null; }
        else {
          const url = URL.createObjectURL(new Blob(chunks, {type: format === 'ply' ? 'application/octet-stream' : 'text/plain'}));
          const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
        status(`${handle ? '已保存' : '已发起下载'}：${filename} · ${schema.count.toLocaleString()} 点 · ${items.length} 个来源。`);
      }
    } catch (error) {
      if (stream) { try { await stream.abort(); } catch {} }
      if (controller === job) status(error.name === 'AbortError' ? '操作已取消。' : `操作失败：${error.message}`);
    } finally { if (controller === job) { controller = null; busy(false); } }
  }
  el('process-compute').onclick = () => perform('compute');
  el('process-export').onclick = () => perform('export');
  el('process-cancel').onclick = cancel;
  el('process-remove').onclick = () => { try { const count = removeResults(getSelection()); status(count ? `已移除 ${count} 个计算结果。` : '所选点云中没有计算结果。'); } catch (error) { status(error.message); } };
  return {cancel};
}
