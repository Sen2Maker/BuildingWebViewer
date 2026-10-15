import {caValidateProject,caFrameCount,caSample,caSerialize} from './camera-animation.js';
import {createStoreZip} from './zip-writer.js';

/** Deterministic frame production: wall-clock playback speed never drops exported frames. */
export async function caRunFrames({project,render,write,signal,onProgress=()=>{},guard=()=>true,yieldTask=()=>new Promise(r=>setTimeout(r,0))}){
 const checked=caValidateProject(project),total=caFrameCount(checked.duration,checked.fps);if(!checked.keys.length)throw Error('请先添加关键帧 / Add a keyframe first');
 for(let index=0;index<total;index++){
  if(signal?.aborted)throw new DOMException('已取消 / Canceled','AbortError');if(!guard())throw Error('模型或布局已改变，导出已停止；请重新加载动画对应的场景 / Scene changed; export stopped');
  const frame=await render(caSample(checked,index+1),index);await write(frame,index,index/checked.fps,1/checked.fps);onProgress(index+1,total);await yieldTask();
 }
 if(signal?.aborted)throw new DOMException('已取消 / Canceled','AbortError');
 return total;
}
let caWriterPromise;
export function caLoadVideoWriter(){
 if(globalThis.BWVVideoWriter)return Promise.resolve(globalThis.BWVVideoWriter);
 if(!caWriterPromise)caWriterPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('assets/vendor/video-writer.js?v='+encodeURIComponent(document.querySelector('meta[name="application-build"]')?.content||'preview'),document.baseURI).href;script.onload=()=>globalThis.BWVVideoWriter?resolve(globalThis.BWVVideoWriter):reject(Error('视频编码模块未就绪 / Video encoder unavailable'));script.onerror=()=>reject(Error('无法加载本地视频编码模块 / Cannot load the local video encoder'));document.head.append(script);}).catch(e=>{caWriterPromise=null;throw e;});return caWriterPromise;
}
export async function caExportAnimation({project,adapter,width,height,format='mp4',bitrate=8e6,signal,onProgress=()=>{},writable=null,includeGuides=false}){
 if(!['mp4','webm','png'].includes(format)||!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64||width>4096||height>4096||width%2||height%2||width*height>3840*2160||!Number.isFinite(bitrate)||bitrate<100000||bitrate>100e6)throw Error('视频尺寸需为 64–4096 的偶数，总像素不超过 4K；码率为 0.1–100 Mbps / Invalid video size or bitrate');
 project=caValidateProject(project);if(!project.keys.length)throw Error('请先添加关键帧 / Add keyframes first');adapter.assert(project.keys[0].snapshot);
 if(!writable&&format!=='png'&&bitrate*project.duration/8>112*1024*1024)throw Error('预计视频较大，请直接写入文件或降低时长 / Large video: save directly to disk or reduce duration');
 let writer=null,session=null;const cancelWriter=()=>{writer?.cancel().catch(()=>{});};const guard=adapter.guard(),before=adapter.capture(),parts=[],limit=128*1024*1024;let size=0,pngFrames=0;
 try{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('无法创建导出画布 / Cannot create video canvas');
  if(format==='png'){
   const zip=createStoreZip({maxBytes:writable?0xffffffff:limit,write:async bytes=>{if(writable)await writable.write(bytes);else{size+=bytes.byteLength;if(size>limit)throw Error('帧序列超过 128 MB，请直接写入文件 / Sequence exceeds 128 MB; save directly to disk');parts.push(bytes);}}});
   await zip.add('animation.json',new TextEncoder().encode(caSerialize(project)));
   await zip.add('README.txt',new TextEncoder().encode(`BWV camera frame sequence\nFPS: ${project.fps}\nFrames: ${caFrameCount(project.duration,project.fps)}\nDuration: ${project.duration} seconds\nframe_000001.png is time 0. Import as a PNG image sequence at the FPS above.\n`));
   writer={get info(){return {encodedFrames:pngFrames,codec:'PNG'};},async add(i){const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG encoding failed')),'image/png'));await zip.add(`frame_${String(i+1).padStart(6,'0')}.png`,blob);pngFrames++;},async finish(){await zip.close();if(writable){await writable.close();return null;}return new Blob(parts,{type:'application/zip'});},async cancel(){parts.length=0;await writable?.abort().catch(()=>{});}};
  }else{
   const vendor=await caLoadVideoWriter();if(!await vendor.supported(format,{width,height,fps:project.fps,bitrate}))throw Error(`浏览器不支持此尺寸的 ${format.toUpperCase()} 编码，请改用 WebM、PNG 帧序列或降低尺寸 / This codec/size is unsupported; try WebM, PNG sequence or a smaller frame`);
   writer=await vendor.create(canvas,{format,fps:project.fps,bitrate,writable,maxBytes:limit});
  }
  session=adapter.createCapture(width,height);signal?.addEventListener('abort',cancelWriter,{once:true});
  await caRunFrames({project,signal,guard,onProgress,render:snapshot=>{adapter.apply(snapshot,{render:false});ctx.putImageData(new ImageData(session.render(),width,height),0,0);if(includeGuides)adapter.drawGuides?.(ctx,width,height);return canvas;},write:(_,i)=>writer.add(i)});
  const result=await writer.finish();if(writer.info.encodedFrames!==caFrameCount(project.duration,project.fps))throw Error('实际编码帧数与时间轴不符 / Encoded frame count mismatch');if(signal?.aborted)throw new DOMException('Canceled','AbortError');return {blob:result,info:{...writer.info,width,height,fps:project.fps,duration:project.duration}};
 }catch(e){await writer?.cancel().catch(()=>{});if(!writer)await writable?.abort().catch(()=>{});throw e;}
 finally{signal?.removeEventListener('abort',cancelWriter);session?.dispose();if(guard())adapter.apply(before);}
}
