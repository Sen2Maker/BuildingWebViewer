/** Native Gaussian edits reference immutable original PLY files; only one flag byte per point is saved. */
export function gsProjectBlob(entries){
  const records=[],blocks=[];let offset=0;
  for(const e of entries){const flags=e.parsed?.editFlags||e.savedFlags;if(!flags)continue;records.push({id:e.id,count:flags.length,offset});blocks.push(flags.slice());offset+=flags.length;}
  const header=new TextEncoder().encode(JSON.stringify({format:'BuildingWebViewer.gaussian-edits',version:1,records}));const length=new Uint8Array(4);new DataView(length.buffer).setUint32(0,header.length,true);return new Blob([length,header,...blocks]);
}
export async function gsReadProjectBlob(file){
  if(file.size<4||file.size>512*1024*1024)throw Error('Invalid Gaussian snapshot size');const n=new DataView(await file.slice(0,4).arrayBuffer()).getUint32(0,true);if(n>4*1024*1024||n+4>file.size)throw Error('Invalid Gaussian snapshot header');
  const data=JSON.parse(await file.slice(4,4+n).text());if(data.format!=='BuildingWebViewer.gaussian-edits'||data.version!==1||!Array.isArray(data.records))throw Error('Invalid Gaussian snapshot');let offset=0;const result=new Map();
  for(const r of data.records){if(typeof r.id!=='string'||result.has(r.id)||!Number.isSafeInteger(r.count)||r.count<0||r.offset!==offset||4+n+offset+r.count>file.size)throw Error('Invalid Gaussian flags');const flags=new Uint8Array(await file.slice(4+n+offset,4+n+offset+r.count).arrayBuffer());if(flags.some(v=>v>7))throw Error('Invalid Gaussian edit flag');result.set(r.id,flags);offset+=r.count;}
  if(n+4+offset!==file.size)throw Error('Unexpected Gaussian snapshot bytes');return result;
}
