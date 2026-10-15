/** Bounded ZIP/Store sink, append-only and compatible with directly written files. */
const zwTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
function zwCRC(data){let n=0xffffffff;for(const b of data)n=(n>>>8)^zwTable[(n^b)&255];return(n^0xffffffff)>>>0;}
export function createStoreZip({write,maxBytes=128*1024*1024}={}){
 const entries=[];let offset=0,closed=false;const encoder=new TextEncoder();
 const send=async bytes=>{if(offset+bytes.byteLength>Math.min(maxBytes,0xffffffff))throw Error('帧序列超过输出上限，请缩短时长或直接写入文件 / Frame sequence exceeds output limit');await write(bytes);offset+=bytes.byteLength;};
 return {async add(path,value){
  if(closed||entries.length>=65000||typeof path!=='string'||path.startsWith('/')||path.split('/').some(v=>!v||v==='..'||v==='.')||/[\x00-\x1f\\]/.test(path))throw Error('Invalid ZIP entry');
  const name=encoder.encode(path);if(name.length>65535||entries.some(e=>e.path===path))throw Error('Duplicate or long ZIP path');
  const data=value instanceof Uint8Array?value:new Uint8Array(await value.arrayBuffer()),crc=zwCRC(data),header=new Uint8Array(30+name.length),v=new DataView(header.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);header.set(name,30);entries.push({path,name,size:data.length,crc,offset});await send(header);await send(data);
 },async close(){if(closed)throw Error('ZIP already closed');closed=true;const start=offset;
  for(const e of entries){const header=new Uint8Array(46+e.name.length),v=new DataView(header.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,33,true);v.setUint32(16,e.crc,true);v.setUint32(20,e.size,true);v.setUint32(24,e.size,true);v.setUint16(28,e.name.length,true);v.setUint32(42,e.offset,true);header.set(e.name,46);await send(header);}
  const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,offset-start,true);v.setUint32(16,start,true);await send(end);
 },get bytes(){return offset;}};
}
