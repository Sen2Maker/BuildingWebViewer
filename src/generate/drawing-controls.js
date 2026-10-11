import { gsViewSpec, gsProjectPosition, gsDot3 } from '../shared/camera-geometry.js';
import { gsSetOrbitBasis } from '../shared/orbit-camera.js';
import { drawFrame, drawUnproject, drawRayPlane, drawCheck } from './drawing-geometry.js';

/** Work-plane drawing owns its overlay input; navigation owns the scene canvas. */
export function mountDrawingControls({viewer,container,toolbar,onCommit,onError,isBusy=()=>false}) {
  const en=document.documentElement.lang==='en',tr=(zh,enText)=>en?enText:zh;
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  let enabled=true,mode='navigate',points=[],hover=null,drag=null,strokeBefore=0,frame=drawFrame([0,0,1]),showGrid=true;
  const stage=viewer.canvas.parentElement,overlay=make('canvas',null,'draw-overlay');overlay.setAttribute('aria-label',tr('三维绘制画布','3D drawing canvas'));overlay.tabIndex=0;stage.append(overlay);const ctx=overlay.getContext('2d');
  const tools=make('div',null,'draw-toolbar'),buttons=new Map();
  for(const[value,zh,eng]of [['navigate','浏览','Navigate'],['line','折线','Polyline'],['brush','自由画笔','Freehand'],['polygon','绘制面','Face'],['extrusion','拉伸体','Extrude']]){const b=make('button',tr(zh,eng));b.type='button';b.onclick=()=>switchMode(value);buttons.set(value,b);tools.append(b);}
  const finish=make('button',tr('完成绘制','Finish drawing')),back=make('button',tr('退回一点','Undo vertex')),cancel=make('button',tr('取消绘制','Cancel drawing'));tools.append(finish,back,cancel);toolbar.after(tools);
  const panel=make('details',null,'draw-panel');panel.open=true;panel.append(make('summary',tr('绘制平面与深度','Drawing plane & depth')));container.append(panel);const panelBody=make('div',null,'draw-panel-body');panel.append(panelBody);
  const row=(title,input)=>{const l=make('label',title);input.setAttribute('aria-label',title);l.append(input);panelBody.append(l);return input;};
  const plane=row(tr('工作平面','Work plane'),make('select'));for(const[value,label]of [['xy','XY · Z'],['xz','XZ · Y'],['yz','YZ · X'],['view',tr('当前视角平面','Current view plane')]]){const o=make('option',label);o.value=value;plane.append(o);}
  const offset=row(tr('平面深度','Plane depth'),make('input'));offset.type='number';offset.step='.1';offset.value='0';
  const snap=row(tr('吸附间距（0 为关闭）','Snap spacing (0 = off)'),make('input'));snap.type='number';snap.min=0;snap.step='.1';snap.value='.25';
  const height=row(tr('新体拉伸高度','New extrusion height'),make('input'));height.type='number';height.min='.001';height.step='.1';height.value='3';
  const fill=row(tr('新体点分布','New volume sampling'),make('select'));for(const[value,zh,eng]of [['surface','仅表面','Surface only'],['volume','整个体积','Filled volume']]){const o=make('option',tr(zh,eng));o.value=value;fill.append(o);}
  const actions=make('div',null,'draw-plane-actions'),align=make('button',tr('正对平面','Face plane')),capture=make('button',tr('取当前视角平面','Capture view plane'));actions.append(align,capture);panelBody.append(actions);
  const gridLabel=make('label',null,'gen-check'),grid=make('input');grid.type='checkbox';grid.checked=true;gridLabel.append(grid,document.createTextNode(tr('显示工作平面','Show work plane')));panelBody.append(gridLabel);grid.onchange=()=>{showGrid=grid.checked;paint();};
  const hint=make('p',null,'gen-side-note');hint.textContent=tr('先选绘制工具。点击落点；自由画笔按住拖动。面和体的轮廓保持在一个平面。画空间折线时可中途改变平面或深度。切回浏览可调整相机，再继续绘制。','Select a tool, then click vertices or drag Freehand. Faces and volumes use one plane; polylines can change plane/depth between vertices. Switch to Navigate to move the camera, then resume.');panelBody.append(hint);
  const status=make('div',null,'draw-status');status.setAttribute('role','status');stage.append(status);
  let draftMode=null;
  function spec(){return gsViewSpec(viewer,viewer.canvas.clientWidth,viewer.canvas.clientHeight);}
  function project(p,s){return gsProjectPosition(p.map((v,i)=>v-viewer.origin[i]),s);}
  function repaintStatus(message){status.textContent=message|| (points.length?tr(`未保存草稿 ${points.length} 点 · Enter 完成 · Backspace 退回 · Esc 取消`,`Unsaved draft: ${points.length} vertices · Enter finish · Backspace undo · Esc cancel`):mode==='navigate'?tr('选折线、画笔、面或体开始绘制','Choose Polyline, Freehand, Face or Extrude to draw'):tr('点击画布开始 · 工作平面决定落点深度','Click to start · The work plane sets drawing depth'));}
  function sync(){height.parentElement.hidden=fill.parentElement.hidden=mode!=='extrusion';const empty=stage.querySelector('#empty-state');if(empty)empty.hidden=mode!=='navigate'||viewer.pointCount>0;for(const[key,b]of buttons){b.setAttribute('aria-pressed',String(mode===key));b.classList.toggle('active',mode===key);}overlay.style.pointerEvents=mode==='navigate'?'none':'auto';finish.disabled=!points.length;back.disabled=!points.length;cancel.disabled=!points.length;const locked=points.length&&['polygon','extrusion'].includes(draftMode);plane.disabled=offset.disabled=capture.disabled=!!locked;repaintStatus();paint();}
  function switchMode(next){if(isBusy())return;if(points.length&&next!=='navigate'&&next!==draftMode){onError(tr('请先完成或取消当前草稿，再更换绘制类型。','Finish or cancel the current draft before changing drawing type.'));return;}viewer.stopNavigation?.();mode=next;if(next!=='navigate')panel.open=true;sync();}
  function reset(){points=[];hover=null;draftMode=null;drag=null;sync();}
  function setPlane(fromView=false){if(points.length&&['polygon','extrusion'].includes(draftMode))return;
    if(fromView){const s=spec(),origin=s.target.map((v,i)=>v+viewer.origin[i]);frame=drawFrame(s.basis[2],origin,s.basis[0]);plane.value='view';offset.value=gsDot3(origin,frame.n).toFixed(6);}
    else {const depth=Number(offset.value);if(!Number.isFinite(depth)||!offset.value.trim())return;const n=plane.value==='xy'?[0,0,1]:plane.value==='xz'?[0,-1,0]:plane.value==='yz'?[1,0,0]:frame.n;
      // Axis plane depth is the named coordinate, including positive Y for XZ.
      const value=plane.value==='xz'?-depth:depth;frame=drawFrame(n,n.map(v=>v*value),plane.value==='view'?frame.u:plane.value==='yz'?[0,1,0]:[1,0,0]);}
    hover=null;paint();}
  plane.onchange=()=>{if(plane.value==='view')setPlane(true);else setPlane();};offset.oninput=()=>setPlane();capture.onclick=()=>setPlane(true);
  align.onclick=()=>{viewer.stopNavigation?.();gsSetOrbitBasis(viewer,[frame.u,frame.v,frame.n]);viewer.camera.pan=[0,0];viewer.target=frame.origin.map((v,i)=>v-viewer.origin[i]);viewer.requestRender();};
  function paint(){const w=viewer.canvas.clientWidth,h=viewer.canvas.clientHeight;if(!w||!h)return;const dpr=Math.min(2,window.devicePixelRatio||1);if(overlay.width!==Math.round(w*dpr)||overlay.height!==Math.round(h*dpr)){overlay.width=Math.round(w*dpr);overlay.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    overlay.hidden=!enabled||!!viewer.fly?.active;status.hidden=!enabled||!!viewer.fly?.active;if(overlay.hidden)return;const s=spec();
    const path=(a,b,color,width=1)=>{const p=project(a,s),q=project(b,s);if(!p||!q)return;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
    if(showGrid){const extent=Math.max(.01,(s.perspective?viewer.distance/viewer.camera.zoom*.7:s.worldHeight)*.6),step=Math.pow(10,Math.floor(Math.log10(extent/8))),size=step*10;
      for(let i=-10;i<=10;i++){const at=(a,b)=>frame.origin.map((v,k)=>v+a*frame.u[k]+b*frame.v[k]);path(at(-size,i*step),at(size,i*step),i?'#57967b35':'#528e7190');path(at(i*step,-size),at(i*step,size),i?'#57967b35':'#528e7190');}}
    const contour=[...points];if(hover&&mode!=='navigate')contour.push(hover);
    for(let i=1;i<contour.length;i++)path(contour[i-1],contour[i],'#d47835',2);
    if(contour.length>2&&['polygon','extrusion'].includes(draftMode||mode)){path(contour[contour.length-1],contour[0],'#d4783580',1);const ps=contour.map(p=>project(p,s));if(ps.every(Boolean)){ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle='#d4783520';ctx.fill();}
      if((draftMode||mode)==='extrusion'){const h=Number(height.value)||0,top=contour.map(p=>p.map((v,i)=>v+frame.n[i]*h));for(let i=0;i<contour.length;i++){path(contour[i],top[i],'#d4783570');path(top[i],top[(i+1)%top.length],'#d47835');}}}
    for(let i=0;i<points.length;i++){if(points.length>100&&i%10&&i!==points.length-1)continue;const p=project(points[i],s);if(!p)continue;ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fillStyle='#bb662c';ctx.fill();if(points.length<=30){ctx.font='11px system-ui';ctx.fillText(String(i+1),p.x+6,p.y-5);}}
    if(hover&&mode!=='navigate'){const p=project(hover,s);if(p){ctx.strokeStyle='#305b50';ctx.strokeRect(p.x-5,p.y-5,10,10);}}
  }
  function hit(e){const rect=overlay.getBoundingClientRect(),s=Number(snap.value);const p=drawRayPlane(drawUnproject(spec(),e.clientX-rect.left,e.clientY-rect.top,viewer.origin),frame,Number.isFinite(s)&&s>0?s:0);if(!p)repaintStatus(tr('视线与平面平行或平面在身后，请正对平面或调整深度。','Plane is edge-on or behind the camera. Face the plane or change depth.'));return p;}
  function append(p){if(!p)return;const limit=['polygon','extrusion'].includes(draftMode||mode)?256:4000;if(points.length>=limit){onError(tr(`草稿最多 ${limit} 个顶点，请分成多个部件。`,`At most ${limit} vertices per draft; split into parts.`));return;}if(points.length&&Math.hypot(...p.map((v,i)=>v-points[points.length-1][i]))<1e-7)return;draftMode||=mode;points.push(p);sync();}
  overlay.addEventListener('pointerdown',e=>{if(mode==='navigate'||e.button!==0||isBusy()||drag!==null)return;e.preventDefault();overlay.focus();drag=e.pointerId;strokeBefore=points.length;overlay.setPointerCapture(e.pointerId);hover=hit(e);append(hover);});
  overlay.addEventListener('pointermove',e=>{if(mode==='navigate'||isBusy())return;hover=hit(e);if(drag===e.pointerId&&mode==='brush'&&hover){const last=points[points.length-1],a=last&&project(last,spec()),b=project(hover,spec());if(!a||b&&Math.hypot(b.x-a.x,b.y-a.y)>=5)append(hover);}paint();if(hover)repaintStatus(`${points.length} ${tr('点','vertices')} · XYZ ${hover.map(v=>v.toFixed(3)).join(' / ')}`);});
  const end=e=>{if(drag!==e.pointerId)return;if(e.type==='pointercancel')points.splice(strokeBefore);drag=null;if(overlay.hasPointerCapture(e.pointerId))overlay.releasePointerCapture(e.pointerId);sync();};
  overlay.addEventListener('pointerup',end);overlay.addEventListener('pointercancel',end);overlay.addEventListener('lostpointercapture',end);overlay.addEventListener('contextmenu',e=>e.preventDefault());
  overlay.addEventListener('wheel',e=>{e.preventDefault();viewer.zoomBy(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.001));},{passive:false});
  function complete(){if(isBusy())return;try{const shape={type:['line','brush'].includes(draftMode)?'stroke':draftMode,points:points.map(p=>[...p]),normal:[...frame.n],height:Number(height.value),fill:fill.value};drawCheck(shape);onCommit(shape);mode='navigate';panel.open=false;reset();}catch(e){onError(e.message);}}
  finish.onclick=complete;back.onclick=()=>{if(isBusy())return;points.pop();if(!points.length)draftMode=null;sync();};cancel.onclick=()=>{if(!isBusy())reset();};
  const key=e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||viewer.fly?.active||!points.length)return;if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();complete();}else if(e.key==='Backspace'){e.preventDefault();back.click();}else if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();reset();}};document.addEventListener('keydown',key,true);
  height.oninput=paint;const old=viewer.onViewChange;viewer.onViewChange=(...args)=>{old?.(...args);paint();};const ro=new ResizeObserver(paint);ro.observe(stage);sync();
  return {reset,paint,setEnabled(value){enabled=value;tools.hidden=!value;if(!value)switchMode('navigate');paint();},hasDraft:()=>points.length>0,getDraft:()=>({mode:draftMode,points:points.map(p=>[...p]),frame:JSON.parse(JSON.stringify(frame))}),destroy(){ro.disconnect();document.removeEventListener('keydown',key,true);overlay.remove();status.remove();}};
}
