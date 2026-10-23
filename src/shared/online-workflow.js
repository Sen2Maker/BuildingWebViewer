import {probeOnlineData} from './online-probe.js';
import {comparisonLink, BUILDING_DEMO} from './online-compare-core.js';
import {previewLink, readPreview, loadDirectory} from './online-preview.js';
import {CURATED_BUILDINGS} from './online-demo.js';
import './online-workflow.css';
const text=(zh,en)=>document.documentElement.lang.startsWith('en')?en:zh;
const el=(tag,label,parent,cls='')=>{const n=document.createElement(tag);if(label)n.textContent=label;if(cls)n.className=cls;parent?.append(n);return n;};
const field=(parent,label,tag='input')=>{const row=el('label',label,parent);return el(tag,'',row);};
export function mountDataWorkflow(){
 const anchor=document.getElementById('online-builder-entry');if(!anchor)return;
 const open=el('button',text('打开自己的在线数据 ↗','Open your online data ↗'),anchor,'online-launch');open.type='button';
 const dialog=el('dialog','',document.body,'online-workflow-dialog');dialog.setAttribute('aria-label',text('在线数据预览与分享','Online data preview and sharing'));
 const heading=el('div','',dialog,'online-dialog-heading'),title=el('div','',heading);el('span','01 / CONNECT',title,'online-eyebrow');el('h2',text('连接数据，从这里开始。','Start with your data.'),title);
 const close=el('button','×',heading,'online-close');close.type='button';close.setAttribute('aria-label',text('关闭','Close'));close.onclick=()=>dialog.close();
 el('p',text('先选择要打开的工具，再填写数据地址。验证成功后进入该工具，调整画面并生成分享直链。','Choose a tool, then enter your data URL. After checking access and parsing, we open that tool so you can configure and share the view.'),dialog,'online-lead');
 const steps=el('ol','',dialog,'online-workflow-steps');for(const label of [text('连接并验证','Connect & check'),text('调整画面','Configure view'),text('生成直链','Share a link')])el('li',label,steps);
 const guide=el('section','',dialog,'online-connection-guide');el('h3',text('准备在线数据','Prepare online data'),guide);
 el('p',text('把文件放在可公开读取的 HTTPS 存储中，并允许查看器所在网站跨域读取（CORS）。这里填写原始文件或 JSON 索引地址，不是网盘预览页面。','Host files at public HTTPS URLs and allow this viewer’s origin through CORS. Use raw-file or JSON-index URLs, not a drive preview page.'),guide);
 const schema=el('details','',guide);el('summary',text('接口怎么对接？查看模板与字段说明','How to connect an endpoint: templates and fields'),schema);
 el('p',text('接口使用 GET 返回 JSON，无需登录。点云与网格通过相同 ID 配对：ID/point_cloud 与 ID/mesh。修改下面的地址、ID 和文件格式即可；资源 URL 必须允许浏览器 GET。BWVPC 使用 schemaVersion: 3 索引。','The endpoint returns JSON over GET without sign-in. Pair a point cloud and mesh using ID/point_cloud and ID/mesh. Replace the URLs, IDs and formats below. Resource URLs must permit browser GET. BWVPC uses a schemaVersion: 3 catalog.'),schema);
 const example={schemaVersion:1,datasets:[{id:'building-1/point_cloud',url:'https://your-host.example/data/building-1.xyz',viewer:'pointcloud',format:'xyz'},{id:'building-1/mesh',url:'https://your-host.example/data/building-1.obj',viewer:'lod',format:'obj'}]};
 el('pre',JSON.stringify(example,null,2),schema);
 el('p',text('单文件直接填写 URL 并选择格式；混合数据目录使用 datasets 数组，每项的 id 保持唯一。可选 bytes 和 sha256 用于验证完整性。大点云建议预先转换为 BWVPC 渐进分块。','For one file, enter its URL and format. A mixed index uses unique datasets IDs. Optional bytes and sha256 verify integrity. Convert large point clouds to progressive BWVPC chunks.'),schema);
 el('p',text('常见问题：401/403 检查公开读取；404 检查路径；网络失败检查 CORS、HTTPS 与网络；JSON 或解析错误检查字段和真实文件格式。不要在链接中填写密钥。','Troubleshooting: 401/403 means access permissions; 404 means a path issue; network failures may be CORS, HTTPS or connectivity; parsing failures require checking fields and the actual file format. Do not put keys in URLs.'),schema);
 const form=el('form','',dialog,'online-connection-form');
 const kind=field(form,text('选择打开的工具','Choose a tool'),'select');
 for(const [value,zh,en]of [['compare','配对展示 · 点云 + 网格','Paired view · Point cloud + mesh'],['lod','网格模型查看器','Mesh viewer'],['wireframe','线框查看器','Wireframe viewer'],['pointcloud','点云查看器','Point-cloud viewer']]){const o=el('option',text(zh,en),kind);o.value=value;}
 const localTools=el('optgroup','',kind);localTools.label=text('暂仅支持本地数据','Local data only for now');
 for(const [zh,en]of [['高斯泼溅','Gaussian splats'],['点云创作与修订','Point-cloud creation & editing'],['CAD 图纸与模型','CAD drawings & models']]){const o=el('option',text(zh,en),localTools);o.disabled=true;}
 const sourceType=field(form,text('数据接入方式','Data connection'),'select');
 for(const [value,zh,en]of [['file','文件直链','Direct file URL'],['manifest','数据索引 · JSON','Dataset index · JSON']]){const o=el('option',text(zh,en),sourceType);o.value=value;}
 const url=field(form,text('数据地址 / 接口地址','Data / endpoint URL'));url.type='url';url.required=true;url.placeholder='https://your-host.example/index.json';
 const format=field(form,text('文件格式','File format'),'select');for(const value of ['xyz','obj','ply','pcd','txt','csv','pts']){const o=el('option',value.toUpperCase(),format);o.value=value;}
 const entry=field(form,text('初始条目 ID（留空自动选择）','Initial entry ID (optional)'));entry.placeholder='building-1';entry.maxLength=240;
 const selection=field(form,text('限定展示 ID（可选，逗号分隔）','Limit displayed IDs (optional, comma separated)'),'textarea');selection.rows=2;selection.placeholder=text('留空展示整个索引；可填写精选 ID','Leave empty for all entries, or enter selected IDs');selection.maxLength=12000;
 const note=el('p','',form,'online-note');
 const report=el('p','',form,'online-workflow-status');report.setAttribute('role','status');report.setAttribute('aria-live','polite');
 const actions=el('div','',form,'online-workflow-actions');const cancel=el('button',text('取消检查','Cancel check'),actions);cancel.type='button';cancel.hidden=true;const submit=el('button',text('打开数据 · 先验证','Open data · verify first'),actions,'online-primary');submit.type='submit';
 let controller=null,serial=0,demoActive=false;
 const stop=()=>{serial++;controller?.abort();controller=null;submit.disabled=false;cancel.hidden=true;form.removeAttribute('aria-busy');};
 const changed=()=>{stop();report.textContent='';};form.addEventListener('input',changed);
 function updateSource(){
  changed();const paired=kind.value==='compare',indexed=paired||sourceType.value==='manifest';
  sourceType.parentElement.hidden=paired;format.parentElement.hidden=indexed;entry.parentElement.hidden=!indexed;selection.parentElement.hidden=!paired;
  const allowed=kind.value==='pointcloud'?['xyz','ply','pcd','txt','csv','pts']:['obj'];
  const previous=format.value;format.replaceChildren();for(const value of allowed){const o=el('option',value.toUpperCase(),format);o.value=value;}format.value=allowed.includes(previous)?previous:allowed[0];
  url.placeholder=indexed?'https://your-host.example/index.json':`https://your-host.example/data/model.${format.value}`;
  note.textContent=paired?text('配对展示在网格模型查看器中打开，默认点云与网格双视窗。先验证初始建筑；BWVPC 细节进入后按需加载。','Paired view opens the Mesh viewer with point cloud and mesh panes. We verify the initial building; BWVPC detail loads progressively.')
   :indexed?text('验证并打开所选工具对应的条目；留空 ID 时自动选择索引中第一个匹配条目。','Verify and open an entry for the selected tool. Leave the ID empty to use the first matching entry.')
   :text('验证文件后进入所选工具，再使用该工具的显示、相机与分享功能。','Verify the file, then open the selected tool and use its display, camera and sharing controls.');
 }
 kind.onchange=updateSource;sourceType.onchange=updateSource;updateSource();
 cancel.onclick=()=>{stop();report.textContent=text('检查已取消，可以修改地址后重试。','Check cancelled. Edit the URL and retry.');};dialog.addEventListener('close',stop);window.addEventListener('pagehide',stop);
 form.onsubmit=async event=>{event.preventDefault();stop();const token=serial;controller=new AbortController();submit.disabled=true;cancel.hidden=false;form.setAttribute('aria-busy','true');
  try{const ids=selection.value.trim()?selection.value.split(/[,，\s]+/).filter(Boolean):null;const result=await probeOnlineData({kind:kind.value==='compare'?'compare':sourceType.value==='manifest'?'manifest':kind.value,viewer:kind.value==='compare'?undefined:kind.value,url:url.value.trim(),format:format.value,entry:entry.value.trim(),...(kind.value==='compare'&&ids?{buildingIds:ids}:{})},{signal:controller.signal,onProgress:message=>{if(token===serial)report.textContent=message;}});if(token!==serial||!dialog.open)return;
   report.textContent=text('验证通过，正在打开查看器…','Verified. Opening the viewer…');const destination=new URL(result.kind==='compare'?comparisonLink(result.descriptor):previewLink(result.descriptor));destination.searchParams.set('configure','1');destination.searchParams.set('lang',document.documentElement.lang.startsWith('en')?'en':'zh');location.assign(destination.href);
  }catch(error){if(token===serial)report.textContent=text('未能打开：','Unable to open: ')+(error.message||String(error))+text('。请检查地址、公开读取、CORS 和索引格式后重试。',' Check the URL, public access, CORS and index schema, then retry.');}
  finally{if(token===serial){controller=null;submit.disabled=false;cancel.hidden=true;form.removeAttribute('aria-busy');}}
 };
 open.onclick=()=>{if(demoActive){kind.value='compare';kind.onchange();url.value='';entry.value='';selection.value='';demoActive=false;}report.textContent='';dialog.showModal();};
 const demo=document.getElementById('online-demo-entry');if(demo)demo.onclick=()=>{demoActive=true;kind.value='compare';kind.onchange();url.value=BUILDING_DEMO.manifest;entry.value=CURATED_BUILDINGS[0];selection.value=CURATED_BUILDINGS.join(', ');report.textContent=text('已填入精选 100 栋建筑，使用与自有数据相同的验证、配置和分享流程。','100 selected buildings filled in. The same verification, configuration and sharing workflow applies.');dialog.showModal();};
 if(new URLSearchParams(location.hash.slice(1)).has('preview')){dialog.showModal();try{const descriptor=readPreview();if(descriptor?.manifest)loadDirectory(descriptor,dialog,report);else if(descriptor)location.replace(previewLink(descriptor));}catch(error){report.textContent=error.message;}}
 return {open:()=>dialog.showModal()};
}
