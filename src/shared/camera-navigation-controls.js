import { cameraNavigationDefaults } from './camera-navigation.js';

export function mountCameraNavigationControls(container, viewer) {
  const en = document.documentElement.lang === 'en', label = (zh, english) => en ? english : zh;
  const node = (tag, text) => { const element = document.createElement(tag); if (text) element.textContent = text; return element; };
  const section = node('details'); section.className = 'gs-navigation'; section.open = true;
  section.append(node('summary', label('环绕浏览手感', 'Orbit navigation feel')));
  const fields = new Map();
  const pivotLabel=node('label',label('旋转中心','Orbit pivot')), pivot=node('select');
  pivot.setAttribute('aria-label',label('旋转中心','Orbit pivot'));
  for(const[value,zh,en]of [['view','当前视野中心（自动）','View center (automatic)'],['fixed','固定观察点','Fixed focus point'],['model','模型中心','Model center']]){const option=node('option',label(zh,en));option.value=value;pivot.append(option);}
  pivot.onchange=()=>{status.textContent='';viewer.setNavigation({pivot:pivot.value});refresh();};pivotLabel.append(pivot);section.append(pivotLabel);
  const anchor=node('button',label('锁定当前视野中心','Lock current view center'));anchor.type='button';anchor.onclick=()=>{viewer.focusOrbit();refresh();};section.append(anchor);
  const status=node('p');status.className='presentation-help';status.setAttribute('role','status');section.append(status);
  viewer.onOrbitAnchor=hit=>{status.textContent=hit?label('已锁定观察点。双击模型可重新指定。','Focus locked. Double-click the model to choose another point.'):label('附近没有有效数据，沿用当前观察距离。','No nearby data; keeping the current viewing distance.');refresh();};
  section.append(node('p',label('自动：每次拖动开始时，按画面中央数据估计深度；拖动期间不切换。固定：围绕已锁定点。模型：围绕整组数据中心。双击模型可指定固定点；平移后可重新锁定。点云 / 高斯深度为估计值，透明或稀疏区域可能不准确。','Automatic estimates center depth once per gesture. Fixed orbits the locked point; Model uses the scene center. Double-click to choose a fixed point; relock after panning. Point-cloud / Gaussian depth is approximate in sparse or transparent areas.')));

  function numeric(key, zh, english, min, max, step, suffix) {
    const row = node('div'); row.className = 'gs-navigation-field';
    row.append(node('span', label(zh, english)));
    const range = node('input'), number = node('input'); range.type = 'range'; number.type = 'number';
    for (const input of [range, number]) {
      input.min = min; input.max = max; input.step = step;
      input.setAttribute('aria-label', label(zh, english) + (input === range ? label('滑块', ' slider') : label('数值', ' value')));
    }
    const commit = (input, revert = false) => {
      const value = Number(input.value);
      if (input.value === '' || !Number.isFinite(value) || value < min || value > max) { if (revert) refresh(); return; }
      viewer.setNavigation({[key]: value}); refresh(revert ? null : input);
    };
    range.oninput = () => commit(range); number.oninput = () => commit(number); number.onchange = () => commit(number, true);
    row.append(range, number, node('small', suffix)); section.append(row); fields.set(key, {range, number});
  }
  numeric('rotateSpeed', '旋转速度', 'Orbit speed', .05, 2, .05, '×');
  numeric('panSpeed', '平移速度', 'Pan speed', .05, 2, .05, '×');
  numeric('zoomSpeed', '缩放速度', 'Zoom speed', .05, 2, .05, '×');
  function toggle(key, zh, english) {
    const row = node('label'), input = node('input'); row.className = 'gs-navigation-toggle'; input.type = 'checkbox';
    input.setAttribute('aria-label', label(zh, english)); row.append(input, node('span', label(zh, english))); section.append(row);
    input.onchange = () => { viewer.setNavigation({[key]: input.checked}); refresh(); }; fields.set(key, {input});
  }
  toggle('adaptive', '随视距与视野自适应', 'Adapt to distance and field of view');
  toggle('smoothing', '平滑移动', 'Smooth movement');
  numeric('smoothingMs', '平滑时间', 'Smoothing time', 20, 350, 10, 'ms');
  const help = node('p', label('靠近模型、缩小视野时更细腻。平滑时间越大，跟随越柔和、延迟越明显；关闭即直接响应。Ctrl / ⌘ 拖动可临时降至 20% 速度。设置自动保存在本机浏览器。', 'Closer views and narrower fields of view allow finer control. Longer smoothing is softer but adds latency; switch it off for direct input. Ctrl / ⌘ drag uses 20% speed. Preferences are saved in this browser.'));
  help.className = 'presentation-help'; section.append(help);
  const reset = node('button', label('恢复默认手感', 'Reset navigation')); reset.type = 'button';
  reset.onclick = () => { viewer.setNavigation(cameraNavigationDefaults()); refresh(); }; section.append(reset);
  function refresh(editing = null) {
    pivot.value=viewer.navigation.settings.pivot;
    for (const [key, field] of fields) {
      if (field.input) field.input.checked = viewer.navigation.settings[key];
      else {
        field.range.value = viewer.navigation.settings[key];
        if (editing !== field.number) field.number.value = viewer.navigation.settings[key];
        field.range.disabled = field.number.disabled = key === 'smoothingMs' && !viewer.navigation.settings.smoothing;
      }
    }
  }
  refresh(); container.append(section);
}
