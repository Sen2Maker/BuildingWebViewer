import { t } from './i18n.js';
/** One category order and one shortcut style for every web viewer, including App pages. */
export function prepareInspectorNavigation(root=document){
  const panel=root.getElementById('viewer-inspector');if(!panel)return;
  const tabs=panel.querySelector('.inspector-tabs'),content=panel.querySelector('.inspector-content'),shortcuts=root.querySelector('.inspector-shortcuts');
  const dataControls=root.querySelector('[data-data-controls]')||root.getElementById('wire-controls')?.closest('.inspector-section');
  let data=panel.querySelector('[data-settings-panel="data"]');
  if(dataControls&&!data){
    data=root.createElement('section');data.id='settings-panel-data';data.dataset.settingsPanel='data';data.hidden=true;data.setAttribute('role','tabpanel');data.setAttribute('aria-labelledby','settings-tab-data');content.prepend(data);
    const tab=root.createElement('button');tab.type='button';tab.id='settings-tab-data';tab.dataset.settingsTab='data';tab.setAttribute('role','tab');tab.setAttribute('aria-controls',data.id);tab.setAttribute('aria-selected','false');tab.tabIndex=-1;tab.textContent=t('数据');tabs.prepend(tab);
  }
  if(dataControls)data.append(dataControls);
  // Studio's tools/attributes are its data workspace; keep its stable saved identifiers.
  const labels={data:'数据',tools:'数据',display:'显示',camera:'相机',bookmarks:'书签',processing:'处理',diagnostics:'诊断',edit:'编辑'};
  const icons={data:'<path d="M4 5h16v14H4zM4 10h16M9 5v14"/>',tools:'<path d="M4 5h16v14H4zM4 10h16M9 5v14"/>',display:'<path d="M4 5h16M4 12h16M4 19h16"/><path d="M8 3v4M16 10v4M10 17v4"/>',camera:'<path d="M8 6l2-3h4l2 3h4v14H4V6z"/><circle cx="12" cy="12" r="4"/>',bookmarks:'<path d="M6 3h12v18l-6-4-6 4z"/>'};
  const order=['data','tools','display','camera','bookmarks','processing','diagnostics','edit'];
  const all=[...tabs.querySelectorAll('[data-settings-tab]')].sort((a,b)=>{const rank=x=>order.includes(x)?order.indexOf(x):99;return rank(a.dataset.settingsTab)-rank(b.dataset.settingsTab);});
  for(const tab of all){const key=tab.dataset.settingsTab;if(labels[key])tab.textContent=t(labels[key]);tabs.append(tab);}
  const actions=[...shortcuts.querySelectorAll('button')].filter(button=>!button.dataset.openSettings);
  shortcuts.replaceChildren();let extra=null;
  function addExtra(button){if(!extra){extra=root.createElement('details');extra.className='viewer-extra-tools';const summary=root.createElement('summary');summary.textContent=t('工具');extra.append(summary);const menu=root.createElement('div');menu.className='viewer-extra-menu';extra.append(menu);shortcuts.append(extra);extra.addEventListener('keydown',event=>{if(event.key==='Escape'){extra.open=false;summary.focus();}});root.addEventListener('pointerdown',event=>{if(!extra.contains(event.target))extra.open=false;});}extra.querySelector('.viewer-extra-menu').append(button);button.addEventListener('click',()=>{extra.open=false;});}
  for(const tab of all){const key=tab.dataset.settingsTab,button=root.createElement('button');button.type='button';button.dataset.openSettings=key;button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-expanded','false');
    const icon=root.createElement('span');icon.className='settings-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML=icons[key]?`<svg viewBox="0 0 24 24">${icons[key]}</svg>`:'·';const label=root.createElement('span');label.textContent=tab.textContent;button.append(icon,label);
    if(order.indexOf(key)>4||!order.includes(key))addExtra(button);else shortcuts.append(button);
  }
  for(const button of actions)addExtra(button);
  root.querySelector('.main-heading')?.classList.add('viewer-heading');
}
