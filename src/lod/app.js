import {defaultPointSettings,semanticPointCloud} from '../pointcloud/point-dataset.js';
import {settingsForCloud} from '../shared/online-point-settings.js';
import { mountOnlinePreview, applyPreviewPreset } from '../shared/online-preview.js';
import {readCompareDescriptor} from '../shared/online-compare-core.js';
import {mountOnlineLod} from './online.js';
import {applyPresentationControls} from '../shared/online-presentation.js';
import { meshReferenceModels } from './mesh-data.js';
import { CloudFileCache } from '../cloud/cloud-cache.js';
import { createViewerComparison } from '../shared/viewer-comparison.js';
import { setNameSummary } from '../shared/name-summary.js';
import { migrateObjectImportState } from '../shared/object-import-state.js';
import { objectFilePreference, resolveObjectFile, adjacentObjectEntry, objectNavigationDirection } from '../shared/object-selection.js';
import { createBatchProgress } from '../shared/batch-progress.js';
import { currentPalettePreferences } from '../shared/palettes.js';
import { mountCameraAnimation } from '../shared/animation-controls.js';
import { createMeshAnimationAdapter } from './animation-adapter.js';
import { isMobileApp } from '../shared/mobile-project.js';
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
const onlineRequested=new URLSearchParams(location.search).has('dataset')||new URLSearchParams(location.hash.slice(1)).has('compare');
let online=null,onlineReference=[],onlineBounds=null,onlineNodes=new Set();
let animationControls=null,meshMode='multiple',meshPreference=null,lastMeshId=null;
let meshPendingColorMode=null;
let meshPaneCount=1,meshVariants=[null,null,null],meshCloudPreference=null,meshCloudItems=[],paneModels=[[],[],[]],meshViewers=[];
const meshFileCache=new CloudFileCache({readWire:async file=>parseOBJ(await file.text(),file.name,file.size)});
const activeMeshViewers=()=>meshViewers.slice(0,meshPaneCount);
const meshComparison=createViewerComparison(activeMeshViewers,()=>$('mesh-sync-camera').checked);
function meshCloudFiles(entry){return (entry?.clouds||[]).filter(file=>!entry.excludedFileKeys?.includes(entry.sourceKeys?.get(file)));}
function paneOptions(i){const layer=$(`mesh-layers-${i+1}`).value;return {...options,showMesh:layer!=='cloud',showPoints:layer!=='mesh'};}
function updateMeshDataControls(){
 if(online){online.controls();return;}
 const active=catalogById.get(lastMeshId),files=meshFiles(active),clouds=meshCloudFiles(active);
 $('mesh-compare-count').value=String(meshPaneCount);$('mesh-sync-camera').closest('label').hidden=meshPaneCount===1;
 for(let i=0;i<3;i++){const select=$(`mesh-variant-${i+1}`),chosen=resolveObjectFile(files,i===0?meshPreference:meshVariants[i],i);select.replaceChildren();
   if(!files.length){const o=document.createElement('option');o.textContent=t('未加载模型');o.value='';select.append(o);}
   files.forEach((file,index)=>{const o=document.createElement('option');o.value=String(index);o.textContent=file.name;select.append(o);});select.value=chosen?String(files.indexOf(chosen)):'';select.disabled=!files.length;$(`mesh-slot-${i+1}`).hidden=i>=meshPaneCount;
 }
 const select=$('mesh-cloud-file');select.replaceChildren();for(const[value,label]of [['auto',t('按 ID 自动配对')],['none',t('不加载点云')],...clouds.map((file,i)=>[String(i),file.name])]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
 const cloud=resolveObjectFile(clouds,meshCloudPreference);select.value=meshCloudPreference?.none?'none':meshCloudPreference&&cloud?String(clouds.indexOf(cloud)):'auto';
}
function configureMeshPanes(){
 $('viewer-grid').dataset.panels=String(meshPaneCount);$('mesh-panel-heading-1').hidden=meshPaneCount===1;
 for(let i=1;i<3;i++){$(`mesh-panel-${i+1}`).hidden=i>=meshPaneCount;if(i<meshPaneCount&&!meshViewers[i]){meshViewers[i]=new MeshViewer($(`mesh-scene-${i+1}`),{onError:showError});meshComparison.install(meshViewers[i]);}if(i>=meshPaneCount&&meshViewers[i]){meshViewers[i].destroy();meshViewers[i]=null;}}
 updateMeshDataControls();
}
function meshPointFields(){
 const select=$('mesh-point-color-mode'),previous=meshPendingColorMode||select.value;meshPendingColorMode=null;select.replaceChildren();const keys=[...new Set(meshCloudItems.flatMap(item=>Object.keys(item.cloud.fields||{})))];
 for(const[value,label]of [['height',t('高度 Z')],['rgb','RGB'],['solid',t('单色')],...keys.map(k=>['field:'+k,k])]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}select.value=[...select.options].some(o=>o.value===previous)?previous:'height';
}

const number = (value) => Number(value).toLocaleString('zh-CN');
let catalog = [], catalogById = new Map(), selected = new Set();
let cache = new Map(), currentModels = [], viewer, generation = 0, controller, onlinePointSettings=null;
const modelProject = new ViewerProject();
let modelTree = null,mobileSession=null,mobileKnownIds=[];
let labelElements = new Map(), latestLabels = [];
let localFiles = new Map(), cameraControls = null, paletteControls = null;
let options = {...currentPalettePreferences(), mode: 'solid', edges: true, colors: 'surface', scale: 'real', labels: true, grid: true};

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
      el.setAttribute('aria-label', t('单独查看模型 ') + id);
      el.onclick = () => selectIds([id]);
      $('model-labels').append(el);
      labelElements.set(id, el);
    }
    el.style.left = `${label.x}px`;
    el.style.top = `${label.y}px`;
    el.hidden = !options.labels || !label.visible;
    const model = cache.get(id);
    el.title = model ? t("模型 {0} · {1} · 点击单独查看", [id, sizeText(model)]) : t("模型 {0}", [id]);
  }
}

