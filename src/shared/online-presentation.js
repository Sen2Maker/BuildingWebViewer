import {validateSharedPointSettings} from './online-point-settings.js';
import {normalizePaletteOptions} from './palettes.js';
import {validateCameraSnapshot} from './camera-controls.js';

const choices={
 'mesh-compare-count':['1','2','3'],'mesh-layers-1':['both','mesh','cloud'],'mesh-layers-2':['both','mesh','cloud'],'mesh-layers-3':['both','mesh','cloud'],
 'display-mode':['solid','solid-wire','wire'],'scale-mode':['real','normalized'],'color-mode':['surface','height','building','solid','rgb','file','custom-rgb'],
 'mesh-point-color-mode':['height','solid','rgb'],'mesh-point-style':['disc','square','sphere'],'point-style':['disc','square','sphere'],
 'palette':['current','viridis','inferno','grayscale','blue-white-red']};
const booleans=['show-points','show-wire','show-grid','show-edges','show-labels','mesh-sync-camera','reverse'];
const numbers={'mesh-point-size':[1,16,.5],'point-size':[1,32,.5],'mesh-point-opacity':[.1,1,.05],'point-opacity':[.1,1,.05]};
const colors=['mesh-point-color','point-color','wire-color'];
export const presentationSelectors={...Object.fromEntries([...Object.keys(choices),...booleans,...Object.keys(numbers),...colors].map(id=>[id,'#'+id])),palette:'.palette-panel select',reverse:'.palette-reverse'};
function object(value){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Invalid view settings');}
export function validatePresentation(value){
 object(value);if(Object.keys(value).some(k=>!['version','controls','camera','pointSettings','palette'].includes(k))||value.version!==1)throw Error('Unsupported view settings');object(value.controls);
 const controls={};
 for(const [key,raw] of Object.entries(value.controls)){
  let valid=false;
  if(choices[key])valid=choices[key].includes(raw)||(key==='color-mode'||key==='mesh-point-color-mode')&&typeof raw==='string'&&/^field:[^\u0000-\u001f]{1,120}$/.test(raw);
  if(booleans.includes(key))valid=typeof raw==='boolean';
  if(numbers[key]){const [min,max,step]=numbers[key];valid=typeof raw==='number'&&Number.isFinite(raw)&&raw>=min&&raw<=max&&Math.abs((raw-min)/step-Math.round((raw-min)/step))<1e-6;}
  if(colors.includes(key))valid=typeof raw==='string'&&/^#[a-f0-9]{6}$/i.test(raw);
  if(!valid)throw Error('Invalid view option: '+key);controls[key]=raw;
 }
 const clean={version:1,controls};if(value.pointSettings)clean.pointSettings=validateSharedPointSettings(value.pointSettings);if(value.palette)clean.palette=normalizePaletteOptions(value.palette);if(value.camera)clean.camera=validateCameraSnapshot(value.camera,{checkScene:false});return clean;
}
export function capturePresentation(captureCamera=()=>null,root=document){
 const controls={};for(const [key,selector] of Object.entries(presentationSelectors)){const input=root.querySelector(selector);if(!input||input.disabled)continue;const value=booleans.includes(key)?input.checked:numbers[key]?Number(input.value):input.value;
  try{validatePresentation({version:1,controls:{[key]:value}});controls[key]=value;}catch{/* Unsupported local-only fields are not serialized. */}}
 const camera=captureCamera();return validatePresentation({version:1,controls,...(camera?{camera}:{})});
}
export function applyPresentationControls(value,{root=document,exclude=[]}={}){
 const clean=validatePresentation(value);for(const [key,raw]of Object.entries(clean.controls)){if(exclude.includes(key))continue;const input=root.querySelector(presentationSelectors[key]);if(!input||input.disabled)continue;if(input.tagName==='SELECT'&&input.options&&![...input.options].some(o=>o.value===String(raw)))throw Error('当前数据不支持分享的字段或选项 / Unavailable shared field: '+raw);if(booleans.includes(key))input.checked=raw;else input.value=String(raw);input.dispatchEvent(new Event(input.type==='range'?'input':'change',{bubbles:true}));}return clean;
}
/** Stable report preset uses the same viewer and shared-settings validation. Camera fits each building. */
export const REPORT_PRESENTATION={version:1,controls:{'mesh-compare-count':'2','mesh-layers-1':'cloud','mesh-layers-2':'mesh','display-mode':'solid','scale-mode':'real','color-mode':'surface','mesh-point-color-mode':'height','mesh-point-size':3,'mesh-point-opacity':1,'mesh-point-style':'disc','mesh-sync-camera':true,'show-edges':true,'show-labels':false,'show-grid':false,palette:'viridis',reverse:false},palette:{palette:'viridis',reverse:false,range:null}};
export function readPresentation(hash=location.hash,search=globalThis.location?.search||''){
 if(hash.length>16384)throw Error('分享链接过长 / Share link exceeds 16 KiB');
 const value=new URLSearchParams(hash.slice(1)).get('view');if(value)return validatePresentation(JSON.parse(value));
 const preset=new URLSearchParams(search).get('presentation');if(preset==='report-v1')return validatePresentation(REPORT_PRESENTATION);
 if(preset)throw Error('未知展示预设 / Unknown presentation preset');return null;
}
export function withPresentation(link,value){const url=new URL(link),params=new URLSearchParams(url.hash.slice(1));params.set('view',JSON.stringify(validatePresentation(value)));url.hash=params.toString();if(url.hash.length>16384)throw Error('配置过长，请减少展示 ID 或相机信息 / Share link exceeds 16 KiB');return url.href;}
