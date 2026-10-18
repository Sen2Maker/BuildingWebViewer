import { ViewerProject } from './project-model.js';
import { appendLegacyLodFiles, appendLegacyWireFiles } from './project-import.js';
/** Convert saved virtual tree/selection metadata using exact File identities, never ID guesses. */
export function migrateObjectImportState(state,records,entries,kind='mesh') {
  if(!state||state.objectImportVersion===2)return state;
  const legacy=[],project=new ViewerProject(),paths=new Map(records.map(record=>[record.file,record.path]));
  (kind==='mesh'?appendLegacyLodFiles:appendLegacyWireFiles)(legacy,project,records.map(record=>record.file),paths);
  const files=entry=>entry.files?.length?entry.files:entry.file?[entry.file]:[...(entry.wires||[]),...(entry.clouds||[])];
  const byFile=new Map();for(const entry of entries)for(const file of files(entry)){if(!byFile.has(file))byFile.set(file,new Set());byFile.get(file).add(entry);}
  const mapping=new Map(),related=new Map();
  for(const old of legacy){const next=new Set(files(old).flatMap(file=>[...(byFile.get(file)||[])]));mapping.set(old.id,[...next].map(entry=>entry.id));for(const entry of next){if(!related.has(entry))related.set(entry,[]);related.get(entry).push(old);}}
  const ids=values=>[...new Set((values||[]).flatMap(id=>mapping.get(id)||[id]))];
  const migrated={...state,objectImportVersion:2,selected:ids(state.selected),active:ids([state.active]).filter(Boolean).at(-1)};
  if(kind==='wire'&&migrated.selected.length>1)migrated.wireMode='multiple';
  if(kind==='mesh'&&!migrated.meshPreference){const last=legacy.find(entry=>entry.id===(state.selected||[]).at(-1));if(last?.file)migrated.meshPreference={name:last.file.name,index:0};}
  if(state.tree?.items){
    const savedGroups=new Map((state.tree.groups||[]).map(group=>[group.id,group]));
    const savedPath=id=>{const parts=[],seen=new Set();for(let group=savedGroups.get(id);group&&!seen.has(group.id);group=savedGroups.get(group.parent)){seen.add(group.id);parts.unshift(group.name);}return parts.join('/');};
    const groupByPath=new Map([...savedGroups.keys()].map(id=>[savedPath(id),id]));
    const saved=new Map(state.tree.items.map(item=>[item.id,item])),known=new Set(state.tree.knownIds||[]),items=[];
    for(const entry of entries){
      const old=related.get(entry)||[],kept=old.filter(item=>saved.has(item.id));if(!kept.length)continue;
      const previous=saved.get(kept[0].id),renamed=previous.treeName!==kept[0].treeName;
      const parentPath=entry.sourceGroup.split('/').slice(0,-1).join('/');
      const originalPath=project.path(kept[0].group),moved=savedPath(previous.group)!==originalPath;
      const group=moved?previous.group:groupByPath.get(parentPath)||'';
      const excludedFileKeys=kind==='mesh'?old.filter(item=>known.has(item.id)&&!saved.has(item.id)).map(item=>entry.sourceKeys?.get(item.file)).filter(Boolean):[];
      if(excludedFileKeys.length)entry.excludedFileKeys=excludedFileKeys;
      items.push({...previous,id:entry.id,group,treeName:renamed?previous.treeName:entry.treeName,...(excludedFileKeys.length?{excludedFileKeys}:{} )});
    }
    migrated.tree={...state.tree,items,knownIds:ids([...known])};
  }
  return migrated;
}
