import assert from 'node:assert/strict';
import {resolveLanguage,setLanguage,t,initializeLocale,translateTree} from '../src/shared/i18n.js';
import {EN_MESSAGES} from '../src/locales/en.js';
assert.equal(resolveLanguage('?lang=en','zh'),'en');
assert.equal(resolveLanguage('?lang=fr','en'),'en');
assert.equal(resolveLanguage('',null),'zh');
for(const [source,target] of Object.entries(EN_MESSAGES)) {
  assert(target.trim(),`Missing translation: ${source}`);
  assert.deepEqual((source.match(/\{\d+\}/g)||[]).sort(),(target.match(/\{\d+\}/g)||[]).sort(),`Placeholder mismatch: ${source}`);
}
setLanguage('en');
assert.equal(t('楼栋 {0}', ['中文文件名']), 'Building 中文文件名');
assert.equal(t('楼栋 {0}', ['{1}']), 'Building {1}');
assert.equal(t('用户自定义标签'),'用户自定义标签');
const link={href:'pointcloud.html',getAttribute(){return this.href;},setAttribute(k,v){this.href=v;}};
const doc={nodeType:9,documentElement:{},baseURI:'https://example.org/BuildingWebViewer/index.html',childNodes:[],querySelectorAll(){return [link];}};
initializeLocale(doc); assert.equal(link.href,'pointcloud.html?lang=en');assert.equal(doc.documentElement.lang,'en');
setLanguage('zh');initializeLocale(doc);assert.equal(link.href,'pointcloud.html?lang=zh');
setLanguage('en');initializeLocale(doc);assert.equal(link.href,'pointcloud.html?lang=en');
const node={nodeType:3,nodeValue:'  点云查看器  '};
const root={nodeType:11,childNodes:[node]};translateTree(root);assert.equal(node.nodeValue,'  Point Cloud Viewer  ');
setLanguage('zh');translateTree(root);assert.equal(node.nodeValue,'  点云查看器  ');
console.log('PASS locale precedence, persistent links, reversible text and interpolation integrity');

// Restore the source title before translating so switching back to Chinese is reversible.
globalThis.BuildingViewerBoot = {sourceTitle:'原始标题',ready(){}};
initializeLocale(doc);assert.equal(doc.title,'原始标题');
delete globalThis.BuildingViewerBoot;
assert.equal(t('toString'),'toString');
