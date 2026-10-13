import { mountRenderDiagnostics } from '../shared/render-diagnostics.js';
import { openWorkspaceSession } from '../shared/workspace-session.js';
import { isMobileApp, snapshotProjectTree, restoreProjectTree, captureMobileInputs, restoreMobileInputs } from '../shared/mobile-project.js';
import { captureCameraSnapshot, applyCameraSnapshot } from '../shared/camera-controls.js';
import { gsProjectBlob, gsReadProjectBlob, gsEntryFlags } from './project-state.js';
import { initializeLocale, t } from '../shared/i18n.js';
import { ViewerProject } from '../shared/project-model.js';
import { mountProjectTree } from '../shared/project-tree.js';
import { projectFileKey, projectUniqueId } from '../shared/project-import.js';
import { mountPointDrop } from '../shared/point-drop.js';
import { archiveImportQueue } from '../shared/zip-import.js';
import { mountGaussianEditor } from './editor-controls.js';
import { mountViewerLayout } from '../shared/viewer-layout.js';
import { GaussianViewer } from './renderer.js';
import { gsParseCameras, gsParseGaussianPly } from './ply.js';
import { gsViewingProfile } from './preview.js';

async function gsBoot() {
  initializeLocale();
  const gs$ = id => document.getElementById(id);
  const en=document.documentElement.lang==='en', label=(zh,english)=>en?english:zh;
  const mobileView=isMobileApp()||matchMedia('(pointer: coarse)').matches;
  const profileLabel=document.createElement('label'),profileSelect=document.createElement('select');
  profileSelect.id='gs-profile';profileLabel.textContent=label('查看性能','Viewing performance');profileSelect.setAttribute('aria-label',profileLabel.textContent);
  for(const [value,zh,english] of [['auto','自动 · 全量','Auto · all splats'],['balanced','流畅画质 · 全量','Responsive · all splats'],['full','精细画质 · 全量','Detailed · all splats'],['points','中心点显示 · 全量','Centers · all splats']]){
    const o=document.createElement('option');o.value=value;o.textContent=label(zh,english);profileSelect.append(o);
  }
  profileLabel.append(profileSelect);const controls=gs$('settings-panel-display').querySelector('.render-controls');controls.prepend(profileLabel);
  const pipelineLabel=document.createElement('label'),pipelineToggle=document.createElement('input');pipelineToggle.type='checkbox';pipelineToggle.checked=false;
  pipelineToggle.id='gs-gpu-projection';pipelineLabel.append(pipelineToggle,document.createTextNode(label('试用投影复用（全量）','Try projection reuse (all splats)')));controls.append(pipelineLabel);pipelineToggle.setAttribute('aria-label',label('试用投影复用（全量）','Try projection reuse (all splats)'));pipelineLabel.title=label('不同 GPU 效果不同，可开关对比；两种方式都保留全部高斯。','Results vary by GPU. Compare on/off; both retain all splats.');
  pipelineToggle.onchange=()=>{if(gsViewer){gsViewer.gpuProjection=pipelineToggle.checked;gsViewer.projectionBlockedCount=null;gsViewer.requestRender();}};
  const performanceNote=document.createElement('p');performanceNote.className='presentation-help';performanceNote.textContent=label('始终保留全部高斯。交互降质仅降低像素与颜色阶数，停止移动后恢复；不会抽稀。截图导出使用设定的完整颜色。','All splats are retained. Interaction quality changes pixels and color bands only, restoring after motion stops. Image export uses the selected full color quality.');profileLabel.after(performanceNote);
  const qualityField=(id,zh,eng,type,min,max,step,value)=>{const labelEl=document.createElement('label');labelEl.textContent=label(zh,eng);const input=document.createElement('input');input.id=id;input.type=type;if(min!=null){input.min=min;input.max=max;input.step=step;}input.value=value;input.setAttribute('aria-label',label(zh,eng));labelEl.append(input);controls.append(labelEl);return input;};
  const resolution=qualityField('gs-resolution','渲染像素倍率','Render pixel ratio','range',.5,2,.25,1),resolutionValue=document.createElement('output');resolution.after(resolutionValue);
  const interaction=qualityField('gs-interaction-quality','移动时降低画质','Reduce quality during motion','checkbox',null,null,null,'on');
  const motionLabel=document.createElement('label');motionLabel.textContent=label('移动时颜色阶数','Color bands during motion');const motionDegree=document.createElement('select');motionDegree.id='gs-motion-sh';motionDegree.setAttribute('aria-label',motionLabel.textContent);for(const n of [0,1,2,3]){const o=document.createElement('option');o.value=n;o.textContent=String(n);motionDegree.append(o);}motionLabel.append(motionDegree);controls.append(motionLabel);
  const profile=()=>gsViewingProfile(profileSelect.value,mobileView,gsViewer?.softwareRendering);
  function applyQuality(){if(!gsViewer)return;gsViewer.gpuProjection=pipelineToggle.checked;gsViewer.pixelRatioLimit=Number(resolution.value);gsViewer.interactionScale=interaction.checked?.65:1;gsViewer.interactionDegree=interaction.checked?Number(motionDegree.value):3;gsViewer.pointPreview=profile().points;resolutionValue.value=Number(resolution.value).toFixed(2)+'×';motionDegree.disabled=!interaction.checked;gsViewer.requestRender();}
  function presetQuality(){const q=profile();resolution.value=q.dpr;interaction.checked=q.interactionScale<1;motionDegree.value=q.interactionDegree;applyQuality();}
  resolution.oninput=interaction.onchange=motionDegree.onchange=applyQuality;
  const initialQuality=gsViewingProfile('auto',mobileView);resolution.value=initialQuality.dpr;interaction.checked=initialQuality.interactionScale<1;motionDegree.value=initialQuality.interactionDegree;
  const gsProject = new ViewerProject();
  const gsEntries = [], gsSelected = new Set(), gsCatalogs = [];
  let nativeSession=null,editRevision=0,knownIds=[];const nativeApp=isMobileApp();
  let gsEditor = null, gsViewer = null, gsSerial = 0, gsMode = 'multiple';
  const gsAccept = name => /\.(ply|json|zip)$/i.test(name);
  const gsBytes = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const gsSay = message => { const note = gs$('data-notes'); note.textContent = message || ''; };
  const gsError = message => { const box = gs$('error'); box.hidden = !message; box.querySelector('span').textContent = message || ''; };
  const gsLoading = (message, fraction=null) => { const box = gs$('loading'); box.hidden = !message; if (message) box.querySelector('span').textContent = message;
    let progress=box.querySelector('progress');if(!progress){progress=document.createElement('progress');progress.max=1;progress.setAttribute('aria-label',label('文件解析进度','File parsing progress'));box.append(progress);}
    const known=Number.isFinite(fraction);progress.hidden=!known;box.classList.toggle('has-progress',known);if(known)progress.value=Math.max(0,Math.min(1,fraction));
  };

  const distanceLabel=document.createElement('label'),distanceToggle=document.createElement('input'),distanceRange=document.createElement('input'),distanceValue=document.createElement('output');
  distanceToggle.type='checkbox';distanceToggle.id='gs-distance-enabled';distanceToggle.setAttribute('aria-label',label('限制视距','Limit viewing distance'));
  distanceRange.type='range';distanceRange.id='gs-distance';distanceRange.min=.25;distanceRange.max=10;distanceRange.step=.05;distanceRange.value=3;distanceRange.disabled=true;distanceRange.setAttribute('aria-label',label('视距范围','Viewing distance'));
  distanceLabel.append(distanceToggle,document.createTextNode(label('限制视距','Limit viewing distance')),distanceRange,distanceValue);gs$('settings-panel-display').querySelector('.render-controls').append(distanceLabel);
  const distanceHint=document.createElement('p');distanceHint.className='presentation-help';distanceHint.textContent=label('默认不裁切。视距以相机为中心，远处逐渐淡出；若看不到模型，请增大距离或关闭。只影响显示。','No clipping by default. Distant splats fade out around the camera. Increase the distance or disable if the model disappears. Display only.');distanceLabel.after(distanceHint);
  function updateDistance(){
    const bounds=gsViewer?.bounds,extent=bounds?Math.hypot(...bounds[0].map((v,i)=>bounds[1][i]-v)):1;
    const distance=Math.max(.001,extent)*Number(distanceRange.value);distanceRange.disabled=!distanceToggle.checked;
    distanceValue.value=distanceToggle.checked?distance.toFixed(2)+label(' 坐标单位',' coordinate units'):label('不限','Unlimited');
    if(gsViewer){gsViewer.viewDistance=distanceToggle.checked?distance:0;gsViewer.requestRender();}
  }
  distanceToggle.onchange=distanceRange.oninput=updateDistance;updateDistance();

  function gsCatalogFor(entry) {
    const dir = (entry.path || '').split('/').slice(0, -1).join('/');
    let best = null, bestLength = -1;
    for (const catalog of gsCatalogs) {
      const catalogDir = catalog.path.split('/').slice(0, -1).join('/');
      if (catalogDir === '' || dir === catalogDir || dir.startsWith(`${catalogDir}/`)) {
        if (catalogDir.length >= bestLength) { best = catalog; bestLength = catalogDir.length; }
      }
    }
    return best;
  }

  function gsList() {
    const query = gs$('search').value;
    const matched = gsEntries.filter(entry => gsProject.matches(entry, query));
    gs$('filter-count').textContent = t('匹配 {0} 项 · 已勾选 {1}', [matched.length, gsSelected.size]);
    gs$('item-count').textContent = t('共 {0} 项', [gsEntries.length]);
    gs$('select-all-splats').disabled = gsMode !== 'multiple' || !matched.length;
    gs$('invert-splat-selection').disabled = gsMode !== 'multiple' || !matched.length;
    gs$('gs-mode').value = gsMode;
    gsTree?.render();
    gsRefreshCameras();
  }

  function gsRefreshCameras() {
    const select = gs$('gs-camera'), previous = select.value, catalogs = [];
    for (const entry of gsSelected) {
      const catalog = gsCatalogFor(entry);
      if (catalog && !catalogs.includes(catalog)) catalogs.push(catalog);
    }
    select.replaceChildren();
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = t('不使用训练相机'); select.append(empty);
    catalogs.forEach((catalog, catalogIndex) => catalog.cameras.forEach((camera, index) => {
      const option = document.createElement('option'); option.value = `${catalogIndex}:${index}`; option.textContent = camera.name; select.append(option);
    }));
    select.dataset.catalogs = String(catalogs.length);
    select.disabled = catalogs.length === 0;
    select._catalogs = catalogs;
    if ([...select.options].some(option => option.value === previous)) select.value = previous; else select.value = '';
    gs$('gs-camera-note').textContent = catalogs.length
      ? t('已记录 {0} 个训练相机。使用完整旋转、位置和焦距。', [catalogs.reduce((sum, catalog) => sum + catalog.cameras.length, 0)])
      : t('把 cameras.json 和 point_cloud.ply 一起导入后，可以跳到训练机位。');
  }

  async function gsApply({preserveView = false} = {}) {
    const serial = ++gsSerial;
    const selected = [...gsSelected];
    if (!selected.length) {
      gsLoading(''); gs$('empty-state').hidden = false; gs$('screenshot').disabled = true;
      gs$('current-title').textContent = t('未选择数据'); gs$('scene-stats').textContent = t('从左侧选择要查看的数据');
      gs$('geometry-note').textContent = t('未选择数据时保持空白');
      gsViewer?.clearSplats(); gsEditor?.setLoading(false);gsEditor?.sceneChanged(); gsList(); return;
    }
    gsLoading(t('正在读取文件…')); gs$('empty-state').hidden = true; gsError('');
    const degree = Number(gs$('gs-sh').value);
    gs$('gs-sh').disabled=false;
    gsEditor?.setLoading(true);
    const models = [];
    let missingRest = false;
    try {
      for (const entry of selected) {
        if (serial !== gsSerial) return;
        if (!entry.parsed || entry.parsed.preview) {
          gsLoading(t('正在读取 {0}…', [entry.treeName || entry.file.name]));
          if(entry.parsed&&!entry.parsed.preview){entry.savedFlags=entry.parsed.editFlags;gsEditor?.edits.releaseGeometry(entry.parsed);}
          const onProgress=(done,total)=>{if(serial===gsSerial)gsLoading(t('正在解析 {0}（{1}%）',[entry.treeName||entry.file.name,Math.floor(done/total*100)]),total>0?done/total:null);};
          const parsed=await gsParseGaussianPly(await entry.file.arrayBuffer(),{includeRest:true,onProgress});
          if(serial!==gsSerial)return;
          if(entry.savedFlags){
            if(entry.savedFlags.length!==parsed.sourceCount)throw Error('Gaussian snapshot does not match source');
            parsed.editFlags=parsed.preview?Uint8Array.from({length:parsed.count},(_,i)=>entry.savedFlags[i*parsed.sampleStep]):entry.savedFlags;
          }
          entry.parsed=parsed;
        }
        if (!entry.parsed.hasRest) missingRest = true;
        entry.parsed.name = entry.treeName || entry.file.name;
        gsEditor?.edits.attach(entry.parsed);
        models.push(entry.parsed);
      }
      if (serial !== gsSerial) return;
      const useDegree = degree;
      applyQuality();
      gsViewer.setModels(models, {preserveView, maxSplats: 0, shDegree: 3});updateDistance();
      gsEditor?.sceneChanged();
      gsViewer.setGaussianOptions({scale: Number(gs$('gs-scale').value), opacityCutoff: Number(gs$('gs-cutoff').value) / 100, background: gs$('gs-background').value, shDegree: useDegree});
      const shown = gsViewer.count, source = gsViewer.pointCount;
      gs$('current-title').textContent = selected.map(entry => entry.treeName || entry.id).join('、');
      gs$('scene-stats').textContent = t('已显示 {0} / {1} 个高斯', [shown.toLocaleString('zh-CN'), source.toLocaleString('zh-CN')]);
      gs$('geometry-note').textContent = t('原始尺度 · 可撤销编辑 · 本地处理');
      gs$('screenshot').disabled = false; gsLoading('');
      gsSay(missingRest ? t('此文件没有球谐系数，已保持 0 阶。') : '');
    } catch (error) {
      if (serial !== gsSerial) return;
      gsLoading(''); gsError(error.message); gs$('screenshot').disabled = !gsViewer?.count;
    }
    if(serial===gsSerial)gsEditor?.setLoading(false);
    gsList();
  }

  function gsToggle(entry) {
    if (gsMode === 'single') {
      if (gsSelected.has(entry)) gsSelected.delete(entry); else { gsSelected.clear(); gsSelected.add(entry); }
    } else if (gsSelected.has(entry)) gsSelected.delete(entry); else gsSelected.add(entry);
    gsApply({preserveView: true});
  }

  const gsTree = mountProjectTree({
    project: gsProject, container: gs$('splat-list'), root: gs$('project-root'), controls: gs$('project-controls'),
    getEntries: () => gsEntries, getSelected: () => gsSelected, getMode: () => gsMode, getQuery: () => gs$('search').value,
    onToggle: gsToggle, onChange: gsList, selectionHint: '勾选后显示高斯',
    detail: entry => entry.parsed ? t('{0} 个高斯', [entry.parsed.sourceCount.toLocaleString('zh-CN')]) : gsBytes(entry.file.size),
    onRemove: removed => { for (const entry of removed) { gsSelected.delete(entry); const index = gsEntries.indexOf(entry); if (index >= 0) gsEntries.splice(index, 1); } gsApply(); },
    onVisibility: (members, checked) => {
      if (gsMode === 'single') { gsSelected.clear(); if (checked && members.length === 1) gsSelected.add(members[0]); }
      else for (const entry of members) checked ? gsSelected.add(entry) : gsSelected.delete(entry);
      gsApply();
    },
    onGroupSelection: (members, checked) => { if (gsMode !== 'multiple') return; for (const entry of members) checked ? gsSelected.add(entry) : gsSelected.delete(entry); gsApply(); },
  });

  async function gsReceive(records) {
    const keys = new Set(gsEntries.map(entry => entry.key)), names = new Set(gsEntries.map(entry => entry.id));
    const cameraKeys = new Set(gsCatalogs.map(catalog => catalog.key));
    let added = 0, duplicates = 0, camerasAdded = 0;
    const warnings = [];
    for (const record of records) {
      const path = (record.path || record.file.webkitRelativePath || record.file.name).replaceAll('\\', '/');
      const key = projectFileKey(record.file, path);
      if (/\.json$/i.test(record.file.name)) {
        if (cameraKeys.has(key)) { duplicates += 1; continue; }
        try {
          const cameras = gsParseCameras(await record.file.text());
          gsCatalogs.push({key, path, cameras}); cameraKeys.add(key); camerasAdded += cameras.length; added += 1;
        } catch (error) { warnings.push(error.message); }
        continue;
      }
      if (!/\.ply$/i.test(record.file.name)) continue;
      if (keys.has(key)) { duplicates += 1; continue; }
      const entry = {id: projectUniqueId(path.replace(/\.ply$/i, ''), names), key, file: record.file, path};
      gsProject.assign(entry, path); gsEntries.push(entry); keys.add(key); added += 1;
    }
    gs$('search').value = ''; gs$('source-note').textContent = t('文件留在本机 · 分组仅保留在本次页面'); gsList();
    if (warnings.length) gsSay(warnings.join(' '));
    else if (camerasAdded) gsSay(t('已记录 {0} 个训练相机。使用完整旋转、位置和焦距。', [camerasAdded]));
    if (!added && !gsEntries.length) gsError(t('没有找到高斯 PLY。请选择 point_cloud.ply，或包含它的结果文件夹。'));
    return {added, duplicates};
  }

  const gsImport = archiveImportQueue({
    accepts: name => /\.(ply|json)$/i.test(name), receive: gsReceive,
    onProgress: message => { gs$('drop-status').hidden = false; gs$('drop-status').textContent = message; }, onError: gsError,
  });
  const gsPick = event => { const records = [...event.target.files].map(file => ({file, path: file.webkitRelativePath || file.name})); event.target.value = ''; gsImport(records).catch(() => {}); };
  mountPointDrop({zone: gs$('point-drop-zone'), status: gs$('drop-status'), accepts: gsAccept, onFiles: gsImport});
  gs$('choose-file').onclick = () => gs$('file-input').click();
  gs$('choose-folder').onclick = () => gs$('folder-input').click();
  gs$('file-input').onchange = gsPick; gs$('folder-input').onchange = gsPick;
  gs$('search').oninput = gsList;
  gs$('clear-selection').onclick = () => { gsSelected.clear(); gsApply(); };
  gs$('select-all-splats').onclick = () => { for (const entry of gsEntries.filter(entry => gsProject.matches(entry, gs$('search').value))) gsSelected.add(entry); gsApply(); };
  gs$('invert-splat-selection').onclick = () => { for (const entry of gsEntries.filter(entry => gsProject.matches(entry, gs$('search').value))) gsSelected.has(entry) ? gsSelected.delete(entry) : gsSelected.add(entry); gsApply(); };
  gs$('gs-mode').onchange = () => {
    gsMode = gs$('gs-mode').value === 'single' ? 'single' : 'multiple';
    if (gsMode === 'single' && gsSelected.size > 1) { const keep = [...gsSelected].at(-1); gsSelected.clear(); gsSelected.add(keep); }
    gsApply({preserveView: true});
  };
  gs$('dismiss-error').onclick = () => gsError('');
  profileSelect.onchange=presetQuality;
  gs$('gs-sh').onchange = () => gsViewer?.setGaussianOptions({shDegree:Number(gs$('gs-sh').value)});
  const gsAppearance = () => gsViewer?.setGaussianOptions({scale: Number(gs$('gs-scale').value), opacityCutoff: Number(gs$('gs-cutoff').value) / 100, background: gs$('gs-background').value});
  gs$('gs-scale').oninput = () => { gs$('gs-scale-value').value = Number(gs$('gs-scale').value).toFixed(2); gsAppearance(); };
  gs$('gs-cutoff').oninput = () => { gs$('gs-cutoff-value').value = `${gs$('gs-cutoff').value}%`; gsAppearance(); };
  gs$('gs-background').onchange = gsAppearance;
  gs$('gs-camera').onchange = () => {
    const [catalogIndex, cameraIndex] = gs$('gs-camera').value.split(':').map(Number);
    const camera = gs$('gs-camera')._catalogs?.[catalogIndex]?.cameras[cameraIndex];
    if (!camera || !gsViewer?.bounds) return;
    try { gsViewer.applyTraining(camera); } catch(error) { gsError(error.message); }
  };
  gs$('fit-view').onclick = () => gsViewer?.fit();
  gs$('zoom-in').onclick = () => gsViewer?.zoomBy(1.2);
  gs$('zoom-out').onclick = () => gsViewer?.zoomBy(1 / 1.2);
  for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => {
    gsViewer?.setView(button.dataset.view); gs$('gs-camera').value = '';
    for (const other of document.querySelectorAll('[data-view]')) { const active = other === button; other.classList.toggle('active', active); other.setAttribute('aria-pressed', String(active)); }
  };
  document.addEventListener('keydown', event => {
    if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) && event.key.toLowerCase() === 'f') { event.preventDefault(); gsViewer?.fit(); }
  });
  try {
    gsViewer = new GaussianViewer(gs$('scene'), {onError: gsError});
    applyQuality();
    mountRenderDiagnostics(gsViewer, gs$('settings-panel-display').querySelector('.render-controls'));
    const quickDiagnostic=document.createElement('button');quickDiagnostic.type='button';quickDiagnostic.textContent=label('诊断','Diagnostics');quickDiagnostic.onclick=()=>gs$('gs-diagnostics').click();document.querySelector('.inspector-shortcuts').append(quickDiagnostic);
    gsEditor = mountGaussianEditor({loadFull:async()=>{profileSelect.value='full';await gsApply({preserveView:true});},viewer: gsViewer, getModels: () => gsViewer.models, onError: gsError, onStatus: gsSay,onChange:()=>{editRevision++;nativeSession?.schedule();}});
    mountViewerLayout({getViewers: () => gsViewer ? [gsViewer] : []});
  } catch (error) { gsError(error.message); }
  window.addEventListener('beforeunload', event => { if(!nativeApp&&gsEntries.some(e=>gsEntryFlags(e)?.some(flag=>flag&6))) {event.preventDefault();event.returnValue='';} });
  if(nativeApp&&gsViewer)try{
    nativeSession=await openWorkspaceSession({tool:'gaussian',restore:async({state,records,snapshot})=>{
      await gsReceive(records);knownIds=[...new Set([...(state?.tree?.knownIds||[]),...gsEntries.map(e=>e.id)])];
      if(state?.tree){const restored=restoreProjectTree(gsProject,gsEntries,state.tree);gsEntries.splice(0,gsEntries.length,...restored);}
      const flags=snapshot?await gsReadProjectBlob(snapshot):new Map();for(const entry of gsEntries)entry.savedFlags=flags.get(entry.id)||null;
      gsMode=state?.mode==='single'?'single':'multiple';gsSelected.clear();for(const id of state?.selected||[]){const entry=gsEntries.find(e=>e.id===id);if(entry)gsSelected.add(entry);}
      restoreMobileInputs(state?.display);await gsApply();if(state?.camera&&gsViewer.count)applyCameraSnapshot([gsViewer],state.camera,{space:'raw-world',checkScene:false});
      return {snapshotUnchanged:Boolean(snapshot)};
    },capture:()=>({revision:editRevision,blob:()=>gsProjectBlob(gsEntries),state:{schemaVersion:1,tree:{...snapshotProjectTree(gsProject,gsEntries),knownIds},selected:[...gsSelected].map(e=>e.id),mode:gsMode,display:captureMobileInputs(),camera:gsViewer.count?captureCameraSnapshot(gsViewer,{space:'raw-world'}):null}}),
    onStatus:(kind,e)=>{if(e)gsError(e.message);else gs$('source-note').textContent=t(kind==='saved'?'项目自动保存在此设备':kind==='dirty'?'待自动保存':'保存中…');},onBackground:()=>{gsViewer.fly?.leave();gsViewer.stopNavigation();},onForeground:()=>gsViewer.requestRender()});
    if(nativeSession?.redirecting)return;await nativeSession.flush();
    for(const id of ['choose-file','choose-folder'])gs$(id).onclick=()=>nativeSession.pick().catch(e=>gsError(e.message));
  }catch(e){gsError(e.message);}
  gsList();
}
gsBoot();
