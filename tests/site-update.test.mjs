import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/shared/site-update.js',import.meta.url),'utf8');
function boot({next={version:'1.1.1',build:'aaaaaaaaaaaaaaaa'},fail=false,protocol='https:',native=false,query='?lang=en'}={}){
 const events={},loaded=[],replaced=[],requests=[];let failed=false;
 const location={protocol,href:`${protocol}//example.test/BuildingWebViewer/lod.html${query}#ids=1,2`,replace(url){replaced.push(url);}};
 const document={readyState:'complete',querySelector:()=>({content:'aaaaaaaaaaaaaaaa'}),querySelectorAll:()=>[{getAttribute:()=> 'assets/js/lod.bundle.js?v=123'}],createElement:()=>({}),body:{append(n){loaded.push(n);}},addEventListener(k,v){events[k]=v;}};
 vm.runInNewContext(source,{document,location,window:{Capacitor:{isNativePlatform:()=>native},BuildingViewerBoot:{fail(){failed=true;}}},URL,Set,Date,AbortController,setTimeout:()=>1,clearTimeout(){},fetch:async(url,opts)=>{requests.push({url,opts});if(fail)throw Error('offline');return{ok:true,json:async()=>next};}});
 return {events,loaded,replaced,requests,failed:()=>failed};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('ordinary refresh with stale HTML redirects before any viewer script runs',async()=>{const h=boot({next:{version:'1.1.2',build:'bbbbbbbbbbbbbbbb'}});await settle();assert.equal(h.loaded.length,0);assert.equal(h.replaced.length,1);const u=new URL(h.replaced[0]);assert.equal(u.searchParams.get('lang'),'en');assert.equal(u.hash,'#ids=1,2');assert.equal(u.searchParams.get('_bwvRefresh'),'bbbbbbbbbbbbbbbb');assert.ok(u.searchParams.get('_fresh'));assert.equal(h.requests[0].opts.cache,'no-store');});
test('up-to-date HTML starts the viewer after the check, without extra UI',async()=>{const h=boot();assert.equal(h.loaded.length,0);await settle();assert.equal(h.loaded.length,1);assert.match(h.loaded[0].src,/lod.bundle/);assert.equal(h.replaced.length,0);});
test('deployment mismatch cannot cause redirect loops or run stale bundles',async()=>{const h=boot({next:{version:'1.1.2',build:'bbbbbbbbbbbbbbbb'},query:'?_bwvRefresh=bbbbbbbbbbbbbbbb'});await settle();assert.equal(h.replaced.length,0);assert.equal(h.loaded.length,0);assert.equal(h.failed(),true);});
test('offline or invalid manifest falls back to usable cached app',async()=>{for(const opts of[{fail:true},{next:{version:'oops',build:'https://bad.test'}}]){const h=boot(opts);await settle();assert.equal(h.loaded.length,1);assert.equal(h.replaced.length,0);}});
test('file mode and native app start without website checks',async()=>{for(const opts of[{protocol:'file:'},{native:true}]){const h=boot(opts);await settle();assert.equal(h.loaded.length,1);assert.equal(h.requests.length,0);}});
test('navigation versions only local tool links and preserves selection/language',async()=>{const h=boot();await settle();const a={href:'https://example.test/BuildingWebViewer/pointcloud.html?lang=en#ids=2',hasAttribute:()=>false,getAttribute:()=>''};h.events.click({target:{closest:()=>a}});const u=new URL(a.href);assert.equal(u.searchParams.get('build'),'aaaaaaaaaaaaaaaa');assert.equal(u.searchParams.get('lang'),'en');assert.equal(u.hash,'#ids=2');});
