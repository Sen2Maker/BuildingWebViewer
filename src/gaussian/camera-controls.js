import { mountCameraControls, captureCameraSnapshot, parseCameraBookmarks, serializeCameraBookmarks } from '../shared/camera-controls.js';
import { mountFlyCameraControls } from '../shared/fly-controls.js';
import { mountCameraNavigationControls } from '../shared/camera-navigation-controls.js';
import { gsViewSpec } from '../shared/camera-geometry.js';
import { setViewerProjection } from '../shared/viewer-projection.js';
import { saveLocalBlob } from '../shared/file-save.js';

export const LEGACY_GAUSSIAN_BOOKMARK_KEY='BuildingWebViewer.gaussian.camera.v1';
export const GAUSSIAN_MIGRATION_KEY='BuildingWebViewer.gaussian.camera.migrated.v1';
const SHARED_BOOKMARK_KEY='BuildingWebViewer.camera-bookmarks.v1.raw-world';
const mounted=new WeakMap();
/** Convert the saved local origin and calibrated pose into the common world-coordinate format. */
export function legacyGaussianBookmark(record,index=0,canvas=null) {
  if(!record||typeof record!=='object')throw Error('Invalid Gaussian bookmark');
  const snapshot=captureCameraSnapshot({...record,canvas:canvas||{clientWidth:record.trainingPose?.width||640,clientHeight:record.trainingPose?.height||480}}, {space:'raw-world'});
  const source=JSON.stringify(record);let hash=2166136261;for(let i=0;i<source.length;i++)hash=Math.imul(hash^source.charCodeAt(i),16777619)>>>0;
  return {id:`gaussian-legacy-${index}-${hash.toString(16)}`,name:(typeof record.name==='string'&&record.name.trim()?record.name.trim():`Gaussian ${index+1}`).slice(0,80),snapshot};
}
/** Keep the original key as a backup. A receipt prevents deleted migrated views from reappearing. */
export function migrateGaussianBookmarks(storage,canvas=null) {
  const result={records:[],migrated:0,remaining:0,invalid:0,error:null};
  try {
    const raw=JSON.parse(storage?.getItem(LEGACY_GAUSSIAN_BOOKMARK_KEY)||'[]');
    if(!Array.isArray(raw)||raw.length>50)throw Error('Invalid legacy Gaussian bookmarks');
    raw.forEach((record,index)=>{try{result.records.push(legacyGaussianBookmark(record,index,canvas));}catch{result.invalid++;}});
    if(!result.records.length)return result;
    const text=storage?.getItem(SHARED_BOOKMARK_KEY),saved=text?parseCameraBookmarks(text,'raw-world'):{preserveView:true,bookmarks:[]};
    const receipt=JSON.parse(storage?.getItem(GAUSSIAN_MIGRATION_KEY)||'[]');
    const known=new Set(Array.isArray(receipt)?receipt.filter(value=>typeof value==='string'):[]),ids=new Set(saved.bookmarks.map(record=>record.id));
    for(const record of result.records){
      if(known.has(record.id))continue;
      if(ids.has(record.id)){known.add(record.id);continue;}
      if(saved.bookmarks.length>=100){result.remaining++;continue;}
      let name=record.name,suffix=2;while(saved.bookmarks.some(value=>value.name===name)){const end=` (${suffix++})`;name=record.name.slice(0,80-end.length)+end;}
      saved.bookmarks.push({...record,name});ids.add(record.id);known.add(record.id);result.migrated++;
    }
    if(!storage?.setItem)throw Error('Browser storage unavailable');
    if(result.migrated)storage.setItem(SHARED_BOOKMARK_KEY,serializeCameraBookmarks(saved.bookmarks,'raw-world',saved.preserveView));
    storage.setItem(GAUSSIAN_MIGRATION_KEY,JSON.stringify([...known]));
  } catch(error) {result.error=error;}
  return result;
}

