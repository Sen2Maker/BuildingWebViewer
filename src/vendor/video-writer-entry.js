// Maintainer-only entry for the pinned offline vendor build. Never loaded by build.py.
import {Output,Mp4OutputFormat,WebMOutputFormat,BufferTarget,StreamTarget,CanvasSource,Quality,canEncodeVideo} from 'mediabunny';
export async function supported(format,{width,height,fps,bitrate}){
 if(typeof globalThis.VideoEncoder==='undefined')return false;
 return canEncodeVideo(format==='mp4'?'avc':'vp8',{width,height,frameRate:fps,quality:new Quality({bitrate})});
}
export async function create(canvas,{format,fps,bitrate,writable=null,maxBytes=128*1024*1024}){
 let canceling=false,exceeded=false,encodedFrames=0;
 const stream=writable?new WritableStream({write:chunk=>writable.write(chunk),close:()=>canceling?writable.abort():writable.close(),abort:r=>writable.abort(r)}):null;
 const target=stream?new StreamTarget(stream,{chunked:true,chunkSize:1024*1024}):new BufferTarget();
 if(!writable)target.on('write',({end})=>{if(end>maxBytes)exceeded=true;});
 const output=new Output({format:format==='mp4'?new Mp4OutputFormat({fastStart:writable?false:'in-memory'}):new WebMOutputFormat(),target});
 const source=new CanvasSource(canvas,{codec:format==='mp4'?'avc':'vp8',quality:new Quality({bitrate}),latencyMode:'quality',keyFrameInterval:2,onEncodedPacket:()=>{encodedFrames++;}});
 output.addVideoTrack(source,{frameRate:fps});await output.start();
 return {get info(){return {encodedFrames,codec:format==='mp4'?'H.264':'VP8'};},async add(index){await source.add(index/fps,1/fps);if(exceeded)throw Error('视频超过 128 MB，请直接写入文件或降低码率 / Video exceeds 128 MB; save directly to disk or reduce bitrate');},async finish(){source.close();await output.finalize();if(exceeded)throw Error('Video exceeds memory output limit');return writable?null:new Blob([target.buffer],{type:format==='mp4'?'video/mp4':'video/webm'});},async cancel(){canceling=true;if(!['canceled','finalized'].includes(output.state))await output.cancel();}};
}
