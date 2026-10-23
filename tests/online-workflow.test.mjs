import {validateSharedPointSettings,settingsForCloud} from '../src/shared/online-point-settings.js';
import {defaultPointSettings,semanticPointCloud} from '../src/pointcloud/point-dataset.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {probeOnlineData} from '../src/shared/online-probe.js';
import {validatePresentation,readPresentation,withPresentation} from '../src/shared/online-presentation.js';
import {comparisonLink,readCompareDescriptor,validateCompareDescriptor} from '../src/shared/online-compare-core.js';
import {createComparisonSession} from '../src/compare/session.js';
import {CURATED_BUILDINGS} from '../src/shared/online-demo.js';
const base='https://fixture.example/';
const encode=value=>new TextEncoder().encode(value);
const hash=data=>createHash('sha256').update(data).digest('hex');
function fixture(){
 const files=new Map(),requests=[],datasets=[];
 for(const id of ['1','2','3'])for(const [role,viewer,format,content]of [['mesh','lod','obj','v 0 0 0\nv 1 0 0\nv 0 1 1\nf 1 2 3\n'],['point_cloud','pointcloud','xyz','0 0 0\n1 1 1\n2 2 2\n']]){
  const url=base+id+'/'+role+'.'+format,bytes=encode(content);files.set(url,bytes);datasets.push({id:id+'/'+role,url,viewer,format,bytes:bytes.length,sha256:hash(bytes)});
 }
 files.set(base+'index.json',encode(JSON.stringify({schemaVersion:1,datasets})));
 const source=async(url,{signal}={})=>{if(signal?.aborted)throw new DOMException('cancelled','AbortError');requests.push(url);if(!files.has(url))throw Error('HTTP 404');return files.get(url);};
 return {files,source,requests};
}
test('connection verifies and parses exactly the selected pair before returning a viewer descriptor',async()=>{
 const f=fixture(),result=await probeOnlineData({kind:'compare',url:base+'index.json',entry:'2',buildingIds:['2','3']},{source:f.source});
 assert.deepEqual(f.requests,[base+'index.json',base+'2/mesh.obj',base+'2/point_cloud.xyz']);assert.equal(result.summary.faces,1);assert.equal(result.summary.points,3);assert.equal(result.summary.total,2);assert.deepEqual(result.descriptor.buildingIds,['2','3']);
 const link=comparisonLink(result.descriptor,'https://viewer.example/index.html?project=private');assert.equal(new URL(link).search,'');assert.deepEqual(readCompareDescriptor(new URL(link).hash).buildingIds,['2','3']);
});
test('connection rejects credentials before network, missing pairs and bad resource integrity before success',async()=>{
 const f=fixture();await assert.rejects(probeOnlineData({kind:'compare',url:base+'index.json?token=secret'},{source:f.source}),/secret/);assert.equal(f.requests.length,0);
 await assert.rejects(probeOnlineData({kind:'compare',url:base+'index.json',entry:'missing'},{source:f.source}),/Missing/);
 f.files.set(base+'2/mesh.obj',encode('broken'));await assert.rejects(probeOnlineData({kind:'compare',url:base+'index.json',entry:'2'},{source:f.source}),/size does not match/);
});
test('direct files and general indexes are parsed and routed to their own viewer; aborted work never returns success',async()=>{
 const f=fixture();const single=await probeOnlineData({kind:'pointcloud',url:base+'1/point_cloud.xyz',format:'xyz'},{source:f.source});assert.equal(single.descriptor.viewer,'pointcloud');assert.equal(single.summary.points,3);
 f.files.set(base+'lines.obj',encode('v 0 0 0\nv 1 1 1\nl 1 2\n'));const wire=await probeOnlineData({kind:'wireframe',url:base+'lines.obj',format:'obj'},{source:f.source});assert.equal(wire.summary.edges,1);
 const indexed=await probeOnlineData({kind:'manifest',url:base+'index.json',entry:'3/mesh'},{source:f.source});assert.equal(indexed.descriptor.viewer,'lod');assert.equal(indexed.descriptor.entry,'3/mesh');
 const c=new AbortController();await assert.rejects(probeOnlineData({kind:'pointcloud',url:base+'1/point_cloud.xyz',format:'xyz'},{source:async(...args)=>{const result=await f.source(...args);c.abort();return result;},signal:c.signal}),{name:'AbortError'});
});
test('a selected tool controls index routing and rejects entries for another tool',async()=>{
 const f=fixture();const result=await probeOnlineData({kind:'manifest',viewer:'pointcloud',url:base+'index.json'},{source:f.source});
 assert.equal(result.descriptor.viewer,'pointcloud');assert.equal(result.descriptor.entry,'1/point_cloud');assert.equal(result.summary.total,3);
 assert.deepEqual(f.requests,[base+'index.json',base+'1/point_cloud.xyz']);
 await assert.rejects(probeOnlineData({kind:'manifest',viewer:'pointcloud',url:base+'index.json',entry:'1/mesh'},{source:f.source}),/selected tool/);
 await assert.rejects(probeOnlineData({kind:'manifest',viewer:'wireframe',url:base+'index.json'},{source:f.source}),/selected tool/);
});
test('BWVPC probe validates one binary root without downloading refinement nodes',async()=>{
 const f=fixture(),bytes=new Uint8Array(76),view=new DataView(bytes.buffer);bytes.set(encode('BWVPC001'));view.setUint32(8,1,true);view.setUint32(40,12,true);
 const node={id:'r',path:'r.bpc',points:1,subtreePoints:1,bounds:[[0,0,0],[0,0,0]],children:[],bytes:76,sha256:hash(bytes)};
 const tree=encode(JSON.stringify({format:'BWVPC',version:1,refinement:'additive-disjoint',root:'r',pointCount:1,bounds:node.bounds,nodes:[node]}));
 const mesh=f.files.get(base+'1/mesh.obj');f.files.set(base+'cloud.json',tree);f.files.set(base+'r.bpc',bytes);
 f.files.set(base+'bwvpc.json',encode(JSON.stringify({schemaVersion:3,format:'BWVPC-COMPARISON',buildings:[{id:'1',mesh:{url:base+'1/mesh.obj',bytes:mesh.length,sha256:hash(mesh)},pointCloud:{url:base+'cloud.json',bytes:tree.length,sha256:hash(tree)}}]})));
 const result=await probeOnlineData({kind:'compare',url:base+'bwvpc.json'},{source:f.source});assert.equal(result.summary.previewPoints,1);assert.equal(f.requests.at(-1),base+'r.bpc');assert.equal(f.requests.length,4);
});
test('a scoped session cannot navigate outside its configured selection and retains its order',async()=>{
 const f=fixture(),states=[];const session=createComparisonSession({manifest:base+'index.json',initialId:'3',buildingIds:['3','1'],fetchSource:f.source,workerFactory:()=>null,prefetch:false,onState:s=>states.push(s)});
 try{await session.start();assert.equal(states.at(-1).total,2);assert.equal(states.at(-1).id,'3');await session.next();assert.equal(states.at(-1).id,'1');await session.next();assert.equal(states.at(-1).id,'1');assert.ok(!f.requests.some(url=>url.includes('/2/')));}finally{session.dispose();}
});
test('share view roundtrips layout, point size, palette and camera; invalid or executable options fail closed',()=>{
 const camera={format:'BuildingWebViewer.camera',version:1,space:'lod-arrangement',projection:'orthographic',scene:{ids:['2'],scale:'real'},camera:{azimuth:40,elevation:30,zoom:2,pan:[.2,.1],target:[0,0,0],baseHeight:100}};
 const value={version:1,controls:{'mesh-compare-count':'2','mesh-layers-1':'cloud','mesh-layers-2':'mesh','mesh-point-size':5,palette:'inferno','show-grid':false},camera};
 const url=withPresentation(comparisonLink({schemaVersion:1,manifest:base+'index.json',buildingId:'2'},'https://viewer.example/index.html'),value);assert.deepEqual(readPresentation(new URL(url).hash),value);
 for(const controls of [{'mesh-point-size':Infinity},{palette:'javascript:alert(1)'},{'script':'x'},{'mesh-compare-count':'20'}])assert.throws(()=>validatePresentation({version:1,controls}));
 assert.throws(()=>validateCompareDescriptor({schemaVersion:1,manifest:base+'index.json',buildingId:'2',buildingIds:['1']}));
 assert.equal(CURATED_BUILDINGS.length,100);assert.equal(new Set(CURATED_BUILDINGS).size,100);
});

