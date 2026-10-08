import { CloudViewer } from './cloud-renderer.js';
import { readPointCloud, parseWireOBJ } from './point-io.js';
import { mergePointClouds } from './cloud-combine.js';

(() => {
  const $ = id => document.getElementById(id);
  const isWire = document.body.dataset.tool === 'wireframe';
  const pointExtension = /\.(xyz|txt|csv|pts|ply|pcd)$/i;
  const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });
  const pretty = value => Number(value).toLocaleString('zh-CN');
  const formatSize = value => value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`;
  const fieldLabel = name => /^column_\d+$/.test(name) ? `第 ${name.slice(7)} 列` : name;
  const compact = value => !Number.isFinite(value) ? '—' : Math.abs(value) > 10000 ? value.toPrecision(6) : Number(value.toPrecision(5)).toString();
  let entries = [], active = null, page = 0, revision = 0, overlay = null;
  let viewers = [], originals = new Map(), syncEnabled = false, syncGuard = false;
  let loaded = { cloud: null, wire: null }, loadedWires = [], selectedFiles = { cloud: null, wires: [] };
  let currentPointName = '', messages = [], loadController = null;
  const cached = new Map(), selectedCloudEntries = new Set();
  let options = { showPoints: true, showWire: isWire, pointSize: 2, pointOpacity: 1,
    colorMode: isWire ? 'solid' : 'height', pointColor: '#547d99', wireColor: '#e49b44', rgbFields: null, grid: true };

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
  function list() {
    const query = $('search').value.trim().toLowerCase();
    const filtered = entries.filter(entry => entry.id.toLowerCase().includes(query));
    const pages = Math.ceil(filtered.length / 50);
    page = Math.max(0, Math.min(page, Math.max(0, pages - 1)));
    $('filter-count').textContent = `${pretty(filtered.length)} ${isWire ? '个建筑 ID' : `个文件 · 已选 ${selectedCloudEntries.size}`}`;
    $('item-count').textContent = pretty(entries.length); $('page-info').textContent = pages ? `${page + 1} / ${pages}` : '0 / 0';
    $('previous-page').disabled = page === 0; $('next-page').disabled = page >= pages - 1;
    const fragment = document.createDocumentFragment();
    for (const entry of filtered.slice(page * 50, (page + 1) * 50)) {
      const button = document.createElement('button'); button.className = 'data-entry';
      const selected = isWire ? active?.id === entry.id : selectedCloudEntries.has(entry);
      button.setAttribute('aria-pressed', String(selected));
      if (!isWire) { button.setAttribute('role', 'checkbox'); button.setAttribute('aria-checked', String(selected)); }
      const title = document.createElement('strong'); title.textContent = isWire ? `# ${entry.id}` : entry.id;
      const detail = document.createElement('small');
      detail.textContent = isWire ? `${entry.wires.length} 个线框 · ${entry.clouds.length} 个点云` : formatSize(entry.file.size);
      button.append(title, detail); button.title = entry.id;
      button.onclick = () => isWire ? active?.id === entry.id ? clear() : choose(entry) : toggleCloud(entry); fragment.append(button);
    }
    if (!filtered.length) {
      const empty = document.createElement('p'); empty.className = 'empty-list';
      empty.textContent = entries.length ? '没有匹配的数据' : '先选择你的数据文件或文件夹'; fragment.append(empty);
    }
    $('data-list').replaceChildren(fragment);
    updateCloudSelection();
  }
  function fillWireSelect(select, files, index = null) {
    select.replaceChildren(); option(select, '', '不加载线框');
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
      $(id).replaceChildren(); option($(id), '', '未选择'); $(id).disabled = true;
    }
    $('attach-cloud').disabled = true;
    if (isWire) {
      for (const id of ['wire-file-2', 'wire-file-3']) {
        $(id).replaceChildren(); option($(id), '', '未选择'); $(id).disabled = true;
      }
      $('compare-mode').checked = false; $('compare-mode').disabled = true; $('compare-count').value = '2';
      $('compare-count').querySelector('option[value="3"]').disabled = false; setComparisonUI();
    }
  }
  function resetPanelLabels() {
    if (!isWire) return;
    for (let index = 1; index <= 3; index++) {
      $(`panel-label-${index}`).textContent = `线框 ${index}`; $(`panel-stats-${index}`).textContent = '—';
      $(`panel-empty-${index}`).hidden = true;
    }
  }
  function clear() {
    loadController?.abort(); loadController = null;
    selectedCloudEntries.clear();
    revision++; active = null; overlay = null; loaded = { cloud: null, wire: null }; loadedWires = [];
    selectedFiles = { cloud: null, wires: [] }; messages = []; currentPointName = ''; syncEnabled = false;
    pauseSync(() => viewers.forEach(viewer => viewer.setData({})));
    resetFileControls(); resetPanelLabels(); fields(); list(); error('');
    $('loading').hidden = true; $('screenshot').disabled = true; $('empty-state').hidden = false;
    $('current-title').textContent = '未选择数据'; $('scene-stats').textContent = '从左侧选择要查看的数据';
    $('geometry-note').textContent = '未选择数据时保持空白'; $('data-notes').textContent = ''; $('color-legend').hidden = true;
  }
  function receive(fileList, fromFolder) {
    const files = [...fileList]; if (!files.length) return;
    if (!isWire) { receiveCloudFiles(files, fromFolder); return; }
    clear(); cached.clear(); entries = []; page = 0; $('search').value = ''; list();
    $('source-note').textContent = '正在检查所选文件夹'; let next = [];
    if (isWire) {
      const groups = new Map();
      for (const file of files) {
        if (!/\.obj$/i.test(file.name) && !pointExtension.test(file.name)) continue;
        const parts = (file.webkitRelativePath || file.name).split('/');
        const id = parts.length > 2 ? parts.slice(1, -1).join('/') : parts.length === 2 ? parts[0] : '数据';
        if (!groups.has(id)) groups.set(id, { id, wires: [], clouds: [] });
        groups.get(id)[/\.obj$/i.test(file.name) ? 'wires' : 'clouds'].push(file);
      }
      next = [...groups.values()].filter(entry => entry.wires.length || entry.clouds.length);
      for (const entry of next) {
        entry.wires.sort((a, b) => natural(a.name, b.name)); entry.clouds.sort((a, b) => natural(a.name, b.name));
      }
    } else next = files.filter(file => pointExtension.test(file.name)).map(file => ({
      id: fromFolder ? file.webkitRelativePath.split('/').slice(1).join('/') || file.name : file.name, file,
    }));
    if (!next.length) {
      $('source-note').textContent = '所选目录没有支持的数据';
      error(isWire ? '未找到 OBJ 线框或支持的点云文件。请选择数据集根目录或某个建筑子目录。' : '未找到支持的点云。请选择 XYZ / TXT / CSV / PTS / PLY / PCD 文件。');
      return;
    }
    next.sort((a, b) => natural(a.id, b.id)); entries = next; list();
    const root = fromFolder ? files[0].webkitRelativePath.split('/')[0] || '所选文件夹' : '所选文件';
    $('source-note').textContent = `${root} · ${pretty(next.length)} ${isWire ? '个建筑' : '个点云'} · 点击列表后读取`;
  }
  function choose(entry) {
    active = entry; overlay = null; error('');
    if (isWire) {
      fillWireSelect($('wire-file'), entry.wires, entry.wires.length ? 0 : null);
      fillWireSelect($('wire-file-2'), entry.wires, entry.wires.length > 1 ? 1 : null);
      fillWireSelect($('wire-file-3'), entry.wires, entry.wires.length > 2 ? 2 : null);
      const cloudSelect = $('cloud-file'); cloudSelect.replaceChildren(); option(cloudSelect, '', '不加载点云');
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
  async function read(file, kind, { signal, onProgress, maxPoints = Number($('point-limit').value) } = {}) {
    if (!file) return null;
    const variant = `${kind}:${kind === 'cloud' ? maxPoints : ''}`;
    const fileCache = cached.get(file);
    if (fileCache?.has(variant)) return fileCache.get(variant);
    const parsed = kind === 'cloud'
      ? await readPointCloud(file, { maxPoints, signal, onProgress })
      : parseWireOBJ(await file.text(), file.name);
    if (signal?.aborted) throw new DOMException('已取消读取', 'AbortError');
    const variants = cached.get(file) || new Map();
    variants.set(variant, parsed);
    while (variants.size > 3) variants.delete(variants.keys().next().value);
    if (!cached.has(file)) cached.set(file, variants);
    while (cached.size > 10) cached.delete(cached.keys().next().value);
    return parsed;
  }
  function receiveCloudFiles(files, fromFolder) {
    const existing = new Set(entries.map(entry => entry.key));
    const names = new Set(entries.map(entry => entry.id));
    let added = 0;
    for (const file of files) {
      if (!pointExtension.test(file.name)) continue;
      const path = file.webkitRelativePath || file.name;
      const key = `${path}\0${file.size}\0${file.lastModified}`;
      if (existing.has(key)) continue;
      const base = fromFolder ? path.split('/').slice(1).join('/') || file.name : file.name;
      let id = base, suffix = 2;
      while (names.has(id)) id = `${base} (${suffix++})`;
      entries.push({id, key, file}); existing.add(key); names.add(id); added++;
    }
    entries.sort((a, b) => natural(a.id, b.id));
    page = 0; $('search').value = ''; list();
    $('source-note').textContent = `已列出 ${pretty(entries.length)} 个文件 · 勾选可叠加 · 可继续添加文件或文件夹`;
    error(!added && !files.some(file => pointExtension.test(file.name)) ? '未找到支持的点云。请选择 XYZ / TXT / CSV / PTS / PLY / PCD 文件。' : '');
  }
  function toggleCloud(entry) {
    if (selectedCloudEntries.has(entry)) selectedCloudEntries.delete(entry);
    else selectedCloudEntries.add(entry);
    if (!selectedCloudEntries.size) { clear(); return; }
    active = selectedCloudEntries.values().next().value;
    list(); load();
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
      title.title = source ? `${entry.id} · ${pretty(source.count)} / ${pretty(source.totalCount)} 点；色标对应“按文件”着色` : entry.id;
      const remove = document.createElement('button'); remove.textContent = '×'; remove.setAttribute('aria-label', `移除点云 ${entry.id}`);
      remove.onclick = () => toggleCloud(entry); chip.append(dot, title, remove); container.append(chip);
    }
  }
  async function loadCloudSelection({preserveCamera = false} = {}) {
    if (!selectedCloudEntries.size) { clear(); return; }
    loadController?.abort();
    const controller = new AbortController(); loadController = controller;
    const version = ++revision, selection = [...selectedCloudEntries];
    const maxPoints = Math.floor(Number($('point-limit').value) / selection.length);
    const snapshot = preserveCamera ? captureView() : null;
    syncEnabled = false;
    pauseSync(() => viewers.forEach(viewer => viewer.setData({})));
    loaded = {cloud: null, wire: null}; loadedWires = []; messages = [];
    $('loading').querySelector('span').textContent = '正在读取文件…';
    $('loading').hidden = false; $('empty-state').hidden = true; $('screenshot').disabled = true; error('');
    $('current-title').textContent = selection.length === 1 ? selection[0].id : `${selection.length} 个点云叠加`;
    $('scene-stats').textContent = '正在读取所选文件…'; $('data-notes').textContent = ''; $('color-legend').hidden = true;
    const items = [], failures = [];
    try {
      if (maxPoints < 1) throw Error('所选文件数量超过总显示点数上限，请减少选择或提高上限。');
      // Read sequentially and divide the display budget across selected files.
      for (const [index, entry] of selection.entries()) {
        if (version !== revision) return;
        $('scene-stats').textContent = `读取文件 ${index + 1} / ${selection.length} · ${entry.id}`;
        try {
          const cloud = await read(entry.file, 'cloud', {maxPoints, signal: controller.signal, onProgress({phase, loaded, total}) {
            if (version !== revision) return;
            const message = `${phase === 'count' ? '统计点数' : '解析点云'} ${Math.floor(loaded / total * 100)}%`;
            $('loading').querySelector('span').textContent = `${index + 1} / ${selection.length} · ${message}`;
            $('scene-stats').textContent = `${entry.id} · ${message} · ${formatSize(loaded)} / ${formatSize(total)}`;
          }});
          items.push({name: entry.id, cloud});
        } catch (cause) {
          if (version !== revision) return;
          failures.push(`${entry.id}：${cause.message}`);
        }
      }
      if (version !== revision) return;
      loaded.cloud = mergePointClouds(items);
      selectedFiles = {cloud: null, wires: [], clouds: items.map(item => item.name)};
      currentPointName = items.map(item => item.name).join(' + ');
      messages = [...(loaded.cloud?.notes || [])];
      if (selection.length > 1) messages.push(`总显示上限在 ${selection.length} 个所选文件间均分，每个最多 ${pretty(maxPoints)} 点；全部原始点的坐标范围仍保留。`);
      initViewers(); fields(); viewers[0].setData({cloud: loaded.cloud});
      if (snapshot) restoreView(snapshot, viewers[0]);
      update(); updateCloudSelection();
      $('scene-stats').textContent = loaded.cloud
        ? `${items.length} / ${selection.length} 个文件 · ${pretty(loaded.cloud.count)} / ${pretty(loaded.cloud.totalCount)} 点`
        : '未加载可显示的数据';
      $('geometry-note').textContent = items.length > 1 ? `${items.length} 个点云按原始 XYZ 坐标叠加` : currentPointName || '未加载数据';
      $('empty-state').hidden = Boolean(loaded.cloud); $('screenshot').disabled = !loaded.cloud;
      if (failures.length) error(failures.join('；'));
    } catch (cause) { if (version === revision) error(`显示失败：${cause.message}`); }
    finally { if (version === revision) { $('loading').hidden = true; loadController = null; } }
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
      $(`panel-label-${index + 1}`).textContent = file?.name || '未加载线框';
      $(`panel-stats-${index + 1}`).textContent = wire ? `${pretty(wire.edges.length)} 条线` : '—';
      $(`panel-empty-${index + 1}`).hidden = !(index < count && file && wire && wire.edges.length === 0);
    }
  }
  async function load({ preserveCamera = false } = {}) {
    if (!isWire) return loadCloudSelection({ preserveCamera });
    if (!active) { clear(); return; }
    loadController?.abort();
    const controller = new AbortController(); loadController = controller;
    const version = ++revision, entry = active, files = selectFiles();
    const viewSnapshot = preserveCamera ? captureView() : null; syncEnabled = false;
    if (!preserveCamera) pauseSync(() => viewers.forEach(viewer => viewer.setData({})));
    $('loading').querySelector('span').textContent = '正在读取文件…';
    $('loading').hidden = false; $('empty-state').hidden = true; $('screenshot').disabled = true; error('');
    $('current-title').textContent = isWire ? `建筑 ${entry.id}` : entry.id; $('scene-stats').textContent = '正在读取所选文件…';
    $('data-notes').textContent = ''; $('color-legend').hidden = true;
    const onProgress = ({ phase, loaded, total }) => {
      if (version !== revision) return;
      const label = phase === 'count' ? '统计点数' : '解析点云';
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
    loaded.cloud = resultValue(results[0], '点云');
    loadedWires = results.slice(1).map((result, index) => resultValue(result, `线框 ${index + 1}`));
    loaded.wire = loadedWires[0] || null; selectedFiles = files; currentPointName = files.cloud?.name || '';
    messages = [...(loaded.cloud?.notes || [])];
    try {
      initViewers(); fields();
      const count = activeViewerCount();
      const sharedBounds = count > 1 ? unionBounds([loaded.cloud?.bounds, ...loadedWires.map(wire => wire?.bounds)]) : null;
      const commonOrigin = sharedBounds ? sharedBounds[0].map((value, axis) => value + (sharedBounds[1][axis] - value) / 2) : null;
      pauseSync(() => viewers.forEach((viewer, index) => {
        if (index < count) viewer.setData({ cloud: loaded.cloud, wire: loadedWires[index] || null, bounds: sharedBounds, origin: commonOrigin });
        else viewer.setData({});
      }));
      if (viewSnapshot) viewers.slice(0, count).forEach(viewer => restoreView(viewSnapshot, viewer));
      syncEnabled = count > 1; update(); updatePanelDetails(files);
      const counts = [];
      loadedWires.forEach((wire, index) => { if (files.wires[index] && wire) counts.push(`${files.wires[index].name}：${pretty(wire.edges.length)} 条线`); });
      if (loaded.cloud) counts.push(`${pretty(loaded.cloud.count)} / ${pretty(loaded.cloud.totalCount)} 点`);
      $('scene-stats').textContent = counts.length ? counts.join(' · ') : '未加载可显示的数据';
      $('geometry-note').textContent = count > 1
        ? `${count} 个线框共享原点、边界与相机${loaded.cloud ? ` · ${currentPointName}` : ' · 未加载点云'}`
        : files.wires[0] && loadedWires[0] ? `${files.wires[0].name}${loaded.cloud ? ` + ${currentPointName}` : ''}` : loaded.cloud ? currentPointName : '未加载数据';
      const hasLoaded = Boolean(loaded.cloud || loadedWires.some(Boolean));
      $('empty-state').hidden = hasLoaded; $('screenshot').disabled = !hasLoaded;
      if (failures.length) error(failures.join('；'));
    } catch (cause) { error(`显示失败：${cause.message}`); }
    finally { if (version === revision) { $('loading').hidden = true; loadController = null; } }
  }
  function fields() {
    const cloud = loaded.cloud, keys = Object.keys(cloud?.fields || {}), color = $('color-mode'), old = color.value;
    color.replaceChildren(); option(color, 'height', '高度 Z'); option(color, 'solid', '单色');
    if (cloud?.sources?.length) option(color, 'file', '按文件');
    if (cloud?.rgb) option(color, 'rgb', '原始 RGB'); if (keys.length >= 3) option(color, 'custom-rgb', '指定 RGB 列…');
    keys.filter(key => !['x', 'y', 'z', 'rgb', 'rgba'].includes(key.toLowerCase())).forEach(key => option(color, `field:${key}`, fieldLabel(key)));
    color.value = [...color.options].some(item => item.value === old) ? old : 'height';
    const extra = keys.filter(key => !['x', 'y', 'z'].includes(key.toLowerCase()));
    ['rgb-r', 'rgb-g', 'rgb-b'].forEach((id, index) => {
      const select = $(id), previous = select.value; select.replaceChildren(); keys.forEach(key => option(select, key, fieldLabel(key)));
      select.value = keys.includes(previous) ? previous : extra[index] || keys[index] || '';
    });
    $('rgb-fields').hidden = color.value !== 'custom-rgb';
  }
  function update() {
    const color = $('color-mode').value;
    options = { ...options, showPoints: $('show-points').checked, showWire: isWire && $('show-wire').checked,
      grid: $('show-grid').checked, pointSize: Number($('point-size').value), pointOpacity: Number($('point-opacity').value),
      wireColor: $('wire-color').value, colorMode: color === 'custom-rgb' ? 'rgb' : color,
      rgbFields: color === 'custom-rgb' ? ['rgb-r', 'rgb-g', 'rgb-b'].map(id => $(id).value) : null };
    $('rgb-fields').hidden = color !== 'custom-rgb'; $('point-size-value').value = String(options.pointSize);
    $('point-opacity-value').value = `${Math.round(options.pointOpacity * 100)}%`;
    pauseSync(() => viewers.forEach(viewer => viewer.setOptions(options))); viewers[0]?.render();
    const state = viewers[0]?.getState(), range = state?.colorRange;
    $('color-legend').hidden = !(loaded.cloud && options.showPoints && range);
    $('color-name').textContent = $('color-mode').selectedOptions[0]?.textContent || '';
    $('color-min').textContent = compact(range?.min); $('color-max').textContent = compact(range?.max);
    const notes = messages.slice(); if (state?.colorFallback) notes.push(state.colorFallback); $('data-notes').textContent = notes.join(' ');
  }
  function preventDuplicateSelection(changed) {
    if (!isWire || !$('compare-mode').checked || changed.value === '') return;
    const selects = [$('wire-file'), $('wire-file-2'), $('wire-file-3')].slice(0, activeViewerCount());
    const others = new Set(selects.filter(select => select !== changed).map(select => select.value).filter(Boolean));
    if (!others.has(changed.value)) return;
    const replacement = [...changed.options].find(item => item.value && !others.has(item.value));
    changed.value = replacement?.value || ''; error('并排对比需要选择不同的线框文件，已自动改为其他可用文件。');
  }
  function exportScreenshot() {
    if (!viewers[0] || !active) return;
    const screenshotId = isWire ? active.id : (loaded.cloud?.sources || []).map(source => source.name).join(' + ');
    const screenshotCloud = loaded.cloud, screenshotSourceCount = loaded.cloud?.sources?.length || 0;
    const screenshotWires = loadedWires.slice();
    const screenshotFiles = selectedFiles.wires.slice();
    const count = activeViewerCount(), activeViewers = viewers.slice(0, count); activeViewers[0].render();
    const source = activeViewers[0].canvas;
    if (!(source.width > 0 && source.height > 0)) return error('当前画布尺寸无效，无法保存截图。');
    const panelWidth = Math.min(count === 1 ? 1100 : 720, source.width);
    const panelHeight = Math.max(1, Math.round(panelWidth * source.height / source.width));
    const heading = 42, footer = 50, output = document.createElement('canvas');
    output.width = panelWidth * count; output.height = heading + panelHeight + footer;
    const context = output.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, output.width, output.height);
    const pointText = screenshotCloud ? `${pretty(screenshotCloud.count)} / ${pretty(screenshotCloud.totalCount)} 点` : '未加载点云';
    const fitText = (text, width) => {
      let value = String(text); while (value.length > 4 && context.measureText(value).width > width) value = `${value.slice(0, -2)}…`; return value;
    };
    activeViewers.forEach((viewer, index) => {
      const x = index * panelWidth, wire = screenshotWires[index] || null;
      const label = isWire ? screenshotFiles[index]?.name || '未加载线框' : screenshotId;
      context.fillStyle = '#193047'; context.font = 'bold 17px sans-serif'; context.fillText(fitText(label, panelWidth - 28), x + 14, 27);
      context.drawImage(viewer.canvas, x, heading, panelWidth, panelHeight);
      context.fillStyle = '#f4f7f6'; context.fillRect(x, heading + panelHeight, panelWidth, footer);
      context.fillStyle = '#526b72'; context.font = '13px sans-serif';
      const lineText = isWire ? wire ? `${pretty(wire.edges.length)} 条线${wire.edges.length ? '' : ' · 空线框'}` : '未加载线框' : '点云';
      context.fillText(fitText(`${lineText} · ${pointText}`, panelWidth - 28), x + 14, heading + panelHeight + 30);
    });
    output.toBlob(blob => {
      if (!blob) return error('浏览器无法生成截图。');
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
      const downloadId = !isWire && screenshotSourceCount > 1 ? `${screenshotSourceCount}_files` : screenshotId;
      link.download = `${isWire ? 'wireframe' : 'pointcloud'}_${downloadId.replace(/[^a-zA-Z0-9_.-]/g, '_')}.png`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  }

  $('choose-folder').onclick = () => $('folder-input').click();
  $('folder-input').onchange = event => { receive(event.target.files, true); event.target.value = ''; };
  $('choose-file').onclick = () => $('file-input').click();
  $('file-input').onchange = event => { receive(event.target.files, false); event.target.value = ''; };
  $('attach-cloud').onclick = () => $('overlay-input').click();
  $('overlay-input').onchange = event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file || !active) return;
    if (!pointExtension.test(file.name)) { error('请选择支持的点云文件'); return; }
    overlay = file; const select = $('cloud-file'); select.querySelector('option[value="overlay"]')?.remove();
    option(select, 'overlay', `${file.name}（另选）`); select.disabled = false; select.value = 'overlay'; load();
  };
  $('search').oninput = () => { page = 0; list(); };
  $('previous-page').onclick = () => { page--; list(); $('data-list').scrollTop = 0; };
  $('next-page').onclick = () => { page++; list(); $('data-list').scrollTop = 0; };
  $('clear-selection').onclick = clear; $('dismiss-error').onclick = () => error('');
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
  try { initViewers(); clear(); } catch (cause) { error(cause.message); }
})();
