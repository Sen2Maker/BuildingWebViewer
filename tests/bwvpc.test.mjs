import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {normalizeBwvpcManifest,decodeBwvpcNode,refinementOrder} from '../src/compare/bwvpc.js';
import {createComparisonSession} from '../src/compare/session.js';
import {parseComparisonCloudMessage} from '../src/compare/point-worker.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
function binary(points,origin=[1000000,2000000,100]){
 const data=Buffer.alloc(64+12*points.length);data.write('BWVPC001');data.writeUInt32LE(points.length,8);origin.forEach((n,i)=>data.writeDoubleLE(n,16+8*i));data.writeUInt32LE(12,40);
 points.flat().forEach((n,i)=>data.writeFloatLE(n,64+4*i));return data;
}
function fixture(){
 const base='https://fixture.example/data/',files=new Map(),calls=[];
 const resources=[['r',[[0,0,0],[2,2,2]],['r0','r1'],6],['r0',[[.1,.1,.1],[.2,.2,.2]],[],2],['r1',[[1,1,1],[1.1,1.1,1.1]],[],2]];
 const nodes=resources.map(([id,points,children,subtreePoints])=>{
  const data=binary(points);files.set(base+id+'.bpc',data);
  return {id,path:id+'.bpc',points:points.length,subtreePoints,children,bounds:[[1000000,2000000,100],[1000002,2000002,102]],bytes:data.length,sha256:hash(data)};
 });
 const manifest={format:'BWVPC',version:1,refinement:'additive-disjoint',pointCount:6,root:'r',bounds:nodes[0].bounds,nodes};
 const body=Buffer.from(JSON.stringify(manifest));files.set(base+'cloud.bwvpc.json',body);
 const mesh=Buffer.from('v 1000000 2000000 100\nv 1000002 2000000 100\nv 1000000 2000002 102\nf 1 2 3\n');files.set(base+'mesh.obj',mesh);
 const catalog={schemaVersion:3,format:'BWVPC-COMPARISON',buildings:[{id:'1',pointCloud:{url:base+'cloud.bwvpc.json',bytes:body.length,sha256:hash(body)},mesh:{url:base+'mesh.obj',bytes:mesh.length,sha256:hash(mesh)}}]};
 files.set(base+'index.json',Buffer.from(JSON.stringify(catalog)));
 const fetchImpl=async(url,options)=>{calls.push(url);return new Response(files.get(url)??'404',{status:files.has(url)?200:404});};
 return {base,files,calls,manifest,fetchImpl};
}
const wait=async condition=>{for(let i=0;i<500;i++){if(condition())return;await new Promise(r=>setTimeout(r,2));}throw Error('Condition timed out');};

test('BWVPC validates a complete bounded tree and reconstructs precise local-origin coordinates',()=>{
 const f=fixture(),tree=normalizeBwvpcManifest(f.manifest,f.base+'cloud.bwvpc.json');
 assert.deepEqual(refinementOrder(tree).map(x=>x.id),['r0','r1']);
 const cloud=decodeBwvpcNode(f.files.get(f.base+'r0.bpc'),tree.nodes.get('r0'));
 assert.equal(cloud.count,2);assert.ok(Math.abs(cloud.positions[0]-1000000.1)<1e-7);
 for(const mutate of [v=>v.nodes[0].children.push('r7'),v=>v.nodes[1].path='../r0.bpc',v=>v.nodes[1].bytes++,v=>v.pointCount++,v=>v.nodes[0].children.push('r0'),v=>v.nodes[0].points=100000000]){
  const value=structuredClone(f.manifest);mutate(value);assert.throws(()=>normalizeBwvpcManifest(value,f.base+'cloud.bwvpc.json'));
 }
 const broken=Buffer.from(f.files.get(f.base+'r.bpc'));broken.writeFloatLE(NaN,64);assert.throws(()=>decodeBwvpcNode(broken));
 assert.throws(()=>decodeBwvpcNode(broken.subarray(0,70)));
});

test('base appears before held refinement; pause cancels it and resume adds each node once',async t=>{
 const f=fixture(),shown=[],states=[];let hold=true;
 const fetchImpl=async(url,options)=>{
  if(url===f.base+'r0.bpc'&&hold){f.calls.push(url);return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));}
  return f.fetchImpl(url,options);
 };
 const session=createComparisonSession({manifest:f.base+'index.json',initialId:'1',fetchImpl,workerFactory:null,prefetch:false,
  onCloud:({cloud})=>shown.push(['root',cloud.count]),onRefinement:({nodeId,cloud})=>shown.push([nodeId,cloud.count]),onState:s=>states.push(s)});
 t.after(()=>session.dispose());await session.start();await wait(()=>f.calls.includes(f.base+'r0.bpc'));
 assert.deepEqual(shown,[['root',2]]);session.pauseRefinement();hold=false;
 await session.resumeRefinement();await wait(()=>session.getState().refinement==='complete');
 assert.deepEqual(shown,[['root',2],['r0',2],['r1',2]]);assert.equal(session.getState().cloudPoints,6);
 assert.ok(states.some(s=>s.refinement==='paused'));
});

