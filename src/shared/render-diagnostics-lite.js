import {saveLocalBlob} from './file-save.js';
/** User-triggered diagnostics of existing renderers. No new GL context or render profile. */
export function collectRenderDiagnostics(viewers, host = globalThis, {onPreview} = {}) {
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
    displayInputs:Object.fromEntries(['display-mode','scale-mode','color-mode'].map(id=>[id,host.document?.getElementById(id)?.value??null])),
    panes:Array.from(viewers).filter(Boolean).map((viewer,index)=>{
      const canvas=viewer.canvas,gl=viewer.gl;
      const css=element=>{const s=element&&host.getComputedStyle?.(element);return s?{display:s.display,visibility:s.visibility,opacity:s.opacity,position:s.position,width:s.width,height:s.height,flex:s.flex,gridTemplateRows:s.gridTemplateRows,transform:s.transform,filter:s.filter,zIndex:s.zIndex,contentVisibility:s.contentVisibility}:null;};
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
          if(onPreview&&w*h<=4194304){
            const rgba=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
            onPreview({index:index+1,width:w,height:h,rgba});pane.preview={width:w,height:h,status:'captured'};
          }
          pane.errorsAfterReadback=errors(gl);
        }
      }catch(error){pane.diagnosticError=error.message||String(error);}
      return pane;
    }),
  };
}

/** Keep clipboard output short enough for messaging apps; retain full data separately. */
export function renderDiagnosticSummary(result, en=false) {
  const ua=result.browser?.userAgent||'',versions=['Android','QQ','Chrome','TBS'].map(name=>{
    const value=ua.match(new RegExp(`(?:^|[ /])${name}[/ ]([\\d.]+)`))?.[1];return value?`${name}/${value}`:null;
  }).filter(Boolean);
  const number=value=>Number.isFinite(value)?String(Math.round(value*100)/100):'—';
  const size=value=>value?`${number(value.width)}×${number(value.height)}`:'—';
  const codes=value=>value?.length?[...new Set(value)].join(','):'0';
  const lines=[en?'BWV render diagnostic summary v1':'BWV 渲染诊断摘要 v1',result.capturedAt||'',
    `${en?'Browser':'浏览器'}: ${versions.join(' ')||'unknown'}`,
    `${en?'Viewport':'屏幕'}: ${size(result.viewport)} DPR=${number(result.viewport?.devicePixelRatio)}`,
    `${en?'Display':'显示选项'}: ${['display-mode','scale-mode','color-mode'].map(k=>result.displayInputs?.[k]||'—').join('/')}`];
  for(const pane of result.panes||[]){
    const geometry=pane.geometry||{},style=pane.canvasCss||{},attributes=pane.webgl?.attributes||{};
    lines.push(`${en?'Pane':'视窗'} ${pane.index}: CSS=${size(pane.canvas)} buffer=${number(pane.webgl?.drawingBufferWidth)}×${number(pane.webgl?.drawingBufferHeight)}`,
      `${en?'Mesh/triangles/points':'模型/面/点'}=${geometry.meshes||0}/${geometry.triangles||0}/${geometry.points||0}`,
      `lost=${!!pane.contextLost} redraw=${pane.redraw||'—'} GL(before/draw/read)=${codes(pane.errorsBefore)}/${codes(pane.errorsAfterRedraw)}/${codes(pane.errorsAfterReadback)}`,
      `CSS=${style.display||'—'}/${style.visibility||'—'}/${style.opacity||'—'} AA=${attributes.antialias??'—'} preserve=${attributes.preserveDrawingBuffer??'—'} colors=${pane.pixels?.uniqueColors??'—'} preview=${pane.preview?.status||'—'}`);
    for(const key of ['error','renderError','diagnosticError'])if(pane[key])lines.push(`${key}: ${String(pane[key]).slice(0,160)}`);
  }
  return lines.join('\n');
}

export function mountRenderDiagnostics(container,getViewers) {
  const doc=container.ownerDocument,en=doc.documentElement.lang.startsWith('en');
  const make=(tag,text)=>{const node=doc.createElement(tag);if(text)node.textContent=text;return node;};
  const section=make('section');section.className='render-diagnostics-lite';
  const run=make('button',en?'Render diagnostics (temporary)':'渲染诊断（临时）');run.type='button';
  const status=make('p');status.setAttribute('role','status');
  const previews=make('div');previews.className='diagnostic-previews';
  const output=make('textarea');output.readOnly=true;output.hidden=true;output.rows=7;output.setAttribute('aria-label',en?'Diagnostic summary':'诊断摘要');
  const copy=make('button',en?'Copy diagnostic summary':'复制诊断摘要');copy.type='button';copy.hidden=true;
  const full=make('details');full.hidden=true;full.append(make('summary',en?'Full report':'完整报告'));
  const fullOutput=make('textarea');fullOutput.readOnly=true;fullOutput.rows=12;fullOutput.setAttribute('aria-label',en?'Full diagnostic report':'完整诊断报告');
  const download=make('button',en?'Download full report':'下载完整报告');download.type='button';full.append(fullOutput,download);
  run.onclick=()=>{
    previews.replaceChildren();
    const result=collectRenderDiagnostics(getViewers(),doc.defaultView||globalThis,{onPreview:({index,width,height,rgba})=>{
      const canvas=doc.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d'),image=context.createImageData(width,height),stride=width*4;
      for(let y=0;y<height;y++)image.data.set(rgba.subarray((height-1-y)*stride,(height-y)*stride),y*stride);
      context.putImageData(image,0,0);
      const figure=make('figure'),caption=make('figcaption',en?`Pane ${index} readback`:`视窗 ${index} 读回图`),preview=make('img');
      preview.alt=caption.textContent;preview.src=canvas.toDataURL('image/png');figure.append(caption,preview);previews.append(figure);
    }});output.value=renderDiagnosticSummary(result,en);fullOutput.value=JSON.stringify(result,null,2);output.hidden=copy.hidden=full.hidden=false;full.open=false;
    status.textContent=en?`Captured ${result.panes.length} pane(s). Copy the summary; full report is optional.`:`已检查 ${result.panes.length} 个视窗。复制摘要即可，完整报告可按需下载。`;
  };
  copy.onclick=async()=>{
    try{await doc.defaultView.navigator.clipboard.writeText(output.value);status.textContent=en?'Diagnostic summary copied.':'诊断摘要已复制。';}
    catch{output.focus();output.select();status.textContent=en?'Select and copy the result.':'请长按已选中的内容，选择复制。';}
  };
  download.onclick=async()=>{try{await saveLocalBlob(new Blob([fullOutput.value],{type:'application/json'}),'BWV-render-diagnostics.json',{document:doc});}catch(error){status.textContent=error.message||String(error);}};
  section.append(run,status,previews,output,copy,full);container.append(section);
}
