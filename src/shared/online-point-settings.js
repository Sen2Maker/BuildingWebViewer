import {defaultPointSettings,validatePointSettings,pointColumnKeys} from '../pointcloud/point-dataset.js';
const safeKey=key=>typeof key==='string'&&key.length>0&&key.length<=120&&!/[\u0000-\u001f]/.test(key)&&!['__proto__','constructor','prototype'].includes(key);
/** A small field-schema contract only. No point arrays or source data enter a URL. */
export function validateSharedPointSettings(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['order','tags','custom','rgbScale','hsvScale','colorSpace'].includes(k)))throw Error('无效点云字段配置 / Invalid point settings');
 if(!Array.isArray(value.order)||value.order.length>128||value.order.some(k=>!safeKey(k)))throw Error('字段数量或名称无效 / Invalid field names');
 for(const record of [value.tags,value.custom])if(!record||typeof record!=='object'||Array.isArray(record)||Object.entries(record).some(([k,v])=>!safeKey(k)||!value.order.includes(k)||typeof v!=='string'||v.length>120))throw Error('无效字段标签 / Invalid field tags');
 const clean=JSON.parse(JSON.stringify(value));validatePointSettings({fields:Object.fromEntries(clean.order.map(k=>[k,[]]))},clean);return clean;
}
export function settingsForCloud(cloud,settings){const clean=validateSharedPointSettings(settings);validatePointSettings(cloud,clean);return clean;}
export function mountOnlinePointSettings(container,adapter,{onChange=()=>{},onBusy=()=>{}}={}){
 const text=(zh,en)=>document.documentElement.lang.startsWith('en')?en:zh;
 const el=(tag,label,parent)=>{const n=document.createElement(tag);if(label)n.textContent=label;parent?.append(n);return n;};
 const state=adapter?.get();if(!state?.cloud)return;
 const cloud=state.cloud,settings=state.settings||defaultPointSettings(cloud),keys=pointColumnKeys(cloud),attributes=keys.filter(k=>!['x','y','z'].includes(k));
 const details=el('details','',container);details.className='online-settings-section';details.open=true;el('summary',text('点云字段与颜色来源','Point fields & color source'),details);
 el('p',text('坐标：X / Y / Z。下面显示当前数据实际携带的属性；映射只影响显示，不改写源文件。','Coordinates: X / Y / Z. These are actual data attributes. Mapping changes the view without rewriting source files.'),details).className='online-note';
 if(!attributes.length){el('p',text(cloud.rgb?'颜色来源：文件内置 RGB。当前数据没有可重新映射的独立颜色列。':'当前数据只有 XYZ 坐标，没有 RGB / HSV 属性。可使用高度色带或单色；不能从坐标推断真实颜色。',cloud.rgb?'Color source: embedded RGB. No separate color columns are available.':'This data has XYZ coordinates only, without RGB / HSV attributes. Use height or solid coloring; coordinates do not provide true color.'),details).className='online-data-notice';return;}
 const table=el('table','',details);table.className='online-field-table';const head=el('tr','',table);for(const name of [text('原始字段','Source field'),text('前 3 个值','First 3 values')])el('th',name,head);
 for(const key of attributes){const row=el('tr','',table);el('td',key,row);el('td',Array.from(cloud.fields[key]?.slice(0,3)||[]).map(v=>Number.isFinite(v)?Number(v.toPrecision(5)):'—').join(' · '),row);}
 const grid=el('div','',details);grid.className='online-setting-grid';
 const select=(label,values,current)=>{const row=el('label',label,grid),input=el('select','',row);for(const [v,l]of values){const o=el('option',l,input);o.value=v;}input.value=current;return input;};
 const space=select(text('颜色解释方式','Color interpretation'),[['auto',text('自动识别','Automatic')],['rgb','RGB'],['hsv','HSV']],settings.colorSpace);
 const rgb=select(text('RGB 数值范围','RGB value range'),[['auto',text('自动','Automatic')],['1','0–1'],['255','0–255'],['65535','0–65535']],settings.rgbScale);
 const hsv=select(text('HSV 数值范围','HSV value range'),[['degrees','H 0–360 / S,V 0–1'],['unit','H,S,V 0–1'],['opencv','H 0–180 / S,V 0–255']],settings.hsvScale);
 const roles=['red','green','blue','hue','saturation','value'];const names=['R · 红','G · 绿','B · 蓝','H · 色相','S · 饱和度','V · 明度'];
 const maps=roles.map((role,i)=>select(text(names[i],role),[['',text('未指定','Unassigned')],...attributes.map(k=>[k,k])],settings.order.find(k=>settings.tags[k]===role)||''));
 const status=el('p','',details);status.className='online-note';status.setAttribute('role','status');
 const apply=el('button',text('应用字段与颜色映射','Apply field & color mapping'),details);apply.type='button';
 apply.onclick=async()=>{apply.disabled=true;onBusy(true);try{const draft=JSON.parse(JSON.stringify(settings));for(const key of draft.order)if(roles.includes(draft.tags[key]))draft.tags[key]='scalar';const used=new Set();maps.forEach((input,i)=>{if(!input.value)return;if(used.has(input.value))throw Error(text('同一列不能同时对应多个颜色通道。','A field cannot map to multiple color channels.'));used.add(input.value);draft.tags[input.value]=roles[i];});draft.colorSpace=space.value;draft.rgbScale=rgb.value;draft.hsvScale=hsv.value;
 if(draft.colorSpace!=='auto'&&maps.slice(draft.colorSpace==='rgb'?0:3,draft.colorSpace==='rgb'?3:6).some(input=>!input.value))throw Error(text('请为所选颜色空间指定完整的三个通道。','Assign all three channels for this color space.'));
 await adapter.apply(settingsForCloud(cloud,draft));onChange();}catch(error){status.textContent=error.message;}finally{apply.disabled=false;onBusy(false);}};
 for(const input of [space,rgb,hsv,...maps])input.onchange=()=>{status.textContent=text('映射尚未应用。请先点击“应用字段与颜色映射”。','Mapping not applied. Apply it before sharing.');onChange(false);};
}
