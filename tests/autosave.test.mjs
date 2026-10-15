import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutosave} from '../src/shared/autosave.js';
test('camera events coalesce for five minutes; lifecycle flush cancels the deadline',async()=>{
  let now=0,next=0,writes=0;const jobs=new Map();
  const clock={setTimer:(fn,ms)=>{jobs.set(++next,{fn,at:now+ms});return next;},clearTimer:id=>jobs.delete(id)};
  const step=async(ms)=>{now+=ms;for(const[id,j]of jobs)if(j.at<=now){jobs.delete(id);j.fn();}await Promise.resolve();};
  const auto=createAutosave({...clock,save:()=>{writes++;}});
  auto.schedule();for(let i=0;i<100;i++)auto.schedule();assert.equal(jobs.size,1);
  await step(299999);assert.equal(writes,0);auto.schedule();await step(1);assert.equal(writes,1);
  auto.schedule();await auto.flush();assert.equal(writes,2);assert.equal(jobs.size,0);
  auto.schedule();await auto.pause();assert.equal(writes,3);auto.schedule();assert.equal(jobs.size,0);
  auto.resume();await step(300000);assert.equal(writes,4);auto.schedule();await step(300000);assert.equal(writes,5);
  auto.dispose();
});
test('failed interval save retries on a new interval, never a tight loop',async()=>{
  let callback,scheduled=0,calls=0;const auto=createAutosave({save:async()=>{calls++;throw Error('disk full');},setTimer:(fn,ms)=>{assert.equal(ms,300000);callback=fn;scheduled++;return 1;},clearTimer:()=>{}});
  auto.schedule();callback();await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(scheduled,2);auto.dispose();
});

test('a failed background save retries after returning without requiring another edit',async()=>{
  let callback,timer=0,calls=0,fail=true;const jobs=new Set();
  const auto=createAutosave({save:async()=>{calls++;if(fail)throw Error('disk full');},setTimer:fn=>{callback=fn;jobs.add(++timer);return timer;},clearTimer:id=>jobs.delete(id)});
  auto.schedule();await assert.rejects(auto.pause(),/disk full/);assert.equal(jobs.size,0);
  fail=false;auto.resume();assert.equal(jobs.size,1);callback();await new Promise(r=>setImmediate(r));assert.equal(calls,2);auto.dispose();
});
test('an edit during a background write retains its own save deadline',async()=>{
  let finish,callback,calls=0;const auto=createAutosave({save:()=>{calls++;return calls===1?new Promise(r=>finish=r):undefined;},setTimer:fn=>{callback=fn;return 1;},clearTimer:()=>{}});
  auto.schedule();const saving=auto.flush();await Promise.resolve();auto.schedule();finish();await saving;
  callback();await new Promise(r=>setImmediate(r));assert.equal(calls,2);auto.dispose();
});

test('background computation finishing during a pause save remains dirty until the resumed save',async()=>{
  let value='before',finish,next=0;const jobs=new Map(),written=[];
  const auto=createAutosave({save:async()=>{const captured=value;if(written.length===0)await new Promise(resolve=>finish=resolve);written.push(captured);},setTimer:fn=>{jobs.set(++next,fn);return next;},clearTimer:id=>jobs.delete(id)});
  auto.schedule();const saving=auto.pause();await Promise.resolve();
  value='computed in background';auto.schedule();assert.equal(jobs.size,0,'Background edits must not start a timer');
  auto.resume();assert.equal(jobs.size,1);finish();await saving;
  assert.deepEqual(written,['before']);assert.equal(jobs.size,1,'Finishing the old save must not discard the new generation');
  const [id,run]=jobs.entries().next().value;jobs.delete(id);run();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(written,['before','computed in background']);assert.equal(jobs.size,0);auto.dispose();
});
test('background edits after a completed pause save wait until resume before scheduling',async()=>{
  let next=0,writes=0;const jobs=new Map();const auto=createAutosave({save:()=>writes++,setTimer:fn=>{jobs.set(++next,fn);return next;},clearTimer:id=>jobs.delete(id)});
  await auto.pause();auto.schedule();assert.equal(jobs.size,0);auto.resume();assert.equal(jobs.size,1);
  const [id,run]=jobs.entries().next().value;jobs.delete(id);run();await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,2);auto.dispose();
});
