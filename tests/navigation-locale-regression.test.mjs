import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeAppLinks} from '../src/shared/app-navigation.js';
const root=new URL('../',import.meta.url);
const config=JSON.parse(readFileSync(new URL('app.config.json',root),'utf8'));
function makeLink(href,kind){return {href,target:'',getAttribute(name){return name==='href'?this.href:null;},hasAttribute(name){return name===kind;}};}
function fixture(href,{pathname='/cad/cad-editor.html',query='?lang=zh',storedLanguage='en',kind='data-app-route'}={}){
 const link=makeLink(href,kind),doc={baseURI:'https://account.example'+pathname+query,documentElement:{lang:storedLanguage==='en'?'en':'zh-CN'},querySelectorAll(selector){assert.equal(selector,'a[data-app-link], a[data-app-route]');return [link];}};
 initializeAppLinks(doc,{search:query});return link;
}
test('explicit zh and en on editor/viewer ordinary routes override the opposite stored language',()=>{
 for(const lang of ['zh','en'])for(const [pathname,target] of [['/cad/cad-editor.html','cad.html'],['/cad/cad.html','cad-editor.html']]){
  const result=fixture(target+'?project=private&file=private.dwg#secret',{pathname,query:'?lang='+lang+'&project=origin&file=source',storedLanguage:lang==='zh'?'en':'zh'});
  assert.equal(result.href,'https://account.example/cad/'+target+'?lang='+lang);
  assert.equal(result.onclick,undefined);assert.equal(result.target,'');
 }
});
test('main tool, viewer/editor and cross-app routes carry only locale without intercepting ordinary navigation',()=>{
 const routes=[['/main/index.html','lod.html'],['/main/index.html','wireframe.html'],['/main/index.html','pointcloud.html'],['/main/index.html','gaussian.html'],['/main/index.html','generate.html'],['/main/index.html','../cad/cad.html'],['/cad/cad.html','cad-editor.html'],['/cad/cad-editor.html','cad.html'],['/cad/cad.html','../main/index.html'],['/cad/cad-editor.html','../main/index.html']];
 for(const [pathname,target] of routes)for(const lang of ['zh','en']){
  const result=fixture(target+'?file=private&project=123#file=hidden',{pathname,query:'?lang='+lang+'&project=origin&file=source',kind:target.startsWith('../')?'data-app-link':'data-app-route'});
  const expected=new URL(target,'https://account.example'+pathname);expected.search='?lang='+lang;
  assert.equal(result.href,expected.href);assert.deepEqual([...new URL(result.href).searchParams.keys()],['lang']);assert.equal(new URL(result.href).hash,'');assert.equal(result.onclick,undefined);
 }
});
test('actual CAD templates annotate both ordinary viewer/editor entry links for locale propagation',()=>{
 if(config.app!=='cad')return;
 const editor=readFileSync(new URL('src/cad/editor-page.html',root),'utf8'),viewer=readFileSync(new URL('src/pages/cad.html',root),'utf8');
 assert.match(editor,/<a data-app-route="viewer" href="cad.html">‹ CAD 查看器<\/a>/);
 assert.match(viewer,/<a id="cad-editor-link" data-app-route="editor" href="cad-editor.html"/);
 assert.match(editor,/<a data-app-link="mainWeb" href="\{\{mainWeb\}\}">体验更多三维工具<\/a>/);
 assert.match(viewer,/<a class="cad-more-tools" data-app-link="mainWeb" href="\{\{mainWeb\}\}">/);
});
