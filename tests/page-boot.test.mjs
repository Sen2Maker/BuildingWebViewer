import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const boot = fs.readFileSync(new URL('../src/shared/page-boot.js',import.meta.url),'utf8');
function start(query, stored, blocked=false) {
  const classes = new Set(), timers = new Map(); let removed=false;
  const root = {classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x))}};
  const context = {document:{documentElement:root,getElementById:()=>({remove(){removed=true;}})},location:{search:query},URLSearchParams,
    localStorage:{getItem(){if(blocked)throw Error('blocked');return stored;}},setTimeout(fn){timers.set(1,fn);return 1;},clearTimeout(id){timers.delete(id);},
    window:{addEventListener(type,fn){this.onError=fn;}}};
  vm.runInNewContext(boot,context);
  return {classes,root,timers,window:context.window,removed:()=>removed};
}
let state=start('?lang=en','zh');assert.equal(state.root.lang,'en');assert(state.classes.has('boot-pending'));
state.timers.get(1)();assert(state.classes.has('boot-slow'));
state.window.BuildingViewerBoot.ready();assert.equal(state.classes.size,0);assert(state.removed());assert.equal(state.timers.size,0);
state=start('','en');assert.equal(state.root.lang,'en');
state.window.onError({target:{tagName:'SCRIPT'}});assert(state.classes.has('boot-failed'));assert(state.classes.has('boot-pending'));
state.window.BuildingViewerBoot.ready();assert.equal(state.classes.size,0);
assert.equal(start('?lang=en',null,true).root.lang,'en');assert.equal(start('',null,true).root.lang,'zh-CN');
console.log('PASS locale chosen synchronously; delayed/failed scripts keep shell hidden; successful translation reveals it; blocked storage works');
for(const page of ['index','lod','wireframe','pointcloud']) {
 const html=fs.readFileSync(new URL(`../${page}.html`,import.meta.url),'utf8');
 assert(html.indexOf(boot)<html.indexOf('<body'));
 assert(html.indexOf('html.boot-pending body>:not(#page-boot)')<html.indexOf('rel="stylesheet"'));
 assert.equal((html.match(/id="page-boot"/g)||[]).length,1);
}