test('field mappings and fixed palette range survive sharing and reproduce the same RGB values',()=>{
 const cloud={count:2,positions:new Float64Array([0,0,0,1,1,1]),fields:{column_4:new Float32Array([255,0]),column_5:new Float32Array([0,255]),column_6:new Float32Array([128,64])}};
 const settings=defaultPointSettings(cloud);settings.tags.column_4='red';settings.tags.column_5='green';settings.tags.column_6='blue';settings.rgbScale='255';settings.colorSpace='rgb';
 const view={version:1,controls:{'mesh-point-color-mode':'rgb','mesh-point-style':'sphere','mesh-point-color':'#123456','show-edges':false},pointSettings:settings,palette:{palette:'inferno',reverse:true,range:{min:-5,max:25}}};
 const shared=readPresentation(new URL(withPresentation('https://viewer.example/lod.html',view)).hash);
 assert.deepEqual(shared,JSON.parse(JSON.stringify(view)));const restored=semanticPointCloud(cloud,settingsForCloud(cloud,shared.pointSettings),{strict:true});assert.deepEqual(Array.from(restored.rgb),Array.from(semanticPointCloud(cloud,settings,{strict:true}).rgb));assert.equal(restored.rgb[0],1);assert.equal(restored.rgb[4],1);
 assert.throws(()=>settingsForCloud({...cloud,fields:{}},settings));
 assert.throws(()=>validateSharedPointSettings({...settings,order:['x','y','z','column_4','column_4','column_6']}));
 assert.throws(()=>validatePresentation({...view,palette:{palette:'inferno',range:{min:2,max:1}}}));
 const duplicate=structuredClone(settings);duplicate.tags.column_5='red';assert.throws(()=>validateSharedPointSettings(duplicate));
 const invalid=structuredClone(settings);invalid.rgbScale='256';assert.throws(()=>validateSharedPointSettings(invalid));
});
test('shared HSV interpretation uses explicit channel roles and numeric scale',()=>{
 const cloud={count:1,positions:new Float64Array([0,0,0]),fields:{a:new Float32Array([120]),b:new Float32Array([1]),c:new Float32Array([1])}};
 const settings=defaultPointSettings(cloud);Object.assign(settings.tags,{a:'hue',b:'saturation',c:'value'});settings.colorSpace='hsv';settings.hsvScale='degrees';
 const restored=semanticPointCloud(cloud,validateSharedPointSettings(settings),{strict:true});assert.deepEqual(Array.from(restored.rgb),[0,1,0]);
});

test('compact full-catalog report preset has matching panes and no selected-ID restriction',()=>{
 const query='?dataset=bwv-test4000&building=194&presentation=report-v1&lang=zh';
 const view=readPresentation('',query);assert.equal(view.controls['mesh-compare-count'],'2');assert.equal(view.controls['mesh-layers-1'],'cloud');assert.equal(view.controls['mesh-layers-2'],'mesh');assert.equal(view.controls['mesh-point-size'],3);assert.equal(view.controls['show-grid'],false);assert.equal(view.camera,undefined);
 assert.equal(readCompareDescriptor('',query).buildingIds,undefined);
 assert.throws(()=>readPresentation('','?presentation=missing'));
});
