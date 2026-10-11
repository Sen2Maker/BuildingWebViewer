import { mobileProjects, NativeProjectFile, nativeExportWriter } from './mobile-project.js';
import { createMobileHomeNavigation } from './mobile-navigation.js';

/** Native project lifecycle for editors with binary snapshots. Browser sessions remain local. */
export async function openWorkspaceSession({tool, restore, capture, onStatus, beforeLeave=()=>{}, onBackground=()=>{}, onForeground=()=>{}}) {
  const api=mobileProjects();if(!api)return null;
  const id=new URL(location.href).searchParams.get('project');
  if(!id){location.replace('assets/mobile/index.html');return {redirecting:true};}
  const status=document.createElement('span');status.className='mobile-save-status';status.setAttribute('role','status');document.querySelector('header').append(status);
  const report=(kind,error)=>{status.textContent=document.documentElement.lang==='en'?(kind==='saved'?'Saved':kind==='saving'?'Saving…':'Save failed'):(kind==='saved'?'已保存':kind==='saving'?'保存中…':'保存失败');onStatus(kind,error);};
  const project=await api.getProject({id});
  const state=project.states?.[tool]||null;
  const snapshotRecord=project.files.find(f=>f.key===state?.snapshotKey&&f.path===`.bwv/${tool}.snapshot`);
  if(state?.snapshotKey&&!snapshotRecord)throw Error('项目快照丢失 / Project snapshot is missing');
  const records=project.files.filter(f=>!f.path.startsWith('.bwv/')).map(record=>({file:new NativeProjectFile(id,record),path:record.path}));
  await restore({state,records,snapshot:snapshotRecord?new NativeProjectFile(id,snapshotRecord):null});
  let savedRevision=null,snapshotKey=state?.snapshotKey||null,lastState='',draining=null,queued=false,timer=null;
  // A newly imported workspace has no committed snapshot yet.
  if(!snapshotKey)savedRevision=null;
  async function flush(){
    clearTimeout(timer);timer=null;queued=true;if(draining)return draining;
    draining=Promise.resolve().then(async()=>{try{while(queued){queued=false;const current=capture(),stateText=JSON.stringify(current.state);
      if(current.revision!==savedRevision||!snapshotKey){
        report('saving');const blob=current.blob();const writer=await nativeExportWriter(`${tool}.snapshot`);
        try{for(let i=0;i<blob.size;i+=262144)await writer.write(await blob.slice(i,i+262144).arrayBuffer());
          const saved=await api.commitSnapshot({token:writer.token,id,tool,state:current.state});snapshotKey=saved.snapshotKey;savedRevision=current.revision;lastState=stateText;
        }catch(error){await writer.abort().catch(()=>{});throw error;}
      }else if(stateText!==lastState){report('saving');await api.saveState({id,tool,state:{...current.state,snapshotKey}});lastState=stateText;}
    }report('saved');}catch(error){report('error',error);throw error;}finally{draining=null;}});return draining;
  }
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),300);};
  const home=createMobileHomeNavigation({flush:async()=>{beforeLeave();await flush();},navigate:url=>location.replace(url),language:()=>document.documentElement.lang});
  const link=document.querySelector('.back-home');if(link){link.href='assets/mobile/index.html';link.onclick=e=>{e.preventDefault();home().catch(()=>{});};}
  globalThis.bwvReturnToProjectHome=()=>{const event=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});(document.activeElement||document).dispatchEvent(event);if(!event.defaultPrevented)home().catch(()=>{});};
  const background=()=>{flush().catch(()=>{});onBackground();};
  document.addEventListener('visibilitychange',()=>document.hidden?background():onForeground());
  globalThis.addEventListener('bwvPause',background);globalThis.addEventListener('bwvResume',onForeground);globalThis.addEventListener('bwvMemoryPressure',onBackground);
  for(const event of ['pointerup','keyup','change','wheel'])document.addEventListener(event,schedule,{passive:true});
  return {id,records,flush,schedule,async pick(){await flush();const result=await api.pickFiles({id});if(!result.cancelled)location.reload();},async home(){return home();}};
}
