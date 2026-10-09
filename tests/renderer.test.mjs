import assert from 'node:assert/strict';
import {MeshViewer} from '../src/lod/renderer.js';
const uploads=[], deleted=[], attributes=[], shaders=[]; const buffers=new Map(); let bound,serial=0,draws=0,labels=[];
const gl = new Proxy({OUT_OF_MEMORY:1285,createBuffer:()=>({id:++serial}),deleteBuffer:buffer=>deleted.push(buffer),
  bindBuffer:(_,buffer)=>{bound=buffer;},bufferData:(_,values)=>{uploads.push(bound);buffers.set(bound,new Float32Array(values));},
  createShader:()=>({}),createProgram:()=>({}),shaderSource:(_,text)=>shaders.push(text),getShaderParameter:()=>true,getProgramParameter:()=>true,
  getError:()=>0,getAttribLocation:(_,name)=>['position','normal','buildingColor','vertexHeight'].indexOf(name),
  vertexAttribPointer:(...args)=>attributes.push(args),drawArrays:()=>draws++,
},{get:(object,name)=>object[name]??(()=>{})});
globalThis.window={devicePixelRatio:2}; globalThis.ResizeObserver=class{observe(){}disconnect(){}};
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
const canvas={style:{},getContext:()=>gl,clientWidth:800,clientHeight:600,getBoundingClientRect:()=>({width:800,height:600}),addEventListener(){},removeEventListener(){}};
const viewer=new MeshViewer(canvas,{onLabels:value=>{labels=value;}});
function box(id,width,height,base) {
  return {id,vertices:[[0,0,base],[width,0,base],[width,width,base],[0,width,base],[0,0,base+height],[width,0,base+height],[width,width,base+height],[0,width,base+height]],
    faces:[[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,5,1],[0,4,5],[1,6,2],[1,5,6],[2,7,3],[2,6,7],[3,4,0],[3,7,4]]};
}
viewer.setModels([box('a',20,10,1e6),box('b',10,4,2e6)]);
assert.equal(viewer.getState().triangleCount,24);assert.equal(viewer.getState().featureEdgeCount,24);
assert.deepEqual(viewer.getState().dataRange,{min:0,max:10});assert.equal(viewer.getState().heightMeaning,'height-above-building-min-z');
let triangleData=buffers.get(viewer.buffers.triangles.buffer);
const heights=Array.from({length:triangleData.length/10},(_,i)=>triangleData[i*10+9]);
assert.equal(Math.max(...heights),10);assert.equal(Math.min(...heights),0);
assert(attributes.some(args=>args[0]===3&&args[1]===1&&args[4]===40&&args[5]===36));
assert.equal(canvas.width,1600);assert.equal(labels.length,2);
console.log('PASS LOD geometry, feature edges, high DPI and original-unit height attributes');

const before=uploads.length, buffer=viewer.buffers.triangles;
viewer.setOptions({colors:'height',palette:'blue-white-red',reverse:true,range:{min:2,max:8}});
assert.equal(uploads.length,before);assert.equal(viewer.buffers.triangles,buffer);assert.deepEqual(viewer.getState().colorRange,{min:2,max:8});
viewer.setOptions({range:null,palette:'viridis'});assert.deepEqual(viewer.getState().colorRange,{min:0,max:10});
assert.throws(()=>viewer.setOptions({range:{min:10,max:0}}),/最小值/);
const fragment=shaders.find(text=>text.includes('gl_FragColor'));
assert(fragment.includes('paletteColor(heightValue)'));
assert(!shaders.find(text=>text.includes('gl_Position')).includes('paletteColor('));
console.log('PASS palette and limits update without geometry upload; palette lookup follows scalar interpolation in fragment shader');

viewer.setOptions({scale:'normalized'});
triangleData=buffers.get(viewer.buffers.triangles.buffer);
const originalHeights=Array.from({length:triangleData.length/10},(_,i)=>triangleData[i*10+9]);
const displayHeights=Array.from({length:triangleData.length/10},(_,i)=>triangleData[i*10+2]);
assert.equal(Math.max(...originalHeights),10);assert.equal(Math.max(...displayHeights),15);
assert.deepEqual(viewer.getState().dataRange,{min:0,max:10});
assert(deleted.includes(buffer.buffer));
console.log('PASS normalized arrangement preserves the original height scale for colors');

draws=0;viewer.setModels([]);assert.equal(draws,0);assert.deepEqual(labels,[]);assert.equal(viewer.getState().dataRange,null);assert.equal(viewer.getState().colorRange,null);
viewer.destroy();
console.log('PASS clearing and disposal remove previous geometry and height ranges');
