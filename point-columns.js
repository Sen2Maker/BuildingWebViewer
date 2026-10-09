import { POINT_COLUMN_TAGS, defaultPointSettings, pointFieldStats, pointColumnKeys } from './point-dataset.js';

export function mountPointColumns({container,getItems,getSettings,applySettings}) {
  if(!container)return null;
  container.innerHTML=`<section class="inspector-section"><h3>点云列结构</h3><div class="processing-inputs"><label>编辑点云<select id="columns-file"></select></label></div><p class="processing-help">选择已加载的点云。标签和列顺序按文件保存；默认以 Z 高度色带显示。</p></section>
  <div id="columns-body" hidden><section class="inspector-section"><h3>列顺序与标签</h3><div class="column-presets"><select id="columns-start" aria-label="快捷标记起始列"></select><select id="columns-preset" aria-label="快捷标签"><option value="rgb">连续三列 → RGB</option><option value="hsv">连续三列 → HSV</option><option value="normals">连续三列 → 法向量</option><option value="intensity">当前列 → 强度</option></select><button id="columns-mark">标记</button></div>
  <p class="processing-help">拖动行或用 ↑ ↓ 调整顺序。点击列名查看数值。XYZ 的语义固定，但存储位置可移动。</p><div id="columns-rows" class="column-rows"></div>
  <div class="processing-inputs column-color-options"><label>颜色来源<select id="columns-color"><option value="auto">自动（RGB 优先）</option><option value="rgb">已标记的 RGB</option><option value="hsv">已标记的 HSV</option></select></label><label>RGB 范围<select id="columns-rgb"><option value="auto">自动</option><option value="1">0–1</option><option value="255">0–255</option><option value="65535">0–65535</option></select></label><label>HSV 范围<select id="columns-hsv"><option value="degrees">H 0–360，S/V 0–1</option><option value="unit">H/S/V 0–1</option><option value="opencv">H 0–180，S/V 0–255</option></select></label><p class="processing-help">RGB / HSV 各需三列。更改标签不切换视图；在“显示 → 已标记颜色”查看颜色。自定义标签会成为导出字段名，非 ASCII 字符将转换为下划线。</p><button id="columns-apply" class="processing-primary">应用标签与列顺序</button><button id="columns-reset">恢复读取时的列设置</button></div></section>
  <section class="inspector-section"><h3>属性数值</h3><p id="columns-stats" class="processing-help"></p><div class="column-preview"><table id="columns-preview"></table></div><p class="processing-help">预览前 5 个当前显示点；统计也基于显示样本，不会为此重新读取大文件。</p></section></div><p id="columns-status" class="processing-help" role="status"></p>`;
  const el=id=>container.querySelector(`#${id}`), make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  let items=[],current=null,draft=null,selectedKey='',dragged=null,lastSettings=null,lastCloud=null;
  const statsCache=new WeakMap(), status=text=>{el('columns-status').textContent=text;};
  function stats() {
    if(!current||!selectedKey)return;
    const values=current.rawCloud.fields[selectedKey];if(!values)return;
    let s=statsCache.get(values);if(!s){s=pointFieldStats(values);statsCache.set(values,s);}
    const fmt=value=>value===null?'—':Number.isFinite(value)?Number(value.toPrecision(8)).toString():String(value);
    el('columns-stats').textContent=`${selectedKey} · ${s.count.toLocaleString()} 个值 · 有效 ${s.finite.toLocaleString()} / 缺失 ${s.missing.toLocaleString()} · 最小 ${fmt(s.min)} · 最大 ${fmt(s.max)}`;
    const table=el('columns-preview');table.replaceChildren();const head=make('tr');head.append(make('th','点'));
    for(const key of draft.order)head.append(make('th',key));table.append(head);
    for(let i=0;i<Math.min(5,current.rawCloud.count);i++){const row=make('tr');row.append(make('td',String(i+1)));for(const key of draft.order)row.append(make('td',fmt(current.rawCloud.fields[key]?.[i])));table.append(row);}
  }
  function move(key,to) {
    const from=draft.order.indexOf(key);if(from<0||to<0||to>=draft.order.length)return;
    draft.order.splice(from,1);draft.order.splice(to,0,key);renderRows();status('列顺序已调整，点击“应用”生效。');
  }
  function renderRows() {
    const rows=el('columns-rows'),scroll=rows.scrollTop;rows.replaceChildren();
    draft.order.forEach((key,index)=>{
      const row=make('div');row.className='column-row';row.draggable=true;row.dataset.column=key;
      const number=make('span',String(index+1));number.className='column-index';
      const name=make('button',key);name.type='button';name.className='column-name';name.title=key;name.setAttribute('aria-pressed',String(key===selectedKey));name.onclick=()=>{selectedKey=key;renderRows();};
      row.append(number,name);
      if(['x','y','z'].includes(key)){const fixed=make('span',`坐标 ${key.toUpperCase()}`);fixed.className='column-fixed';row.append(fixed);}
      else {
        const select=make('select');select.setAttribute('aria-label',`${key} 的标签`);
        for(const [value,label] of Object.entries(POINT_COLUMN_TAGS)){const option=make('option',label);option.value=value;select.append(option);}
        select.value=draft.tags[key]||'scalar';select.onchange=()=>{draft.tags[key]=select.value;renderRows();status('标签待应用。');};row.append(select);
      }
      for(const [delta,text,label] of [[-1,'↑','上移'],[1,'↓','下移']]){const button=make('button',text);button.className='column-move';button.disabled=index+delta<0||index+delta>=draft.order.length;button.setAttribute('aria-label',`${label} ${key}`);button.onclick=()=>move(key,index+delta);row.append(button);}
      if(draft.tags[key]==='custom'){const input=make('input');input.value=draft.custom[key]||'';input.placeholder='自定义标签，例如 confidence';input.maxLength=80;input.setAttribute('aria-label',`${key} 的自定义标签`);input.className='column-custom';input.oninput=()=>{draft.custom[key]=input.value;};row.append(input);}
      row.ondragstart=event=>{if(['INPUT','SELECT'].includes(event.target.tagName)){event.preventDefault();return;}dragged=key;event.dataTransfer.setData('text/plain',key);event.dataTransfer.effectAllowed='move';};
      row.ondragover=event=>event.preventDefault();row.ondrop=event=>{event.preventDefault();if(dragged)move(dragged,index);dragged=null;};row.ondragend=()=>{dragged=null;};rows.append(row);
    });rows.scrollTop=scroll;
    const previous=el('columns-start').value;el('columns-start').replaceChildren();draft.order.forEach((key,index)=>{const option=make('option',`第 ${index+1} 列 · ${key}`);option.value=key;el('columns-start').append(option);});
    el('columns-start').value=draft.order.includes(previous)?previous:draft.order.find(key=>!['x','y','z'].includes(key))||draft.order[0];stats();
  }
  function choose(item) {
    current=item;el('columns-body').hidden=!current;if(!current){status('加载点云后，在这里查看和编辑列结构。');return;}
    lastSettings=getSettings(current.entry,current.rawCloud);lastCloud=current.rawCloud;draft=JSON.parse(JSON.stringify(lastSettings));
    selectedKey=draft.order.includes(selectedKey)?selectedKey:draft.order[0];
    el('columns-color').value=draft.colorSpace;el('columns-rgb').value=draft.rgbScale;el('columns-hsv').value=draft.hsvScale;
    renderRows();status('修改仅保存在本次页面；导出后列顺序和标签写入文件。');
  }
  function refresh() {
    items=getItems();const previous=current?.entry;el('columns-file').replaceChildren();
    items.forEach((item,index)=>{const option=make('option',item.name);option.value=String(index);el('columns-file').append(option);});
    const index=Math.max(0,items.findIndex(item=>item.entry===previous));el('columns-file').value=String(index);const next=items[index]||null;
    if(next?.entry!==current?.entry || next?.rawCloud!==lastCloud || next && getSettings(next.entry,next.rawCloud)!==lastSettings)choose(next);
    else if(!next)choose(null);
  }
  el('columns-file').onchange=()=>choose(items[Number(el('columns-file').value)]);
  el('columns-mark').onclick=()=>{
    const roles={rgb:['red','green','blue'],hsv:['hue','saturation','value'],normals:['nx','ny','nz'],intensity:['intensity']}[el('columns-preset').value];
    const from=draft.order.indexOf(el('columns-start').value),keys=draft.order.slice(from,from+roles.length);
    if(keys.length!==roles.length||keys.some(key=>['x','y','z'].includes(key))){status('请选择足够数量的连续属性列，不能覆盖 XYZ。');return;}
    for(const key of draft.order)if(roles.includes(draft.tags[key]))draft.tags[key]='scalar';
    keys.forEach((key,index)=>draft.tags[key]=roles[index]);renderRows();status('已设置快捷标签，点击“应用”生效。');
  };
  el('columns-apply').onclick=async()=>{
    if(!current)return;
    draft.colorSpace=el('columns-color').value;draft.rgbScale=el('columns-rgb').value;draft.hsvScale=el('columns-hsv').value;
    try{await applySettings(current.entry,JSON.parse(JSON.stringify(draft)));refresh();status('已应用。保留当前着色方式；导出将采用当前列顺序。');}catch(error){status(error.message);}
  };
  el('columns-reset').onclick=()=>{if(!current)return;draft=defaultPointSettings({...current.rawCloud,semantics:null});el('columns-color').value=draft.colorSpace;el('columns-rgb').value=draft.rgbScale;el('columns-hsv').value=draft.hsvScale;renderRows();status('已恢复读取时的设置，点击“应用”生效。');};
  refresh();return {refresh};
}
