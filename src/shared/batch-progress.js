import { t } from './i18n.js';
/** Count complete items, never the current file's bytes. Failures are processed items too. */
export function batchProgressState(done,total,{unit='个对象',failed=0,preparing=false}={}) {
  total=Math.max(0,Math.floor(Number(total)||0));done=Math.min(total,Math.max(0,Math.floor(Number(done)||0)));
  failed=Math.min(done,Math.max(0,Math.floor(Number(failed)||0)));
  const fraction=total?done/total:0;
  let text=t('已处理 {0} / {1} {2}',[done,total,t(unit)]);
  if(failed)text+=t(' · {0} 项失败',[failed]);
  const summary=text+(preparing?t(' · 正在准备画面…'):'');
  text=summary+(preparing?'':` · ${Math.floor(fraction*100)}%`);
  return {done,total,failed,fraction,text,summary};
}
export function createBatchProgress(box,{total,unit='个对象',current=()=>true}={}) {
  const doc=box.ownerDocument;
  let bar=box.querySelector('progress');if(!bar){bar=doc.createElement('progress');box.append(bar);}
  bar.max=1;bar.hidden=false;bar.setAttribute('aria-label',t('整批加载进度'));box.classList.add('has-progress');box.classList.add('batch-loading');
  let visual=box.querySelector('.batch-progress-visual');
  if(!visual){
    const make=className=>{const node=doc.createElement('div');node.className=className;return node;};
    visual=make('batch-progress-visual');visual.setAttribute('aria-hidden','true');
    const track=make('batch-progress-track'),fill=make('batch-progress-fill'),badge=make('batch-progress-percent'),text=doc.createElement('span');text.className='batch-progress-percent-text';
    const marker=make('batch-progress-marker');track.append(fill);badge.append(text);marker.append(badge);visual.append(track,marker);box.append(visual);
  }
  let completed=0,failures=0;
  const report=(done,failed=failures,preparing=false)=>{
    if(!current())return;
    completed=Math.max(completed,done);failures=Math.max(failures,failed);
    const state=batchProgressState(completed,total,{unit,failed:failures,preparing});
    box.querySelector('span').textContent=state.summary;bar.value=state.fraction;
    bar.setAttribute('aria-valuetext',state.text);
    visual.style.setProperty('--batch-progress',`${state.fraction*100}%`);
    visual.querySelector('.batch-progress-percent-text').textContent=`${Math.floor(state.fraction*100)}%`;
    return state;
  };
  report(0);return {report,prepare:()=>report(total,failures,true)};
}
