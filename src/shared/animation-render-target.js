import {validateImageSize} from './image-export.js';
/** One reusable offscreen target per export, shared by future renderer adapters. */
export function createAnimationRenderTarget(viewer,width,height){
 const gl=viewer.gl;if(viewer.disposed||viewer.contextLost||gl.isContextLost())throw Error('渲染器不可用 / Renderer unavailable');
 validateImageSize(width,height,Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)));
 const previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),fb=gl.createFramebuffer(),texture=gl.createTexture(),depth=gl.createRenderbuffer();
 const raw=new Uint8Array(width*height*4),pixels=new Uint8ClampedArray(raw.length);let disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;gl.deleteFramebuffer(fb);gl.deleteTexture(texture);gl.deleteRenderbuffer(depth);};
 try{
  gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,width,height);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('无法分配导出画面，请降低分辨率 / Cannot allocate video frame; reduce resolution');
 }catch(e){dispose();throw e;}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previous);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);}
 return {render(){
  if(disposed||viewer.contextLost||gl.isContextLost())throw Error('视频渲染已中断 / Video rendering interrupted');
  const before=gl.getParameter(gl.FRAMEBUFFER_BINDING),target=viewer.exportTarget;
  try{viewer.exportTarget={width,height,transparent:false,scale:height/Math.max(1,viewer.canvas.clientHeight)};gl.bindFramebuffer(gl.FRAMEBUFFER,fb);viewer.render();gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,raw);if(gl.getError()!==gl.NO_ERROR)throw Error('视频帧读取失败 / Frame readback failed');
   const stride=width*4;for(let y=0;y<height;y++)pixels.set(raw.subarray((height-y-1)*stride,(height-y)*stride),y*stride);return pixels;
  }finally{viewer.exportTarget=target;gl.bindFramebuffer(gl.FRAMEBUFFER,before);}
 },dispose};
}
