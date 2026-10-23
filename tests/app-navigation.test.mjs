import test from 'node:test';
import assert from 'node:assert/strict';
import {appLinkURL,initializeAppLinks} from '../src/shared/app-navigation.js';
import {initializeLocale,setLanguage} from '../src/shared/i18n.js';
const base='https://example.test/Main/index.html';
function link(href, app=false, target=''){return {href,target,rel:'',hasAttribute:name=>name==='data-app-link'&&app,getAttribute(name){return name==='href'?this.href:null},setAttribute(name,value){this[name]=value}};}
function doc(links){return {nodeType:9,documentElement:{lang:'zh-CN'},baseURI:base,childNodes:[],querySelectorAll(selector){return selector==='a[data-app-link], a[data-app-route]'?links.filter(l=>l.hasAttribute('data-app-link')):links;}};}
test('cross-app URL transfers only explicit supported language, never file/project/auth parameters or hashes',()=>{
 const url=new URL(appLinkURL('../Cad/cad.html?file=secret.dwg&project=42#token',base,'?lang=en&project=secret&file=private'));
 assert.equal(url.href,'https://example.test/Cad/cad.html?lang=en');
 for(const query of ['','?lang=fr','?lang=zh&file=x'])assert.equal(new URL(appLinkURL('../Cad/cad.html',base,query)).search,query.includes('lang=zh')?'?lang=zh':'');
 assert.throws(()=>appLinkURL('javascript:alert(1)',base),/Unsupported/);
});
test('same-origin different repository links are not collapsed into the current app',()=>{
 const cad=link('../Cad/cad.html',true),external=link('https://elsewhere.test/index.html'),local=link('pointcloud.html'),unmarked=link('../Other/index.html');
 setLanguage('en');initializeLocale(doc([cad,external,local,unmarked]));
 assert.equal(cad.href,'https://example.test/Cad/cad.html?lang=en');
 assert.equal(external.href,'https://elsewhere.test/index.html');assert.equal(local.href,'pointcloud.html?lang=en');assert.equal(unmarked.href,'../Other/index.html');
 setLanguage('zh');initializeLocale(doc([cad]));assert.equal(cad.href,'https://example.test/Cad/cad.html?lang=zh');
});
test('ordinary same-tab navigation is not intercepted; optional new tabs receive noopener',()=>{
 const same=link('../Cad/cad.html',true),blank=link('../Cad/cad.html',true,'_blank');
 initializeAppLinks(doc([same,blank]),{search:'?lang=en&project=private'});
 assert.equal(same.target,'');assert.equal(same.onclick,undefined);assert.equal(blank.rel,'noopener noreferrer');
});
