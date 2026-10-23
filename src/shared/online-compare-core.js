import {normalizePublicUrl,validatePreset,recommendedPreviewPreset} from './online-preview-core.js';
const allowed=new Set(['schemaVersion','manifest','buildingId','preset','maxPoints']);
export function validateCompareDescriptor(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Comparison configuration must be an object');
  for(const [key,property] of Object.entries(Object.getOwnPropertyDescriptors(value)))if(!allowed.has(key)||!Object.hasOwn(property,'value')||!property.enumerable)throw Error('Unsupported comparison configuration');
  if(Object.getOwnPropertySymbols(value).length||value.schemaVersion!==1)throw Error('Comparison requires schemaVersion: 1');
  const manifest=normalizePublicUrl(value.manifest),buildingId=value.buildingId;
  if(typeof buildingId!=='string'||!buildingId.trim()||buildingId.length>240||/[\u0000-\u001f\u007f]/u.test(buildingId))throw Error('Comparison requires a valid building ID');
  const maxPoints=value.maxPoints===undefined?250000:value.maxPoints;
  if(!Number.isSafeInteger(maxPoints)||maxPoints<1000||maxPoints>1000000)throw Error('Comparison point sample must be 1000–1000000');
  const preset=validatePreset({...recommendedPreviewPreset('pointcloud'),...validatePreset(value.preset,'pointcloud')},'pointcloud');
  return {schemaVersion:1,manifest,buildingId,preset,maxPoints};
}
export function readCompareDescriptor(hash=globalThis.location?.hash||''){
  if(hash.length>16384)throw Error('Comparison link exceeds 16 KiB');
  const raw=new URLSearchParams(hash.slice(1)).get('compare');
  return raw===null?null:validateCompareDescriptor(JSON.parse(raw));
}
export function comparisonLink(value,base=globalThis.location?.href){
  const descriptor=validateCompareDescriptor(value),url=new URL('compare.html',base);
  url.search='';url.hash=new URLSearchParams({compare:JSON.stringify(descriptor)}).toString();
  if(url.hash.length>16384)throw Error('Comparison link exceeds 16 KiB');return url.href;
}
