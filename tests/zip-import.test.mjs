import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {safeArchivePath,zipCRC32,readZipDirectory,expandProjectArchives,archiveImportQueue} from '../src/shared/zip-import.js';
globalThis.File ||= File;
function fixture(name='sample/A.xyz',text='1 2 3 4\n',{badCRC=false,flags=0,length}={}){
 const n=Buffer.from(name),b=Buffer.from(text),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22),crc=zipCRC32(b)+(badCRC?1:0);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(flags,6);local.writeUInt32LE(crc>>>0,14);local.writeUInt32LE(b.length,18);local.writeUInt32LE(length??b.length,22);local.writeUInt16LE(n.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt16LE(flags,8);central.writeUInt32LE(crc>>>0,16);central.writeUInt32LE(b.length,20);central.writeUInt32LE(length??b.length,24);central.writeUInt16LE(n.length,28);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(46+n.length,12);end.writeUInt32LE(30+n.length+b.length,16);
 return new File([local,n,b,central,n,end],'bundle.zip',{lastModified:123});
}
test('ZIP preserves folder hierarchy, point text and metadata',async()=>{
 assert.equal(zipCRC32(Buffer.from('123456789')),0xcbf43926);
 const records=await expandProjectArchives([{file:fixture(),path:'imports/bundle.zip'}],name=>name.endsWith('.xyz'));
 assert.equal(records[0].path,'imports/bundle/sample/A.xyz');assert.equal(await records[0].file.text(),'1 2 3 4\n');assert.equal(records[0].file.lastModified,123);
 assert.deepEqual(await expandProjectArchives([{file:fixture()}],name=>name.endsWith('.obj')),[]);
});
test('unsafe, corrupt, encrypted and oversized archives fail before insertion',async()=>{
 for(const path of ['../A.xyz','/A.xyz','C:\\A.xyz','x/../A.xyz','a\0b'])assert.throws(()=>safeArchivePath(path));
 for(const file of [fixture('../A.xyz'),fixture('A.xyz','data',{badCRC:true}),fixture('A.xyz','data',{flags:1}),fixture('A.xyz','data',{length:600*1024*1024})])await assert.rejects(expandProjectArchives([{file}],()=>true));
 await assert.rejects(readZipDirectory(new File(['broken'],'bad.zip')));
});
test('failed ZIP import is atomic and does not block the next batch',async()=>{
 let inserted=[];const add=archiveImportQueue({accepts:()=>true,receive:records=>{inserted.push(...records);return {added:records.length};}});
 await assert.rejects(add([{file:new File(['plain'],'first.xyz')},{file:fixture('bad.xyz','data',{badCRC:true})}]));assert.equal(inserted.length,0);
 assert.deepEqual(await add([{file:fixture()}]),{added:1});assert.equal(inserted.length,1);
});
