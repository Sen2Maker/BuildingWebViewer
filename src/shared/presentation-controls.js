import { t } from './i18n.js';
import { currentPresentation, rememberPresentation } from './render-style.js';
export function mountPresentationControls({root=document,getViewers,pauseSync=callback=>callback()}) {
  const container=root.querySelector('#settings-panel-display');if(!container)return;
  const doc=container.ownerDocument,section=doc.createElement('section');section.className='inspector-section presentation-controls';
  const el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=t(text);return n;};
  section.append(el('h3','渲染样式'));const status=el('p');status.className='presentation-help';status.setAttribute('role','status');
  function field(name,label,kind,values){
    const row=el('label',label),input=el(kind==='select'?'select':'input');input.setAttribute('aria-label',t(label));
    const initial=currentPresentation()[name];
    if(kind==='select'){for(const [value,text] of values){const o=el('option',text);o.value=value;input.append(o);}input.value=initial;}
    else if(kind==='checkbox'){input.type='checkbox';input.checked=initial;}
    else if(kind==='color'){input.type='color';input.value=initial || values;}
    else{input.type='number';input.min=values[0];input.max=values[1];input.step=values[2];input.value=initial;}
    row.append(input);section.append(row);
    input.onchange=()=>{
      const value=kind==='checkbox'?input.checked:['select','color'].includes(kind)?input.value:Number(input.value);
      if(kind==='number'&&(!Number.isFinite(value)||value<Number(input.min)||value>Number(input.max))){status.textContent=t('请输入范围内的数值。');return;}
      const prior=currentPresentation()[name];
      try{pauseSync(()=>{for(const viewer of getViewers())viewer.setOptions({[name]:value});});rememberPresentation({[name]:value});status.textContent=name==='pointRatio'?t('仅抽样当前显示点；原始数据与计算、文件导出不变。'):'';}
      catch(error){pauseSync(()=>{for(const viewer of getViewers())try{viewer.setOptions({[name]:prior});}catch{}});if(kind==='checkbox')input.checked=prior;else input.value=prior;status.textContent=error.message;}
    };
    if(kind==='number')input.oninput=input.onchange;
    return input;
  }
  field('axes','XYZ 朝向','checkbox');field('ruler','坐标比例尺','checkbox');field('legend','颜色图例','checkbox');
  if(root.body.dataset.tool!=='lod')field('pointCountLabel','显示点数','checkbox');
  if(root.body.dataset.tool!=='lod'){
    field('pointStyle','点的样式','select',[['disc','圆点'],['square','方点'],['sphere','球形光照']]);
    const ratio=field('pointRatio','显示点比例（%）','number',[1,100,1]);
    const slider=el('input');slider.type='range';slider.min=1;slider.max=100;slider.step=1;slider.value=ratio.value;slider.setAttribute('aria-label',t('拖动调整显示点比例'));
    const pair=el('span');pair.className='presentation-range';ratio.before(pair);pair.append(slider,ratio);
    // Coalesce rapid pointer events; one sample-buffer update per animation frame.
    let pending=null;const applyRatio=ratio.onchange;
    const schedule=()=>{if(pending===null)pending=requestAnimationFrame(()=>{pending=null;applyRatio();slider.value=ratio.value;});};
    slider.oninput=()=>{ratio.value=slider.value;schedule();};
    ratio.oninput=ratio.onchange=()=>{if(ratio.value!==''&&ratio.checkValidity()){slider.value=ratio.value;schedule();}};
    const help=el('p','球形光照为拟球着色，不生成球体网格。比例抽样作用于当前勾选显示的点云，100% 恢复全部已加载点。');help.className='presentation-help';section.append(help);
  }
  if(root.body.dataset.tool!=='pointcloud'){
    const style=field('lineStyle','线的样式','select',[['native','细线'],['cylinder','圆柱'],['box','方柱']]);
    const width=field('lineWidth','线宽（屏幕 px）','number',[.5,24,.5]),gradient=field('lineGradient','端点渐变（立体线）','checkbox');
    const end=field('lineEndColor','渐变终点颜色','color','#417ec4');
    const availability=()=>{width.disabled=gradient.disabled=style.value==='native';end.disabled=style.value==='native'||!gradient.checked;};
    style.addEventListener('change',availability);gradient.addEventListener('change',availability);availability();
    const help=el('p','立体线使用实例化绘制；渐变沿文件中的边方向变化。细线宽度由浏览器决定。');help.className='presentation-help';section.append(help);
  }
  if(root.body.dataset.tool==='lod')field('surfaceStyle','面的光照','select',[['matte','柔和光照'],['unlit','无光照'],['gloss','高光材质']]);
  section.append(status);container.append(section);
}
