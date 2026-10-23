import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchBounded,normalizeManifest} from '../src/shared/online-preview-core.js';
import {parseOBJ} from '../src/lod/obj-parser.js';
import {readPointCloud,parseWireOBJ} from '../src/cloud/point-io.js';
test('selected remote XYZ bytes enter existing real point parser, not other index resources',async()=>{
 const entries=normalizeManifest({schemaVersion:1,datasets:[{id:'points',viewer:'pointcloud',format:'xyz',url:'https://data.example/points.xyz'},{id:'mesh',viewer:'lod',format:'obj',url:'https://data.example/model.obj'}]});
 const calls=[],bytes=await fetchBounded(entries[0].url,{fetchImpl:async url=>{calls.push(url);return new Response('1 2 3\n4 5 6\n');}});
 const cloud=await readPointCloud(new File([bytes],'points.xyz'),{});assert.equal(cloud.count,2);assert.deepEqual(calls,['https://data.example/points.xyz']);
});
test('selected OBJ uses existing mesh and wire parsers without material side fetches',async()=>{let calls=0;const bytes=await fetchBounded('https://data.example/model.obj',{fetchImpl:async()=>{calls++;return new Response('mtllib private.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n',{headers:{'Content-Type':'application/x-tgif'}});}});const text=new TextDecoder().decode(bytes);assert.equal(parseOBJ(text,'test',bytes.length).stats.triangles,1);assert.ok(parseWireOBJ(text,'test'));assert.equal(calls,1);});