/** Compose shared camera, bookmarks and navigation with only Gaussian-specific lens controls. */
export function mountGaussianCameraControls({viewer,root=document,onError=()=>{}}) {
  const cameraPanel=root.getElementById('camera-controls'),bookPanel=root.getElementById('bookmark-controls');
  if(!cameraPanel||!bookPanel)return null;
  if(mounted.has(cameraPanel))return mounted.get(cameraPanel);
  const en=root.documentElement.lang==='en',text=(zh,english)=>en?english:zh;
  const make=(tag,label,cls)=>{const node=root.createElement(tag);if(label)node.textContent=label;if(cls)node.className=cls;return node;};
  const sharedCamera=make('div',null,'gaussian-shared-camera'),sharedBookmarks=make('div',null,'gaussian-shared-bookmarks');
  cameraPanel.append(sharedCamera);bookPanel.append(sharedBookmarks);
  let storage;try{storage=root.defaultView?.localStorage||globalThis.localStorage;}catch{}
  const migration=migrateGaussianBookmarks(storage,viewer.canvas);
  const shared=mountCameraControls({container:sharedCamera,bookmarkContainer:sharedBookmarks,getViewers:()=>[viewer],space:'raw-world'});
  mountFlyCameraControls(viewer,cameraPanel);mountCameraNavigationControls(cameraPanel,viewer);
  const lensPanel=make('section',null,'inspector-section gaussian-lens-controls');lensPanel.append(make('h3',text('镜头与投影','Lens and projection')));cameraPanel.append(lensPanel);
  const projectionLabel=make('label',text('投影模式','Projection')),projection=make('select');projection.setAttribute('aria-label',text('投影模式','Projection'));
  for(const[value,zh,english]of [['perspective','透视','Perspective'],['orthographic','正交','Orthographic']]){const option=make('option',text(zh,english));option.value=value;projection.append(option);}
  projection.value=viewer.projection;projection.onchange=()=>{try{setViewerProjection([viewer],projection.value);}catch(error){projection.value=viewer.projection;onError(error.message);}};projectionLabel.append(projection);lensPanel.append(projectionLabel);
  const fovLabel=make('label',text('视野角（°）','Field of view (°)'),'gs-camera-field'),range=make('input'),number=make('input');range.type='range';number.type='number';
  for(const input of [range,number]){input.min=10;input.max=120;input.step=1;input.value=viewer.fov;input.setAttribute('aria-label',text('视野角','Field of view')+(input===range?' slider':' number'));}
  const changeFov=input=>{const value=Number(input.value);if(input.value===''||!Number.isFinite(value)||value<10||value>120)return;viewer.stopNavigation();viewer.leaveTraining();viewer.orbitLens=null;viewer.fov=value;range.value=number.value=value;viewer.requestRender();};
  range.oninput=()=>changeFov(range);number.onchange=()=>{changeFov(number);number.value=viewer.fov;};fovLabel.append(range,number);lensPanel.append(fovLabel);
  const nearLabel=make('label',text('近裁剪距离（坐标单位）','Near clip (coordinate units)'),'gs-camera-field'),near=make('input');near.type='number';near.min=.00001;near.step=.01;near.value=viewer.near;near.setAttribute('aria-label',text('近裁剪距离','Near clip'));
  near.onchange=()=>{const value=Number(near.value);if(near.value!==''&&Number.isFinite(value)&&value>=.00001){viewer.near=value;viewer.requestRender();}else near.value=viewer.near;};nearLabel.append(near);lensPanel.append(nearLabel);
  lensPanel.append(make('p',text('训练机位保留原始姿态和焦距。调整视野角时改用普通镜头；其他相机、书签与漫游设置在各工具间共用。','Training views retain their pose and calibrated lens. Changing field of view switches to an ordinary lens; camera, bookmark and navigation modules are shared across tools.'),'presentation-help'));
  const poseInfo=make('p',null,'presentation-help');lensPanel.append(poseInfo);
  const previous=viewer.onViewChange;let lastUpdate=-Infinity;
  viewer.onViewChange=(...args)=>{
    previous?.(...args);if(cameraPanel.closest('[hidden]')||performance.now()-lastUpdate<80)return;lastUpdate=performance.now();
    projection.value=viewer.projection;if(root.activeElement!==number)number.value=viewer.fov;if(root.activeElement!==range)range.value=viewer.fov;if(root.activeElement!==near)near.value=viewer.near;
    const width=viewer.canvas.clientWidth,height=viewer.canvas.clientHeight;if(width>0&&height>0){const spec=gsViewSpec(viewer,width,height);poseInfo.textContent='XYZ: '+spec.eye.map((v,i)=>(v+(viewer.origin?.[i]||0)).toFixed(3)).join(' / ');}
  };
  if(migration.records.length){
    const legacy=make('details',null,'gaussian-legacy-bookmarks');legacy.append(make('summary',text('旧版高斯书签备份','Legacy Gaussian bookmark backup')));
    legacy.append(make('p',text(migration.error||migration.remaining?'原书签仍保留，可直接加载或导出；浏览器存储可用后会继续合并到共享书签。':'旧书签已合并到共享书签，原始备份保留。','Original views remain available for loading and export. Shared bookmarks use world coordinates.'),'presentation-help'));
    const select=make('select');select.setAttribute('aria-label',text('旧版高斯书签','Legacy Gaussian bookmarks'));migration.records.forEach((record,index)=>{const option=make('option',record.name);option.value=String(index);select.append(option);});select.value='0';legacy.append(select);
    const load=make('button',text('加载旧书签','Load legacy view'));load.type='button';load.onclick=()=>{try{shared.restore(migration.records[Number(select.value)||0].snapshot,{checkScene:false});}catch(error){onError(error.message);}};
    const backup=make('button',text('导出旧书签 JSON','Export legacy JSON'));backup.type='button';backup.onclick=()=>saveLocalBlob(new Blob([serializeCameraBookmarks(migration.records,'raw-world')],{type:'application/json'}),'BWV-Gaussian-legacy-bookmarks.json').catch(error=>onError(error.message));legacy.append(load,backup);bookPanel.append(legacy);
  }
  const result=Object.assign(shared,{migration});mounted.set(cameraPanel,result);return result;
}
