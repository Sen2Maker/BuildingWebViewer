import {normalizeManifest, validateDescriptor, recommendedPreviewPreset, METADATA_MAX_BYTES} from './online-preview-core.js';
import {validateCompareDescriptor} from './online-compare-core.js';
import {normalizeComparisonCatalog} from '../compare/session.js';
import {normalizeBwvpcManifest, decodeBwvpcNode} from '../compare/bwvpc.js';
import {fetchPreviewSource} from './online-preview-source.js';
import {fetchPreviewDataset} from './online-preview-data.js';
import {parseOBJ} from '../lod/obj-parser.js';
import {readPointCloud,parseWireOBJ} from '../cloud/point-io.js';

/** Same public, bounded, integrity-checked transport and parsers as the viewers. */
export async function probeOnlineData(input,{signal,onProgress=()=>{},source=fetchPreviewSource,dataset=fetchPreviewDataset,parseCloud=readPointCloud}={}){
 const check=()=>{if(signal?.aborted)throw new DOMException('已取消 / Cancelled','AbortError');};
 const json=async url=>{const bytes=await source(url,{signal,maxBytes:METADATA_MAX_BYTES,timeoutMs:30000});check();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));};
 async function verify(entry){
  check();onProgress(entry.viewer==='lod'?'正在验证网格 / Checking mesh…':'正在验证点云 / Checking points…');
  const bytes=await dataset({...entry,schemaVersion:entry.chunks?2:1,format:entry.format==='bwvpc'?'ply':entry.format},{signal,fetchSource:source});check();
  if(entry.viewer==='wireframe'){const wire=parseWireOBJ(new TextDecoder('utf-8',{fatal:true}).decode(bytes),entry.id||'preview');if(!wire.edges.length)throw Error('OBJ 中没有可显示的线 / OBJ has no edges');return {edges:wire.edges.length};}
  if(entry.format==='obj'){const mesh=parseOBJ(new TextDecoder('utf-8',{fatal:true}).decode(bytes),entry.id||'preview',bytes.length);if(!mesh.faces.length)throw Error('OBJ 中没有可显示的面 / OBJ has no faces');return {faces:mesh.faces.length};}
  if(entry.format==='bwvpc'){
   const tree=normalizeBwvpcManifest(JSON.parse(new TextDecoder().decode(bytes)),entry.url);
   const root=tree.root;const data=await dataset({id:root.id,url:root.url,bytes:root.bytes,sha256:root.sha256,viewer:'pointcloud',schemaVersion:1,format:'ply'},{signal,fetchSource:source});check();decodeBwvpcNode(data,root);return {points:tree.total,previewPoints:root.points};
  }
  const cloud=await parseCloud(new File([bytes],`preview.${entry.format}`),{maxPoints:10000,signal});check();if(!cloud.count)throw Error('点云中没有有效坐标 / No valid points');return {points:cloud.totalCount||cloud.count};
 }
 onProgress('正在检查数据地址 / Checking data address…');
 if(input.kind==='compare'){
  // Validate before issuing even the index request.
  const descriptor=validateCompareDescriptor({schemaVersion:1,manifest:input.url,buildingId:input.entry||input.buildingIds?.[0]||'auto',preset:recommendedPreviewPreset('pointcloud'),...(input.buildingIds?{buildingIds:input.buildingIds}:{} )});
  const catalog=normalizeComparisonCatalog(await json(descriptor.manifest),{manifestUrl:descriptor.manifest});
  if(input.buildingIds&&input.buildingIds.some(id=>!catalog.some(item=>item.id===id)))throw Error('展示范围包含索引中不存在的 ID / Unknown IDs in selection');
  const selected=input.entry||input.buildingIds?.[0];const pair=selected?catalog.find(item=>item.id===selected):catalog.find(item=>item.mesh&&item.cloud);
  if(!pair||!pair.mesh||!pair.cloud)throw Error('找不到配对的点云与网格，请检查 ID 和索引字段 / Missing matched mesh and point cloud');
  const mesh=await verify(pair.mesh),cloud=await verify(pair.cloud);check();
  return {kind:'compare',descriptor:validateCompareDescriptor({...descriptor,buildingId:pair.id}),summary:{...mesh,...cloud,total:input.buildingIds?.length||catalog.length}};
 }
 let descriptor;
 if(input.kind==='manifest'){
  const ref=validateDescriptor({schemaVersion:1,manifest:input.url,...(input.viewer?{viewer:input.viewer}:{})});
  const entries=normalizeManifest(await json(ref.manifest),{manifestUrl:ref.manifest}).filter(entry=>!ref.viewer||entry.viewer===ref.viewer);
  const entry=input.entry?entries.find(item=>item.id===input.entry):entries[0];if(!entry)throw Error('索引中没有适用于所选工具的条目，或指定 ID 不匹配 / No matching entry for the selected tool');
  const summary=await verify(entry);check();
  descriptor=validateDescriptor({...ref,viewer:entry.viewer,entry:entry.id,preset:recommendedPreviewPreset(entry.viewer)});
  return {kind:'preview',descriptor,summary:{...summary,total:entries.length}};
 }
 descriptor=validateDescriptor({schemaVersion:1,url:input.url,viewer:input.kind,format:input.format,preset:recommendedPreviewPreset(input.kind)});
 const summary=await verify(descriptor);check();return {kind:'preview',descriptor,summary:{...summary,total:1}};
}
