import test from 'node:test';
import assert from 'node:assert/strict';
import {collectRenderDiagnostics,renderDiagnosticSummary} from '../src/shared/render-diagnostics-lite.js';

function fixture({lost=false,fail=false,hidden=false}={}) {
  const queue=[1282,0],calls={renders:0,reads:0};
  const parentElement={getBoundingClientRect:()=>({width:390,height:300,x:0,y:0})};
  const canvas={parentElement,width:780,height:600,getBoundingClientRect:()=>({width:hidden?0:390,height:hidden?0:300,x:0,y:0})};
  const gl={VERSION:1,SHADING_LANGUAGE_VERSION:2,COLOR_CLEAR_VALUE:3,MAX_VIEWPORT_DIMS:4,MAX_RENDERBUFFER_SIZE:5,FRAGMENT_SHADER:6,HIGH_FLOAT:7,RGBA:8,UNSIGNED_BYTE:9,
    drawingBufferWidth:780,drawingBufferHeight:600,isContextLost:()=>lost,getError:()=>queue.shift()||0,
    getParameter:k=>k===3?[.95,.96,.97,1]:k===4?[4096,4096]:k===5?4096:'WebGL mock',
    getContextAttributes:()=>({antialias:true,preserveDrawingBuffer:true}),getShaderPrecisionFormat:()=>({precision:23,rangeMin:127,rangeMax:127}),
    readPixels:(x,y,w,h,format,type,rgba)=>{calls.reads++;rgba.set([x%255,y%255,40,255]);},
  };
  const camera={zoom:2,pan:[1,3]};
  const viewer={canvas,gl,camera,models:[{}],triangleCount:12,pointCount:1896,frame:null,
    render(){calls.renders++;if(fail)throw Error('driver draw failure');}};
  return {viewer,calls,camera};
}

test('diagnostic separates pre-existing GL errors from a requested redraw and preserves view',()=>{
  const {viewer,calls,camera}=fixture(),saved=structuredClone(camera);
  const report=collectRenderDiagnostics([viewer],{navigator:{userAgent:'QQ/test'}}).panes[0];
  assert.deepEqual(report.errorsBefore,['0x502']);assert.deepEqual(report.errorsAfterRedraw,[]);
  assert.equal(report.redraw,'completed');assert.equal(calls.renders,1);assert.equal(calls.reads,9);
  assert.deepEqual(camera,saved);assert.equal(report.webgl.attributes.antialias,true);
  assert.equal(report.geometry.points,1896);assert.equal(report.canvas.width,390);
});

test('lost or folded canvases are not sampled; failure in one pane does not hide other panes',()=>{
  const lost=fixture({lost:true}),hidden=fixture({hidden:true}),failed=fixture({fail:true});
  const report=collectRenderDiagnostics([lost.viewer,hidden.viewer,failed.viewer,fixture().viewer],{});
  assert.equal(lost.calls.renders,0);assert.equal(lost.calls.reads,0);assert.equal(hidden.calls.reads,0);
  assert.equal(report.panes.length,4);assert.equal(report.panes[2].renderError,'driver draw failure');
  assert.equal(report.panes[3].redraw,'completed');
});

test('clipboard summary keeps every pane and failure while excluding verbose metadata',()=>{
  const report=collectRenderDiagnostics([fixture().viewer,fixture({fail:true}).viewer],{navigator:{userAgent:'Mozilla/5.0 (Linux; Android 15) Chrome/121.0 MQQBrowser/6.2 TBS/047925 QQ/9.2.65 ExtraPrivateMetadata'}});
  const summary=renderDiagnosticSummary(report);
  assert(summary.length<1500);assert.match(summary,/QQ\/9.2.65/);assert.match(summary,/TBS\/047925/);
  assert.match(summary,/视窗 1/);assert.match(summary,/视窗 2/);assert.match(summary,/0x502/);
  assert.match(summary,/driver draw failure/);assert(!summary.includes('ExtraPrivateMetadata'));
  assert(!summary.includes('fragmentHighFloat'));assert.match(renderDiagnosticSummary(report,true),/Pane 2/);
});
