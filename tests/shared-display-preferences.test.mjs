import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePresentation,PRESENTATION_STORAGE_KEY} from '../src/shared/render-style.js';
import {currentPalettePreferences,rememberPalettePreferences,normalizePaletteOptions,PALETTE_STORAGE_KEY} from '../src/shared/palettes.js';
import {mountPaletteControls} from '../src/shared/palette-controls.js';
import {mountPresentationControls} from '../src/shared/presentation-controls.js';

function storage() { const values=new Map();return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}; }
test('portable display styles survive page reload, reject corrupt values, and never silently sample data',async()=>{
 const previous=globalThis.localStorage, store=storage();globalThis.localStorage=store;
 try {
  const first=await import('../src/shared/render-style.js?preference-session=1');
  first.rememberPresentation({axes:false,surfaceStyle:'gloss',pointStyle:'sphere',pointRatio:15,lineStyle:'cylinder',lineWidth:4});
  assert.equal(first.currentPresentation().pointRatio,15);
  const saved=JSON.parse(store.getItem(PRESENTATION_STORAGE_KEY));assert(!('pointRatio'in saved));assert(!('lineStyle'in saved));assert.equal(saved.surfaceStyle,'gloss');
  const second=await import('../src/shared/render-style.js?preference-session=2');assert.equal(second.currentPresentation().axes,false);assert.equal(second.currentPresentation().pointStyle,'sphere');assert.equal(second.currentPresentation().pointRatio,100);assert.equal(second.currentPresentation().lineStyle,'native');
  const copy=second.currentPresentation();copy.axes=true;assert.equal(second.currentPresentation().axes,false);
  store.setItem(PRESENTATION_STORAGE_KEY,JSON.stringify({axes:'no',pointRatio:10,lineStyle:'cylinder',pointStyle:'bad',surfaceStyle:'unlit',lineWidth:-2}));
  const third=await import('../src/shared/render-style.js?preference-session=3');assert.equal(third.currentPresentation().axes,true);assert.equal(third.currentPresentation().surfaceStyle,'unlit');assert.equal(third.currentPresentation().pointRatio,100);
  assert.deepEqual(normalizePresentation({lineWidth:Infinity,lineEndColor:'not a color',legend:0,unknown:true}),{});
  store.setItem(PRESENTATION_STORAGE_KEY,'{broken');assert.equal((await import('../src/shared/render-style.js?preference-session=4')).currentPresentation().axes,true);
 } finally { if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous; }
});
test('palette choice travels between tools without carrying dataset numeric ranges',()=>{
 const previous=globalThis.localStorage,store=storage();globalThis.localStorage=store;
 try {
  rememberPalettePreferences({palette:'viridis',reverse:true,range:{min:12,max:14}});
  assert.deepEqual(currentPalettePreferences(),{palette:'viridis',reverse:true,range:null});assert.deepEqual(JSON.parse(store.getItem(PALETTE_STORAGE_KEY)),{palette:'viridis',reverse:true});
  const source={palette:'inferno',range:{min:0,max:5}},copy=normalizePaletteOptions(source);copy.range.min=3;assert.equal(source.range.min,0);
  store.setItem(PALETTE_STORAGE_KEY,JSON.stringify({palette:'unknown'}));assert.equal(currentPalettePreferences().palette,'current');
  store.setItem(PALETTE_STORAGE_KEY,JSON.stringify({palette:'viridis',reverse:'false'}));assert.equal(currentPalettePreferences().reverse,false);assert.throws(()=>normalizePaletteOptions({palette:'viridis',reverse:'false'}));
  store.setItem(PALETTE_STORAGE_KEY,'{broken');assert.equal(currentPalettePreferences().palette,'current');
  globalThis.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('quota');}};
  assert.doesNotThrow(()=>rememberPalettePreferences({palette:'inferno'}));assert.equal(currentPalettePreferences().palette,'current');
 }finally {if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
function paletteFixture(options={},onChange=()=>{}) {
 const nodes=new Map();const selectors=['select','.palette-reverse','.palette-auto','.palette-min','.palette-max','.palette-error','.palette-preview','.palette-caption'];
 for(const key of selectors){const events=new Map();const node={value:'',checked:key==='.palette-auto',hidden:false,style:{},dataset:{},disabled:false,textContent:'',addEventListener(kind,fn){events.set(kind,fn);},fire(kind='change'){events.get(kind)?.();}};
  Object.defineProperty(node,'valueAsNumber',{get:()=>node.value===''?NaN:Number(node.value)});nodes.set(key,node);
 }
 Object.defineProperty(nodes.get('select'),'selectedOptions',{get(){return [{textContent:{current:'Default',viridis:'Viridis',inferno:'Inferno',grayscale:'Gray','blue-white-red':'Blue white red'}[this.value]}];}});
 const details={querySelector:key=>nodes.get(key),remove(){},set innerHTML(value){assert.match(value,/palette-body/);}},container={ownerDocument:{createElement:()=>details},append(){}};
 const controls=mountPaletteControls({container,getOptions:()=>options,onChange});return {controls,nodes};
}
test('palette UI recovers unknown preferences and protects committed ranges from mutation',()=>{
 const f=paletteFixture({palette:'missing'});assert.equal(f.controls.getOptions().palette,'current');assert.doesNotThrow(()=>f.controls.setScalarEnabled(false));
 const g=paletteFixture({palette:'viridis',range:{min:1,max:10}});const copy=g.controls.getOptions();copy.range.min=-999;assert.equal(g.controls.getOptions().range.min,1);
});
test('failed palette changes restore renderer, form and preferences as one transaction',()=>{
 const previous=globalThis.localStorage,store=storage();globalThis.localStorage=store;
 try {
  let fixture,calls=[];fixture=paletteFixture({palette:'current'},options=>{assert.deepEqual(fixture.controls.getOptions(),options);calls.push(options.palette);if(options.palette==='inferno')throw Error('GPU failure');});
  fixture.nodes.get('select').value='inferno';assert.doesNotThrow(()=>fixture.nodes.get('select').fire());
  assert.deepEqual(calls,['inferno','current']);assert.equal(fixture.controls.getOptions().palette,'current');assert.equal(fixture.nodes.get('select').value,'current');assert.equal(fixture.nodes.get('.palette-error').textContent,'GPU failure');assert.equal(fixture.nodes.get('.palette-error').hidden,false);assert.equal(store.getItem(PALETTE_STORAGE_KEY),null);
  fixture.nodes.get('select').value='viridis';fixture.nodes.get('select').fire();assert.equal(fixture.nodes.get('.palette-error').hidden,true);assert.equal(currentPalettePreferences().palette,'viridis');
  // Native project restore dispatches change on disabled scalar controls; it must still restore the stored contract.
  fixture.controls.setScalarEnabled(false);fixture.nodes.get('select').value='grayscale';fixture.nodes.get('select').fire();assert.equal(fixture.controls.getOptions().palette,'grayscale');assert.equal(fixture.nodes.get('select').disabled,true);
 }finally {if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
test('invalid range edits leave the last committed palette active',()=>{
 const f=paletteFixture();f.nodes.get('.palette-auto').checked=false;f.nodes.get('.palette-min').value='2';f.nodes.get('.palette-max').value='1';f.nodes.get('.palette-min').fire('input');
 assert.equal(f.controls.getOptions().range,null);assert.equal(f.nodes.get('.palette-error').hidden,false);
 f.nodes.get('.palette-max').value='5';f.nodes.get('.palette-max').fire('input');assert.deepEqual(f.controls.getOptions().range,{min:2,max:5});
});

test('multi-view display failure restores each original option and avoids duplicate inspector sections',()=>{
 const fields=[],sections=[];
 function node(tag){const n={tagName:tag.toUpperCase(),dataset:{},children:[],value:'',checked:false,setAttribute(name,value){this[name]=value;},append(...children){this.children.push(...children);},addEventListener(){},before(){},checkValidity:()=>true};if(tag==='input'||tag==='select')fields.push(n);return n;}
 const doc={createElement:node};const container={ownerDocument:doc,querySelector:()=>sections.find(n=>n.className?.includes('presentation-controls')),append(n){sections.push(n);}};
 const root={body:{dataset:{tool:'gaussian'}},querySelector:()=>container};
 const viewers=[{options:{axes:false},setOptions(o){Object.assign(this.options,o);}},{options:{axes:true},setOptions(o){Object.assign(this.options,o);if(o.axes===false)throw Error('second view failed');}}];
 mountPresentationControls({root,getViewers:()=>viewers});mountPresentationControls({root,getViewers:()=>viewers});assert.equal(sections.length,1);
 const axes=fields.find(n=>n['aria-label']==='XYZ 朝向');axes.checked=false;axes.onchange();assert.equal(viewers[0].options.axes,false);assert.equal(viewers[1].options.axes,true);assert.equal(axes.checked,true);
});
