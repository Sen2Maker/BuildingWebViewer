import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
const shell=await readFile(new URL('../src/mobile/app-shell.js',import.meta.url),'utf8');
function page(native=true){const dom=new JSDOM('<header class="app-header"><a class="back-home" href="index.html">Home</a></header><a id="web" href="https://sen2maker.github.io/BuildingWebViewer/">Online</a>',{url:'https://localhost/gaussian.html?project=example&lang=en',runScripts:'outside-only'});dom.window.Capacitor={isNativePlatform:()=>native};return dom;}
test('native toolbar cannot escape to the browser hub and calls the current save-aware handler once',()=>{
 const d=page(),w=d.window;let saves=0,oldClicks=0;w.bwvNavigateProjectHome=()=>saves++;w.document.querySelector('.back-home').onclick=()=>oldClicks++;
 w.eval(shell);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));const link=w.document.querySelector('.back-home');assert.equal(link.getAttribute('href'),'/assets/mobile/index.html?lang=en');assert.equal(link.textContent,'‹ Projects');assert(w.document.getElementById('web').hidden);
 link.click();assert.equal(saves,1);assert.equal(oldClicks,0);assert.equal(w.location.pathname,'/gaussian.html');assert(w.document.documentElement.classList.contains('native-app'));d.window.close();
});
test('browser workflow keeps its normal hub and website links',()=>{
 const d=page(false),w=d.window;w.eval(shell);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));assert.equal(w.document.querySelector('.back-home').getAttribute('href'),'index.html');assert.equal(w.document.getElementById('web').hidden,false);d.window.close();
});
