import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCompareDescriptor,readCompareDescriptor,comparisonLink,demonstrationLink} from '../src/shared/online-compare-core.js';
import {preferenceStorage,isPreviewSession} from '../src/shared/preference-storage.js';
const config=()=>({schemaVersion:1,manifest:'https://data.example/index.json',buildingId:'2'});
test('one comparison link includes initial building, bounded sampling and explicit recommendation',()=>{const link=new URL(comparisonLink(config(),'https://viewer.example/BuildingWebViewer/index.html?project=private'));assert.equal(link.pathname,'/BuildingWebViewer/lod.html');assert.equal(link.search,'');const value=readCompareDescriptor(link.hash);assert.equal(value.buildingId,'2');assert.equal(value.maxPoints,250000);assert.equal(value.preset.pointSize,3);assert.equal(value.preset.colorMode,'height');});
test('comparison descriptor rejects credentials, arbitrary configs, invalid sample bounds and empty IDs',()=>{for(const extra of [{manifest:'https://user:password@data.example/index.json'},{manifest:'https://data.example/index.json?token=secret'},{maxPoints:0},{maxPoints:1000001},{maxPoints:1.5},{buildingId:''},{buildingId:'a\n'},{script:'bad'},{preset:{camera:[1,2,3]}},{prefetchBytes:1e12}])assert.throws(()=>validateCompareDescriptor({...config(),...extra}));assert.throws(()=>readCompareDescriptor('#compare=invalid'));assert.throws(()=>readCompareDescriptor('#'+'x'.repeat(17000)));});
test('comparison preserves explicit permitted settings and never reads storage',()=>{const value=validateCompareDescriptor({...config(),preset:{grid:true,pointSize:5},maxPoints:10000});assert.equal(value.preset.pointSize,5);assert.equal(value.preset.grid,true);assert.equal(value.maxPoints,10000);});
test('comparison preference isolation latches before any saved preference access and remains after hash removal',()=>{let reads=0;const host={location:{hash:'#compare=invalid'},get localStorage(){reads++;throw Error('persistent preferences forbidden');}};assert.equal(isPreviewSession(host),true);const storage=preferenceStorage(host);storage.setItem('camera','temporary');host.location.hash='';assert.equal(preferenceStorage(host).getItem('camera'),'temporary');assert.equal(reads,0);const other={location:{hash:'#compare=another'}};assert.equal(preferenceStorage(other).getItem('camera'),null);});
test('comparison descriptor handles unusual own-property accessors without invoking them',()=>{let invoked=false;const value=config();Object.defineProperty(value,'preset',{enumerable:true,get(){invoked=true;throw Error('getter');}});assert.throws(()=>validateCompareDescriptor(value));assert.equal(invoked,false);});


test('compact dataset links select a validated preview or original without inherited private parameters',()=>{
 const link=new URL(demonstrationLink('367','https://viewer.example/BuildingWebViewer/index.html?lang=en&project=private'));
 assert.equal(link.pathname,'/BuildingWebViewer/lod.html');assert.equal(link.searchParams.get('project'),null);assert.equal(link.searchParams.get('lang'),'en');
 const preview=readCompareDescriptor('',link.search);assert.equal(preview.buildingId,'367');assert.match(preview.manifest,/bwvpc-fine-8000-v1\/index.json$/);
 const original=readCompareDescriptor('','?dataset=bwv-test4000&building=367&quality=original');assert.doesNotMatch(original.manifest,/bwvpc-fine-8000-v1/);
 assert.throws(()=>readCompareDescriptor('','?dataset=unknown'));
 assert.throws(()=>readCompareDescriptor('','?dataset=bwv-test4000&quality=unknown'));
});
test('both current and legacy compact URLs isolate preferences before viewer initialization',()=>{
 for(const page of ['lod','compare']) {
  let reads=0;const host={location:{pathname:`/BuildingWebViewer/${page}.html`,search:'?dataset=bwv-test4000&building=1',hash:''},get localStorage(){reads++;throw Error('saved preferences accessed');}};
  assert.equal(isPreviewSession(host),true);preferenceStorage(host).setItem('palette','temporary');assert.equal(reads,0);
  host.location.search='';assert.equal(preferenceStorage(host).getItem('palette'),'temporary');assert.equal(reads,0);
 }
});
test('ordinary local and native Mesh pages retain their existing saved profile',()=>{
 const localStorage={getItem:()=> 'saved'};
 for(const host of [
  {location:{pathname:'/lod.html',search:'',hash:''},localStorage},
  {location:{pathname:'/lod.html',search:'?dataset=bwv-test4000',hash:''},localStorage,Capacitor:{isNativePlatform:()=>true}},
 ]) {assert.equal(isPreviewSession(host),false);assert.equal(preferenceStorage(host),localStorage);}
});


test('previous built-in share links migrate to fine trees while preserving the selected building and settings',()=>{
 for(const name of ['bwvpc-v1','preview-v1']){
  const old={...config(),manifest:`https://meshbuild.cn-nb1.rains3.com/BWV_Test4000/${name}/index.json`,buildingId:'194',buildingIds:['194','367'],preset:{grid:false,palette:'inferno',pointSize:4},maxPoints:120000};
  const value=readCompareDescriptor('#'+new URLSearchParams({compare:JSON.stringify(old)}));
  assert.match(value.manifest,/bwvpc-fine-8000-v1\/index.json$/);assert.equal(value.buildingId,'194');assert.deepEqual(value.buildingIds,['194','367']);assert.equal(value.preset.pointSize,4);assert.equal(value.preset.palette,'inferno');assert.equal(value.maxPoints,120000);
 }
 for(const manifest of ['https://data.example/BWV_Test4000/bwvpc-v1/index.json','https://meshbuild.cn-nb1.rains3.com/BWV_Test4000/bwvpc-v1/index.json?revision=frozen'])assert.equal(validateCompareDescriptor({...config(),manifest}).manifest,manifest);
});
