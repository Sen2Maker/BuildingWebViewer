import {createComparisonSession} from '../compare/session.js';
import {demonstrationLink, comparisonLink} from '../shared/online-compare-core.js';
import {getLanguage} from '../shared/i18n.js';
import {objectNavigationDirection} from '../shared/object-selection.js';
import {mountOnlineShare} from '../shared/online-share.js';
import {readPresentation,withPresentation} from '../shared/online-presentation.js';
import './online.css';

const text=(zh,en)=>getLanguage()==='en'?en:zh;
const number=value=>Number(value||0).toLocaleString();
const el=(tag,parent,content='',className='')=>{const node=document.createElement(tag);node.textContent=content;node.className=className;parent?.append(node);return node;};

/** Online is a data source for the existing mesh workspace, not a second viewer. */
export function mountOnlineLod({descriptor,onReset,onMesh,onCloud,onRefinement,onError,refresh,captureCamera,applyView,configuration,isFlying=()=>false,sessionFactory=createComparisonSession,shareFactory=mountOnlineShare}) {
  readPresentation(); // Reject invalid shared settings before starting remote work.
  const $=id=>document.getElementById(id);
  document.body.classList.add('online-workspace');
  const mode=document.querySelector('.local-tag');mode.replaceChildren();el('i',mode);mode.append(text(' 在线模式',' Online mode'));
  const source=document.querySelector('.project-import');source.replaceChildren();
  const local=el('a',source,text('打开本地文件','Open local files'),'online-local-link');local.href='lod.html?lang='+getLanguage();
  el('p',source,text('在线建筑集合 · 选择后按需加载','Online collection · Load a building on demand'),'online-source');
  document.querySelector('.sidebar-heading h2').textContent=text('在线建筑','Online buildings');
  document.querySelector('.sidebar').setAttribute('aria-label',text('在线建筑','Online buildings'));
  $('search').placeholder=text('搜索建筑 ID…','Search building IDs…');$('search').ariaLabel=text('搜索建筑 ID','Search building IDs');
  $('selected-models').setAttribute('aria-label',text('当前建筑','Current building'));
  const previous=$('previous-mesh-id'),next=$('next-mesh-id'),counter=$('mesh-navigation-position');
  for(const button of [previous,next]){button.hidden=false;button.disabled=true;}
  $('previous-group').hidden=true;$('next-group').hidden=true;counter.textContent='0 / 0';
  $('mesh-mode-select').value='single';$('mesh-mode-select').disabled=true;
  $('mesh-file-select').closest('label').hidden=true;$('mesh-version-note').hidden=true;
  $('mesh-mode-note').textContent=text('单个 ID：用两侧箭头或键盘 ← / → 切换。中间显示当前序号 / 总数。','Single ID: use the arrows or keyboard ← / → to browse. The center shows the current position / total.');
  const sharing=shareFactory({anchor:document.querySelector('.main-heading .button-row'),captureCamera,applyView,configuration,
    ready:()=>state.mesh==='ready'&&state.cloud==='ready',link:()=>comparisonLink({...descriptor,buildingId:selectedId||descriptor.buildingId},location.href)});
  const refinement=el('div',null,'','online-refinement');$('viewer-grid').after(refinement);
  const detail=el('span',refinement);detail.setAttribute('role','status');
  const toggle=el('button',refinement);toggle.type='button';refinement.hidden=true;
  const pager=el('div',$('project-controls'),'','online-catalog-pages');
  const pagePrevious=el('button',pager,text('上一页','Previous page')),pageNumber=el('span',pager),pageNext=el('button',pager,text('下一页','Next page'));
  let buildings=[],state={},page=0,selectedId=null,lastPhase=null,disconnected=false,disposed=false;
  const matches=()=>buildings.filter(item=>item.id.toLocaleLowerCase().includes($('search').value.trim().replace(/^#/,'').toLocaleLowerCase()));
  function renderList(){
    const filtered=matches(),pages=Math.max(1,Math.ceil(filtered.length/40));page=Math.max(0,Math.min(page,pages-1));
    const list=$('model-list');list.replaceChildren();
    for(const item of filtered.slice(page*40,(page+1)*40)){
      const button=el('button',list,text('建筑 ','Building ')+item.id,'online-building-row');button.type='button';button.setAttribute('aria-pressed',String(item.id===selectedId));
      button.onclick=()=>select(item.id);
    }
    if(!filtered.length)el('p',list,text('没有匹配的建筑','No matching buildings'));
    $('filter-count').textContent=text('匹配 ','Matches: ')+number(filtered.length);$('item-count').textContent=number(buildings.length);
    pageNumber.textContent=`${page+1} / ${pages}`;pagePrevious.disabled=!page;pageNext.disabled=page+1>=pages;
  }
  $('search').oninput=()=>{page=0;renderList();};
  $('search').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();const query=$('search').value.trim().replace(/^#/,'');const found=buildings.find(b=>b.id===query)||(matches().length===1?matches()[0]:null);if(found)select(found.id);}};
  pagePrevious.onclick=()=>{page--;renderList();};pageNext.onclick=()=>{page++;renderList();};
  function address(id){
    const params=new URLSearchParams(location.search);
    let url=params.has('dataset')&&!new URLSearchParams(location.hash.slice(1)).has('compare')
      ?demonstrationLink(id,location.href,params.get('quality')||'preview'):comparisonLink({...descriptor,buildingId:id},location.href);
    const view=readPresentation();if(view&&!(params.has('presentation')&&!new URLSearchParams(location.hash.slice(1)).has('view'))){if(id!==descriptor.buildingId)delete view.camera;url=withPresentation(url,view);}
    const target=new URL(url);if(params.get('configure')==='1')target.searchParams.set('configure','1');url=target.href;
    history.replaceState(null,'',url);
  }
  function labels(){
    const id=selectedId||descriptor.buildingId;
    for(let i=1;i<=3;i++){
      const layer=$('mesh-layers-'+i).value;
      $('mesh-panel-label-'+i).textContent=`${id} · ${layer==='cloud'?text('点云','Points'):layer==='mesh'?'Mesh':text('网格与点云','Mesh + points')}`;
    }
  }
  function controls(){
    const count=Number($('viewer-grid').dataset.panels);
    $('mesh-compare-count').value=String(count);$('mesh-sync-camera').closest('label').hidden=count===1;
    for(let i=1;i<=3;i++){
      const select=$('mesh-variant-'+i);select.replaceChildren();const option=el('option',select,'final.obj');option.value='online';select.value='online';select.disabled=true;$('mesh-slot-'+i).hidden=i>count;
    }
    const cloud=$('mesh-cloud-file');cloud.replaceChildren();const option=el('option',cloud,text('当前建筑的在线点云','Current building’s online points'));option.value='online';cloud.disabled=true;
    labels();
  }
  function update(nextState){
    if(disposed)return;
    state=nextState;
    if(state.phase==='selection'&&lastPhase!=='selection'){selectedId=state.id;if(!$('search').value.trim())page=Math.max(0,Math.floor(buildings.findIndex(b=>b.id===selectedId)/40));sharing.loading();onReset(state.id);$('error').hidden=true;renderList();}
    lastPhase=state.phase;
    const index=Number.isInteger(state.index)?state.index:-1,total=state.total||0;
    counter.textContent=`${index>=0?index+1:0} / ${total}`;
    if(index>=0)address(state.id);
    previous.disabled=index<=0;next.disabled=index<0||index+1>=total;
    $('selected-models').textContent=text('建筑 ','Building ')+(selectedId||descriptor.buildingId);
    $('scene-stats').textContent=state.cloud==='ready'
      ?`${number(state.cloudPoints)}${state.totalCloudPoints>state.cloudPoints?' / '+number(state.totalCloudPoints):''} ${text('点','points')}`
      :state.cloud==='error'?text('点云加载失败，可重试','Point loading failed; retry'):state.mesh==='loading'?text('正在加载模型…','Loading mesh…'):text('正在加载点云…','Loading points…');
    $('loading').hidden=state.mesh==='ready'||state.mesh==='error'||state.phase==='error';
    $('empty-state').hidden=true;
    const status=state.refinement;refinement.hidden=!status;
    toggle.hidden=status==='complete';
    toggle.textContent=status==='loading'?text('暂停细化','Pause detail'):status==='error'?text('重试细化','Retry detail'):text('继续细化','Continue detail');
    detail.textContent=status==='complete'?text('全部细节已载入','All detail loaded'):status==='error'?text('细化失败，已加载内容保留','Detail failed; loaded points retained'):status==='paused'?(state.refinementReason==='budget'?text('已达本轮点数预算','Point budget reached'):text('细化已暂停','Detail paused')):`${text('逐步细化','Loading detail')} ${state.refinementCompleted||0} / ${state.refinementTotal||0}`;
    labels();
    if(state.mesh==='ready'&&state.cloud==='ready')void sharing.loaded();
  }
  const session=sessionFactory({manifest:descriptor.manifest,initialId:descriptor.buildingId,preset:descriptor.preset,maxPoints:descriptor.maxPoints,buildingIds:descriptor.buildingIds,
    onCatalog:({buildings:items})=>{buildings=items;page=Math.max(0,Math.floor(buildings.findIndex(b=>b.id===selectedId)/40));renderList();},onMesh,onCloud,onRefinement,onState:update,
    onError:({error})=>onError(error.message||String(error),true)});
  function select(id){if(disposed||disconnected)return;void session.select(id);}
  previous.onclick=()=>{if(!disconnected)void session.previous();};next.onclick=()=>{if(!disconnected)void session.next();};
  $('retry').onclick=()=>{if(disconnected){location.reload();return;}void session.select(selectedId||descriptor.buildingId);};
  toggle.onclick=()=>state.refinement==='loading'?session.pauseRefinement():void session.resumeRefinement();
  const pause=()=>{if(state.refinement==='loading')session.pauseRefinement('interaction');};
  $('viewer-grid').addEventListener('pointerdown',pause);$('viewer-grid').addEventListener('wheel',pause,{passive:true});
  const hidden=()=>{if(document.visibilityState==='hidden')session.pauseRefinement('hidden');};document.addEventListener('visibilitychange',hidden);
  const keyboard=event=>{const direction=objectNavigationDirection(event,{multiple:false,flying:isFlying()});if(direction&&!event.defaultPrevented){event.preventDefault();if(direction<0)previous.click();else next.click();}};
  document.addEventListener('keydown',keyboard);
  const offline=()=>{disconnected=true;session.dispose();previous.disabled=next.disabled=true;toggle.disabled=true;onError(text('网络已断开，已加载内容仍可查看。联网后点击重试。','Offline. Loaded content remains available. Reconnect and retry.'),true);};
  window.addEventListener('offline',offline);
  const dispose=()=>{disposed=true;session.dispose();sharing.dispose();document.removeEventListener('visibilitychange',hidden);document.removeEventListener('keydown',keyboard);window.removeEventListener('offline',offline);};
  window.addEventListener('pagehide',dispose,{once:true});
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  window.addEventListener('hashchange',()=>location.reload());
  return {start:()=>session.start(),select,controls,labels,refresh:()=>refresh(),dispose};
}
