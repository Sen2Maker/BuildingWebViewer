import { comparisonLink } from './online-compare-core.js';
import { createPreviewDirectoryIndex } from './online-preview-directory.js';
import { validateDescriptor, normalizeManifest, recommendedPreviewPreset, METADATA_MAX_BYTES, FILE_MAX_BYTES } from './online-preview-core.js';
import { fetchPreviewSource, classifyPreviewSource } from './online-preview-source.js';
import { fetchPreviewDataset } from './online-preview-data.js';
import './online-preview.css';
const text = (zh,en) => document.documentElement.lang.startsWith('en') ? en : zh;
const pages = {lod:'lod.html',pointcloud:'pointcloud.html',wireframe:'wireframe.html'};
export function previewLink(descriptor, base = location.href) {
  const clean=validateDescriptor(descriptor), url=new URL(pages[clean.viewer] || 'index.html',base);
  url.search='';url.hash=new URLSearchParams({preview:JSON.stringify(clean)}).toString();if(url.hash.length>16384)throw Error('Preview link exceeds 16 KiB');return url.href;
}
export function readPreview(hash = location.hash) {
  if(hash.length>16384)throw Error('Preview link exceeds 16 KiB');
  const raw=new URLSearchParams(hash.slice(1)).get('preview');
  return raw===null?null:validateDescriptor(JSON.parse(raw));
}
function onlineAllowed(){return /^https?:$/.test(location.protocol)&&!globalThis.Capacitor?.isNativePlatform?.()&&navigator.onLine!==false;}
function el(tag,content,parent){const node=document.createElement(tag);if(content)node.textContent=content;parent?.append(node);return node;}
function previewFailure(error){
  const message=error?.message||String(error);
  if(error instanceof TypeError || /HTTP (401|403)/.test(message))return `${message} ${text('请检查网络以及数据地址的公开读取与跨域 CORS 设置。','Check connectivity and the data URL’s public-read and CORS settings.')}`;
  return message;
}
function statusNode(parent){const node=el('p','',parent);node.setAttribute('role','status');node.setAttribute('aria-live','polite');return node;}
function help(parent){
  el('p',text('仅在线网页可用。共享预设只在当前页面生效，不读取或覆盖你的已保存偏好；关闭页面即丢弃。','Online web only. Shared presets use a temporary profile and never read or overwrite saved preferences.'),parent);
  el('p',text('目录只下载索引；点击条目才下载对应文件。点云最多 64 MiB、OBJ 最多 8 MiB，目录最多 5 MiB。文件下载完后再解析，不是模型分块流式加载。','Only the index loads initially. A selected file downloads on demand (64 MiB/cloud, 8 MiB/OBJ, 5 MiB/index), then parses; this is not tiled model streaming.'),parent);
  el('p',text('数据地址必须是公开可读取且允许跨域的 HTTPS 直链。谷歌硬盘分享页面不等于可跨域下载；私有数据需要你另行配置访问，网页不会使用你的登录凭据，也不会改变共享权限。拒绝重定向时请提供最终数据直链。','Use public HTTPS raw-file URLs with CORS enabled. A Drive share page is not a CORS download guarantee. Private files need separately configured access. No login credentials are used or sharing permissions changed. Redirects are rejected; use the final raw-file URL.'),parent);
  el('p',text('XYZ 分块目录：选择“目录 / JSON index”，填写 manifest.json 的 HTTPS 地址，不要填写某个 part 文件。打开目录后选择条目，复制该条目链接即可直达数据；只有选中条目会下载。分块校验完再整体解析，不是渐进显示。','XYZ chunk directories: choose JSON index and enter the manifest.json HTTPS URL, not an individual part. Open the index, then copy an entry link for direct viewing. Only the selected entry downloads; chunks are verified before whole-file parsing, not progressively rendered.'),parent);
  el('p',text('链接可能包含数据地址和目录名称，请仅分享你有权公开的信息。支持 OBJ 网格/线框，XYZ/TXT/CSV/PTS/PLY/PCD 点云。','Links may disclose URLs and dataset names. Share only permitted information. Supported: OBJ mesh/wireframe and XYZ/TXT/CSV/PTS/PLY/PCD point clouds.'),parent);
}
function field(parent,label,tag='input'){const row=el('label',label,parent), input=el(tag,'',row);return input;}
function directory(parent,entries,preset={},manifest=null){
  const index=createPreviewDirectoryIndex(entries);
  const search=field(parent,text('搜索目录','Search datasets'));search.type='search';
  const type=field(parent,text('筛选数据类型','Filter resource type'),'select');
  for(const [value,label] of [['all',text('全部类型','All types')],['pointcloud',text('点云','Point clouds')],['lod',text('网格','Meshes')],['wireframe',text('线框','Wireframes')]]){const option=el('option',label,type);option.value=value;}type.value='all';
  const summary=statusNode(parent), list=el('ul','',parent), controls=el('div','',parent);let page=0;
  const prev=el('button',text('上一页','Previous'),controls),next=el('button',text('下一页','Next'),controls),pageSize=40;
  function render(){const matches=index.search(search.value,type.value);page=Math.min(page,Math.max(0,Math.ceil(matches.length/pageSize)-1));list.replaceChildren();
    for(const entry of matches.slice(page*pageSize,(page+1)*pageSize)){const li=el('li','',list),a=el('a',`${entry.id}${entry.name&&entry.name!==entry.id?' · '+entry.name:''} · ${entry.viewer} · ${entry.format}${entry.chunks?' · '+entry.chunks.length+' '+text('块','chunks'):''}${entry.bytes ? ' · '+(entry.bytes/1048576).toFixed(2)+' MiB':''}`,li);a.href=previewLink(manifest?{schemaVersion:1,manifest,entry:entry.id,viewer:entry.viewer,preset:{...recommendedPreviewPreset(entry.viewer),...entry.preset,...preset}}:{...entry,schemaVersion:entry.chunks?2:1,preset:{...entry.preset,...preset}});}
    if(!matches.length)el('li',text('没有匹配的数据，请调整关键词或类型筛选。','No matching resources. Change the search or type filter.'),list);
    summary.textContent=`${matches.length} ${text('项；只显示当前页，未下载图纸','entries; only this page is displayed, data not downloaded')} · ${page+1}/${Math.max(1,Math.ceil(matches.length/pageSize))}`;prev.disabled=!page;next.disabled=(page+1)*pageSize>=matches.length;
  }
  search.oninput=()=>{page=0;render();};type.onchange=()=>{page=0;render();};prev.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};render();
}
export function mountOnlineBuilder(){
  if(!onlineAllowed()){if(new URLSearchParams(location.hash.slice(1)).has('preview')){const warning=statusNode(document.body);warning.textContent=text('在线共享预览在 App 或离线模式不可用。','Shared online preview is unavailable in native apps or offline mode.');}return;}
  const anchor=document.querySelector('.header-actions')||document.querySelector('header');if(!anchor)return;
  const open=el('button',text('在线对比 · 分享','Compare · Share'),anchor);open.className='online-entry';open.type='button';
  const dialog=el('dialog','',document.body);dialog.className='online-dialog';const heading=el('h2',text('在线预览与分享','Online preview and sharing'),dialog);heading.id='online-preview-title';dialog.setAttribute('aria-labelledby',heading.id);
  const close=el('button',text('关闭','Close'),dialog);close.type='button';close.onclick=()=>dialog.close();help(dialog);
  const form=el('form','',dialog),url=field(form,text('数据直链或目录 JSON 地址','Data or JSON index URL'));url.type='url';url.required=true;
  const kind=field(form,text('类型','Type'),'select');for(const [value,label] of [['compare','点云 + 网格对比 / Compare'],['pointcloud','点云 / Point cloud'],['lod','网格 / Mesh'],['wireframe','线框 / Wireframe'],['manifest','目录 / JSON index']]){const option=el('option',label,kind);option.value=value;}
  const format=field(form,text('文件格式（目录无需填写）','Format (not needed for index)'),'select');for(const value of ['xyz','obj','txt','csv','pts','ply','pcd']){const option=el('option',value,format);option.value=value;}
  const building=field(form,text('起始建筑 ID','Initial building ID'));building.value='2';building.maxLength=240;
  const presetViewer=value=>value==='manifest'?undefined:value==='compare'?'pointcloud':value;
  kind.onchange=()=>{building.parentElement.hidden=kind.value!=='compare';const previousRecommended=JSON.stringify(recommendedPreviewPreset(presetViewer(previousKind)));if(!preset.value.trim()||preset.value===previousRecommended)preset.value=JSON.stringify(recommendedPreviewPreset(presetViewer(kind.value)));previousKind=kind.value;format.disabled=kind.value==='manifest'||kind.value==='compare';if(['lod','wireframe'].includes(kind.value))format.value='obj';else if(kind.value==='pointcloud')format.value='xyz';};
  const preset=field(form,text('临时预设 JSON（可留空；目录仅用通用选项）','Temporary preset JSON (optional; indexes use common options)'),'textarea');preset.placeholder='{"grid":true,"palette":"viridis"}';preset.maxLength=4096;kind.value='compare';format.value='xyz';format.disabled=true;let previousKind='compare';preset.value=JSON.stringify(recommendedPreviewPreset('pointcloud'));
  el('p',text('默认推荐配置已填入，可自行修改。点云按高度着色，模型加载后自动适配视角；不改变你的本地偏好。','Recommended settings are filled in and editable. Point clouds use height coloring; models auto-fit after loading without changing local preferences.'),form);
  const submit=el('button',text('生成链接','Create link'),form);submit.type='submit';const output=field(dialog,text('分享链接','Share link'),'textarea');output.readOnly=true;const visit=el('a',text('打开预览','Open preview'),dialog);visit.hidden=true;const report=statusNode(dialog);
  const schema=el('details','',dialog);el('summary',text('目录格式与使用步骤','Index format and instructions'),schema);el('p',text('1. 将数据放到允许 CORS 的 HTTPS 存储。2. 使用 schemaVersion: 1，datasets 数组中每项填写 id、url、viewer、format，可选 name、bytes、sha256、preset。3. 粘贴索引地址选择“目录”生成链接。也支持 schemaVersion: 2 的 XYZ 传输分块目录，以及现有 schema_version: 1 的 buildings 谷歌硬盘索引。不要在地址中填写密钥。','1. Host data on HTTPS storage supporting CORS. 2. Use schemaVersion: 1 and datasets entries with id, url, viewer, format; optional name, bytes, sha256, preset. 3. Paste the index URL and choose JSON index. schemaVersion: 2 XYZ transport-chunk directories and existing schema_version: 1 buildings Drive indexes are also accepted. Never embed secrets.'),schema);
  form.onsubmit=event=>{event.preventDefault();try{if(!onlineAllowed())throw Error('Online mode is required');const settings=preset.value.trim()?JSON.parse(preset.value):recommendedPreviewPreset(presetViewer(kind.value));const descriptor=kind.value==='manifest'||kind.value==='compare'?{schemaVersion:1,manifest:url.value,preset:settings}:{schemaVersion:1,url:url.value,viewer:kind.value,format:format.value,preset:settings};output.value=kind.value==='compare'?comparisonLink({schemaVersion:1,manifest:url.value,buildingId:building.value,preset:settings}):previewLink(descriptor);visit.href=output.value;visit.hidden=false;if(classifyPreviewSource(descriptor.url||descriptor.manifest).provider==='google-drive'){visit.hidden=true;report.textContent=text('已生成链接结构，但谷歌硬盘匿名读取尚未配置，现在还不能通过它预览。不会上传数据或改变共享权限。','Link structure created, but the anonymous Google Drive reader is not configured; this link cannot preview data yet. Nothing was uploaded or shared.');}else report.textContent=text('链接已生成，但尚未检查远端是否可读取。打开预览后检查；不会上传数据或更改权限。','Link created; remote accessibility has not been checked. Open the preview to verify. No data was uploaded or permissions changed.');}catch(error){report.textContent=error.message;visit.hidden=true;output.value='';}};
  open.onclick=()=>dialog.showModal();
  if(new URLSearchParams(location.hash.slice(1)).has('preview')){dialog.showModal();let descriptor;try{descriptor=readPreview();}catch(error){report.textContent=error.message;return;}if(descriptor?.manifest){loadDirectory(descriptor,dialog,report);}else if(descriptor){location.replace(previewLink(descriptor));}}
}
export function loadDirectory(descriptor,parent,status){
  const actions=el('div','',parent),cancel=el('button',text('取消目录下载','Cancel index download'),actions),retry=el('button',text('重新加载目录','Reload index'),actions),results=el('div','',parent);
  let controller=null,generation=0,disposed=false;
  const stop=(message=true)=>{const active=Boolean(controller);generation++;controller?.abort();controller=null;cancel.disabled=true;if(active&&message)status.textContent=text('目录下载已取消，可点击重新加载。','Index download cancelled. Choose Reload index to retry.');};
  async function reload(){
    if(disposed)return;
    stop(false);const serial=generation;controller=new AbortController();const signal=controller.signal;
    cancel.disabled=false;results.replaceChildren();
    try{
      if(!onlineAllowed())throw Error('Online web mode is required');
      status.textContent=text('正在下载目录索引…','Downloading index…');
      const bytes=await fetchPreviewSource(descriptor.manifest,{signal,maxBytes:METADATA_MAX_BYTES,timeoutMs:30000});
      if(signal.aborted||serial!==generation||disposed)return;
      const entries=normalizeManifest(JSON.parse(new TextDecoder().decode(bytes)),{manifestUrl:descriptor.manifest}).filter(entry=>!descriptor.viewer||entry.viewer===descriptor.viewer);
      directory(results,entries,descriptor.preset,descriptor.manifest);
      status.textContent=text('目录就绪，尚未下载任何数据文件。','Index ready. No data files downloaded.');
    }catch(error){if(serial===generation&&!disposed)status.textContent=error.name==='AbortError'?text('已取消，可重新加载。','Cancelled; reload to retry.'):`${previewFailure(error)} ${text('可点击重新加载目录。','Choose Reload index to retry.')}`;}
    finally{if(serial===generation){controller=null;cancel.disabled=true;}}
  }
  const close=()=>stop(),dispose=()=>{if(disposed)return;stop(false);disposed=true;parent.removeEventListener?.('close',close);window.removeEventListener?.('pagehide',dispose);window.removeEventListener?.('hashchange',navigate);};
  const navigate=()=>{dispose();location.reload();};
  cancel.onclick=()=>stop();retry.onclick=reload;parent.addEventListener('close',close);window.addEventListener('pagehide',dispose);window.addEventListener('hashchange',navigate);
  reload();return {reload,cancel:stop,dispose};
}
export function mountOnlinePreview({viewer,replaceFile,cancelParse=()=>{}}){
  if(!new URLSearchParams(location.hash.slice(1)).has('preview'))return;
  const panel=el('section','',document.querySelector('header')?.parentElement||document.body);panel.className='online-preview-banner';document.querySelector('header')?.after(panel);const localTag=document.querySelector('.local-tag');if(localTag)localTag.textContent=text('在线共享预览','Online shared preview');panel.setAttribute('aria-label','Online preview');
  el('strong',text('在线共享预览 · 临时偏好','Shared online preview · Temporary preferences'),panel);const status=statusNode(panel),cancel=el('button',text('取消加载','Cancel loading'),panel),retry=el('button',text('重新加载','Reload'),panel),back=el('a',text('目录 / 生成链接','Index / Link builder'),panel);back.href='index.html';
  const catalog=el('div','',panel);let controller=null,generation=0;
  const stop=()=>{generation++;controller?.abort();controller=null;cancelParse();};cancel.onclick=()=>{stop();status.textContent=text('已取消','Cancelled');};
  async function start(){stop();catalog.replaceChildren();const serial=generation;controller=new AbortController();const signal=controller.signal;
    try{if(!onlineAllowed())throw Error(text('仅在线网页支持共享预览；App 和离线模式不加载远程数据。','Shared preview requires online web mode; native apps and offline mode do not load remote data.'));let descriptor=readPreview();if(!descriptor)return;
      if(descriptor.manifest){back.href=previewLink({schemaVersion:1,manifest:descriptor.manifest,...(descriptor.viewer?{viewer:descriptor.viewer}:{}),preset:descriptor.preset});const bytes=await fetchPreviewSource(descriptor.manifest,{signal,maxBytes:METADATA_MAX_BYTES,timeoutMs:30000});const entries=normalizeManifest(JSON.parse(new TextDecoder().decode(bytes)),{manifestUrl:descriptor.manifest}).filter(entry=>!descriptor.viewer||entry.viewer===descriptor.viewer);if(signal.aborted||serial!==generation)return;if(!descriptor.entry){directory(catalog,entries,descriptor.preset,descriptor.manifest);status.textContent=text('请选择数据；尚未下载数据文件。','Choose a dataset; no data file has downloaded.');return;}const entry=entries.find(item=>item.id===descriptor.entry);if(!entry)throw Error('Dataset entry not found');descriptor=validateDescriptor({...entry,schemaVersion:entry.chunks?2:1,preset:{...entry.preset,...descriptor.preset}});}
      if(descriptor.viewer!==viewer){location.replace(previewLink(descriptor));return;}
      status.textContent=text('正在按需下载…','Downloading selected data…');const bytes=await fetchPreviewDataset(descriptor,{signal,onProgress:({loaded,total,chunk,chunks})=>{if(serial===generation)status.textContent=`${text('下载','Download')} ${(loaded/1048576).toFixed(2)} MiB${total?' / '+(total/1048576).toFixed(2)+' MiB':''}${chunk?' · '+chunk+'/'+chunks:''}`;}});
      if(signal.aborted||serial!==generation)return;
      const name=(descriptor.name||'shared-data').replace(/[\\/\u0000-\u001f]/g,'_').slice(0,150).replace(/\.[a-z0-9]+$/i,'')+'.'+descriptor.format;
      status.textContent=text('下载完成，正在解析…','Download complete; parsing…');await replaceFile(new File([bytes],name),descriptor.preset||{},signal);
      if(serial===generation&&!signal.aborted)status.textContent=text('文件已交给查看器。解析或显示问题请查看视图区提示；本页偏好不保存到本地。','File handed to viewer. Check viewer messages for parse/render errors. Preferences remain temporary.');
    }catch(error){if(serial===generation)status.textContent=error.name==='AbortError'?text('已取消','Cancelled'):previewFailure(error);}finally{if(serial===generation)controller=null;}
  }
  const takeOwnership=event=>{if(event.isTrusted && controller && !panel.contains(event.target)){stop();status.textContent=text('已取消远程加载，保留你的新操作。','Remote load cancelled to preserve your newer action.');}};
  for(const type of ['pointerdown','click','drop','change'])document.addEventListener(type,takeOwnership,true);
  retry.onclick=start;window.addEventListener('pagehide',stop);window.addEventListener('hashchange',()=>{stop();location.reload();});start();
}
export function applyPreviewPreset(preset){
  const controls={grid:'show-grid',pointSize:'point-size',pointOpacity:'point-opacity',pointColor:'point-color',wireColor:'wire-color',colorMode:'color-mode'};
  for(const[key,id]of Object.entries(controls)){if(preset[key]===undefined)continue;const input=document.getElementById(id);if(!input)continue;if(input.type==='checkbox')input.checked=preset[key];else input.value=String(preset[key]);input.dispatchEvent(new Event(input.type==='range'?'input':'change',{bubbles:true}));}
  for(const[key,selector]of [['palette','.palette-panel select'],['reverse','.palette-reverse']]){if(preset[key]===undefined)continue;const input=document.querySelector(selector);if(!input)continue;if(key==='reverse')input.checked=preset[key];else input.value=preset[key];input.dispatchEvent(new Event('change',{bubbles:true}));}
}
