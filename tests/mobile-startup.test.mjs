import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('Capacitor concatenates start path: local home must retain localhost authority',()=>{
 const c=JSON.parse(fs.readFileSync(new URL('../mobile/capacitor.config.json',import.meta.url)));
 assert.ok(c.server.appStartPath.startsWith('/'));
 const url=new URL(`${c.server.androidScheme}://${c.server.hostname||'localhost'}${c.server.appStartPath}`);
 assert.equal(url.hostname,'localhost');assert.equal(url.pathname,'/assets/mobile/index.html');
 assert.ok(fs.existsSync(new URL('../assets/mobile/index.html',import.meta.url)));
 assert.equal(c.server.url,undefined,'Cold start must never use a remote URL');
});
