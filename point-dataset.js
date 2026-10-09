/** Column order and semantics never modify the source arrays or point positions. */
export const POINT_COLUMN_TAGS = {scalar:'普通数值',red:'颜色 R',green:'颜色 G',blue:'颜色 B',hue:'颜色 H',saturation:'颜色 S',value:'颜色 V',nx:'法向量 X',ny:'法向量 Y',nz:'法向量 Z',intensity:'强度',classification:'分类',return_number:'回波编号',gps_time:'GPS 时间',custom:'自定义标签'};
export function pointColumnKeys(cloud) {
  const keys=['x','y','z',...Object.keys(cloud.fields||{}).filter(key=>!['x','y','z'].includes(key))];
  return cloud.columnOrder ? [...cloud.columnOrder.filter(key=>keys.includes(key)),...keys.filter(key=>!cloud.columnOrder.includes(key))] : keys;
}
export function defaultPointSettings(cloud) {
  const order=pointColumnKeys(cloud), tags=Object.create(null), custom=Object.create(null);
  const aliases={r:'red',g:'green',b:'blue',h:'hue',s:'saturation',v:'value',normal_x:'nx',normal_y:'ny',normal_z:'nz',diffuse_red:'red',diffuse_green:'green',diffuse_blue:'blue'};
  const used=new Set();
  for(const key of order) {
    const tag=Object.hasOwn(POINT_COLUMN_TAGS,key) && key!=='custom' ? key : Object.hasOwn(aliases,key)?aliases[key]:null;
    tags[key]=tag && !used.has(tag) ? tag : 'scalar'; if(tag)used.add(tag);
  }
  if(cloud.semantics?.tags) for(const key of order) { if(cloud.semantics.tags[key]&&!['x','y','z'].includes(key))tags[key]=cloud.semantics.tags[key]; custom[key]=cloud.semantics.custom?.[key]||''; }
  return {order,tags,custom,rgbScale:cloud.semantics?.rgbScale||'auto',hsvScale:cloud.semantics?.hsvScale||'degrees',colorSpace:cloud.semantics?.colorSpace||'auto'};
}
export function pointTagKeys(settings, roles) { return roles.map(role=>settings.order.find(key=>settings.tags[key]===role)); }
export function validatePointSettings(cloud, settings) {
  const keys=pointColumnKeys(cloud), used=new Set(), customNames=new Set();
  if (!Array.isArray(settings.order) || settings.order.length!==keys.length || new Set(settings.order).size!==keys.length || keys.some(key=>!settings.order.includes(key))) throw Error('列顺序必须包含全部属性且不能重复');
  for(const key of keys) {
    if(['x','y','z'].includes(key))continue;
    const tag=settings.tags[key]||'scalar';
    if(!Object.hasOwn(POINT_COLUMN_TAGS,tag))throw Error('属性标签无效');
    if(tag==='custom') {const name=String(settings.custom[key]||'').trim();if(!name)throw Error(`请填写 ${key} 的自定义标签`);if(customNames.has(name))throw Error('同一个点云内的自定义标签不能重名');customNames.add(name);}
    if(!['scalar','custom'].includes(tag)) {if(used.has(tag))throw Error(`标签“${POINT_COLUMN_TAGS[tag]}”只能对应一列`);used.add(tag);}
  }
  if(!['auto','1','255','65535'].includes(settings.rgbScale) || !['degrees','unit','opencv'].includes(settings.hsvScale) || !['auto','rgb','hsv'].includes(settings.colorSpace))throw Error('颜色取值范围无效');
}
export function pointFieldStats(values) {
  let min=Infinity,max=-Infinity,finite=0;
  for(const value of values)if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value);finite++;}
  return {min:finite?min:null,max:finite?max:null,finite,missing:values.length-finite,count:values.length,preview:Array.from(values.slice(0,6))};
}
export function hsvPointRGB(h,s,v) {
  h=((h%360)+360)%360;
  const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;
  const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return rgb.map(value=>value+m);
}
export function semanticPointCloud(cloud, settings, {strict=false}={}) {
  validatePointSettings(cloud,settings);
  const rgbKeys=pointTagKeys(settings,['red','green','blue']), hsvKeys=pointTagKeys(settings,['hue','saturation','value']);
  let space=settings.colorSpace==='auto' ? rgbKeys.every(Boolean)?'rgb':hsvKeys.every(Boolean)?'hsv':null : settings.colorSpace;
  const selected=space==='rgb'?rgbKeys:hsvKeys;
  let rgb=(cloud.fields.rgb || cloud.fields.rgba) ? cloud.rgb : null, colorIssue='';
  if(space && selected.every(Boolean)) {
    const channels=selected.map(key=>cloud.fields[key]);
    let divisor=Number(settings.rgbScale);
    if(space==='rgb' && settings.rgbScale==='auto') {
      let max=0;for(const channel of channels)for(const value of channel)if(Number.isFinite(value))max=Math.max(max,value);
      divisor=max<=1?1:max<=255?255:65535;
    }
    rgb=new Float32Array(cloud.count*3);let invalid=0;
    for(let i=0;i<cloud.count;i++) {
      let values=channels.map(channel=>channel[i]), valid=values.every(Number.isFinite);
      if(space==='rgb') {valid=valid&&values.every(v=>v>=0&&v<=divisor);values=values.map(v=>v/divisor);}
      else {
        const [hmax,svmax]=settings.hsvScale==='unit'?[1,1]:settings.hsvScale==='opencv'?[180,255]:[360,1];
        valid=valid&&values[0]>=0&&values[0]<=hmax&&values.slice(1).every(v=>v>=0&&v<=svmax);
        values=hsvPointRGB(values[0]*360/hmax,values[1]/svmax,values[2]/svmax);
      }
      // Merged RGB/HSV sources may have NaN in the other source's columns.
      if(!valid && settings.colorSpace==='auto' && space==='rgb' && hsvKeys.every(Boolean)) {
        const h=cloud.fields[hsvKeys[0]][i],s=cloud.fields[hsvKeys[1]][i],v=cloud.fields[hsvKeys[2]][i];
        const [hmax,svmax]=settings.hsvScale==='unit'?[1,1]:settings.hsvScale==='opencv'?[180,255]:[360,1];
        valid=[h,s,v].every(Number.isFinite)&&h>=0&&h<=hmax&&s>=0&&s<=svmax&&v>=0&&v<=svmax;
        if(valid)values=hsvPointRGB(h*360/hmax,s/svmax,v/svmax);
      }
      if(!valid){invalid++;values=[.55,.59,.61];}
      rgb.set(values,i*3);
    }
    if(invalid)colorIssue=`${invalid.toLocaleString()} 个点的 ${space.toUpperCase()} 数值缺失或超出范围，颜色显示为灰色。`;
    if(strict&&invalid)throw Error(colorIssue+' 请检查列标签与颜色范围。');
  } else if(space) {colorIssue='颜色标签尚未配齐三列。';rgb=null;}
  return {...cloud,rgb,columnOrder:[...settings.order],colorIssue,semantics:JSON.parse(JSON.stringify(settings))};
}