function filteredModels() {
  return catalog.filter(model => modelProject.matches(model, $('search').value.trim().replace(/^#/,'')));
}
function renderList() {
  $('filter-count').textContent = t("匹配 {0} 项 · 已勾选 {1}", [number(filteredModels().length), selected.size]);
  $('item-count').textContent = t('共 {0} 项', [number(catalog.length)]);
  for (const id of ['select-all-models','invert-model-selection']) $(id).disabled = meshMode!=='multiple'||!filteredModels().length;
  $('random-selection').disabled = !catalog.length;
  renderMeshMode();modelTree?.render();
}
function meshFiles(entry){const files=entry?.files?.length?entry.files:entry?.file?[entry.file]:[];return files.filter(file=>!entry.excludedFileKeys?.includes(entry.sourceKeys?.get(file)));}
function syncMeshFiles(){
  for(const entry of catalog){const file=resolveObjectFile(meshFiles(entry),meshPreference);if(file!==entry.file){cache.delete(entry.id);entry.file=file;}entry.bytes=file?.size||0;localFiles.set(entry.id,file);}
}
function renderMeshMode(){
  const multiple=meshMode==='multiple',filtered=filteredModels();$('mesh-mode-select').value=meshMode;
  $('mesh-mode-note').textContent=multiple?t('勾选多个 ID，以独立模型陈列；显示设置应用到所有已选 ID。'):t('单个 ID：← / → 或 [ / ] 切换；按自然编号顺序，遵循搜索筛选。');
  const active=catalogById.get(lastMeshId)||catalogById.get(orderedIds().at(-1));
  $('previous-mesh-id').hidden=multiple;$('next-mesh-id').hidden=multiple;
  $('previous-group').hidden=!multiple;$('next-group').hidden=!multiple;
  const entries=multiple?catalog:[...filtered].sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
  const positions=entries.flatMap((entry,index)=>(multiple?selected.has(entry.id):entry===active)?[index+1]:[]);
  const contiguous=positions.every((position,index)=>!index||position===positions[index-1]+1);
  const position=!positions.length?'0':positions.length===1?String(positions[0]):contiguous?`${positions[0]}–${positions.at(-1)}`:t('已选 {0}',[positions.length]);
  $('mesh-navigation-position').textContent=`${position} / ${entries.length}`;
  for(const id of ['previous-mesh-id','next-mesh-id'])$(id).disabled=multiple||!filtered.length||adjacentObjectEntry(filtered,active,id==='previous-mesh-id'?-1:1)===active;
  const files=meshFiles(active);$('mesh-file-select').replaceChildren();
  for(const [index,file] of files.entries()){const option=document.createElement('option');option.value=String(index);option.textContent=file.name;$('mesh-file-select').append(option);}
  $('mesh-file-select').closest('label').hidden=files.length<2;
  updateMeshDataControls();
  $('mesh-file-select').disabled=!files.length;$('mesh-file-select').value=String(Math.max(0,files.indexOf(active?.file)));
}
function navigateMesh(direction){if(meshMode!=='single')return;const entry=adjacentObjectEntry(filteredModels(),catalogById.get(lastMeshId),direction);if(entry)selectIds([entry.id]);}
$('mesh-mode-select').onchange=()=>{meshMode=$('mesh-mode-select').value==='single'?'single':'multiple';if(meshMode==='single'&&selected.size>1)selectIds([selected.has(lastMeshId)?lastMeshId:orderedIds().at(-1)]);else renderList();};
$('mesh-file-select').onchange=()=>{const entry=catalogById.get(lastMeshId);if(!entry)return;meshPreference=objectFilePreference(meshFiles(entry),$('mesh-file-select').value);syncMeshFiles();renderList();loadSelection();};
$('previous-mesh-id').onclick=()=>navigateMesh(-1);$('next-mesh-id').onclick=()=>navigateMesh(1);
document.addEventListener('keydown',event=>{if(onlineRequested)return;const direction=objectNavigationDirection(event,{multiple:meshMode!=='single',flying:!!viewer?.fly?.active});if(direction){event.preventDefault();navigateMesh(direction);}});
function renderSelection(syncInput = true) {
  $('selection-count').textContent = t('已勾选 {0} 个', [selected.size]);
  $('previous-group').disabled = !selected.size; $('next-group').disabled = !selected.size;
  $('previous-group').hidden=meshMode==='single';$('next-group').hidden=meshMode==='single';
  const fragment = document.createDocumentFragment();
  for (const id of orderedIds()) {
    const chip = document.createElement('span'); chip.className = 'model-chip';
    const focus = document.createElement('button'); focus.textContent = `# ${id}`;
    focus.title = cache.has(id) ? t("{0} · 点击单独查看", [sizeText(cache.get(id))]) : t('单独查看模型 ') + id;
    focus.onclick = () => selectIds([id]);
    const remove = document.createElement('button'); remove.className = 'remove-chip'; remove.textContent = '×';
    remove.setAttribute('aria-label', t("移除模型 {0}", [id]));
    remove.onclick = () => selectIds([...selected].filter(value => value !== id));
    chip.append(focus, remove); fragment.append(chip);
  }
  if (!selected.size) {
    const hint = document.createElement('span'); hint.className = 'selected-empty'; hint.textContent = t('尚未选择模型'); fragment.append(hint);
  }
  $('selected-models').replaceChildren(fragment);
  if (syncInput) $('batch-ids').value = orderedIds().join(', ');
}
function selectIds(ids) {
  if(online){if(ids.length)online.select(String(ids.at(-1)));return true;}
  let unique = [...new Set(ids.map(String))];
  if(meshMode==='single'&&unique.length>1)unique=unique.slice(-1);
  const invalid = unique.filter(id => !catalogById.has(id));
  if (invalid.length) { showError(t("找不到模型编号：{0}", [invalid.slice(0, 8).join('、')])); return false; }
  selected = new Set(unique);lastMeshId=unique.at(-1)||null;syncMeshFiles(); clearError(); renderSelection(); renderList(); loadSelection(); return true;
}
function applyBatch(append) {
  try { const ids = parseLodIds($('batch-ids').value, catalogById);if(ids.length>1)meshMode='multiple'; selectIds(append ? [...selected, ...ids] : ids); }
  catch (error) { showError(error.message); }
}
async function loadSelection() {
 if(online){renderOnlineScene(true);return;}
 const version=++generation;controller?.abort();controller=new AbortController();const signal=controller.signal,ids=orderedIds();
 configureMeshPanes();
 if(!ids.length){meshFileCache.setActive([]);currentModels=[];paneModels=[[],[],[]];meshCloudItems=[];meshComparison.pause(()=>activeMeshViewers().forEach(v=>v.setModels([])));cameraControls?.refresh();animationControls?.refresh();renderLabels([]);updateHeightLegend();$('loading').hidden=true;$('empty-state').hidden=false;$('screenshot').disabled=true;$('scene-stats').textContent=t('未选择模型');for(let i=1;i<=3;i++)$(`mesh-panel-label-${i}`).textContent='';return;}
 const plans=ids.map(id=>{const entry=catalogById.get(id),files=meshFiles(entry);return {id,entry,meshes:Array.from({length:meshPaneCount},(_,i)=>resolveObjectFile(files,i===0?meshPreference:meshVariants[i],i)),cloud:resolveObjectFile(meshCloudFiles(entry),meshCloudPreference)};});
 meshFileCache.setActive(plans.flatMap(plan=>[...plan.meshes,plan.cloud]));
 const sameIds=currentModels.map(m=>String(m.id)).sort().join('\0')===[...ids].sort().join('\0');
 const progress=createBatchProgress($('loading'),{total:ids.length,unit:'个对象',current:()=>version===generation});$('loading').hidden=false;$('empty-state').hidden=true;$('screenshot').disabled=true;clearError();
 const results=new Map(),failures=[];let next=0,complete=0,failed=0;
 const read=async(file,kind)=>file?meshFileCache.read(file,kind,{maxPoints:0,signal}):null;
 async function worker(){while(next<plans.length&&!signal.aborted){const plan=plans[next++];const values=await Promise.allSettled([...plan.meshes.map(file=>read(file,'wire')),read(plan.cloud,'cloud')]);if(version!==generation)return;
   const data=values.map((r,i)=>{if(r.status==='fulfilled')return r.value;if(r.reason?.name!=='AbortError')failures.push(`${plan.id} / ${(plan.meshes[i]||plan.cloud)?.name||''}: ${r.reason?.message}`);return null;});results.set(plan.id,data);if(values.some(v=>v.status==='rejected'))failed++;progress.report(++complete,failed);
 }}
 try{await Promise.all(Array.from({length:Math.min(3,plans.length)},worker));if(version!==generation)return;progress.prepare();
   const saved=cameraControls?.preserveView&&(meshMode==='multiple'||sameIds)?cameraControls.capture():null;
   paneModels=Array.from({length:meshPaneCount},()=>[]);meshCloudItems=[];cache.clear();
   for(const plan of plans){const values=results.get(plan.id)||[];for(let i=0;i<meshPaneCount;i++)if(values[i])paneModels[i].push({...values[i],id:plan.id,name:plan.meshes[i].name});const cloud=values[meshPaneCount];if(cloud)meshCloudItems.push({id:plan.id,key:plan.cloud,name:plan.cloud.name,cloud});}
   currentModels=paneModels[0];for(const m of currentModels)cache.set(m.id,m);
   const referenceModels=meshReferenceModels(paneModels,meshCloudItems);meshPointFields();
   meshComparison.pause(()=>activeMeshViewers().forEach((v,i)=>{v.setModels(paneModels[i],{referenceModels,clouds:meshCloudItems});v.setOptions(paneOptions(i));}));
   if(saved&&referenceModels.length)cameraControls.restore(saved,{checkScene:false});else meshComparison.sync();
   updateOptions();cameraControls?.refresh();animationControls?.refresh();
   const triangles=paneModels.flat().reduce((n,m)=>n+m.faces.length,0),points=meshCloudItems.reduce((n,item)=>n+item.cloud.count,0);
   $('scene-stats').textContent=t('{0} 个 ID · {1} 三角面 · {2} 点',[referenceModels.length,number(triangles),number(points)]);
   updateMeshPaneLabels();
   $('screenshot').disabled=!referenceModels.length;$('empty-state').hidden=!!referenceModels.length;
   if(failures.length)showError(failures.join('；'),true);renderSelection(false);
 }catch(error){if(version===generation&&error.name!=='AbortError')showError(t('显示失败：{0}',[error.message]),true);}
 finally{if(version===generation){$('loading').hidden=true;mobileSession?.schedule();}}
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
function updateMeshPaneLabels(){if(online){online.labels();return;}for(let i=0;i<meshPaneCount;i++)setNameSummary($(`mesh-panel-label-${i+1}`),orderedIds().map(id=>{const model=paneModels[i]?.find(m=>String(m.id)===String(id));return `${id} / ${paneOptions(i).showMesh?(model?.name||t('仅点云')):t('仅点云')}`;}),t('未加载数据'));}
function updateOptions() {
  const savedView = cameraControls?.preserveView && $('scale-mode').value !== options.scale ? cameraControls.capture() : null;
  options = {...options,mode: $('display-mode').value, scale: $('scale-mode').value, colors: $('color-mode').value, edges: $('show-edges').checked, labels: $('show-labels').checked, grid: $('show-grid').checked, ...paletteControls?.getOptions()};
  options={...options,pointColorMode:$('mesh-point-color-mode').value,pointColor:$('mesh-point-color').value,pointSize:Number($('mesh-point-size').value),pointOpacity:Number($('mesh-point-opacity').value),pointStyle:$('mesh-point-style').value};
  meshComparison.pause(()=>activeMeshViewers().forEach((v,i)=>v.setOptions(paneOptions(i))));
  $('mesh-point-size-value').value=options.pointSize;$('mesh-point-opacity-value').value=Math.round(options.pointOpacity*100)+'%';
  updateMeshPaneLabels();
  $('mesh-point-note').textContent=[...new Set(activeMeshViewers().flatMap(v=>v.pointLayer?.fallbacks||[]))].join(' ');
  if (savedView && currentModels.length) cameraControls.restore(savedView, {checkScene: false});
  paletteControls?.setScalarEnabled(options.colors==='height'||meshCloudItems.length>0&&(options.pointColorMode==='height'||options.pointColorMode?.startsWith('field:')));
  if(options.colors!=='height')paletteControls?.setDataRange(viewer?.pointLayer?.colorRange);
  cameraControls?.refresh(); animationControls?.refresh(); updateHeightLegend();
  $('layout-title').textContent = options.scale === 'real' ? t('等比例陈列') : t('统一展示大小');
  $('layout-note').textContent = options.scale === 'real' ? t('独立模型重新排列 · 非实际地理位置') : t('各模型独立等比缩放 · 不可比较实际大小');
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
  meshMode='multiple';
  const pool = catalog.map(m => m.id);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  selectIds(pool.slice(0, 6));
};
$('previous-group').onclick = () => nextGroup(-1);
$('next-group').onclick = () => nextGroup(1);
$('fit-view').onclick = () => meshComparison.pause(()=>activeMeshViewers().forEach(v=>v.fit()));
$('zoom-in').onclick = () => meshComparison.pause(()=>activeMeshViewers().forEach(v=>v.zoomBy(1.2)));
$('zoom-out').onclick = () => meshComparison.pause(()=>activeMeshViewers().forEach(v=>v.zoomBy(1 / 1.2)));

$('retry').onclick = () => { clearError(); if (!catalog.length || !viewer) init(); else loadSelection(); };
$('dismiss-error').onclick = clearError;
for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => {
  meshComparison.pause(()=>activeMeshViewers().forEach(v=>v.setView(button.dataset.view)));
  for (const other of document.querySelectorAll('[data-view]')) { other.classList.toggle('active', other === button); other.setAttribute('aria-pressed', String(other === button)); }
};
for (const id of ['display-mode', 'scale-mode', 'color-mode', 'show-edges', 'show-labels', 'show-grid']) $(id).onchange = updateOptions;
document.addEventListener('keydown', event => {
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)) return;
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); meshComparison.pause(()=>activeMeshViewers().forEach(v=>v.fit())); }
});

