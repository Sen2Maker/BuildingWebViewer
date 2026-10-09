import { t, localizeHTML } from '../shared/i18n.js';
import { runPointFeatures, derivedPointCloud } from './point-operations.js';
import { pointExportSchema, writePointExport } from './point-export.js';

export function mountPointProcessing({container, getSelection, readCloud, addResults}) {
  if (!container) return null;
  container.innerHTML = localizeHTML(`
    <section class="inspector-section"><h3>选择操作</h3><fieldset class="processing-inputs"><label>操作<select id="process-operation"><option value="normals">计算法向量</option><option value="slope">计算坡度</option><option value="planarity">计算平面度</option><option value="roughness">计算粗糙度</option><option value="custom">自选多项计算</option><option value="export">保存 / 合并点云</option></select></label><p id="process-description" class="processing-help"></p>
    <div id="process-features" class="feature-checks" hidden><label><input type="checkbox" value="normals" checked>法向量</label><label><input type="checkbox" value="slope">坡度</label><label><input type="checkbox" value="planarity">平面度</label><label><input type="checkbox" value="roughness">粗糙度</label></div></fieldset></section>
    <section class="inspector-section"><h3>数据范围</h3><p id="process-selection" class="processing-selection"></p><p class="processing-help">勾选决定显示与处理；收起文件夹不改变勾选。计算逐文件进行。</p>
    <fieldset class="processing-inputs"><label>数据范围<select id="process-scope"><option value="full">全部点</option><option value="display">当前显示点</option></select></label>
    <p class="processing-help">全部点会按需重新读取原文件；显示上限不影响全量处理。计算结果仅保留在本次页面中，请及时导出。</p></fieldset></section>
    <section id="process-compute-panel" class="inspector-section"><h3>邻域设置</h3><fieldset class="processing-inputs">
    <label>邻域点数 k<input id="process-k" type="number" min="3" max="256" step="1" value="32"></label>
    <label>最大半径<input id="process-radius" type="number" min="0" step="any" value="0"></label>
    <p class="processing-help">k 包含点自身。半径单位与坐标相同；0 不限，非零时最多取半径内 k 个近邻。</p>
    <label id="process-direction-row">法向量朝向<select id="process-direction"><option value="+z">+Z（向上）</option><option value="-z">−Z（向下）</option><option value="+x">+X</option><option value="-x">−X</option><option value="+y">+Y</option><option value="-y">−Y</option></select></label>
    <label>新增列位置<select id="process-placement"><option value="end">追加到末尾</option><option value="after-xyz">放在 XYZ 后</option><option value="index">指定列号之前</option></select></label><label id="process-column-row" hidden>插入列号<input id="process-column" type="number" min="1" step="1" value="4"></label><button id="process-compute" class="processing-primary">计算并显示结果</button>
    <p class="processing-help">只添加所选结果，原始属性保留。完成后可在“数据”查看新属性，或在“显示”切换着色。无效邻域以 NaN 和 normal_valid=0 标记。计算不改变坐标，新增属性按下方选择的位置插入。</p></fieldset></section>
    <section id="process-export-panel" class="inspector-section" hidden><h3>保存设置</h3><fieldset class="processing-inputs">
    <label>文件格式<select id="process-format"><option value="ply">二进制 PLY（推荐）</option><option value="txt">TXT（带属性表头）</option></select></label>
    <label>保存方式<select id="process-save-method"><option value="direct">直接保存（支持时）</option><option value="download">浏览器下载（≤256 MB）</option></select></label>
    <label class="processing-check"><input id="process-source" type="checkbox" checked>附加来源编号 source_id</label>
    <button id="process-export" class="processing-primary">导出所选 / 合并为一个文件</button>
    <p class="processing-help">保留 XYZ 和数值属性；多选时合并为一个文件，缺失属性填 NaN。按原始坐标拼接，不配准、不去重。按“数据”页列顺序保存；多选以首文件为准，新属性追加。标签写为标准字段名。</p>
    <p class="processing-help">移除原始点云或计算结果，请在左侧点击名称后选择“移除”。</p></fieldset></section>
    <section class="processing-feedback" aria-label="处理进度"><progress id="process-progress" max="1" value="0" hidden></progress><p id="process-status" role="status" aria-live="polite">选择点云后即可计算或导出。</p><button id="process-cancel" hidden>取消当前操作</button></section>`);
  const el = id => container.querySelector(`#${id}`);
  let controller = null, latestSelection = [], selectionLoading = false;
  function refresh(selection = latestSelection, loading = selectionLoading) {
    latestSelection = selection; selectionLoading = loading;
    const summary = el('process-selection');
    summary.textContent = loading ? t("正在加载 {0} 个点云…", [selection.length]) : selection.length ? t("当前勾选 {0} 个点云：{1}{2}", [selection.length, selection.slice(0, 3).map(entry => entry.treeName || entry.id).join('、'), selection.length > 3 ? '…' : '']) : t('尚未勾选点云');
    summary.title = selection.map(entry => entry.id).join('\n');
    for (const id of ['process-compute', 'process-export']) el(id).disabled = !!controller || loading || !selection.length;
  }
  function busy(value) {
    for (const fieldset of container.querySelectorAll('fieldset')) fieldset.disabled = value;
    el('process-cancel').hidden = !value; el('process-progress').hidden = !value; refresh();
  }
  function status(text, fraction = 0) { el('process-status').textContent = text; el('process-progress').value = fraction; }
  function cancel() {
    if (controller) { controller.abort(); controller = null; busy(false); status(t('操作已取消，未添加计算结果。')); }
  }
  async function collect(selection, scope, signal) {
    const items = [];
    for (const [index, entry] of selection.entries()) {
      signal.throwIfAborted();
      status(t("读取 {0} / {1}：{2}", [index + 1, selection.length, entry.id]));
      const cloud = await readCloud(entry, scope, signal, ({loaded, total}) => status(t("读取 {0} · {1}%", [entry.id, Math.floor(100 * loaded / Math.max(1, total))]), loaded / Math.max(1, total)));
      signal.throwIfAborted();
      if (!cloud?.count) throw Error(t("{0} 没有可用的点", [entry.id]));
      items.push({name: entry.id, cloud});
    }
    return items;
  }
  async function perform(kind) {
    if (controller) return;
    let selected;
    try { selected = getSelection(); if (!selected.length) throw Error(t('请先勾选点云')); }
    catch (error) { status(error.message); return; }
    const scope = el('process-scope').value, scopeLabel = scope === 'full' ? t('全部点') : t('当前显示点');
    const parameters = {k: Number(el('process-k').value), radius: Number(el('process-radius').value), orientation: el('process-direction').value, features: selectedFeatures(), placement: el('process-placement').value, insertColumn: Number(el('process-column').value)};
    if (kind === 'compute' && (!Number.isInteger(parameters.k) || parameters.k < 3 || parameters.k > 256 || !Number.isFinite(parameters.radius) || parameters.radius < 0)) {
      status(t('邻域点数需为 3–256 的整数，半径需为非负数。')); return;
    }
    const format = el('process-format').value, sourceIds = el('process-source').checked;
    const job = new AbortController(); controller = job; busy(true); status(t('准备处理…'));
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
      if (kind === 'compute' && !parameters.features.length) throw Error(t('请至少勾选一项计算'));
      const items = await collect(selected, scope, job.signal);
      if (kind === 'compute') {
        const results = [];
        for (const [index, item] of items.entries()) {
          const result = await runPointFeatures(item.cloud.positions, parameters, {signal: job.signal, onProgress: ({phase, done, total}) => status(
            `${index + 1} / ${items.length} · ${item.name} · ${phase === 'index' ? t('建立邻域索引') : t('计算几何特征')} ${Math.floor(done / total * 100)}%`, (index + done / total) / items.length)});
          job.signal.throwIfAborted();
          results.push({source: selected[index], name: t("{0} · 特征（{1}）", [item.name, scopeLabel]), cloud: derivedPointCloud(item.cloud, result, parameters, scopeLabel)});
        }
        controller = null; busy(false);
        await addResults(results);
        status(t("完成：{0} 个独立结果，{1} 个有效邻域。已选中新结果，可调整着色并导出。", [results.length, results.reduce((n, r) => n + r.cloud.processing.valid, 0).toLocaleString()]));
      } else {
        const schema = pointExportSchema(items, {sourceIds}), limit = 256 * 1024 * 1024;
        // A Blob download needs all output bytes in memory. Bound it before allocating.
        const estimate = schema.count * schema.properties.length * (format === 'ply' ? 8 : 25);
        if (!handle && estimate > limit) throw Error(t('预计导出文件较大。请在支持直接保存文件的 Chrome / Edge HTTPS 或 localhost 页面中导出，或选择“当前显示点”减小数据量。'));
        if (handle) stream = await handle.createWritable();
        job.signal.throwIfAborted();
        const chunks = []; let bytes = 0;
        await writePointExport(items, {format, sourceIds, signal: job.signal, write: async chunk => {
          if (stream) await stream.write(chunk);
          else { bytes += chunk.byteLength; if (bytes > limit) throw Error(t('下载缓冲超过 256 MB，请使用支持直接保存文件的浏览器。')); chunks.push(chunk); }
        }, onProgress: ({done, total}) => status(t("写出 {0} / {1} 点 · {2}", [done.toLocaleString(), total.toLocaleString(), scopeLabel]), done / total)});
        job.signal.throwIfAborted();
        if (stream) { await stream.close(); stream = null; }
        else {
          const url = URL.createObjectURL(new Blob(chunks, {type: format === 'ply' ? 'application/octet-stream' : 'text/plain'}));
          const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
        status(t("{0}：{1} · {2} 点 · {3} 个来源。", [handle ? t('已保存') : t('已发起下载'), filename, schema.count.toLocaleString(), items.length]));
      }
    } catch (error) {
      if (stream) { try { await stream.abort(); } catch {} }
      if (controller === job) status(error.name === 'AbortError' ? t('操作已取消。') : t("操作失败：{0}", [error.message]));
    } finally { if (controller === job) { controller = null; busy(false); } }
  }
  function selectedFeatures() {
    const operation = el('process-operation').value;
    return operation === 'custom' ? [...container.querySelectorAll('#process-features input:checked')].map(input=>input.value) : [operation];
  }
  function changeOperation() {
    const operation=el('process-operation').value, exporting=operation==='export';
    el('process-compute-panel').hidden=exporting; el('process-export-panel').hidden=!exporting;
    el('process-features').hidden=operation!=='custom';
    el('process-direction-row').hidden=!selectedFeatures().includes('normals');
    el('process-description').textContent={normals:t('拟合局部平面，生成 nx、ny、nz。'),slope:t('计算局部表面坡度（0–90°），生成 slope。'),planarity:t('计算邻域的平面程度（0–1），生成 planarity。'),roughness:t('计算点到邻域拟合平面的距离，生成 roughness。'),custom:t('勾选需要的结果，复用同一个邻域索引。'),export:t('单选保存一个点云，多选合并为一个文件。')}[operation];
  }
  el('process-operation').onchange=changeOperation;
  for(const input of container.querySelectorAll('#process-features input')) input.onchange=changeOperation;
  changeOperation();
  el('process-placement').onchange=()=>{el('process-column-row').hidden=el('process-placement').value!=='index';};
  el('process-compute').onclick = () => perform('compute');
  el('process-export').onclick = () => perform('export');
  el('process-cancel').onclick = cancel;
  refresh();
  return {cancel, refresh};
}
