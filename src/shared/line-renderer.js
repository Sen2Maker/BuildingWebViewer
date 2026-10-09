import { rgbHex } from './render-style.js';
/** Instanced tubes share existing endpoint buffers; no mesh per edge is allocated. */
export class StyledLineRenderer {
  constructor(gl) { this.gl=gl; this.ext=gl.getExtension('ANGLE_instanced_arrays'); this.program=null; }
  init() {
    if(this.program || !this.ext) return;
    const gl=this.gl;
    const vertex=`precision highp float;
attribute vec3 radial; attribute vec3 startPoint; attribute vec3 endPoint;
uniform mat4 matrix; uniform vec3 offset; uniform float radius;
varying vec3 n; varying float along;
void main(){vec3 d=endPoint-startPoint;float len=length(d);vec3 axis=len>0.0000001?d/len:vec3(0.,0.,1.);
vec3 side=normalize(cross(axis,abs(axis.z)<.9?vec3(0.,0.,1.):vec3(0.,1.,0.)));vec3 other=cross(axis,side);
n=side*radial.x+other*radial.y;along=radial.z;
vec3 p=mix(startPoint,endPoint,along)+offset+n*radius;
gl_Position=len>0.0000001?matrix*vec4(p,1.):vec4(2.,2.,2.,1.);}`;
    const fragment=`precision mediump float;
varying vec3 n; varying float along;uniform vec3 colorA;uniform vec3 colorB;
void main(){float light=.48+.52*abs(dot(n/max(length(n),.00001),normalize(vec3(-.5,-.7,1.1))));gl_FragColor=vec4(mix(colorA,colorB,along)*light,1.);}`;
    const shaders=[];
    try {
      for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));}
      const p=gl.createProgram();gl.attachShader(p,shaders[0]);gl.attachShader(p,shaders[1]);gl.linkProgram(p);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS)){const error=gl.getProgramInfoLog(p);gl.deleteProgram(p);throw Error(error);}
      this.program=p;this.loc={};
      for(const name of ['radial','startPoint','endPoint'])this.loc[name]=gl.getAttribLocation(p,name);
      for(const name of ['matrix','offset','radius','colorA','colorB'])this.loc[name]=gl.getUniformLocation(p,name);
      this.shapes={};
      for(const [name,sides] of [['cylinder',12],['box',4]]){
        const values=[], point=(i,z)=>[Math.cos(i*2*Math.PI/sides),Math.sin(i*2*Math.PI/sides),z];
        for(let i=0;i<sides;i++){
          values.push(...point(i,0),...point(i+1,0),...point(i,1),...point(i,1),...point(i+1,0),...point(i+1,1));
          // Flat end caps; radial normal is adequate for this compact illustrative style.
          values.push(0,0,0,...point(i+1,0),...point(i,0),0,0,1,...point(i,1),...point(i+1,1));
        }
        const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);
        this.shapes[name]={buffer,count:values.length/3,byteLength:values.length*4};
      }
    } finally {for(const shader of shaders)gl.deleteShader(shader);}
  }
  draw({buffer,stride=12,matrix,offset=[0,0,0],radius,style='cylinder',color=[.3,.4,.5],endColor=null}) {
    if(!buffer?.count || !this.ext)return false;
    this.init(); const gl=this.gl,loc=this.loc,shape=this.shapes[style]||this.shapes.cylinder;
    // Other programs use overlapping attribute locations; reset before drawing.
    const max=gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    for(let i=0;i<max;i++){gl.disableVertexAttribArray(i);this.ext.vertexAttribDivisorANGLE(i,0);}
    gl.useProgram(this.program);gl.uniformMatrix4fv(loc.matrix,false,matrix);gl.uniform3fv(loc.offset,offset);gl.uniform1f(loc.radius,radius);
    gl.uniform3fv(loc.colorA,color);gl.uniform3fv(loc.colorB,endColor?rgbHex(endColor):color);
    gl.bindBuffer(gl.ARRAY_BUFFER,shape.buffer);gl.enableVertexAttribArray(loc.radial);gl.vertexAttribPointer(loc.radial,3,gl.FLOAT,false,12,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer.buffer);
    for(const [name,at] of [['startPoint',0],['endPoint',stride]]){gl.enableVertexAttribArray(loc[name]);gl.vertexAttribPointer(loc[name],3,gl.FLOAT,false,stride*2,at);this.ext.vertexAttribDivisorANGLE(loc[name],1);}
    gl.depthMask(true);this.ext.drawArraysInstancedANGLE(gl.TRIANGLES,0,shape.count,Math.floor(buffer.count/2));
    for(const name of ['radial','startPoint','endPoint']){this.ext.vertexAttribDivisorANGLE(loc[name],0);gl.disableVertexAttribArray(loc[name]);}
    return true;
  }
  dispose(){if(this.program)this.gl.deleteProgram(this.program);for(const shape of Object.values(this.shapes||{}))this.gl.deleteBuffer(shape.buffer);}
}
