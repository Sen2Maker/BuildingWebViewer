import { genCheck } from './sample.js';
/** Recipes store geometry and sampling only, never generated point buffers. */
export function genValidateProject(value) {
  if(value?.format!=='BuildingWebViewer.drawing'||value.version!==1||!Array.isArray(value.parts)||value.parts.length>200)throw Error('不是有效的绘制项目 / Invalid drawing project');
  const ids=new Set();const parts=value.parts.map(p=>{genCheck(p);if(!Number.isSafeInteger(p.id)||p.id>=Number.MAX_SAFE_INTEGER)throw Error('Invalid part ID');if(ids.has(p.id))throw Error('重复部件编号 / Duplicate part ID');ids.add(p.id);
    if(typeof p.name!=='string'||p.name.length>160||typeof p.visible!=='boolean'||!Array.isArray(p.color)||p.color.length!==3||!p.color.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('部件信息无效 / Invalid part metadata');
    return JSON.parse(JSON.stringify(p));
  });return {format:value.format,version:1,parts};
}
export function genRecipe(parts){return genValidateProject({format:'BuildingWebViewer.drawing',version:1,parts});}
export function genHistory(limit=30,byteLimit=10000000){
  const past=[],future=[];let last=null;
  const trim=()=>{let bytes=past.reduce((sum,s)=>sum+s.length*2,0);while(past.length>limit||bytes>byteLimit&&past.length>1)bytes-=past.shift().length*2;};
  return {record(parts){const next=JSON.stringify(parts);if(next===last)return;if(last!==null)past.push(last);last=next;future.length=0;trim();},undo(){if(!past.length)return null;future.push(last);last=past.pop();return JSON.parse(last);},redo(){if(!future.length)return null;past.push(last);last=future.pop();trim();return JSON.parse(last);},get undoable(){return !!past.length;},get redoable(){return !!future.length;}};
}
