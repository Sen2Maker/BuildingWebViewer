/** Shared orthographic camera snapshots and an optional, local-only control panel. */
const CAMERA_FORMAT = 'BuildingWebViewer.camera';
const CAMERA_BOOK_FORMAT = 'BuildingWebViewer.camera-bookmarks';
const CAMERA_SPACES = ['raw-world', 'lod-arrangement'];
const CAMERA_MAX_BOOKMARKS = 100;

function cameraObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function cameraFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error(`${label}必须是有限数值`);
  return value;
}
function cameraVector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) throw Error(`${label}需要 ${length} 个数值`);
  return value.map(number => cameraFinite(number, label));
}
function cameraSpace(space) {
  if (!CAMERA_SPACES.includes(space)) throw Error('相机坐标空间无效');
  return space;
}
function cameraScene(scene, space) {
  if (scene == null && space === 'raw-world') return null;
  if (!cameraObject(scene) || !Array.isArray(scene.ids) || scene.ids.length > 10000 || scene.ids.some(id => typeof id !== 'string' || id.length > 1024)) throw Error('相机场景需要有效的文件或楼栋 ID 列表');
  const result = {ids: [...scene.ids]};
  if (space === 'lod-arrangement') {
    if (!['real', 'normalized'].includes(scene.scale)) throw Error('LOD 相机需要记录实际比例或统一大小模式');
    result.scale = scene.scale;
  }
  return result;
}
function cameraSameScene(a, b) {
  return a?.scale === b?.scale && a?.ids?.length === b?.ids?.length && a.ids.every((id, index) => id === b.ids[index]);
}

/** Validate before mutating a viewer; snapshots use original-world or synthetic-layout targets. */
export function validateCameraSnapshot(value, {space = value?.space, scene = null, checkScene = true} = {}) {
  cameraSpace(space);
  if (!cameraObject(value) || value.format !== CAMERA_FORMAT || value.version !== 1) throw Error('不是受支持的相机 JSON（需要 BuildingWebViewer.camera v1）');
  if (value.space !== space) throw Error('相机坐标空间不匹配：点云/线框视角与 LOD 排列视角不能直接互用');
  if (value.projection !== 'orthographic') throw Error('当前查看器仅支持正交相机');
  const source = value.camera;
  if (!cameraObject(source)) throw Error('相机参数缺失');
  const azimuth = cameraFinite(source.azimuth, '方位角'), elevation = cameraFinite(source.elevation, '仰角');
  const zoom = cameraFinite(source.zoom, '缩放倍率'), baseHeight = cameraFinite(source.baseHeight, '基准视野高度');
  const limits = space === 'lod-arrangement' ? {minElevation: 0, minZoom: .15, maxZoom: 30} : {minElevation: -89, minZoom: .02, maxZoom: 100};
  if (Math.abs(azimuth) > 1e6) throw Error('方位角数值过大');
  if (elevation < limits.minElevation || elevation > 90) throw Error(`仰角需在 ${limits.minElevation}° 至 90° 之间`);
  if (zoom < limits.minZoom || zoom > limits.maxZoom) throw Error(`缩放倍率需在 ${limits.minZoom} 至 ${limits.maxZoom} 之间`);
  if (!(baseHeight > 0) || !Number.isFinite(baseHeight / zoom)) throw Error('基准视野高度必须为有效正数');
  const savedScene = cameraScene(value.scene, space);
  if (space === 'lod-arrangement' && checkScene && !cameraSameScene(savedScene, cameraScene(scene, space))) throw Error(`LOD 布局不匹配：此书签需要楼栋 ${savedScene.ids.join(', ').slice(0, 160) || '（空）'}，比例模式为${savedScene.scale === 'real' ? '实际比例' : '统一展示大小'}。请先恢复该布局再加载。`);
  return {format: CAMERA_FORMAT, version: 1, space, projection: 'orthographic',
    camera: {azimuth: ((azimuth + 180) % 360 + 360) % 360 - 180, elevation, zoom,
      pan: cameraVector(source.pan, 2, '平移'), target: cameraVector(source.target, 3, '目标点'), baseHeight}, scene: savedScene};
}

