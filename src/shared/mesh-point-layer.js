import { pointDisplayColors } from './point-display-colors.js';
import { rgbHex } from './render-style.js';
/** A point pass in the mesh WebGL context: shared depth, camera and export target. */
export class MeshPointLayer {
  constructor(gl) {
    this.gl=gl;this.entries=[];this.colorKey='';
    const shaders=[
      [gl.VERTEX_SHADER,'attribute vec3 position;attribute vec3 color;uniform mat4 matrix;uniform float size;varying vec3 rgb;void main(){gl_Position=matrix*vec4(position,1.0);gl_PointSize=size;rgb=color;}'],
      [gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 rgb;uniform float opacity;uniform int style;void main(){float r=length(gl_PointCoord-vec2(.5));if(style!=1&&r>.5)discard;float a=style==1?1.:1.-smoothstep(.4,.5,r);vec3 c=rgb;if(style==2){vec2 xy=(gl_PointCoord-vec2(.5))*2.;vec3 n=vec3(xy,-sqrt(max(0.,1.-dot(xy,xy))));c*=.4+.6*abs(dot(n,normalize(vec3(-.4,.6,1.))));}gl_FragColor=vec4(c,opacity*a);}']
    ].map(([type,source])=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(error);}return shader;});
    this.program=gl.createProgram();for(const s of shaders)gl.attachShader(this.program,s);gl.linkProgram(this.program);for(const s of shaders)gl.deleteShader(s);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
    this.loc={};for(const k of ['matrix','size','opacity','style'])this.loc[k]=gl.getUniformLocation(this.program,k);for(const k of ['position','color'])this.loc[k]=gl.getAttribLocation(this.program,k);
    this.maxSize=gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];this.attributes=gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
  }
  clear(){for(const e of this.entries){this.gl.deleteBuffer(e.position);this.gl.deleteBuffer(e.color);}this.entries=[];this.colorKey='';}
  buffer(values){const gl=this.gl,b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);if(gl.getError()===gl.OUT_OF_MEMORY){gl.deleteBuffer(b);throw Error('点云显存不足 / Point buffer allocation failed');}return b;}
  setItems(items,placements){
    const gl=this.gl,next=[];
    try{for(const item of items){const transform=placements.get(String(item.id));if(!transform)continue;
      const old=this.entries.find(e=>e.item.cloud===item.cloud&&e.item.id===item.id&&JSON.stringify(e.transform)===JSON.stringify(transform));
      if(old){old.item=item;next.push(old);continue;}
      const position=new Float32Array(item.cloud.count*3);
      for(let i=0;i<position.length;i++)position[i]=(item.cloud.positions[i]-transform.origin[i%3])*transform.scale+transform.center[i%3];
      const e={item,transform,position:this.buffer(position),color:null,count:item.cloud.count,bytes:position.byteLength*2};next.push(e);e.color=this.buffer(new Float32Array(position.length));
    }}catch(error){for(const e of next)if(!this.entries.includes(e)){gl.deleteBuffer(e.position);if(e.color)gl.deleteBuffer(e.color);}throw error;}
    for(const e of this.entries)if(!next.includes(e)){gl.deleteBuffer(e.position);gl.deleteBuffer(e.color);}this.entries=next;this.colorKey='';
  }
  setOptions(options){
    this.options=options;
    const key=JSON.stringify([options.pointColorMode,options.pointColor,options.palette,options.reverse,options.pointRgbFields,options.range]);if(key===this.colorKey)return;
    const mode=options.pointColorMode||'height',field=mode.startsWith('field:')?mode.slice(6):null;
    let min=Infinity,max=-Infinity;
    if(mode==='height'||field)for(const e of this.entries){const cloud=e.item.cloud,values=field?cloud.fields?.[field]:null;if(field&&!values)continue;
      if(mode==='height'&&e.item.colorBounds){min=Math.min(min,e.item.colorBounds[0][2]);max=Math.max(max,e.item.colorBounds[1][2]);continue;}
      for(let i=0;i<cloud.count;i++){const v=field?values[i]:cloud.positions[i*3+2];if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}}}
    this.fallbacks=[];this.colorRange=min<=max?(options.range?{...options.range}:{min,max}):null;this.effectiveColorMode=mode;
    for(const e of this.entries){
      const range=this.colorRange||options.range||(e.item.colorBounds?{min:e.item.colorBounds[0][2],max:e.item.colorBounds[1][2]}:null);
      const entryColorKey=JSON.stringify([key,range]);
      if(e.colorKey===entryColorKey){if(e.fallback)this.fallbacks.push(e.fallback);continue;}const result=pointDisplayColors(e.item.cloud,e.count,{colorMode:mode,rgbFields:options.pointRgbFields,palette:options.palette,reverse:options.reverse,range});
      if(mode==='solid'){const color=rgbHex(options.pointColor||'#547d99');for(let i=0;i<e.count;i++)result.values.set(color,i*3);}
      e.fallback=result.fallback;e.colorKey=entryColorKey;if(result.fallback)this.fallbacks.push(result.fallback);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER,e.color);this.gl.bufferData(this.gl.ARRAY_BUFFER,result.values,this.gl.STATIC_DRAW);
    }this.colorKey=key;
  }
  draw(matrix,dpr){
    const gl=this.gl,o=this.options||{},l=this.loc;if(o.showPoints===false||!this.entries.length)return;
    // Mesh and styled-line passes may have other enabled attributes with shorter buffers.
    for(let i=0;i<this.attributes;i++)gl.disableVertexAttribArray(i);
    gl.useProgram(this.program);gl.uniformMatrix4fv(l.matrix,false,matrix);gl.uniform1f(l.size,Math.min(this.maxSize,Math.max(.5,Number(o.pointSize)||2)*dpr));gl.uniform1f(l.opacity,o.pointOpacity??1);gl.uniform1i(l.style,o.pointStyle==='square'?1:o.pointStyle==='sphere'?2:0);
    gl.enable(gl.DEPTH_TEST);gl.depthMask((o.pointOpacity??1)>=1);gl.enableVertexAttribArray(l.position);gl.enableVertexAttribArray(l.color);
    for(const e of this.entries){gl.bindBuffer(gl.ARRAY_BUFFER,e.position);gl.vertexAttribPointer(l.position,3,gl.FLOAT,false,12,0);gl.bindBuffer(gl.ARRAY_BUFFER,e.color);gl.vertexAttribPointer(l.color,3,gl.FLOAT,false,12,0);gl.drawArrays(gl.POINTS,0,e.count);}
    gl.disableVertexAttribArray(l.position);gl.disableVertexAttribArray(l.color);gl.depthMask(true);
  }
  dispose(){this.clear();this.gl.deleteProgram(this.program);}
}
