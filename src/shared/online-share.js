import {mountOnlinePointSettings} from './online-point-settings.js';
import {capturePresentation,applyPresentationControls,readPresentation,withPresentation,presentationSelectors} from './online-presentation.js';
import './online-workflow.css';
const text=(zh,en)=>document.documentElement.lang.startsWith('en')?en:zh;
const el=(tag,label,parent,cls='')=>{const n=document.createElement(tag);if(label)n.textContent=label;if(cls)n.className=cls;parent?.append(n);return n;};
/** One editor for real datasets and examples. All settings drive the existing viewer controls. */
export function mountOnlineShare({anchor,link,captureCamera=()=>null,applyView,configuration,ready=()=>true}){
 const open=el('button',text('配置与分享','Configure & share'),anchor,'online-configure');open.type='button';open.disabled=true;
 const dialog=el('dialog','',document.body,'online-workflow-dialog online-share-dialog');dialog.setAttribute('aria-label',text('配置在线数据与分享','Configure and share online data'));
 const head=el('div','',dialog,'online-dialog-heading');const titles=el('div','',head);el('span','02 / CONFIGURE',titles,'online-eyebrow');el('h2',text('调好画面，再分享。','Make the view yours. Then share.'),titles);const close=el('button','×',head,'online-close');close.type='button';close.setAttribute('aria-label',text('关闭','Close'));close.onclick=()=>dialog.close();
 el('p',text('数据已打开。这里的选项与查看器共用；可关闭此窗口，旋转、缩放或使用“数据 / 显示 / 相机”继续调整。','Data is open. These are the viewer’s own settings. Close this window to orbit, zoom or adjust Data / Display / Camera.'),dialog,'online-lead');
 const fields=el('div','',dialog,'online-settings-sections');
 const groups=[
 ['视窗与图层','Viewports & layers',[['mesh-compare-count','视窗布局','Layout'],['mesh-layers-1','视窗 1 图层','Pane 1 layers'],['mesh-layers-2','视窗 2 图层','Pane 2 layers'],['mesh-layers-3','视窗 3 图层','Pane 3 layers'],['show-points','显示点云','Show points'],['show-wire','显示线框','Show wireframe']]],
 ['点云与模型外观','Point & mesh appearance',[['display-mode','网格显示','Mesh display'],['scale-mode','模型尺度','Model scale'],['mesh-point-color-mode','点云着色','Point coloring'],['color-mode','着色依据','Coloring'],['mesh-point-color','点云单色','Point solid color'],['point-color','点云单色','Point solid color'],['wire-color','线框颜色','Wire color'],['mesh-point-size','点大小','Point size'],['point-size','点大小','Point size'],['mesh-point-opacity','点透明度','Point opacity'],['point-opacity','点透明度','Point opacity'],['mesh-point-style','点样式','Point style'],['point-style','点样式','Point style']]],
 ['辅助显示','View aids',[['show-grid','显示网格','Show grid'],['show-edges','轮廓边','Outline edges'],['show-labels','建筑编号','Building labels']]]
 ];
 const report=el('p','',dialog,'online-workflow-status');report.setAttribute('role','status');
 const actions=el('div','',dialog,'online-workflow-actions');const adjust=el('button',text('到画面调整视角','Adjust view on canvas'),actions);adjust.type='button';adjust.onclick=()=>dialog.close();
 const generate=el('button',text('生成分享链接','Generate share link'),actions,'online-primary');generate.type='button';
 const result=el('section','',dialog,'online-share-result');result.hidden=true;el('h3',text('直达当前配置','Open this exact configuration'),result);
 const output=el('textarea','',result);output.readOnly=true;output.setAttribute('aria-label',text('分享直链','Share URL'));const resultActions=el('div','',result,'online-workflow-actions');const copy=el('button',text('复制链接','Copy link'),resultActions);copy.type='button';const visit=el('a',text('打开分享页面 ↗','Open shared view ↗'),resultActions);visit.target='_blank';visit.rel='noopener';
 el('p',text('链接保存当前数据、展示范围、显示参数和视角。之后继续调整，请重新生成链接。','The link saves the dataset, selection, display settings and camera. Regenerate it after further changes.'),result,'online-note');
 let initial=true,autoShown=false,busy=false,mappingPending=false,palettePending=false;
 function invalidate(){result.hidden=true;output.value='';visit.removeAttribute('href');report.textContent='';}
 function render(){
  fields.replaceChildren();mappingPending=false;palettePending=false;
  mountOnlinePointSettings(fields,configuration?.points,{onBusy:value=>{busy=value;generate.disabled=value;},onChange:applied=>{invalidate();mappingPending=applied===false;if(applied!==false)render();}});
  const pointState=configuration?.points?.get();
  for(const [zhGroup,enGroup,specs]of groups){
   const section=el('details','',fields,'online-settings-section');section.open=zhGroup==='视窗与图层';el('summary',text(zhGroup,enGroup),section);const grid=el('div','',section,'online-setting-grid');
   for(const [key,zh,en]of specs){const source=document.querySelector(presentationSelectors[key]);if(!source||source.disabled)continue;if(key.startsWith('mesh-layers-')&&Number(key.slice(-1))>Number(document.querySelector('#mesh-compare-count')?.value||1))continue;
    const row=el('label',text(zh,en),grid),input=el(source.tagName.toLowerCase(),'',row);
    if(source.tagName==='SELECT'){for(const o of source.options){const option=el('option',o.textContent,input);option.value=o.value;option.disabled=o.disabled;
      if(o.value==='rgb'&&pointState&&!pointState.cloud.rgb){const tags=Object.values(pointState.settings?.tags||{});if(!['red','green','blue'].every(r=>tags.includes(r))&&!['hue','saturation','value'].every(r=>tags.includes(r))){option.disabled=true;option.textContent=text('RGB / HSV（缺少颜色通道）','RGB / HSV (color channels missing)');}}
    }}else{input.type=source.type;for(const attr of ['min','max','step'])if(source.hasAttribute(attr))input.setAttribute(attr,source.getAttribute(attr));}input.value=source.value;input.checked=source.checked;
    const value=source.type==='range'?el('output',input.value,row,'online-range-value'):null;
    const update=()=>{source.value=input.value;source.checked=input.checked;source.dispatchEvent(new Event(source.type==='range'?'input':'change',{bubbles:true}));if(value)value.textContent=input.value;invalidate();
      // Enable dependent controls without discarding unapplied field/range edits.
      if(['mesh-compare-count','color-mode','mesh-point-color-mode'].includes(key)&&!mappingPending&&!palettePending){const openGroups=[...fields.querySelectorAll('details[open]>summary')].map(n=>n.textContent);render();for(const d of fields.querySelectorAll('details'))d.open=openGroups.includes(d.querySelector('summary').textContent);}
    };if(source.type==='range')input.oninput=update;else input.onchange=update;
   }if(!grid.children.length)section.remove();
  }
  const palette=configuration?.getPalette?.();if(palette){
   const section=el('details','',fields,'online-settings-section');el('summary',text('色带与数值范围','Palette & value range'),section);const grid=el('div','',section,'online-setting-grid');
   const select=el('select','',el('label',text('色带','Palette'),grid));for(const o of document.querySelector('.palette-panel select')?.options||[]){const n=el('option',o.textContent,select);n.value=o.value;}select.value=palette.palette;
   const reverse=el('input','',el('label',text('反转色带','Reverse palette'),grid));reverse.type='checkbox';reverse.checked=palette.reverse;
   const auto=el('input','',el('label',text('自动数值范围','Automatic value range'),grid));auto.type='checkbox';auto.checked=!palette.range;
   const low=el('input','',el('label',text('数值最小值','Minimum value'),grid)),high=el('input','',el('label',text('数值最大值','Maximum value'),grid));for(const n of [low,high]){n.type='number';n.step='any';n.disabled=auto.checked;}low.value=palette.range?.min??document.querySelector('.palette-min')?.value??'';high.value=palette.range?.max??document.querySelector('.palette-max')?.value??'';
   const status=el('p',text('高度和数值属性共用此范围；固定范围可让不同建筑使用相同的颜色尺度。','Height and scalar fields share this range. A fixed range keeps colors comparable between buildings.'),section,'online-note');
   const applyPalette=()=>{invalidate();low.disabled=high.disabled=auto.checked;try{if(!auto.checked&&(!low.value||!high.value||!Number.isFinite(low.valueAsNumber)||!Number.isFinite(high.valueAsNumber)||low.valueAsNumber>=high.valueAsNumber))throw Error(text('请填写有效范围，最小值必须小于最大值。','Enter a valid range: minimum must be less than maximum.'));configuration.setPalette({palette:select.value,reverse:reverse.checked,range:auto.checked?null:{min:low.valueAsNumber,max:high.valueAsNumber}});palettePending=false;status.textContent=text('已应用色带设置。','Palette settings applied.');}catch(error){palettePending=true;status.textContent=error.message;}};for(const n of [select,reverse,auto,low,high])n.onchange=applyPalette;low.oninput=high.oninput=applyPalette;
  }
  el('p',text('分享保存已应用的字段映射、显示参数、色带范围与主视角。数据加工结果、未上传的叠加文件和各视窗独立视角不包含在链接中。','Sharing saves applied field mappings, display settings, palette range and the primary camera. Processed outputs, unhosted overlays and independent pane cameras are not included.'),fields,'online-note');
 }
 open.onclick=()=>{render();invalidate();dialog.showModal();};
 generate.onclick=()=>{try{if(!ready()||busy)throw Error(text('请等待数据加载完成。','Wait for the data to finish loading.'));if(mappingPending||palettePending)throw Error(text('请先应用字段映射，并修正数值范围。','Apply field mappings and correct the value range first.'));const view=capturePresentation(captureCamera);const state=configuration?.points?.get();if(state?.settings){view.pointSettings=state.settings;const tags=Object.values(state.settings.tags||{});if(!state.cloud.rgb&&[view.controls['mesh-point-color-mode'],view.controls['color-mode']].includes('rgb')&&!['red','green','blue'].every(k=>tags.includes(k))&&!['hue','saturation','value'].every(k=>tags.includes(k)))throw Error(text('当前点云没有完整颜色通道，请指定映射或选择高度 / 单色。','No complete color channels: map fields or choose height / solid coloring.'));}const palette=configuration?.getPalette?.();if(palette)view.palette=palette;if(!view.camera)throw Error(text('尚未获得有效视角，请等待模型显示。','A valid camera is not ready yet.'));output.value=withPresentation(link(),view);visit.href=output.value;result.hidden=false;report.textContent=text('已保存当前参数与视角，可直接分享。','Current settings and camera saved. Ready to share.');}catch(error){report.textContent=error.message;result.hidden=true;}};
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(output.value);report.textContent=text('链接已复制','Link copied');}catch{output.focus();output.select();report.textContent=text('请手动复制已选中的链接。','Copy the selected URL manually.');}};
 const changed=event=>{if(!dialog.contains(event.target))invalidate();};document.addEventListener('change',changed);const canvas=document.querySelector('#viewer-grid, #viewport');canvas?.addEventListener('pointerdown',invalidate);
 return {async loaded(){open.disabled=!ready();if(!ready()||busy)return;if(initial){initial=false;try{const view=readPresentation();if(view){busy=true;if(applyView)await applyView(view);else applyPresentationControls(view);}}catch(error){report.textContent=error.message;render();dialog.showModal();}finally{busy=false;}}
   const url=new URL(location.href);if(!autoShown&&url.searchParams.get('configure')==='1'){autoShown=true;url.searchParams.delete('configure');history.replaceState(null,'',url);render();dialog.showModal();}},loading(){open.disabled=true;invalidate();},dispose(){dialog.remove();open.remove();document.removeEventListener('change',changed);canvas?.removeEventListener('pointerdown',invalidate);}};
}