function ensureViewer() {
  if (!viewer){viewer = new MeshViewer($('scene'), {onLabels: renderLabels, onError: message => message ? showError(String(message), true) : clearError()});meshViewers=[viewer];meshComparison.install(viewer);}
  if (!paletteControls && $('palette-controls')) paletteControls = mountPaletteControls({container: $('palette-controls'), getOptions: () => options, onChange: updateOptions});
  if (!cameraControls && $('camera-controls')) cameraControls = mountCameraControls({container: $('camera-controls'), bookmarkContainer: $('bookmark-controls'), getViewers: activeMeshViewers,pauseSync:meshComparison.pause, space: 'lod-arrangement', getScene: () => ({ids:(viewer?.sceneData?.referenceModels||currentModels).map(model=>String(model.id)),scale:options.scale})});
  options = {...options, ...paletteControls?.getOptions()};
  viewer.setOptions(options); paletteControls?.setScalarEnabled(options.colors === 'height');
}
function folderReady(fileList, paths = null) {
  const result = appendLodFiles(catalog, modelProject, [...fileList], paths);
  catalog.sort((a,b) => a.id.localeCompare(b.id,undefined,{numeric:true}));
  catalogById = new Map(catalog.map(model => [model.id,model]));
  localFiles = new Map(catalog.map(model => [model.id,model.file]));syncMeshFiles();
  $('search').value = '';
  $('source-path').textContent = t('文件留在本机 · 分组仅保留在本次页面');
  $('folder-status').textContent = t('{0} 个 ID · {1} 个 OBJ · 按需读取',[number(catalog.length),number(catalog.reduce((sum,entry)=>sum+meshFiles(entry).length,0))]);
  $('total-count').textContent = t("{0} 个模型", [number(catalog.length)]);
  if (!result.added && !result.duplicates) showError(t('未找到支持的模型或点云文件。'));
  else clearError();
  renderList();if(selected.size&&result.added)loadSelection(); return result;
}
function changeModelVisibility(members, checked) {
  const next = new Set(selected);
  if(checked&&meshMode==='single'){if(members.length!==1)return;next.clear();}
  for (const model of members) checked ? next.add(model.id) : next.delete(model.id);
  selectIds([...next]);
}
function removeModelEntries(members) {
  const removed = new Set(members);
  ++generation; controller?.abort();
  for (const model of members) { for(const file of [...meshFiles(model),...meshCloudFiles(model)])meshFileCache.forget(file);cache.delete(model.id); localFiles.delete(model.id); catalogById.delete(model.id); selected.delete(model.id); }
  catalog = catalog.filter(model => !removed.has(model));
  $('total-count').textContent = t("{0} 个模型", [number(catalog.length)]);
  $('folder-status').textContent = t('{0} 个 ID · {1} 个 OBJ · 按需读取',[number(catalog.length),number(catalog.reduce((sum,entry)=>sum+meshFiles(entry).length,0))]);
  selectIds([...selected]);
}
const importLodRecords=archiveImportQueue({accepts:name=>/\.(obj|xyz|txt|csv|pts|ply|pcd)$/i.test(name),
  receive:records=>folderReady(records.map(item=>item.file),new Map(records.map(item=>[item.file,item.path]))),
  onProgress:message=>{$('drop-status').hidden=false;$('drop-status').textContent=message;},onError:showError});
