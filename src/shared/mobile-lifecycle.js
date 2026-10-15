/** Visibility and native events describe the same lifecycle; each transition runs once. */
export function mountMobileLifecycle({root=document, host=globalThis, autosave, onBackground=()=>{}, onForeground=()=>{}}) {
  let nativePaused=false, paused=false;
  const reconcile=()=>{
    const next=Boolean(root.hidden)||nativePaused;if(next===paused)return;
    paused=next;
    if(paused){autosave.pause().catch(()=>{});onBackground();}
    else{autosave.resume();onForeground();}
  };
  const pause=()=>{nativePaused=true;reconcile();},resume=()=>{nativePaused=false;reconcile();};
  root.addEventListener('visibilitychange',reconcile);
  host.addEventListener('bwvPause',pause);host.addEventListener('bwvResume',resume);
  host.addEventListener('bwvMemoryPressure',onBackground);
  reconcile();
  return ()=>{root.removeEventListener('visibilitychange',reconcile);host.removeEventListener('bwvPause',pause);host.removeEventListener('bwvResume',resume);host.removeEventListener('bwvMemoryPressure',onBackground);};
}
