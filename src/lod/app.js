import { mountMobileProject, snapshotProjectTree, restoreProjectTree, captureMobileInputs, restoreMobileInputs } from '../shared/mobile-project.js';
import { archiveImportQueue } from '../shared/zip-import.js';
import { ViewerProject } from '../shared/project-model.js';
import { mountProjectTree } from '../shared/project-tree.js';
import { appendLodFiles } from '../shared/project-import.js';
import { initializeLocale } from '../shared/i18n.js';
import { t } from '../shared/i18n.js';
import { mountPointDrop } from '../shared/point-drop.js';
import { mountViewerLayout } from '../shared/viewer-layout.js';
import { MeshViewer } from './renderer.js';
import { parseOBJ } from './obj-parser.js';
import { parseLodIds } from './selection.js';
import { mountCameraControls } from '../shared/camera-controls.js';
import { mountPaletteControls, paletteGradient } from '../shared/palette-controls.js';

initializeLocale();
const $ = (id) => document.getElementById(id);
const number = (value) => Number(value).toLocaleString('zh-CN');
let catalog = [], catalogById = new Map(), selected = new Set();
let cache = new Map(), currentModels = [], viewer, generation = 0, controller;
const modelProject = new ViewerProject();
let modelTree = null,mobileSession=null,mobileKnownIds=[];
let labelElements = new Map(), latestLabels = [];
let localFiles = new Map(), cameraControls = null, paletteControls = null;
let options = {mode: 'solid', edges: true, colors: 'surface', scale: 'real', labels: true, grid: true};

function showError(message, retry = false) {
  $('error').hidden = false;
  $('error').querySelector('span').textContent = message;
  $('retry').hidden = !retry;
}
function clearError() { $('error').hidden = true; }
function orderedIds() { return [...selected].sort((a, b) => a.localeCompare(b, undefined, {numeric:true})); }
function sizeText(model) {
  const dimensions = model.bounds[0].map((v, i) => model.bounds[1][i] - v);
  return dimensions.map(v => v < .1 ? v.toPrecision(3) : v.toFixed(1)).join(' × ') + t('（原坐标单位）');
}
function renderLabels(labels) {
  latestLabels = labels;
  const active = new Set(labels.map(label => String(label.id)));
  for (const [id, el] of labelElements) {
    if (!active.has(id)) { el.remove(); labelElements.delete(id); }
  }
  for (const label of labels) {
    const id = String(label.id);
    let el = labelElements.get(id);
    if (!el) {
      el = document.createElement('button');
      el.className = 'scene-label';
      el.textContent = '#' + id;
      el.setAttribute('aria-label', t('单独查看楼栋 ') + id);
      el.onclick = () => selectIds([id]);
      $('model-labels').append(el);
      labelElements.set(id, el);
    }
    el.style.left = `${label.x}px`;
    el.style.top = `${label.y}px`;
    el.hidden = !options.labels || !label.visible;
    const model = cache.get(id);
    el.title = model ? t("楼栋 {0} · {1} · 点击单独查看", [id, sizeText(model)]) : t("楼栋 {0}", [id]);
  }
}

