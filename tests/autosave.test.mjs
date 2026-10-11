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
  auto.resume();await step(300000);assert.equal(writes,3);auto.schedule();await step(300000);assert.equal(writes,4);
  auto.dispose();
});
test('failed interval save retries on a new interval, never a tight loop',async()=>{
  let callback,scheduled=0,calls=0;const auto=createAutosave({save:async()=>{calls++;throw Error('disk full');},setTimer:(fn,ms)=>{assert.equal(ms,300000);callback=fn;scheduled++;return 1;},clearTimer:()=>{}});
  auto.schedule();callback();await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(scheduled,2);auto.dispose();
});
