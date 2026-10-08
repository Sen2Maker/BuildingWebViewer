import { MeshViewer } from './renderer.js';
import { parseOBJ } from './obj-parser.js';

const $ = (id) => document.getElementById(id);
const MAX_SELECTED = 24, PAGE_SIZE = 50;
const number = (value) => Number(value).toLocaleString('zh-CN');
let catalog = [], catalogById = new Map(), selected = new Set(), page = 0;
let cache = new Map(), currentModels = [], viewer, generation = 0, controller;
let labelElements = new Map(), latestLabels = [];
let localFiles = new Map();
let options = {mode: 'solid', edges: true, colors: 'surface', scale: 'real', labels: true, grid: true};

function showError(message, retry = false) {
  $('error').hidden = false;
  $('error').querySelector('span').textContent = message;
  $('retry').hidden = !retry;
}
function clearError() { $('error').hidden = true; }
function orderedIds() { return [...selected].sort((a, b) => Number(a) - Number(b)); }
function sizeText(model) {
  const dimensions = model.bounds[0].map((v, i) => model.bounds[1][i] - v);
  return dimensions.map(v => v < .1 ? v.toPrecision(3) : v.toFixed(1)).join(' × ') + '（原坐标单位）';
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
      el.setAttribute('aria-label', '单独查看楼栋 ' + id);
      el.onclick = () => selectIds([id]);
      $('model-labels').append(el);
      labelElements.set(id, el);
    }
    el.style.left = `${label.x}px`;
    el.style.top = `${label.y}px`;
    el.hidden = !options.labels || !label.visible;
    const model = cache.get(id);
    el.title = model ? `楼栋 ${id} · ${sizeText(model)} · 点击单独查看` : `楼栋 ${id}`;
  }
}

