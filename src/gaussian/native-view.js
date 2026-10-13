import { mobileProjects, isMobileApp } from '../shared/mobile-project.js';
/** Only project IDs/keys cross the bridge; native code revalidates membership. */
export function nativeGaussianRequest(entries,lang='zh'){
 if(!entries.length)throw Error(lang==='en'?'Select Gaussian files first':'请先勾选高斯文件');
 const id=entries[0].file?.projectId;
 if(!id||entries.some(e=>e.file?.projectId!==id||!e.file?.nativeKey))throw Error('Native viewer requires local project files');
 return {id,keys:entries.map(e=>e.file.nativeKey),lang};
}
export async function mountNativeGaussian({container,getEntries,onModeChange}){
 if(!isMobileApp())return null;const api=mobileProjects();let info;try{info=await api.runtimeInfo();}catch{return null;}if(!info.nativeGaussian)return null;
 const en=document.documentElement.lang==='en',word=(zh,e)=>en?e:zh;
 const box=document.createElement('div'),label=document.createElement('label'),mode=document.createElement('input'),open=document.createElement('button'),note=document.createElement('p');
 box.className='native-gaussian-entry';mode.type='checkbox';mode.id='gs-native-readonly';mode.checked=localStorage.getItem('bwv-native-gaussian')!=='compatibility';mode.setAttribute('aria-label',word('App 原生只读查看','App native read-only viewer'));label.append(mode,document.createTextNode(word('App 原生只读查看','App native read-only viewer')));
 open.type='button';open.id='gs-open-native';open.textContent=word('打开原生全量画面','Open native full-resolution view');note.className='presentation-help';note.textContent=word('勾选文件后打开。原生端负责全量渲染、相机和截屏，文件留在本机；原生画面显示原始数据，不应用旧的编辑隐藏记录；关闭此选项使用 App 内的兼容查看。','Select files and open. Native rendering, camera and capture retain all splats locally. Native view shows source data without previous edit masks; disable for the in-App compatibility viewer.');
 mode.onchange=()=>{localStorage.setItem('bwv-native-gaussian',mode.checked?'native':'compatibility');onModeChange();};open.onclick=async()=>{open.disabled=true;try{const request=nativeGaussianRequest(getEntries(),en?'en':'zh');const reply=await api.openNativeGaussian(request);if(reply?.compatibility){mode.checked=false;localStorage.setItem('bwv-native-gaussian','compatibility');onModeChange();}}catch(e){note.textContent=e.message;}finally{open.disabled=false;}};
 box.append(label,open,note);container.prepend(box);return {get enabled(){return mode.checked;},setEnabled(v){mode.checked=v;},refresh(){open.disabled=!getEntries().length;}};
}
