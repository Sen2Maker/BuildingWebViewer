import test from 'node:test';import assert from 'node:assert/strict';
import {setup,tick,unknown,notSent} from './runtime-harness.mjs';
for(const forwarded of [false,true])test(`provider-entered throw, forwarded=${forwarded}, rejects without replay`,async()=>{
 const r=setup();let attempts=0;r.w.androidBridge.postMessage=s=>{attempts++;if(forwarded)r.posted.push(JSON.parse(s));throw Error('provider throw');};
 await assert.rejects(r.api.createProject({name:'synthetic'}),unknown);assert.equal(attempts,1);assert.equal(r.callbacks.size,0);assert.equal(r.timers.size,0,'no generic operation deadline');await assert.rejects(r.api.createProject({name:'no replay'}),notSent);assert.equal(attempts,1);assert.match(r.w.document.querySelector('dialog').textContent,/Do not submit again/);assert.equal(r.w.document.querySelector('#mutate').disabled,true);assert.match(r.logs[0],/native diagnostics/);r.close();
});
test('known pre-provider serialization failure rejects without faulting unrelated work',async()=>{
 const r=setup();const waiting=r.api.listProjects();await tick();assert.equal(r.callbacks.size,1);const value={};value.self=value;await assert.rejects(r.w.Capacitor.nativePromise('BWVProjects','createProject',value));assert.equal(r.posted.length,1);assert.equal(r.callbacks.size,1);assert.equal(r.logs.length,0);r.reply(r.posted[0]);await waiting;assert.equal(r.callbacks.size,0);r.close();
});
test('actual runtime serialization catch is notSent before callback allocation',async()=>{
 const r=setup();const cycle={};cycle.self=cycle;assert.throws(()=>r.w.Capacitor.toNative('BWVProjects','createProject',cycle,{callback(){}}),notSent);assert.equal(r.posted.length,0);assert.equal(r.callbacks.size,0);r.close();
});
test('success then later provider fault retires every pending promise and suppresses old replies',async()=>{
 const r=setup();const first=r.api.listProjects();await tick();r.reply(r.posted[0]);await first;const pending=Array.from({length:100},()=>r.api.createProject({name:'synthetic'}));const rejections=pending.map(p=>assert.rejects(p,unknown));await tick();assert.equal(r.callbacks.size,100);let attempts=0;r.w.androidBridge.postMessage=()=>{attempts++;throw Error('lost');};await assert.rejects(r.api.listProjects(),unknown);await Promise.all(rejections);assert.equal(attempts,1);assert.equal(r.callbacks.size,0);for(const call of r.posted)r.reply(call);assert.equal(r.callbacks.size,0);assert.equal(r.w.document.querySelectorAll('dialog').length,1);r.close();
});
test('successful synchronous callback ID and exact listener removal retain their contract',async()=>{
 const r=setup();let events=0;const id=r.w.Capacitor.toNative('BWVProjects','addListener',{eventName:'projectsChanged'}, {callback:()=>events++});assert.equal(typeof id,'string');r.reply(r.posted[0],{},true);assert.equal(events,1);const listener=await r.api.addListener('projectsChanged',()=>events++);const add=r.posted[1];await listener.remove();await tick();assert.equal(r.posted[2].options.callbackId,add.callbackId);assert.equal(r.callbacks.size,1,'only unrelated original listener remains');r.reply(add,{},true);assert.equal(events,1,'locally removed listener does not receive late event');r.w.Capacitor.toNative('BWVProjects','removeListener',{eventName:'projectsChanged',callbackId:id},{callback(){}});assert.equal(r.callbacks.size,0);r.close();
});
test('failed listener add rejects core outer Promise rather than returning a false handle',async()=>{
 const r=setup();r.w.androidBridge.postMessage=()=>{throw Error('failed add');};await assert.rejects(r.api.addListener('projectsChanged',()=>{}),unknown);assert.equal(r.callbacks.size,0);r.close();
});
test('failed listener remove rejects and drains both event and removal callbacks',async()=>{
 const r=setup();let events=0;const listener=await r.api.addListener('projectsChanged',()=>events++);assert.equal(r.callbacks.size,1);r.w.androidBridge.postMessage=()=>{throw Error('failed remove');};await assert.rejects(listener.remove(),unknown);assert.equal(r.callbacks.size,0);r.reply(r.posted[0],{},true);assert.equal(events,0);r.close();
});
test('terminal response before provider trailing throw wins exactly once',async()=>{
 const r=setup();let attempts=0;r.w.androidBridge.postMessage=s=>{attempts++;r.reply(JSON.parse(s),{committed:true});throw Error('after delivered response');};const result=await r.api.createProject({name:'synthetic'});assert.equal(result.committed,true);assert.equal(attempts,1);assert.equal(r.callbacks.size,0);await assert.rejects(r.api.listProjects(),notSent);r.close();
});
test('throwing callback consumer cannot prevent pending promise retirement',async()=>{
 const r=setup();r.w.Capacitor.toNative('BWVProjects','runtimeSnapshot',{}, {callback(){throw Error('consumer');}});const pending=r.api.listProjects();const reject=assert.rejects(pending,unknown);await tick();r.w.androidBridge.postMessage=()=>{throw Error('provider');};await assert.rejects(r.api.createProject({}),unknown);await reject;assert.equal(r.callbacks.size,0);r.close();
});
test('fresh document is independent and receives no automatic old request replay',async()=>{
 const old=setup();old.w.androidBridge.postMessage=()=>{throw Error('old');};await assert.rejects(old.api.createProject({name:'old'}),unknown);const fresh=setup();const p=fresh.api.listProjects();await tick();assert.equal(fresh.posted.length,1);assert.equal(fresh.posted[0].methodName,'listProjects');fresh.reply(fresh.posted[0]);await p;assert.equal(fresh.callbacks.size,0);old.close();fresh.close();
});

