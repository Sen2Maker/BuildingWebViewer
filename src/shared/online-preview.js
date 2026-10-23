import { createPreviewDirectoryIndex } from './online-preview-directory.js';
import { validateDescriptor, normalizeManifest, recommendedPreviewPreset, METADATA_MAX_BYTES, FILE_MAX_BYTES } from './online-preview-core.js';
import { fetchPreviewSource } from './online-preview-source.js';
import { fetchPreviewDataset } from './online-preview-data.js';
import './online-preview.css';
import {mountOnlineShare} from './online-share.js';
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
  if(!onlineAllowed())return;
  return import('./online-workflow.js').then(({mountDataWorkflow})=>mountDataWorkflow());
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
export function mountOnlinePreview({viewer,replaceFile,cancelParse=()=>{},captureCamera,applyView,configuration,ready=()=>true}){
  if(!new URLSearchParams(location.hash.slice(1)).has('preview'))return;
  const panel=el('section','',document.querySelector('header')?.parentElement||document.body);panel.className='online-preview-banner';document.querySelector('header')?.after(panel);const localTag=document.querySelector('.local-tag');if(localTag)localTag.textContent=text('在线共享预览','Online shared preview');panel.setAttribute('aria-label','Online preview');
  el('strong',text('在线共享预览 · 临时偏好','Shared online preview · Temporary preferences'),panel);const status=statusNode(panel),cancel=el('button',text('取消加载','Cancel loading'),panel),retry=el('button',text('重新加载','Reload'),panel),back=el('a',text('目录 / 生成链接','Index / Link builder'),panel);back.href='index.html';
  const catalog=el('div','',panel);let controller=null,generation=0,activeDescriptor=null;
  const sharing=mountOnlineShare({anchor:panel,captureCamera,applyView,configuration,ready:()=>!controller&&!!activeDescriptor&&ready(),link:()=>previewLink(activeDescriptor)});
  const stop=()=>{generation++;controller?.abort();controller=null;cancelParse();};cancel.onclick=()=>{stop();status.textContent=text('已取消','Cancelled');};
  async function start(){stop();sharing.loading();catalog.replaceChildren();const serial=generation;controller=new AbortController();const signal=controller.signal;
    try{if(!onlineAllowed())throw Error(text('仅在线网页支持共享预览；App 和离线模式不加载远程数据。','Shared preview requires online web mode; native apps and offline mode do not load remote data.'));let descriptor=readPreview();if(!descriptor)return;
      if(descriptor.manifest){back.href=previewLink({schemaVersion:1,manifest:descriptor.manifest,...(descriptor.viewer?{viewer:descriptor.viewer}:{}),preset:descriptor.preset});const bytes=await fetchPreviewSource(descriptor.manifest,{signal,maxBytes:METADATA_MAX_BYTES,timeoutMs:30000});const entries=normalizeManifest(JSON.parse(new TextDecoder().decode(bytes)),{manifestUrl:descriptor.manifest}).filter(entry=>!descriptor.viewer||entry.viewer===descriptor.viewer);if(signal.aborted||serial!==generation)return;if(!descriptor.entry){directory(catalog,entries,descriptor.preset,descriptor.manifest);status.textContent=text('请选择数据；尚未下载数据文件。','Choose a dataset; no data file has downloaded.');return;}const entry=entries.find(item=>item.id===descriptor.entry);if(!entry)throw Error('Dataset entry not found');descriptor=validateDescriptor({...entry,schemaVersion:entry.chunks?2:1,preset:{...entry.preset,...descriptor.preset}});}
      if(descriptor.viewer!==viewer){location.replace(previewLink(descriptor));return;}
      activeDescriptor=readPreview();
      status.textContent=text('正在按需下载…','Downloading selected data…');const bytes=await fetchPreviewDataset(descriptor,{signal,onProgress:({loaded,total,chunk,chunks})=>{if(serial===generation)status.textContent=`${text('下载','Download')} ${(loaded/1048576).toFixed(2)} MiB${total?' / '+(total/1048576).toFixed(2)+' MiB':''}${chunk?' · '+chunk+'/'+chunks:''}`;}});
      if(signal.aborted||serial!==generation)return;
      const name=(descriptor.name||'shared-data').replace(/[\\/\u0000-\u001f]/g,'_').slice(0,150).replace(/\.[a-z0-9]+$/i,'')+'.'+descriptor.format;
      status.textContent=text('下载完成，正在解析…','Download complete; parsing…');await replaceFile(new File([bytes],name),descriptor.preset||{},signal);
      if(serial===generation&&!signal.aborted)status.textContent=text('文件已交给查看器。解析或显示问题请查看视图区提示；本页偏好不保存到本地。','File handed to viewer. Check viewer messages for parse/render errors. Preferences remain temporary.');
    }catch(error){if(serial===generation){activeDescriptor=null;status.textContent=error.name==='AbortError'?text('已取消','Cancelled'):previewFailure(error);}}finally{if(serial===generation){controller=null;if(activeDescriptor)await sharing.loaded();}}
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
