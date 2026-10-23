import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meshReferenceModels } from '../src/lod/mesh-data.js';
import { MeshPointLayer } from '../src/shared/mesh-point-layer.js';
import { ViewerProject } from '../src/shared/project-model.js';
import { appendLodFiles } from '../src/shared/project-import.js';
import { pointDisplayColors } from '../src/shared/point-display-colors.js';
import { createViewerComparison } from '../src/shared/viewer-comparison.js';
const file=path=>({name:path.split('/').at(-1),webkitRelativePath:path,size:24,lastModified:1});
test('Mesh pairs clouds by flat ID and folder, retains variants and point-only IDs',()=>{
 const entries=[],project=new ViewerProject(),files=['set/10.obj','set/10.ply','set/11/raw.obj','set/11/final.obj','set/11/cloud.txt','set/12.pcd'].map(file);
 assert.equal(appendLodFiles(entries,project,files).added,6);assert.equal(entries.length,3);
 assert.equal(entries[0].clouds[0],files[1]);assert.equal(entries[1].files.length,2);assert.equal(entries[1].clouds[0],files[4]);assert.equal(entries[2].files.length,0);assert.equal(entries[2].clouds[0],files[5]);
 assert.equal(appendLodFiles(entries,project,files).duplicates,6);
});
test('all comparison panes use union reference bounds, preserving large-coordinate overlay alignment',()=>{
 const bounds=[[1000000,2000000,30],[1000010,2000010,35]],tall=[[1000000,2000000,30],[1000010,2000010,40]],cloudBounds=[[999999,2000000,29],[1000011,2000010,42]];
 const result=meshReferenceModels([[{id:'10',bounds}],[{id:'10',bounds:tall},{id:'2',bounds}]], [{id:'10',cloud:{bounds:cloudBounds}},{id:'12',cloud:{bounds}}]);
 assert.deepEqual(result.map(m=>m.id),['2','10','12']);assert.deepEqual(result[1].bounds,cloudBounds);assert.deepEqual(bounds[0],[1000000,2000000,30]);
});
test('mesh point buffers share transform, reuse identity and hide without rebuilding',()=>{
 const values=new Map(),deleted=[];let serial=0,bound,draws=0;
 const gl=new Proxy({COMPILE_STATUS:1,LINK_STATUS:2,ALIASED_POINT_SIZE_RANGE:3,MAX_VERTEX_ATTRIBS:4,OUT_OF_MEMORY:1285,
 createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>++serial,bindBuffer:(_,v)=>{bound=v;},bufferData:(_,v)=>values.set(bound,Array.from(v)),deleteBuffer:b=>deleted.push(b),getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:(_,n)=>n==='position'?0:1,getParameter:k=>k===3?[1,64]:8,getError:()=>0,drawArrays:()=>draws++},{get:(o,k)=>o[k]??(()=>{})});
 const cloud={count:2,positions:new Float64Array([1000000,2000000,30,1000001,2000002,34]),rgb:new Float32Array([255,0,0,0,255,0]),fields:{intensity:new Float32Array([0,10])}},item={id:'10',cloud};
 const layer=new MeshPointLayer(gl),placement=new Map([['10',{origin:[1000000,2000000,30],scale:2,center:[-5,7,0]}]]);
 layer.setItems([item],placement);const entry=layer.entries[0];assert.deepEqual(values.get(entry.position),[-5,7,0,-3,11,8]);
 layer.setOptions({showPoints:true,pointColorMode:'rgb'});assert.deepEqual(values.get(entry.color),[1,0,0,0,1,0]);layer.draw(new Float32Array(16),1);assert.equal(draws,1);
 layer.setItems([item],placement);assert.equal(layer.entries[0],entry);layer.setOptions({showPoints:false,pointColorMode:'rgb'});layer.draw(new Float32Array(16),1);assert.equal(draws,1);
 layer.clear();assert(deleted.includes(entry.position));assert(deleted.includes(entry.color));assert.equal(layer.entries.length,0);
});
function trackedPointLayer() {
 const values=new Map(),uploads=[],deleted=[];let serial=0,bound;
 const gl=new Proxy({COMPILE_STATUS:1,LINK_STATUS:2,ALIASED_POINT_SIZE_RANGE:3,MAX_VERTEX_ATTRIBS:4,OUT_OF_MEMORY:1285,
  createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>++serial,bindBuffer:(_,value)=>{bound=value;},
  bufferData:(_,value)=>{values.set(bound,Array.from(value));uploads.push(bound);},deleteBuffer:value=>deleted.push(value),
  getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:(_,name)=>name==='position'?0:1,
  getParameter:key=>key===3?[1,64]:8,getError:()=>0},{get:(object,key)=>object[key]??(()=>{})});
 return {layer:new MeshPointLayer(gl),values,uploads,deleted};
}
const pointBlock=(heights)=>({count:heights.length,positions:new Float64Array(heights.flatMap(z=>[0,0,z])),fields:{}});
test('progressive tree blocks retain existing GPU buffers and a stable whole-cloud height palette',()=>{
 const {layer,values,uploads,deleted}=trackedPointLayer(),placement=new Map([['10',{origin:[0,0,100],scale:1,center:[0,0,0]}]]);
 const colorBounds=[[0,0,100],[10,10,200]],root={id:'10',cloud:pointBlock([120,140]),colorBounds};
 const child={id:'10',cloud:pointBlock([100,140,200]),colorBounds},options={pointColorMode:'height',palette:'viridis'};
 layer.setItems([root],placement);layer.setOptions(options);
 const rootEntry=layer.entries[0],rootColors=[...values.get(rootEntry.color)],before=uploads.length;
 assert.deepEqual(layer.colorRange,{min:100,max:200});
 assert.deepEqual(rootColors,Array.from(pointDisplayColors(root.cloud,2,{colorMode:'height',palette:'viridis',range:{min:100,max:200}}).values));
 layer.setItems([{...root},child],placement);layer.setOptions(options);
 const childEntry=layer.entries[1];
 assert.equal(layer.entries[0],rootEntry);assert.deepEqual(values.get(rootEntry.color),rootColors);
 assert.deepEqual(uploads.slice(before),[childEntry.position,childEntry.color,childEntry.color]);
 assert.deepEqual(values.get(childEntry.color).slice(3,6),rootColors.slice(3,6),'equal source heights use equal colors across blocks');
 assert.equal(deleted.length,0);
 const after=uploads.length;layer.setItems([root,child],placement);layer.setOptions({...options,showPoints:false,pointSize:5,pointOpacity:.5});
 assert.equal(uploads.length,after,'visibility and point styling do not reupload positions or colors');
 layer.dispose();
});
test('cached block colors update for palette, reversal and explicit range changes, without position uploads',()=>{
 const {layer,values,uploads}=trackedPointLayer(),placement=new Map([['10',{origin:[0,0,0],scale:1,center:[0,0,0]}]]);
 const colorBounds=[[0,0,0],[1,1,100]],items=[{id:'10',cloud:pointBlock([10,30]),colorBounds},{id:'10',cloud:pointBlock([70,90]),colorBounds}];
 let options={pointColorMode:'height',palette:'viridis',reverse:false};
 layer.setItems(items,placement);layer.setOptions(options);
 const entries=[...layer.entries];
 for(const change of [{palette:'blue-white-red'},{reverse:true},{range:{min:20,max:80}}]){
  const before=uploads.length,previous=values.get(entries[0].color);options={...options,...change};layer.setOptions(options);
  assert.deepEqual(uploads.slice(before),entries.map(entry=>entry.color));assert.notDeepEqual(values.get(entries[0].color),previous);
  for(const entry of entries)assert.deepEqual(values.get(entry.color),Array.from(pointDisplayColors(entry.item.cloud,entry.count,{colorMode:'height',palette:options.palette,reverse:options.reverse,range:options.range||{min:0,max:100}}).values));
 }
 const before=uploads.length;layer.setOptions({...options,range:{min:20,max:80}});assert.equal(uploads.length,before);
 layer.dispose();
});
test('appending a block without fixed color bounds recolors retained blocks when the data range expands',()=>{
 const {layer,values,uploads}=trackedPointLayer(),placement=new Map([['10',{origin:[0,0,0],scale:1,center:[0,0,0]}]]);
 const root={id:'10',cloud:pointBlock([10,20])},child={id:'10',cloud:pointBlock([30,40])},options={pointColorMode:'height',palette:'viridis'};
 layer.setItems([root],placement);layer.setOptions(options);const entry=layer.entries[0],colors=[...values.get(entry.color)],before=uploads.length;
 layer.setItems([root,child],placement);layer.setOptions(options);
 assert.equal(layer.entries[0],entry);assert.deepEqual(layer.colorRange,{min:10,max:40});assert.notDeepEqual(values.get(entry.color),colors);
 assert(!uploads.slice(before).includes(entry.position));assert(uploads.slice(before).includes(entry.color));
 layer.dispose();
});
test('missing RGB and scalar attributes fall back to one stable height palette across progressive blocks',()=>{
 for(const pointColorMode of ['rgb','field:missing']){
  const {layer,values,uploads}=trackedPointLayer(),placement=new Map([['10',{origin:[0,0,100],scale:1,center:[0,0,0]}]]);
  const colorBounds=[[0,0,100],[1,1,200]],root={id:'10',cloud:pointBlock([120,140]),colorBounds};
  const child={id:'10',cloud:pointBlock([100,140,200]),colorBounds},options={pointColorMode,palette:'viridis'};
  layer.setItems([root],placement);layer.setOptions(options);
  const rootEntry=layer.entries[0],rootColors=[...values.get(rootEntry.color)],before=uploads.length;
  assert.deepEqual(rootColors,Array.from(pointDisplayColors(root.cloud,2,{colorMode:'height',palette:'viridis',range:{min:100,max:200}}).values));
  assert.equal(layer.fallbacks.length,1);
  layer.setItems([root,child],placement);layer.setOptions(options);
  const childEntry=layer.entries[1];
  assert.equal(layer.entries[0],rootEntry);assert.deepEqual(values.get(rootEntry.color),rootColors);
  assert.deepEqual(values.get(childEntry.color).slice(3,6),rootColors.slice(3,6));
  assert(!uploads.slice(before).includes(rootEntry.color),'appending a fallback block leaves the stable root colors cached');
  assert.equal(layer.fallbacks.length,2,'cached entries retain their missing-attribute explanation');
  layer.setOptions({...options,range:{min:110,max:170}});
  assert.deepEqual(values.get(rootEntry.color),Array.from(pointDisplayColors(root.cloud,2,{colorMode:'height',palette:'viridis',range:{min:110,max:170}}).values));
  assert.deepEqual(values.get(childEntry.color).slice(3,6),values.get(rootEntry.color).slice(3,6));
  layer.dispose();
 }
});
test('RGB and scalar colors use the same point rules with a safe missing-field fallback',()=>{
 const cloud={count:2,positions:new Float64Array([0,0,1,0,0,2]),fields:{intensity:new Float32Array([10,20])}};
 const colors=pointDisplayColors(cloud,2,{colorMode:'field:intensity',palette:'viridis'});assert.deepEqual(colors.range,{min:10,max:20});assert.notDeepEqual([...colors.values.slice(0,3)],[...colors.values.slice(3)]);
 const missing=pointDisplayColors(cloud,2,{colorMode:'rgb',palette:'viridis'});assert.equal(missing.mode,'height');assert(missing.fallback);assert(missing.values.every(Number.isFinite));
});
test('shared comparison clones cameras, pauses rebuilds and respects independent views',()=>{
 let enabled=true,all=[];const make=()=>({camera:{azimuth:5,elevation:10,zoom:2,pan:[1,2]},target:[4,5,6],baseHeight:8,projection:'perspective',distance:12,fov:50,near:.1,render(){this.renders=(this.renders||0)+1;}}),a=make(),b=make();all=[a,b];const sync=createViewerComparison(()=>all,()=>enabled);all.forEach(sync.install);
 a.camera.azimuth=37;a.render();assert.equal(b.camera.azimuth,37);assert.notEqual(a.camera.pan,b.camera.pan);assert.equal(b.renders,1);
 sync.pause(()=>{a.camera.azimuth=42;a.render();});assert.equal(b.camera.azimuth,37);enabled=false;a.render();assert.equal(b.camera.azimuth,37);
 sync.sync();assert.equal(b.camera.azimuth,42);all=[a];enabled=true;a.camera.azimuth=60;a.render();assert.equal(b.camera.azimuth,42);
});
