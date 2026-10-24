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
    schemaVersion:2,diagnosticVersion:'qq-v2',capturedAt:new Date().toISOString(),
    browser:{userAgent:host.navigator?.userAgent||'',platform:host.navigator?.platform||'',maxTouchPoints:host.navigator?.maxTouchPoints||0},
    viewport:{width:host.innerWidth,height:host.innerHeight,devicePixelRatio:host.devicePixelRatio,visualWidth:host.visualViewport?.width,visualHeight:host.visualViewport?.height,dynamicViewportUnits:host.CSS?.supports?.('height','100dvh')},
    displayInputs:Object.fromEntries(['display-mode','scale-mode','color-mode'].map(id=>[id,host.document?.getElementById(id)?.value??null])),
    panes:Array.from(viewers).filter(Boolean).map((viewer,index)=>{
      const canvas=viewer.canvas,gl=viewer.gl;
      const css=element=>{const s=element&&host.getComputedStyle?.(element);return s?{display:s.display,visibility:s.visibility,opacity:s.opacity,position:s.position,width:s.width,height:s.height,flex:s.flex,gridTemplateRows:s.gridTemplateRows,transform:s.transform,filter:s.filter,zIndex:s.zIndex,contentVisibility:s.contentVisibility}:null;};
      const pane={index:index+1,canvas:rect(canvas),parent:rect(canvas.parentElement),canvasCss:css(canvas),parentCss:css(canvas.parentElement),backingStore:{width:canvas.width,height:canvas.height},geometry:{meshes:viewer.models?.length||0,triangles:viewer.triangleCount||0,points:viewer.pointCount||0},pendingFrame:viewer.frame!==null&&viewer.frame!==undefined,contextLost:!!viewer.contextLost};
      // Inspect the normal page, with the runtime popup closed by the UI caller.
      pane.ancestors=[];
      for(let node=canvas.parentElement;node&&pane.ancestors.length<10;node=node.parentElement){
        const style=css(node);pane.ancestors.push({tag:node.tagName,css:style});
      }
      const box=pane.canvas;
      if(box&&box.width>0&&box.height>0&&host.document?.elementsFromPoint){
        const x=box.x+box.width/2,y=box.y+box.height/2;
        pane.hitTest={inViewport:x>=0&&y>=0&&x<host.innerWidth&&y<host.innerHeight,
          stack:host.document.elementsFromPoint(x,y).slice(0,5).map(node=>({tag:node.tagName,isCanvas:node===canvas,css:css(node)}))};
      }
      if(!gl){pane.error='No WebGL context';return pane;}
      try{
        pane.contextLost ||= gl.isContextLost();
        pane.errorsBefore=errors(gl);
        const parameter=name=>typeof gl[name]==='number'?gl.getParameter(gl[name]):null;
        pane.webgl={version:parameter('VERSION'),shadingLanguage:parameter('SHADING_LANGUAGE_VERSION'),drawingBufferWidth:gl.drawingBufferWidth,drawingBufferHeight:gl.drawingBufferHeight,attributes:gl.getContextAttributes(),maxViewport:parameter('MAX_VIEWPORT_DIMS'),maxRenderbufferSize:parameter('MAX_RENDERBUFFER_SIZE')};
        const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT);
        pane.webgl.fragmentHighFloat=precision?{precision:precision.precision,rangeMin:precision.rangeMin,rangeMax:precision.rangeMax}:null;
        // Read before the requested draw too; never infer screen presentation from readPixels.
        const before=new Uint8Array(4);
        if(!pane.contextLost&&gl.drawingBufferWidth>0&&gl.drawingBufferHeight>0){
          gl.readPixels(Math.floor(gl.drawingBufferWidth/2),Math.floor(gl.drawingBufferHeight/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,before);
          pane.centerBeforeRedraw=Array.from(before);
        }
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
  const lines=[en?'BWV render diagnostic qq-v2':'BWV 渲染诊断 qq-v2',result.capturedAt||'',
    `${en?'Browser':'浏览器'}: ${versions.join(' ')||'unknown'}`,
    `${en?'Viewport':'屏幕'}: ${size(result.viewport)} DPR=${number(result.viewport?.devicePixelRatio)}`,
    `${en?'Display':'显示选项'}: ${['display-mode','scale-mode','color-mode'].map(k=>result.displayInputs?.[k]||'—').join('/')}`];
  const observations=en?{blank:'blank',visible:'visible',partial:'one pane'}:{blank:'两个都空白',visible:'两个都有模型',partial:'只有一个有模型'};
  lines.push(`${en?'Observed page':'肉眼看到'}: ${observations[result.observation]||'—'}`);
  for(const pane of result.panes||[]){
    const geometry=pane.geometry||{},style=pane.canvasCss||{},attributes=pane.webgl?.attributes||{};
    lines.push(`${en?'Pane':'视窗'} ${pane.index}: CSS=${size(pane.canvas)} buffer=${number(pane.webgl?.drawingBufferWidth)}×${number(pane.webgl?.drawingBufferHeight)}`,
      `${en?'Mesh/triangles/points':'模型/面/点'}=${geometry.meshes||0}/${geometry.triangles||0}/${geometry.points||0}`,
      `lost=${!!pane.contextLost} redraw=${pane.redraw||'—'} GL(before/draw/read)=${codes(pane.errorsBefore)}/${codes(pane.errorsAfterRedraw)}/${codes(pane.errorsAfterReadback)}`,
      `CSS=${style.display||'—'}/${style.visibility||'—'}/${style.opacity||'—'} AA=${attributes.antialias??'—'} preserve=${attributes.preserveDrawingBuffer??'—'} colors=${pane.pixels?.uniqueColors??'—'} preview=${pane.preview?.status||'—'}`);
    const hidden=pane.ancestors?.some(a=>a.css&&(a.css.display==='none'||a.css.visibility==='hidden'||a.css.opacity==='0'));
    lines.push(`ancestorHidden=${!!hidden} top=${pane.hitTest?.stack?.[0]?.isCanvas?'canvas':pane.hitTest?.stack?.[0]?.tag||'—'} before=${pane.centerBeforeRedraw?.join(',')||'—'}`);
    for(const key of ['error','renderError','diagnosticError'])if(pane[key])lines.push(`${key}: ${String(pane[key]).slice(0,160)}`);
  }
  return lines.join('\n');
}

/** Copy synchronously first for embedded browsers; selection stays available on failure. */
export async function copyDiagnosticText(output,doc=output.ownerDocument) {
  output.focus();output.select();output.setSelectionRange?.(0,output.value.length);
  try{if(doc.execCommand?.('copy'))return true;}catch{}
  try{await doc.defaultView.navigator.clipboard.writeText(output.value);return true;}catch{return false;}
}

export function mountRenderDiagnostics(container,getViewers) {
  const doc=container.ownerDocument,en=doc.documentElement.lang.startsWith('en');
  const make=(tag,text)=>{const node=doc.createElement(tag);if(text)node.textContent=text;return node;};
  const button=text=>{const node=make('button',text);node.type='button';return node;};
  const section=make('section');section.className='render-diagnostics-lite';
  const run=button(en?'Render diagnostics (temporary)':'渲染诊断（临时）');
  const status=make('p');status.setAttribute('role','status');
  const card=make('div');card.className='diagnostic-card';card.hidden=true;
  const heading=make('strong',en?'QQ diagnostic · v2':'QQ 诊断 · 第二版');
  const hint=make('p',en?'Screenshot this card or copy the short report. No download required. Readback images do not prove the page canvas is visible.':'直接截这张卡片，或复制短报告，无需下载。读回图有模型，不代表页面画布已经显示。');
  const observation=make('select');observation.setAttribute('aria-label',en?'What did the page show?':'页面实际显示情况');
  for(const [value,label] of [['',en?'Before diagnosing, the page…':'诊断前，页面上的模型…'],['blank',en?'Both panes were blank':'两个视窗都空白'],['visible',en?'Both panes were visible':'两个视窗都有模型'],['partial',en?'Only one pane was visible':'只有一个视窗有模型']]){const option=make('option',label);option.value=value;observation.append(option);}
  const previews=make('div');previews.className='diagnostic-previews';
  const readable=make('pre');readable.className='diagnostic-summary';
  const output=make('textarea');output.readOnly=true;output.rows=7;output.setAttribute('aria-label',en?'Selectable short report':'可选中的短报告');
  const manual=make('details');manual.append(make('summary',en?'Select text manually':'手动选择文字'),output);
  const copy=button(en?'Copy short report':'复制短报告');
  const full=make('details');full.append(make('summary',en?'Full report (optional)':'完整报告（可选）'));
  const fullOutput=make('textarea');fullOutput.readOnly=true;fullOutput.rows=12;fullOutput.setAttribute('aria-label',en?'Full diagnostic report':'完整诊断报告');
  const download=button(en?'Try downloading JSON':'尝试下载 JSON');full.append(fullOutput,download);
  const back=button(en?'Back to runtime status':'返回运行状态');
  back.onclick=()=>container.classList.remove('diagnostic-focus');
  let result;
  const update=()=>{if(!result)return;result.observation=observation.value;readable.textContent=output.value=renderDiagnosticSummary(result,en);fullOutput.value=JSON.stringify(result,null,2);};
  observation.onchange=update;
  run.onclick=async()=>{
    run.disabled=true;status.textContent=en?'Sampling the unobstructed page…':'正在检查无遮挡的页面…';
    const popup=container.closest('details'),wasOpen=popup?.open;
    if(popup)popup.open=false;
    // Allow the popup to disappear before layout/hit testing; no canvas/style workarounds.
    await new Promise(resolve=>doc.defaultView.setTimeout(resolve,350));
    try{
      previews.replaceChildren();
      result=collectRenderDiagnostics(getViewers(),doc.defaultView||globalThis,{onPreview:({index,width,height,rgba})=>{
        const canvas=doc.createElement('canvas');canvas.width=width;canvas.height=height;
        const context=canvas.getContext('2d');if(!context)return;
        const image=context.createImageData(width,height),stride=width*4;
        for(let y=0;y<height;y++)image.data.set(rgba.subarray((height-1-y)*stride,(height-y)*stride),y*stride);
        context.putImageData(image,0,0);
        const figure=make('figure'),caption=make('figcaption',en?`Pane ${index} readback`:`视窗 ${index} 读回图`),preview=make('img');
        preview.alt=caption.textContent;preview.src=canvas.toDataURL('image/png');figure.append(caption,preview);previews.append(figure);
      }});
      update();card.hidden=false;full.open=manual.open=false;container.classList.add('diagnostic-focus');
      status.textContent=en?'Captured. Select what the page showed, then send a screenshot or short report.':'采集完成。选一下刚才页面的显示情况，发截图或短报告即可。';
    }catch(error){status.textContent=error.message||String(error);}
    finally{run.disabled=false;if(popup&&wasOpen)popup.open=true;container.scrollTop=0;}
  };
  copy.onclick=async()=>{
    manual.open=true;
    const copied=await copyDiagnosticText(output,doc);
    if(copied){manual.open=false;copy.focus({preventScroll:true});container.scrollTop=0;status.textContent=en?'Short report copied.':'短报告已复制。';}
    else status.textContent=en?'Copy unavailable here. Long-press the text below, or screenshot the card.':'QQ 未允许复制。请长按下方文字复制，或直接截这张卡片。';
  };
  download.onclick=async()=>{
    try{await saveLocalBlob(new Blob([fullOutput.value],{type:'application/json'}),'BWV-render-diagnostics.json',{document:doc});status.textContent=en?'Download requested; if no file appears, use the short report or screenshot.':'已请求下载；如果没有文件，请使用短报告或截图。';}
    catch{status.textContent=en?'Download unavailable. Use the short report or screenshot.':'下载不可用，请使用短报告或截图。';}
  };
  card.append(heading,hint,observation,previews,readable,copy,manual,full,back);
  section.append(run,status,card);container.append(section);
}
