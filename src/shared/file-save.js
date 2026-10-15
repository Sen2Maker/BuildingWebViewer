import { mobileShareBlob } from './mobile-project.js';
/** One download/share path for browser and native WebView. Resolve DOM/URL in the caller's document. */
export async function saveLocalBlob(blob,name,{document:doc=globalThis.document,window:host=doc?.defaultView||globalThis}={}){
  if(await mobileShareBlob(blob,name))return;
  const urls=host.URL||globalThis.URL,url=urls.createObjectURL(blob),link=doc.createElement('a');
  try{link.href=url;link.download=name;link.click();}
  catch(error){urls.revokeObjectURL(url);throw error;}
  (host.setTimeout?.bind(host)||globalThis.setTimeout)(()=>urls.revokeObjectURL(url),60000);
}
