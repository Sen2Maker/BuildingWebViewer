import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobileHomeNavigation} from '../src/shared/mobile-navigation.js';
test('Back waits for disk save, retains English and coalesces rapid presses',async()=>{
 let finish, saves=0;const urls=[];
 const back=createMobileHomeNavigation({flush:()=>{saves++;return new Promise(r=>finish=r);},navigate:url=>urls.push(url),language:()=> 'en'});
 const first=back(),second=back();assert.equal(first,second);await Promise.resolve();assert.equal(saves,1);assert.deepEqual(urls,[]);
 finish();await first;assert.deepEqual(urls,['assets/mobile/index.html?lang=en']);
});
test('failed saving stays in viewer and allows retry',async()=>{
 let fail=true;const urls=[];const back=createMobileHomeNavigation({flush:async()=>{if(fail)throw Error('disk full');},navigate:url=>urls.push(url)});
 await assert.rejects(back(),/disk full/);assert.deepEqual(urls,[]);fail=false;await back();assert.deepEqual(urls,['assets/mobile/index.html?lang=zh']);
});