function filteredModels() {
  return catalog.filter(model => modelProject.matches(model, $('search').value.trim().replace(/^#/,'')));
}
function renderList() {
  $('filter-count').textContent = t("匹配 {0} 项 · 已勾选 {1}", [number(filteredModels().length), selected.size]);
  $('item-count').textContent = t('共 {0} 项', [number(catalog.length)]);
  for (const id of ['select-all-models','invert-model-selection']) $(id).disabled = !filteredModels().length;
  $('random-selection').disabled = !catalog.length;
  modelTree?.render();
}
function renderSelection(syncInput = true) {
  $('selection-count').textContent = t('已勾选 {0} 栋', [selected.size]);
  $('previous-group').disabled = !selected.size; $('next-group').disabled = !selected.size;
  const fragment = document.createDocumentFragment();
  for (const id of orderedIds()) {
    const chip = document.createElement('span'); chip.className = 'model-chip';
    const focus = document.createElement('button'); focus.textContent = `# ${id}`;
    focus.title = cache.has(id) ? t("{0} · 点击单独查看", [sizeText(cache.get(id))]) : t('单独查看楼栋 ') + id;
    focus.onclick = () => selectIds([id]);
    const remove = document.createElement('button'); remove.className = 'remove-chip'; remove.textContent = '×';
    remove.setAttribute('aria-label', t("移除楼栋 {0}", [id]));
    remove.onclick = () => selectIds([...selected].filter(value => value !== id));
    chip.append(focus, remove); fragment.append(chip);
  }
  if (!selected.size) {
    const hint = document.createElement('span'); hint.className = 'selected-empty'; hint.textContent = t('尚未选择楼栋'); fragment.append(hint);
  }
  $('selected-models').replaceChildren(fragment);
  if (syncInput) $('batch-ids').value = orderedIds().join(', ');
}
function selectIds(ids) {
  const unique = [...new Set(ids.map(String))];
  const invalid = unique.filter(id => !catalogById.has(id));
  if (invalid.length) { showError(t("找不到楼栋编号：{0}", [invalid.slice(0, 8).join('、')])); return false; }
  selected = new Set(unique); clearError(); renderSelection(); renderList(); loadSelection(); return true;
}
function applyBatch(append) {
  try { const ids = parseLodIds($('batch-ids').value, catalogById); selectIds(append ? [...selected, ...ids] : ids); }
  catch (error) { showError(error.message); }
}
async function loadSelection() {
  const version = ++generation;
  controller?.abort(); controller = new AbortController();
  const signal = controller.signal, ids = orderedIds();
  if (!ids.length) {
    currentModels = [];
    viewer?.setModels([]);
    cameraControls?.refresh(); updateHeightLegend();
    renderLabels([]);
    $('loading').hidden = true; $('empty-state').hidden = false; $('screenshot').disabled = true;
    $('scene-stats').textContent = catalog.length ? t('未选择楼栋') : t('请先在项目栏添加文件或文件夹');
    return;
  }
  $('loading').hidden = !ids.length;
  $('empty-state').hidden = !!ids.length;
  $('screenshot').disabled = true;
  $('scene-stats').textContent = ids.length ? t("正在读取 {0} 栋模型…", [ids.length]) : t('未选择楼栋');
  const results = new Map(), failures = []; let next = 0, completed = 0;
  const worker = async () => {
    while (next < ids.length && !signal.aborted) {
      const id = ids[next++];
      try {
        let model = cache.get(id);
        if (!model) {
          const file = localFiles.get(id);
          if (!file) throw Error(t('本地文件已不可用，请重新选择文件夹'));
          const text = await file.text();
          if (signal.aborted || version !== generation) return;
          model = parseOBJ(text, id, file.size);
          if (signal.aborted || version !== generation) return;
          cache.set(id, model);
          if (cache.size > 64) cache.delete(cache.keys().next().value);
        }
        results.set(id, model);
      } catch (error) {
        if (error.name !== 'AbortError') failures.push(`#${id}：${error.message}`);
      }
      completed++;
      if (version === generation) $('loading').querySelector('span').textContent = t("正在读取模型 {0} / {1}", [completed, ids.length]);
    }
  };
  await Promise.all(Array.from({length: Math.min(4, ids.length)}, worker));
  if (version !== generation) return;
  const savedView = cameraControls?.preserveView ? cameraControls.capture() : null;
  currentModels = ids.map(id => results.get(id)).filter(Boolean);
  try {
    viewer?.setModels(currentModels);
    if (savedView && currentModels.length) cameraControls.restore(savedView, {checkScene: false});
    cameraControls?.refresh(); updateHeightLegend();
    const triangles = currentModels.reduce((sum, m) => sum + m.faces.length, 0);
    const vertices = currentModels.reduce((sum, m) => sum + m.vertices.length, 0);
    $('scene-stats').textContent = currentModels.length ? t("已显示 {0} / {1} 栋 · {2} 三角面 · {3} 顶点", [currentModels.length, ids.length, number(triangles), number(vertices)]) : t('未显示模型');
    $('screenshot').disabled = !currentModels.length || !viewer;
    $('empty-state').hidden = !!currentModels.length;
    if (failures.length) showError(t('部分模型读取失败。') + failures.join('；'), true);
    renderSelection(false);
  } catch (error) { showError(t("模型渲染失败：{0}", [error.message]), true); }
  finally { $('loading').hidden = true;mobileSession?.schedule(); }
}
function updateHeightLegend() {
  const legend = $('height-legend'); if (!legend) return;
  const range = viewer?.getState().colorRange;
  const valid = range && Number.isFinite(range.min) && Number.isFinite(range.max);
  legend.hidden = !(options.colors === 'height' && currentModels.length && valid);
  if (valid) {
    $('height-min').textContent = Number(range.min.toPrecision(6)).toString();
    $('height-max').textContent = Number(range.max.toPrecision(6)).toString();
    legend.querySelector('i').style.background = paletteGradient(options.palette, options.reverse);
    paletteControls?.setDataRange?.(range);
  }
}
function updateOptions() {
  const savedView = cameraControls?.preserveView && $('scale-mode').value !== options.scale ? cameraControls.capture() : null;
  options = {mode: $('display-mode').value, scale: $('scale-mode').value, colors: $('color-mode').value, edges: $('show-edges').checked, labels: $('show-labels').checked, grid: $('show-grid').checked, ...paletteControls?.getOptions()};
  viewer?.setOptions(options);
  if (savedView && currentModels.length) cameraControls.restore(savedView, {checkScene: false});
  paletteControls?.setScalarEnabled(options.colors === 'height');
  cameraControls?.refresh(); updateHeightLegend();
  $('layout-title').textContent = options.scale === 'real' ? t('等比例陈列') : t('统一展示大小');
  $('layout-note').textContent = options.scale === 'real' ? t('独立模型重新排列 · 非实际地理位置') : t('各栋独立等比缩放 · 不可比较实际大小');
  $('legend').hidden = options.colors !== 'surface' || options.mode === 'wire';
  renderLabels(latestLabels);
}
function nextGroup(direction) {
  if (!catalog.length || !selected.size) return;
  const count = selected.size, ids = orderedIds();
  let start = direction > 0 ? catalog.findIndex(m => m.id === ids.at(-1)) + 1 : catalog.findIndex(m => m.id === ids[0]) - count;
  start = ((start % catalog.length) + catalog.length) % catalog.length;
  selectIds(Array.from({length: Math.min(count, catalog.length)}, (_, i) => catalog[(start + i) % catalog.length].id));
}

$('replace-selection').onclick = () => applyBatch(false);
$('add-selection').onclick = () => applyBatch(true);
$('batch-ids').onkeydown = event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) applyBatch(false); };
$('search').oninput = () => { renderList(); };
$('clear-selection').onclick = () => selectIds([]);
$('random-selection').onclick = () => {
  const pool = catalog.map(m => m.id);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  selectIds(pool.slice(0, 6));
};
$('previous-group').onclick = () => nextGroup(-1);
$('next-group').onclick = () => nextGroup(1);
$('fit-view').onclick = () => viewer?.fit();
$('zoom-in').onclick = () => viewer?.zoomBy(1.2);
$('zoom-out').onclick = () => viewer?.zoomBy(1 / 1.2);

$('retry').onclick = () => { clearError(); if (!catalog.length || !viewer) init(); else loadSelection(); };
$('dismiss-error').onclick = clearError;
for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => {
  viewer?.setView(button.dataset.view);
  for (const other of document.querySelectorAll('[data-view]')) { other.classList.toggle('active', other === button); other.setAttribute('aria-pressed', String(other === button)); }
};
for (const id of ['display-mode', 'scale-mode', 'color-mode', 'show-edges', 'show-labels', 'show-grid']) $(id).onchange = updateOptions;
document.addEventListener('keydown', event => {
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)) return;
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); viewer?.fit(); }
});

