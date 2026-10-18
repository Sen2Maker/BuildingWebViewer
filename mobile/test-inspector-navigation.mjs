import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from './node_modules/jsdom/lib/api.js';
import { prepareInspectorNavigation } from '../src/shared/inspector-navigation.js';
for(const page of ['lod','wireframe','pointcloud','gaussian','generate'])test(`${page} shares navigation without losing tool-specific settings`,()=>{
 const doc=new JSDOM(readFileSync(new URL(`../${page}.html`,import.meta.url),'utf8')).window.document;
 let actionCalls=0;const action=doc.createElement('button');action.textContent='Diagnostics';action.onclick=()=>actionCalls++;doc.querySelector('.inspector-shortcuts').append(action);
 const originalInputs=[...doc.querySelectorAll('input,select,textarea')];prepareInspectorNavigation(doc);prepareInspectorNavigation(doc);
 const keys=[...doc.querySelectorAll('.inspector-tabs [data-settings-tab]')].map(n=>n.dataset.settingsTab);assert.deepEqual(keys.slice(0,4),[page==='generate'?'tools':'data','display','camera','bookmarks']);
 assert.equal(new Set(keys).size,keys.length);assert(originalInputs.every(n=>doc.contains(n)));
 assert(doc.querySelector('.viewer-extra-menu').contains(action));action.click();assert.equal(actionCalls,1);
 const shortcuts=doc.querySelectorAll('.inspector-shortcuts>[data-open-settings]');assert.equal(shortcuts.length,4);
 if(page==='wireframe'||page==='lod')assert(doc.querySelector('[data-settings-panel="data"]').querySelector('select'));
 for(const button of doc.querySelectorAll('.viewer-extra-menu button')){button.closest('details').open=true;button.click();assert.equal(button.closest('details').open,false);}
});
