import { defineConfig } from 'vite';
import { resolve, relative } from 'node:path';
import { readFileSync } from 'node:fs';
const root=import.meta.dirname, config=JSON.parse(readFileSync(resolve(root,'app.config.json'),'utf8'));
export default defineConfig({
 root:resolve(root,'.vite-input'),publicDir:resolve(root,'.vite-public'),base:'./',
 server:{host:'127.0.0.1',fs:{allow:[root]}},preview:{host:'127.0.0.1'},
 plugins:[{name:'independent-app-boundary',generateBundle(_options,bundle){
  const modules=new Set();
  for(const item of Object.values(bundle))if(item.type==='chunk')for(const id of item.moduleIds){
   if(id.includes('/src/')){
    const name=relative(root,id).replaceAll('\\','/');
    if(name.startsWith('../'))throw Error('Cross-repository source import: '+name);
    if(config.app==='main'&&/\/src\/cad\//.test(id))throw Error('CAD source reached main output: '+name);
    modules.add(name);
   }
  }
  this.emitFile({type:'asset',fileName:'build-modules.json',source:JSON.stringify({app:config.app,modules:[...modules].sort()},null,2)+'\n'});
 }}],
 build:{outDir:resolve(root,'dist'),emptyOutDir:true,target:['chrome111','edge111','firefox114','safari16.4'],minify:false,sourcemap:false,
 rolldownOptions:{input:config.pages.map(name=>resolve(root,'.vite-input',name)),output:{entryFileNames:'assets/js/[name]-[hash].js',chunkFileNames:'assets/js/[name]-[hash].js',assetFileNames:'assets/[name]-[hash][extname]'}}}
});