export function captureCameraSnapshot(viewer, {space, scene = null} = {}) {
  cameraSpace(space);
  if (!viewer?.camera) throw Error('相机尚未准备好');
  const origin = space === 'raw-world' ? cameraVector(viewer.origin || [0, 0, 0], 3, '原点') : [0, 0, 0];
  const target = cameraVector(viewer.target, 3, '目标点').map((value, axis) => value + origin[axis]);
  return validateCameraSnapshot({format: CAMERA_FORMAT, version: 1, space, projection: 'orthographic', scene,
    camera: {...viewer.camera, pan: [...viewer.camera.pan], target, baseHeight: viewer.baseHeight}}, {space, scene, checkScene: false});
}

export function applyCameraSnapshot(viewers, snapshot, {space = snapshot?.space, scene = null, checkScene = true, pauseSync = callback => callback()} = {}) {
  const value = validateCameraSnapshot(snapshot, {space, scene, checkScene});
  if (!Array.isArray(viewers) || !viewers.length || viewers.some(viewer => !viewer?.camera || typeof viewer.render !== 'function')) throw Error('请先加载数据，再应用相机');
  // Validate every new local target first, so a bad panel cannot leave a partial update.
  const targets = viewers.map(viewer => {
    const origin = space === 'raw-world' ? cameraVector(viewer.origin || [0, 0, 0], 3, '原点') : [0, 0, 0];
    return value.camera.target.map((number, axis) => cameraFinite(number - origin[axis], '局部目标点'));
  });
  pauseSync(() => {
    viewers.forEach((viewer, index) => {
      viewer.camera = {azimuth: value.camera.azimuth, elevation: value.camera.elevation, zoom: value.camera.zoom, pan: [...value.camera.pan]};
      viewer.target = targets[index]; viewer.baseHeight = value.camera.baseHeight;
    });
    viewers.forEach(viewer => viewer.render());
  });
  return value;
}

function cameraBookmark(record, space, index) {
  if (!cameraObject(record) || typeof record.name !== 'string' || !record.name.trim() || record.name.length > 80) throw Error('书签名称需为 1–80 个字符');
  return {id: typeof record.id === 'string' && record.id.trim() && record.id.length <= 128 ? record.id : `import-${index}`,
    name: record.name.trim(), snapshot: validateCameraSnapshot(record.snapshot, {space, checkScene: false}),
    ...(typeof record.updatedAt === 'string' && record.updatedAt.length <= 64 && Number.isFinite(Date.parse(record.updatedAt)) ? {updatedAt: record.updatedAt} : {})};
}

export function parseCameraBookmarks(input, space) {
  cameraSpace(space);
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  if (value?.format === CAMERA_FORMAT) return {preserveView: true, bookmarks: [{id: 'import-0', name: '导入视角', snapshot: validateCameraSnapshot(value, {space, checkScene: false})}]};
  if (!cameraObject(value) || value.format !== CAMERA_BOOK_FORMAT || value.version !== 1 || value.space !== space || !Array.isArray(value.bookmarks) || value.bookmarks.length > CAMERA_MAX_BOOKMARKS) throw Error('书签 JSON 格式或坐标空间无效（最多 100 个书签）');
  const bookmarks = value.bookmarks.map((record, index) => cameraBookmark(record, space, index));
  if (new Set(bookmarks.map(record => record.id)).size !== bookmarks.length) throw Error('书签 ID 重复');
  return {preserveView: value.preserveView !== false, bookmarks};
}

export function serializeCameraBookmarks(bookmarks, space, preserveView = true) {
  const value = {format: CAMERA_BOOK_FORMAT, version: 1, space: cameraSpace(space), preserveView: Boolean(preserveView), bookmarks};
  parseCameraBookmarks(value, space);
  return JSON.stringify(value, null, 2);
}

/**
 * Returns {preserveView, capture, restore, refresh, destroy}.
 * Pass a separate bookmarkContainer to mount camera and bookmarks in two tabs.
 * restore(saved, {checkScene:false}) preserves a view after changing data;
 * bookmark loads retain strict LOD scene checking.
 */
