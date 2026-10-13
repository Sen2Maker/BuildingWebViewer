// Bundled worker code: no CDN or network dependency. A generation rejects stale results.
export const GS_SORT_WORKER = `
let centers=null, generation=0,keys,src,dst,recycled=null;const counts=new Uint32Array(256);
const f=new Float32Array(1),u=new Uint32Array(f.buffer);
onmessage=e=>{
 const m=e.data;
 if(m.type==='recycle'){if(m.generation===generation&&centers&&m.order.byteLength===centers.length/3*4)recycled=m.order;return;}
 if(m.type==='data'){centers=new Float32Array(m.centers);generation=m.generation;const n=centers.length/3;keys=new Uint32Array(n);src=new Uint32Array(n);dst=new Uint32Array(n);recycled=null;return;}
 if(!centers||m.generation!==generation)return;
 const started=performance.now(), n=centers.length/3;
 for(let i=0;i<n;i++){f[0]=centers[i*3]*m.forward[0]+centers[i*3+1]*m.forward[1]+centers[i*3+2]*m.forward[2];const b=u[0];keys[i]=(b&0x80000000?~b:b|0x80000000)>>>0;src[i]=i;}
 for(let s=0;s<32;s+=8){counts.fill(0);for(let i=0;i<n;i++)counts[(keys[src[i]]>>>s)&255]++;let sum=0;for(let b=0;b<256;b++){const c=counts[b];counts[b]=sum;sum+=c;}for(let i=0;i<n;i++){const id=src[i];dst[counts[(keys[id]>>>s)&255]++]=id;}const t=src;src=dst;dst=t;}
 const order=recycled?new Uint32Array(recycled):new Uint32Array(n);recycled=null;order.set(src);postMessage({generation,forward:m.forward,sortMs:performance.now()-started,order:order.buffer},[order.buffer]);
};`;
