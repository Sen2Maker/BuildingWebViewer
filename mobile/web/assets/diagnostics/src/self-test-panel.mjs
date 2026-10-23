import {CASES, serializeReport} from './self-test-runner.mjs';

const labels={PASS:'通过',FAIL:'失败',UNSUPPORTED:'不支持',NOT_RUN:'未执行',CANCELLED:'已取消'};
/** Mount only in a diagnostic build; exportReport must open a local save flow, never upload. */
export function mountSelfTestPanel({root,runner,exportReport,document:doc=globalThis.document}) {
  if (!root || !runner || !doc) throw new Error('SELF_TEST_UI_DEPENDENCY_MISSING');
  const make=(tag,text)=>{const element=doc.createElement(tag);if(text)element.textContent=text;return element;};
  const wrapper=make('section');wrapper.className='bwv-selftest';
  const start=make('button','一键手机自检（测试版）');start.type='button';
  const panel=make('section');panel.hidden=true;panel.setAttribute('aria-label','手机自动自检');
  const title=make('h2','手机自动自检');
  const note=make('p','只使用隔离测试数据，不修改你的项目，也不会联网、安装更新或上传报告。系统安装确认、真实触控和断电测试仍需手动。');
  const status=make('p','准备就绪');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const progress=make('progress');progress.max=CASES.filter(item=>!item.manual).length;progress.value=0;progress.setAttribute('aria-label','自动测试完成数量');
  const list=make('ol');const rows=new Map();
  for(const item of CASES){const row=make('li',`${item.title}：未执行`);list.append(row);rows.set(item.id,row);}
  const cancel=make('button','取消测试'), save=make('button','保存本地报告'), close=make('button','关闭');
  for(const button of [cancel,save,close])button.type='button';cancel.disabled=true;save.disabled=true;
  const controls=make('div');controls.className='bwv-selftest-actions';controls.append(cancel,save,close);
  panel.append(title,note,status,progress,list,controls);wrapper.append(start,panel);root.append(wrapper);
  let disposed=false,exporting=false;
  function render(report){
    if(disposed)return;const busy=runner.busy;start.disabled=busy||exporting;cancel.disabled=!busy;save.disabled=busy||exporting||!report||typeof exportReport!=='function';
    if(!report)return;
    progress.value=report.cases.filter(item=>!item.manual&&item.code!=='PENDING').length;
    for(const item of report.cases){const row=rows.get(item.id);row.textContent=`${item.title}：${labels[item.status]} · ${item.code}`;row.dataset.status=item.status;}
    if(exporting){status.textContent='正在保存本地报告，请完成或取消系统保存操作后再运行测试。';return;}
    const counts=report.summary.counts;
    status.textContent=report.state==='QUARANTINED'?'测试已停止等待；底层操作仍未结束。暂时不能重新运行，未确认清理完成。':report.state==='RUNNING'?'正在自动测试，可随时取消。':`自动测试${report.summary.automaticOutcome==='PASSED'?'已通过':report.summary.automaticOutcome==='FAILED'?'发现失败':report.summary.automaticOutcome==='CANCELLED'?'已取消':'尚未完整验证'}：通过 ${counts.PASS}，失败 ${counts.FAIL}，不支持 ${counts.UNSUPPORTED}，未执行 ${counts.NOT_RUN}，已取消 ${counts.CANCELLED}。清理：${report.cleanup}。`;
    if(report.state==='FINISHED'&&typeof exportReport!=='function')status.textContent+=' 此版本尚未接入本地报告保存。';
  }
  const unsubscribe=runner.subscribe(event=>render(event.report));
  start.addEventListener('click',async()=>{if(disposed||runner.busy||exporting)return;panel.hidden=false;start.disabled=true;cancel.disabled=false;save.disabled=true;status.textContent='正在启动自动测试…';try{render(await runner.run());}catch{status.textContent='测试未能启动，请等待当前测试结束后重试。';start.disabled=runner.busy;cancel.disabled=!runner.busy;}});
  cancel.addEventListener('click',()=>{runner.cancel();cancel.disabled=true;status.textContent='正在取消，等待底层操作安全结束…';});
  close.addEventListener('click',()=>{runner.cancel();panel.hidden=true;});
  const leave=()=>runner.cancel();const visibility=()=>{if(doc.visibilityState==='hidden')leave();};
  doc.addEventListener('visibilitychange',visibility);doc.defaultView?.addEventListener('pagehide',leave);
  save.addEventListener('click',async event=>{
    // A programmatic click must not trigger a system save dialog or share action.
    if(!event.isTrusted||disposed||runner.busy||exporting||!runner.lastReport||typeof exportReport!=='function')return;
    const report=runner.lastReport;
    exporting=true;render(report);
    let completionText;
    try{
      const outcome=await exportReport({runId:report.runId,fileName:`bwv-selftest-${report.runId.slice(9)}.json`,mimeType:'application/json',text:serializeReport(report)});
      completionText=outcome?.cancelled===true?'已取消保存，仍可在此重新保存报告。':'本地保存流程已返回。请以系统保存结果为准，报告没有自动上传。';
    }catch{completionText='报告尚未保存。可再次点“保存本地报告”。';}
    finally{
      exporting=false;
      if(!disposed){
        render(runner.lastReport);
        // Defence in depth if another owner starts the runner outside this panel.
        if(!runner.busy&&runner.lastReport?.runId===report.runId)status.textContent=completionText;
      }
    }
  });
  return {element:wrapper,unmount(){if(disposed)return;disposed=true;runner.cancel();unsubscribe();doc.removeEventListener('visibilitychange',visibility);doc.defaultView?.removeEventListener('pagehide',leave);wrapper.remove();}};
}
