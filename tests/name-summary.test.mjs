import test from 'node:test';
import assert from 'node:assert/strict';
import {compactNames,setNameSummary} from '../src/shared/name-summary.js';
test('multi-file labels stay bounded for thousands of wireframe IDs and long names',()=>{
 const names=Array.from({length:2000},(_,i)=>`${i}/`+'very-long-file-name'.repeat(30)+'.obj');
 const value=compactNames(names);assert(Array.from(value).length<=96);assert(value.endsWith('(+1998)'));assert(value.includes('0/'));assert(value.includes('1/'));
 const element={};setNameSummary(element,names);assert.equal(element.textContent,value);assert(Array.from(element.title).length<=1024);assert(element.title.endsWith('(+1992)'));
});
test('single labels, empty selections and Unicode names remain safe',()=>{
 assert.equal(compactNames(['42/raw.obj']),'42/raw.obj');assert.equal(compactNames([]),'');
 const element={title:'stale'};setNameSummary(element,[],'Empty');assert.equal(element.textContent,'Empty');assert.equal(element.title,'');
 const value=compactNames(['🏠'.repeat(200)]);assert(Array.from(value).length<=96);assert(!value.includes('\ufffd'));
 assert.equal(compactNames(['<img src=x onerror=alert(1)>']),'<img src=x onerror=alert(1)>');
});
