import { initializeLocale, t } from '../shared/i18n.js';
import { mobileProjects } from '../shared/mobile-project.js';
initializeLocale();
document.getElementById('mobile-language').href='?lang='+(document.documentElement.lang==='en'?'zh':'en');
const mobileHomeAPI=mobileProjects(),mobileHomeList=document.getElementById('projects'),mobileHomeStatus=document.getElementById('status');
let mobileShowTrash=false;
function mobileHomeSay(text){mobileHomeStatus.textContent=text;}
function mobileHomeButton(text,action){const b=document.createElement('button');b.textContent=t(text);b.onclick=()=>Promise.resolve().then(action).catch(error=>mobileHomeSay(error.message));return b;}
function mobileHomeOpen(project,tool){location.href=`../../${tool}.html?project=${encodeURIComponent(project.id)}&lang=${document.documentElement.lang==='en'?'en':'zh'}`;}
async function refreshMobileProjects(){
  if(!mobileHomeAPI){mobileHomeSay(t('此页面需要 Android App。网页版请使用工具首页。'));return;}
  const {projects}=await mobileHomeAPI.listProjects();mobileHomeList.replaceChildren();
  for(const p of projects.filter(p=>Boolean(p.trashed)===mobileShowTrash)){
    const card=document.createElement('article'),heading=document.createElement('h2'),info=document.createElement('p'),tools=document.createElement('div'),actions=document.createElement('div');tools.className='mobile-tools';actions.className='mobile-actions';heading.textContent=p.name;
    info.textContent=t('{0} 个文件 · {1} MB',[p.files.length,(p.files.reduce((n,f)=>n+f.size,0)/1048576).toFixed(1)])+' · '+new Date(p.updatedAt).toLocaleString();
    card.append(heading,info);
    if(p.status!=='ready'){const note=document.createElement('p');note.className='mobile-warning';note.textContent=p.error||t('导入未完成，可重试或清理');card.append(note);if(p.importJob)actions.append(mobileHomeButton('重试导入',async()=>{await mobileHomeAPI.retryImport({id:p.id});await refreshMobileProjects();}),mobileHomeButton('清理未完成导入',async()=>{await mobileHomeAPI.discardImport({id:p.id});await refreshMobileProjects();}));}
    if(mobileShowTrash)actions.append(mobileHomeButton('恢复项目',async()=>{await mobileHomeAPI.trashProject({id:p.id,trashed:false});await refreshMobileProjects();}));
    else{
      for(const [tool,title] of [['lod','LOD 模型'],['wireframe','建筑线框'],['pointcloud','点云']])tools.append(mobileHomeButton(title,()=>mobileHomeOpen(p,tool)));
      actions.append(mobileHomeButton('导出项目备份',async()=>{mobileHomeSay(t('正在导出备份…'));await mobileHomeAPI.backupProject({id:p.id});mobileHomeSay(t('已发起分享'));}),mobileHomeButton('添加文件',async()=>{mobileHomeSay(t('正在导入…'));await mobileHomeAPI.pickFiles({id:p.id});await refreshMobileProjects();mobileHomeSay(t('已保存'));}),mobileHomeButton('重命名',async()=>{const name=prompt(t('项目名称'),p.name);if(name){await mobileHomeAPI.renameProject({id:p.id,name});await refreshMobileProjects();}}),mobileHomeButton('移入回收站',async()=>{await mobileHomeAPI.trashProject({id:p.id,trashed:true});await refreshMobileProjects();}));
    }
    card.append(tools,actions);mobileHomeList.append(card);
  }
  if(!mobileHomeList.children.length){const empty=document.createElement('p');empty.textContent=t('从分享接收文件，或新建一个项目。');mobileHomeList.append(empty);}
}
document.getElementById('new-project').onclick=async()=>{try{const name=prompt(t('项目名称'),new Date().toLocaleDateString());if(name===null)return;await mobileHomeAPI.createProject({name});await refreshMobileProjects();}catch(error){mobileHomeSay(error.message);}};
document.getElementById('import-project').onclick=async()=>{try{mobileHomeSay(t('正在导入…'));const result=await mobileHomeAPI.pickFiles({});await refreshMobileProjects();mobileHomeSay(result.cancelled?'':t('导入完成，请选择查看工具'));}catch(error){mobileHomeSay(error.message);await refreshMobileProjects();}};
document.getElementById('trash').onclick=async()=>{mobileShowTrash=!mobileShowTrash;document.getElementById('trash').textContent=t(mobileShowTrash?'返回项目':'回收站');await refreshMobileProjects();};
refreshMobileProjects().catch(error=>mobileHomeSay(error.message));
if(mobileHomeAPI)mobileHomeAPI.addListener('projectsChanged',async info=>{mobileHomeSay(info.error||t('收到新项目，请选择查看工具'));await refreshMobileProjects();});

document.getElementById('clean-storage').onclick=async()=>{try{const {freed}=await mobileHomeAPI.cleanupStorage();mobileHomeSay(t('已清理 {0} MB 未引用文件',[(freed/1048576).toFixed(1)]));}catch(error){mobileHomeSay(error.message);}};
document.getElementById('empty-trash').onclick=async()=>{if(!confirm(t('永久删除回收站内的项目？请先导出需要的项目备份。')))return;try{await mobileHomeAPI.emptyTrash();await refreshMobileProjects();}catch(error){mobileHomeSay(error.message);}};
async function checkMobileUpdate(){
  if(!mobileHomeAPI)return;
  await mobileHomeAPI.updateHealthy();
  try{
    const info=await mobileHomeAPI.checkUpdate();
    document.getElementById('version-info').textContent=t('App 网页 v{0} · 在线网页 v{1}',[info.current,info.website]);
    if(info.kind==='none')return;
    if(info.kind==='apk'){
      if(confirm(t('网页已更新到 v{0}，此更新需要新版 APK。打开发布页面？',[info.website])))location.href=info.release;
      return;
    }
    if(info.kind==='feature'&&!confirm(t('发现功能更新 v{0}。现在更新 App 网页？项目和数据会保留。',[info.website])))return;
    await mobileHomeAPI.installWebUpdate();
    // Updates activate at the project home, never while a viewer is editing a project.
    if(location.pathname.endsWith('/assets/mobile/index.html'))await mobileHomeAPI.activateWebUpdate();
  }catch{document.getElementById('version-info').textContent=t('离线可用 · 暂未取得在线版本');}
}
checkMobileUpdate();
