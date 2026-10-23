/** User-triggered diagnostics of existing renderers. No new GL context or render profile. */
export function collectRenderDiagnostics(viewers, host = globalThis) {
  const rect = element => {
    const r=element?.getBoundingClientRect?.();
    return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;
  };
  const errors = gl => {
    const result=[];
    for(let i=0;i<8;i++){const code=gl.getError();if(!code)break;result.push(`0x${code.toString(16)}`);}
    return result;
  };
  return {
    schemaVersion:1,capturedAt:new Date().toISOString(),
    browser:{userAgent:host.navigator?.userAgent||'',platform:host.navigator?.platform||'',maxTouchPoints:host.navigator?.maxTouchPoints||0},
    viewport:{width:host.innerWidth,height:host.innerHeight,devicePixelRatio:host.devicePixelRatio,visualWidth:host.visualViewport?.width,visualHeight:host.visualViewport?.height,dynamicViewportUnits:host.CSS?.supports?.('height','100dvh')},
    panes:Array.from(viewers).filter(Boolean).map((viewer,index)=>{
      const canvas=viewer.canvas,gl=viewer.gl;
      const css=element=>{const s=element&&host.getComputedStyle?.(element);return s?{display:s.display,position:s.position,width:s.width,height:s.height,flex:s.flex,gridTemplateRows:s.gridTemplateRows}:null;};
      const pane={index:index+1,canvas:rect(canvas),parent:rect(canvas.parentElement),canvasCss:css(canvas),parentCss:css(canvas.parentElement),backingStore:{width:canvas.width,height:canvas.height},geometry:{meshes:viewer.models?.length||0,triangles:viewer.triangleCount||0,points:viewer.pointCount||0},pendingFrame:viewer.frame!==null&&viewer.frame!==undefined,contextLost:!!viewer.contextLost};
      if(!gl){pane.error='No WebGL context';return pane;}
      try{
        pane.contextLost ||= gl.isContextLost();
        pane.errorsBefore=errors(gl);
        const parameter=name=>typeof gl[name]==='number'?gl.getParameter(gl[name]):null;
        pane.webgl={version:parameter('VERSION'),shadingLanguage:parameter('SHADING_LANGUAGE_VERSION'),drawingBufferWidth:gl.drawingBufferWidth,drawingBufferHeight:gl.drawingBufferHeight,attributes:gl.getContextAttributes(),maxViewport:parameter('MAX_VIEWPORT_DIMS'),maxRenderbufferSize:parameter('MAX_RENDERBUFFER_SIZE')};
        const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT);
        pane.webgl.fragmentHighFloat=precision?{precision:precision.precision,rangeMin:precision.rangeMin,rangeMax:precision.rangeMax}:null;
        // Draw once on request and inspect pixels synchronously before presentation.
        if(!pane.contextLost){try{viewer.render();pane.redraw='completed';}catch(error){pane.redraw='failed';pane.renderError=error.message||String(error);}}
        pane.errorsAfterRedraw=errors(gl);
        const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
        if(!pane.contextLost&&w>0&&h>0&&pane.canvas?.width>0&&pane.canvas?.height>0){
          const clear=parameter('COLOR_CLEAR_VALUE'),background=clear&&Array.from(clear,v=>Math.round(v*255)),samples=[];
          for(const x of [.25,.5,.75])for(const y of [.25,.5,.75]){
            const rgba=new Uint8Array(4);gl.readPixels(Math.min(w-1,Math.floor(w*x)),Math.min(h-1,Math.floor(h*y)),1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);samples.push(Array.from(rgba));
          }
          pane.pixels={background,samples,uniqueColors:new Set(samples.map(v=>v.join(','))).size};
          pane.errorsAfterReadback=errors(gl);
        }
      }catch(error){pane.diagnosticError=error.message||String(error);}
      return pane;
    }),
  };
}

export function mountRenderDiagnostics(container,getViewers) {
  const doc=container.ownerDocument,en=doc.documentElement.lang.startsWith('en');
  const make=(tag,text)=>{const node=doc.createElement(tag);if(text)node.textContent=text;return node;};
  const section=make('section');section.className='render-diagnostics-lite';
  const run=make('button',en?'Render diagnostics (temporary)':'渲染诊断（临时）');run.type='button';
  const status=make('p');status.setAttribute('role','status');
  const output=make('textarea');output.readOnly=true;output.hidden=true;output.rows=12;output.setAttribute('aria-label',en?'Render diagnostic result':'渲染诊断结果');
  const copy=make('button',en?'Copy diagnostic result':'复制诊断结果');copy.type='button';copy.hidden=true;
  run.onclick=()=>{
    const result=collectRenderDiagnostics(getViewers(),doc.defaultView||globalThis);output.value=JSON.stringify(result,null,2);output.hidden=copy.hidden=false;
    status.textContent=en?`Captured ${result.panes.length} pane(s). Copy the result for inspection.`:`已检查 ${result.panes.length} 个视窗。请复制结果发来检查。`;
  };
  copy.onclick=async()=>{
    try{await doc.defaultView.navigator.clipboard.writeText(output.value);status.textContent=en?'Diagnostic result copied.':'诊断结果已复制。';}
    catch{output.focus();output.select();status.textContent=en?'Select and copy the result.':'请长按已选中的内容，选择复制。';}
  };
  section.append(run,status,output,copy);container.append(section);
}
