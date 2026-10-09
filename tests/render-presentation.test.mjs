import test from 'node:test';
import assert from 'node:assert/strict';
import {displaySampleIndices,niceScale} from '../src/shared/render-style.js';
import {validateImageSize,projectImagePoint,wireframeSVG,renderImagePixels} from '../src/shared/image-export.js';
import {CloudViewer} from '../src/cloud/cloud-renderer.js';

test('display sampling is deterministic, full-range, unique and restores all points',()=>{
 for(const [total,ratio] of [[70000,10],[2989,33],[10,100],[0,1],[3,1]]){
  const values=displaySampleIndices(total,ratio);assert.equal(values.length,Math.floor(total*ratio/100));assert.equal(new Set(values).size,values.length);
  assert.deepEqual(values,displaySampleIndices(total,ratio));assert.ok([...values].every(i=>i>=0&&i<total));
  if(values.length>1)assert.ok(values.at(-1)>total-total/values.length-1);
 }
 assert.ok(displaySampleIndices(70000,10) instanceof Uint32Array);
 assert.deepEqual([...displaySampleIndices(5,100)],[0,1,2,3,4]);
 assert.throws(()=>displaySampleIndices(5,NaN));assert.throws(()=>displaySampleIndices(5,0));
});
test('image limits reject fractional, nonfinite and unsafe pixel sizes',()=>{
 assert.deepEqual(validateImageSize(3840,2160),{width:3840,height:2160});
 for(const [w,h] of [[NaN,100],[8193,100],[1,1],[100.5,100],[8192,8192]])assert.throws(()=>validateImageSize(w,h));
 assert.throws(()=>validateImageSize(3000,1000,2048));
});
const fakeViewer={basis:()=>[[1,0,0],[0,1,0],[0,0,1]],baseHeight:10,camera:{zoom:1,pan:[0,0]},target:[1000,2000,3000],options:{lineWidth:2,wireColor:'#ff0000'},vectorSegments:()=>[[[995,2000,3000],[1005,2000,3000]]]};
test('orthographic projection preserves center and scale across aspect ratios',()=>{
 assert.deepEqual(projectImagePoint([1000,2000,3000],fakeViewer,200,100),[100,50]);
 assert.deepEqual(projectImagePoint([1005,2005,3000],fakeViewer,200,100),[150,0]);
 assert.deepEqual(projectImagePoint([1005,2005,3000],fakeViewer,100,100),[100,0]);
 const svg=wireframeSVG(fakeViewer,200,100,{transparent:true});assert.match(svg,/<path d="M50.000 50.000L150.000 50.000"/);assert.ok(!svg.includes('<image'));assert.ok(!svg.includes('<rect'));
 assert.ok(wireframeSVG(fakeViewer,200,100).includes('<rect'));assert.throws(()=>wireframeSVG({...fakeViewer,vectorSegments:()=>[]},200,100));
});
test('ruler remains a nice coordinate distance, independent of DPI',()=>{
 const v=niceScale(.1);assert.equal(v.length,5);assert.equal(v.pixels,50);assert.equal(niceScale(0),null);
 assert.equal(niceScale(.05).length,2);
});
test('GPU display sampling reuses indices and never changes source attributes',()=>{
 let allocations=0,deletions=0;
 const viewer=Object.create(CloudViewer.prototype);viewer.options={pointRatio:10};viewer.uintIndices=true;
 viewer.gl={createBuffer:()=>({id:++allocations}),bindBuffer(){},bufferData(){},getError:()=>0,NO_ERROR:0,UNSIGNED_INT:5125,UNSIGNED_SHORT:5123,deleteBuffer(){deletions++;}};
 const cloud={positions:new Float32Array(70000*3),fields:{intensity:new Float32Array(70000)}};const entry={count:70000,cloud};
 const first=viewer.sampledElements(entry);assert.equal(first.count,7000);assert.equal(first.type,5125);assert.equal(viewer.sampledElements(entry),first);assert.equal(allocations,1);
 viewer.options.pointRatio=20;assert.equal(viewer.sampledElements(entry).count,14000);assert.equal(deletions,1);
 viewer.options.pointRatio=100;assert.equal(viewer.sampledElements(entry),null);assert.equal(cloud.positions.length,210000);assert.equal(cloud.fields.intensity.length,70000);
 viewer.options.pointRatio=5;viewer.uintIndices=false;assert.throws(()=>viewer.sampledElements(entry));
});
test('offscreen export restores framebuffer and render state even on failure',()=>{
 let bound=null,deleted=0,renders=0;
 const gl={MAX_TEXTURE_SIZE:1,MAX_RENDERBUFFER_SIZE:2,FRAMEBUFFER_BINDING:3,FRAMEBUFFER_COMPLETE:4,NO_ERROR:0,
  isContextLost:()=>false,getParameter:key=>key===3?'original':4096,createFramebuffer:()=>({}),createTexture:()=>({}),createRenderbuffer:()=>({}),bindTexture(){},texParameteri(){},texImage2D(){},bindRenderbuffer(){},renderbufferStorage(){},bindFramebuffer(t,v){bound=v;},framebufferTexture2D(){},framebufferRenderbuffer(){},checkFramebufferStatus:()=>4,readPixels(x,y,w,h,a,b,raw){raw.fill(255);},getError:()=>0,deleteFramebuffer(){deleted++;},deleteTexture(){deleted++;},deleteRenderbuffer(){deleted++;}};
 const viewer={gl,canvas:{clientHeight:100},render(){renders++;if(this.exportTarget&&this.fail)throw Error('render failed');}};
 const pixels=renderImagePixels(viewer,16,16);assert.equal(pixels.length,1024);assert.equal(bound,'original');assert.equal(deleted,3);assert.equal(renders,2);assert.equal(viewer.exportTarget,null);
 viewer.fail=true;assert.throws(()=>renderImagePixels(viewer,16,16),/render failed/);assert.equal(bound,'original');assert.equal(deleted,6);assert.equal(viewer.exportTarget,null);
});
