import {normalizePublicUrl,validatePreset,recommendedPreviewPreset} from './online-preview-core.js';
const allowed=new Set(['schemaVersion','manifest','buildingId','preset','maxPoints','buildingIds']);
// Public demonstration resources. Geometry stays on object storage, outside the app bundle.
export const BUILDING_DEMO = Object.freeze({
  id: 'bwv-test4000',
  manifest: 'https://meshbuild.cn-nb1.rains3.com/BWV_Test4000/bwvpc-fine-8000-v1/index.json',
  originalManifest: 'https://meshbuild.cn-nb1.rains3.com/BWV_Test4000/index.json',
  preset: Object.freeze({grid:false,palette:'viridis',reverse:false,pointSize:2,pointOpacity:1,colorMode:'height'}),
});
export function demonstrationLink(buildingId='1',base=globalThis.location?.href,quality='preview') {
  const url=new URL('lod.html',base);
  url.search=new URLSearchParams({dataset:BUILDING_DEMO.id,building:String(buildingId)}).toString();
  if(quality==='original')url.searchParams.set('quality','original');
  const presentation=new URL(base).searchParams.get('presentation');if(presentation)url.searchParams.set('presentation',presentation);
  const lang=new URL(base).searchParams.get('lang');
  if(['zh','en'].includes(lang))url.searchParams.set('lang',lang);
  return url.href;
}
export function validateCompareDescriptor(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Comparison configuration must be an object');
  for(const [key,property] of Object.entries(Object.getOwnPropertyDescriptors(value)))if(!allowed.has(key)||!Object.hasOwn(property,'value')||!property.enumerable)throw Error('Unsupported comparison configuration');
  if(Object.getOwnPropertySymbols(value).length||value.schemaVersion!==1)throw Error('Comparison requires schemaVersion: 1');
  const manifest=normalizePublicUrl(value.manifest),buildingId=value.buildingId;
  if(typeof buildingId!=='string'||!buildingId.trim()||buildingId.length>240||/[\u0000-\u001f\u007f]/u.test(buildingId))throw Error('Comparison requires a valid building ID');
  const maxPoints=value.maxPoints===undefined?250000:value.maxPoints;
  if(!Number.isSafeInteger(maxPoints)||maxPoints<1000||maxPoints>1000000)throw Error('Comparison point sample must be 1000–1000000');
  const preset=validatePreset({...recommendedPreviewPreset('pointcloud'),...validatePreset(value.preset,'pointcloud')},'pointcloud');
  const clean={schemaVersion:1,manifest,buildingId,preset,maxPoints};
  if(value.buildingIds!==undefined){
    if(!Array.isArray(value.buildingIds)||!value.buildingIds.length||value.buildingIds.length>5000||value.buildingIds.some(id=>typeof id!=='string'||!id.trim()||id.length>240||/[\u0000-\u001f\u007f]/u.test(id))||new Set(value.buildingIds).size!==value.buildingIds.length)throw Error('展示范围需要不重复的有效 ID / Invalid building selection');
    if(!value.buildingIds.includes(buildingId))throw Error('起始 ID 不在展示范围内 / Initial building is outside the selection');
    clean.buildingIds=[...value.buildingIds];
  }
  return clean;
}
export function readCompareDescriptor(hash=globalThis.location?.hash||'',search=globalThis.location?.search||''){
  if(hash.length>16384)throw Error('Comparison link exceeds 16 KiB');
  const raw=new URLSearchParams(hash.slice(1)).get('compare');
  if(raw!==null)return validateCompareDescriptor(JSON.parse(raw));
  const params=new URLSearchParams(search),dataset=params.get('dataset');
  if(dataset===null)return null;
  if(dataset!==BUILDING_DEMO.id)throw Error('Unknown online dataset / 未知在线数据集');
  const quality=params.get('quality')||'preview';
  if(!['preview','original'].includes(quality))throw Error('Unknown point-cloud quality');
  return validateCompareDescriptor({schemaVersion:1,manifest:quality==='original'?BUILDING_DEMO.originalManifest:BUILDING_DEMO.manifest,
    buildingId:params.get('building')||'1',preset:BUILDING_DEMO.preset,maxPoints:quality==='original'?250000:120000});
}
export function comparisonLink(value,base=globalThis.location?.href){
  const descriptor=validateCompareDescriptor(value),url=new URL('lod.html',base);
  url.search='';url.hash=new URLSearchParams({compare:JSON.stringify(descriptor)}).toString();
  const lang=new URL(base).searchParams.get('lang');if(['zh','en'].includes(lang))url.searchParams.set('lang',lang);
  if(url.hash.length>16384)throw Error('Comparison link exceeds 16 KiB');return url.href;
}