function filteredModels() {
  const query = $('search').value.trim().replace(/^#/, '').replace(/\.obj$/i, '');
  if (!query) return catalog;
  return catalog.filter(model => model.id.includes(query)).sort((a, b) => (b.id === query) - (a.id === query) || Number(a.id) - Number(b.id));
}
function renderList() {
  const filtered = filteredModels(), pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  page = Math.min(page, pageCount - 1);
  $('filter-count').textContent = `${number(filtered.length)} 栋可选`;
  $('random-selection').disabled = !catalog.length;
  $('page-info').textContent = `${page + 1} / ${pageCount} 页`;
  $('previous-page').disabled = page === 0;
  $('next-page').disabled = page >= pageCount - 1;
  const fragment = document.createDocumentFragment();
  for (const model of filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
    const row = document.createElement('label');
    row.className = 'model-row' + (selected.has(model.id) ? ' selected' : '');
    const check = document.createElement('input');
    check.type = 'checkbox'; check.checked = selected.has(model.id);
    check.setAttribute('aria-label', `选择楼栋 ${model.id}`);
    check.onchange = () => {
      const next = new Set(selected);
      if (check.checked) next.add(model.id); else next.delete(model.id);
      if (!selectIds([...next])) check.checked = selected.has(model.id);
    };
    const text = document.createElement('span'); text.className = 'model-text';
    const title = document.createElement('strong'); title.textContent = `# ${model.id}`;
    const sub = document.createElement('small');
    sub.textContent = model.triangles !== undefined ? `${number(model.triangles)} 面 · ${(model.bytes / 1024).toFixed(1)} KB` : `${(model.bytes / 1024).toFixed(1)} KB`;
    text.append(title, sub); row.append(check, text);
    if (model.watertight === true) {
      const mark = document.createElement('span'); mark.className = 'mesh-mark'; mark.textContent = '闭合';
      mark.title = '已有提交清单记录为闭合；未在网页中重新检查'; row.append(mark);
    }
    row.title = model.fallback_original ? '此栋为提交清单标注的原结果回退版本' : `查看 ${model.id}.obj`;
    fragment.append(row);
  }
  if (!filtered.length) {
    const empty = document.createElement('p'); empty.className = 'empty-list'; empty.textContent = '没有匹配的编号'; fragment.append(empty);
  }
  $('model-list').replaceChildren(fragment);
}
function renderSelection(syncInput = true) {
  $('selection-count').textContent = `${selected.size} / ${MAX_SELECTED}`;
  $('previous-group').disabled = !selected.size; $('next-group').disabled = !selected.size;
  const fragment = document.createDocumentFragment();
  for (const id of orderedIds()) {
    const chip = document.createElement('span'); chip.className = 'model-chip';
    const focus = document.createElement('button'); focus.textContent = `# ${id}`;
    focus.title = cache.has(id) ? `${sizeText(cache.get(id))} · 点击单独查看` : '单独查看楼栋 ' + id;
    focus.onclick = () => selectIds([id]);
    const remove = document.createElement('button'); remove.className = 'remove-chip'; remove.textContent = '×';
    remove.setAttribute('aria-label', `移除楼栋 ${id}`);
    remove.onclick = () => selectIds([...selected].filter(value => value !== id));
    chip.append(focus, remove); fragment.append(chip);
  }
  if (!selected.size) {
    const hint = document.createElement('span'); hint.className = 'selected-empty'; hint.textContent = '尚未选择楼栋'; fragment.append(hint);
  }
  $('selected-models').replaceChildren(fragment);
  if (syncInput) $('batch-ids').value = orderedIds().join(', ');
}
function selectIds(ids) {
  const unique = [...new Set(ids.map(String))];
  const invalid = unique.filter(id => !catalogById.has(id));
  if (invalid.length) { showError(`找不到楼栋编号：${invalid.slice(0, 8).join('、')}`); return false; }
  if (unique.length > MAX_SELECTED) { showError(`一次最多预览 ${MAX_SELECTED} 栋，当前选择了 ${unique.length} 栋。请缩小编号范围。`); return false; }
  selected = new Set(unique); clearError(); renderSelection(); renderList(); loadSelection(); return true;
}
function parseIds(value) {
  if (!value.trim()) return [];
  const normalized = value.trim().replace(/\s*[-–—~～]\s*/g, '-');
  const tokens = normalized.split(/[\s,，;；、]+/).filter(Boolean);
  const result = new Set();
  for (const token of tokens) {
    const match = token.match(/^#?(\d+)(?:-(\d+))?$/);
    if (!match) throw Error(`无法识别“${token}”。请使用编号或范围，例如 1, 3, 100-105。`);
    const start = Number(match[1]), end = match[2] ? Number(match[2]) : start;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) throw Error(`编号范围不正确：${token}`);
    if (end - start + 1 > MAX_SELECTED) throw Error(`一次最多预览 ${MAX_SELECTED} 栋，请缩小编号范围。`);
    for (let id = start; id <= end; id++) result.add(String(id));
    if (result.size > MAX_SELECTED) throw Error(`一次最多预览 ${MAX_SELECTED} 栋。`);
  }
  return [...result];
}
function applyBatch(append) {
  try { const ids = parseIds($('batch-ids').value); selectIds(append ? [...selected, ...ids] : ids); }
  catch (error) { showError(error.message); }
}
async function loadSelection() {
  const version = ++generation;
  controller?.abort(); controller = new AbortController();
  const signal = controller.signal, ids = orderedIds();
  if (!ids.length) {
    currentModels = [];
    viewer?.setModels([]);
    renderLabels([]);
    $('loading').hidden = true; $('empty-state').hidden = false; $('screenshot').disabled = true;
    $('scene-stats').textContent = catalog.length ? '未选择楼栋' : '请先点击左侧“选择模型文件夹”';
    return;
  }
  $('loading').hidden = !ids.length;
  $('empty-state').hidden = !!ids.length;
  $('screenshot').disabled = true;
  $('scene-stats').textContent = ids.length ? `正在读取 ${ids.length} 栋模型…` : '未选择楼栋';
  const results = new Map(), failures = []; let next = 0, completed = 0;
  const worker = async () => {
    while (next < ids.length && !signal.aborted) {
      const id = ids[next++];
      try {
        let model = cache.get(id);
        if (!model) {
          const file = localFiles.get(id);
          if (!file) throw Error('本地文件已不可用，请重新选择文件夹');
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
      if (version === generation) $('loading').querySelector('span').textContent = `正在读取模型 ${completed} / ${ids.length}`;
    }
  };
  await Promise.all(Array.from({length: Math.min(4, ids.length)}, worker));
  if (version !== generation) return;
  currentModels = ids.map(id => results.get(id)).filter(Boolean);
  try {
    viewer?.setModels(currentModels);
    const triangles = currentModels.reduce((sum, m) => sum + m.faces.length, 0);
    const vertices = currentModels.reduce((sum, m) => sum + m.vertices.length, 0);
    $('scene-stats').textContent = currentModels.length ? `已显示 ${currentModels.length} / ${ids.length} 栋 · ${number(triangles)} 三角面 · ${number(vertices)} 顶点` : '未显示模型';
    $('screenshot').disabled = !currentModels.length || !viewer;
    $('empty-state').hidden = !!currentModels.length;
    if (failures.length) showError('部分模型读取失败。' + failures.join('；'), true);
    renderSelection(false);
  } catch (error) { showError(`模型渲染失败：${error.message}`, true); }
  finally { $('loading').hidden = true; }
}
function updateOptions() {
  options = {mode: $('display-mode').value, scale: $('scale-mode').value, colors: $('color-mode').value, edges: $('show-edges').checked, labels: $('show-labels').checked, grid: $('show-grid').checked};
  viewer?.setOptions(options);
  $('layout-title').textContent = options.scale === 'real' ? '等比例陈列' : '统一展示大小';
  $('layout-note').textContent = options.scale === 'real' ? '独立模型重新排列 · 非实际地理位置' : '各栋独立等比缩放 · 不可比较实际大小';
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
function screenshot() {
  if (!viewer || !currentModels.length) return;
  viewer.render();
  const canvas = $('scene'), result = document.createElement('canvas');
  const header = 80; result.width = canvas.width; result.height = canvas.height + header;
  const ctx = result.getContext('2d');
  ctx.fillStyle = '#f5f8f7'; ctx.fillRect(0, 0, result.width, result.height);
  ctx.drawImage(canvas, 0, header);
  ctx.fillStyle = '#2d4845'; ctx.font = '500 23px sans-serif';
  ctx.fillText('LOD · ' + currentModels.map(model => '#' + model.id).join('  '), 25, 32, result.width - 50);
  ctx.font = '14px sans-serif'; ctx.fillStyle = '#738580';
  ctx.fillText($('layout-title').textContent + ' / ' + $('layout-note').textContent, 25, 58, result.width - 50);
  const ratio = canvas.width / canvas.clientWidth;
  if (options.labels) for (const label of latestLabels) {
    if (!label.visible) continue;
    ctx.font = `${12 * ratio}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#3b5b53';
    ctx.fillText('#' + label.id, label.x * ratio, header + (label.y + 13) * ratio);
  }
  const filename = `LOD_${orderedIds().join('-')}_${options.scale}.png`;
  result.toBlob(blob => {
    if (!blob) { showError('无法生成截图，请降低窗口尺寸后重试。'); return; }
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.download = filename; link.href = url; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, 'image/png');
}

$('replace-selection').onclick = () => applyBatch(false);
$('add-selection').onclick = () => applyBatch(true);
$('batch-ids').onkeydown = event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) applyBatch(false); };
$('search').oninput = () => { page = 0; renderList(); };
$('previous-page').onclick = () => { page--; renderList(); $('model-list').scrollTop = 0; };
$('next-page').onclick = () => { page++; renderList(); $('model-list').scrollTop = 0; };
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
$('screenshot').onclick = screenshot;
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
  viewer.setOptions(options);
}
function folderReady(fileList) {
  if (!fileList.length) return;
  ++generation; controller?.abort(); cache.clear();
  localFiles = new Map(); catalog = []; catalogById = new Map(); page = 0;
  $('search').value = '';
  $('total-count').textContent = '0 栋模型';
  $('source-path').textContent = '尚未选择可用的 OBJ 目录';
  $('folder-status').textContent = '请选择包含 OBJ 文件的目录';
  selectIds([]);
  const files = [...fileList].filter(file => /\.obj$/i.test(file.name));
  if (!files.length) { showError('这个文件夹中没有 OBJ 文件，请选择包含 .obj 模型的目录。'); return; }
  const mapped = new Map();
  for (const file of files) {
    const id = file.name.replace(/\.obj$/i, '');
    if (mapped.has(id)) { showError(`文件夹包含同名模型 ${file.name}，请直接选择只含一套结果的子文件夹。`); return; }
    mapped.set(id, file);
  }
  try { ensureViewer(); } catch (error) { showError(error.message); return; }
  ++generation; controller?.abort(); cache.clear();
  localFiles = mapped;
  catalog = [...mapped].map(([id, file]) => ({id, bytes: file.size})).sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
  catalogById = new Map(catalog.map(model => [model.id, model]));
  page = 0; $('search').value = '';
  const name = files[0].webkitRelativePath.split('/')[0] || '本地文件夹';
  $('source-path').textContent = name + '（浏览器选择的本地文件夹）';
  $('folder-status').textContent = `${number(files.length)} 个 OBJ · 仅按需读取所选楼栋`;
  $('total-count').textContent = `${number(files.length)} 栋模型`;
  selectIds([]);
}
$('choose-folder').onclick = () => $('folder-input').click();
$('folder-input').onchange = event => { folderReady(event.target.files); event.target.value = ''; };

function init() {
  try {
    ensureViewer();
    $('total-count').textContent = '尚未选择文件夹';
    $('source-path').textContent = '尚未选择文件夹。关闭或刷新网页后，请手动重新选择。';
    $('folder-status').textContent = '选择含 OBJ 的目录 · 文件仅在本机读取';
    selectIds([]);
  } catch (error) {
    $('scene-stats').textContent = '查看器暂时无法启动';
    $('loading').hidden = true;
    showError(`查看器启动失败：${error.message}。请使用支持 WebGL 的浏览器。`, true);
    $('empty-state').hidden = false;
  }
}
init();