/** Construct one coherent merged schema, taking the first cloud's order then appending new fields. */
export function orderedPointExportSchema(items,{sourceIds=true}={}) {
  const properties=[], byName=new Map(), identities=new Map(), reserved=new Set(['x','y','z']);let count=0;
  for(const {cloud} of items) for(const tag of Object.values((cloud.semantics||defaultPointSettings(cloud)).tags))if(!['scalar','custom'].includes(tag))reserved.add(tag);
  for(const [source,{cloud}] of items.entries()) {
    if(!cloud?.count || cloud.positions.length!==cloud.count*3)throw Error('点云数据不完整');
    count+=cloud.count;
    const settings=cloud.semantics||defaultPointSettings(cloud), order=cloud.columnOrder||settings.order;
    const used=new Set();
    for(const key of order) {
      const axis=['x','y','z'].indexOf(key),tag=settings.tags[key]||'scalar';
      if(axis<0 && cloud.fields[key]?.length!==cloud.count)throw Error(`属性 ${key} 长度不匹配`);
      let base=axis>=0?key:tag==='custom'?settings.custom[key]:tag==='scalar'?key:tag;
      base=String(base).trim().toLowerCase().replace(/[^a-z0-9_]/g,'_')||'attribute';
      if(axis<0 && ['scalar','custom'].includes(tag) && reserved.has(base))base=`original_${base}`;
      const identity=axis>=0?`axis:${key}`:tag==='custom'?`custom:${settings.custom[key]}`:tag==='scalar'?`scalar:${key}`:`role:${tag}`;
      let name=identities.get(identity),suffix=2;
      if(!name){name=base;while(byName.has(name))name=`${base}_${suffix++}`;identities.set(identity,name);}
      if(used.has(name))throw Error('同一文件含有重复的导出标签');used.add(name);
      if(!byName.has(name)){const property={name,sources:[]};byName.set(name,property);properties.push(property);}
      byName.get(name).sources[source]=axis>=0?{axis}:{key};
    }
  }
  if(!Number.isSafeInteger(count)||count>4294967295)throw Error('导出点数超过支持范围');
  if(sourceIds){let name='source_id',suffix=2;while(byName.has(name))name=`source_id_${suffix++}`;properties.push({name,source:true});}
  return {count,properties};
}