function ensureViewer() {
  if (!viewer) viewer = new MeshViewer($('scene'), {onLabels: renderLabels, onError: message => message ? showError(String(message), true) : clearError()});
  if (!paletteControls && $('palette-controls')) paletteControls = mountPaletteControls({container: $('palette-controls'), getOptions: () => options, onChange: updateOptions});
  if (!cameraControls && $('camera-controls')) cameraControls = mountCameraControls({container: $('camera-controls'), bookmarkContainer: $('bookmark-controls'), getViewers: () => viewer ? [viewer] : [], space: 'lod-arrangement', getScene: () => ({ids: currentModels.map(model => String(model.id)), scale: options.scale})});
  options = {...options, ...paletteControls?.getOptions()};
  viewer.setOptions(options); paletteControls?.setScalarEnabled(options.colors === 'height');
}
function folderReady(fileList, paths = null) {
  const result = appendLodFiles(catalog, modelProject, [...fileList], paths);
  catalog.sort((a,b) => a.id.localeCompare(b.id,undefined,{numeric:true}));
  catalogById = new Map(catalog.map(model => [model.id,model]));
  localFiles = new Map(catalog.map(model => [model.id,model.file]));
  $('search').value = '';
  $('source-path').textContent = t('文件留在本机 · 分组仅保留在本次页面');
  $('folder-status').textContent = t("{0} 个 OBJ · 仅按需读取所选楼栋", [number(catalog.length)]);
  $('total-count').textContent = t("{0} 栋模型", [number(catalog.length)]);
  if (!result.added && !result.duplicates) showError(t('这个文件夹中没有 OBJ 文件，请选择包含 .obj 模型的目录。'));
  else clearError();
  renderList(); return result;
}
function changeModelVisibility(members, checked) {
  const next = new Set(selected);
  for (const model of members) checked ? next.add(model.id) : next.delete(model.id);
  selectIds([...next]);
}
function removeModelEntries(members) {
  const removed = new Set(members);
  ++generation; controller?.abort();
  for (const model of members) { cache.delete(model.id); localFiles.delete(model.id); catalogById.delete(model.id); selected.delete(model.id); }
  catalog = catalog.filter(model => !removed.has(model));
  $('total-count').textContent = t("{0} 栋模型", [number(catalog.length)]);
  $('folder-status').textContent = t("{0} 个 OBJ · 仅按需读取所选楼栋", [number(catalog.length)]);
  selectIds([...selected]);
}
const importLodRecords=archiveImportQueue({accepts:name=>/\.obj$/i.test(name),
  receive:records=>folderReady(records.map(item=>item.file),new Map(records.map(item=>[item.file,item.path]))),
  onProgress:message=>{$('drop-status').hidden=false;$('drop-status').textContent=message;},onError:showError});