export function mountCameraControls({container, bookmarkContainer = null, getViewers, space, getScene = () => null, pauseSync = callback => callback()} = {}) {
  cameraSpace(space);
  if (!container || typeof getViewers !== 'function') throw Error('相机面板需要挂载容器和 getViewers');
  const doc = container.ownerDocument, win = doc.defaultView || globalThis;
  const separateBookmarks = bookmarkContainer && bookmarkContainer !== container;
  const key = `BuildingWebViewer.camera-bookmarks.v1.${space}`;
  const limits = space === 'lod-arrangement' ? {minElevation: 0, minZoom: .15, maxZoom: 30} : {minElevation: -89, minZoom: .02, maxZoom: 100};
  const watches = new Map(), inputs = new Map(), sliders = new Map(), dragging = new Set();
  let bookmarks = [], preserveView = true, selectedBookmark = '', disposed = false, frame = null, idCounter = 0;
  const pendingBookmarks = new Map();
  let pendingPreserve = null;
  const el = (tag, text, className) => { const node = doc.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const panel = el(separateBookmarks ? 'section' : 'details', undefined, `camera-controls${separateBookmarks ? ' camera-controls-docked' : ''}`);
  const body = el('div', undefined, 'camera-controls-body'), status = el('p', '', 'camera-controls-status'); status.setAttribute('role', 'status');
  if (!separateBookmarks) panel.append(el('summary', '精确相机与视角书签'));
  panel.append(body); container.replaceChildren(panel);
  const bookPanel = el('section', undefined, 'camera-bookmarks');
  if (separateBookmarks) bookmarkContainer.replaceChildren(bookPanel);
  const bookStatus = separateBookmarks ? el('p', '', 'camera-controls-status') : status;
  bookStatus.setAttribute('role', 'status');
  const message = (text = '', error = false) => {
    for (const node of new Set([status, bookStatus])) { node.textContent = text; node.classList.toggle('camera-controls-error', error); }
  };
  const attempt = callback => { try { return callback(); } catch (error) { message(error.message || String(error), true); return null; } };
  const controls = [], bar = el('div', undefined, 'camera-controls-bar'), preserveLabel = el('label', undefined, 'camera-preserve');
  const preserveInput = el('input'); preserveInput.type = 'checkbox'; preserveInput.checked = true;
  preserveInput.setAttribute('aria-label', '增删文件时保持当前视角');
  preserveLabel.append(preserveInput, doc.createTextNode('增删文件时保持当前视角'));
  const heightLabel = el('span', '', 'camera-view-height'); bar.append(preserveLabel, heightLabel); body.append(bar);
  const grid = el('div', undefined, 'camera-controls-grid'); body.append(grid);
  const advanced = el('details', undefined, 'camera-advanced'), advancedGrid = el('div', undefined, 'camera-controls-grid');
  advanced.append(el('summary', '高级：平移与目标点'), advancedGrid); body.append(advanced);
  const specifications = [
    ['azimuth', '方位角（°）', .1], ['elevation', '仰角（°）', .1], ['zoom', '缩放倍率', .05],
    ['pan0', '水平平移', .1], ['pan1', '垂直平移', .1],
    ['target0', space === 'raw-world' ? '世界目标 X' : '排列目标 X', .1],
    ['target1', space === 'raw-world' ? '世界目标 Y' : '排列目标 Y', .1],
    ['target2', space === 'raw-world' ? '世界目标 Z' : '排列目标 Z', .1],
  ];
  const uiScene = () => getScene() || (space === 'lod-arrangement' ? {ids: [], scale: 'real'} : null);
  const available = () => {
    const viewer = getViewers()?.[0];
    return Boolean(viewer && (space === 'lod-arrangement' ? viewer.models?.length || uiScene()?.ids?.length : viewer.bounds));
  };
  function capture() { return available() ? captureCameraSnapshot(getViewers()[0], {space, scene: uiScene()}) : null; }
  function restore(snapshot, {checkScene = true} = {}) {
    if (!snapshot) return null;
    if (!available()) throw Error('请先加载数据，再应用相机');
    const value = applyCameraSnapshot(getViewers(), snapshot, {space, scene: uiScene(), checkScene, pauseSync});
    message('视角已应用。'); refresh(); return value;
  }
  function inputValue(snapshot, name) {
    return name.startsWith('pan') ? snapshot.camera.pan[Number(name.slice(3))] : name.startsWith('target') ? snapshot.camera.target[Number(name.slice(6))] : snapshot.camera[name];
  }
  function displayNumber(value, name) { return name.startsWith('target') ? String(value) : String(Number(value.toPrecision(12))); }
  function snapshotWithInput(name, raw) {
    const snapshot = capture(); if (!snapshot) throw Error('请先加载数据，再调整相机');
    if (!String(raw).trim()) throw Error('相机参数不能为空');
    const value = Number(raw);
    if (name.startsWith('pan')) snapshot.camera.pan[Number(name.slice(3))] = value;
    else if (name.startsWith('target')) snapshot.camera.target[Number(name.slice(6))] = value;
    else snapshot.camera[name] = value;
    return validateCameraSnapshot(snapshot, {space, scene: uiScene()});
  }
  function applyInput(name, raw) { restore(snapshotWithInput(name, raw)); message(''); }
  function sliderPosition(name, value, slider) {
    if (name === 'zoom') return Math.max(0, Math.min(1000, 1000 * Math.log(value / limits.minZoom) / Math.log(limits.maxZoom / limits.minZoom)));
    // +180 and -180 are identical; keep the right endpoint stable while dragging.
    if (name === 'azimuth' && value === -180 && Number(slider.value) === 180) return 180;
    return value;
  }
  function sliderNumber(name, raw) {
    const value = Number(raw), slider = sliders.get(name);
    if (!String(raw).trim() || !Number.isFinite(value) || value < Number(slider.min) || value > Number(slider.max)) throw Error('滑块数值超出范围');
    if (name !== 'zoom') return value;
    if (value === 0) return limits.minZoom;
    if (value === 1000) return limits.maxZoom;
    return limits.minZoom * Math.exp(value / 1000 * Math.log(limits.maxZoom / limits.minZoom));
  }
  for (const [name, label, step] of specifications) {
    const basic = ['azimuth', 'elevation', 'zoom'].includes(name);
    const group = el('div', undefined, `camera-number-field${basic ? ' camera-slider-field' : ''}`), caption = el('span', label), row = el('span', undefined, 'camera-number-row');
    const minus = el('button', '−'), input = el('input'), plus = el('button', '+');
    for (const button of [minus, plus]) { button.type = 'button'; button.setAttribute('aria-label', `${button === minus ? '减小' : '增大'}${label}`); }
    input.type = 'number'; input.step = String(step); input.setAttribute('aria-label', label); input.autocomplete = 'off';
    if (name === 'elevation') { input.min = String(limits.minElevation); input.max = '90'; }
    if (name === 'zoom') { input.min = String(limits.minZoom); input.max = String(limits.maxZoom); }
    input.addEventListener('input', () => {
      // Partial edits must leave the current camera intact; change reports errors.
      let snapshot; try { snapshot = snapshotWithInput(name, input.value); } catch { return; }
      attempt(() => { restore(snapshot); message(''); });
    });
    input.addEventListener('change', () => attempt(() => applyInput(name, input.value)));
    input.addEventListener('blur', scheduleRefresh);
    for (const [button, direction] of [[minus, -1], [plus, 1]]) button.addEventListener('click', event => {
      event.preventDefault(); attempt(() => {
        const snapshot = capture(); if (!snapshot) throw Error('请先加载数据，再调整相机');
        applyInput(name, Number((inputValue(snapshot, name) + direction * step).toPrecision(15)));
      });
    });
    row.append(minus, input, plus); group.append(caption, row);
    if (basic) {
      const slider = el('input', undefined, 'camera-slider'); slider.type = 'range';
      slider.min = String(name === 'zoom' ? 0 : name === 'azimuth' ? -180 : limits.minElevation);
      slider.max = String(name === 'zoom' ? 1000 : name === 'azimuth' ? 180 : 90);
      slider.step = name === 'zoom' ? '1' : '.1'; slider.setAttribute('aria-label', `${label}滑块`);
      slider.addEventListener('pointerdown', () => dragging.add(name));
      const finish = () => { dragging.delete(name); scheduleRefresh(); };
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'change', 'blur']) slider.addEventListener(event, finish);
      slider.addEventListener('input', () => attempt(() => applyInput(name, sliderNumber(name, slider.value))));
      const endpoints = el('div', undefined, 'camera-slider-endpoints');
      endpoints.append(el('span', name === 'zoom' ? `${limits.minZoom}×` : `${slider.min}°`), el('span', name === 'zoom' ? `${limits.maxZoom}×` : `${slider.max}°`));
      group.append(slider, endpoints); sliders.set(name, slider); controls.push(slider);
    }
    (basic ? grid : advancedGrid).append(group); inputs.set(name, input); controls.push(minus, input, plus);
  }
  const help = el('p', space === 'raw-world'
    ? '平移按屏幕水平/垂直方向，单位与原坐标一致。目标点保留原始坐标精度。'
    : '目标点使用 LOD 排列坐标；书签适用于相同楼栋顺序和比例模式。', 'camera-controls-help');
  advanced.append(help);
  body.append(el('p', '拖动滑块可连续调整；数字输入与鼠标操作实时同步。缩放滑块采用对数刻度。', 'camera-controls-help'), status);
  // In the combined legacy layout bookmarks follow the camera, not precede it.
  if (!separateBookmarks) body.append(bookPanel);
  const bookHeading = el('div', undefined, 'camera-bookmark-heading'), bookCount = el('span', '', 'camera-bookmark-count');
  bookCount.setAttribute('aria-label', '已保存书签数量'); bookHeading.append(el('strong', '本机视角书签'), bookCount);
  const storageHelp = el('p', '保存在此浏览器，下次打开仍可使用。可导出 JSON 备份或转移到其他浏览器。', 'camera-bookmark-storage');
  const bookmarkName = el('input'), bookmarkSelect = el('select');
  bookmarkName.type = 'text'; bookmarkName.maxLength = 80; bookmarkName.placeholder = '输入视角名称'; bookmarkName.setAttribute('aria-label', '视角书签名称');
  bookmarkSelect.size = 5; bookmarkSelect.setAttribute('aria-label', '已保存视角');
  const bookmarkMeta = el('p', '', 'camera-bookmark-meta'); bookmarkMeta.setAttribute('aria-label', '选中书签信息');
  bookPanel.append(bookHeading, storageHelp, bookmarkSelect, bookmarkMeta, bookmarkName);
  const actions = el('div', undefined, 'camera-bookmark-actions');
  const action = text => { const button = el('button', text); button.type = 'button'; actions.append(button); return button; };
  const saveButton = action('保存新书签'), loadButton = action('加载所选'), updateButton = action('更新视角'), renameButton = action('重命名'), deleteButton = action('删除所选');
  const files = el('div', undefined, 'camera-bookmark-files');
  const exportButton = el('button', '导出 JSON'), importButton = el('button', '导入 JSON');
  exportButton.type = importButton.type = 'button'; files.append(exportButton, importButton);
  const importInput = el('input'); importInput.type = 'file'; importInput.accept = '.json,application/json'; importInput.hidden = true;
  bookPanel.append(actions, files, importInput); if (separateBookmarks) bookPanel.append(bookStatus);
  function storageUnavailable() {
    storageHelp.textContent = '当前浏览器无法持久保存；本次书签仍可使用，请导出 JSON 备份。';
    message(storageHelp.textContent, true);
  }
  function syncStored({notifyDeleted = true} = {}) {
    try {
      const stored = win.localStorage.getItem(key);
      const latest = stored ? parseCameraBookmarks(stored, space) : {bookmarks: [], preserveView: true};
      // Rebase only unsaved local edits, never this panel's entire cached array.
      const merged = new Map(latest.bookmarks.map(bookmark => [bookmark.id, bookmark]));
      for (const [id, bookmark] of pendingBookmarks) { if (bookmark) merged.set(id, bookmark); else merged.delete(id); }
      bookmarks = [...merged.values()];
      preserveView = pendingPreserve ?? latest.preserveView; preserveInput.checked = preserveView;
      const deleted = selectedBookmark && !merged.has(selectedBookmark);
      updateBookmarks();
      // Keep the name input untouched: it may contain an unfinished draft.
      if (deleted && notifyDeleted) message('所选书签已在另一页面删除，请重新选择；当前视角未改变。', true);
      return true;
    } catch { storageUnavailable(); return false; }
  }
  function persist() {
    // Read again at the write boundary, including after asynchronous imports.
    // When reading fails, do not overwrite records we cannot safely reconcile.
    if (!syncStored()) return false;
    try {
      win.localStorage.setItem(key, serializeCameraBookmarks(bookmarks, space, preserveView));
      pendingBookmarks.clear(); pendingPreserve = null;
      storageHelp.textContent = '保存在此浏览器，下次打开仍可使用。可导出 JSON 备份或转移到其他浏览器。'; return true;
    } catch { storageUnavailable(); return false; }
  }
  function updateBookmarks() {
    bookmarkSelect.replaceChildren();
    if (!bookmarks.length) { const empty = el('option', '暂无书签'); empty.value = ''; bookmarkSelect.append(empty); }
    for (const bookmark of bookmarks) { const option = el('option', bookmark.name); option.value = bookmark.id; bookmarkSelect.append(option); }
    const selected = bookmarks.find(bookmark => bookmark.id === selectedBookmark);
    if (!selected) selectedBookmark = '';
    bookmarkSelect.value = selectedBookmark;
    bookCount.textContent = `${bookmarks.length} / ${CAMERA_MAX_BOOKMARKS}`;
    bookmarkMeta.textContent = selected ? `${selected.name}\n更新：${selected.updatedAt ? new Date(selected.updatedAt).toLocaleString('zh-CN', {hour12: false}) : '未记录（旧版书签）'}` : '选择书签后可加载、更新、重命名或删除。';
    loadButton.disabled = updateButton.disabled = !available() || !selectedBookmark;
    renameButton.disabled = deleteButton.disabled = !selectedBookmark; exportButton.disabled = !bookmarks.length;
  }
  function scheduleRefresh() {
    if (disposed || frame !== null) return;
    frame = win.requestAnimationFrame(() => { frame = null; refresh(); });
  }
  function watchViewers() {
    for (const viewer of getViewers() || []) {
      if (watches.has(viewer) || typeof viewer.render !== 'function') continue;
      const original = viewer.render;
      const wrapped = function(...args) { const result = original.apply(this, args); scheduleRefresh(); return result; };
      watches.set(viewer, {original, wrapped}); viewer.render = wrapped;
    }
  }
  function refresh() {
    if (disposed) return;
    watchViewers(); const snapshot = attempt(capture), enabled = Boolean(snapshot);
    controls.forEach(control => { control.disabled = !enabled; }); saveButton.disabled = !enabled;
    if (snapshot) {
      for (const [name, input] of inputs) if (doc.activeElement !== input) input.value = displayNumber(inputValue(snapshot, name), name);
      for (const [name, slider] of sliders) {
        if (!dragging.has(name)) slider.value = String(sliderPosition(name, inputValue(snapshot, name), slider));
        slider.setAttribute('aria-valuetext', `${displayNumber(inputValue(snapshot, name), name)}${name === 'zoom' ? ' 倍' : ' 度'}`);
      }
      heightLabel.textContent = `可视高度 ${(snapshot.camera.baseHeight / snapshot.camera.zoom).toPrecision(6)}（原坐标单位）`;
    } else {
      dragging.clear(); for (const input of inputs.values()) if (doc.activeElement !== input) input.value = '';
      heightLabel.textContent = '加载数据后可调整';
    }
    loadButton.disabled = updateButton.disabled = !enabled || !selectedBookmark;
  }
  const finishDragging = () => { if (dragging.size) { dragging.clear(); scheduleRefresh(); } };
  win.addEventListener?.('pointerup', finishDragging); win.addEventListener?.('pointercancel', finishDragging);
  function freshId() {
    let id; do { id = win.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${++idCounter}`; }
    while (bookmarks.some(bookmark => bookmark.id === id)); return id;
  }
  function validName() {
    const name = bookmarkName.value.trim(); if (!name || name.length > 80) throw Error('请填写 1–80 个字符的书签名称'); return name;
  }
  function uniqueName(name) {
    let result = name, number = 2;
    while (bookmarks.some(bookmark => bookmark.name === result)) { const suffix = ` (${number++})`; result = name.slice(0, 80 - suffix.length) + suffix; }
    return result;
  }
  preserveInput.addEventListener('change', () => {
    const requested = preserveInput.checked; syncStored();
    pendingPreserve = requested; preserveView = requested; preserveInput.checked = requested; persist();
  });
  bookmarkSelect.addEventListener('change', () => {
    selectedBookmark = bookmarkSelect.value;
    const selected = bookmarks.find(bookmark => bookmark.id === selectedBookmark); if (selected) bookmarkName.value = selected.name;
    updateBookmarks();
  });
  saveButton.addEventListener('click', () => attempt(() => {
    syncStored();
    const snapshot = capture(); if (!snapshot) throw Error('请先加载数据，再保存视角');
    if (bookmarks.length >= CAMERA_MAX_BOOKMARKS) throw Error('最多保存 100 个书签，请先删除不需要的视角');
    const name = uniqueName(validName()), record = {id: freshId(), name, snapshot, updatedAt: new Date().toISOString()};
    bookmarks.push(record); pendingBookmarks.set(record.id, record); selectedBookmark = record.id; bookmarkName.value = name; updateBookmarks();
    if (persist()) message(`已保存新书签“${name}”，下次打开仍可使用。`);
  }));
  loadButton.addEventListener('click', () => attempt(() => {
    syncStored();
    const bookmark = bookmarks.find(record => record.id === selectedBookmark); if (bookmark) restore(bookmark.snapshot);
  }));
  updateButton.addEventListener('click', () => attempt(() => {
    syncStored();
    const bookmark = bookmarks.find(record => record.id === selectedBookmark); if (!bookmark) return;
    const snapshot = capture(); if (!snapshot) throw Error('请先加载数据，再更新视角');
    bookmark.snapshot = snapshot; bookmark.updatedAt = new Date().toISOString(); pendingBookmarks.set(bookmark.id, bookmark); updateBookmarks();
    if (persist()) message(`已更新“${bookmark.name}”的视角。`);
  }));
  renameButton.addEventListener('click', () => attempt(() => {
    syncStored();
    const bookmark = bookmarks.find(record => record.id === selectedBookmark); if (!bookmark) return;
    const name = validName();
    if (bookmarks.some(record => record.id !== bookmark.id && record.name === name)) throw Error('已有同名书签，请使用其他名称');
    bookmark.name = name; bookmark.updatedAt = new Date().toISOString(); pendingBookmarks.set(bookmark.id, bookmark); updateBookmarks();
    if (persist()) message(`已重命名为“${name}”。`);
  }));
  deleteButton.addEventListener('click', () => {
    syncStored(); if (!selectedBookmark) return;
    pendingBookmarks.set(selectedBookmark, null);
    bookmarks = bookmarks.filter(bookmark => bookmark.id !== selectedBookmark); selectedBookmark = ''; bookmarkName.value = ''; updateBookmarks();
    if (persist()) message('书签已删除。');
  });
  exportButton.addEventListener('click', () => attempt(() => {
    syncStored();
    const blob = new Blob([serializeCameraBookmarks(bookmarks, space, preserveView)], {type: 'application/json'});
    const url = win.URL.createObjectURL(blob), link = el('a'); link.href = url; link.download = `BuildingWebViewer-camera-${space}.json`; link.click();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 1000); message('相机书签 JSON 已导出，不含模型数据。');
  }));
  importButton.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0]; importInput.value = ''; if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw Error('相机 JSON 超过 1 MB，请检查是否选择了正确文件');
      const incoming = parseCameraBookmarks(await file.text(), space);
      if (disposed) return;
      syncStored();
      if (bookmarks.length + incoming.bookmarks.length > CAMERA_MAX_BOOKMARKS) throw Error('导入后超过 100 个书签，请先删除不需要的视角');
      for (const bookmark of incoming.bookmarks) {
        const record = {...bookmark, name: uniqueName(bookmark.name), id: freshId(), updatedAt: bookmark.updatedAt || new Date().toISOString()};
        bookmarks.push(record); pendingBookmarks.set(record.id, record);
      }
      selectedBookmark = incoming.bookmarks.length ? bookmarks.at(-1).id : selectedBookmark;
      if (selectedBookmark) bookmarkName.value = bookmarks.find(bookmark => bookmark.id === selectedBookmark).name;
      updateBookmarks(); if (persist()) message(`已导入 ${incoming.bookmarks.length} 个书签；选择后点击“加载所选”应用。`);
    } catch (error) { message(error.message || String(error), true); }
  });
  const onStorage = event => {
    if (!disposed && (event.key === key || event.key === null)) syncStored();
  };
  win.addEventListener?.('storage', onStorage);
  syncStored({notifyDeleted: false});
  preserveInput.checked = preserveView; updateBookmarks(); refresh();
  return {
    get preserveView() { return preserveView; }, capture, restore, refresh,
    destroy() {
      disposed = true; if (frame !== null) win.cancelAnimationFrame(frame);
      for (const [viewer, {original, wrapped}] of watches) if (viewer.render === wrapped) viewer.render = original;
      win.removeEventListener?.('storage', onStorage);
      win.removeEventListener?.('pointerup', finishDragging); win.removeEventListener?.('pointercancel', finishDragging);
      panel.remove(); if (separateBookmarks) bookPanel.remove(); watches.clear(); dragging.clear();
    },
  };
}
