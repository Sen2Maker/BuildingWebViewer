import { genCheck } from './sample.js';
import { editCloudCheck } from './point-edit-model.js';
const EDIT_PROJECT_FORMAT='BuildingWebViewer.point-editor';
const EDIT_PROJECT_LIMIT=512*1024*1024;
function editorMeta(e){return {id:e.id,name:e.name,visible:e.visible,recipe:e.recipe||null,frozen:!!e.frozen,color:e.color||null};}
function editorCloudMeta(c){return {count:c.count,totalCount:c.count,columnOrder:c.columnOrder,semantics:c.semantics,processing:c.processing};}
export function editorValidateEntities(entities){
 if(!Array.isArray(entities)||entities.length>200)throw Error('项目最多 200 个对象 / Project supports at most 200 objects');const ids=new Set();let bytes=0;
 for(const e of entities){if(!Number.isSafeInteger(e.id)||e.id<1||ids.has(e.id)||typeof e.name!=='string'||e.name.length>160||typeof e.visible!=='boolean')throw Error('Invalid project object');ids.add(e.id);editCloudCheck(e.cloud);if(e.recipe)genCheck(e.recipe);if(e.color&&(!Array.isArray(e.color)||e.color.length!==3||!e.color.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Invalid object color');
  if(e.deleted&&(!(e.deleted instanceof Uint8Array)||e.deleted.length!==e.cloud.count||e.deleted.some(v=>v>1)))throw Error('Invalid deletion mask');
  for(const a of [e.cloud.positions,e.cloud.rgb,...Object.values(e.cloud.fields||{}),e.deleted])if(a){bytes+=a.byteLength;if(bytes>EDIT_PROJECT_LIMIT)throw Error('项目超过 512 MB / Project exceeds 512 MB');}
 }return entities;
}
/** Portable binary container: bounded JSON descriptors followed by typed-array blocks. */
export function editorProjectBlob(entities){editorValidateEntities(entities);const blocks=[];let offset=0;
 const array=a=>{if(!a)return null;const type=a instanceof Float64Array?'f64':a instanceof Float32Array?'f32':a instanceof Uint8Array?'u8':null;if(!type)throw Error('Unsupported point array');const d={type,length:a.length,offset,bytes:a.byteLength};blocks.push(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));offset+=a.byteLength;return d;};
 const objects=entities.map(e=>({...editorMeta(e),deleted:array(e.deleted),cloud:{...editorCloudMeta(e.cloud),positions:array(e.cloud.positions),rgb:array(e.cloud.rgb),fields:Object.fromEntries(Object.entries(e.cloud.fields||{}).map(([k,v])=>[k,array(v)]))}}));
 const header=new TextEncoder().encode(JSON.stringify({format:EDIT_PROJECT_FORMAT,version:1,objects}));if(header.length>4*1024*1024)throw Error('Project metadata too large');const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,header.length,true);return new Blob([size,header,...blocks],{type:'application/octet-stream'});
}
export async function editorReadProject(file){
 if(file.size<4||file.size>EDIT_PROJECT_LIMIT+4*1024*1024)throw Error('项目文件大小无效 / Invalid project size');
 const len=new DataView(await file.slice(0,4).arrayBuffer()).getUint32(0,true);if(len>4*1024*1024||len+4>file.size)throw Error('Invalid project header');
 const meta=JSON.parse(await file.slice(4,4+len).text());if(meta.format!==EDIT_PROJECT_FORMAT||meta.version!==1||!Array.isArray(meta.objects)||meta.objects.length>200)throw Error('不是点云编辑项目 / Invalid point editor project');
 let expectedOffset=0;
 const array=async(d,expected=null)=>{if(d===null)return null;const T={f64:Float64Array,f32:Float32Array,u8:Uint8Array}[d?.type];if(!T||!Number.isSafeInteger(d.length)||d.length<0||d.offset!==expectedOffset||d.bytes!==d.length*T.BYTES_PER_ELEMENT||expected!==null&&d.length!==expected||d.offset+d.bytes>file.size-4-len)throw Error('Invalid project array');expectedOffset+=d.bytes;return new T(await file.slice(4+len+d.offset,4+len+d.offset+d.bytes).arrayBuffer());};
 const entities=[];for(const e of meta.objects){const n=e.cloud?.count;if(!Number.isSafeInteger(n)||n<1||n>EDIT_PROJECT_LIMIT/24)throw Error('Invalid point count');const deleted=await array(e.deleted,n),positions=await array(e.cloud.positions,n*3),rgb=await array(e.cloud.rgb,n*3),fields=Object.create(null);
  for(const[k,v]of Object.entries(e.cloud.fields||{}))fields[k]=await array(v,n);const cloud={...e.cloud,positions,rgb,fields};if(!(positions instanceof Float64Array)||rgb&&!(rgb instanceof Float32Array))throw Error('Invalid coordinate array');for(const x of positions)if(!Number.isFinite(x))throw Error('Non-finite coordinate');
  entities.push({...editorMeta(e),deleted,cloud});
 }if(expectedOffset!==file.size-4-len)throw Error('Trailing or missing project bytes');return editorValidateEntities(entities);
}
async function editorDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('BuildingWebViewer.point-editor',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function editorSaveLocal(entities){const db=await editorDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put({format:EDIT_PROJECT_FORMAT,version:1,entities},'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export async function editorLoadLocal(){const db=await editorDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('projects'),r=tx.objectStore('projects').get('current');r.onsuccess=()=>{try{resolve(r.result?editorValidateEntities(r.result.entities):null);}catch(e){reject(e);}};r.onerror=()=>reject(r.error);});}finally{db.close();}}
