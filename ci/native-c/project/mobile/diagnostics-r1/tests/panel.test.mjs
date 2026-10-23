import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSelfTestPanel} from '../src/self-test-panel.mjs';
import {SelfTestRunner} from '../src/self-test-runner.mjs';
import {delay} from './helpers.mjs';
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.hidden=false;this.disabled=false;this.dataset={};this.events=new Map();this.attributes={};}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(type,handler){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(handler);}
  removeEventListener(type,handler){this.events.get(type)?.delete(handler);}
  async dispatch(type,event={}){for(const fn of this.events.get(type)||[])await fn(event);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);}
}
function fixture(exportReport){const doc=new Element('document');doc.createElement=tag=>new Element(tag);doc.defaultView=new Element('window');doc.visibilityState='visible';const root=new Element('root');const runner=new SelfTestRunner({hostKind:'node',workerProbe:null});const mounted=mountSelfTestPanel({root,runner,exportReport,document:doc});const [start,panel]=mounted.element.children;const [title,note,status,progress,list,controls]=panel.children;const [cancel,save,close]=controls.children;return {doc,root,runner,mounted,start,panel,status,progress,list,cancel,save,close};}
test('mount does not autorun tests or open native save; one click executes and renders honest summary',async()=>{
  let exports=0;const f=fixture(async()=>{exports++;});assert.equal(f.runner.lastReport,null);assert.equal(f.panel.hidden,true);assert.equal(exports,0);
  await f.start.dispatch('click');assert.equal(f.panel.hidden,false);assert.equal(f.runner.lastReport.state,'FINISHED');assert.equal(f.progress.value,8);assert.match(f.status.textContent,/尚未完整验证/);assert.equal(f.save.disabled,false);assert.equal(exports,0);f.mounted.unmount();
});
test('synthetic export click is ignored; a trusted explicit click exports only current bounded JSON',async()=>{
  const exports=[];const f=fixture(async item=>{exports.push(item);});await f.start.dispatch('click');await f.save.dispatch('click',{isTrusted:false});assert.equal(exports.length,0);
  await f.save.dispatch('click',{isTrusted:true});assert.equal(exports.length,1);assert.equal(JSON.parse(exports[0].text).runId,f.runner.lastReport.runId);assert.match(exports[0].fileName,/^bwv-selftest-[a-f0-9-]+\.json$/);assert.equal(exports[0].mimeType,'application/json');f.mounted.unmount();
});
test('absent exporter is explicit, not a fictional saved report',async()=>{
  const f=fixture();await f.start.dispatch('click');assert.equal(f.save.disabled,true);assert.match(f.status.textContent,/尚未接入本地报告保存/);f.mounted.unmount();
});
test('repeated clicks while running do not overlap; close cancels and stale completion cannot reopen panel',async()=>{
  const f=fixture();let release;f.runner.environment.workerProbe=()=>new Promise(resolve=>{release=resolve;});
  const first=f.start.dispatch('click');await delay(5);const id=f.runner.active.id;await f.start.dispatch('click');assert.equal(f.runner.active.id,id);
  await f.close.dispatch('click');await first;assert.equal(f.panel.hidden,true);assert.equal(f.runner.lastReport.state,'QUARANTINED');release({});await delay(10);assert.equal(f.panel.hidden,true);assert.equal(f.runner.busy,false);f.mounted.unmount();
});
test('backgrounding and unmount cancel; lifecycle listeners are removed on unmount',async()=>{
  const f=fixture();let release;f.runner.environment.workerProbe=()=>new Promise(resolve=>{release=resolve;});const first=f.start.dispatch('click');await delay(5);f.doc.visibilityState='hidden';await f.doc.dispatch('visibilitychange');await first;assert.equal(f.runner.lastReport.summary.automaticOutcome,'CANCELLED');
  f.mounted.unmount();assert.equal(f.root.children.length,0);assert.equal(f.doc.events.get('visibilitychange').size,0);assert.equal(f.doc.defaultView.events.get('pagehide').size,0);release({});await delay(10);
});
test('failed export can be retried but never reports successful saving',async()=>{
  const f=fixture(async()=>{throw new Error('/personal/path');});await f.start.dispatch('click');await f.save.dispatch('click',{isTrusted:true});assert.match(f.status.textContent,/尚未保存/);assert.ok(!f.status.textContent.includes('/personal'));assert.equal(f.save.disabled,false);f.mounted.unmount();
});
test('pending local save blocks restart and stale export completion cannot replace a newer run',async()=>{
  let finishSave;const f=fixture(()=>new Promise(resolve=>{finishSave=resolve;}));
  await f.start.dispatch('click');const original=f.runner.lastReport.runId;
  const saving=f.save.dispatch('click',{isTrusted:true});
  const startWasDisabled=f.start.disabled;
  await f.start.dispatch('click');const restartOccurred=f.runner.lastReport.runId!==original;
  finishSave({saved:true});await saving;
  f.mounted.unmount();
  assert.deepEqual({startWasDisabled,restartOccurred},{startWasDisabled:true,restartOccurred:false});
});
test('render events cannot re-enable start while a save flow is pending',async()=>{
  let finishSave;const f=fixture(()=>new Promise(resolve=>{finishSave=resolve;}));await f.start.dispatch('click');
  const saving=f.save.dispatch('click',{isTrusted:true});f.runner.emit('progress',f.runner.lastReport);
  assert.equal(f.start.disabled,true);assert.equal(f.save.disabled,true);assert.match(f.status.textContent,/正在保存/);
  finishSave({saved:true});await saving;assert.equal(f.start.disabled,false);assert.equal(f.save.disabled,false);f.mounted.unmount();
});
test('cancelled local save unlocks retry and restart without claiming a saved report',async()=>{
  let finishSave;const f=fixture(()=>new Promise(resolve=>{finishSave=resolve;}));await f.start.dispatch('click');const original=f.runner.lastReport.runId;
  const saving=f.save.dispatch('click',{isTrusted:true});await f.start.dispatch('click');assert.equal(f.runner.lastReport.runId,original);
  finishSave({cancelled:true});await saving;assert.match(f.status.textContent,/已取消保存/);assert.equal(f.start.disabled,false);assert.equal(f.save.disabled,false);
  await f.start.dispatch('click');assert.notEqual(f.runner.lastReport.runId,original);assert.match(f.status.textContent,/尚未完整验证/);f.mounted.unmount();
});
test('deferred save error unlocks controls and does not leak raw error details',async()=>{
  let failSave;const f=fixture(()=>new Promise((resolve,reject)=>{failSave=reject;}));await f.start.dispatch('click');const original=f.runner.lastReport.runId;
  const saving=f.save.dispatch('click',{isTrusted:true});await f.start.dispatch('click');assert.equal(f.runner.lastReport.runId,original);
  failSave(new Error('/personal/path/secret'));await saving;assert.match(f.status.textContent,/尚未保存/);assert.ok(!f.status.textContent.includes('/personal'));
  assert.equal(f.start.disabled,false);assert.equal(f.save.disabled,false);await f.start.dispatch('click');assert.notEqual(f.runner.lastReport.runId,original);f.mounted.unmount();
});
test('close and background during export do not reopen panel or start another test',async()=>{
  let finishSave;const f=fixture(()=>new Promise(resolve=>{finishSave=resolve;}));await f.start.dispatch('click');const original=f.runner.lastReport.runId;
  const saving=f.save.dispatch('click',{isTrusted:true});await f.close.dispatch('click');f.doc.visibilityState='hidden';await f.doc.dispatch('visibilitychange');await f.doc.defaultView.dispatch('pagehide');await f.start.dispatch('click');
  assert.equal(f.panel.hidden,true);assert.equal(f.runner.lastReport.runId,original);assert.equal(f.start.disabled,true);
  finishSave({cancelled:true});await saving;assert.equal(f.panel.hidden,true);assert.equal(f.start.disabled,false);f.mounted.unmount();
});
test('unmount during export prevents every late DOM update',async()=>{
  let finishSave;const f=fixture(()=>new Promise(resolve=>{finishSave=resolve;}));await f.start.dispatch('click');const saving=f.save.dispatch('click',{isTrusted:true});const text=f.status.textContent;
  f.mounted.unmount();finishSave({saved:true});await saving;assert.equal(f.root.children.length,0);assert.equal(f.status.textContent,text);
  assert.equal(f.doc.events.get('visibilitychange').size,0);assert.equal(f.doc.defaultView.events.get('pagehide').size,0);
});
test('old export completion cannot overwrite a run started by another runner owner',async()=>{
  let finishSave,finishWorker;const f=fixture(()=>new Promise(resolve=>{finishSave=resolve;}));await f.start.dispatch('click');const original=f.runner.lastReport.runId;const saving=f.save.dispatch('click',{isTrusted:true});
  f.runner.environment.workerProbe=()=>new Promise(resolve=>{finishWorker=resolve;});const next=f.runner.run();await delay(5);assert.notEqual(f.runner.lastReport.runId,original);
  finishSave({saved:true});await saving;assert.equal(f.runner.busy,true);assert.match(f.status.textContent,/正在自动测试/);assert.ok(!f.status.textContent.includes('保存流程已返回'));assert.equal(f.start.disabled,true);
  finishWorker({});await next;assert.match(f.status.textContent,/发现失败/);f.mounted.unmount();
});
