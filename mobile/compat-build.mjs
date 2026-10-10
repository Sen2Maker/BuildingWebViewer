/** Android-only downlevel build. Keep normal web source and output unchanged. */
import {build,transformSync} from 'esbuild';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const mobile=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(mobile),web=path.join(mobile,'web');
const target=['chrome60','es2017'];
async function walk(dir){const paths=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);paths.push(...(e.isDirectory()?await walk(p):[p]));}return paths;}
for(const file of await walk(web)){
 let text;
 if(file.endsWith('.js')){text=transformSync(await readFile(file,'utf8'),{target,charset:'utf8',legalComments:'inline'}).code;}
 else if(file.endsWith('.css')){text=transformSync(await readFile(file,'utf8'),{target,loader:'css',logLevel:'error'}).code;}
 else if(file.endsWith('.html')){
  text=await readFile(file,'utf8');
  text=text.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(all,attrs,code)=>{
   if(/\bsrc\s*=|application\/ld\+json/i.test(attrs)||!code.trim())return all;
   return '<script'+attrs+'>'+transformSync(code,{target,charset:'utf8'}).code.replace(/<\/script/gi,'<\\/script')+'</script>';
  });
  text=text.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi,(_,attrs,css)=>'<style'+attrs+'>'+transformSync(css,{target,loader:'css',logLevel:'error'}).code+'</style>');
  const prefix=file.includes(path.join('assets','mobile'))?'../../':'';
  text=text.replace('<head>','<head><script src="'+prefix+'assets/js/compatibility.js"></script>');
 }
 if(text!==undefined)await writeFile(file,text);
}
await build({entryPoints:[path.join(root,'src/mobile/compatibility.js')],outfile:path.join(web,'assets/js/compatibility.js'),bundle:true,format:'iife',target,nodePaths:[path.join(mobile,'node_modules')],charset:'utf8',legalComments:'inline'});
await writeFile(path.join(web,'assets/mobile/compatibility.css'),await readFile(path.join(root,'src/mobile/compatibility.css')));
for(const file of (await walk(web)).filter(p=>p.endsWith('.html'))){const prefix=file.includes(path.join('assets','mobile'))?'../../':'';await writeFile(file,(await readFile(file,'utf8')).replace('</head>','<link rel="stylesheet" href="'+prefix+'assets/mobile/compatibility.css"></head>'));}
console.log('Android JavaScript, inline boot scripts and CSS compiled for WebView 60; offline compatibility layer included.');
