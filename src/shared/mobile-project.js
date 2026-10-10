import { t } from './i18n.js';
let mobileProjectPlugin;
export function isMobileApp(){return Boolean(globalThis.Capacitor?.isNativePlatform?.());}
export function mobileProjects(){if(!isMobileApp())return null;return mobileProjectPlugin ||= globalThis.Capacitor.registerPlugin('BWVProjects');}
/** Disk-backed File interface: text point readers request slices instead of a whole-file Blob. */
export class NativeProjectFile {
  constructor(projectId,record){this.projectId=projectId;this.record=record;this.name=record.path.split('/').at(-1);this.size=record.size;this.lastModified=record.modified||0;this.webkitRelativePath=record.path;this.nativeKey=record.key;}
  slice(start=0,end=this.size){
    const size=this.size;start=start<0?Math.max(0,size+start):Math.min(start,size);end=end<0?Math.max(0,size+end):Math.min(end,size);end=Math.max(start,end);
    return {size:end-start,arrayBuffer:async()=>{
      const output=new Uint8Array(end-start);let cursor=start;
      while(cursor<end){const length=Math.min(1048576,end-cursor),reply=await mobileProjects().readChunk({id:this.projectId,key:this.nativeKey,offset:cursor,length});const binary=atob(reply.data);if(binary.length!==length)throw Error(t('项目文件读取不完整'));for(let i=0;i<binary.length;i++)output[cursor-start+i]=binary.charCodeAt(i);cursor+=length;}
      return output.buffer;
    }};
  }
  async text(){return new TextDecoder().decode(await this.slice().arrayBuffer());}
  async arrayBuffer(){return this.slice().arrayBuffer();}
}
export function snapshotProjectTree(project,entries){return {groups:[...project.groups.values()].map(g=>({...g})),serial:project.serial,items:entries.map(e=>({id:e.id,group:e.group,treeName:e.treeName,columnSettings:e.columnSettings,displayColor:e.displayColor}))};}
export function restoreProjectTree(project,entries,state){
  if(!state?.groups||!state?.items)return entries;
  const groups=new Map(state.groups.map(g=>[g.id,{...g}]));
  for(const g of groups.values()){let at=g,visited=new Set();while(at){if(visited.has(at.id))throw Error('Invalid project folder cycle');visited.add(at.id);at=groups.get(at.parent);}}
  project.groups=groups;project.serial=Number(state.serial)||groups.size;
  const saved=new Map(state.items.map(e=>[e.id,e]));
  // Removed items stay excluded on reopen; newly imported native files remain discoverable.
  return entries.filter(e=>!state.knownIds?.includes(e.id)||saved.has(e.id)).map(e=>{const previous=saved.get(e.id);if(previous)Object.assign(e,previous);else project.assign(e,e.file?.webkitRelativePath||e.sourceGroup||e.treeName||e.id);return e;});
}
export async function mobileShareBlob(blob,name){
  const api=mobileProjects();if(!api)return false;
  const {token}=await api.beginExport({name});
  try { for(let start=0;start<blob.size;start+=262144){const bytes=new Uint8Array(await blob.slice(start,start+262144).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));await api.appendExport({token,data:btoa(binary)});}
  await api.finishExport({token,type:blob.type||'application/octet-stream'});return true; } catch(error) { await api.cancelExport({token}).catch(()=>{});throw error; }
}
/** Serialize saves and coalesce rapid edits without losing a revert while a write is in flight. */
export function createMobileSaver({read,write,status=()=>{}}){
  let pending=null,draining=null,last='';
  return {flush(){
    let state,text;try{state=read();text=JSON.stringify(state);}catch(error){status('error',error);return Promise.reject(error);}
    if(!draining&&text===last)return Promise.resolve();
    pending={state,text};
    if(draining)return draining;
    draining=(async()=>{try{while(pending){const next=pending;pending=null;if(next.text===last)continue;status('saving');await write(next.state);last=next.text;}status('saved');}catch(error){status('error',error);throw error;}finally{draining=null;}})();
    return draining;
  }};
}
/** Optional adapter; ordinary web sessions keep the existing local-file workflow. */
export async function mountMobileProject({receive,getState,restoreState,onBackground=()=>{},onForeground=()=>{},root=document}){
  const api=mobileProjects();if(!api)return null;
  const id=new URL(root.location.href).searchParams.get('project');
  if(!id){root.location.replace('assets/mobile/index.html');return null;}
  const status=root.createElement('span');status.className='mobile-save-status';status.setAttribute('role','status');root.querySelector('header').append(status);
  let ready=false,timer=null;
  const saver=createMobileSaver({read:()=>({...getState(),schemaVersion:1}),write:state=>api.saveState({id,tool:root.body.dataset.tool,state}),status:(kind,error)=>{status.textContent=t(kind==='saving'?'保存中…':kind==='saved'?'已保存':'保存失败');status.title=error?.message||'';}});
  const flush=()=>{clearTimeout(timer);timer=null;return ready?saver.flush():Promise.resolve();};
  const schedule=()=>{if(!ready)return;clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),300);};
  try{
    const project=await api.getProject({id});status.textContent=t('正在恢复项目…');
    const records=project.files.map(record=>({file:new NativeProjectFile(id,record),path:record.path}));await receive(records);
    await restoreState(project.states?.[root.body.dataset.tool]||null,records);ready=true;await flush();
    const pick=async()=>{try{await flush();status.textContent=t('正在导入…');const result=await api.pickFiles({id});if(!result.cancelled)root.location.reload();else status.textContent=t('已保存');}catch(error){status.textContent=error.message;}};
    root.getElementById('choose-file').onclick=pick;root.getElementById('choose-folder').onclick=pick;root.getElementById('choose-folder').textContent=t('导入压缩包');
    const overlay=root.getElementById('attach-cloud');if(overlay){overlay.onclick=pick;overlay.title=t('请将线框与点云放在同一压缩包目录内导入');}
    const home=root.querySelector('.back-home');home.href='assets/mobile/index.html';home.onclick=async event=>{event.preventDefault();try{await flush();root.location.href=home.href;}catch{}};
    for(const name of ['input','change','click','pointerup','touchend','wheel','keyup'])root.addEventListener(name,schedule,{passive:true});
    const background=()=>{flush().catch(()=>{});onBackground();};
    root.addEventListener('visibilitychange',()=>root.hidden?background():onForeground());
    globalThis.addEventListener('bwvPause',background);globalThis.addEventListener('bwvResume',()=>{onForeground();flush().catch(()=>{});});globalThis.addEventListener('bwvMemoryPressure',onBackground);
    await api.addListener('projectsChanged',()=>{status.textContent=t('收到新项目，返回首页查看');});
    // Processing finishes after its initiating click; observe only project/tree changes, never the render canvas.
    const observer=new MutationObserver(schedule);for(const node of root.querySelectorAll('#data-list,#model-list'))observer.observe(node,{childList:true,subtree:true});
    return {flush,schedule};
  }catch(error){status.textContent=t('项目恢复失败');status.title=error.message;const p=root.createElement('p');p.className='error-banner';p.textContent=error.message;root.querySelector('main').prepend(p);return null;}
}
export function captureMobileInputs(root=document){
  return [...root.querySelectorAll('#settings-panel-display input,#settings-panel-display select')].filter(el=>el.type!=='file'&&(el.id||el.dataset.mobileKey||el.getAttribute('aria-label'))).map(el=>({id:el.id,key:el.dataset.mobileKey,aria:el.getAttribute('aria-label'),value:el.type==='checkbox'?el.checked:el.value}));
}
export function restoreMobileInputs(values,root=document){
  for(const value of values||[]){const el=value.id?root.getElementById(value.id):value.key?[...root.querySelectorAll('[data-mobile-key]')].find(el=>el.dataset.mobileKey===value.key):[...root.querySelectorAll('#settings-panel-display [aria-label]')].find(el=>el.getAttribute('aria-label')===value.aria);if(!el)continue;
    if(el.type==='checkbox')el.checked=Boolean(value.value);else el.value=String(value.value);
    if(el.closest('.presentation-controls')||el.closest('.palette-panel'))el.dispatchEvent(new Event('change',{bubbles:true}));
  }
}
export async function nativeExportWriter(name){
  const api=mobileProjects(),{token}=await api.beginExport({name});
  return {token,async write(chunk){const bytes=typeof chunk==='string'?new TextEncoder().encode(chunk):new Uint8Array(chunk.buffer||chunk,chunk.byteOffset||0,chunk.byteLength);for(let start=0;start<bytes.length;start+=262144){let binary='';const part=bytes.subarray(start,start+262144);for(let i=0;i<part.length;i+=8192)binary+=String.fromCharCode(...part.subarray(i,i+8192));await api.appendExport({token,data:btoa(binary)});}},async share(type){await api.finishExport({token,type});},async commit(id,path){return api.commitExport({token,id,path});},async abort(){await api.cancelExport({token});}};
}
