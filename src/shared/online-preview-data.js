import { validateDescriptor, FILE_MAX_BYTES, XYZ_CHUNK_MAX_BYTES } from './online-preview-core.js';
import { fetchPreviewSource, requirePreviewSource } from './online-preview-source.js';
const aborted = signal => {if(signal?.aborted)throw new DOMException('Preview cancelled','AbortError');};
async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
async function verify(bytes,metadata,signal){
  aborted(signal);
  if(!(bytes instanceof Uint8Array))throw Error('Preview transport returned invalid bytes');
  if(metadata.bytes!==undefined&&bytes.length!==metadata.bytes)throw Error('Downloaded file size does not match index');
  if(metadata.sha256&&await sha256(bytes)!==metadata.sha256)throw Error('Downloaded file checksum does not match index');
  aborted(signal);
}
/** Transport chunks solve host file-size limits, not progressive rendering.
 * Every byte and digest is checked before the existing parser receives one file.
 * Aggregate allocation is bounded to64MiB; no nested manifests or parallel fetch.
 */
export async function fetchPreviewDataset(value,{signal,onProgress,fetchSource=fetchPreviewSource,timeoutMs=60000}={}){
  const descriptor=validateDescriptor(value);
  if(descriptor.manifest)throw Error('Resolve the selected manifest entry before downloading data');
  for(const source of descriptor.chunks||[{url:descriptor.url}])requirePreviewSource(source.url);
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw Error('Preview timeout must be between 1 and 120000 ms');
  const controller=new AbortController();let timedOut=false;
  const cancel=()=>controller.abort();
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs),active=controller.signal;
  try{
    aborted(active);
    if(!descriptor.chunks){
      const bytes=await fetchSource(descriptor.url,{signal:active,maxBytes:descriptor.format==='obj'?8*1024*1024:FILE_MAX_BYTES,onProgress,timeoutMs});
      await verify(bytes,descriptor,active);return bytes;
    }
    // Entire descriptor was validated before allocating or issuing the first request.
    const combined=new Uint8Array(descriptor.bytes);let offset=0;
    for(const [index,part] of descriptor.chunks.entries()){
      aborted(active);
      const bytes=await fetchSource(part.url,{signal:active,maxBytes:Math.min(XYZ_CHUNK_MAX_BYTES,part.bytes),timeoutMs,onProgress:progress=>onProgress?.({loaded:offset+progress.loaded,total:descriptor.bytes,chunk:index+1,chunks:descriptor.chunks.length})});
      await verify(bytes,part,active);
      try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('XYZ chunk is not valid complete UTF-8');}
      if(index<descriptor.chunks.length-1&&bytes.at(-1)!==10)throw Error('Non-final XYZ chunks must end at an LF line boundary');
      combined.set(bytes,offset);offset+=bytes.length;
      onProgress?.({loaded:offset,total:descriptor.bytes,chunk:index+1,chunks:descriptor.chunks.length});
      aborted(active);
    }
    await verify(combined,descriptor,active);return combined;
  }catch(error){if(timedOut){const failure=Error('Online dataset download timed out. / 在线数据下载超时。');failure.code='PREVIEW_TIMEOUT';throw failure;}throw error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
