import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root));
const json=p=>JSON.parse(read(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('root native source matches M2 plus exact diagnostic-only delta',()=>{
 const baseline=json('ci/native-c/native-files.json');
 const delta=json('ci/root-native/diagnostic-source-delta.json');
 const reviewed=new Map(delta.changes.map(row=>[row.path,row]));
 assert.equal(reviewed.size,5);
 const seen=new Set();
 for(const row of baseline.files){
  if(row.path==='mobile/bundled-pins.json'||row.path.startsWith('mobile/web/')||row.path.startsWith('mobile/android/app/src/main/assets/public/'))continue;
  const change=reviewed.get(row.path);
  if(change){assert.equal(change.before,row.sha256,row.path);seen.add(row.path);}
  assert.equal(sha(read(row.path)),change?.after??row.sha256,row.path);
 }
 assert.equal(seen.size,reviewed.size);
});
test('both native payload copies have verified CAD web links, not sibling local routes',()=>{
 for(const prefix of ['mobile/web/','mobile/android/app/src/main/assets/public/']){
  const html=read(prefix+'index.html').toString();
  assert.match(html,/data-app-link="cadWeb" href="https:\/\/sen2maker.github.io\/WebCadToolBox\/"/);
  assert.ok(!html.includes('../cad/'));
  const inv=json(prefix+'asset-inventory.json');
  for(const row of inv.files)assert.equal(sha(read(prefix+row.path)),row.sha256,row.path);
 }
});
test('Main App still blocks web hub and leaves CAD downloads and destructive cleanup unavailable',()=>{
 assert.equal(json('app.config.json').links.cadAppDownload,null);
 const native=read('mobile/android/app/src/main/java/io/github/sen2maker/buildingwebviewer/NativeRoutes.java').toString();
 assert.ok(native.includes('path.equals("/index.html")'));
 const home=read('src/mobile/home.js').toString();
 assert.ok(home.includes("document.getElementById('empty-trash').disabled=true"));
 assert.ok(home.includes("document.getElementById('clean-storage').disabled=true"));
 assert.ok(home.includes('openCadAppDownload'));
});
