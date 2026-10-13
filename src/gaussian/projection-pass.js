/** WebGL2 transform feedback computes the same projection/color once per splat.
 * No CPU readback, quantization or population reduction. Direct rendering remains
 * available on allocation/driver failure and for lightweight point previews. */
export const GS_PROJECTED_BYTES=44;
export const GS_PROJECTED_LIMIT=96*1024*1024;
export const GS_PROJECTED_VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aClip;
layout(location=2) in vec2 aAxisX;
layout(location=3) in vec2 aAxisY;
layout(location=4) in vec4 aColor;
out vec4 vColor;
out vec2 vPos;
void main(){gl_Position=vec4(aClip.xy+aCorner.x*aAxisX+aCorner.y*aAxisY,0.0,1.0);vColor=aColor;vPos=aCorner*aClip.z;}`;
export function gsProjectionCapacity(count){return Number.isSafeInteger(count)&&count>0&&count*GS_PROJECTED_BYTES<=GS_PROJECTED_LIMIT;}
export class GaussianProjectionPass {
 constructor(gl,vertex,fragment,corners){
  this.gl=gl;this.count=0;this.programs=[];this.buffers=[];this.vaos=[];
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(error);}return s;};
  const program=(vs,feedback)=>{const p=gl.createProgram();this.programs.push(p);const shaders=[];try{shaders.push(shader(gl.VERTEX_SHADER,vs));shaders.push(shader(gl.FRAGMENT_SHADER,fragment));for(const s of shaders)gl.attachShader(p,s);if(feedback)gl.transformFeedbackVaryings(p,['gClip','gAxisX','gAxisY','vColor'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}finally{for(const s of shaders)gl.deleteShader(s);}};
  try{
   this.project=program(vertex,true);this.draw=program(GS_PROJECTED_VERTEX,false);
   this.output=gl.createBuffer();this.buffers.push(this.output);this.feedback=gl.createTransformFeedback();
   this.projectVAO=gl.createVertexArray();this.drawVAO=gl.createVertexArray();this.vaos.push(this.projectVAO,this.drawVAO);
   gl.bindVertexArray(this.drawVAO);gl.bindBuffer(gl.ARRAY_BUFFER,corners);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
   gl.bindBuffer(gl.ARRAY_BUFFER,this.output);
   for(const [index,size,offset]of [[1,3,0],[2,2,12],[3,2,20],[4,4,28]]){gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,GS_PROJECTED_BYTES,offset);gl.vertexAttribDivisor(index,1);}
   gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
  }catch(e){this.dispose();throw e;}
 }
 prepare(count){
  if(!gsProjectionCapacity(count))return false;
  if(this.count===count)return true;
  const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.output);gl.bufferData(gl.ARRAY_BUFFER,count*GS_PROJECTED_BYTES,gl.DYNAMIC_COPY);
  // One allocation-time query, never a per-frame driver query.
  const valid=gl.getBufferParameter(gl.ARRAY_BUFFER,gl.BUFFER_SIZE)===count*GS_PROJECTED_BYTES;
  gl.bindBuffer(gl.ARRAY_BUFFER,null);if(valid)this.count=count;return valid;
 }
 projectAndDraw(count){
  const gl=this.gl;
  gl.bindVertexArray(this.projectVAO);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,this.feedback);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,this.output);gl.enable(gl.RASTERIZER_DISCARD);
  gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,count);gl.endTransformFeedback();
  gl.disable(gl.RASTERIZER_DISCARD);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);
  gl.useProgram(this.draw);gl.bindVertexArray(this.drawVAO);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,count);gl.bindVertexArray(null);
 }
 get allocatedBytes(){return this.count*GS_PROJECTED_BYTES;}
 release(){this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.output);this.gl.bufferData(this.gl.ARRAY_BUFFER,0,this.gl.DYNAMIC_COPY);this.gl.bindBuffer(this.gl.ARRAY_BUFFER,null);this.count=0;}
 dispose(){const gl=this.gl;gl.bindVertexArray(null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);for(const p of this.programs)gl.deleteProgram(p);for(const b of this.buffers)gl.deleteBuffer(b);for(const v of this.vaos)gl.deleteVertexArray(v);if(this.feedback)gl.deleteTransformFeedback(this.feedback);}
}
