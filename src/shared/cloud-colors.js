import { t } from './i18n.js';
export function displayColorOverride(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? [1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255) : null;
}
/** This inspector changes render metadata, never point attributes or exported values. */
export function mountCloudColors({container,getItems,onChange}) {
  const doc=container.ownerDocument,section=doc.createElement('section');section.className='inspector-section cloud-colors';
  const title=doc.createElement('h3');title.textContent=t('逐点云指定颜色');
  const help=doc.createElement('p');help.className='presentation-help';help.textContent=t('指定颜色优先于全局着色；恢复后使用全局规则。只改变显示，不修改原始 RGB / HSV。');
  const rows=doc.createElement('div'),status=doc.createElement('p');status.setAttribute('role','status');status.className='presentation-help';
  const reset=doc.createElement('button');reset.textContent=t('全部恢复全局着色');
  section.append(title,help,rows,reset,status);container.append(section);
  function apply(item,value){
    const before=item.entry.displayColor;
    try{item.entry.displayColor=value;onChange();status.textContent='';refresh();}
    catch(error){item.entry.displayColor=before;status.textContent=error.message;}
  }
  function refresh(){
    rows.replaceChildren();const items=getItems();reset.disabled=!items.some(item=>item.entry.displayColor);
    if(!items.length){const empty=doc.createElement('p');empty.className='presentation-help';empty.textContent=t('勾选并加载点云后，可逐个指定颜色。');rows.append(empty);}
    for(const item of items){
      const row=doc.createElement('div');row.className='cloud-color-row';
      const label=doc.createElement('label'),input=doc.createElement('input'),name=doc.createElement('span');
      name.textContent=item.name;name.title=item.name;input.type='color';input.value=item.entry.displayColor||'#547d99';input.setAttribute('aria-label',t('指定 {0} 的颜色',[item.name]));
      input.onchange=()=>apply(item,input.value);label.append(name,input);
      const button=doc.createElement('button');button.textContent=t('恢复');button.disabled=!item.entry.displayColor;button.setAttribute('aria-label',t('恢复 {0} 的全局着色',[item.name]));button.onclick=()=>apply(item,null);
      row.append(label,button);rows.append(row);
    }
  }
  reset.onclick=()=>{const items=getItems(),before=items.map(item=>item.entry.displayColor);try{for(const item of items)item.entry.displayColor=null;onChange();refresh();}catch(error){items.forEach((item,i)=>item.entry.displayColor=before[i]);status.textContent=error.message;}};
  refresh();return {refresh};
}