test('listener metadata is read from serialized snapshot, not re-read from provider-mutated options',()=>{
 const r=setup();const options={eventName:'projectsChanged',toJSON(){return {eventName:'projectsChanged'};}};Object.defineProperty(options,'eventName',{get(){throw Error('must not reread input');}});const id=r.w.Capacitor.toNative('BWVProjects','addListener',options,{callback(){}});assert.equal(typeof id,'string');assert.equal(r.callbacks.size,1);assert.equal(r.posted[0].options.eventName,'projectsChanged');r.w.Capacitor.toNative('BWVProjects','removeListener',{callbackId:id,eventName:'projectsChanged'},{callback(){}});assert.equal(r.callbacks.size,0);r.close();
});
for (const phase of ['toJSON','callback getter','logging']) test(`pre-provider ${phase} reentrancy cannot send after nested transport failure`,()=>{
 const r=setup();let attempts=0,nested,entered=false;
 r.w.androidBridge.postMessage=()=>{attempts++;throw Error('nested provider failed');};
 const failOnce=()=>{if(entered)return;entered=true;try{r.w.Capacitor.toNative('BWVProjects','createProject',{}, {callback(){}});}catch(error){nested=error;}};
 const options=phase==='toJSON'?{toJSON(){failOnce();return {name:'outer'};}}:{};
 const stored=phase==='callback getter'?{get callback(){failOnce();return ()=>{};}}:{callback(){}};
 if(phase==='logging'){r.w.Capacitor.isLoggingEnabled=true;r.w.Capacitor.logToNative=failOnce;}
 assert.throws(()=>r.w.Capacitor.toNative('BWVProjects','createProject',options,stored),notSent);
 assert.ok(unknown(nested));assert.equal(attempts,1,'outer provider must not be entered after reentrant failure');assert.equal(r.callbacks.size,0,'outer must not resurrect callback ownership');assert.equal(r.timers.size,0);r.close();
});
for(const success of [true,false])test(`terminal callback success=${success} retires before throwing consumer and trailing provider throw`,()=>{
 const r=setup();let deliveries=0,observed;
 r.w.androidBridge.postMessage=serialized=>{const call=JSON.parse(serialized);r.w.androidBridge.onmessage({data:JSON.stringify({...call,save:false,success,data:{terminal:true},error:success?undefined:{code:'EXPECTED_FAILURE',message:'synthetic failure'}})});throw Error('provider trailing throw');};
 const id=r.w.Capacitor.toNative('BWVProjects','runtimeSnapshot',{}, {callback(value,error){deliveries++;observed={value,error};assert.equal(r.callbacks.size,0,'terminal callback retired before consumer');throw Error('consumer throws after terminal receipt');}});
 assert.equal(typeof id,'string');assert.equal(deliveries,1,'terminal consumer must not be invoked a second time by transport failure');assert.equal(r.callbacks.size,0);if(success)assert.equal(observed.value.terminal,true);else assert.equal(observed.error.code,'EXPECTED_FAILURE');assert.throws(()=>r.w.Capacitor.toNative('BWVProjects','runtimeSnapshot',{}, {callback(){}}),notSent);r.close();
});
test('terminal callback reentrant duplicate response cannot redeliver the same owner',()=>{
 const r=setup();let deliveries=0,call;
 r.w.androidBridge.postMessage=serialized=>{call=JSON.parse(serialized);r.reply(call);};
 r.w.Capacitor.toNative('BWVProjects','runtimeSnapshot',{}, {callback(){deliveries++;if(deliveries===1)r.reply(call);}});
 assert.equal(deliveries,1);assert.equal(r.callbacks.size,0);r.reply(call);assert.equal(deliveries,1);r.close();
});
test('keepAlive callback still receives successive events despite throwing, terminal event retires it',()=>{
 const r=setup();let deliveries=0;r.w.Capacitor.toNative('BWVProjects','addListener',{eventName:'projectsChanged'}, {callback(){deliveries++;throw Error('consumer event failure');}});const call=r.posted[0];
 r.reply(call,{},true);assert.equal(deliveries,1);assert.equal(r.callbacks.size,1);r.reply(call,{},true);assert.equal(deliveries,2);assert.equal(r.callbacks.size,1);r.reply(call,{},false);assert.equal(deliveries,3);assert.equal(r.callbacks.size,0);r.reply(call,{},false);assert.equal(deliveries,3);r.close();
});
test('one-shot resolve callback is retired before throwing even if native marks save=true',()=>{
 const r=setup();let deliveries=0;r.w.androidBridge.postMessage=serialized=>{r.reply(JSON.parse(serialized),{},true);throw Error('provider trailing throw');};
 const id=r.w.Capacitor.toNative('BWVProjects','runtimeSnapshot',{}, {resolve(){deliveries++;assert.equal(r.callbacks.size,0);throw Error('custom consumer failed');},reject(){deliveries++;}});
 assert.equal(typeof id,'string');assert.equal(deliveries,1);assert.equal(r.callbacks.size,0);r.close();
});
test('actual core plus authorized shell rejects outer promise after second-serialization reentry',async()=>{
 const r=setup();let serialize=0,attempts=0,nested;
 r.w.androidBridge.postMessage=()=>{attempts++;throw Error('nested provider fault');};
 const options={name:'outer',toJSON(){serialize++;if(serialize===2){try{r.w.Capacitor.toNative('BWVProjects','runtimeSnapshot',{}, {callback(){}});}catch(error){nested=error;}}return {name:this.name,bwvDocumentToken:this.bwvDocumentToken};}};
 await assert.rejects(r.api.createProject(options),notSent);assert.equal(serialize,2);assert.ok(unknown(nested));assert.equal(attempts,1);assert.equal(r.posted.length,0);assert.equal(r.callbacks.size,0);r.close();
});
