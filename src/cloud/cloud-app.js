import { initializeLocale } from '../shared/i18n.js';
import { t } from '../shared/i18n.js';
import { ViewerProject } from '../shared/project-model.js';
import { mountProjectTree } from '../shared/project-tree.js';
import { appendWireFiles } from '../shared/project-import.js';
import { mountPointDrop } from '../shared/point-drop.js';
import { defaultPointSettings, semanticPointCloud } from '../pointcloud/point-dataset.js';
import { mountPointColumns } from '../pointcloud/point-columns.js';
import { mountViewerLayout } from '../shared/viewer-layout.js';
import { CloudViewer } from './cloud-renderer.js';
import { readPointCloud, samplePointCloud } from './point-io.js';
import { mountPointProcessing } from '../pointcloud/point-processing.js';
import { CloudFileCache } from './cloud-cache.js';
import { describePointClouds } from './cloud-combine.js';
import { mountPaletteControls, paletteGradient } from '../shared/palette-controls.js';
import { mountCameraControls } from '../shared/camera-controls.js';

initializeLocale();
(() => {
  const $ = id => document.getElementById(id);
  const isWire = document.body.dataset.tool === 'wireframe';
  const pointExtension = /\.(xyz|txt|csv|pts|ply|pcd)$/i;
  const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });
  const pretty = value => Number(value).toLocaleString('zh-CN');
  const formatSize = value => value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`;
  const fieldLabel = name => /^column_\d+$/.test(name) ? t("第 {0} 列", [name.slice(7)]) : name;
  const compact = value => !Number.isFinite(value) ? '—' : Math.abs(value) > 10000 ? value.toPrecision(6) : Number(value.toPrecision(5)).toString();
  let entries = [], active = null, revision = 0, overlay = null;
  let viewers = [], originals = new Map(), syncEnabled = false, syncGuard = false;
  let loaded = { cloud: null, wire: null }, loadedWires = [], selectedFiles = { cloud: null, wires: [] };
  let currentPointName = '', messages = [], loadController = null;
  const cached = new CloudFileCache({readCloud: (file, options) => file.generatedCloud ? samplePointCloud(file.generatedCloud, options.maxPoints) : readPointCloud(file, options)}), selectedCloudEntries = new Set();
  let columnsControls = null, processingControls = null, displayedItems = [], resultSerial = 0;
  let cameraControls = null, paletteControls = null;
  let cloudMode = 'multiple', lastCloudEntry = null;
  const pointProject = new ViewerProject(); let projectControls = null;
  let options = { showPoints: true, showWire: isWire, pointSize: 2, pointOpacity: 1,
    colorMode: isWire ? 'solid' : 'height', pointColor: '#547d99', wireColor: '#e49b44', rgbFields: null, grid: true };

  function columnSettings(entry, cloud) {
    if (!entry.columnSettings) entry.columnSettings=defaultPointSettings(cloud);
    return entry.columnSettings;
  }
  function prepareColumns(entry, rawCloud) {
    const settings=columnSettings(entry,rawCloud);
    if(entry.columnView?.raw===rawCloud && entry.columnView.settings===settings)return entry.columnView.cloud;
    const cloud=semanticPointCloud(rawCloud,settings);
    entry.columnView={raw:rawCloud,settings,cloud};return cloud;
  }
  function error(message) { $('error').hidden = !message; $('error').querySelector('span').textContent = message || ''; }
  function activeViewerCount() { return !isWire || !$('compare-mode').checked ? 1 : Number($('compare-count').value) === 3 ? 3 : 2; }
  function copyCamera(source, target) {
    target.camera = { ...source.camera, pan: [...source.camera.pan] };
    target.target = [...source.target]; target.baseHeight = source.baseHeight;
  }
  function installSync() {
    for (const viewer of viewers) originals.set(viewer, viewer.render.bind(viewer));
    for (const viewer of viewers) {
      const ownRender = originals.get(viewer);
      viewer.render = function syncedRender() {
        const result = ownRender();
        if (!syncEnabled || syncGuard) return result;
        syncGuard = true;
        try {
          for (const other of viewers.slice(0, activeViewerCount())) {
            if (other === viewer) continue;
            copyCamera(viewer, other); originals.get(other)();
          }
        } finally { syncGuard = false; }
        return result;
      };
    }
  }
  function pauseSync(callback) {
    const previous = syncEnabled; syncEnabled = false;
    try { return callback(); } finally { syncEnabled = previous; }
  }
  function initViewers() {
    if (viewers.length) return;
    const ids = isWire ? ['scene', 'scene-2', 'scene-3'] : ['scene'];
    viewers = ids.map(id => new CloudViewer($(id), { onError: error }));
    installSync(); pauseSync(() => viewers.forEach(viewer => viewer.setOptions(options)));
  }
  function option(select, value, text) {
    const element = document.createElement('option'); element.value = value; element.textContent = text; select.append(element);
  }
  function matchingEntries() {
    const query = $('search').value.trim().toLowerCase();
    return entries.filter(entry => pointProject.matches(entry, query));
  }
  function list() {
    const filtered = matchingEntries();
    if (!isWire) {
      $('filter-count').textContent = t("{0} 个点云 · 已选 {1}", [pretty(filtered.length), selectedCloudEntries.size]);
      $('item-count').textContent = pretty(entries.length);
      projectControls?.render(); updateCloudSelection(); updateCloudModeUI(filtered); columnsControls?.refresh();
      processingControls?.refresh([...selectedCloudEntries], Boolean(loadController)); return;
    }
    $('filter-count').textContent = t("{0} 个建筑 ID", [pretty(filtered.length)]);
    $('item-count').textContent = pretty(entries.length);
    projectControls?.render();
  }

  function fillWireSelect(select, files, index = null) {
    select.replaceChildren(); option(select, '', t('不加载线框'));
    files.forEach((file, fileIndex) => option(select, String(fileIndex), file.name));
    select.value = Number.isInteger(index) && files[index] ? String(index) : '';
  }
  function setComparisonUI() {
    if (!isWire) return;
    const enabled = $('compare-mode').checked && !$('compare-mode').disabled;
    const count = enabled && Number($('compare-count').value) === 3 ? 3 : enabled ? 2 : 1;
    $('compare-controls').hidden = !enabled; $('wire-slot-3').hidden = count < 3;
    $('wire-file-2').disabled = !enabled || !active?.wires.length;
    $('wire-file-3').disabled = count < 3 || !active?.wires.length;
    $('viewer-grid').dataset.panels = String(count); $('panel-heading-1').hidden = count === 1;
    $('viewer-panel-2').hidden = count < 2; $('viewer-panel-3').hidden = count < 3;
  }
  function resetFileControls() {
    for (const id of ['wire-file', 'cloud-file']) {
      $(id).replaceChildren(); option($(id), '', t('未选择')); $(id).disabled = true;
    }
    $('attach-cloud').disabled = true;
    if (isWire) {
      for (const id of ['wire-file-2', 'wire-file-3']) {
        $(id).replaceChildren(); option($(id), '', t('未选择')); $(id).disabled = true;
      }
      $('compare-mode').checked = false; $('compare-mode').disabled = true; $('compare-count').value = '2';
      $('compare-count').querySelector('option[value="3"]').disabled = false; setComparisonUI();
    }
  }
  function resetPanelLabels() {
    if (!isWire) return;
    for (let index = 1; index <= 3; index++) {
      $(`panel-label-${index}`).textContent = t("线框 {0}", [index]); $(`panel-stats-${index}`).textContent = '—';
      $(`panel-empty-${index}`).hidden = true;
    }
  }
  function clear() {
    processingControls?.cancel(); displayedItems = [];
    loadController?.abort(); loadController = null;
    selectedCloudEntries.clear(); lastCloudEntry = null; cached.setActive([]);
    revision++; active = null; overlay = null; loaded = { cloud: null, wire: null }; loadedWires = [];
    selectedFiles = { cloud: null, wires: [] }; messages = []; currentPointName = ''; syncEnabled = false;
    pauseSync(() => viewers.forEach(viewer => viewer.setData({})));
    resetFileControls(); resetPanelLabels(); fields(); list(); error('');
    $('loading').hidden = true; $('screenshot').disabled = true; $('empty-state').hidden = false;
    $('current-title').textContent = t('未选择数据'); $('scene-stats').textContent = t('从左侧选择要查看的数据');
    $('geometry-note').textContent = t('未选择数据时保持空白'); $('data-notes').textContent = ''; $('color-legend').hidden = true;
  }
  function receive(fileList, fromFolder, dropPaths = null) {
    const files = [...fileList];
    if (!isWire) return receiveCloudFiles(files, fromFolder, dropPaths);
    const result = appendWireFiles(entries, pointProject, files, dropPaths);
    $('search').value = ''; list();
    $('source-note').textContent = t('文件留在本机 · 分组仅保留在本次页面');
    error(!result.added && !result.duplicates ? t('未找到 OBJ 线框或支持的点云文件。请选择数据集根目录或某个建筑子目录。') : '');
    // Refresh file choices on an active set without resetting its camera or selection.
    if (active) {
      const indices = ['wire-file','wire-file-2','wire-file-3'].map(id => $(id).value);
      indices.forEach((value,index) => fillWireSelect($(['wire-file','wire-file-2','wire-file-3'][index]),active.wires,value === '' ? null : Number(value)));
      const cloudValue = $('cloud-file').value;
      $('cloud-file').replaceChildren(); option($('cloud-file'), '', t('不加载点云'));
      active.clouds.forEach((file,index) => option($('cloud-file'),String(index),file.name));
      $('cloud-file').value = cloudValue;
      $('wire-file').disabled = !active.wires.length; $('cloud-file').disabled = !active.clouds.length;
      $('compare-mode').disabled = active.wires.length < 2;
      $('compare-count').querySelector('option[value="3"]').disabled = active.wires.length < 3;
      setComparisonUI();
    }
    return result;
  }
  function removeWireEntries(selection) {
    const removed = new Set(selection), removingActive = removed.has(active);
    if (removingActive) clear();
    for (const entry of removed) for (const file of [...entry.wires,...entry.clouds]) cached.forget(file);
    entries = entries.filter(entry => !removed.has(entry)); list();
  }
  function choose(entry) {
    active = entry; overlay = null; error('');
    if (isWire) {
      fillWireSelect($('wire-file'), entry.wires, entry.wires.length ? 0 : null);
      fillWireSelect($('wire-file-2'), entry.wires, entry.wires.length > 1 ? 1 : null);
      fillWireSelect($('wire-file-3'), entry.wires, entry.wires.length > 2 ? 2 : null);
      const cloudSelect = $('cloud-file'); cloudSelect.replaceChildren(); option(cloudSelect, '', t('不加载点云'));
      entry.clouds.forEach((file, index) => option(cloudSelect, String(index), file.name));
      const preferredCloud = entry.clouds.findIndex(file => file.name.toLowerCase() === 'pc.xyz');
      cloudSelect.value = entry.clouds.length ? String(preferredCloud < 0 ? 0 : preferredCloud) : '';
      $('wire-file').disabled = !entry.wires.length; cloudSelect.disabled = !entry.clouds.length; $('attach-cloud').disabled = false;
      $('compare-mode').checked = false; $('compare-mode').disabled = entry.wires.length < 2; $('compare-count').value = '2';
      $('compare-count').querySelector('option[value="3"]').disabled = entry.wires.length < 3; setComparisonUI();
    }
    list(); load();
  }
  function selectFiles() {
    if (!active) return { cloud: null, wires: [] };
    if (!isWire) return { cloud: active.file, wires: [null] };
    const ids = ['wire-file', 'wire-file-2', 'wire-file-3'].slice(0, activeViewerCount());
    const wires = ids.map(id => $(id).value === '' ? null : active.wires[Number($(id).value)] || null);
    const cloud = $('cloud-file').value === 'overlay' ? overlay : $('cloud-file').value === '' ? null : active.clouds[Number($('cloud-file').value)] || null;
    return { cloud, wires };
  }
  function read(file, kind, options = {}) {
    return cached.read(file, kind, {maxPoints: Number($('point-limit').value), ...options});
  }
  function receiveCloudFiles(files, fromFolder, dropPaths = null) {
    const existing = new Set(entries.map(entry => entry.key));
    const names = new Set(entries.map(entry => entry.id));
    let added = 0, duplicates = 0;
    for (const file of files) {
      if (!pointExtension.test(file.name)) continue;
      const path = dropPaths?.get(file) || file.webkitRelativePath || file.name;
      const key = `${path}\0${file.size}\0${file.lastModified}`;
      if (existing.has(key)) { duplicates++; continue; }
      const base = dropPaths ? path : fromFolder ? path.split('/').slice(1).join('/') || file.name : file.name;
      let id = base, suffix = 2;
      while (names.has(id)) id = `${base} (${suffix++})`;
      const entry = {id, key, file}; pointProject.assign(entry, path);
      entries.push(entry); existing.add(key); names.add(id); added++;
    }
    entries.sort((a, b) => natural(a.id, b.id));
    $('search').value = ''; list();
    $('source-note').textContent = t('文件留在本机 · 分组仅保留在本次页面');
    error(!added && !files.some(file => pointExtension.test(file.name)) ? t('未找到支持的点云。请选择 XYZ / TXT / CSV / PTS / PLY / PCD 文件。') : '');
    return { added, duplicates };
  }
  function applyCloudSelection(preferred = null) {
    if (!selectedCloudEntries.size) { clear(); return; }
    if (preferred && selectedCloudEntries.has(preferred)) lastCloudEntry = preferred;
    else if (!selectedCloudEntries.has(lastCloudEntry)) lastCloudEntry = [...selectedCloudEntries].at(-1);
    active = lastCloudEntry;
    list(); load();
  }
  function toggleCloud(entry) {
    if (cloudMode === 'single') {
      if (selectedCloudEntries.has(entry)) return;
      selectedCloudEntries.clear(); selectedCloudEntries.add(entry);
      applyCloudSelection(entry); return;
    }
    if (selectedCloudEntries.has(entry)) selectedCloudEntries.delete(entry);
    else { selectedCloudEntries.add(entry); lastCloudEntry = entry; }
    applyCloudSelection();
  }
  function removeCloud(entry) {
    if (selectedCloudEntries.delete(entry)) applyCloudSelection();
  }
  function deleteProjectEntries(selection) {
    const removed = new Set(selection.filter(entry => entries.includes(entry)));
    if (!removed.size) { list(); return; }
    processingControls?.cancel(); loadController?.abort(); loadController = null; revision++;
    for (const entry of removed) {
      selectedCloudEntries.delete(entry); cached.forget(entry.file); entry.columnView = null;
    }
    entries = entries.filter(entry => !removed.has(entry));
    displayedItems = displayedItems.filter(item => !removed.has(item.entry));
    const keys = new Set([...removed].map(entry => entry.file));
    viewers.forEach(viewer => viewer.forgetClouds(keys));
    if (selectedCloudEntries.size) applyCloudSelection(); else clear();
  }
  function updateCloudModeUI(filtered) {
    if (isWire) return;
    const multiple = cloudMode === 'multiple';
    $('cloud-mode-select').value = cloudMode;
    for (const button of document.querySelectorAll('[data-cloud-mode]')) {
      const selected = button.dataset.cloudMode === cloudMode;
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    }
    $('cloud-mode-note').textContent = multiple ? t('勾选多个文件，按原始坐标叠加。') : t('点击文件切换显示；每次只显示一个点云。');
    for (const id of ['select-all-clouds', 'invert-cloud-selection']) $(id).disabled = !multiple || !filtered.length;
    $('cloud-batch-scope').textContent = !multiple ? t('全选、反选仅在多点云模式下可用。')
      : $('search').value.trim() ? t("仅操作匹配的 {0} 个文件，保留筛选外选择。", [pretty(filtered.length)])
      : t("全选与反选包含收起文件夹内的点云。", []);
    $('empty-state').querySelector('p').textContent = multiple
      ? t('添加点云文件或文件夹，再勾选左侧一个或多个文件。')
      : t('添加点云文件或文件夹，再点击左侧要查看的文件。');
  }
  function setCloudMode(mode) {
    if (isWire || !['single', 'multiple'].includes(mode) || mode === cloudMode) return;
    cloudMode = mode;
    if (mode === 'single' && selectedCloudEntries.size > 1) {
      const keep = selectedCloudEntries.has(lastCloudEntry) ? lastCloudEntry : [...selectedCloudEntries].at(-1);
      selectedCloudEntries.clear(); selectedCloudEntries.add(keep); applyCloudSelection(keep);
    } else list();
  }
  function batchCloudSelection(invert = false) {
    if (isWire || cloudMode !== 'multiple') return;
    let changed = false, preferred = null;
    for (const entry of matchingEntries()) {
      if (invert && selectedCloudEntries.has(entry)) { selectedCloudEntries.delete(entry); changed = true; }
      else if (!selectedCloudEntries.has(entry)) { selectedCloudEntries.add(entry); preferred = entry; changed = true; }
    }
    if (changed) applyCloudSelection(preferred);
  }
  function updateCloudSelection() {
    if (isWire) return;
    const container = $('cloud-selection'); container.replaceChildren();
    container.hidden = !selectedCloudEntries.size;
    for (const entry of selectedCloudEntries) {
      const source = loaded.cloud?.sources?.find(source => source.name === entry.id);
      const chip = document.createElement('span'); chip.className = 'cloud-chip';
      const dot = document.createElement('i'); dot.className = 'cloud-source-dot'; dot.setAttribute('aria-hidden', 'true');
      if (source?.color) dot.style.background = `rgb(${source.color.map(value => Math.round(value * 255)).join(',')})`;
      const title = document.createElement('span'); title.textContent = entry.id;
      title.title = source ? t("{0} · {1} / {2} 点；色标对应“按文件”着色", [entry.id, pretty(source.count), pretty(source.totalCount)]) : entry.id;
      const remove = document.createElement('button'); remove.textContent = '×'; remove.setAttribute('aria-label', t("取消显示 {0}", [entry.id]));
      remove.onclick = () => removeCloud(entry); chip.append(dot, title, remove); container.append(chip);
    }
  }
  async function loadCloudSelection({preserveCamera = cameraControls?.preserveView ?? true} = {}) {
    if (!selectedCloudEntries.size) { clear(); return; }
    processingControls?.cancel();
    loadController?.abort();
    const controller = new AbortController(); loadController = controller;
    processingControls?.refresh([...selectedCloudEntries], true);
    const version = ++revision, selection = [...selectedCloudEntries];
    const maxPoints = Number($('point-limit').value);
    cached.setActive(selection.map(entry => entry.file));
    let snapshot = preserveCamera ? captureView() : null;
    const before = {...cached.stats};
    syncEnabled = false;
    $('loading').querySelector('span').textContent = t('正在读取新增文件…');
    $('loading').hidden = false; $('empty-state').hidden = true; $('screenshot').disabled = true; error('');
    $('current-title').textContent = selection.length === 1 ? selection[0].id : t("{0} 个点云叠加", [selection.length]);
    const items = [], failures = [];
    try {
      // File limits are independent of the selection size. Existing entities stay on screen.
      for (const [index, entry] of selection.entries()) {
        if (version !== revision) return;
        try {
          const cloud = await read(entry.file, 'cloud', {maxPoints, signal: controller.signal, onProgress({loaded, total}) {
            if (version !== revision) return;
            const message = t("解析点云 {0}%", [Math.floor(loaded / Math.max(1, total) * 100)]);
            $('loading').querySelector('span').textContent = `${index + 1} / ${selection.length} · ${message}`;
            $('scene-stats').textContent = `${entry.id} · ${message} · ${formatSize(loaded)} / ${formatSize(total)}`;
          }});
          items.push({key: entry.file, name: entry.id, entry, rawCloud: cloud, cloud: prepareColumns(entry,cloud)});
        } catch (cause) {
          if (version !== revision) return;
          failures.push(`${entry.id}：${cause.message}`);
        }
      }
      if (version !== revision) return;
      const description = describePointClouds(items);
      snapshot = preserveCamera ? captureView() : null;
      initViewers();
      viewers[0].setClouds(items.map((item, index) => ({...item, color: description.sources[index].color})), {preserveView: false});
      displayedItems = items; columnsControls?.refresh();
      loaded.cloud = description; loaded.wire = null; loadedWires = [];
      selectedFiles = {cloud: null, wires: [], clouds: items.map(item => item.name)};
      currentPointName = items.map(item => item.name).join(' + ');
      messages = [...(loaded.cloud?.notes || [])];
      messages.push(maxPoints ? t("每个文件最多显示 {0} 点，增减选择不会改变其他文件的采样。", [pretty(maxPoints)]) : t('全量显示 · 不设置点数上限。'));
      messages.push(t("本次解析 {0} 个文件，复用 {1} 个缓存。", [cached.stats.reads - before.reads, cached.stats.hits - before.hits]));
      fields();
      if (snapshot) restoreView(snapshot, viewers[0]);
      update(); updateCloudSelection(); cameraControls?.refresh();
      $('scene-stats').textContent = loaded.cloud
        ? t("{0} / {1} 个文件 · {2} / {3} 点", [items.length, selection.length, pretty(loaded.cloud.count), pretty(loaded.cloud.totalCount)])
        : t('未加载可显示的数据');
      $('geometry-note').textContent = items.length > 1 ? t("{0} 个点云按原始 XYZ 坐标叠加", [items.length]) : currentPointName || t('未加载数据');
      $('empty-state').hidden = Boolean(loaded.cloud); $('screenshot').disabled = !loaded.cloud;
      if (failures.length) error(failures.join('；'));
    } catch (cause) { if (version === revision) error(t("显示失败：{0}", [cause.message])); }
    finally { if (version === revision) { $('loading').hidden = true; loadController = null; processingControls?.refresh([...selectedCloudEntries], false); } }
  }

  function normalizeBounds(value) {
    const bounds = Array.isArray(value) && value.length === 2 ? value : value?.min && value?.max ? [value.min, value.max] : null;
    if (!bounds || bounds.some(point => !point || point.length !== 3 || !Array.from(point).every(Number.isFinite))) return null;
    const result = bounds.map(point => Array.from(point));
    return result[0].some((value, axis) => value > result[1][axis]) ? null : result;
  }
  function unionBounds(items) {
    const valid = items.map(normalizeBounds).filter(Boolean); if (!valid.length) return null;
    const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    for (const bounds of valid) for (let axis = 0; axis < 3; axis++) {
      low[axis] = Math.min(low[axis], bounds[0][axis]); high[axis] = Math.max(high[axis], bounds[1][axis]);
    }
    return [low, high];
  }
  function captureView() {
    if (!viewers[0]?.bounds) return null;
    const viewer = viewers[0];
    return { camera: { ...viewer.camera, pan: [...viewer.camera.pan] },
      worldTarget: viewer.target.map((value, axis) => value + viewer.origin[axis]), baseHeight: viewer.baseHeight };
  }
  function restoreView(snapshot, viewer) {
    if (!snapshot) return;
    viewer.camera = { ...snapshot.camera, pan: [...snapshot.camera.pan] };
    viewer.target = snapshot.worldTarget.map((value, axis) => value - viewer.origin[axis]); viewer.baseHeight = snapshot.baseHeight;
  }
  function updatePanelDetails(files) {
    if (!isWire) return;
    const count = activeViewerCount();
    for (let index = 0; index < 3; index++) {
      const file = files.wires[index] || null, wire = loadedWires[index] || null;
      $(`panel-label-${index + 1}`).textContent = file?.name || t('未加载线框');
      $(`panel-stats-${index + 1}`).textContent = wire ? t("{0} 条线", [pretty(wire.edges.length)]) : '—';
      $(`panel-empty-${index + 1}`).hidden = !(index < count && file && wire && wire.edges.length === 0);
    }
  }
  async function load({ preserveCamera = cameraControls?.preserveView ?? true } = {}) {
    if (!isWire) return loadCloudSelection({ preserveCamera });
    if (!active) { clear(); return; }
    loadController?.abort();
    const controller = new AbortController(); loadController = controller;
    const version = ++revision, entry = active, files = selectFiles();
    let viewSnapshot = preserveCamera ? captureView() : null; syncEnabled = false;
    cached.setActive([files.cloud, ...files.wires]);
    const before = {...cached.stats};
    $('loading').querySelector('span').textContent = t('正在读取文件…');
    $('loading').hidden = false; $('empty-state').hidden = true; $('screenshot').disabled = true; error('');
    $('current-title').textContent = isWire ? t("建筑 {0}", [entry.id]) : entry.id; $('scene-stats').textContent = t('正在读取所选文件…');
    $('data-notes').textContent = ''; $('color-legend').hidden = true;
    const onProgress = ({ phase, loaded, total }) => {
      if (version !== revision) return;
      const label = phase === 'count' ? t('统计点数') : t('解析点云');
      const message = `${label} ${Math.floor(loaded / total * 100)}%`;
      $('loading').querySelector('span').textContent = message;
      $('scene-stats').textContent = `${message} · ${formatSize(loaded)} / ${formatSize(total)}`;
    };
    const readOptions = { signal: controller.signal, onProgress };
    const results = await Promise.allSettled([read(files.cloud, 'cloud', readOptions), ...files.wires.map(file => read(file, 'wire', readOptions))]);
    if (version !== revision) return;
    const failures = [];
    const resultValue = (result, label) => {
      if (result.status === 'fulfilled') return result.value;
      failures.push(`${label}：${result.reason?.message || result.reason}`); return null;
    };
    loaded.cloud = resultValue(results[0], t('点云'));
    loadedWires = results.slice(1).map((result, index) => resultValue(result, t("线框 {0}", [index + 1])));
    loaded.wire = loadedWires[0] || null; selectedFiles = files; currentPointName = files.cloud?.name || '';
    messages = [...(loaded.cloud?.notes || []), t("本次解析 {0} 个文件，复用 {1} 个缓存。", [cached.stats.reads - before.reads, cached.stats.hits - before.hits])];
    try {
      viewSnapshot = preserveCamera ? captureView() : null;
      initViewers(); fields();
      const count = activeViewerCount();
      const sharedBounds = count > 1 ? unionBounds([loaded.cloud?.bounds, ...loadedWires.map(wire => wire?.bounds)]) : null;
      const commonOrigin = sharedBounds ? sharedBounds[0].map((value, axis) => value + (sharedBounds[1][axis] - value) / 2) : null;
      pauseSync(() => viewers.forEach((viewer, index) => {
        if (index < count) viewer.setData({ cloud: loaded.cloud, wire: loadedWires[index] || null, bounds: sharedBounds, origin: commonOrigin });
        else viewer.setData({});
      }));
      if (viewSnapshot) viewers.slice(0, count).forEach(viewer => restoreView(viewSnapshot, viewer));
      syncEnabled = count > 1; update(); updatePanelDetails(files); cameraControls?.refresh();
      const counts = [];
      loadedWires.forEach((wire, index) => { if (files.wires[index] && wire) counts.push(t("{0}：{1} 条线", [files.wires[index].name, pretty(wire.edges.length)])); });
      if (loaded.cloud) counts.push(t("{0} / {1} 点", [pretty(loaded.cloud.count), pretty(loaded.cloud.totalCount)]));
      $('scene-stats').textContent = counts.length ? counts.join(' · ') : t('未加载可显示的数据');
      $('geometry-note').textContent = count > 1
        ? t("{0} 个线框共享原点、边界与相机{1}", [count, loaded.cloud ? ` · ${currentPointName}` : t(' · 未加载点云')])
        : files.wires[0] && loadedWires[0] ? `${files.wires[0].name}${loaded.cloud ? ` + ${currentPointName}` : ''}` : loaded.cloud ? currentPointName : t('未加载数据');
      const hasLoaded = Boolean(loaded.cloud || loadedWires.some(Boolean));
      $('empty-state').hidden = hasLoaded; $('screenshot').disabled = !hasLoaded;
      if (failures.length) error(failures.join('；'));
    } catch (cause) { error(t("显示失败：{0}", [cause.message])); }
    finally { if (version === revision) { $('loading').hidden = true; loadController = null; processingControls?.refresh([...selectedCloudEntries], false); } }
  }
  function columnFieldLabel(key) {
    if(isWire)return fieldLabel(key);
    const settings=displayedItems[0]?.cloud.semantics;
    const tag=settings?.tags[key];
    const label=tag==='custom'?settings.custom[key]:{red:t('颜色 R'),green:t('颜色 G'),blue:t('颜色 B'),hue:t('颜色 H'),saturation:t('颜色 S'),value:t('颜色 V'),nx:t('法向量 X'),ny:t('法向量 Y'),nz:t('法向量 Z'),intensity:t('强度'),classification:t('分类'),return_number:t('回波编号'),gps_time:t('GPS 时间')}[tag];
    return label ? `${label} · ${fieldLabel(key)}` : fieldLabel(key);
  }
  function fields() {
    const cloud = loaded.cloud, keys = Object.keys(cloud?.fields || {}), color = $('color-mode'), old = color.value;
    color.replaceChildren(); option(color, 'height', t('高度 Z')); option(color, 'solid', t('单色'));
    if (cloud?.sources?.length) option(color, 'file', t('按文件'));
    if (cloud?.rgb) option(color, 'rgb', isWire ? t('原始 RGB') : t('已标记颜色（RGB / HSV）')); if (isWire && keys.length >= 3) option(color, 'custom-rgb', t('指定 RGB 列…'));
    keys.filter(key => !['x', 'y', 'z', 'rgb', 'rgba'].includes(key.toLowerCase())).forEach(key => option(color, `field:${key}`, columnFieldLabel(key)));
    color.value = [...color.options].some(item => item.value === old) ? old : 'height';
    const extra = keys.filter(key => !['x', 'y', 'z'].includes(key.toLowerCase()));
    ['rgb-r', 'rgb-g', 'rgb-b'].forEach((id, index) => {
      const select = $(id), previous = select.value; select.replaceChildren(); keys.forEach(key => option(select, key, columnFieldLabel(key)));
      select.value = keys.includes(previous) ? previous : extra[index] || keys[index] || '';
    });
    $('rgb-fields').hidden = color.value !== 'custom-rgb';
  }
  function update() {
    const color = $('color-mode').value;
    options = { ...options, ...paletteControls?.getOptions(), showPoints: $('show-points').checked, showWire: isWire && $('show-wire').checked,
      grid: $('show-grid').checked, pointSize: Number($('point-size').value), pointOpacity: Number($('point-opacity').value),
      wireColor: $('wire-color').value, colorMode: color === 'custom-rgb' ? 'rgb' : color,
      rgbFields: color === 'custom-rgb' ? ['rgb-r', 'rgb-g', 'rgb-b'].map(id => $(id).value) : null };
    $('rgb-fields').hidden = color !== 'custom-rgb'; $('point-size-value').value = String(options.pointSize);
    $('point-opacity-value').value = `${Math.round(options.pointOpacity * 100)}%`;
    pauseSync(() => viewers.forEach(viewer => viewer.setOptions(options))); viewers[0]?.render();
    const state = viewers[0]?.getState(), range = state?.colorRange;
    paletteControls?.setScalarEnabled(color === 'height' || color.startsWith('field:'));
    paletteControls?.setDataRange(state?.dataRange || range);
    $('color-legend').querySelector('i').style.background = paletteGradient(options.palette, options.reverse);
    $('color-legend').hidden = !(loaded.cloud && options.showPoints && range);
    $('color-name').textContent = $('color-mode').selectedOptions[0]?.textContent || '';
    $('color-min').textContent = compact(range?.min); $('color-max').textContent = compact(range?.max);
    const notes = messages.slice(); for(const item of displayedItems) if(item.cloud.colorIssue) notes.push(`${item.name}：${item.cloud.colorIssue}`); if (state?.colorFallback) notes.push(state.colorFallback); $('data-notes').textContent = notes.join(' ');
  }
  function preventDuplicateSelection(changed) {
    if (!isWire || !$('compare-mode').checked || changed.value === '') return;
    const selects = [$('wire-file'), $('wire-file-2'), $('wire-file-3')].slice(0, activeViewerCount());
    const others = new Set(selects.filter(select => select !== changed).map(select => select.value).filter(Boolean));
    if (!others.has(changed.value)) return;
    const replacement = [...changed.options].find(item => item.value && !others.has(item.value));
    changed.value = replacement?.value || ''; error(t('并排对比需要选择不同的线框文件，已自动改为其他可用文件。'));
  }
  function exportScreenshot() {
    if (!viewers[0] || !active) return;
    const screenshotId = isWire ? active.id : (loaded.cloud?.sources || []).map(source => source.name).join(' + ');
    const screenshotCloud = loaded.cloud, screenshotSourceCount = loaded.cloud?.sources?.length || 0;
    const screenshotWires = loadedWires.slice();
    const screenshotFiles = selectedFiles.wires.slice();
    const count = activeViewerCount(), activeViewers = viewers.slice(0, count); activeViewers[0].render();
    const source = activeViewers[0].canvas;
    if (!(source.width > 0 && source.height > 0)) return error(t('当前画布尺寸无效，无法保存截图。'));
    const panelWidth = Math.min(count === 1 ? 1100 : 720, source.width);
    const panelHeight = Math.max(1, Math.round(panelWidth * source.height / source.width));
    const heading = 42, footer = 50, output = document.createElement('canvas');
    output.width = panelWidth * count; output.height = heading + panelHeight + footer;
    const context = output.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, output.width, output.height);
    const pointText = screenshotCloud ? t("{0} / {1} 点", [pretty(screenshotCloud.count), pretty(screenshotCloud.totalCount)]) : t('未加载点云');
    const fitText = (text, width) => {
      let value = String(text); while (value.length > 4 && context.measureText(value).width > width) value = `${value.slice(0, -2)}…`; return value;
    };
    activeViewers.forEach((viewer, index) => {
      const x = index * panelWidth, wire = screenshotWires[index] || null;
      const label = isWire ? screenshotFiles[index]?.name || t('未加载线框') : screenshotId;
      context.fillStyle = '#193047'; context.font = 'bold 17px sans-serif'; context.fillText(fitText(label, panelWidth - 28), x + 14, 27);
      context.drawImage(viewer.canvas, x, heading, panelWidth, panelHeight);
      context.fillStyle = '#f4f7f6'; context.fillRect(x, heading + panelHeight, panelWidth, footer);
      context.fillStyle = '#526b72'; context.font = '13px sans-serif';
      const lineText = isWire ? wire ? t("{0} 条线{1}", [pretty(wire.edges.length), wire.edges.length ? '' : t(' · 空线框')]) : t('未加载线框') : t('点云');
      context.fillText(fitText(`${lineText} · ${pointText}`, panelWidth - 28), x + 14, heading + panelHeight + 30);
    });
    output.toBlob(blob => {
      if (!blob) return error(t('浏览器无法生成截图。'));
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
      const downloadId = !isWire && screenshotSourceCount > 1 ? `${screenshotSourceCount}_files` : screenshotId;
      link.download = `${isWire ? 'wireframe' : 'pointcloud'}_${downloadId.replace(/[^a-zA-Z0-9_.-]/g, '_')}.png`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  }

  if (!isWire) projectControls = mountProjectTree({
    project: pointProject, container: $('data-list'), root: $('project-root'), controls: $('project-controls'),
    getEntries: () => entries, getSelected: () => selectedCloudEntries, getMode: () => cloudMode,
    getQuery: () => $('search').value, onToggle: entry => cloudMode === 'single' && selectedCloudEntries.has(entry) ? removeCloud(entry) : toggleCloud(entry), onRemove: deleteProjectEntries, onChange: list,
    detail: entry => entry.file.generatedCloud ? t('结果') : formatSize(entry.file.size),
    selectionHint: '勾选后用于显示、计算与合并',
    onVisibility: (members, checked) => {
      if (checked && cloudMode === 'single') {
        if (members.length !== 1) return;
        selectedCloudEntries.clear();
      }
      for (const entry of members) checked ? selectedCloudEntries.add(entry) : selectedCloudEntries.delete(entry);
      applyCloudSelection();
    },
    onGroupSelection: (members, checked) => {
      if (cloudMode !== 'multiple') return;
      for (const entry of members) checked ? selectedCloudEntries.add(entry) : selectedCloudEntries.delete(entry);
      applyCloudSelection();
    },
  });

  if (isWire) projectControls = mountProjectTree({
    project: pointProject, container: $('data-list'), root: $('project-root'), controls: $('project-controls'),
    getEntries: () => entries, getSelected: () => new Set(active ? [active] : []), getMode: () => 'single',
    getQuery: () => $('search').value, onToggle: entry => active === entry ? clear() : choose(entry),
    onRemove: removeWireEntries, onChange: list,
    detail: entry => `${entry.wires.length} OBJ · ${entry.clouds.length} PC`,
    selectionHint: '每次预览一个建筑组；可多选管理',
    onVisibility: (members, checked) => {
      if (checked && members.length === 1) choose(members[0]);
      else if (!checked && members.includes(active)) clear();
    },
    onGroupSelection: () => {},
  });

  if (!isWire) mountPointDrop({
    zone: $('point-drop-zone'), status: $('drop-status'),
    accepts: name => pointExtension.test(name),
    onFiles: records => receiveCloudFiles(records.map(item => item.file), false,
      new Map(records.map(item => [item.file, item.path]))),
  });

  $('choose-folder').onclick = () => $('folder-input').click();
  $('folder-input').onchange = event => { receive(event.target.files, true); event.target.value = ''; };
  $('choose-file').onclick = () => $('file-input').click();
  $('file-input').onchange = event => { receive(event.target.files, false); event.target.value = ''; };
  $('attach-cloud').onclick = () => $('overlay-input').click();
  $('overlay-input').onchange = event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file || !active) return;
    if (!pointExtension.test(file.name)) { error(t('请选择支持的点云文件')); return; }
    overlay = file; const select = $('cloud-file'); select.querySelector('option[value="overlay"]')?.remove();
    option(select, 'overlay', t("{0}（另选）", [file.name])); select.disabled = false; select.value = 'overlay'; load();
  };
  $('search').oninput = () => { list(); };
  $('clear-selection').onclick = clear; $('dismiss-error').onclick = () => error('');
  if (!isWire) {
    for (const button of document.querySelectorAll('[data-cloud-mode]')) button.onclick = () => setCloudMode(button.dataset.cloudMode);
    $('cloud-mode-select').onchange = event => setCloudMode(event.target.value);
    $('select-all-clouds').onclick = () => batchCloudSelection();
    $('invert-cloud-selection').onclick = () => batchCloudSelection(true);
  }
  $('wire-file').onchange = event => { preventDuplicateSelection(event.target); load(); };
  $('cloud-file').onchange = () => load(); $('point-limit').onchange = () => { if (active) load(); };
  if (isWire) {
    for (const id of ['wire-file-2', 'wire-file-3']) $(id).onchange = event => { preventDuplicateSelection(event.target); load(); };
    $('compare-mode').onchange = () => { setComparisonUI(); load({ preserveCamera: true }); };
    $('compare-count').onchange = () => { setComparisonUI(); load({ preserveCamera: true }); };
  }
  for (const id of ['color-mode', 'show-points', 'show-wire', 'show-grid', 'wire-color', 'rgb-r', 'rgb-g', 'rgb-b']) $(id).onchange = update;
  for (const id of ['point-size', 'point-opacity']) $(id).oninput = update;
  $('fit-view').onclick = () => viewers[0]?.fit(); $('zoom-in').onclick = () => viewers[0]?.zoomBy(1.2); $('zoom-out').onclick = () => viewers[0]?.zoomBy(1 / 1.2);
  for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => {
    viewers[0]?.setView(button.dataset.view);
    for (const other of document.querySelectorAll('[data-view]')) {
      other.classList.toggle('active', other === button); other.setAttribute('aria-pressed', String(other === button));
    }
  };
  $('screenshot').onclick = exportScreenshot;
  document.addEventListener('keydown', event => {
    if (!['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName) && event.key.toLowerCase() === 'f') {
      event.preventDefault(); viewers[0]?.fit();
    }
  });
  try {
    initViewers();
    paletteControls = mountPaletteControls({container: $('palette-controls'), getOptions: () => options, onChange: update});
    cameraControls = mountCameraControls({container: $('camera-controls'), bookmarkContainer: $('bookmark-controls'), getViewers: () => viewers.slice(0, activeViewerCount()),
      space: 'raw-world', getScene: () => ({ids: isWire ? [active?.id].filter(Boolean) : [...selectedCloudEntries].map(entry => entry.id)}), pauseSync});
    if (!isWire) processingControls = mountPointProcessing({container: $('processing-controls'),
      getSelection: () => {
        if (loadController) throw Error(t('请等待点云加载完成后再处理'));
        const selection = [...selectedCloudEntries];
        if (selection.some(entry => !displayedItems.some(item => item.key === entry.file))) throw Error(t('有文件加载失败，请取消勾选失败的文件后重试'));
        return selection;
      },
      readCloud: async (entry, scope, signal, onProgress) => {
        signal.throwIfAborted();
        if (scope === 'display') return displayedItems.find(item => item.key === entry.file)?.cloud;
        if (entry.file.generatedCloud) return prepareColumns(entry,entry.file.generatedCloud);
        const record = cached.records.get(entry.file);
        if (record && record.value.count === record.value.totalCount) return prepareColumns(entry,record.value);
        return semanticPointCloud(await readPointCloud(entry.file, {maxPoints: 0, signal, onProgress}), entry.columnSettings);
      },
      addResults: async results => {
        selectedCloudEntries.clear();
        for (const result of results) {
          const serial = ++resultSerial, file = {name: result.name, size: cached.bytes(result.cloud), generatedCloud: result.cloud};
          const entry = {id: `${result.name} #${serial}`, key: `generated:${serial}`, file};
          entry.group = result.source?.group || ''; entry.treeName = t("{0} · 特征 #{1}", [result.source?.treeName || result.name, serial]);
          if (entry.group) pointProject.groups.get(entry.group).collapsed = false;
          entries.push(entry); selectedCloudEntries.add(entry); lastCloudEntry = entry;
        }
        if (results.length > 1) cloudMode = 'multiple';
        $('source-note').textContent = t("已列出 {0} 个条目 · 计算结果请导出保存", [pretty(entries.length)]);
        active = lastCloudEntry; $('search').value = ''; list();
        await loadCloudSelection();
        const mapping=results[0]?.cloud.featureMapping||{};
        const field=mapping.slope||mapping.planarity||mapping.roughness||mapping.nz;
        if (field) { $('color-mode').value = `field:${field}`; update(); }
      },
    });
    if(!isWire) columnsControls=mountPointColumns({container:$('column-controls'),
      getItems:()=>displayedItems.filter(item=>selectedCloudEntries.has(item.entry)),
      getSettings:columnSettings,
      applySettings:async(entry,settings)=>{
        if(loadController)throw Error(t('请等待点云加载完成'));
        const item=displayedItems.find(item=>item.entry===entry);if(!item)throw Error(t('请重新选择点云'));
        semanticPointCloud(item.rawCloud,settings,{strict:true});
        processingControls?.cancel();entry.columnSettings=settings;entry.columnView=null;
        await loadCloudSelection({preserveCamera:true});
      },
    });
    mountViewerLayout();
    if (isWire) mountPointDrop({zone: document.querySelector('.sidebar'), status: $('drop-status'), accepts: name => /\.obj$/i.test(name) || pointExtension.test(name), onFiles: items => {
      return receive(items.map(item => item.file), true, new Map(items.map(item => [item.file,item.path])));
    }});
    clear(); update();
  } catch (cause) { error(cause.message); }
})();
