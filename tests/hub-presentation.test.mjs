import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('six hub tools share an illustration slot without changing the external CAD route',()=>{
 const cards=read('src/pages/index.html').match(/<a class="tool [\s\S]*?<\/a>/g);
 assert.equal(cards.length,6);
 for(const card of cards)assert.equal((card.match(/<img class="art"/g)||[]).length,1);
 assert.match(cards[5],/data-app-link="cadWeb" href="\{\{cadWeb\}\}"/);
 assert.match(cards[5],/src="assets\/icons\/drafting.svg" alt="" width="200" height="168"/);
 const config=JSON.parse(read('app.config.json'));
 assert.ok(config.assets.includes('assets/icons/drafting.svg'));
 assert.match(read('assets/icons/drafting.svg'),/viewBox="0 0 200 168"/);
});
test('all six web pages use the shared attribution footer, with links kept in normal flow',()=>{
 for(const page of ['index','lod','wireframe','pointcloud','gaussian','generate']){
  const source=read(`src/pages/${page}.html`);
  assert.equal((source.match(/<!-- site-footer:start -->/g)||[]).length,1,page);
  assert.ok(source.includes('assets/css/site-footer.css'),page);
 }
 const template=read('src/shared/site-footer.html'), generator=read('scripts/prepare.py');
 assert.match(template,/© 2026 \{\{account\}\}/);
 assert.match(template,/href="\{\{author\}\}"/);
 assert.match(template,/href="\{\{repository\}\}"/);
 assert.match(template,/href="\.\/assets\/mobile\/notices.html"/);
 assert.match(generator,/src\/shared\/site-footer.html/);
 assert.doesNotMatch(generator,/Local extraction candidate · not published/);
 const css=read('assets/css/site-footer.css');
 assert.match(css,/flex-wrap:wrap/);assert.match(css,/justify-content:flex-end/);
 assert.doesNotMatch(css,/position\s*:\s*(fixed|absolute)/);
});
