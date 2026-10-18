import { migrateObjectImportState } from '../shared/object-import-state.js';
import { createBatchProgress } from '../shared/batch-progress.js';
import { compactNames, setNameSummary } from '../shared/name-summary.js';
import { currentPalettePreferences } from '../shared/palettes.js';
import { wirePreference, wireEntryFiles, combineWireframes, adjacentWireEntry, wireNavigationDirection, normalizeWirePreferences } from './wire-selection.js';
import { mountMobileProject, snapshotProjectTree, restoreProjectTree, captureMobileInputs, restoreMobileInputs, isMobileApp, nativeExportWriter, NativeProjectFile } from '../shared/mobile-project.js';
import { writePointExport } from '../pointcloud/point-export.js';
import { archiveImportQueue } from '../shared/zip-import.js';
import { mountCloudColors } from '../shared/cloud-colors.js';
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
import { genTakeHandoff } from '../shared/generate-handoff.js';

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
  let mobileSession=null,mobileKnownIds=[];
  let cameraControls = null, paletteControls = null, cloudColors = null;
  let cloudMode = 'multiple', lastCloudEntry = null;
  let wireMode = 'single', wirePreferences = {wires: [null, null, null], cloud: null, compare: false, count: 2};
  const selectedWireEntries = new Set();
  let wireChoices={wires:[],clouds:[]};
  if(isWire)try{wirePreferences=normalizeWirePreferences(JSON.parse(localStorage.getItem('BuildingWebViewer.wirePreferences')||'null'));}catch{}
  const pointProject = new ViewerProject(); let projectControls = null;
  let options = {...currentPalettePreferences(), showPoints: true, showWire: isWire, pointSize: 2, pointOpacity: 1,
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
    target.navigation?.reset();
    target.camera = { ...source.camera, pan: [...source.camera.pan] };
    target.target = [...source.target]; target.baseHeight = source.baseHeight;
    target.projection=source.projection;target.distance=source.distance;target.fov=source.fov;target.near=source.near;
    target.flyPose=source.flyPose?{eye:[...source.flyPose.eye],basis:source.flyPose.basis.map(v=>[...v])}:null;
  }
  function installSync() {
    for (const viewer of viewers) originals.set(viewer, viewer.render.bind(viewer));
    for (const viewer of viewers) {
      const ownRender = originals.get(viewer);
      viewer.render = function syncedRender() {
        const result = ownRender();
        if (!syncEnabled || syncGuard || this.flyPose&&!this.fly?.active || viewers.some(v=>v!==this&&v.fly?.active)) return result;
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
      $('filter-count').textContent = t("匹配 {0} 项 · 已勾选 {1}", [pretty(filtered.length), selectedCloudEntries.size]);
      $('item-count').textContent = t('共 {0} 项', [pretty(entries.length)]);
      projectControls?.render(); updateCloudSelection(); updateCloudModeUI(filtered); columnsControls?.refresh();
      processingControls?.refresh([...selectedCloudEntries], Boolean(loadController)); return;
    }
    $('filter-count').textContent = t('匹配 {0} 项 · 已勾选 {1}', [pretty(filtered.length), selectedWireEntries.size]);
    $('wire-mode-select').value = wireMode;
    for (const id of ['select-all-wires','invert-wire-selection']) $(id).disabled = wireMode !== 'multiple' || !filtered.length;
    const multiple = wireMode === 'multiple';
    $('previous-wire-id').parentElement.hidden=multiple;
    $('wire-mode-note').textContent = multiple ? t('勾选多个 ID，按原始坐标叠加；显示设置应用到所有已选 ID。') : t('单个 ID：← / → 或 [ / ] 切换；按自然编号顺序，遵循搜索筛选。');
    for (const id of ['previous-wire-id','next-wire-id']) $(id).disabled = multiple || !filtered.length || adjacentWireEntry(filtered,active,id === 'previous-wire-id' ? -1 : 1) === active;
    $('item-count').textContent = t('共 {0} 项', [pretty(entries.length)]);
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
    $('wire-file-2').disabled = !enabled || !wireChoices.wires.length;
    $('wire-file-3').disabled = count < 3 || !wireChoices.wires.length;
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
      setNameSummary($(`panel-label-${index}`),[],t("线框 {0}", [index])); $(`panel-stats-${index}`).textContent = '—';
      $(`panel-empty-${index}`).hidden = true;
    }
  }
  function clear() {
    processingControls?.cancel(); displayedItems = [];cloudColors?.refresh();
    loadController?.abort(); loadController = null;
    selectedCloudEntries.clear(); selectedWireEntries.clear(); lastCloudEntry = null; cached.setActive([]);
    revision++; active = null; overlay = null; loaded = { cloud: null, wire: null }; loadedWires = [];
    selectedFiles = { cloud: null, wires: [] }; messages = []; currentPointName = ''; syncEnabled = false;
    pauseSync(() => viewers.forEach(viewer => viewer.setData({})));
    resetFileControls(); resetPanelLabels(); fields(); list(); error('');
    $('loading').hidden = true; $('screenshot').disabled = true; $('empty-state').hidden = false;
    $('current-title').textContent = t('未选择数据'); $('scene-stats').textContent = t('从左侧选择要查看的数据');
    setNameSummary($('geometry-note'),[],t('未选择数据时保持空白')); $('data-notes').textContent = ''; $('color-legend').hidden = true;
  }
  function receive(fileList, fromFolder, dropPaths = null) {
    const files = [...fileList];
    if (!isWire) return receiveCloudFiles(files, fromFolder, dropPaths);
    const result = appendWireFiles(entries, pointProject, files, dropPaths);
    $('search').value = ''; list();
    $('source-note').textContent = t('文件留在本机 · 分组仅保留在本次页面');
    error(!result.added && !result.duplicates ? t('未找到 OBJ 线框或支持的点云文件。请选择数据集根目录或某个对象子目录。') : '');
    if(active)configureWireChoices(active);
    return result;
  }
  function rememberWireChoices(changed = null) {
    if (!isWire || !active) return;
    wirePreferences.wires = ['wire-file','wire-file-2','wire-file-3'].map((id,index) => changed && changed !== id || !wireChoices.wires.length ? wirePreferences.wires[index] : wirePreference(wireChoices.wires, $(id).value));
    if((!changed || changed==='cloud-file') && wireChoices.clouds.length && $('cloud-file').value!=='overlay')wirePreferences.cloud = wirePreference(wireChoices.clouds, $('cloud-file').value);
    if((!changed || changed==='compare-mode') && !$('compare-mode').disabled)wirePreferences.compare = $('compare-mode').checked;
    if(!changed || changed==='compare-count')wirePreferences.count = Number($('compare-count').value);
    try{localStorage.setItem('BuildingWebViewer.wirePreferences',JSON.stringify(wirePreferences));}catch{}
  }
  function configureWireChoices(entry) {
    const unique = key => [...new Map([entry,...[...selectedWireEntries].filter(item=>item!==entry)].flatMap(item=>item[key]).map(file=>[file.name.toLowerCase(),file])).values()];
    wireChoices={wires:unique('wires'),clouds:unique('clouds')};
    const files = wireEntryFiles(wireChoices, wirePreferences, 3);
    ['wire-file','wire-file-2','wire-file-3'].forEach((id,index) => fillWireSelect($(id),wireChoices.wires,files.wires[index] ? wireChoices.wires.indexOf(files.wires[index]) : null));
    const cloudSelect = $('cloud-file'); cloudSelect.replaceChildren(); option(cloudSelect, '', t('不加载点云'));
    wireChoices.clouds.forEach((file,index) => option(cloudSelect,String(index),file.name));
    cloudSelect.value = files.cloud ? String(wireChoices.clouds.indexOf(files.cloud)) : '';
    $('wire-file').disabled = !wireChoices.wires.length; cloudSelect.disabled = !wireChoices.clouds.length; $('attach-cloud').disabled = false;
    const capacity = Math.max(0,...[...selectedWireEntries].map(item => item.wires.length));
    $('compare-mode').disabled = capacity < 2;
    $('compare-mode').checked = wirePreferences.compare && capacity >= 2;
    $('compare-count').value = String(wirePreferences.count === 3 && capacity >= 3 ? 3 : 2);
    $('compare-count').querySelector('option[value="3"]').disabled = capacity < 3;
    setComparisonUI();
  }
  function removeWireEntries(selection) {
    const removed = new Set(selection);
    loadController?.abort(); revision++;
    for (const entry of removed) {
      selectedWireEntries.delete(entry);
      for (const file of [...entry.wires,...entry.clouds]) cached.forget(file);
    }
    entries = entries.filter(entry => !removed.has(entry));
    if (selectedWireEntries.size) applyWireSelection(); else clear();
  }
  function choose(entry) {
    selectedWireEntries.clear(); selectedWireEntries.add(entry);
    return applyWireSelection(entry, {preserveCamera: false});
  }
  function applyWireSelection(preferred = null, {preserveCamera = false} = {}) {
    if (!selectedWireEntries.size) { clear(); return; }
    active = selectedWireEntries.has(preferred) ? preferred : selectedWireEntries.has(active) ? active : [...selectedWireEntries].at(-1);
    overlay = null; error(''); configureWireChoices(active); list();
    return load({preserveCamera});
  }
  function toggleWire(entry) {
    if (wireMode === 'single') {
      if (selectedWireEntries.has(entry)) clear(); else choose(entry);
      return;
    }
    if (selectedWireEntries.has(entry)) selectedWireEntries.delete(entry); else selectedWireEntries.add(entry);
    applyWireSelection(entry);
  }
  function setWireMode(mode) {
    if (!['single','multiple'].includes(mode) || mode === wireMode) return;
    wireMode = mode;
    if (mode === 'single' && selectedWireEntries.size > 1) choose(active || [...selectedWireEntries].at(-1));
    else { list(); mobileSession?.schedule(); }
  }
  function batchWireSelection(invert = false) {
    if (wireMode !== 'multiple') return;
    for (const entry of matchingEntries()) {
      if (invert && selectedWireEntries.has(entry)) selectedWireEntries.delete(entry); else selectedWireEntries.add(entry);
    }
    applyWireSelection();
  }
  function navigateWire(direction) {
    if (wireMode !== 'single') return;
    const next = adjacentWireEntry(matchingEntries(), active, direction);
    if (next && next !== active) choose(next);
  }
  function selectFiles(entry = active) {
    if (!entry) return { cloud: null, wires: [] };
    if (!isWire) return { cloud: entry.file, wires: [null] };
    const preferences={wires:['wire-file','wire-file-2','wire-file-3'].map(id=>wirePreference(wireChoices.wires,$(id).value)),cloud:$('cloud-file').value==='overlay'?{none:true}:wirePreference(wireChoices.clouds,$('cloud-file').value)};
    const files=wireEntryFiles(entry,preferences,activeViewerCount());
    if(entry===active && $('cloud-file').value==='overlay')files.cloud=overlay;
    return files;
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
      if(entry.displayColor)dot.style.background=entry.displayColor;
      else if (source?.color) dot.style.background = `rgb(${source.color.map(value => Math.round(value * 255)).join(',')})`;
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
    const batchProgress=createBatchProgress($('loading'),{total:selection.length,unit:'个点云',current:()=>version===revision});
    $('loading').hidden = false; $('empty-state').hidden = true; $('screenshot').disabled = true; error('');
    $('current-title').textContent = selection.length === 1 ? selection[0].id : t("{0} 个点云叠加", [selection.length]);
    const items = [], failures = [];
    try {
      // File limits are independent of the selection size. Existing entities stay on screen.
      for (const [index, entry] of selection.entries()) {
        if (version !== revision) return;
        try {
          const cloud = await read(entry.file, 'cloud', {maxPoints, signal: controller.signal});
          items.push({key: entry.file, name: entry.id, entry, rawCloud: cloud, cloud: prepareColumns(entry,cloud)});
        } catch (cause) {
          if (version !== revision) return;
          failures.push(`${entry.id}：${cause.message}`);
        }
        batchProgress.report(index+1,failures.length);
      }
      if (version !== revision) return;
      batchProgress.prepare();
      const description = describePointClouds(items);
      snapshot = preserveCamera ? captureView() : null;
      initViewers();
      viewers[0].setClouds(items.map((item, index) => ({...item, color: description.sources[index].color, displayColor:item.entry.displayColor})), {preserveView: false});
      displayedItems = items; columnsControls?.refresh();cloudColors?.refresh();
      loaded.cloud = description; loaded.wire = null; loadedWires = [];
      selectedFiles = {cloud: null, wires: [], clouds: items.map(item => item.name)};
      currentPointName = compactNames(items.map(item => item.name));
      messages = [...(loaded.cloud?.notes || [])];
      messages.push(maxPoints ? t("每个文件最多显示 {0} 点，增减选择不会改变其他文件的采样。", [pretty(maxPoints)]) : t('全量读取 · 不设置读取点数上限。'));
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
    finally { if (version === revision) { $('loading').hidden = true; loadController = null; processingControls?.refresh([...selectedCloudEntries], false);mobileSession?.schedule(); } }
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
      projection:viewer.projection,distance:viewer.distance,fov:viewer.fov,near:viewer.near,worldTarget: viewer.target.map((value, axis) => value + viewer.origin[axis]), baseHeight: viewer.baseHeight };
  }
  function restoreView(snapshot, viewer) {
    if (!snapshot) return;
    viewer.stopNavigation();viewer.projection=snapshot.projection;viewer.distance=snapshot.distance;viewer.fov=snapshot.fov;viewer.near=snapshot.near;
    viewer.camera = { ...snapshot.camera, pan: [...snapshot.camera.pan] };
    viewer.target = snapshot.worldTarget.map((value, axis) => value - viewer.origin[axis]); viewer.baseHeight = snapshot.baseHeight;
  }
  async function load({ preserveCamera = cameraControls?.preserveView ?? true } = {}) {
    if (!isWire) return loadCloudSelection({ preserveCamera });
    if (!active || !selectedWireEntries.size) { clear(); return; }
    loadController?.abort();
    const controller = new AbortController(); loadController = controller;
    const version = ++revision, selection = [...selectedWireEntries], count = activeViewerCount();
    // Resolve filenames per ID instead of reusing another ID's dropdown index.
    const plans = selection.map(entry => ({entry, files: selectFiles(entry)}));
    cached.setActive(plans.flatMap(({files}) => [files.cloud,...files.wires]));
    const before = {...cached.stats}, failures = [], cloudItems = [], wireGroups = Array.from({length:count},()=>[]);
    const panelNames = Array.from({length:count},()=>[]);
    let viewSnapshot = preserveCamera ? captureView() : null; syncEnabled = false;
    const batchProgress=createBatchProgress($('loading'),{total:selection.length,unit:'个对象',current:()=>version===revision});
    $('loading').hidden = false; $('empty-state').hidden = true; $('screenshot').disabled = true; error('');
    $('current-title').textContent = selection.length === 1 ? t('对象 {0}',[active.id]) : t('{0} 个 ID 叠加',[selection.length]);
    $('scene-stats').textContent = t('正在读取所选文件…');
    try {
      let completed=0,failedItems=0;
      for (const {entry,files} of plans) {
        if (version !== revision) return;
        const results = await Promise.allSettled([read(files.cloud,'cloud',{signal:controller.signal}),...files.wires.map(file=>read(file,'wire',{signal:controller.signal}))]);
        if (version !== revision) return;
        if(results.some(result=>result.status==='rejected'))failedItems++;
        batchProgress.report(++completed,failedItems);
        const value = (result,file) => {
          if (result.status === 'fulfilled') return result.value;
          failures.push(`${entry.id} / ${file?.name || ''}：${result.reason?.message || result.reason}`); return null;
        };
        const cloud = value(results[0],files.cloud);
        if (cloud) cloudItems.push({key:files.cloud,name:`${entry.id} / ${files.cloud.name}`,cloud});
        results.slice(1).forEach((result,index)=>{
          const wire = value(result,files.wires[index]);
          if (wire) {wireGroups[index].push(wire);panelNames[index].push(`${entry.id} / ${files.wires[index].name}`);}
        });
      }
      if (version !== revision) return;
      batchProgress.prepare();
      viewSnapshot = preserveCamera ? captureView() : null;
      loadedWires = wireGroups.map(combineWireframes); loaded.wire = loadedWires[0] || null;
      loaded.cloud = cloudItems.length === 1 ? cloudItems[0].cloud : describePointClouds(cloudItems);
      selectedFiles = plans.find(plan=>plan.entry===active)?.files || {cloud:null,wires:[]};
      currentPointName = compactNames(cloudItems.map(item=>item.name));
      messages = [...(loaded.cloud?.notes || []),t('本次解析 {0} 个文件，复用 {1} 个缓存。',[cached.stats.reads-before.reads,cached.stats.hits-before.hits])];
      initViewers(); fields();
      const sharedBounds = unionBounds([...cloudItems.map(item=>item.cloud.bounds),...loadedWires.map(wire=>wire?.bounds)]);
      const commonOrigin = sharedBounds ? sharedBounds[0].map((value,axis)=>value+(sharedBounds[1][axis]-value)/2) : null;
      pauseSync(()=>viewers.forEach((viewer,index)=>{
        if(index<count) viewer.setClouds(cloudItems,{wire:loadedWires[index],bounds:sharedBounds,origin:commonOrigin,preserveView:false});
        else viewer.setData({});
      }));
      if (viewSnapshot) viewers.slice(0,count).forEach(viewer=>restoreView(viewSnapshot,viewer));
      syncEnabled = count>1; update(); cameraControls?.refresh();
      for(let index=0;index<3;index++) {
        const wire=loadedWires[index];
        setNameSummary($(`panel-label-${index+1}`),panelNames[index],t('未加载线框'));
        $(`panel-stats-${index+1}`).textContent=wire?t('{0} 条线',[pretty(wire.edges.length)]):'—';
        $(`panel-empty-${index+1}`).hidden=!(index<count && wire && !wire.edges.length);
      }
      const edges=loadedWires.reduce((sum,wire)=>sum+(wire?.edges.length||0),0);
      $('scene-stats').textContent=t('{0} 个 ID · {1} 条线 · {2} 点',[selection.length,pretty(edges),pretty(loaded.cloud?.count||0)]);
      setNameSummary($('geometry-note'),panelNames[0].length ? panelNames[0] : cloudItems.map(item=>item.name),t('未加载数据'));
      const hasLoaded=Boolean(cloudItems.length || loadedWires.some(wire=>wire?.edges.length));
      $('empty-state').hidden=hasLoaded; $('screenshot').disabled=!hasLoaded;
      if(failures.length) error(failures.join('；'));
    } catch(cause) {if(version===revision)error(t('显示失败：{0}',[cause.message]));}
    finally {if(version===revision){$('loading').hidden=true;loadController=null;mobileSession?.schedule();}}
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
      pointColor: $('point-color').value, wireColor: $('wire-color').value, colorMode: color === 'custom-rgb' ? 'rgb' : color,
      rgbFields: color === 'custom-rgb' ? ['rgb-r', 'rgb-g', 'rgb-b'].map(id => $(id).value) : null };
    $('point-color').disabled=color!=='solid';
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
    getEntries: () => entries, getSelected: () => selectedWireEntries, getMode: () => wireMode,
    getQuery: () => $('search').value, onToggle: toggleWire,
    onRemove: removeWireEntries, onChange: list,
    detail: entry => `${entry.wires.length} OBJ · ${entry.clouds.length} PC`,
    selectionHint: '勾选后显示该 ID 的线框与点云',
    onVisibility: (members, checked) => {
      if (checked && wireMode === 'single') {if(members.length===1)choose(members[0]);return;}
      for(const entry of members) checked?selectedWireEntries.add(entry):selectedWireEntries.delete(entry);
      applyWireSelection();
    },
    onGroupSelection: (members,checked) => {
      if(wireMode!=='multiple')return;
      for(const entry of members) checked?selectedWireEntries.add(entry):selectedWireEntries.delete(entry);
      applyWireSelection();
    },
  });

  const importRecords=archiveImportQueue({accepts:name=>pointExtension.test(name)||(isWire&&/\.obj$/i.test(name)),
    receive:records=>receive(records.map(item=>item.file),true,new Map(records.map(item=>[item.file,item.path]))),
    onProgress:message=>{$('drop-status').hidden=false;$('drop-status').textContent=message;},onError:error});
  const pickFiles=event=>{const records=Array.from(event.target.files,file=>({file,path:file.webkitRelativePath||file.name}));event.target.value='';importRecords(records).catch(()=>{});};
  if (!isWire) mountPointDrop({
    zone: $('point-drop-zone'), status: $('drop-status'),
    accepts: name => pointExtension.test(name)||/\.zip$/i.test(name),
    onFiles: importRecords,
  });

  $('choose-folder').onclick = () => $('folder-input').click();
  $('folder-input').onchange = pickFiles;
  $('choose-file').onclick = () => $('file-input').click();
  $('file-input').onchange = pickFiles;
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
  $('wire-file').onchange = event => { preventDuplicateSelection(event.target); if(isWire)rememberWireChoices(event.target.id); load(); };
  $('cloud-file').onchange = () => {if(isWire)rememberWireChoices('cloud-file');load();}; $('point-limit').onchange = () => { if (active) load(); };
  if (isWire) {
    $('wire-mode-select').onchange = event => setWireMode(event.target.value);
    $('select-all-wires').onclick=()=>batchWireSelection(); $('invert-wire-selection').onclick=()=>batchWireSelection(true);
    $('previous-wire-id').onclick=()=>navigateWire(-1); $('next-wire-id').onclick=()=>navigateWire(1);
    for (const id of ['wire-file-2', 'wire-file-3']) $(id).onchange = event => { preventDuplicateSelection(event.target); rememberWireChoices(event.target.id);load(); };
    $('compare-mode').onchange = () => { rememberWireChoices('compare-mode');setComparisonUI(); load({ preserveCamera: true }); };
    $('compare-count').onchange = () => { rememberWireChoices('compare-count');setComparisonUI(); load({ preserveCamera: true }); };
  }
  for (const id of ['color-mode', 'show-points', 'show-wire', 'show-grid', 'point-color', 'wire-color', 'rgb-r', 'rgb-g', 'rgb-b']) $(id).onchange = update;
  for (const id of ['point-size', 'point-opacity']) $(id).oninput = update;
  $('fit-view').onclick = () => viewers[0]?.fit(); $('zoom-in').onclick = () => viewers[0]?.zoomBy(1.2); $('zoom-out').onclick = () => viewers[0]?.zoomBy(1 / 1.2);
  for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => {
    viewers[0]?.setView(button.dataset.view);
    for (const other of document.querySelectorAll('[data-view]')) {
      other.classList.toggle('active', other === button); other.setAttribute('aria-pressed', String(other === button));
    }
  };

  document.addEventListener('keydown', event => {
    const direction=isWire?wireNavigationDirection(event,{multiple:wireMode==='multiple',flying:viewers.some(viewer=>viewer.fly?.active)}):0;
    if(direction){event.preventDefault();navigateWire(direction);return;}
    if (!['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName) && event.key.toLowerCase() === 'f') {
      event.preventDefault(); viewers[0]?.fit();
    }
  });
  try {
    initViewers();
    paletteControls = mountPaletteControls({container: $('palette-controls'), getOptions: () => options, onChange: update});
    cameraControls = mountCameraControls({container: $('camera-controls'), bookmarkContainer: $('bookmark-controls'), getViewers: () => viewers.slice(0, activeViewerCount()),
      space: 'raw-world', getScene: () => ({ids: isWire ? [...selectedWireEntries].map(entry=>entry.id) : [...selectedCloudEntries].map(entry => entry.id)}), pauseSync});
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
          const serial = ++resultSerial;let file = {name: result.name, size: cached.bytes(result.cloud), generatedCloud: result.cloud},entryId=`${result.name} #${serial}`;
          if(isMobileApp()){
            const id=new URL(location.href).searchParams.get('project'),path=`Processed/${Date.now()}-${serial}.ply`,writer=await nativeExportWriter(path.split('/').at(-1));
            try{await writePointExport([{name:result.name,cloud:result.cloud}],{format:'ply',sourceIds:false,write:writer.write});
            const record=await writer.commit(id,path);file=new NativeProjectFile(id,record);entryId=path;mobileKnownIds.push(entryId);}catch(error){await writer.abort().catch(()=>{});throw error;}
          }
          const entry = {id:entryId,key:`generated:${serial}`,file};
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
    mountViewerLayout({getViewers: () => viewers, pauseSync});
    if(!isWire)cloudColors=mountCloudColors({container:$('settings-panel-display'),getItems:()=>displayedItems,onChange:()=>{
      // Metadata-only: no parsing, GPU geometry upload, recentering or resampling.
      for(const viewer of viewers)for(const entry of viewer.activeClouds||[])entry.item.displayColor=entry.item.entry?.displayColor;
      pauseSync(()=>viewers.forEach(viewer=>viewer.render()));updateCloudSelection();
    }});
    if (isWire) mountPointDrop({zone: document.querySelector('.sidebar'), status: $('drop-status'), accepts: name => /\.(obj|zip)$/i.test(name) || pointExtension.test(name), onFiles: importRecords});
    clear(); update();
    if (!isWire && new URLSearchParams(location.search).get('generated') === '1') {
      genTakeHandoff().then(files => {
        const url = new URL(location.href);
        url.searchParams.delete('generated');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
        if (!files?.length) { error(t('没有找到刚生成的点云，请从点云生成页重新打开。')); return; }
        const list = files.map(item => new File([item.buffer], item.name, {type: 'application/octet-stream'}));
        const added = new Set(list);
        receiveCloudFiles(list, false);
        selectedCloudEntries.clear();
        for (const entry of entries) if (added.has(entry.file)) selectedCloudEntries.add(entry);
        if (selectedCloudEntries.size) applyCloudSelection();
        else error(t('没有找到刚生成的点云，请从点云生成页重新打开。'));
      }).catch(cause => error(cause.message || t('没有找到刚生成的点云，请从点云生成页重新打开。')));
    }
    mountMobileProject({receive:importRecords,getState:()=>({
      objectImportVersion:2,tree:{...snapshotProjectTree(pointProject,entries),knownIds:mobileKnownIds},selected:[...(isWire?selectedWireEntries:selectedCloudEntries)].map(e=>e.id),active:active?.id,cloudMode,wireMode,wirePreferences,
      inputs:captureMobileInputs(),wire:isWire?Object.fromEntries(['wire-file','wire-file-2','wire-file-3','cloud-file','compare-mode','compare-count'].map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value])):null,camera:(loaded.cloud||loaded.wire)?cameraControls?.capture():null,
    }),restoreState:async (state,records)=>{
      if(isWire)state=migrateObjectImportState(state,records,entries,'wire');
      mobileKnownIds=[...new Set([...(state?.tree?.knownIds||[]),...entries.map(e=>e.id)])];
      if(state){entries=restoreProjectTree(pointProject,entries,state.tree);cloudMode=state.cloudMode==='single'?'single':'multiple';
        const limit=state.inputs?.find(x=>x.id==='point-limit');if(limit)$('point-limit').value=limit.value;
        if(isWire){
          wireMode=state.wireMode==='multiple'?'multiple':'single';
          if(state.wirePreferences?.wires?.length===3)wirePreferences=normalizeWirePreferences(state.wirePreferences);
          selectedWireEntries.clear();
          const saved=wireMode==='multiple'?state.selected||[state.active]:[state.active];
          for(const id of saved){const entry=entries.find(e=>e.id===id);if(entry)selectedWireEntries.add(entry);}
          const entry=entries.find(e=>e.id===state.active); active=entry||[...selectedWireEntries].at(-1)||null;
          if(active){configureWireChoices(active);
            if(!state.wirePreferences){for(const [id,value] of Object.entries(state.wire||{})){if(!$(id))continue;if($(id).type==='checkbox')$(id).checked=Boolean(value);else $(id).value=String(value);}rememberWireChoices();}
            await applyWireSelection(active);
          }
        }else{
          selectedCloudEntries.clear();for(const id of state.selected||[]){const entry=entries.find(e=>e.id===id);if(entry)selectedCloudEntries.add(entry);}if(selectedCloudEntries.size)await loadCloudSelection();
        }
        restoreMobileInputs(state.inputs);update();if(state.camera&&(loaded.cloud||loaded.wire))cameraControls.restore(state.camera,{checkScene:false});
      }
      const handoff=new URL(location.href),batch=handoff.searchParams.get('studio');
      if(!isWire&&batch&&/^[a-z0-9]+$/.test(batch)){
        selectedCloudEntries.clear();for(const entry of entries)if(entry.file?.webkitRelativePath?.startsWith(`studio/${batch}/`))selectedCloudEntries.add(entry);
        cloudMode='multiple';if(selectedCloudEntries.size)await loadCloudSelection();
        handoff.searchParams.delete('studio');history.replaceState(null,'',handoff.pathname+handoff.search+handoff.hash);
      }
      list();$('source-note').textContent=t('项目自动保存在此设备');
    },onBackground:()=>{processingControls?.cancel();for(const [file] of cached.records)if(!cached.active.has(file))cached.forget(file);}}).then(session=>{mobileSession=session;});
  } catch (cause) { error(cause.message); }
})();
