/** Optional network work must never gate local project startup or reload a live page. */
export function mobileDeadline(work, milliseconds = 3000) {
  let timer;
  return Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Update check timed out')),milliseconds);})]).finally(()=>clearTimeout(timer));
}
export async function runMobileUpdate({api,onVersion=()=>{},ask=()=>false,openRelease=()=>{},isHome=()=>true,once=()=>true,timeout=3000}) {
  try { await mobileDeadline(()=>api.updateHealthy(),timeout); } catch { /* Local content stays usable. */ }
  if(!once())return 'skipped';
  try {
    const info=await mobileDeadline(()=>api.checkUpdate(),timeout);
    onVersion(info);
    if(!isHome()||info.kind==='none'||info.kind==='offline')return info.kind;
    if(info.kind==='apk'){if(ask('apk',info))openRelease(info.release);return 'apk';}
    if(info.kind==='feature'&&!ask('feature',info))return 'declined';
    await api.installWebUpdate();
    // Installation stages a verified local package. MainActivity selects it next launch.
    // Never reload: the user may already be importing or opening a project.
    return 'staged';
  } catch { return 'offline'; }
}
