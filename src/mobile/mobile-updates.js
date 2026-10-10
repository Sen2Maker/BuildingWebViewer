import { runMobileUpdate } from './update-check.js';

/** App-only controls: updates never interrupt project rendering or reload live pages. */
export function initializeMobileUpdates(api) {
  if (!api) return;
  const en=document.documentElement.lang==='en',say=(zh,enText)=>en?enText:zh;
  const panel=document.getElementById('mobile-updates'),status=document.getElementById('update-status');
  const check=document.getElementById('check-update'),install=document.getElementById('install-update'),permission=document.getElementById('install-permission'),cancel=document.getElementById('cancel-update');
  for(const [id,zh,english] of [
    ['show-updates','版本与更新','Version & updates'],['check-update','检查更新','Check updates'],
    ['show-release-notes','当前版本公告','Release notes'],['install-update','继续安装','Continue installation'],
    ['install-permission','允许安装更新','Allow installation'],['cancel-update','取消下载','Cancel download']
  ])document.getElementById(id).textContent=say(zh,english);
  panel.querySelector('h2').textContent=say('版本与更新','Version & updates');
  let busy=false;
  const home=()=>!document.hidden && location.pathname.endsWith('/assets/mobile/index.html');
  const message=text=>{status.textContent=text;};
  async function refreshReady(){try{const ready=await api.apkUpdateStatus();install.hidden=!ready.ready;permission.hidden=!ready.ready||!ready.permissionRequired;if(ready.ready)message(say('安装包已验证，可继续安装。','The APK is verified and ready to install.'));}catch{}}
  document.getElementById('show-updates').onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)refreshReady();};
  document.getElementById('show-release-notes').onclick=()=>api.showReleaseNotes({manual:true,lang:en?'en':'zh'}).catch(()=>{});
  permission.onclick=()=>api.allowApkInstall().catch(error=>message(error.message));
  install.onclick=async()=>{try{const result=await api.installApkUpdate();if(result.permissionRequired){permission.hidden=false;message(say('请先允许此应用安装更新，然后返回并点击“继续安装”。','Allow this app to install updates, then return and select Continue installation.'));}else message(say('已交给系统安装，请完成系统确认。取消后仍可继续使用当前版本。','The Android installer is open. Confirm there; cancelling keeps your current version.'));}catch(error){message(error.message);}};
  cancel.onclick=()=>api.cancelApkDownload().catch(()=>{});
  api.addListener('apkUpdateProgress',info=>{message(say('正在下载 App 更新：','Downloading app update: ')+Math.min(100,Math.round(info.received/info.total*100))+'%');}).catch(()=>{});
  async function run(manual=false){
    if(busy)return;
    busy=true;check.disabled=true;
    if(manual){panel.hidden=false;message(say('正在检查签名更新…','Checking signed updates…'));}
    try{
      const result=await runMobileUpdate({api,isHome:home,
        once:()=>{if(manual)return true;try{if(sessionStorage.getItem('bwv.update.checked'))return false;sessionStorage.setItem('bwv.update.checked','1');}catch{}return true;},
        ask:(kind,info)=>confirm((kind==='apk'?say('发现 App 更新，需要下载并由 Android 确认安装。','App update available. Download it, then confirm installation in Android.'):say('发现功能更新，下次启动生效。','Feature update available; takes effect on next launch.'))+'\n\nv'+info.website+'\n\n'+(info.notes?.[en?'en':'zh']||'')+'\n\n'+say('是否下载？','Download now?')),
        onDownload:kind=>{if(kind==='apk'){panel.hidden=false;cancel.hidden=false;message(say('正在下载并验证 APK…','Downloading and verifying APK…'));}}
      });
      if(result==='apk-ready'){panel.hidden=false;await refreshReady();if(home())await install.onclick();}
      else if(result==='staged'){if(manual)message(say('网页更新已验证，下次重新启动 App 生效。','Web update verified. It will apply on your next app launch.'));}
      else if(manual)message(({none:say('当前已是最新兼容版本。','You are up to date.'),offline:say('未取得有效更新，可能是网络、设备时间或校验问题。当前版本仍可正常使用。','No valid update received. Check your connection or device time. Your local version remains usable.'),cancelled:say('下载已取消，保持当前版本。','Download cancelled; keeping your current version.'),declined:say('已取消，保持当前版本。','Cancelled; keeping your current version.')})[result]||say('未执行更新。','No update applied.'));
    }finally{busy=false;check.disabled=false;cancel.hidden=true;}
  }
  check.onclick=()=>run(true);
  setTimeout(()=>run(false),1500);
  refreshReady();
}
