import { t } from './i18n.js';
/** Bounded local ZIP reader. File slices avoid retaining a second complete archive buffer. */
export function safeArchivePath(name) {
  const path=String(name).replaceAll('\\','/');
  if(!path || path.startsWith('/') || /^[a-z]:/i.test(path) || path.split('/').some(part=>part==='..'||part==='.') || /[\x00-\x1f]/.test(path))throw Error(t('压缩包包含不安全的文件路径。'));
  return path;
}
export function zipCRC32(bytes,previous=0) {
  let crc=(previous^0xffffffff)>>>0;
  for(const byte of bytes){crc^=byte;for(let b=0;b<8;b++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
export async function readZipDirectory(file,{maxEntries=10000,maxBytes=512*1024*1024}={}) {
  const tailStart=Math.max(0,file.size-65557),tail=new Uint8Array(await file.slice(tailStart).arrayBuffer()),dv=new DataView(tail.buffer);
  let end=-1;
  for(let i=tail.length-22;i>=0;i--)if(dv.getUint32(i,true)===0x06054b50 && i+22+dv.getUint16(i+20,true)===tail.length){end=i;break;}
  if(end<0)throw Error(t('无法读取 ZIP 目录，文件可能损坏。'));
  const count=dv.getUint16(end+10,true),size=dv.getUint32(end+12,true),offset=dv.getUint32(end+16,true);
  if(dv.getUint16(end+4,true)||dv.getUint16(end+6,true)||count!==dv.getUint16(end+8,true)||count===65535||size===0xffffffff||offset===0xffffffff)throw Error(t('暂不支持分卷或 ZIP64 压缩包。'));
  if(count>maxEntries || size>8*1024*1024 || offset+size>tailStart+end)throw Error(t('压缩包目录过大或无效。'));
  const bytes=new Uint8Array(await file.slice(offset,offset+size).arrayBuffer()),view=new DataView(bytes.buffer),entries=[],seen=new Set();let at=0,total=0;
  for(let i=0;i<count;i++){
    if(at+46>size||view.getUint32(at,true)!==0x02014b50)throw Error(t('压缩包目录无效。'));
    const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),crc=view.getUint32(at+16,true),compressed=view.getUint32(at+20,true),length=view.getUint32(at+24,true);
    const nameSize=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),local=view.getUint32(at+42,true);
    if(at+46+nameSize+extra+comment>size || local+30>offset || view.getUint16(at+34,true))throw Error(t('压缩包目录无效。'));
    const rawName=bytes.subarray(at+46,at+46+nameSize);
    // UTF-8 names are standard. Older non-UTF ZIPs remain best effort via GB18030.
    let name;try{name=new TextDecoder('utf-8',{fatal:true}).decode(rawName);}catch{ name=new TextDecoder('gb18030').decode(rawName); }
    const path=safeArchivePath(name);
    if(seen.has(path))throw Error(t('压缩包包含重复路径。'));seen.add(path);
    if(length===0xffffffff||compressed===0xffffffff||(total+=length)>maxBytes)throw Error(t('压缩包解压后超过 512 MB，请先解压后选择所需文件。'));
    entries.push({path,flags,method,crc,compressed,length,local,directory:offset});at+=46+nameSize+extra+comment;
  }
  return entries;
}
async function extractZipEntry(archive,entry) {
  if(entry.flags&1)throw Error(t('暂不支持加密压缩包，请先解压。'));
  if(![0,8].includes(entry.method))throw Error(t('仅支持 ZIP 的 Store / Deflate 压缩方式。'));
  const header=new DataView(await archive.slice(entry.local,entry.local+30).arrayBuffer());
  if(header.getUint32(0,true)!==0x04034b50 || header.getUint16(8,true)!==entry.method || header.getUint16(6,true)!==entry.flags)throw Error(t('压缩包文件头无效。'));
  const start=entry.local+30+header.getUint16(26,true)+header.getUint16(28,true);
  if(start+entry.compressed>entry.directory)throw Error(t('压缩包文件范围无效。'));
  let stream=archive.slice(start,start+entry.compressed).stream();
  if(entry.method===8){
    let decoder;try{decoder=new DecompressionStream('deflate-raw');}catch{throw Error(t('当前浏览器不支持 ZIP 解压，请先在系统中解压。'));}
    stream=stream.pipeThrough(decoder);
  }
  const reader=stream.getReader(),chunks=[];let size=0,crc=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>entry.length)throw Error(t('解压大小与目录不符。'));crc=zipCRC32(value,crc);chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  if(size!==entry.length||crc!==entry.crc)throw Error(t('压缩包校验失败，文件可能损坏。'));
  return new File(chunks,entry.path.split('/').at(-1),{lastModified:archive.lastModified||0});
}
export async function expandProjectArchives(records,accepts,onProgress=()=>{}) {
  const result=[];let total=0;
  for(const record of records){
    if(!/\.zip$/i.test(record.file.name)){result.push(record);continue;}
    onProgress(t('正在读取压缩包…'));
    const entries=await readZipDirectory(record.file),base=safeArchivePath(record.path||record.file.name).replace(/\.zip$/i,'');
    for(const entry of entries){
      if(entry.path.endsWith('/')||!accepts(entry.path)||entry.path.startsWith('__MACOSX/'))continue;
      if((total+=entry.length)>512*1024*1024)throw Error(t('压缩包解压后超过 512 MB，请先解压后选择所需文件。'));
      onProgress(t('正在解压 {0}',[entry.path]));
      result.push({file:await extractZipEntry(record.file,entry),path:base+'/'+entry.path});
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  return result;
}
/** Serializes import batches; failures never insert a partially extracted archive. */
export function archiveImportQueue({accepts,receive,onProgress=()=>{},onError=()=>{}}) {
  let pending=Promise.resolve();
  return records=>{
    const job=pending.then(async()=>{const expanded=await expandProjectArchives(records,accepts,onProgress);const result=await receive(expanded);onProgress(t('导入完成'));return result;});
    pending=job.catch(()=>{});return job.catch(error=>{onError(error.message);throw error;});
  };
}
