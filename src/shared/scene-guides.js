import { samplePalette } from './palettes.js';
import { t } from './i18n.js';
import { niceScale } from './render-style.js';
/** The ruler measures screen-plane distance, never assumes meters. */
export function drawSceneGuides(ctx, viewer, width, height, scale = 1) {
  const options = viewer.options;
  if (!(viewer.pointCount||viewer.edgeCount||viewer.triangleCount)) return;
  ctx.save(); ctx.scale(scale,scale);
  const h = height/scale, [right,up,depth] = viewer.basis(), x=44, y=h-112;
  ctx.lineCap='round'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center';
  if(options.axes) {
    const colors=['#bd4b50','#37875f','#427ebe'];
    [0,1,2].sort((a,b)=>depth[a]-depth[b]).forEach(i=>{
      const dx=right[i]*27,dy=-up[i]*27;
      ctx.strokeStyle=colors[i];ctx.fillStyle=colors[i];ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.stroke();
      ctx.beginPath();ctx.arc(x+dx,y+dy,2.8,0,Math.PI*2);ctx.fill();
      ctx.fillText('XYZ'[i],x+right[i]*38,y-up[i]*38+4);
    });
  }
  if(options.ruler) {
    const ruler=niceScale(viewer.baseHeight/viewer.camera.zoom/(height/scale));
    if(ruler) {
      ctx.strokeStyle='#526d66';ctx.fillStyle='#526d66';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(16,h-70);ctx.lineTo(16+ruler.pixels,h-70);
      for(const px of [16,16+ruler.pixels]){ctx.moveTo(px,h-74);ctx.lineTo(px,h-66);}ctx.stroke();
      ctx.font='10px sans-serif';ctx.textAlign='left';
      ctx.fillText(`${Number(ruler.length.toPrecision(3))} ${t(viewer.options.scale==='normalized'?'布局单位':'坐标单位')}`,16,h-52);
    }
  }
  const available=Math.max(80,width/scale-32);
  if(options.pointCountLabel && viewer.pointCount){
    const count=options.showPoints?(viewer.activeClouds||[]).reduce((sum,e)=>sum+Math.floor(e.count*(options.pointRatio??100)/100),0):0;
    ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillStyle='#526d66';
    ctx.fillText(t('显示 {0} / {1} 点',[count.toLocaleString(),viewer.pointCount.toLocaleString()]),Math.min(150,available/2),h-48,available/2);
  }
  if(options.legend){
    const scalar=viewer.activeClouds ? options.showPoints && viewer.activeClouds.some(e=>!e.item?.displayColor) : options.colors==='height' && options.mode!=='wire';
    const range=scalar?(viewer.activeClouds?viewer.colorRange:options.range||viewer.heightRange):null;
    ctx.textAlign='left';ctx.font='10px sans-serif';ctx.fillStyle='#526d66';
    if(range && Number.isFinite(range.min) && Number.isFinite(range.max)){
      const label=options.colors==='height'?t('离地高度'):viewer.effectiveColorMode==='height'?t('高度 Z'):viewer.effectiveColorMode?.replace(/^field:/,'')||'';
      const barWidth=Math.min(90,available*.26),barX=16,barY=h-24,gradient=ctx.createLinearGradient(barX,0,barX+barWidth,0);
      for(let i=0;i<=8;i++)gradient.addColorStop(i/8,`rgb(${samplePalette(i/8,options.palette,options.reverse).map(v=>Math.round(v*255)).join(',')})`);
      ctx.fillStyle=gradient;ctx.fillRect(barX,barY,barWidth,8);ctx.fillStyle='#526d66';
      ctx.fillText(`${label} · ${Number(range.min.toPrecision(5))} — ${Number(range.max.toPrecision(5))}`,barX+barWidth+8,h-17,Math.max(10,available-barWidth-8));
    } else if(options.colors==='surface' && options.mode!=='wire' && viewer.triangleCount){
      ctx.fillStyle='#7596ab';ctx.fillRect(16,h-25,9,9);ctx.fillStyle='#526d66';ctx.fillText(t('屋顶 / 坡面'),31,h-17);
      ctx.fillStyle='#e8e3d6';ctx.fillRect(132,h-25,9,9);ctx.fillStyle='#526d66';ctx.fillText(t('墙面'),147,h-17);
    }
  }
  ctx.restore();
}
export function updateSceneGuides(viewer) {
  if(viewer.exportTarget || !viewer.canvas.ownerDocument) return;
  const doc=viewer.canvas.ownerDocument, parent=viewer.canvas.parentElement;
  if(!parent) return;
  if(!viewer.guideCanvas){viewer.guideCanvas=doc.createElement('canvas');viewer.guideCanvas.className='scene-guides';viewer.guideCanvas.setAttribute('aria-hidden','true');parent.append(viewer.guideCanvas);}
  viewer.guideCanvas.hidden=!(viewer.pointCount||viewer.edgeCount||viewer.triangleCount);
  parent.classList.add('shared-scene-overlays');
  const canvas=viewer.guideCanvas, rect=viewer.canvas.getBoundingClientRect(), dpr=Math.min(globalThis.devicePixelRatio||1,2);
  const w=Math.round(Math.min(420,rect.width)*dpr),h=Math.round(160*dpr);canvas.style.width=`${w/dpr}px`;
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(0,h-rect.height*dpr);
  drawSceneGuides(ctx,viewer,w,rect.height*dpr,dpr);ctx.restore();
}
