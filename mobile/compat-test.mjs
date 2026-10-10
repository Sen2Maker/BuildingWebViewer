import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parse} from 'acorn';
import {JSDOM} from 'jsdom';
const mobile=path.dirname(fileURLToPath(import.meta.url)),web=path.join(mobile,'web');
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);out.push(...(e.isDirectory()?await walk(p):[p]));}return out;}
let count=0;
for(const p of await walk(web)){
 if(p.endsWith('.js')){parse(await readFile(p,'utf8'),{ecmaVersion:2017});count++;}
 if(p.endsWith('.html')){
  const html=await readFile(p,'utf8');
  assert.ok(html.indexOf('assets/js/compatibility.js')<html.indexOf('assets/js/capacitor.js'),p);
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc\s*=|application\/ld\+json/i.test(m[1]))continue;parse(m[2],{ecmaVersion:2017});count++;}
 }
}
parse(await readFile(path.join(mobile,'node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js'),'utf8'),{ecmaVersion:2017});
// The point kernel is serialized into a Worker: transpilation must not introduce outer helpers.
const cloudCode=await readFile(path.join(web,'assets/js/cloud.bundle.js'),'utf8');
let kernel;
function visit(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name==='computePointFeatures'){kernel=node;return;}for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}}
visit(parse(cloudCode,{ecmaVersion:2017}));assert.ok(kernel);
const computed=vm.runInNewContext(cloudCode.slice(kernel.start,kernel.end)+';computePointFeatures(new Float64Array([0,0,0,1,0,0,0,1,0,1,1,0]),{k:4,features:["normals"]})');
assert.equal(computed.valid,4);assert.ok(computed.fields.nz.every(v=>Math.abs(v-1)<1e-6));
const dom=new JSDOM(await readFile(path.join(web,'assets/mobile/index.html'),'utf8'),{url:'https://localhost/assets/mobile/index.html',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
w.eval(`delete Object.hasOwn;delete Object.fromEntries;delete Array.prototype.at;delete Array.prototype.flatMap;delete String.prototype.replaceAll;delete Promise.allSettled;delete Promise.prototype.finally;delete Element.prototype.replaceChildren;delete Element.prototype.toggleAttribute;delete Document.prototype.replaceChildren;delete DocumentFragment.prototype.replaceChildren;delete window.AbortController;delete window.ResizeObserver;delete window.globalThis;`);
w.eval(await readFile(path.join(web,'assets/js/compatibility.js'),'utf8'));
assert.equal(w.eval('Object.hasOwn({x:1},"x")'),true);
assert.equal(w.eval('[1,2].at(-1)'),2);
assert.equal(w.eval('"a/b/a".replaceAll("a","c")'),'c/b/c');
assert.equal(w.eval('[1,2].flatMap(x=>[x,x]).length'),4);
assert.equal(w.eval('Object.fromEntries([["x",2]]).x'),2);
const div=w.document.createElement('div');div.textContent='old';div.replaceChildren('a',w.document.createElement('span'));assert.equal(div.textContent,'a');assert.equal(div.children.length,1);assert.equal(div.toggleAttribute('hidden'),true);assert.equal(div.toggleAttribute('hidden',false),false);
const blob=new w.Blob(['hello']);assert.equal(await blob.text(),'hello');assert.equal((await blob.arrayBuffer()).byteLength,5);
assert.equal(typeof w.ResizeObserver,'function');const controller=new w.AbortController();controller.abort();assert.equal(controller.signal.aborted,true);
// Local projects must render even if the optional network call never completes.
w.Capacitor={isNativePlatform:()=>true,registerPlugin:()=>({showDiagnostics:async()=>{},listProjects:async()=>({projects:[{id:'saved',name:'Offline project',files:[],updatedAt:Date.now(),status:'ready'}]}),addListener:async()=>({remove:async()=>{}}),showReleaseNotes:async()=>{},apkUpdateStatus:async()=>({ready:false}),runtimeInfo:async()=>({current:'1.2.1',android:'7',webview:'60'}),updateHealthy:async()=>{},checkUpdate:()=>new Promise(()=>{})})};
w.eval(await readFile(path.join(web,'assets/js/mobile.bundle.js'),'utf8'));
await new Promise(r=>setTimeout(r,40));assert.match(w.document.getElementById('projects').textContent,/Offline project/);assert.match(w.document.getElementById('version-info').textContent,/60/);dom.window.close();
console.log(`PASS ${count} Android scripts parse as ES2017; missing-API fallbacks and offline project home verified.`);
