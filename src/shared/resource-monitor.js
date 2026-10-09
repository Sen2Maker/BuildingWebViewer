import { t } from './i18n.js';

export function viewerResourceStats(viewers) {
  const totals = {models:0, triangles:0, points:0, edges:0, bufferBytes:0, contextLost:false};
  const seen = new Set();
  const addBuffer = value => {
    if (!value || seen.has(value)) return;
    seen.add(value); totals.bufferBytes += value.byteLength || 0;
  };
  for (const viewer of viewers) {
    if (!viewer || viewer.disposed) continue;
    totals.contextLost ||= Boolean(viewer.contextLost);
    totals.models += viewer.models?.length || 0; totals.triangles += viewer.triangleCount || 0;
    totals.points += viewer.pointCount || 0; totals.edges += viewer.edgeCount || 0;
    for (const buffer of Object.values(viewer.buffers || {})) addBuffer(buffer);
    for (const buffer of Object.values(viewer.styledLines?.shapes || {})) addBuffer(buffer);
    for (const entry of viewer.entityCache?.values() || []) {
      addBuffer(entry.points); addBuffer(entry.colors); addBuffer(entry.scalar); addBuffer(entry.sample);
    }
  }
  return totals;
}

export function readableMemory(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return t('不可用');
  if (bytes < 1024) return Math.round(bytes)+' B';
  if (bytes < 1024**2) return (bytes/1024).toFixed(1)+' KiB';
  return bytes >= 1024**3 ? (bytes/1024**3).toFixed(2)+' GiB' : (bytes/1024**2).toFixed(1)+' MiB';
}

/** Read existing buffer metadata; never force a render or read back GPU buffers. */
export function mountResourceMonitor({root=document, getViewers=()=>[]}) {
  const footer=root.querySelector('.workspace > main > footer');
  if (!footer || root.getElementById('resource-monitor')) return;
  const make=(tag,text)=>{const node=root.createElement(tag);if(text)node.textContent=text;return node;};
  const details=make('details');details.id='resource-monitor';details.className='resource-monitor';
  const summary=make('summary',t('运行状态'));summary.setAttribute('aria-controls','resource-panel');
  const panel=make('section');panel.id='resource-panel';panel.className='resource-panel';panel.setAttribute('aria-label',t('页面运行状态'));
  const heading=make('div');heading.className='resource-heading';heading.append(make('strong',t('页面运行状态')));
  const close=make('button','×');close.type='button';close.setAttribute('aria-label',t('关闭运行状态'));heading.append(close);
  const list=make('dl'), values={};
  for(const [key,label] of [['heap','JS 堆内存（近似）'],['buffers','几何缓冲'],['refresh','界面刷新率（采样）'],['models','已加载模型 / 三角面'],['clouds','已加载点 / 线段'],['system','电脑 CPU / GPU 占用']]) {
    const row=make('div');values[key]=make('dd','—');row.append(make('dt',t(label)),values[key]);list.append(row);
  }
  const note=make('p',t('JS 堆内存不是页面总内存；几何缓冲仅统计已上传的数据（含缓存），不含驱动、纹理和帧缓冲，也不是显存总占用。数据规模按各视窗合计。'));
  const rateNote=make('p',t('刷新率用于观察界面响应，不等于模型渲染帧率。仅展开时采样；后台暂停。系统占用请使用任务管理器。'));
  panel.append(heading,list,note,rateNote);details.append(summary,panel);footer.insertBefore(details,footer.querySelector('.project-links'));
  let frame=null,last=0,frames=0,lastRate=null,disposed=false;
  const count=n=>Number(n).toLocaleString();
  function refresh() {
    if (disposed || root.hidden) return;
    const data=viewerResourceStats(getViewers());
    let heap=null;try{heap=globalThis.performance?.memory?.usedJSHeapSize;}catch{}
    values.heap.textContent=readableMemory(heap);values.buffers.textContent=data.contextLost?t('上下文已丢失'):readableMemory(data.bufferBytes);
    values.refresh.textContent=lastRate===null?'—':Math.round(lastRate)+' Hz';
    values.models.textContent=count(data.models)+' / '+count(data.triangles);
    values.clouds.textContent=count(data.points)+' / '+count(data.edges);
    values.system.textContent=t('浏览器未提供');
    summary.title=t('查看当前页面的数据规模与运行状态');
  }
  function stop(){if(frame!==null)cancelAnimationFrame(frame);frame=null;last=0;frames=0;lastRate=null;}
  function tick(now) {
    if(disposed || !details.open || root.hidden){stop();return;}
    if(!last)last=now;else frames++;
    if(now-last>=1000){lastRate=frames*1000/(now-last);last=now;frames=0;refresh();}
    frame=requestAnimationFrame(tick);
  }
  function sample(){stop();refresh();if(details.open && !root.hidden)frame=requestAnimationFrame(tick);}
  details.addEventListener('toggle',sample);
  close.onclick=()=>{details.open=false;summary.focus();};
  const onKey=event=>{if(event.key==='Escape' && details.open){details.open=false;summary.focus();}};
  const onOutside=event=>{if(details.open && !details.contains(event.target))details.open=false;};
  root.addEventListener('visibilitychange',sample);root.addEventListener('keydown',onKey);root.addEventListener('pointerdown',onOutside);
  refresh();
  return ()=>{disposed=true;stop();root.removeEventListener('visibilitychange',sample);root.removeEventListener('keydown',onKey);root.removeEventListener('pointerdown',onOutside);details.remove();};
}
