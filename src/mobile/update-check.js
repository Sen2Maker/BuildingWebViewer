/** Optional network work must never gate local project startup or reload a live page. */
export function mobileDeadline(work, milliseconds = 3000) {
  let timer;
  return Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Update check timed out')),milliseconds);})]).finally(()=>clearTimeout(timer));
}
export async function runMobileUpdate({api,onVersion=()=>{},ask=()=>false,onDownload=()=>{},isHome=()=>true,once=()=>true,timeout=3000}) {
  try { await mobileDeadline(()=>api.updateHealthy(),timeout); } catch { /* Local content stays usable. */ }
  if(!once())return 'skipped';
  try {
    const info=await mobileDeadline(()=>api.checkUpdate(),timeout);
    onVersion(info);
    if(!isHome()||info.kind==='none'||info.kind==='offline')return info.kind;
    if(info.kind==='apk'){
      if(!await ask('apk',info)||!isHome())return 'declined';
      onDownload('apk');await api.downloadApkUpdate();return 'apk-ready';
    }
    if(info.kind!=='patch'&&info.kind!=='feature')return 'offline';
    if(info.kind==='feature'&&!await ask('feature',info))return 'declined';
    if(!isHome())return 'skipped';
    onDownload('web');await api.installWebUpdate();
    // Stage only. Actual activation and the announcement happen on the next launch.
    return 'staged';
  } catch(error) { return error?.message==='Download cancelled'?'cancelled':'offline'; }
}
