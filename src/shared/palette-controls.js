import { t, localizeHTML } from './i18n.js';
import { samplePalette, normalizePaletteOptions, currentPalettePreferences, rememberPalettePreferences } from './palettes.js';

export function paletteGradient(palette = 'current', reverse = false) {
  const stops = Array.from({length: 17}, (_, i) => `rgb(${samplePalette(i / 16, palette, reverse).map(v => Math.round(v * 255)).join(',')}) ${i / 16 * 100}%`);
  return `linear-gradient(to right,${stops.join(',')})`;
}

export function mountPaletteControls({container, onChange = () => {}, getOptions = () => ({})}) {
  let initial;
  try { initial=normalizePaletteOptions({...currentPalettePreferences(),...getOptions()}); } catch { initial=currentPalettePreferences(); }
  const details = container.ownerDocument.createElement('details'); details.className = 'palette-panel viewer-control-panel';
  details.innerHTML = localizeHTML(`<summary><span>配色方案</span><i class="palette-preview" aria-hidden="true"></i><small class="palette-caption"></small></summary>
    <div class="palette-body"><label>色带<select aria-label="色带方案"><option value="current">蓝 → 绿 → 黄 → 红</option><option value="viridis">Viridis · 蓝紫 → 绿 → 黄</option><option value="inferno">Inferno · 黑紫 → 橙 → 黄</option><option value="grayscale">灰度 · 黑 → 白</option><option value="blue-white-red">蓝 → 白 → 红</option></select></label>
    <label class="check-label"><input class="palette-reverse" type="checkbox">反转色带</label>
    <label class="check-label"><input class="palette-auto" type="checkbox" checked>自动数值范围</label>
    <label>最小值<input class="palette-min" type="number" step="any" aria-label="色带最小值" disabled></label>
    <label>最大值<input class="palette-max" type="number" step="any" aria-label="色带最大值" disabled></label>
    <p class="palette-help">高度与数值属性使用色带；固定范围可让不同文件的相同数值对应相同颜色。</p><p class="palette-error" role="alert" hidden></p></div>`);
  container.append(details);
  const select = details.querySelector('select'), reverse = details.querySelector('.palette-reverse'), auto = details.querySelector('.palette-auto');
  const low = details.querySelector('.palette-min'), high = details.querySelector('.palette-max'), message = details.querySelector('.palette-error');
  let state = initial, enabled = true;
  select.value = state.palette; reverse.checked = state.reverse;
  if (state.range) { auto.checked = false; low.value = state.range.min; high.value = state.range.max; }
  const refresh = () => {
    details.querySelector('.palette-preview').style.background = paletteGradient(state.palette, state.reverse);
    details.querySelector('.palette-caption').textContent = enabled ? `${select.selectedOptions[0].textContent.split(' · ')[0]}${state.reverse ? t(' · 反转') : ''}` : t('选择高度或数值属性后启用');
    select.disabled = reverse.disabled = auto.disabled = !enabled;
    low.disabled = high.disabled = !enabled || auto.checked;
  };
  const restoreInputs=()=>{select.value=state.palette;reverse.checked=state.reverse;auto.checked=!state.range;if(state.range){low.value=state.range.min;high.value=state.range.max;}};
  const change = () => {
    low.disabled = high.disabled = auto.checked || !enabled;
    if (!auto.checked && (low.value === '' || high.value === '' || !Number.isFinite(low.valueAsNumber) || !Number.isFinite(high.valueAsNumber) || low.valueAsNumber >= high.valueAsNumber)) {
      message.textContent = t('请输入有效范围，最小值必须小于最大值。'); message.hidden = false; return;
    }
    const previous=state;
    try {
      state=normalizePaletteOptions({palette:select.value,reverse:reverse.checked,range:auto.checked?null:{min:low.valueAsNumber,max:high.valueAsNumber}});
      // Existing viewer adapters read getOptions() while applying a change.
      onChange(normalizePaletteOptions(state));
      rememberPalettePreferences(state);message.hidden=true;refresh();
    } catch(error) {
      state=previous;restoreInputs();
      try { onChange(normalizePaletteOptions(previous)); } catch {}
      refresh();message.textContent=error.message;message.hidden=false;
    }
  };
  [select,reverse,auto,low,high].forEach((input,index)=>{input.dataset.mobileKey='palette:'+index;});
  for (const input of [select, reverse, auto, low, high]) input.addEventListener('change', change);
  for (const input of [low, high]) input.addEventListener('input', change);
  refresh();
  return {getOptions: () => normalizePaletteOptions(state), setScalarEnabled(value) {enabled = !!value; refresh();},
    setDataRange(range) {if (auto.checked && range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.min <= range.max) {
      low.value = range.min; high.value = range.max === range.min ? range.min + 1 : range.max;
    }}, destroy() {details.remove();}};
}
