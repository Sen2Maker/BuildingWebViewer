import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const datasetURL=`data:text/javascript;base64,${Buffer.from(await readFile(new URL('point-dataset.js',import.meta.url))).toString('base64')}`;
const mod=async name=>import(`data:text/javascript;base64,${Buffer.from((await readFile(new URL(name,import.meta.url),'utf8')).replaceAll("'./point-dataset.js'",JSON.stringify(datasetURL))).toString('base64')}`);
const {defaultPointSettings,semanticPointCloud,pointFieldStats,validatePointSettings,hsvPointRGB}=await import(datasetURL);
const {parsePointCloud}=await mod('point-io.js');
const {writePointExport}=await mod('point-export.js');
const {computePointFeatures,derivedPointCloud}=await mod('point-operations.js');
const parse=(text)=>parsePointCloud(new TextEncoder().encode(text).buffer,'points.txt');
let passed=0;async function test(name,fn){await fn();console.log(`PASS ${++passed} ${name}`);}
async function exportRead(cloud,format){const parts=[];await writePointExport([{name:'fixture',cloud}],{format,sourceIds:false,write:async part=>parts.push(part)});const bytes=Buffer.concat(parts);return {cloud:parsePointCloud(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),`result.${format}`),bytes};}
const raw=parse('1 2 3 255 0 128 0.1234567890123\n4 5 6 0 255 0 0.2');
await test('unknown columns are left as scalar values, order preserved from input headers',()=>{
 const s=defaultPointSettings(raw);assert.equal(s.tags.column_4,'scalar');assert.equal(raw.rgb,null);
 assert.deepEqual(parse('intensity z y x\n2 3 4 5').columnOrder,['intensity','z','y','x']);
});
await test('RGB and intensity tagging does not mutate or reorder source arrays',()=>{
 const s=defaultPointSettings(raw);Object.assign(s.tags,{column_4:'red',column_5:'green',column_6:'blue',column_7:'intensity'});s.rgbScale='255';
 const c=semanticPointCloud(raw,s,{strict:true});assert.equal(c.positions,raw.positions);assert.equal(c.fields.column_4,raw.fields.column_4);assert.equal(c.rgb[0],1);assert.equal(raw.rgb,null);
 s.order.reverse();assert.notDeepEqual(s.order,c.columnOrder);
});
for(const format of ['txt','ply'])await test(`${format}: reordered RGB/intensity columns round-trip with exact values and tags`,async()=>{
 const s=defaultPointSettings(raw);Object.assign(s.tags,{column_4:'red',column_5:'green',column_6:'blue',column_7:'intensity'});s.rgbScale='255';s.order=['column_7','x','y','z','column_6','column_4','column_5'];
 const r=(await exportRead(semanticPointCloud(raw,s),format)).cloud;
 assert.deepEqual(r.columnOrder,['intensity','x','y','z','blue','red','green']);assert.deepEqual([...r.positions],[...raw.positions]);assert.deepEqual([...r.fields.intensity],[...raw.fields.column_7]);assert.equal(r.semantics.rgbScale,'255');assert.equal(r.semantics.tags.red,'red');
});
await test('HSV conversion supports degree, normalized and OpenCV ranges without changing HSV values',()=>{
 for(const [range,rows] of [['degrees','0 1 1\n120 1 1\n240 1 1'],['unit','0 1 1\n0.3333333333333333 1 1\n0.6666666666666666 1 1'],['opencv','0 255 255\n60 255 255\n120 255 255']]){
  const c=parse(rows.split('\n').map((row,i)=>`${i} 0 0 ${row}`).join('\n')),s=defaultPointSettings(c);s.hsvScale=range;s.colorSpace='hsv';Object.assign(s.tags,{column_4:'hue',column_5:'saturation',column_6:'value'});
  const r=semanticPointCloud(c,s,{strict:true});assert.deepEqual([...r.rgb],[1,0,0,0,1,0,0,0,1]);assert.equal(r.fields.column_4,c.fields.column_4);
 }
 assert.deepEqual(hsvPointRGB(360,1,1),[1,0,0]);
});
for(const format of ['txt','ply'])await test(`${format}: HSV range and custom label survive export and reload`,async()=>{
 const c=parse('0 0 0 0.5 1 1 0.9'),s=defaultPointSettings(c);s.hsvScale='unit';s.colorSpace='hsv';Object.assign(s.tags,{column_4:'hue',column_5:'saturation',column_6:'value',column_7:'custom'});s.custom.column_7='模型置信度 confidence';
 const result=(await exportRead(semanticPointCloud(c,s),format)).cloud,settings=defaultPointSettings(result),colored=semanticPointCloud(result,settings);
 assert.equal(settings.hsvScale,'unit');assert.deepEqual([...colored.rgb],[0,1,1]);const key=result.columnOrder.at(-1);assert.equal(settings.tags[key],'custom');assert.equal(settings.custom[key],s.custom.column_7);assert.equal(result.fields[key][0],0.9);
});
await test('duplicate roles, missing custom names and invalid RGB values are reported',()=>{
 const s=defaultPointSettings(raw);s.tags.column_4=s.tags.column_5='red';assert.throws(()=>validatePointSettings(raw,s));
 s.tags.column_5='scalar';s.tags.column_7='custom';assert.throws(()=>validatePointSettings(raw,s));
 s.tags.column_7='scalar';Object.assign(s.tags,{column_4:'red',column_5:'green',column_6:'blue'});s.rgbScale='1';assert.throws(()=>semanticPointCloud(raw,s,{strict:true}));
});
await test('each feature selection allocates only requested output fields and validity',()=>{
 const c=parse('0 0 0\n1 0 0\n0 1 0\n1 1 0');
 for(const feature of ['normals','slope','planarity','roughness']){const r=computePointFeatures(c.positions,{k:4,features:[feature]});assert.deepEqual(Object.keys(r.fields),feature==='normals'?['nx','ny','nz','normal_valid']:[feature,'normal_valid']);}
 assert.throws(()=>computePointFeatures(c.positions,{features:[]}));
});
await test('new features insert after XYZ or before an exact column, with all input values intact',()=>{
 const c=parse('0 0 0 1\n1 0 0 2\n0 1 0 3\n1 1 0 4'),s=defaultPointSettings(c);s.tags.column_4='intensity';const input=semanticPointCloud(c,s),result=computePointFeatures(c.positions,{k:4,features:['normals']});
 const a=derivedPointCloud(input,result,{k:4,placement:'after-xyz'},'all');assert.deepEqual(a.columnOrder,['x','y','z','nx','ny','nz','normal_valid','column_4']);assert.equal(a.fields.column_4,c.fields.column_4);
 const b=derivedPointCloud(input,result,{k:4,placement:'index',insertColumn:1},'all');assert.deepEqual(b.columnOrder.slice(0,4),['nx','ny','nz','normal_valid']);assert.equal(b.semantics.tags.nx,'nx');assert.throws(()=>derivedPointCloud(input,result,{placement:'index',insertColumn:20},'all'));
});
await test('statistics count missing values and maintain high precision',()=>{
 const s=pointFieldStats(Float64Array.of(0.1234567890123,NaN,10,Infinity));assert.equal(s.min,0.1234567890123);assert.equal(s.finite,2);assert.equal(s.missing,2);
});
await test('merged schema uses first column order, aligns semantic tags and appends missing attributes',async()=>{
 const a=semanticPointCloud(raw,defaultPointSettings(raw)),b=parse('x y z confidence\n100 200 300 0.88');a.semantics.tags.column_7='intensity';a.columnOrder=['column_7','x','y','z','column_4','column_5','column_6'];
 const second=semanticPointCloud(b,defaultPointSettings(b)),parts=[];await writePointExport([{name:'a',cloud:a},{name:'b',cloud:second}],{format:'txt',sourceIds:false,write:async v=>parts.push(v)});
 const r=parse(Buffer.concat(parts).toString());assert.equal(r.count,3);assert.equal(r.columnOrder[0],'intensity');assert.equal(r.columnOrder.at(-1),'confidence');assert(Number.isNaN(r.fields.intensity[2]));assert.equal(r.fields.confidence[2],0.88);
});
await test('mixed RGB/HSV sources retain colors through a merged schema with missing columns',async()=>{
 const a=parse('x y z red green blue\n0 0 0 255 0 0'),b=parse('x y z hue saturation value\n1 0 0 120 1 1');
 const items=[a,b].map((cloud,index)=>({name:String(index),cloud:semanticPointCloud(cloud,defaultPointSettings(cloud))})),parts=[];
 await writePointExport(items,{format:'txt',write:async v=>parts.push(v)});
 const c=parse(Buffer.concat(parts).toString()),view=semanticPointCloud(c,defaultPointSettings(c));assert.deepEqual([...view.rgb],[1,0,0,0,1,0]);
});
console.log(`${passed} column/semantic tests passed`);
