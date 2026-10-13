import { mobileProjects, isMobileApp } from '../shared/mobile-project.js';
/** Only project IDs/keys cross the bridge; native code revalidates membership. */
export function nativeGaussianRequest(entries,lang='zh'){
 if(!entries.length)throw Error(lang==='en'?'Select Gaussian files first':'请先勾选高斯文件');
 const id=entries[0].file?.projectId;
 if(!id||entries.some(e=>e.file?.projectId!==id||!e.file?.nativeKey))throw Error('Native viewer requires local project files');
 return {id,keys:entries.map(e=>e.file.nativeKey),lang};
}
export async function openNativeGaussianPage(){
 if(!isMobileApp())return false;
 const api=mobileProjects(),info=await api.runtimeInfo();
 if(!info.nativeGaussianWorkspace)return false;
 const id=new URL(location.href).searchParams.get('project');
 if(!id){location.replace('assets/mobile/index.html');return true;}
 await api.openNativeGaussian({id,keys:[],lang:document.documentElement.lang==='en'?'en':'zh'});
 location.replace('assets/mobile/index.html?lang='+document.documentElement.lang);return true;
}
