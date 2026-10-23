import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,rmSync,existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(readFileSync(path.join(root,'app.config.json'),'utf8'));
test('clean standalone source export builds and packages only its own inventoried files',()=>{
 const temp=mkdtempSync(path.join(tmpdir(),'independent-'+config.app+'-'));
 try{
  const excluded=new Set(['.git','tests','docs','dist','packages','.vite-input','.vite-public','__pycache__']);
  cpSync(root,temp,{recursive:true,filter:source=>!excluded.has(path.relative(root,source).split(path.sep)[0])});
  assert.equal(existsSync(path.join(temp,'dist')),false);
  if(config.app==='main'){
   mkdirSync(path.join(temp,'assets/vendor/cad'),{recursive:true});
   writeFileSync(path.join(temp,'assets/vendor/cad/unexpected.wasm'),'not allowed');
  }
  const result=spawnSync('npm',['run','build'],{cwd:temp,encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stdout+result.stderr);
  const manifest=JSON.parse(readFileSync(path.join(temp,'dist/version.json'),'utf8'));assert.match(manifest.build,/^[a-f0-9]{16}$/);
  const inventory=JSON.parse(readFileSync(path.join(temp,'dist/asset-inventory.json'),'utf8'));
  assert.equal(manifest.version,JSON.parse(readFileSync(path.join(temp,'package.json'),'utf8')).version);
  if(config.app==='main')assert.ok(!inventory.files.some(f=>f.path.includes('/cad/')||f.path.endsWith('.wasm')));
  const pack=spawnSync('python3',['scripts/package.py'],{cwd:temp,encoding:'utf8'});assert.equal(pack.status,0,pack.stdout+pack.stderr);
  writeFileSync(path.join(temp,'dist/unreviewed-file.txt'),'must reject');
  const rejected=spawnSync('python3',['scripts/package.py','--check'],{cwd:temp,encoding:'utf8'});assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/Output differs/);
  const release=spawnSync('python3',['scripts/package.py','--release-check'],{cwd:temp,encoding:'utf8'});assert.notEqual(release.status,0);assert.match(release.stderr,/Release blocked/);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
