import test from 'node:test';
import assert from 'node:assert/strict';
import {batchProgressState,createBatchProgress} from '../src/shared/batch-progress.js';
import {setLanguage} from '../src/shared/i18n.js';
test('whole-batch progress counts items and explicitly distinguishes failures and preparation',()=>{
 setLanguage('zh');const s=batchProgressState(12,100);assert.equal(s.fraction,.12);assert.match(s.text,/12 \/ 100/);assert.match(s.text,/12%/);
 const failed=batchProgressState(8,10,{failed:2});assert.equal(failed.fraction,.8);assert.match(failed.text,/2 项失败/);
 const ready=batchProgressState(10,10,{preparing:true});assert.equal(ready.fraction,1);assert.match(ready.text,/准备画面/);
 assert.equal(batchProgressState(0,0).fraction,0);assert.equal(batchProgressState(100,10).done,10);
 setLanguage('en');assert.equal(batchProgressState(3,10,{unit:'个模型'}).text,'Processed 3 / 10 models · 30%');setLanguage('zh');
});
test('DOM progress remains monotonic, reuses its bar and ignores superseded loads',()=>{
 const classes=new Set();let current=true;
 const doc={createElement(tag){return node(tag);}};
 function node(tag){return {tag,className:'',children:[],ownerDocument:doc,style:{setProperty(k,v){this[k]=v;}},setAttribute(k,v){this[k]=v;},append(...nodes){this.children.push(...nodes);},querySelector(selector){for(const child of this.children){if(selector.startsWith('.')?child.className===selector.slice(1):child.tag===selector)return child;const nested=child.querySelector(selector);if(nested)return nested;}return null;}};}
 const box=node('section'),span=node('span');box.classList={add:k=>classes.add(k)};box.append(span);
 const bars=[];const append=box.append.bind(box);box.append=(...nodes)=>{for(const n of nodes)if(n.tag==='progress')bars.push(n);append(...nodes);};
 const batch=createBatchProgress(box,{total:10,current:()=>current});assert.equal(bars.length,1);assert.equal(bars[0].value,0);
 batch.report(4);assert.equal(bars[0].value,.4);batch.report(2);assert.equal(bars[0].value,.4);
 current=false;batch.report(9);assert.equal(bars[0].value,.4);
 current=true;batch.report(7,1);batch.prepare();assert.equal(bars[0].value,1);assert.match(span.textContent,/1 项失败/);assert.match(span.textContent,/准备画面/);
 createBatchProgress(box,{total:3});assert.equal(bars.length,1);assert.equal(bars[0].value,0);assert(classes.has('has-progress'));assert(classes.has('batch-loading'));
 const visual=box.querySelector('.batch-progress-visual');assert.equal(visual['aria-hidden'],'true');assert.equal(visual.style['--batch-progress'],'0%');assert.equal(visual.querySelector('.batch-progress-percent-text').textContent,'0%');
 batch.report(10);assert.equal(visual.querySelector('.batch-progress-percent-text').textContent,'100%');assert.equal(visual.style['--batch-progress'],'100%');
});
