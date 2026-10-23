import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/shared/vite-startup.js',import.meta.url),'utf8');
function fixture({native=false,dev=false,current='1111111111111111',next='1111111111111111',offline=false,query=''}={}){
 const events=[],window={BuildingViewerBoot:{fail(){events.push('fail');}},Capacitor:{isNativePlatform:()=>native}};
 const location={protocol:'https:',href:'https://localhost/cad-editor.html'+query,replace(url){events.push(['replace',url]);}};
 const api=vm.runInNewContext(source.replace('export async function','async function').replace('import.meta.env.DEV',String(dev))+';startViewer',{
  window,location,document:{querySelector:()=>current?{content:current}:null},URL,AbortController,
  fetch:async()=>{events.push('fetch');if(offline)throw Error('offline');return{ok:true,json:async()=>({build:next})};},
  setTimeout:()=>1,clearTimeout(){},console:{error(error){events.push(['error',error.message]);}}
 });
 return{events,start:()=>api(async()=>events.push('load')),api};
}
test('Vite startup serves local content on matching manifest, offline, native and development',async()=>{
 for(const options of [{},{offline:true},{native:true},{dev:true}]){const f=fixture(options);await f.start();assert.ok(f.events.includes('load'));if(options.native||options.dev)assert.ok(!f.events.includes('fetch'));}
});
test('Vite startup mismatched build refreshes once and never loads stale application',async()=>{
 const f=fixture({next:'2222222222222222'});await f.start();assert.ok(!f.events.includes('load'));assert.equal(f.events.filter(e=>Array.isArray(e)&&e[0]==='replace').length,1);assert.ok(f.events.includes('fail'));
 const guarded=fixture({next:'2222222222222222',query:'?_bwvRefresh=2222222222222222'});await guarded.start();assert.deepEqual(guarded.events,['fetch','fail']);
});
test('Vite startup rejects invalid remote build values and reports app import failure',async()=>{
 const f=fixture({next:'not-a-build'});await f.start();assert.ok(f.events.includes('load'));
 const failed=fixture({native:true});await assert.rejects(failed.api(async()=>{throw Error('chunk failed')}),/chunk failed/);assert.ok(failed.events.includes('fail'));
});
