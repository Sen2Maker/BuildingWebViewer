import {normalizeManifest, normalizePublicUrl} from '../shared/online-preview-core.js';

export const BWVPC_NODE_LIMIT = 120000;
export const BWVPC_MAX_POINTS = 10000000;
export const BWVPC_HEADER_BYTES = 64;
const fail = message => { throw Error(`BWVPC: ${message}`); };
function count(value, max, name) { if(!Number.isSafeInteger(value)||value<1||value>max) fail(`invalid ${name}`); return value; }
function bounds(value) {
  if(!Array.isArray(value)||value.length!==2||value.some(row=>!Array.isArray(row)||row.length!==3||row.some(n=>!Number.isFinite(n)||Math.abs(n)>1e12))||value[0].some((v,i)=>v>value[1][i]))fail('invalid bounds');
  return value.map(row=>[...row]);
}
function resource(value,id,format='ply') {
  if(!value||typeof value!=='object'||!Number.isSafeInteger(value.bytes)||value.bytes<1||!(/^[a-f0-9]{64}$/).test(value.sha256))fail('resource integrity metadata required');
  const entry={id,viewer:format==='obj'?'lod':'pointcloud',format,url:normalizePublicUrl(value.url),bytes:value.bytes,sha256:value.sha256};
  return normalizeManifest({schemaVersion:1,datasets:[entry]})[0];
}

/** Version 3 comparison catalogs reference independent BWVPC manifests, not point bytes. */
export function normalizeBwvpcCatalog(value) {
  if(value.format!=='BWVPC-COMPARISON'||!Array.isArray(value.buildings)||!value.buildings.length||value.buildings.length>5000)fail('invalid comparison catalog');
  const ids=new Set();
  return value.buildings.map(item=>{
    const id=item?.id;
    if(typeof id!=='string'||!id.trim()||id.length>240||/[\u0000-\u001f\u007f]/.test(id)||ids.has(id))fail('invalid or duplicate building ID');ids.add(id);
    const cloud=resource(item.pointCloud,id+'/point_cloud');
    if(cloud.bytes>1024*1024)fail('manifest exceeds 1 MiB');
    return {id,mesh:resource(item.mesh,id+'/mesh','obj'),cloud:{...cloud,format:'bwvpc'}};
  });
}

export function normalizeBwvpcManifest(value, manifestUrl) {
  if(value?.format!=='BWVPC'||value.version!==1||value.refinement!=='additive-disjoint'||value.root!=='r')fail('unsupported point-cloud format');
  const total=count(value.pointCount,BWVPC_MAX_POINTS,'total point count'),box=bounds(value.bounds);
  if(!Array.isArray(value.nodes)||!value.nodes.length||value.nodes.length>128)fail('invalid node table');
  const base=new URL('.',normalizePublicUrl(manifestUrl));
  const nodes=new Map();
  for(const raw of value.nodes) {
    if(!raw||typeof raw.id!=='string'||!/^r[0-7]{0,16}$/.test(raw.id)||nodes.has(raw.id)||raw.path!==raw.id+'.bpc')fail('invalid node ID/path');
    const points=count(raw.points,BWVPC_NODE_LIMIT,'node point count'),subtree=count(raw.subtreePoints,total,'subtree point count');
    if(raw.bytes!==BWVPC_HEADER_BYTES+points*12)fail('node length does not match point count');
    if(!Array.isArray(raw.children)||raw.children.length>8||new Set(raw.children).size!==raw.children.length||raw.children.some(id=>typeof id!=='string'||id.length!==raw.id.length+1||!id.startsWith(raw.id)||!/[0-7]$/.test(id)))fail('invalid children');
    const entry=resource({...raw,url:new URL(raw.path,base).href},raw.id);
    nodes.set(raw.id,{...entry,format:'bpc',points,subtreePoints:subtree,bounds:bounds(raw.bounds),children:[...raw.children]});
  }
  let sum=0;const visited=new Set();
  function walk(id,parent) {
    const node=nodes.get(id);if(!node||visited.has(id))fail('broken tree');visited.add(id);sum+=node.points;
    if(parent&&node.bounds[0].some((v,i)=>v<parent.bounds[0][i]-1e-7||node.bounds[1][i]>parent.bounds[1][i]+1e-7))fail('child bounds outside parent');
    const descendants=node.points+node.children.reduce((n,child)=>n+walk(child,node),0);
    if(descendants!==node.subtreePoints)fail('subtree count mismatch');return descendants;
  }
  if(walk('r')!==total||visited.size!==nodes.size||sum!==total)fail('tree does not cover declared points');
  if(JSON.stringify(nodes.get('r').bounds)!==JSON.stringify(box))fail('root bounds mismatch');
  return {total,bounds:box,root:nodes.get('r'),nodes};
}

/** Decode one bounded node. Positions are reconstructed as Float64 so GIS origins remain precise. */
export function decodeBwvpcNode(input, expected) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.byteLength<BWVPC_HEADER_BYTES||new TextDecoder().decode(bytes.subarray(0,8))!=='BWVPC001')fail('invalid binary signature');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=count(view.getUint32(8,true),BWVPC_NODE_LIMIT,'binary point count');
  if(view.getUint32(12,true)!==0||view.getUint32(40,true)!==12||bytes.subarray(44,64).some(byte=>byte!==0)||bytes.length!==64+n*12)fail('unsupported or truncated binary layout');
  if(expected&&expected.points!==n)fail('binary point count differs from manifest');
  const origin=[16,24,32].map(offset=>view.getFloat64(offset,true));if(origin.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12))fail('invalid local origin');
  const positions=new Float64Array(n*3),minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<n;i++)for(let axis=0;axis<3;axis++) {
    const point=origin[axis]+view.getFloat32(64+i*12+axis*4,true);
    if(!Number.isFinite(point)||expected&&(point<expected.bounds[0][axis]-.001||point>expected.bounds[1][axis]+.001))fail('point outside node bounds');
    positions[i*3+axis]=point;minimum[axis]=Math.min(minimum[axis],point);maximum[axis]=Math.max(maximum[axis],point);
  }
  return {positions,count:n,totalCount:n,bounds:[minimum,maximum],fields:{},notes:['BWVPC v1 · additive disjoint octree']};
}

/** Breadth-first, round-robin by parent. A partial pass adds detail across the building. */
export function refinementOrder(tree) {
  const result=[],queue=[...tree.root.children];
  for(let i=0;i<queue.length;i++){const node=tree.nodes.get(queue[i]);result.push(node);queue.push(...node.children);}
  return result;
}
