import { defaultPointSettings } from '../pointcloud/point-dataset.js';
/** Immutable point entities. History shares original typed arrays and copies only changed masks. */
export function editCloudCheck(cloud) {
  const n=cloud?.count;
  if(!Number.isSafeInteger(n)||n<1||!cloud.positions||cloud.positions.length!==n*3)throw Error('无效点云 / Invalid point cloud');
  if(!Array.from({length:3},(_,k)=>Number.isFinite(cloud.positions[k])).every(Boolean))throw Error('Invalid coordinates');
  for(const values of Object.values(cloud.fields||{}))if(values.length!==n)throw Error('属性长度不匹配 / Field length mismatch');
  if(cloud.rgb&&cloud.rgb.length!==n*3)throw Error('RGB length mismatch');return cloud;
}
export function editSubset(cloud,indices) {
  const count=indices.length,positions=new Float64Array(count*3),rgb=cloud.rgb?new Float32Array(count*3):null,fields=Object.create(null);
  for(const name of Object.keys(cloud.fields||{}))fields[name]=new Float64Array(count);
  for(let j=0;j<count;j++){const i=indices[j];positions.set(cloud.positions.subarray(i*3,i*3+3),j*3);if(rgb)rgb.set(cloud.rgb.subarray(i*3,i*3+3),j*3);for(const name of Object.keys(fields))fields[name][j]=cloud.fields[name][i];}
  return {...cloud,count,totalCount:count,positions,rgb,fields,bounds:undefined,processing:{tool:'point-edit',sourceCount:cloud.count},columnOrder:cloud.columnOrder?[...cloud.columnOrder]:undefined};
}
export function editIndices(entity,selection=null,selectedOnly=false) {
  const out=[];for(let i=0;i<entity.cloud.count;i++)if(!entity.deleted?.[i]&&(!selectedOnly||selection?.[i]))out.push(i);return out;
}
export function editLiveCount(entity){if(!entity.deleted)return entity.cloud.count;let n=0;for(const v of entity.deleted)n+=v===0;return n;}
export function editEntityBytes(entities){const seen=new Set();let bytes=0;for(const e of entities)for(const a of [e.deleted,e.cloud.positions,e.cloud.rgb,...Object.values(e.cloud.fields||{})])if(a?.buffer&&!seen.has(a.buffer)){seen.add(a.buffer);bytes+=a.buffer.byteLength;}return bytes;}
export class PointEditModel {
  constructor(){this.entities=[];this.active=null;this.selection=new Map();this.selectionStamp=0;this.countCache=null;this.past=[];this.future=[];this.next=1;}
  scope(all=false){return this.entities.filter(e=>e.visible&&(all||e.id===this.active));}
  commit(next){if(next===this.entities)return;this.past.push(this.entities);this.future=[];this.entities=next;while(this.past.length>20||this.past.length>1&&editEntityBytes([...this.entities,...this.past.flat()])>256*1024*1024)this.past.shift();this.clearSelection();if(!next.some(e=>e.id===this.active))this.active=next[0]?.id??null;}
  add(cloud,name,{recipe=null,color=null}={}){if(this.entities.length>=200)throw Error("最多 200 个对象 / At most 200 objects");editCloudCheck(cloud);const entity={id:this.next++,name:String(name).slice(0,160),visible:true,cloud,deleted:null,recipe,frozen:!recipe,color};this.commit([...this.entities,entity]);this.active=entity.id;return entity;}
  update(id,patch){this.commit(this.entities.map(e=>e.id===id?{...e,...patch}:e));}
  remove(id){this.commit(this.entities.filter(e=>e.id!==id));}
  undo(){if(!this.past.length)return false;this.future.push(this.entities);this.entities=this.past.pop();this.clearSelection();if(!this.entities.some(e=>e.id===this.active))this.active=this.entities[0]?.id??null;return true;}
  redo(){if(!this.future.length)return false;this.past.push(this.entities);this.entities=this.future.pop();this.clearSelection();if(!this.entities.some(e=>e.id===this.active))this.active=this.entities[0]?.id??null;return true;}
  clearSelection(){this.selection.clear();this.selectionStamp++;}
  selectedCount(){if(this.countCache?.entities===this.entities&&this.countCache.stamp===this.selectionStamp)return this.countCache.n;let n=0;for(const e of this.entities){if(!e.visible)continue;const mask=this.selection.get(e.id);if(mask)for(let i=0;i<mask.length;i++)if(mask[i]&&!e.deleted?.[i])n++;}this.countCache={entities:this.entities,stamp:this.selectionStamp,n};return n;}
  setSelection(hits,mode='replace'){this.selectionStamp++;if(mode==='replace')this.clearSelection();for(const[id,hit]of hits){const entity=this.entities.find(e=>e.id===id&&e.visible);if(!entity)continue;const mask=mode==='replace'?new Uint8Array(entity.cloud.count):(this.selection.get(id)||new Uint8Array(entity.cloud.count)).slice();for(let i=0;i<mask.length;i++)if(hit[i]&&!entity.deleted?.[i])mask[i]=mode==='subtract'?0:1;this.selection.set(id,mask);}}
  selectAll(all=false,invert=false){const hits=new Map();for(const e of this.scope(all)){const old=this.selection.get(e.id),mask=new Uint8Array(e.cloud.count);for(let i=0;i<mask.length;i++)mask[i]=!e.deleted?.[i]&&(!invert||!old?.[i])?1:0;hits.set(e.id,mask);}this.setSelection(hits);}
  deleteSelected({keep=false,all=false}={}){if(!this.selectedCount())return false;const ids=new Set(this.scope(all).map(e=>e.id));const next=this.entities.map(e=>{if(!ids.has(e.id))return e;const selected=this.selection.get(e.id),deleted=e.deleted?e.deleted.slice():new Uint8Array(e.cloud.count);let changed=false;for(let i=0;i<deleted.length;i++)if(!deleted[i]&&(keep?!selected?.[i]:selected?.[i])){deleted[i]=1;changed=true;}return changed?{...e,deleted,frozen:true}:e;});if(next.every((e,i)=>e===this.entities[i]))return false;this.commit(next);return true;}
  restore(id){const e=this.entities.find(e=>e.id===id);if(e?.deleted)this.update(id,{deleted:null});}
  extract(){const sources=this.entities.filter(e=>e.visible&&this.selection.get(e.id)?.some((v,i)=>v&&!e.deleted?.[i]));if(this.entities.length+sources.length>200)throw Error("最多 200 个对象 / At most 200 objects");const additions=[];for(const e of this.entities){if(!e.visible)continue;const indices=editIndices(e,this.selection.get(e.id),true);if(indices.length)additions.push({id:this.next++,name:`${e.name} · selection`,visible:true,cloud:editSubset(e.cloud,indices),deleted:null,recipe:null,frozen:true,color:e.color});}if(additions.length){this.commit([...this.entities,...additions]);this.active=additions[0].id;}return additions.length;}
  colorSelected(rgb){
    const next=this.entities.map(e=>{
      const mask=this.selection.get(e.id);if(!e.visible||!mask?.some(Boolean))return e;
      const color=e.cloud.rgb?e.cloud.rgb.slice():new Float32Array(e.cloud.count*3).fill(.6),fields={...e.cloud.fields};
      const keys=e.cloud.processing?.paintKeys||['red','green','blue'].map(role=>{let key=`editor_${role}`;while(Object.hasOwn(fields,key))key+='1';return key;});
      for(let i=0;i<mask.length;i++)if(mask[i]&&!e.deleted?.[i])color.set(rgb,i*3);
      for(let k=0;k<3;k++)fields[keys[k]]=Float64Array.from({length:e.cloud.count},(_,i)=>color[i*3+k]);
      const semantics=defaultPointSettings({...e.cloud,fields});
      for(const key of Object.keys(semantics.tags))if(['red','green','blue'].includes(semantics.tags[key]))semantics.tags[key]='scalar';
      keys.forEach((key,i)=>semantics.tags[key]=['red','green','blue'][i]);semantics.rgbScale='1';semantics.colorSpace='rgb';
      const cloud={...e.cloud,rgb:color,fields,semantics,columnOrder:semantics.order,processing:{...e.cloud.processing,paintKeys:keys}};
      return {...e,cloud,frozen:true};
    });this.commit(next);
  }
  replace(entities){this.commit(entities);this.next=Math.max(this.next,...entities.map(e=>e.id+1));}
}
