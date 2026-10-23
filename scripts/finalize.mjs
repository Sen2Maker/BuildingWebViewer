/** Hash the final candidate tree. Never signs or publishes, and excludes self-referential metadata. */
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,process.argv[2]||'dist');
if (!out.startsWith(root+'/')) throw new Error('Output must stay within the prototype workspace');
const config=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
async function walk(dir){const list=[];for(const d of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,d.name);if(d.isDirectory())list.push(...await walk(p));else list.push(p);}return list.sort();}
const files=(await walk(out)).filter(p=>!['version.json','asset-inventory.json'].includes(relative(out,p)));
const hash=createHash('sha256');
for(const file of files){const name=relative(out,file).replaceAll('\\','/');hash.update(name+'\0');let data=await readFile(file);if(file.endsWith('.html'))data=Buffer.from(data.toString('utf8').replace(/(<meta name="application-build" content=")[^"]*(">)/g,'$1BUILD_PLACEHOLDER$2'));hash.update(data);}
const build=hash.digest('hex').slice(0,16);
for(const file of files.filter(p=>p.endsWith('.html'))){const text=await readFile(file,'utf8');await writeFile(file,text.replace(/(<meta name="application-build" content=")[^"]*(">)/g,`$1${build}$2`));}
await writeFile(resolve(out,'version.json'),JSON.stringify({version:config.version,build},null,2)+'\n');
const inventory=[];
for(const file of await walk(out)){if(relative(out,file)==='asset-inventory.json')continue;const data=await readFile(file);inventory.push({path:relative(out,file).replaceAll('\\','/'),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
await writeFile(resolve(out,'asset-inventory.json'),JSON.stringify({schema:1,prototype:true,sourceBaseline:'9abb7abaca240dba',version:config.version,build,files:inventory},null,2)+'\n');
console.log(`Finalized candidate ${build}; ${inventory.length} inventoried files; no App packaging or signing.`);
