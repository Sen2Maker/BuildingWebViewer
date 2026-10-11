import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from './node_modules/jsdom/lib/api.js';
// Exercise shipped UI wiring without relying on GPU availability in CI.
for(const mobile of [false,true])await test(`all-splat quality UI and locale, mobile=${mobile}`,async()=>{
 const html=fs.readFileSync(new URL('../gaussian.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://example.test/gaussian.html?lang=en',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;
 w.matchMedia=q=>({matches:mobile&&q==='(pointer: coarse)',addEventListener(){},removeEventListener(){}});
 w.ResizeObserver=class{observe(){} disconnect(){}};w.IntersectionObserver=class{observe(){}disconnect(){}};
 // Boot may report absent WebGL, but settings must still be accessible and populated.
 w.HTMLCanvasElement.prototype.getContext=()=>null;
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.eval(fs.readFileSync(new URL('../assets/js/gaussian.bundle.js',import.meta.url),'utf8'));
 await new Promise(r=>setTimeout(r,50));
 const d=w.document;
 assert.equal(d.getElementById('gs-cap'),null);
 assert.equal(d.getElementById('gs-profile').options.length,4);
 assert.equal(d.getElementById('gs-resolution').value,mobile?'1':'2');
 assert.equal(d.getElementById('gs-interaction-quality').checked,mobile);
 assert.equal(d.getElementById('gs-motion-sh').value,mobile?'1':'3');
 assert.match(d.getElementById('gs-profile').textContent,/all splats/);
 dom.window.close();
});
