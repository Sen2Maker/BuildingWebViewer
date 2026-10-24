/** Offline adapter: reuse the viewer's parsers; never silently discard attributes. */
import {openAsBlob,createReadStream} from 'node:fs';
import {lstat,writeFile} from 'node:fs/promises';
import {basename,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {endianness} from 'node:os';
import {readPointCloud} from '../src/cloud/point-io.js';

const [input,output,...flags]=process.argv.slice(2);
try {
  if(!input||!output||flags.some(v=>v!=='--xyz-only'))throw Error('Usage: node read-bwvpc-input.mjs INPUT OUTPUT [--xyz-only]');
  if(!['.xyz','.txt','.csv','.pts','.ply','.pcd'].includes(extname(input).toLowerCase()))throw Error('Unsupported point-cloud format');
  const stat=await lstat(input);
  if(!stat.isFile()||stat.isSymbolicLink()||!stat.size||stat.size>512*1024*1024)throw Error('Input must be a regular file of 1 byte to 512 MiB');
  const blob=await openAsBlob(input),file=new File([blob],basename(input));
  const cloud=await readPointCloud(file,{maxPoints:0});
  if(cloud.count>10000000||cloud.count!==cloud.totalCount)throw Error('Maximum 10000000 points; implicit sampling is not allowed');
  const dropped=Object.keys(cloud.fields).filter(name=>!['x','y','z'].includes(name));
  if(dropped.length&&!flags.includes('--xyz-only'))throw Error('BWVPC v1 stores XYZ only; extra attributes: '+dropped.join(', ')+'. Use --xyz-only to explicitly discard them, or retain the original format.');
  const hash=createHash('sha256');for await(const bytes of createReadStream(input))hash.update(bytes);
  let positions=Buffer.from(cloud.positions.buffer,cloud.positions.byteOffset,cloud.positions.byteLength);
  if(endianness()!=='LE'){positions=Buffer.from(positions);positions.swap64();}
  await writeFile(output,positions,{flag:'wx'});
  process.stdout.write(JSON.stringify({points:cloud.count,source_bytes:stat.size,source_sha256:hash.digest('hex'),discarded_attributes:dropped,notes:cloud.notes}));
}catch(error){process.stderr.write((error.message||String(error))+'\n');process.exitCode=1;}