const pickLodFiles=event=>{const records=Array.from(event.target.files,file=>({file,path:file.webkitRelativePath||file.name}));event.target.value='';importLodRecords(records).catch(()=>{});};
$('choose-folder').onclick = () => $('folder-input').click();
$('folder-input').onchange = pickLodFiles;

function init() {
  try {
    ensureViewer();
    mountViewerLayout({getViewers: () => viewer ? [viewer] : []});
    if (!modelTree) modelTree = mountProjectTree({
      project: modelProject, container: $('model-list'), root: $('project-root'), controls: $('project-controls'),
      getEntries: () => catalog, getSelected: () => new Set(catalog.filter(model => selected.has(model.id))),
      getMode: () => 'multiple', getQuery: () => $('search').value.trim().replace(/^#/,''),
      onToggle: model => changeModelVisibility([model],!selected.has(model.id)),
      onGroupSelection: changeModelVisibility, onVisibility: changeModelVisibility,
      onRemove: removeModelEntries, onChange: renderList, detail: model => `${(model.bytes / 1024).toFixed(1)} KB`,
    });
    mountPointDrop({zone: document.querySelector('.sidebar'), status: $('drop-status'), accepts: name => /\.(obj|zip)$/i.test(name), onFiles: importLodRecords});
    $('select-all-models').onclick = () => selectIds([...selected, ...filteredModels().map(model => model.id)]);
    $('invert-model-selection').onclick = () => {
      const next = new Set(selected);
      for (const model of filteredModels()) next.has(model.id) ? next.delete(model.id) : next.add(model.id);
      selectIds([...next]);
    };
    $('choose-file').onclick = () => $('file-input').click();
    $('file-input').onchange = pickLodFiles;
    $('total-count').textContent = t('尚未选择文件夹');
    $('source-path').textContent = t('尚未选择文件夹。关闭或刷新网页后，请手动重新选择。');
    $('folder-status').textContent = t('选择含 OBJ 的目录 · 文件仅在本机读取');
    selectIds([]);
    mountMobileProject({receive:importLodRecords,getState:()=>({tree:{...snapshotProjectTree(modelProject,catalog),knownIds:mobileKnownIds},selected:[...selected],inputs:captureMobileInputs(),camera:currentModels.length?cameraControls?.capture():null}),restoreState:async state=>{
      mobileKnownIds=[...new Set([...(state?.tree?.knownIds||[]),...catalog.map(e=>e.id)])];
      if(state){catalog=restoreProjectTree(modelProject,catalog,state.tree);catalogById=new Map(catalog.map(e=>[e.id,e]));localFiles=new Map(catalog.map(e=>[e.id,e.file]));selected=new Set((state.selected||[]).filter(id=>catalogById.has(id)));restoreMobileInputs(state.inputs);updateOptions();renderSelection();renderList();await loadSelection();if(state.camera&&currentModels.length)cameraControls.restore(state.camera,{checkScene:false});}
      $('source-path').textContent=t('项目自动保存在此设备');
    },onBackground:()=>{for(const id of cache.keys())if(!selected.has(id))cache.delete(id);}}).then(session=>{mobileSession=session;});
  } catch (error) {
    $('scene-stats').textContent = t('查看器暂时无法启动');
    $('loading').hidden = true;
    showError(t("查看器启动失败：{0}。请使用支持 WebGL 的浏览器。", [error.message]), true);
    $('empty-state').hidden = false;
  }
}
init();
