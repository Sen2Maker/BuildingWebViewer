import { runMobileUpdate } from './update-check.js';
/** Read-only local version UI. No download, installation, health or activation authority. */
export function initializeMobileUpdates(api,doc=document) {
  const en=doc.documentElement.lang==='en';
  const panel=doc.getElementById('mobile-updates'),status=doc.getElementById('update-status');
  const disabled=()=>{status.textContent=en?'Automatic updates are disabled until signed distribution is configured. Offline projects remain available.':'签名分发尚未配置，自动更新暂未开放。本地项目仍可离线使用。';};
  doc.getElementById('show-updates').onclick=()=>{panel.hidden=!panel.hidden;disabled();};
  doc.getElementById('check-update').onclick=async()=>{await runMobileUpdate();disabled();};
  doc.getElementById('show-release-notes').onclick=async()=>{
    try{const result=await api.showReleaseNotes();status.textContent=String(result.notes?.[en?'en':'zh']||'');}
    catch{status.textContent=en?'Local release notes unavailable.':'本地版本说明暂不可用。';}
  };
  disabled();
}
