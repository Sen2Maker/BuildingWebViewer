import {GaussianViewer} from '../../src/gaussian/renderer.js';
const result=document.getElementById('result');
try{
 const viewers=[GaussianViewer,GaussianViewer,GaussianViewer].map((Class,i)=>new Class(document.getElementById(['baseline','direct','once'][i]),{onError:message=>{if(message)throw Error(message);}}));
 viewers[0].gpuProjection=false;viewers[1].gpuProjection=false;viewers[2].gpuProjection=true;viewers.forEach(v=>{v.sortWorker?.terminate();v.sortWorker=null;v.pixelRatioLimit=1;v.interactionScale=1;});
 const n=128,model={count:n,sourceCount:n,bounds:{min:[-2,-2,-1],max:[2,2,1]},centers:new Float32Array(n*3),scale:new Float32Array(n*3),quat:new Float32Array(n*4),opacity:new Float32Array(n),dc:new Float32Array(n*3),rest:new Float32Array(n*45),hasRest:true,editFlags:new Uint8Array(n)};
 for(let i=0;i<n;i++){model.centers.set([Math.sin(i*1.3)*2,Math.cos(i*.7)*2,Math.sin(i*.43)],i*3);model.scale.set([i===0?2:.03+i%5*.04,.06,.02],i*3);model.quat.set([Math.cos(i*.1),0,Math.sin(i*.1),0],i*4);model.opacity[i]=i%8===0?.02:.7;model.dc.set([Math.sin(i),Math.cos(i),.2],i*3);for(let b=0;b<45;b++)model.rest[i*45+b]=Math.sin(i+b)*.2;}
 for(const v of viewers){v.setModels([model],{maxSplats:0,shDegree:3});v.exportTarget={width:320,height:240,scale:1};}
 const cases=[];
 function pixels(v){v.sort(true);v.render();const p=new Uint8Array(320*240*4);v.gl.readPixels(0,0,320,240,v.gl.RGBA,v.gl.UNSIGNED_BYTE,p);const error=v.gl.getError();if(error)throw Error('WebGL error '+error);return p;}
 function compare(a,b){let max=0,changed=0,total=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);if(d>2)changed++;total+=d;}return {max,above2:changed,mean:total/a.length};}
 for(const projection of ['perspective','orthographic'])for(const degree of [0,1,3])for(const zoom of [1,3]){
  for(const v of viewers){v.projection=projection;v.gauss.shDegree=degree;v.camera.zoom=zoom;v.camera.pan=[.3,-.2];v.camera.roll=23;}
  const [old,direct,once]=viewers.map(pixels);if(viewers[2].activePipeline!=='project-once')throw Error('Projection fallback '+viewers[2].projectionFallback);
  if(!old.some((x,i)=>i%4!==3&&x>0))throw Error('Empty reference image');
  const parity=compare(old,once),reuse=compare(direct,once);cases.push({projection,degree,zoom,parity,reuse});if(parity.above2||reuse.above2)throw Error('Pixel mismatch '+JSON.stringify(cases.at(-1)));
 }
 model.editFlags[1]=6;model.editFlags[2]=1;for(const v of viewers){v.syncFlags(false);v.gauss.opacityCutoff=.05;v.gauss.scale=1.4;v.viewDistance=v.distance*1.2;}
 const [old,direct,once]=viewers.map(pixels);const edit=compare(old,once);if(edit.above2)throw Error('Edited-state mismatch '+JSON.stringify(edit));
 result.textContent=JSON.stringify({passed:true,cases,edit,sourceCount:n,submitted:viewers[2].count,pipeline:viewers[2].activePipeline,renderer:viewers[2].gl.getParameter(viewers[2].gl.RENDERER)},null,2);
 for(const v of viewers)v.dispose();
}catch(e){result.textContent='FAIL '+e.stack;}
