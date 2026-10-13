import { saveLocalBlob } from '../shared/file-save.js';
import { mountFlyCameraControls } from '../shared/fly-controls.js';
import { mountCameraNavigationControls } from '../shared/camera-navigation-controls.js';
import { GaussianEdits, gsEditStats, gsExportPly } from './edit-state.js';
import { gsProjectPosition, gsViewSpec } from '../shared/camera-geometry.js';

export function mountGaussianEditor({viewer,getModels,onError,onStatus,onChange=()=>{},loadFull=async()=>{}}) {
  const en=document.documentElement.lang==='en', text=(zh,eng)=>en?eng:zh;
  const make=(tag,label,cls)=>{const el=document.createElement(tag);if(label)el.textContent=label;if(cls)el.className=cls;return el;};
  const tools=make('div',null,'gs-edit-toolbar'),stats=make('span',null,'gs-edit-status');
  const section=make('section');section.id='settings-panel-edit';section.dataset.settingsPanel='edit';section.hidden=true;section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','settings-tab-edit');
  const tab=make('button',text('编辑','Edit'));tab.id='settings-tab-edit';tab.type='button';tab.dataset.settingsTab='edit';tab.setAttribute('role','tab');tab.setAttribute('aria-controls',section.id);tab.setAttribute('aria-selected','false');tab.tabIndex=-1;document.querySelector('.inspector-tabs').append(tab);
  document.getElementById('settings-panel-data').parentElement.append(section);
  const launch=make('button',text('编辑','Edit'));launch.type='button';launch.dataset.openSettings='edit';launch.setAttribute('aria-controls','viewer-inspector');launch.setAttribute('aria-expanded','false');document.querySelector('.inspector-shortcuts').append(launch);
  const enable=make('button',text('加载完整数据以修订','Load full data to edit')),note=make('p',text('手机默认先查看。编辑将加载完整数据，可能需要更多时间和内存。','Mobile opens in viewing mode. Editing loads full data and needs more time and memory.'),'presentation-help');enable.type='button';enable.onclick=()=>loadFull().catch(e=>onError(e.message));
  const fieldset=make('fieldset',null,'gs-edit-fields');section.append(note,enable,fieldset);fieldset.append(tools);
  const activeTool=make('button',null,'gs-active-edit');activeTool.type='button';activeTool.hidden=true;document.querySelector('.viewer-toolbar').append(activeTool);
  let loading=false;
  const editable=()=>!loading&&!getModels().some(m=>m.preview);
  const stopEditing=()=>{viewer.editMode='orbit';viewer.canvas.style.cursor='grab';activeTool.hidden=true;if(gesture&&viewer.canvas.hasPointerCapture(gesture.id))viewer.canvas.releasePointerCapture(gesture.id);gesture=null;for(const [m,b]of modeButtons){b.classList.toggle('active',m==='orbit');b.setAttribute('aria-pressed',String(m==='orbit'));}};
  activeTool.onclick=stopEditing;
  document.addEventListener('bwv-inspector-change',e=>{if(e.detail.open&&e.detail.tab!=='edit')stopEditing();});
  const statsLine=make('div',null,'gs-edit-stats');statsLine.append(stats);tools.after(statsLine);
  const edits=new GaussianEdits(()=>{viewer.syncFlags();refresh();onChange();});
  let busy=false,gesture=null,revision=0;
  const button=(parent,zh,eng,fn)=>{const b=make('button',text(zh,eng));b.type='button';b.onclick=()=>{if(!busy)try{viewer.fly?.leave();fn();}catch(e){onError(e.message);}};parent.append(b);return b;};
  const modes=make('div',null,'segmented');tools.append(modes);
  const modeButtons=[];
  for(const [mode,zh,eng]of[['orbit','浏览','Navigate'],['rectangle','框选','Rectangle'],['brush','画刷','Brush']]){
    const b=button(modes,zh,eng,()=>{viewer.stopNavigation();viewer.editMode=mode;activeTool.hidden=mode==='orbit';activeTool.textContent=text(zh+'中 · 结束',eng+' · Done');viewer.canvas.style.cursor=mode==='orbit'?'grab':'crosshair';for(const [m,el]of modeButtons){el.classList.toggle('active',m===mode);el.setAttribute('aria-pressed',String(m===mode));}});modeButtons.push([mode,b]);b.setAttribute('aria-pressed',String(mode==='orbit'));b.classList.toggle('active',mode==='orbit');
  }
  const brushLabel=make('label',text('画刷半径','Brush radius'));const radius=make('input');radius.type='range';radius.min=5;radius.max=120;radius.value=30;radius.setAttribute('aria-label',text('画刷半径','Brush radius'));const radiusValue=make('output','30 px');radius.oninput=()=>radiusValue.textContent=radius.value+' px';brushLabel.append(radius,radiusValue);tools.append(brushLabel);
  button(tools,'全选','Select all',()=>act('all'));button(tools,'清空','Clear',()=>act('clear'));button(tools,'反选','Invert',()=>act('invert'));
  const undo=button(tools,'↶ 撤销','↶ Undo',()=>edits.undo()),redo=button(tools,'↷ 重做','↷ Redo',()=>edits.redo());
  button(tools,'隐藏选区','Hide selected',()=>act('hide'));button(tools,'显示全部','Unhide all',()=>act('unhide'));button(tools,'删除选区','Delete selected',()=>act('delete'));
  button(tools,'导出 PLY','Export PLY',()=>exportData());
  const hint=make('span',text('按高斯中心穿透选择 · Shift 添加 · Ctrl/Cmd 减选 · Alt 拖动浏览','Through-selection of Gaussian centers · Shift add · Ctrl/Cmd subtract · Alt drag to navigate'),'gs-edit-hint');statsLine.append(hint);
  const overlay=make('canvas',null,'gs-selection-overlay');viewer.canvas.parentElement.append(overlay);
  const ctx=overlay.getContext('2d');
  function refresh(){fieldset.disabled=!editable();enable.hidden=editable();enable.disabled=loading;const s=gsEditStats(getModels());stats.textContent=text(`选择 ${s.selected.toLocaleString()} · 隐藏 ${s.hidden.toLocaleString()} · 删除 ${s.deleted.toLocaleString()}`,`Selected ${s.selected.toLocaleString()} · Hidden ${s.hidden.toLocaleString()} · Deleted ${s.deleted.toLocaleString()}`);undo.disabled=!edits.undoStack.length||busy;redo.disabled=!edits.redoStack.length||busy;}
  function act(action){const f={all:a=>(a&6)?a:a|1,clear:a=>a&~1,invert:a=>(a&6)?a:a^1,hide:a=>(a&1)?(a|2)&~1:a,unhide:a=>a&~2,delete:a=>(a&1)?(a|4)&~1:a}[action];edits.apply(getModels(),f);}
  function local(event){const r=viewer.canvas.getBoundingClientRect();return [event.clientX-r.left,event.clientY-r.top];}
  function paint(){const r=viewer.canvas.getBoundingClientRect();overlay.width=r.width;overlay.height=r.height;ctx.clearRect(0,0,r.width,r.height);if(!gesture)return;ctx.strokeStyle='#f1b76b';ctx.fillStyle='#f1b76b22';ctx.lineWidth=1.5;const p=gesture.points;if(gesture.mode==='rectangle'){const a=p[0],b=p[p.length-1];ctx.fillRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);ctx.strokeRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);}else{ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#f1b76b44';ctx.lineWidth=gesture.radius*2;ctx.beginPath();p.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));if(p.length===1)ctx.lineTo(p[0][0]+.01,p[0][1]);ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='#e4a954';ctx.beginPath();ctx.arc(...p[p.length-1],gesture.radius,0,Math.PI*2);ctx.stroke();}}
  function distance2(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy;const t=n?Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/n)):0;return (p.x-a[0]-t*dx)**2+(p.y-a[1]-t*dy)**2;}
  async function select(g){
    if(busy)return;busy=true;refresh();const serial=revision,models=getModels(),hits=new Map(models.map(m=>[m,new Uint8Array(m.count)]));
    const r=viewer.canvas.getBoundingClientRect(),spec=gsViewSpec(viewer,r.width,r.height),origin=[...viewer.origin],source=[...viewer.sourceMap];
    const xs=g.points.map(p=>p[0]),ys=g.points.map(p=>p[1]),padding=g.mode==='brush'?g.radius:0;
    const x0=Math.min(...xs)-padding,x1=Math.max(...xs)+padding,y0=Math.min(...ys)-padding,y1=Math.max(...ys)+padding;
    onStatus(text('正在选择…','Selecting…'));
    try{for(let j=0;j<source.length;j++){
      const [m,i]=source[j];if((m.editFlags?.[i]||0)&6||m.opacity[i]<viewer.gauss.opacityCutoff)continue;
      const p=gsProjectPosition([m.centers[i*3]-origin[0],m.centers[i*3+1]-origin[1],m.centers[i*3+2]-origin[2]],spec);
      if(p&&p.x>=0&&p.x<=r.width&&p.y>=0&&p.y<=r.height&&p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1){let hit=g.mode==='rectangle';if(!hit){if(g.points.length===1)hit=distance2(p,g.points[0],g.points[0])<=g.radius**2;else for(let k=1;k<g.points.length;k++)if(distance2(p,g.points[k-1],g.points[k])<=g.radius**2){hit=true;break;}}if(hit)hits.get(m)[i]=1;}
      if((j&16383)===0){await new Promise(resolve=>setTimeout(resolve,0));if(serial!==revision)return;}
    }
    if(serial===revision)edits.apply(models,(a,i,m)=>{if(a&6)return a;const hit=hits.get(m)[i];return g.subtract?(hit?a&~1:a):g.add?(hit?a|1:a):(hit?a|1:a&~1);});
    }catch(e){onError(e.message);}finally{busy=false;onStatus('');refresh();}
  }
  const down=e=>{if(!editable()||viewer.fly?.active||!getModels().length||viewer.editMode==='orbit'||e.altKey||e.button!==0||busy)return;e.preventDefault();e.stopImmediatePropagation();viewer.canvas.setPointerCapture(e.pointerId);gesture={id:e.pointerId,mode:viewer.editMode,points:[local(e)],radius:Number(radius.value),add:e.shiftKey,subtract:e.ctrlKey||e.metaKey};paint();};
  const move=e=>{if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();const p=local(e),last=gesture.points[gesture.points.length-1];if(gesture.mode==='rectangle')gesture.points[1]=p;else if(Math.hypot(p[0]-last[0],p[1]-last[1])>4)gesture.points.push(p);paint();};
  const up=e=>{if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();const g=gesture;gesture=null;paint();if(viewer.canvas.hasPointerCapture(e.pointerId))viewer.canvas.releasePointerCapture(e.pointerId);if(e.type==='pointerup')select(g);};
  viewer.canvas.addEventListener('pointerdown',down,true);viewer.canvas.addEventListener('pointermove',move,true);for(const name of['pointerup','pointercancel'])viewer.canvas.addEventListener(name,up,true);
  document.addEventListener('keydown',e=>{if(!editable()||viewer.fly?.active||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||busy)return;const cmd=e.ctrlKey||e.metaKey;if(cmd&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?edits.redo():edits.undo();}else if(cmd&&e.key.toLowerCase()==='y'){e.preventDefault();edits.redo();}else if(e.key==='Delete'){e.preventDefault();act('delete');}else if(e.key==='Escape'){if(gesture&&viewer.canvas.hasPointerCapture(gesture.id))viewer.canvas.releasePointerCapture(gesture.id);gesture=null;paint();if(viewer.editMode!=='orbit'){stopEditing();e.preventDefault();}}});
  // Explicit export choices: never silently export a reduced viewport sample.
  const panel=fieldset;
  const exportHeading=make('h3',text('高斯导出','Gaussian export'));panel.append(exportHeading);
  const scope=make('select');scope.setAttribute('aria-label',text('导出范围','Export scope'));
  for(const [value,zh,eng]of[['visible','可见且未删除的高斯','Visible, undeleted Gaussians'],['selected','仅选中的高斯','Selected Gaussians only'],['all','所有未删除高斯（含隐藏）','All undeleted, including hidden']]){const o=make('option',text(zh,eng));o.value=value;scope.append(o);}panel.append(scope);
  const exportTarget=make('select');exportTarget.setAttribute('aria-label',text('导出文件','Export file'));panel.append(exportTarget);
  panel.append(make('p',text('按原始数据导出，不受显示抽样影响。每次导出一个源文件，保留全部原始属性。','Export full-resolution source records, independent of viewport sampling. One source file per export; all original properties are retained.'),'presentation-help'));
  button(panel,'导出高斯 PLY','Export Gaussian PLY',()=>exportData());
  async function exportData(){try{const models=getModels(),m=models[Number(exportTarget.value)||0];if(!m)throw Error(text('请先勾选文件','Select a file first'));const blob=gsExportPly(m,{selectedOnly:scope.value==='selected',includeHidden:scope.value==='all'});await saveLocalBlob(blob,(m.name||'gaussians').replace(/\.ply$/i,'')+'-edited.ply');onStatus(text('已导出高斯 PLY，原文件未修改。','Gaussian PLY exported; source file unchanged.'));}catch(e){onError(e.message);}}
  // Gaussian cameras use their own versioned snapshots; old orthographic bookmarks remain untouched.
  const cameraPanel=document.getElementById('camera-controls');
  cameraPanel.append(make('h3',text('相机','Camera')));
  mountFlyCameraControls(viewer, cameraPanel);
  mountCameraNavigationControls(cameraPanel, viewer);
  const projection=make('select');projection.setAttribute('aria-label',text('投影模式','Projection'));
  for(const [v,z,e]of[['perspective','透视','Perspective'],['orthographic','正交','Orthographic']]){const o=make('option',text(z,e));o.value=v;projection.append(o);}cameraPanel.append(projection);
  projection.onchange=()=>{viewer.stopNavigation();viewer.leaveTraining();viewer.projection=projection.value;viewer.requestRender();};
  const sliders=[];
  for(const [name,zh,eng,min,max,step]of[['fov','视野角','Field of view',10,120,1],['elevation','俯仰角','Elevation',-89,89,.1],['azimuth','方位角','Azimuth',-180,180,.1]]){
    const label=make('label',text(zh,eng),'gs-camera-field'),range=make('input'),number=make('input');range.type='range';number.type='number';for(const input of[range,number]){input.min=min;input.max=max;input.step=step;input.setAttribute('aria-label',text(zh,eng)+(input===range?' slider':' number'));}range.value=number.value=name==='fov'?viewer.fov:viewer.camera[name];
    const change=input=>{const value=Number(input.value);if(!input.value||!Number.isFinite(value)||value<min||value>max)return;viewer.stopNavigation();viewer.leaveTraining();if(name==='fov'){viewer.orbitLens=null;viewer.fov=value;}else viewer.camera[name]=value;range.value=number.value=value;viewer.requestRender();};range.oninput=()=>change(range);number.onchange=()=>change(number);label.append(range,number);cameraPanel.append(label);sliders.push({name,range,number});
  }
  const nearLabel=make('label',text('近裁剪距离（坐标单位）','Near clip (coordinate units)'),'gs-camera-field'),nearInput=make('input');
  nearInput.type='number';nearInput.min=.00001;nearInput.step=.01;nearInput.value=viewer.near;nearInput.setAttribute('aria-label',text('近裁剪距离','Near clip'));
  nearInput.onchange=()=>{const n=Number(nearInput.value);if(Number.isFinite(n)&&n>=.00001){viewer.near=n;viewer.requestRender();}};nearLabel.append(nearInput);cameraPanel.append(nearLabel);
  cameraPanel.append(make('p',text('训练相机使用原始旋转、位置和焦距，并按图像比例适配视口。开始手动浏览时保留当前倾斜角和垂直视野，再进行环绕调整。','Training views preserve rotation, position and focal lengths, fitted to the viewport. Manual navigation preserves the current roll and vertical field of view before orbiting.'),'presentation-help'));
  const poseInfo=make('p',null,'presentation-help');cameraPanel.append(poseInfo);
  let lastCameraUI='',lastCameraAt=-Infinity,cameraUITimer;
  const setValue=(el,value)=>{if(el.value!==String(value))el.value=value;};
  viewer.onViewChange=()=>{
    if(cameraPanel.closest('[hidden]'))return;
    const now=performance.now();if(now-lastCameraAt<80){clearTimeout(cameraUITimer);cameraUITimer=setTimeout(()=>viewer.onViewChange?.(),85);return;}lastCameraAt=now;
    const state=JSON.stringify([viewer.near,viewer.projection,viewer.fov,viewer.distance,viewer.baseHeight,viewer.orbitLens,viewer.camera,viewer.target,viewer.flyPose,viewer.trainingPose,viewer.origin]);
    if(state===lastCameraUI)return;lastCameraUI=state;
    if(document.activeElement!==nearInput)setValue(nearInput,viewer.near);setValue(projection,viewer.projection);for(const s of sliders){const back=(viewer.flyPose||viewer.trainingPose)?.basis[2];const v=s.name==='fov'?viewer.fov:back?(s.name==='elevation'?Math.asin(Math.max(-1,Math.min(1,back[2])))*180/Math.PI:Math.atan2(back[1],back[0])*180/Math.PI):viewer.camera[s.name];if(document.activeElement!==s.number)setValue(s.number,Number(v.toFixed(2)));if(document.activeElement!==s.range)setValue(s.range,v);}const size=viewer.viewportSize||viewer.canvas;const spec=gsViewSpec(viewer,size.width||size.clientWidth,size.height||size.clientHeight);poseInfo.textContent='XYZ: '+spec.eye.map((v,i)=>(v+viewer.origin[i]).toFixed(3)).join(' / ');};
  const bookPanel=document.getElementById('bookmark-controls'),bookName=make('input'),bookList=make('select');bookName.placeholder=text('视角名称','View name');bookName.setAttribute('aria-label',text('视角名称','View name'));bookList.setAttribute('aria-label',text('高斯视角书签','Gaussian bookmarks'));bookPanel.append(bookName,bookList);
  let bookmarks=[];const key='BuildingWebViewer.gaussian.camera.v1';try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))bookmarks=saved.slice(0,50);}catch{}
  function listBooks(){bookList.replaceChildren();for(let i=0;i<bookmarks.length;i++){const o=make('option',bookmarks[i].name);o.value=i;bookList.append(o);}}
  button(bookPanel,'保存当前视角','Save view',()=>{if(bookmarks.length>=50)throw Error('最多 50 个书签 / At most 50 bookmarks');bookmarks.push({name:bookName.value.trim()||text('视角 ','View ')+(bookmarks.length+1),camera:JSON.parse(JSON.stringify(viewer.camera)),projection:viewer.projection,orbitLens:viewer.orbitLens?{...viewer.orbitLens}:null,fov:viewer.fov,distance:viewer.distance,baseHeight:viewer.baseHeight,near:viewer.near,origin:[...viewer.origin],target:[...viewer.target],trainingPose:viewer.trainingPose?JSON.parse(JSON.stringify(viewer.trainingPose)):null});localStorage.setItem(key,JSON.stringify(bookmarks));listBooks();bookList.value=bookmarks.length-1;});
  button(bookPanel,'加载视角','Load view',()=>{const b=bookmarks[Number(bookList.value)];if(!b)return;viewer.stopNavigation();const delta=b.origin.map((v,i)=>v-viewer.origin[i]);viewer.camera=JSON.parse(JSON.stringify(b.camera));viewer.orbitLens=b.orbitLens||null;viewer.projection=b.projection;viewer.fov=b.fov;viewer.distance=b.distance;viewer.baseHeight=b.baseHeight;viewer.near=b.near||.001;viewer.target=b.target.map((v,i)=>v+delta[i]);viewer.trainingPose=b.trainingPose?{...b.trainingPose,eye:b.trainingPose.eye.map((v,i)=>v+delta[i])}:null;viewer.sortDirty=true;viewer.requestRender();});
  button(bookPanel,'删除书签','Delete bookmark',()=>{bookmarks.splice(Number(bookList.value),1);localStorage.setItem(key,JSON.stringify(bookmarks));listBooks();});listBooks();
  refresh();return {edits,refresh,setLoading(value){loading=value;if(value)stopEditing();refresh();},sceneChanged(){revision++;gesture=null;paint();const value=exportTarget.value;exportTarget.replaceChildren();getModels().forEach((m,i)=>{edits.attach(m);const o=make('option',m.name||`PLY ${i+1}`);o.value=i;exportTarget.append(o);});exportTarget.value=value!==''&&Number(value)<getModels().length?value:'0';refresh();},get busy(){return busy;}};
}