const pickLodFiles=event=>{const records=Array.from(event.target.files,file=>({file,path:file.webkitRelativePath||file.name}));event.target.value='';importLodRecords(records).catch(()=>{});};
$('choose-folder').onclick = () => $('folder-input').click();
$('folder-input').onchange = pickLodFiles;

function init() {
  try {
    ensureViewer();
    mountViewerLayout({getViewers: activeMeshViewers,pauseSync:meshComparison.pause});
    if(!isMobileApp()&&!animationControls)animationControls=mountCameraAnimation({adapter:createMeshAnimationAdapter({getViewer:()=>viewer,getModels:()=>currentModels,getScene:()=>({ids:currentModels.map(m=>String(m.id)),scale:options.scale})}),toolbar:document.querySelector('.viewer-toolbar'),anchor:$('viewport')});
    if(onlineRequested){startOnlineWorkspace();return;}
    if (!modelTree) modelTree = mountProjectTree({
      project: modelProject, container: $('model-list'), root: $('project-root'), controls: $('project-controls'),
      getEntries: () => catalog, getSelected: () => new Set(catalog.filter(model => selected.has(model.id))),
      getMode: () => meshMode, getQuery: () => $('search').value.trim().replace(/^#/,''),
      onToggle: model => changeModelVisibility([model],!selected.has(model.id)),
      onGroupSelection: (members,checked)=>{if(meshMode==='multiple')changeModelVisibility(members,checked);}, onVisibility: changeModelVisibility,
      onRemove: removeModelEntries, onChange: renderList, detail: model => `${meshFiles(model).length} OBJ · ${meshCloudFiles(model).length} PC`,
    });
    mountPointDrop({zone: document.querySelector('.sidebar'), status: $('drop-status'), accepts: name => /\.(obj|xyz|txt|csv|pts|ply|pcd|zip)$/i.test(name), onFiles: importLodRecords});
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
    $('folder-status').textContent = t('导入模型或点云 · 文件仅在本机读取');
    selectIds([]);
    mountMobileProject({receive:importLodRecords,getState:()=>({objectImportVersion:2,mode:meshMode,meshPreference,pointColorMode:meshPendingColorMode||$('mesh-point-color-mode').value,comparison:{count:meshPaneCount,variants:meshVariants,cloud:meshCloudPreference},tree:{...snapshotProjectTree(modelProject,catalog),knownIds:mobileKnownIds},selected:[...selected],inputs:captureMobileInputs(),camera:currentModels.length||meshCloudItems.length?cameraControls?.capture():null}),restoreState:async (state,records)=>{
      state=migrateObjectImportState(state,records,catalog,'mesh');
      mobileKnownIds=[...new Set([...(state?.tree?.knownIds||[]),...catalog.map(e=>e.id)])];
      if(state){meshPendingColorMode=typeof state.pointColorMode==='string'?state.pointColorMode:null;meshPaneCount=[2,3].includes(state.comparison?.count)?state.comparison.count:1;meshVariants=Array.from({length:3},(_,i)=>state.comparison?.variants?.[i]||null);meshCloudPreference=state.comparison?.cloud||null;configureMeshPanes();meshMode=state.mode==='single'?'single':'multiple';meshPreference=state.meshPreference?.none?null:state.meshPreference||null;catalog=restoreProjectTree(modelProject,catalog,state.tree);catalogById=new Map(catalog.map(e=>[e.id,e]));localFiles=new Map(catalog.map(e=>[e.id,e.file]));selected=new Set((state.selected||[]).filter(id=>catalogById.has(id)));lastMeshId=[...selected].at(-1)||null;syncMeshFiles();restoreMobileInputs(state.inputs);updateOptions();renderSelection();renderList();await loadSelection();if(state.camera&&(currentModels.length||meshCloudItems.length))cameraControls.restore(state.camera,{checkScene:false});}
      $('source-path').textContent=t('项目自动保存在此设备');
    },onBackground:()=>{meshFileCache.trim();for(const id of cache.keys())if(!selected.has(id))cache.delete(id);}}).then(session=>{mobileSession=session;});
  } catch (error) {
    $('scene-stats').textContent = t('查看器暂时无法启动');
    $('loading').hidden = true;
    showError(t("查看器启动失败：{0}。请使用支持 WebGL 的浏览器。", [error.message]), true);
    $('empty-state').hidden = false;
  }
}
$('mesh-compare-count').onchange=async()=>{meshPaneCount=Number($('mesh-compare-count').value);await loadSelection();const version=generation;requestAnimationFrame(()=>{if(version!==generation)return;meshComparison.pause(()=>activeMeshViewers().forEach(v=>v.fit()));meshComparison.sync();});};
$('mesh-sync-camera').onchange=()=>{if($('mesh-sync-camera').checked)meshComparison.sync();};
$('mesh-cloud-file').onchange=()=>{const value=$('mesh-cloud-file').value;meshCloudPreference=value==='auto'?null:value==='none'?{none:true}:objectFilePreference(meshCloudFiles(catalogById.get(lastMeshId)),value);loadSelection();};
for(let i=0;i<3;i++){
 $(`mesh-variant-${i+1}`).onchange=()=>{const pref=objectFilePreference(meshFiles(catalogById.get(lastMeshId)),$(`mesh-variant-${i+1}`).value);if(i===0)meshPreference=pref;else meshVariants[i]=pref;syncMeshFiles();renderList();loadSelection();};
 $(`mesh-layers-${i+1}`).onchange=updateOptions;
}
for(const id of ['mesh-point-color-mode','mesh-point-color','mesh-point-style'])$(id).onchange=updateOptions;
for(const id of ['mesh-point-size','mesh-point-opacity'])$(id).oninput=updateOptions;

const onlineConfiguration={
 getPalette:()=>paletteControls?.getOptions(),setPalette:value=>paletteControls?.setOptions(value),
 points:{get:()=>{const item=meshCloudItems[0];return item?{cloud:item.rawCloud||item.cloud,settings:item.cloud.semantics||defaultPointSettings(item.cloud)}:null;},
  apply:async settings=>{const next=meshCloudItems.map(item=>{const raw=item.rawCloud||item.cloud;return {...item,rawCloud:raw,cloud:semanticPointCloud(raw,settingsForCloud(raw,settings),{strict:true})};});onlinePointSettings=settings;meshCloudItems=next;meshPointFields();if(online)renderOnlineScene(true);else meshComparison.pause(()=>activeMeshViewers().forEach(v=>{v.setClouds(next);v.setOptions(paneOptions(meshViewers.indexOf(v)));}));}}
};

init();

if(!onlineRequested)mountOnlinePreview({viewer:'lod',captureCamera:()=>cameraControls?.capture(),applyView:applyOnlineView,configuration:onlineConfiguration,ready:()=>!!(currentModels.length||meshCloudItems.length),cancelParse:()=>{controller?.abort();generation++;$('loading').hidden=true;},replaceFile:async(file,preset,signal)=>{
  removeModelEntries([...catalog]);folderReady([file]);if(signal.aborted)return;
  applyPreviewPreset(preset);selected=new Set(catalog.map(entry=>entry.id));lastMeshId=[...selected].at(-1)||null;syncMeshFiles();renderSelection();renderList();await loadSelection();
  if(!signal.aborted){applyPreviewPreset(preset);$('source-path').textContent=t('在线共享预览 · 仅本次页面');}
}});

function renderOnlineScene(preserve=false){
  const saved=preserve&&onlineReference.length?cameraControls?.capture():null;
  configureMeshPanes();paneModels=Array.from({length:meshPaneCount},()=>currentModels);
  meshComparison.pause(()=>activeMeshViewers().forEach((v,i)=>{
    v.setModels(currentModels,{referenceModels:onlineReference,clouds:meshCloudItems});v.setOptions(paneOptions(i));
  }));
  if(saved)cameraControls.restore(saved,{checkScene:false});else meshComparison.sync();
  $('screenshot').disabled=!onlineReference.length;cameraControls?.refresh();animationControls?.refresh();updateOptions();
}
async function applyOnlineView(view){
  if(view.pointSettings)await onlineConfiguration.points.apply(view.pointSettings);
  if(view.palette)paletteControls?.setOptions(view.palette);
  if(view.controls['mesh-compare-count'])meshPaneCount=Number(view.controls['mesh-compare-count']);
  applyPresentationControls(view,{exclude:['mesh-compare-count']});
  if(online)renderOnlineScene(true);else await loadSelection();
  if(view.camera)cameraControls?.restore(view.camera,{checkScene:false});
}
function startOnlineWorkspace(){
  if(online)return;
  if(isMobileApp()||!/^https?:$/.test(location.protocol))throw Error('在线资源仅供网页版使用 / Online resources require the web viewer');
  const descriptor=readCompareDescriptor();
  meshPaneCount=2;meshMode='single';
  $('mesh-layers-1').value='cloud';$('mesh-layers-2').value='mesh';$('mesh-sync-camera').checked=true;
  $('show-labels').checked=false;$('show-grid').checked=descriptor.preset.grid;
  $('mesh-point-color-mode').value=descriptor.preset.colorMode||'height';
  $('mesh-point-size').value=descriptor.preset.pointSize;$('mesh-point-opacity').value=descriptor.preset.pointOpacity;
  if(descriptor.preset.pointColor)$('mesh-point-color').value=descriptor.preset.pointColor;
  online=mountOnlineLod({descriptor,onError:showError,refresh:()=>renderOnlineScene(true),captureCamera:()=>cameraControls?.capture(),applyView:applyOnlineView,configuration:onlineConfiguration,isFlying:()=>!!viewer?.fly?.active,
    onReset:id=>{
      generation++;controller?.abort();selected=new Set([id]);lastMeshId=id;cache.clear();currentModels=[];meshCloudItems=[];onlineReference=[];onlineBounds=null;onlineNodes=new Set();
      renderOnlineScene();
    },
    onMesh:({id,mesh})=>{
      currentModels=[{...mesh,id,name:'final.obj'}];cache.set(id,currentModels[0]);onlineReference=meshReferenceModels([currentModels],[]);renderOnlineScene();
    },
    onCloud:({id,cloud,bounds})=>{
      const rawCloud=cloud;if(onlinePointSettings)cloud=semanticPointCloud(rawCloud,settingsForCloud(rawCloud,onlinePointSettings),{strict:true});
      onlineBounds=bounds;meshCloudItems=[{id,key:'root',rawCloud,cloud,colorBounds:bounds}];onlineNodes.add('r');
      onlineReference=meshReferenceModels([currentModels],[{id,cloud:{bounds}}]);meshPointFields();renderOnlineScene();
    },
    onRefinement:({id,nodeId,cloud})=>{
      if(id!==lastMeshId||onlineNodes.has(nodeId))return;
      const rawCloud=cloud;if(onlinePointSettings)cloud=semanticPointCloud(rawCloud,settingsForCloud(rawCloud,onlinePointSettings),{strict:true});
      const next=[...meshCloudItems,{id,key:nodeId,rawCloud,cloud,colorBounds:onlineBounds}];
      meshComparison.pause(()=>activeMeshViewers().forEach(v=>v.setClouds(next)));
      meshCloudItems=next;onlineNodes.add(nodeId);
    },
  });
  configureMeshPanes();
  applyPreviewPreset({grid:descriptor.preset.grid,palette:descriptor.preset.palette,reverse:descriptor.preset.reverse});updateOptions();
  void online.start();
}
