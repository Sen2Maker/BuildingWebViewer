import { samplePalette } from './palettes.js';
import { t } from './i18n.js';
import { niceScale } from './render-style.js';
/** The ruler measures screen-plane distance, never assumes meters. */
export function drawSceneGuides(ctx, viewer, width, height, scale = 1, {compact = false} = {}) {
  const options = viewer.options;
  if (!(viewer.pointCount||viewer.edgeCount||viewer.triangleCount)) return;
  ctx.save(); ctx.scale(scale,scale);
  const h = height/scale, [right,up,depth] = viewer.basis(), x=compact?28:44, y=h-(compact?70:112);
  ctx.lineCap='round'; ctx.font=`bold ${compact?9:11}px sans-serif`; ctx.textAlign='center';
  if(options.axes) {
    const colors=['#bd4b50','#37875f','#427ebe'];
    [0,1,2].sort((a,b)=>depth[a]-depth[b]).forEach(i=>{
      const dx=right[i]*(compact?17:27),dy=-up[i]*(compact?17:27);
      ctx.strokeStyle=colors[i];ctx.fillStyle=colors[i];ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.stroke();
      ctx.beginPath();ctx.arc(x+dx,y+dy,2.8,0,Math.PI*2);ctx.fill();
      ctx.fillText('XYZ'[i],x+right[i]*(compact?25:38),y-up[i]*(compact?25:38)+4);
    });
  }
  if(options.ruler && viewer.projection !== 'perspective') {
    const ruler=niceScale(viewer.baseHeight/viewer.camera.zoom/(height/scale),compact?56:90);
    if(ruler) {
      ctx.strokeStyle='#526d66';ctx.fillStyle='#526d66';ctx.lineWidth=1.5;
      const left=compact?12:16, baseline=h-(compact?27:70);
      ctx.beginPath();ctx.moveTo(left,baseline);ctx.lineTo(left+ruler.pixels,baseline);
      for(const px of [left,left+ruler.pixels]){ctx.moveTo(px,baseline-4);ctx.lineTo(px,baseline+4);}ctx.stroke();
      ctx.font=`${compact?9:10}px sans-serif`;ctx.textAlign='left';
      ctx.fillText(`${Number(ruler.length.toPrecision(3))} ${t(viewer.options.scale==='normalized'?'布局单位':'坐标单位')}`,left,h-(compact?10:52));
    }
  }
  const available=Math.max(80,width/scale-32);
  if(!compact && options.pointCountLabel && viewer.pointCount){
    const count=options.showPoints?(viewer.pointLayer?.entries||viewer.activeClouds||[]).reduce((sum,e)=>sum+Math.floor(e.count*(options.pointRatio??100)/100),0):0;
    ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillStyle='#526d66';
    ctx.fillText(t('显示 {0} / {1} 点',[count.toLocaleString(),viewer.pointCount.toLocaleString()]),Math.min(150,available/2),h-48,available/2);
  }
  if(options.legend){
    const overlay=viewer.pointLayer&&options.showMesh===false&&options.showPoints!==false;
    const scalar=overlay?!!viewer.pointLayer.colorRange:viewer.activeClouds ? options.showPoints && viewer.activeClouds.some(e=>!e.item?.displayColor) : options.showMesh!==false && options.colors==='height' && options.mode!=='wire';
    const range=scalar?(overlay?viewer.pointLayer.colorRange:viewer.activeClouds?viewer.colorRange:options.range||viewer.heightRange):null;
    ctx.textAlign='left';ctx.font='10px sans-serif';ctx.fillStyle='#526d66';
    if(range && Number.isFinite(range.min) && Number.isFinite(range.max)){
      const label=overlay?(viewer.pointLayer.effectiveColorMode==='height'?t('高度 Z'):viewer.pointLayer.effectiveColorMode.replace(/^field:/,'')):options.colors==='height'?t('相对高度'):viewer.effectiveColorMode==='height'?t('高度 Z'):viewer.effectiveColorMode?.replace(/^field:/,'')||'';
      const barWidth=compact?72:Math.min(90,available*.26),barX=compact?width/scale-88:16,barY=h-24,gradient=ctx.createLinearGradient(barX,0,barX+barWidth,0);
      for(let i=0;i<=8;i++)gradient.addColorStop(i/8,`rgb(${samplePalette(i/8,options.palette,options.reverse).map(v=>Math.round(v*255)).join(',')})`);
      ctx.fillStyle=gradient;ctx.fillRect(barX,barY,barWidth,8);ctx.fillStyle='#526d66';
      if(compact){
        ctx.font='9px sans-serif';ctx.textAlign='right';ctx.fillText(label,barX+barWidth,h-32,100);
        ctx.textAlign='left';ctx.fillText(String(Number(range.min.toPrecision(3))),barX,h-4,barWidth/2);
        ctx.textAlign='right';ctx.fillText(String(Number(range.max.toPrecision(3))),barX+barWidth,h-4,barWidth/2);
      }else ctx.fillText(`${label} · ${Number(range.min.toPrecision(5))} — ${Number(range.max.toPrecision(5))}`,barX+barWidth+8,h-17,Math.max(10,available-barWidth-8));
    } else if(options.showMesh!==false && options.colors==='surface' && options.mode!=='wire' && viewer.triangleCount){
      const left=compact?width/scale-86:16,second=compact?left:132;
      ctx.font=`${compact?9:10}px sans-serif`;
      ctx.fillStyle='#7596ab';ctx.fillRect(left,h-(compact?39:25),9,9);ctx.fillStyle='#526d66';ctx.fillText(t('非竖直面'),left+15,h-(compact?31:17));
      ctx.fillStyle='#e8e3d6';ctx.fillRect(second,h-25,9,9);ctx.fillStyle='#526d66';ctx.fillText(t('近竖直面'),second+15,h-17);
    }
  }
  ctx.restore();
}
export function updateSceneGuides(viewer, viewport = null) {
  if(viewer.exportTarget || !viewer.canvas.ownerDocument) return;
  const doc=viewer.canvas.ownerDocument, parent=viewer.canvas.parentElement;
  if(!parent) return;
  if(!viewer.guideCanvas){viewer.guideCanvas=doc.createElement('canvas');viewer.guideCanvas.className='scene-guides';viewer.guideCanvas.setAttribute('aria-hidden','true');parent.append(viewer.guideCanvas);}
  viewer.guideCanvas.hidden=!(viewer.pointCount||viewer.edgeCount||viewer.triangleCount);
  if(!parent.classList.contains('shared-scene-overlays'))parent.classList.add('shared-scene-overlays');
  const canvas=viewer.guideCanvas, rect=viewport||viewer.canvas.getBoundingClientRect(), dpr=Math.min(globalThis.devicePixelRatio||1,2);
  const compact=doc.defaultView?.matchMedia('(max-width: 700px)').matches ?? false;
  const guideHeight=compact?104:160;
  const w=Math.round(Math.min(420,rect.width)*dpr),h=Math.round(guideHeight*dpr);const cssWidth=`${w/dpr}px`;if(canvas.style.width!==cssWidth)canvas.style.width=cssWidth;
  canvas.style.height=`${guideHeight}px`;
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(0,h-rect.height*dpr);
  drawSceneGuides(ctx,viewer,w,rect.height*dpr,dpr,{compact});ctx.restore();
}
