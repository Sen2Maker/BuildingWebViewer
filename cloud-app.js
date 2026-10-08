import { CloudViewer } from './cloud-renderer.js';
import { parsePointCloud, parseWireOBJ } from './point-io.js';

(() => {
  const $ = id => document.getElementById(id);
  const isWire = document.body.dataset.tool === 'wireframe';
  const pointExtension = /\.(xyz|txt|csv|pts|ply|pcd)$/i;
  const natural = (a,b) => a.localeCompare(b, undefined, {numeric:true});
  const pretty = n => Number(n).toLocaleString('zh-CN');
  const formatSize = n => n > 1024*1024 ? (n/1024/1024).toFixed(1)+' MB' : (n/1024).toFixed(1)+' KB';
  const fieldLabel = name => /^column_\d+$/.test(name) ? `第 ${name.slice(7)} 列` : name;
  const compact = value => !Number.isFinite(value) ? '—' : Math.abs(value) > 10000 ? value.toPrecision(6) : Number(value.toPrecision(5)).toString();
  let entries=[], active=null, page=0, revision=0, viewer=null, overlay=null;
  let loaded={cloud:null,wire:null}, currentPointName='', messages=[];
  const cached = new Map();
  let options={showPoints:true,showWire:isWire,pointSize:2,pointOpacity:1,colorMode:isWire?'solid':'height',pointColor:'#547d99',wireColor:'#e49b44',rgbFields:null,grid:true};
  function error(message) { $('error').hidden=!message; $('error').querySelector('span').textContent=message || ''; }
  function initViewer() {
    if (!viewer) viewer=new CloudViewer($('scene'),{onError:error});
    viewer.setOptions(options);
  }
  function option(select,value,text) { const el=document.createElement('option');el.value=value;el.textContent=text;select.append(el); }
  function list() {
    const query=$('search').value.trim().toLowerCase();
    const filtered=entries.filter(entry=>entry.id.toLowerCase().includes(query));
    const pages=Math.ceil(filtered.length/50);
    page=Math.max(0,Math.min(page,pages-1));
    $('filter-count').textContent=`${pretty(filtered.length)} ${isWire?'个数据 ID':'个文件'}`;
    $('item-count').textContent=pretty(entries.length);
    $('page-info').textContent=pages?`${page+1} / ${pages}`:'0 / 0';
    $('previous-page').disabled=page===0; $('next-page').disabled=page>=pages-1;
    const fragment=document.createDocumentFragment();
    for (const entry of filtered.slice(page*50,(page+1)*50)) {
      const button=document.createElement('button');button.className='data-entry';button.setAttribute('aria-pressed',String(active?.id===entry.id));
      const title=document.createElement('strong');title.textContent=isWire?`# ${entry.id}`:entry.id;
      const detail=document.createElement('small');detail.textContent=isWire?`${entry.wires.length} 个线框 · ${entry.clouds.length} 个点云`:formatSize(entry.file.size);
      button.append(title,detail);button.title=entry.id;button.onclick=()=>active?.id===entry.id?clear():choose(entry);fragment.append(button);
    }
    if (!filtered.length) { const empty=document.createElement('p');empty.className='empty-list';empty.textContent=entries.length?'没有匹配的数据':'先选择你的数据文件或文件夹';fragment.append(empty); }
    $('data-list').replaceChildren(fragment);
  }
  function resetFileControls() {
    for (const id of ['wire-file','cloud-file']) { $(id).replaceChildren();option($(id),'','未选择');$(id).disabled=true; }
    $('attach-cloud').disabled=true;
  }
  function clear() {
    revision++;active=null;overlay=null;loaded={cloud:null,wire:null};messages=[];currentPointName='';
    viewer?.setData(loaded);resetFileControls();fields();list();error('');
    $('loading').hidden=true;$('screenshot').disabled=true;$('empty-state').hidden=false;
    $('current-title').textContent='未选择数据';$('scene-stats').textContent='从左侧选择要查看的数据';
    $('geometry-note').textContent='未选择数据时保持空白';$('data-notes').textContent='';$('color-legend').hidden=true;
  }
  function receive(fileList,fromFolder) {
    const files=[...fileList];
    if (!files.length) return;
    clear();cached.clear();entries=[];page=0;$('search').value='';list();
    $('source-note').textContent='正在检查所选文件夹';
    let next=[];
    if (isWire) {
      const groups=new Map();
      for (const file of files) {
        if (!/\.obj$/i.test(file.name) && !pointExtension.test(file.name)) continue;
        const parts=(file.webkitRelativePath || file.name).split('/');
        const id=parts.length>2?parts.slice(1,-1).join('/'):(parts.length===2?parts[0]:'数据');
        if (!groups.has(id)) groups.set(id,{id,wires:[],clouds:[]});
        groups.get(id)[/\.obj$/i.test(file.name)?'wires':'clouds'].push(file);
      }
      next=[...groups.values()].filter(entry=>entry.wires.length || entry.clouds.length);
      for (const entry of next) {entry.wires.sort((a,b)=>natural(a.name,b.name));entry.clouds.sort((a,b)=>natural(a.name,b.name));}
    } else {
      next=files.filter(file=>pointExtension.test(file.name)).map(file=>({id:fromFolder?(file.webkitRelativePath.split('/').slice(1).join('/') || file.name):file.name,file}));
    }
    if (!next.length) {$('source-note').textContent='所选目录没有支持的数据';error(isWire?'未找到 OBJ 线框或支持的点云文件。请选数据集根目录或某个 ID 子目录。':'未找到支持的点云。请选择 XYZ / TXT / CSV / PTS / PLY / PCD 文件。');return;}
    next.sort((a,b)=>natural(a.id,b.id));
    entries=next;list();
    const root=fromFolder?(files[0].webkitRelativePath.split('/')[0] || '所选文件夹'):'所选文件';
    $('source-note').textContent=`${root} · ${pretty(next.length)} ${isWire?'个 ID':'个点云'} · 点击列表后读取`;
  }
  function choose(entry) {
    active=entry;overlay=null;error('');
    if (isWire) {
      const wireSelect=$('wire-file'),cloudSelect=$('cloud-file');wireSelect.replaceChildren();cloudSelect.replaceChildren();
      option(wireSelect,'','不加载线框');option(cloudSelect,'','不加载点云');
      entry.wires.forEach((file,i)=>option(wireSelect,String(i),file.name));
      entry.clouds.forEach((file,i)=>option(cloudSelect,String(i),file.name));
      const preferred=['pre_seg_nms.obj','pre_seg.obj','wireframe.obj','raw_topk.obj','gt_wire.obj'];
      const found=preferred.map(name=>entry.wires.findIndex(file=>file.name.toLowerCase()===name)).find(i=>i>=0);
      wireSelect.value=entry.wires.length?String(found??0):'';
      const pc=entry.clouds.findIndex(file=>file.name.toLowerCase()==='pc.xyz');
      cloudSelect.value=entry.clouds.length?String(pc<0?0:pc):'';
      wireSelect.disabled=!entry.wires.length;cloudSelect.disabled=!entry.clouds.length;$('attach-cloud').disabled=false;
    }
    list();load();
  }
  function selectFiles() {
    if (!active) return {wire:null,cloud:null};
    if (!isWire) return {wire:null,cloud:active.file};
    return {wire:$('wire-file').value===''?null:active.wires[Number($('wire-file').value)],cloud:$('cloud-file').value==='overlay'?overlay:$('cloud-file').value===''?null:active.clouds[Number($('cloud-file').value)]};
  }
  function cacheKey(file,kind) { return `${kind}:${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}:${kind==='cloud'?$('point-limit').value:''}`; }
  async function read(file,kind) {
    if (!file) return null;
    const key=cacheKey(file,kind);
    if (cached.has(key)) return cached.get(key);
    const result=kind==='cloud'?parsePointCloud(await file.arrayBuffer(),file.name,{maxPoints:Number($('point-limit').value)}):parseWireOBJ(await file.text(),file.name);
    return {parsed:result,key};
  }
  async function load() {
    if (!active) {clear();return;}
    const version=++revision, entry=active, files=selectFiles();
    loaded={cloud:null,wire:null}; viewer?.setData(loaded);
    $('loading').hidden=false;$('empty-state').hidden=true;$('screenshot').disabled=true;error('');
    $('current-title').textContent=isWire?`数据 ${entry.id}`:entry.id;$('scene-stats').textContent='正在读取所选文件…';
    $('data-notes').textContent='';$('color-legend').hidden=true;
    const result=await Promise.allSettled([read(files.cloud,'cloud'),read(files.wire,'wire')]);
    if (version!==revision) return;
    const failures=[];
    for (let i=0;i<result.length;i++) {
      const kind=i===0?'cloud':'wire', value=result[i];
      if (value.status==='fulfilled') {
        if (value.value?.parsed) {
          loaded[kind]=value.value.parsed;cached.set(value.value.key,value.value.parsed);
          while (cached.size>4) cached.delete(cached.keys().next().value);
        } else loaded[kind]=value.value;
      } else failures.push(`${i===0?'点云':'线框'}：${value.reason?.message || value.reason}`);
    }
    currentPointName=files.cloud?.name || '';
    messages=[...(loaded.cloud?.notes || [])];
    try {
      initViewer(); fields();viewer.setData(loaded);update();
      const counts=[];
      if (loaded.wire) counts.push(`${pretty(loaded.wire.edges.length)} 条线段`);
      if (loaded.cloud) counts.push(`${pretty(loaded.cloud.count)} / ${pretty(loaded.cloud.totalCount)} 点`);
      $('scene-stats').textContent=counts.length?counts.join(' · '):'未加载可显示的数据';
      $('geometry-note').textContent=files.wire&&loaded.wire?`${files.wire.name}${loaded.cloud?' + '+files.cloud.name:''}`:loaded.cloud?currentPointName:'未加载数据';
      $('empty-state').hidden=!!(loaded.wire || loaded.cloud);
      $('screenshot').disabled=!(loaded.wire || loaded.cloud);
      if (failures.length) error(failures.join('；'));
    } catch (cause) { error('显示失败：'+cause.message); }
    finally { $('loading').hidden=true; }
  }
  function fields() {
    const cloud=loaded.cloud, keys=Object.keys(cloud?.fields || {}), color=$('color-mode'), old=color.value;
    color.replaceChildren();option(color,'height','高度 Z');option(color,'solid','单色');
    if (cloud?.rgb) option(color,'rgb','原始 RGB');
    if (keys.length>=3) option(color,'custom-rgb','指定 RGB 列…');
    keys.filter(key=>!['x','y','z','rgb','rgba'].includes(key.toLowerCase())).forEach(key=>option(color,'field:'+key,fieldLabel(key)));
    color.value=[...color.options].some(o=>o.value===old)?old:'height';
    const extra=keys.filter(key=>!['x','y','z'].includes(key.toLowerCase()));
    ['rgb-r','rgb-g','rgb-b'].forEach((id,i)=>{const select=$(id),previous=select.value;select.replaceChildren();keys.forEach(key=>option(select,key,fieldLabel(key)));select.value=keys.includes(previous)?previous:(extra[i] || keys[i] || '');});
    $('rgb-fields').hidden=color.value!=='custom-rgb';
  }
  function update() {
    const color=$('color-mode').value;
    options={...options,showPoints:$('show-points').checked,showWire:isWire&&$('show-wire').checked,grid:$('show-grid').checked,pointSize:Number($('point-size').value),pointOpacity:Number($('point-opacity').value),wireColor:$('wire-color').value,colorMode:color==='custom-rgb'?'rgb':color,rgbFields:color==='custom-rgb'?['rgb-r','rgb-g','rgb-b'].map(id=>$(id).value):null};
    $('rgb-fields').hidden=color!=='custom-rgb';$('point-size-value').value=String(options.pointSize);$('point-opacity-value').value=Math.round(options.pointOpacity*100)+'%';
    viewer?.setOptions(options);
    const state=viewer?.getState(),range=state?.colorRange;
    $('color-legend').hidden=!(loaded.cloud && options.showPoints && range);
    $('color-name').textContent=$('color-mode').selectedOptions[0]?.textContent || '';
    $('color-min').textContent=compact(range?.min);$('color-max').textContent=compact(range?.max);
    const notes=messages.slice();
    if (state?.colorFallback) notes.push(state.colorFallback);
    $('data-notes').textContent=notes.join(' ');
  }
  $('choose-folder').onclick=()=>$('folder-input').click();
  $('folder-input').onchange=event=>{receive(event.target.files,true);event.target.value='';};
  $('choose-file').onclick=()=>$('file-input').click();
  $('file-input').onchange=event=>{receive(event.target.files,false);event.target.value='';};
  $('attach-cloud').onclick=()=>$('overlay-input').click();
  $('overlay-input').onchange=event=>{
    const file=event.target.files[0];event.target.value='';if(!file || !active)return;
    if (!pointExtension.test(file.name)) {error('请选择支持的点云文件');return;}
    overlay=file;const select=$('cloud-file');select.querySelector('option[value="overlay"]')?.remove();option(select,'overlay',file.name+'（另选）');select.disabled=false;select.value='overlay';load();
  };
  $('search').oninput=()=>{page=0;list();};
  $('previous-page').onclick=()=>{page--;list();$('data-list').scrollTop=0;};
  $('next-page').onclick=()=>{page++;list();$('data-list').scrollTop=0;};
  $('clear-selection').onclick=clear;
  $('dismiss-error').onclick=()=>error('');
  $('wire-file').onchange=load;$('cloud-file').onchange=load;
  $('point-limit').onchange=()=>{if(active)load();};
  for (const id of ['color-mode','show-points','show-wire','show-grid','wire-color','rgb-r','rgb-g','rgb-b']) $(id).onchange=update;
  for (const id of ['point-size','point-opacity']) $(id).oninput=update;
  $('fit-view').onclick=()=>viewer?.fit();$('zoom-in').onclick=()=>viewer?.zoomBy(1.2);$('zoom-out').onclick=()=>viewer?.zoomBy(1/1.2);
  for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{viewer?.setView(button.dataset.view);for(const other of document.querySelectorAll('[data-view]')){other.classList.toggle('active',other===button);other.setAttribute('aria-pressed',String(other===button));}};
  $('screenshot').onclick=()=>{if(!viewer || !active)return;viewer.render();const link=document.createElement('a');link.href=$('scene').toDataURL('image/png');link.download=`${isWire?'wireframe':'pointcloud'}_${active.id.replace(/[^a-zA-Z0-9_.-]/g,'_')}.png`;link.click();};
  document.addEventListener('keydown',event=>{if(!['INPUT','SELECT','TEXTAREA','BUTTON'].includes(event.target.tagName) && event.key.toLowerCase()==='f'){event.preventDefault();viewer?.fit();}});
  try {initViewer();clear();}catch(cause){error(cause.message);}
})();
