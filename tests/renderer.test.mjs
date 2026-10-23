import assert from 'node:assert/strict';
import {MeshViewer} from '../src/lod/renderer.js';
const uploads=[], deleted=[], attributes=[], shaders=[]; const buffers=new Map(); let bound,serial=0,draws=0,labels=[];
const gl = new Proxy({OUT_OF_MEMORY:1285,ALIASED_POINT_SIZE_RANGE:33901,MAX_VERTEX_ATTRIBS:34921,createBuffer:()=>({id:++serial}),deleteBuffer:buffer=>deleted.push(buffer),
  bindBuffer:(_,buffer)=>{bound=buffer;},bufferData:(_,values)=>{uploads.push(bound);buffers.set(bound,new Float32Array(values));},
  createShader:()=>({}),createProgram:()=>({}),shaderSource:(_,text)=>shaders.push(text),getShaderParameter:()=>true,getProgramParameter:()=>true,
  getError:()=>0,getParameter:key=>key===33901?[1,64]:8,getAttribLocation:(_,name)=>['position','normal','buildingColor','vertexHeight'].indexOf(name),
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

viewer.setOptions({scale:'real'});
viewer.setModels([box('offset',2,3,100)],{referenceModels:[{id:'offset',vertices:[[-10,-10,50],[10,10,200]],faces:[]}]});
const offsetData=buffers.get(viewer.buffers.triangles.buffer),offsetHeights=Array.from({length:offsetData.length/10},(_,i)=>offsetData[i*10+9]);
assert.equal(Math.min(...offsetHeights),0);assert.equal(Math.max(...offsetHeights),3);assert.deepEqual(viewer.getState().dataRange,{min:0,max:3});
console.log('PASS comparison union bounds preserve each mesh original relative-height colors');
const cloudRoot={id:'offset',cloud:{count:2,positions:new Float64Array([0,0,100,1,1,101]),fields:{}},colorBounds:[[-10,-10,50],[10,10,200]]};
const cloudChild={id:'offset',cloud:{count:1,positions:new Float64Array([2,2,103]),fields:{}},colorBounds:cloudRoot.colorBounds};
viewer.setClouds([cloudRoot]);
viewer.camera.azimuth=17;viewer.camera.elevation=62;viewer.camera.zoom=3;viewer.camera.pan=[2,-4];viewer.target=[5,6,7];
const meshBuffers=viewer.buffers,meshBufferHandles=Object.values(meshBuffers).map(item=>item.buffer),camera=structuredClone(viewer.camera),target=[...viewer.target];
const baseHeight=viewer.baseHeight,sceneBounds=viewer.sceneBounds,edgePositions=viewer.edgePositions,navigationTriangles=viewer.navigationTriangles;
const rootEntry=viewer.pointLayer.entries[0],appendStart=uploads.length,deleteStart=deleted.length,sceneReference=viewer.sceneData.referenceModels;
viewer.setClouds([cloudRoot,cloudChild]);
assert.equal(viewer.buffers,meshBuffers);assert.equal(viewer.pointLayer.entries[0],rootEntry);assert.equal(viewer.getState().pointCount,3);
assert.deepEqual(viewer.camera,camera);assert.deepEqual(viewer.target,target);assert.equal(viewer.baseHeight,baseHeight);assert.equal(viewer.sceneBounds,sceneBounds);
assert.equal(viewer.edgePositions,edgePositions);assert.equal(viewer.navigationTriangles,navigationTriangles);assert.equal(viewer.getState().triangleCount,12);
assert.equal(viewer.sceneData.referenceModels,sceneReference);assert.deepEqual(viewer.sceneData.clouds,[cloudRoot,cloudChild]);
assert(!uploads.slice(appendStart).some(handle=>meshBufferHandles.includes(handle)||handle===rootEntry.position||handle===rootEntry.color));
assert.equal(deleted.length,deleteStart);
const childEntry=viewer.pointLayer.entries[1];
assert.deepEqual(Array.from(buffers.get(childEntry.position)),[2,2,53],'appended blocks use the original model reference transform');
viewer.setClouds([]);
assert.equal(viewer.buffers,meshBuffers);assert.equal(viewer.getState().pointCount,0);assert.deepEqual(viewer.camera,camera);assert.deepEqual(viewer.target,target);
assert(deleted.includes(rootEntry.position));assert(deleted.includes(childEntry.position));assert(!deleted.slice(deleteStart).some(handle=>meshBufferHandles.includes(handle)));
console.log('PASS incremental point blocks preserve mesh buffers, reference alignment and the active camera');
draws=0;viewer.setModels([]);assert.equal(draws,0);assert.deepEqual(labels,[]);assert.equal(viewer.getState().dataRange,null);assert.equal(viewer.getState().colorRange,null);
viewer.destroy();
console.log('PASS clearing and disposal remove previous geometry and height ranges');
