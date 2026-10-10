import test from 'node:test';
import assert from 'node:assert/strict';
import {runMobileUpdate} from '../src/mobile/update-check.js';
const api=overrides=>({updateHealthy:async()=>{},checkUpdate:async()=>({kind:'none'}),...overrides});
test('a hanging or rejected network check never blocks the local app or prompts',async()=>{
 for(const checkUpdate of [()=>new Promise(()=>{}),()=>Promise.reject(Error('offline'))]){
  let prompted=false;const started=Date.now();
  assert.equal(await runMobileUpdate({api:api({checkUpdate}),timeout:15,ask:()=>{prompted=true;}}),'offline');
  assert.equal(prompted,false);assert.ok(Date.now()-started<500);
 }
});
test('late network response cannot install or prompt after timeout',async()=>{
 let finish,installs=0,prompts=0;
 const result=runMobileUpdate({api:api({checkUpdate:()=>new Promise(r=>finish=r),installWebUpdate:()=>installs++}),timeout:10,ask:()=>prompts++});
 assert.equal(await result,'offline');finish({kind:'patch'});await new Promise(r=>setTimeout(r,10));assert.equal(installs,0);assert.equal(prompts,0);
});
test('patch downloads are staged without activating or reloading the page',async()=>{
 let installs=0;assert.equal(await runMobileUpdate({api:api({checkUpdate:async()=>({kind:'patch'}),installWebUpdate:async()=>installs++,activateWebUpdate:()=>assert.fail('Must not reload')})}),'staged');assert.equal(installs,1);
});
test('feature releases require agreement and do not interrupt a departed home',async()=>{
 let installs=0;const app=api({checkUpdate:async()=>({kind:'feature'}),installWebUpdate:async()=>installs++});
 assert.equal(await runMobileUpdate({api:app,ask:()=>false}),'declined');
 await runMobileUpdate({api:app,isHome:()=>false,ask:()=>assert.fail('Not at home')});assert.equal(installs,0);
 assert.equal(await runMobileUpdate({api:app,ask:()=>true}),'staged');assert.equal(installs,1);
});
test('a previously checked session does no network work',async()=>assert.equal(await runMobileUpdate({api:api({checkUpdate:()=>assert.fail('Repeated check')}),once:()=>false}),'skipped'));

test('native updates require consent and stage an APK without declaring installation success',async()=>{
 let downloads=0;const app=api({checkUpdate:async()=>({kind:'apk',notes:{en:'Native fix'}}),downloadApkUpdate:async()=>downloads++});
 assert.equal(await runMobileUpdate({api:app,ask:()=>false}),'declined');assert.equal(downloads,0);
 assert.equal(await runMobileUpdate({api:app,ask:async()=>true}),'apk-ready');assert.equal(downloads,1);
});
test('unknown update kinds and failed downloads cannot become successful updates',async()=>{
 assert.equal(await runMobileUpdate({api:api({checkUpdate:async()=>({kind:'attacker'})})}),'offline');
 assert.equal(await runMobileUpdate({api:api({checkUpdate:async()=>({kind:'apk'}),downloadApkUpdate:async()=>{throw Error('Bad signature');}}),ask:()=>true}),'offline');
});

test('cancelled APK download remains cancelled, never installed',async()=>assert.equal(await runMobileUpdate({api:api({checkUpdate:async()=>({kind:'apk'}),downloadApkUpdate:async()=>{throw Error('Download cancelled');}}),ask:()=>true}),'cancelled'));
