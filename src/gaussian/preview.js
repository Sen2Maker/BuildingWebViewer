import { gsParseGaussianPly, gsPlyHeader } from './ply.js';

/** Read a bounded, evenly spaced preview. Never retain the complete source in JS memory. */
export async function gsReadPreview(file, {limit=20000, onProgress=()=>{}, cancelled=()=>false}={}) {
  if(!Number.isSafeInteger(limit)||limit<1)throw Error('Invalid preview budget');
  const header=gsPlyHeader(new Uint8Array(await file.slice(0,262144).arrayBuffer()));
  const {count,stride,headerEnd}=header;
  if(!count||!stride||!Number.isSafeInteger(count*stride)||headerEnd+count*stride>file.size)throw Error('高斯 PLY 文件不完整 / Incomplete Gaussian PLY');
  const step=Math.max(1,Math.ceil(count/limit)), size=Math.ceil(count/step);
  const head=new TextEncoder().encode(header.header.replace(/element vertex \d+/,`element vertex ${size}`));
  const bytes=new Uint8Array(head.length+size*stride);bytes.set(head);
  let cache=null,start=-1,end=-1;
  for(let i=0;i<size;i++){
    if(cancelled())throw Error('Preview cancelled');
    const offset=headerEnd+i*step*stride;
    if(offset<start||offset+stride>end){
      start=offset;end=Math.min(file.size,start+Math.max(stride,1048576));
      cache=new Uint8Array(await file.slice(start,end).arrayBuffer());
      if(cache.length!==end-start)throw Error('Incomplete preview read');
      onProgress(i,size);
    }
    bytes.set(cache.subarray(offset-start,offset-start+stride),head.length+i*stride);
  }
  const model=await gsParseGaussianPly(bytes,{includeRest:false,onProgress});
  model.preview=true;model.sampleStep=step;model.sourceCount=count;
  // A preview can never be accidentally exported as the full-resolution source.
  model.source=null;
  return model;
}

export function gsViewingProfile(mode, mobile=false, software=false) {
  if(mode==='auto')mode=(mobile||software)?'light':'full';
  return mode==='points'?{limit:5000,dpr:.75,points:true}:mode==='light'?{limit:20000,dpr:software ? .65 : 1,points:false}:mode==='balanced'?{limit:100000,dpr:1,points:false}:{limit:0,dpr:2,points:false};
}
