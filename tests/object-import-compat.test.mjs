import test from 'node:test';
import assert from 'node:assert/strict';
import {ViewerProject} from '../src/shared/project-model.js';
import {appendLodFiles,appendWireFiles,appendLegacyLodFiles,appendLegacyWireFiles,objectFileSource} from '../src/shared/project-import.js';
import {migrateObjectImportState} from '../src/shared/object-import-state.js';
import {snapshotProjectTree,restoreProjectTree} from '../src/shared/mobile-project.js';
import {resolveObjectFile,objectFilePreference,adjacentObjectEntry,objectNavigationDirection} from '../src/shared/object-selection.js';
const file=(path,size=20)=>({name:path.split('/').at(-1),webkitRelativePath:path,size,lastModified:1});
test('both adapters accept mixed flat ID files and ID folders without combining independent IDs',()=>{
 const files=['dataset/101.obj','dataset/101.xyz','dataset/102/raw.obj','dataset/102/refined.obj','dataset/102/pc.xyz','dataset/phase/103.obj','dataset/house_A/model.obj'].map(p=>file(p));
 for(const append of [appendLodFiles,appendWireFiles]){
  const entries=[],project=new ViewerProject();append(entries,project,files);assert.deepEqual(entries.map(e=>e.id),['101','102','103','house_A']);
  assert.equal(entries[1].wires.length,2);assert.equal(project.path(entries[0].group),'dataset');assert.equal(project.path(entries[1].group),'dataset');assert.equal(project.path(entries[2].group),'dataset/phase');
  if(append===appendWireFiles){assert.equal(entries[0].clouds.length,1);assert.equal(entries[1].clouds.length,1);}
  const moved=project.create('Review');project.move(entries[1],moved);const original=entries[1];assert.equal(append(entries,project,[...files,file('dataset/102/final.obj')]).added,1);assert.equal(entries[1],original);assert.equal(original.group,moved);
 }
});
test('loose files, matching point clouds, duplicate IDs, leading zeros and explicit paths remain distinct',()=>{
 const entries=[],project=new ViewerProject();appendWireFiles(entries,project,['001.obj','001.xyz','002.obj'].map(p=>file(p)));assert.deepEqual(entries.map(e=>e.id),['001','002']);assert.equal(entries[0].clouds.length,1);
 appendWireFiles(entries,project,[file('other/001.obj')]);assert.equal(entries.at(-1).id,'001_2');
 const f=file('mesh.obj'),paths=new Map([[f,'dataset/007/mesh.obj']]);assert.equal(objectFileSource(f,paths).base,'007');
 const entry=[],meshProject=new ViewerProject();appendLodFiles(entry,meshProject,[file('101/raw.obj')]);assert.equal(entry[0].id,'101');
});
test('OBJ variant matching and navigation are shared across mesh and wire tools',()=>{
 const raw=file('101/raw.obj'),refined=file('101/refined.obj'),nextRaw=file('102/raw.obj'),nextRefined=file('102/refined.obj');
 const preference=objectFilePreference([raw,refined],'1');assert.equal(resolveObjectFile([nextRefined,nextRaw],preference),nextRefined);assert.equal(resolveObjectFile([nextRaw],preference),nextRaw);
 const entries=[{id:'10'},{id:'2'},{id:'1'}];assert.equal(adjacentObjectEntry(entries,entries[2],1).id,'2');assert.equal(adjacentObjectEntry(entries,entries[0],1),entries[0]);
 assert.equal(objectNavigationDirection({key:'ArrowRight'}),1);assert.equal(objectNavigationDirection({key:'ArrowRight'},{flying:true}),0);assert.equal(objectNavigationDirection({key:'['},{multiple:true}),0);
});
test('legacy mesh selection, virtual moves, renames and removed variants migrate by source identity',()=>{
 const files=['dataset/101/raw.obj','dataset/101/refined.obj','dataset/102/raw.obj'].map(p=>file(p)),records=files.map(f=>({file:f,path:f.webkitRelativePath}));
 const legacy=[],oldProject=new ViewerProject();appendLegacyLodFiles(legacy,oldProject,files);const review=oldProject.create('Review');oldProject.move(legacy[1],review);legacy[1].treeName='My refined model';
 const tree={...snapshotProjectTree(oldProject,legacy),knownIds:legacy.map(e=>e.id)};tree.items=tree.items.filter(item=>item.id!==legacy[0].id);
 const old={tree,selected:[legacy[1].id]},entries=[],project=new ViewerProject();appendLodFiles(entries,project,files);
 const state=migrateObjectImportState(old,records,entries,'mesh');assert.deepEqual(state.selected,['101']);assert.equal(state.meshPreference.name,'refined.obj');assert.equal(old.tree.items.length,2);
 const restored=restoreProjectTree(project,entries,state.tree);assert.equal(restored[0].treeName,'My refined model');assert.equal(project.path(restored[0].group),'Review');assert(restored[0].excludedFileKeys.includes(restored[0].sourceKeys.get(files[0])));
 const saved=JSON.parse(JSON.stringify(snapshotProjectTree(project,restored)));assert(saved.items[0].excludedFileKeys.length);assert.equal(migrateObjectImportState(state,records,restored,'mesh'),state);
});
test('legacy flat wire batches split into ID objects and preserve selected and removed states',()=>{
 const files=['dataset/101.obj','dataset/102.obj'].map(p=>file(p)),records=files.map(f=>({file:f,path:f.webkitRelativePath}));
 const oldEntries=[],oldProject=new ViewerProject();appendLegacyWireFiles(oldEntries,oldProject,files);assert.equal(oldEntries.length,1);
 const tree={...snapshotProjectTree(oldProject,oldEntries),knownIds:oldEntries.map(e=>e.id)},entries=[],project=new ViewerProject();appendWireFiles(entries,project,files);
 const state=migrateObjectImportState({tree,selected:[oldEntries[0].id],active:oldEntries[0].id,wireMode:'single'},records,entries,'wire');assert.deepEqual(state.selected,['101','102']);assert.equal(state.wireMode,'multiple');assert.equal(restoreProjectTree(project,entries,state.tree).length,2);
 const removed=migrateObjectImportState({tree:{...tree,items:[]},selected:[]},records,entries,'wire');assert.equal(restoreProjectTree(project,entries,removed.tree).length,0);
});
