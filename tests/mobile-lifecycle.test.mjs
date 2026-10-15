import test from 'node:test';
import assert from 'node:assert/strict';
import {mountMobileLifecycle} from '../src/shared/mobile-lifecycle.js';
const surface=()=>Object.assign(new EventTarget(),{hidden:false});
test('native and visibility transitions pause and resume once regardless of delivery order',async()=>{
  for(const nativeFirst of [false,true]){
    const root=surface(),host=surface(),calls=[];
    const dispose=mountMobileLifecycle({root,host,autosave:{pause:async()=>calls.push('save'),resume:()=>calls.push('resume-save')},onBackground:()=>calls.push('background'),onForeground:()=>calls.push('foreground')});
    const hide=()=>{root.hidden=true;root.dispatchEvent(new Event('visibilitychange'));};
    if(nativeFirst){host.dispatchEvent(new Event('bwvPause'));hide();}else{hide();host.dispatchEvent(new Event('bwvPause'));}
    assert.deepEqual(calls,['save','background']);
    host.dispatchEvent(new Event('bwvResume'));assert.deepEqual(calls,['save','background']);
    root.hidden=false;root.dispatchEvent(new Event('visibilitychange'));
    assert.deepEqual(calls,['save','background','resume-save','foreground']);
    host.dispatchEvent(new Event('bwvResume'));root.dispatchEvent(new Event('visibilitychange'));assert.equal(calls.length,4);
    dispose();host.dispatchEvent(new Event('bwvPause'));assert.equal(calls.length,4);
  }
});
test('initially hidden sessions pause and memory pressure remains independent',()=>{
  const root=surface(),host=surface(),calls=[];root.hidden=true;
  const dispose=mountMobileLifecycle({root,host,autosave:{pause:async()=>calls.push('save'),resume:()=>calls.push('resume')},onBackground:()=>calls.push('background')});
  assert.deepEqual(calls,['save','background']);host.dispatchEvent(new Event('bwvMemoryPressure'));assert.deepEqual(calls,['save','background','background']);dispose();
});