test('node integrity failure keeps base visible and explicit retry resumes the failed node',async t=>{
 const f=fixture(),shown=[];const original=f.files.get(f.base+'r1.bpc');f.files.set(f.base+'r1.bpc',Buffer.from('corrupt'));
 const session=createComparisonSession({manifest:f.base+'index.json',initialId:'1',fetchImpl:f.fetchImpl,workerFactory:null,prefetch:false,onRefinement:x=>shown.push(x.nodeId)});
 t.after(()=>session.dispose());await session.start();await wait(()=>session.getState().refinement==='error');
 assert.equal(session.getState().cloud,'ready');assert.deepEqual(shown,['r0']);f.files.set(f.base+'r1.bpc',original);
 await session.resumeRefinement();await wait(()=>session.getState().refinement==='complete');assert.deepEqual(shown,['r0','r1']);
});

test('memory budget and Save-Data stop automatic refinement without blocking the base',async t=>{
 for(const options of [{refinementPointBudget:3},{host:{navigator:{connection:{saveData:true}}}}]){
  const f=fixture();const session=createComparisonSession({manifest:f.base+'index.json',initialId:'1',fetchImpl:f.fetchImpl,workerFactory:null,prefetch:false,...options});t.after(()=>session.dispose());
  await session.start();assert.equal(session.getState().cloud,'ready');assert.equal(session.getState().refinement,'paused');assert.ok(!f.calls.includes(f.base+'r0.bpc'));
  await session.resumeRefinement();await wait(()=>session.getState().refinement==='complete');
 }
});

test('switching generation while a node is in flight never attaches it to the newer selection',async t=>{
 const f=fixture();let resolve;const shown=[];let first=true;
 const fetchImpl=async(url,options)=>{
  if(url===f.base+'r0.bpc'&&first){first=false;return new Promise(done=>{resolve=()=>done(new Response(f.files.get(url)));});}
  return f.fetchImpl(url,options);
 };
 const session=createComparisonSession({manifest:f.base+'index.json',initialId:'1',fetchImpl,workerFactory:null,prefetch:false,onRefinement:x=>shown.push(x.nodeId)});t.after(()=>session.dispose());
 await session.start();await wait(()=>resolve);await session.select('missing');resolve();await new Promise(r=>setTimeout(r,15));assert.deepEqual(shown,[]);assert.equal(session.getState().id,'missing');
});

test('worker decodes bounded BWVPC nodes and transfers the resulting position array',async()=>{
 const f=fixture(),replies=[];const node=normalizeBwvpcManifest(f.manifest,f.base+'cloud.bwvpc.json').root;
 const data=Uint8Array.from(f.files.get(f.base+'r.bpc'));
 await parseComparisonCloudMessage({type:'parse',id:4,buffer:data.buffer,filename:'r.bpc',maxPoints:120000,expected:node},(message,buffers)=>replies.push({message,buffers}));
 assert.equal(replies[0].message.type,'result');assert.equal(replies[0].message.cloud.count,2);assert.equal(replies[0].buffers.length,1);
});

test('fine trees above 128 nodes remain valid, with bounded depth and node table',()=>{
 const nodes=[],box=[[0,0,0],[1,1,1]];
 function add(id,depth){
  const node={id,path:id+'.bpc',points:1,subtreePoints:1,bounds:box,bytes:76,sha256:'a'.repeat(64),children:[]};nodes.push(node);
  if(depth<3)for(let i=0;i<8;i++){node.children.push(id+i);node.subtreePoints+=add(id+i,depth+1);}
  return node.subtreePoints;
 }
 const total=add('r',0),manifest={format:'BWVPC',version:1,refinement:'additive-disjoint',pointCount:total,root:'r',bounds:box,nodes};
 const tree=normalizeBwvpcManifest(manifest,'https://fixture.example/cloud.bwvpc.json');
 assert.equal(tree.nodes.size,585);assert.equal(refinementOrder(tree).length,584);
 const tooMany=structuredClone(manifest);tooMany.nodes=Array(4097).fill(nodes[0]);assert.throws(()=>normalizeBwvpcManifest(tooMany,'https://fixture.example/cloud.bwvpc.json'),/node table/);
 const chain=Array.from({length:33},(_,i)=>({id:'r'+'0'.repeat(i),path:'r'+'0'.repeat(i)+'.bpc',points:1,subtreePoints:33-i,bounds:box,bytes:76,sha256:'a'.repeat(64),children:i<32?['r'+'0'.repeat(i+1)]:[]}));
 assert.equal(normalizeBwvpcManifest({...manifest,pointCount:33,nodes:chain},'https://fixture.example/cloud.bwvpc.json').nodes.size,33);
 chain[32].id='r'+'0'.repeat(33);chain[32].path=chain[32].id+'.bpc';
 assert.throws(()=>normalizeBwvpcManifest({...manifest,pointCount:33,nodes:chain},'https://fixture.example/cloud.bwvpc.json'),/node ID/);
});
