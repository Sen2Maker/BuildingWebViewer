import { mobileShareBlob } from './mobile-project.js';
/** One download/share path for browser and native WebView (which cannot download blob URLs). */
export async function saveLocalBlob(blob,name){
  if(await mobileShareBlob(blob,name))return;
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
