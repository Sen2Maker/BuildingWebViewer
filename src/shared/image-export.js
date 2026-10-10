import { isMobileApp, mobileShareBlob } from './mobile-project.js';
import { t } from './i18n.js';
import { drawSceneGuides } from './scene-guides.js';
export function validateImageSize(width,height,maxSide=8192) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||width>maxSide||height>maxSide||width*height>32*1024*1024)throw Error(t('图片尺寸需为 16–{0} 的整数，总像素不超过 3200 万。',[maxSide]));
  return {width,height};
}
/** Re-render using an RGBA/depth framebuffer, without resizing the visible canvas. */
export function renderImagePixels(viewer,width,height,{transparent=false}={}) {
  const gl=viewer.gl;
  if(viewer.disposed||viewer.contextLost||gl.isContextLost())throw Error(t('渲染器暂不可用，请重新加载数据。'));
  validateImageSize(width,height,Math.min(8192,gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)));
  const previous=gl.getParameter(gl.FRAMEBUFFER_BINDING), framebuffer=gl.createFramebuffer(), texture=gl.createTexture(), depth=gl.createRenderbuffer();
  try {
    gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,width,height);
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error(t('无法分配导出画布，请降低分辨率。'));
    viewer.exportTarget={width,height,transparent,scale:height/Math.max(1,viewer.canvas.clientHeight)};
    viewer.render();
    const raw=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,raw);
    if(gl.getError()!==gl.NO_ERROR)throw Error(t('导出读取失败，请降低分辨率。'));
    const pixels=new Uint8ClampedArray(raw.length),stride=width*4;
    for(let y=0;y<height;y++)pixels.set(raw.subarray((height-y-1)*stride,(height-y)*stride),y*stride);
    // WebGL's alpha blending leaves premultiplied RGB; ImageData expects straight RGB.
    if(transparent)for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3];if(a&&a<255)for(let c=0;c<3;c++)pixels[i+c]=Math.min(255,Math.round(pixels[i+c]*255/a));}
    return pixels;
  } finally {
    viewer.exportTarget=null;gl.bindFramebuffer(gl.FRAMEBUFFER,previous);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);
    gl.deleteFramebuffer(framebuffer);gl.deleteTexture(texture);gl.deleteRenderbuffer(depth);viewer.render();
  }
}
export function projectImagePoint(point, viewer, width, height) {
  const [r,u]=viewer.basis(),h=viewer.baseHeight/viewer.camera.zoom,w=h*width/height;
  const p=point.map((v,i)=>v-viewer.target[i]);
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  return [(dot(p,r)-viewer.camera.pan[0])/w*width+width/2,height/2-(dot(p,u)-viewer.camera.pan[1])/h*height];
}
/** Genuine vector linework. Intentionally no raster embedding or hidden-surface promise. */
export function wireframeSVG(viewer,width,height,{transparent=false}={}) {
  validateImageSize(width,height);
  const count=viewer.edgeCount ?? ((viewer.options.mode==='wire'||viewer.options.mode==='solid-wire'?viewer.buffers?.allEdges?.count:viewer.buffers?.featureEdges?.count)||0)/2;
  if(count>200000)throw Error(t('SVG 超过 20 万条线，请减少选择或使用位图导出。'));
  const segments=viewer.vectorSegments?.();
  if(!segments?.length)throw Error(t('当前没有可导出的线框。'));
  if(segments.length>200000)throw Error(t('SVG 超过 20 万条线，请减少选择或使用位图导出。'));
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, '<title>BuildingWebViewer vector wireframe projection</title>'];
  if(!transparent)parts.push(`<rect width="100%" height="100%" fill="#f3f5f6"/>`);
  const stroke=/^#[a-f0-9]{6}$/i.test(viewer.options.wireColor||'')?viewer.options.wireColor:'#496577';
  parts.push(`<g fill="none" stroke="${stroke}" stroke-width="${Number(viewer.options.lineWidth)||1}" stroke-linecap="round">`);
  for(const [a,b] of segments){const p=projectImagePoint(a,viewer,width,height),q=projectImagePoint(b,viewer,width,height);if([...p,...q].every(Number.isFinite))parts.push(`<path d="M${p.map(n=>n.toFixed(3)).join(' ')}L${q.map(n=>n.toFixed(3)).join(' ')}"/>`);}
  parts.push('</g></svg>');return parts.join('\n');
}
export async function downloadImageBlob(blob,filename,doc=document) {
  if(isMobileApp()){await mobileShareBlob(blob,filename);return;}
  const url=URL.createObjectURL(blob),a=doc.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export function canvasImageBlob(canvas,format,quality=.92) {
  const mime={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'}[format];
  if(!mime)throw Error(t('不支持的图片格式'));
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?.type===mime?resolve(blob):reject(Error(t('浏览器不支持此格式或图片尺寸，请改用 PNG 或减小尺寸。'))),mime,quality));
}
export function mountImageExport({root=document,getViewers,pauseSync=callback=>callback()}) {
  const container=root.querySelector('#settings-panel-camera');if(!container)return;
  const doc=container.ownerDocument,section=doc.createElement('section');section.className='inspector-section image-export';
  const el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=t(text);return n;};
  section.append(el('h3','截图与导出'));const quick=root.getElementById('screenshot');if(quick){quick.textContent=t('快速截图 PNG');section.append(quick);}
  const help=el('p','快速截图使用当前渲染像素；高级导出按指定像素重新渲染。');help.className='presentation-help';section.append(help);
  const details=el('details');details.append(el('summary','高级导出'));section.append(details);
  function field(label,input){input.setAttribute('aria-label',t(label));const node=el('label',label);node.append(input);details.append(node);return input;}
  const select=(values)=>{const node=el('select');for(const [value,label] of values){const o=el('option',label);o.value=value;node.append(o);}return node;};
  const format=field('格式',select([['png','PNG · 无损'],['jpeg','JPEG · 较小文件'],['webp','WebP'],...(root.body.dataset.tool==='pointcloud'?[]:[['svg','SVG · 线框矢量']])]));
  const scope=field('导出视窗',select([['all','所有可见视窗'],['0','视窗 1'],...(root.body.dataset.tool==='wireframe'?[['1','视窗 2'],['2','视窗 3']]:[])]));
  const preset=field('分辨率',select([['1920x1080','1920 × 1080'],['3840x2160','3840 × 2160'],['current','当前渲染尺寸'],['custom','自定义像素']]));
  const antialias=field('抗锯齿',select([['1','标准'],['2','2× 超采样']]));
  const number=(value)=>{const node=el('input');node.type='number';node.min='16';node.max='8192';node.step='1';node.value=value;return node;};
  const width=field('宽度（px）',number('1920')),height=field('高度（px）',number('1080'));
  const quality=number('92');quality.min='1';quality.max='100';field('压缩质量（%）',quality);
  const transparency=el('input');transparency.type='checkbox';field('透明背景',transparency);
  const guides=field('截图内容',select([['clean','纯净画面'],['overlays','包含已开启的辅助信息']]));
  const note=el('p','纯净画面只含渲染内容；辅助信息包含已开启的方向、标尺、图例与点数。网格随显示设置，页面按钮与编号标签不导出。多视窗横向拼接，宽度为总宽度。');note.className='presentation-help';details.append(note);
  const svgNote=el('p','SVG 仅导出线框投影：不含点云、实体面、遮挡、网格、方向标尺或立体线材质。');svgNote.className='presentation-help';svgNote.hidden=true;details.append(svgNote);
  const submit=el('button','导出图片'),status=el('p');status.setAttribute('role','status');status.className='presentation-help';details.append(submit,status);container.append(section);
  const visible=()=>getViewers().filter(v=>!v.disposed&&v.canvas.getBoundingClientRect().width>0&&v.canvas.getBoundingClientRect().height>0);
  const chosen=()=>{const list=visible();return scope.value==='all'?list:list[Number(scope.value)]?[list[Number(scope.value)]]:[];};
  preset.onchange=()=>{if(preset.value==='current'){const list=chosen();width.value=list.reduce((sum,v)=>sum+v.canvas.width,0)||1920;height.value=list[0]?.canvas.height||1080;}else if(preset.value!=='custom'){[width.value,height.value]=preset.value.split('x');}};
  width.oninput=height.oninput=()=>{preset.value='custom';};
  format.onchange=()=>{const svg=format.value==='svg';svgNote.hidden=!svg;guides.disabled=svg;antialias.disabled=svg;quality.disabled=['png','svg'].includes(format.value);transparency.disabled=format.value==='jpeg';};format.onchange();
  async function save(quickMode=false){
    const list=quickMode?visible():chosen();if(!list.length)throw Error(t('没有可导出的视窗。'));
    if(!list.some(v=>(v.pointCount||v.edgeCount||v.triangleCount)>0))throw Error(t('请先加载数据。'));
    const fmt=quickMode?'png':format.value;
    let w=Number(width.value),h=Number(height.value);
    if(quickMode){pauseSync(()=>list.forEach(v=>v.render()));w=list.reduce((sum,v)=>sum+v.canvas.width,0);h=Math.max(...list.map(v=>v.canvas.height));}
    validateImageSize(w,h);if(Math.floor(w/list.length)<16)throw Error(t('每个视窗宽度至少为 16 像素。'));
    if(fmt==='svg'){if(list.length!==1)throw Error(t('SVG 请指定单个视窗。'));await downloadImageBlob(new Blob([wireframeSVG(list[0],w,h,{transparent:transparency.checked})],{type:'image/svg+xml'}),'BuildingWebViewer.svg',doc);return;}
    const q=Number(quality.value);if(!quickMode&&fmt!=='png'&&(!Number.isFinite(q)||q<1||q>100))throw Error(t('压缩质量需在 1–100 之间。'));
    const output=doc.createElement('canvas');output.width=w;output.height=h;const ctx=output.getContext('2d');
    const transparent=!quickMode&&transparency.checked&&fmt!=='jpeg';if(!transparent){ctx.fillStyle='#f3f5f6';ctx.fillRect(0,0,w,h);}
    let x=0;
    for(let i=0;i<list.length;i++){
      const viewer=list[i],pw=quickMode?viewer.canvas.width:Math.floor((i+1)*w/list.length)-Math.floor(i*w/list.length),ph=quickMode?viewer.canvas.height:h;
      if(quickMode)ctx.drawImage(viewer.canvas,x,0);else{
        const aa=Number(antialias.value),pixels=pauseSync(()=>renderImagePixels(viewer,pw*aa,ph*aa,{transparent}));const part=doc.createElement('canvas');part.width=pw*aa;part.height=ph*aa;
        part.getContext('2d').putImageData(new ImageData(pixels,pw*aa,ph*aa),0,0);ctx.drawImage(part,x,0,pw,ph);
      }
      if(!quickMode&&guides.value==='overlays'){const scale=ph/Math.max(1,viewer.canvas.clientHeight);ctx.save();ctx.beginPath();ctx.rect(x,0,pw,ph);ctx.clip();ctx.translate(x,0);drawSceneGuides(ctx,viewer,Math.min(pw,420*scale),ph,scale);ctx.restore();}x+=pw;
    }
    const blob=await canvasImageBlob(output,fmt,q/100);await downloadImageBlob(blob,`BuildingWebViewer-${w}x${h}.${fmt==='jpeg'?'jpg':fmt}`,doc);
  }
  const run=async quickMode=>{submit.disabled=true;if(quick)quick.disabled=true;status.textContent=t('正在导出…');try{await save(quickMode);status.textContent=t('图片已导出。');}catch(error){status.textContent=error.message;}finally{submit.disabled=false;if(quick)quick.disabled=!visible().some(v=>(v.pointCount||v.edgeCount||v.triangleCount)>0);}};
  submit.onclick=()=>run(false);if(quick)quick.onclick=()=>run(true);
}
