import { t } from '../shared/i18n.js';
// Project groups are virtual: source identity and disk paths never change on a move.
export class PointProject {
  constructor() { this.groups = new Map(); this.serial = 0; }
  create(name, parent = '') {
    name = name.trim();
    if (!name || /[/\\\x00-\x1f]/.test(name)) throw Error(t('请输入文件夹名称，不含斜线或控制字符'));
    if (parent && !this.groups.has(parent)) throw Error(t('目标文件夹已不存在'));
    if ([...this.groups.values()].some(group => group.parent === parent && group.name === name)) throw Error(t('此位置已有同名文件夹'));
    const group = {id: `group:${++this.serial}`, name, parent, collapsed: false};
    this.groups.set(group.id, group); return group.id;
  }
  assign(entry, path) {
    const parts = path.split('/').filter(Boolean); entry.treeName = parts.pop() || entry.id;
    let parent = '';
    for (const name of parts) {
      parent = [...this.groups.values()].find(group => group.parent === parent && group.name === name)?.id || this.create(name, parent);
    }
    entry.group = parent;
  }
  within(groupId, ancestor) {
    if (!ancestor) return true;
    for (let group = this.groups.get(groupId); group; group = this.groups.get(group.parent)) if (group.id === ancestor) return true;
    return false;
  }
  path(id) {
    const parts = [];
    for (let group = this.groups.get(id); group; group = this.groups.get(group.parent)) parts.unshift(group.name);
    return parts.join('/');
  }
  members(id, entries) { return entries.filter(entry => this.within(entry.group, id)); }
  move(target, parent) {
    if (parent && !this.groups.has(parent)) throw Error(t('目标文件夹已不存在'));
    if (typeof target === 'string') {
      const group = this.groups.get(target); if (!group) throw Error(t('文件夹已不存在'));
      if (this.within(parent, target)) throw Error(t('不能移动到自身或其子文件夹'));
      if ([...this.groups.values()].some(other => other.id !== target && other.parent === parent && other.name === group.name)) throw Error(t('目标位置已有同名文件夹'));
      group.parent = parent;
    } else target.group = parent;
    if (parent) this.groups.get(parent).collapsed = false;
  }
  roots(targets) {
    const unique = [...new Set(targets)], groups = unique.filter(target => typeof target === 'string');
    return unique.filter(target => !groups.some(group => group !== target && this.within(
      typeof target === 'string' ? this.groups.get(target)?.parent : target.group, group)));
  }
  files(targets, entries) {
    const selected = new Set();
    for (const target of this.roots(targets)) {
      for (const entry of typeof target === 'string' ? this.members(target, entries) : [target]) if (entries.includes(entry)) selected.add(entry);
    }
    return [...selected];
  }
  moveMany(targets, parent) {
    const roots = this.roots(targets);
    if (parent && !this.groups.has(parent)) throw Error(t('目标文件夹已不存在'));
    const movingGroups = new Set(roots.filter(target => typeof target === 'string'));
    const names = new Set([...this.groups.values()].filter(group => group.parent === parent && !movingGroups.has(group.id)).map(group => group.name));
    // Validate the whole batch before moving anything, so a conflict cannot leave half a move.
    for (const target of movingGroups) {
      const group = this.groups.get(target); if (!group) throw Error(t('文件夹已不存在'));
      if (this.within(parent, target)) throw Error(t('不能移动到自身或其子文件夹'));
      if (names.has(group.name)) throw Error(t('目标位置存在同名文件夹，本次移动未执行'));
      names.add(group.name);
    }
    for (const target of roots) this.move(target, parent);
    return roots;
  }
  removeGroup(id) {
    const removed = [...this.groups.keys()].filter(key => this.within(key, id));
    for (const key of removed) this.groups.delete(key);
  }
  matches(entry, query) {
    return `${this.path(entry.group)}/${entry.treeName || entry.id} ${entry.id}`.toLowerCase().includes(query.toLowerCase().trim());
  }
}

export class PointManagementSelection {
  constructor() { this.items = new Set(); this.anchor = null; }
  select(target, {toggle = false, range = false, ordered = []} = {}) {
    const from = ordered.indexOf(this.anchor), to = ordered.indexOf(target);
    if (range && from >= 0 && to >= 0) {
      if (!toggle) this.items.clear();
      ordered.slice(Math.min(from,to), Math.max(from,to)+1).forEach(item => this.items.add(item));
    } else {
      if (!toggle) this.items.clear();
      if (toggle && this.items.has(target)) this.items.delete(target); else this.items.add(target);
      this.anchor = target;
    }
  }
  box(hits, base = []) { this.items = new Set([...base, ...hits]); }
  clear() { this.items.clear(); this.anchor = null; }
}

export function pointBoxIntersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function mountPointProject({project, container, root, controls, getEntries, getSelected, getMode, getQuery,
  onToggle, onGroupSelection, onVisibility, onRemove, onChange, detail}) {
  const make = (tag, text, cls) => { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
  const button = (text, label, fn) => { const node = make('button', text); node.type = 'button'; node.title = label; node.setAttribute('aria-label', label); node.onclick = fn; return node; };
  const dragType = 'application/x-buildingwebviewer-node', management = new PointManagementSelection();
  let focused = null, dragged = null, limit = 200, lastQuery = '', editorMode = null, editorTargets = [], rowTargets = new Map(), visible = [];
  const tools = make('div', null, 'project-tools');
  const createButton = button(t('+ 文件夹'), t('新建项目内文件夹'), () => openEditor('create'));
  const moveButton = button(t('移动'), t('移动选中条目'), () => openEditor('move'));
  const deleteButton = button(t('移除'), t('移除选中条目'), () => openEditor('remove'));
  tools.append(createButton, moveButton, deleteButton);
  const focusNote = make('p', '', 'project-focus');
  const editor = make('form', null, 'project-editor'); editor.hidden = true;
  const editorTitle = make('strong'), nameInput = make('input'); nameInput.placeholder = t('文件夹名称'); nameInput.setAttribute('aria-label', t('新文件夹名称'));
  const destinations = make('select'); destinations.setAttribute('aria-label', t('目标文件夹'));
  const editorNote = make('p'), actions = make('div', null, 'project-editor-actions');
  const submit = make('button', t('确定')); submit.type = 'submit';
  function closeEditor() { editorMode = null; editor.hidden = true; editorTargets = []; }
  const cancel = button(t('取消'), t('取消管理操作'), closeEditor);
  actions.append(submit, cancel); editor.append(editorTitle, nameInput, destinations, editorNote, actions);
  controls.append(tools, focusNote, editor);
  const status = make('p', null, 'project-status'); status.setAttribute('role', 'status'); controls.append(status);
  function label(target) { return typeof target === 'string' ? project.path(target) : target?.treeName || target?.id || t('项目根目录'); }
  function exists(target) { return typeof target === 'string' ? project.groups.has(target) : getEntries().includes(target); }
  function paintSelection() {
    for (const [row, target] of rowTargets) {
      const selected = management.items.has(target); row.dataset.focused = String(selected);
      row.querySelector('.project-name').setAttribute('aria-pressed', String(selected));
    }
    moveButton.disabled = deleteButton.disabled = !management.items.size;
    focusNote.textContent = management.items.size ? t("已选 {0} 项管理 · {1} 个点云", [management.items.size, project.files(management.items, getEntries()).length]) : t('Ctrl 多选 · 空白处框选 · 右键管理');
    focusNote.title = [...management.items].map(label).join('\n') || focusNote.textContent;
  }
  function selectTarget(target, event = {}) {
    closeEditor(); closeMenu();
    if (target === null) { focused = null; management.clear(); }
    else { focused = target; management.select(target, {toggle: event.ctrlKey || event.metaKey, range: event.shiftKey, ordered: visible}); }
    paintSelection();
  }
  function fillDestinations() {
    destinations.replaceChildren();
    const add = (value, text) => { const option = make('option', text); option.value = value; destinations.append(option); };
    add('', t('项目根目录'));
    for (const group of [...project.groups.values()].sort((a,b) => project.path(a.id).localeCompare(project.path(b.id), undefined, {numeric:true}))) {
      if (editorMode === 'move' && editorTargets.some(target => typeof target === 'string' && project.within(group.id, target))) continue;
      add(group.id, project.path(group.id));
    }
    const single = editorTargets.length === 1 ? editorTargets[0] : null;
    destinations.value = typeof single === 'string' ? editorMode === 'create' ? single : project.groups.get(single)?.parent || '' : single?.group || '';
  }
  function openEditor(mode) {
    if (mode !== 'create' && !management.items.size) return;
    closeMenu(); editorTargets = project.roots(management.items); editorMode = mode; editor.hidden = false; status.textContent = ''; nameInput.value = '';
    const title = editorTargets.length === 1 ? label(editorTargets[0]) : t("{0} 个条目", [editorTargets.length]);
    editorTitle.textContent = {create:t('新建项目文件夹'),move:t("移动：{0}", [title]),remove:t("移除：{0}", [title])}[mode];
    nameInput.hidden = mode !== 'create'; destinations.hidden = mode === 'remove';
    submit.textContent = mode === 'remove' ? t('确认移除') : mode === 'move' ? t('移动到此处') : t('创建');
    editorNote.textContent = mode === 'remove'
      ? t("从页面移除 {0} 个点云{1}。磁盘文件不变；未导出的计算结果将丢失。", [project.files(editorTargets, getEntries()).length, editorTargets.some(target => typeof target === 'string') ? t('及所选文件夹') : ''])
      : t('仅调整当前页面的分组，不修改磁盘文件。');
    fillDestinations(); (mode === 'create' ? nameInput : mode === 'move' ? destinations : submit).focus();
  }
  editor.onsubmit = event => {
    event.preventDefault();
    try {
      if (editorTargets.some(target => !exists(target))) throw Error(t('部分条目已不存在，请重新选择'));
      if (editorMode === 'create') { focused = project.create(nameInput.value, destinations.value); management.select(focused); }
      else if (editorMode === 'move') project.moveMany(editorTargets, destinations.value);
      else if (editorMode === 'remove') {
        const removed = project.files(editorTargets, getEntries());
        for (const target of editorTargets) if (typeof target === 'string') project.removeGroup(target);
        focused = null; management.clear(); closeEditor(); onRemove(removed);
      }
      closeEditor(); status.textContent = ''; onChange();
    } catch (error) { status.textContent = error.message; }
  };

  // Move gestures start only on the small grip, never on a checkbox or filename.
  function wireDrop(row, parent) {
    row.ondragover = event => {
      if (!dragged || !Array.from(event.dataTransfer.types).includes(dragType)) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; row.classList.add('project-drop-target');
    };
    row.ondragleave = event => { if (!row.contains(event.relatedTarget)) row.classList.remove('project-drop-target'); };
    row.ondrop = event => {
      if (!dragged || !Array.from(event.dataTransfer.types).includes(dragType)) return;
      event.preventDefault(); event.stopPropagation(); row.classList.remove('project-drop-target');
      try { project.moveMany(dragged, parent); status.textContent = t("已移动 {0} 项到 {1}", [dragged.length, project.path(parent) || t('项目根目录')]); }
      catch (error) { status.textContent = error.message; }
      dragged = null; container.classList.remove('project-dragging'); closeEditor(); onChange();
    };
  }
  function gripFor(target) {
    const grip = make('span', '⠿', 'project-drag-handle'); grip.draggable = true;
    grip.title = t('拖动选中条目到文件夹或项目根目录'); grip.setAttribute('aria-hidden', 'true');
    grip.ondragstart = event => {
      if (!management.items.has(target)) { management.select(target); focused = target; paintSelection(); }
      closeMenu(); closeEditor(); dragged = project.roots(management.items);
      event.dataTransfer.setData(dragType, 'project-nodes'); event.dataTransfer.setData('text/plain', dragged.map(label).join('\n')); event.dataTransfer.effectAllowed = 'move';
      container.classList.add('project-dragging'); event.stopPropagation();
    };
    grip.ondragend = () => { dragged = null; container.classList.remove('project-dragging'); container.querySelectorAll('.project-drop-target').forEach(node => node.classList.remove('project-drop-target')); root.classList.remove('project-drop-target'); };
    return grip;
  }
  wireDrop(root, ''); root.onclick = () => selectTarget(null);

  const menu = make('div', null, 'project-context-menu'); menu.hidden = true; menu.setAttribute('role','menu'); menu.setAttribute('aria-label',t('项目管理菜单')); document.body.append(menu);
  let menuReturnFocus = null;
  function closeMenu(restore = false) { menu.hidden = true; if (restore) menuReturnFocus?.focus(); }
  function showMenu(event, target) {
    event.preventDefault(); event.stopPropagation();
    if (target === null || !management.items.has(target)) selectTarget(target);
    closeEditor(); menuReturnFocus = event.target.closest('button') || root;
    const files = project.files(management.items, getEntries()), hasItems = management.items.size > 0;
    const add = (text, action, enabled = true, cls = '') => {
      const item = button(text, text, () => { closeMenu(); action(); }); item.setAttribute('role','menuitem'); item.disabled = !enabled; item.className = cls; menu.append(item);
    };
    menu.replaceChildren();
    const caption = make('div', hasItems ? t("已选 {0} 项 · {1} 个点云", [management.items.size, files.length]) : t('项目管理'), 'project-menu-caption'); menu.append(caption);
    add(t('新建文件夹…'), () => openEditor('create'));
    add(t('显示选中点云'), () => onVisibility(files, true), files.length > 0 && (getMode() !== 'single' || files.length === 1));
    add(t('隐藏选中点云'), () => onVisibility(files, false), files.some(entry => getSelected().has(entry)));
    add(t('移动到…'), () => openEditor('move'), hasItems);
    add(t('移到项目根目录'), () => { try { project.moveMany(management.items, ''); onChange(); } catch(error) { status.textContent = error.message; } }, hasItems);
    add(t('展开全部文件夹'), () => { for (const group of project.groups.values()) group.collapsed = false; render(); }, project.groups.size > 0);
    add(t('收起全部文件夹'), () => { for (const group of project.groups.values()) group.collapsed = true; render(); }, project.groups.size > 0);
    add(t('移除选中条目…'), () => openEditor('remove'), hasItems, 'project-menu-danger');
    menu.hidden = false;
    const rect = event.target.getBoundingClientRect(), x = event.clientX || rect.left, y = event.clientY || rect.bottom;
    menu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - menu.offsetWidth - 6))}px`;
    menu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - menu.offsetHeight - 6))}px`;
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  container.oncontextmenu = event => showMenu(event, rowTargets.get(event.target.closest('.project-row')) ?? null);
  root.oncontextmenu = event => showMenu(event, null);
  menu.onkeydown = event => {
    const items = [...menu.querySelectorAll('button:not(:disabled)')], index = items.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (index+1)%items.length : event.key === 'ArrowUp' ? (index+items.length-1)%items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length-1 : -1;
    if (next >= 0) { event.preventDefault(); items[next].focus(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(true); }
    if (event.key === 'Tab') closeMenu();
  };
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) closeMenu(); });
  document.addEventListener('scroll', event => { if (!menu.contains(event.target)) closeMenu(); }, true);
  window.addEventListener('resize', () => closeMenu());
  container.tabIndex = 0;
  container.addEventListener('keydown', event => {
    if (event.target.closest('input')) return;
    if (event.key === 'Delete' && management.items.size) { event.preventDefault(); openEditor('remove'); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (band) finishBand(true); else selectTarget(null); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); management.box(visible); focused = visible.at(-1) || null; closeEditor(); paintSelection(); }
    if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') showMenu(event, focused);
  });

  // Rubber-band selection changes management selection only, never rendering/processing selection.
  const marquee = make('div', null, 'project-marquee'); marquee.hidden = true; document.body.append(marquee);
  let band = null, animation = null, suppressClick = false;
  function updateBand() {
    if (!band?.active) return;
    const bounds = container.getBoundingClientRect();
    if (band.y < bounds.top + 22) container.scrollTop -= 10;
    else if (band.y > bounds.bottom - 22) container.scrollTop += 10;
    const startY = bounds.top + band.startY - container.scrollTop;
    const selectionArea = {left:Math.min(band.startX,band.x),right:Math.max(band.startX,band.x),top:Math.min(startY,band.y),bottom:Math.max(startY,band.y)};
    const area = {left:Math.max(bounds.left,selectionArea.left),right:Math.min(bounds.right,selectionArea.right),top:Math.max(bounds.top,selectionArea.top),bottom:Math.min(bounds.bottom,selectionArea.bottom)};
    Object.assign(marquee.style,{left:`${area.left}px`,top:`${area.top}px`,width:`${Math.max(0,area.right-area.left)}px`,height:`${Math.max(0,area.bottom-area.top)}px`});
    const hits = [];
    for (const [row,target] of rowTargets) if (typeof target !== 'string' && pointBoxIntersects(selectionArea,row.getBoundingClientRect())) hits.push(target);
    management.box(hits, band.additive ? band.before : []); focused = [...management.items].at(-1) || null; paintSelection();
  }
  function tickBand() { updateBand(); if (band?.active) animation = requestAnimationFrame(tickBand); }
  function finishBand(cancelled = false) {
    if (!band) return;
    if (cancelled) { management.box(band.before); paintSelection(); }
    suppressClick = band.active; band = null; marquee.hidden = true; cancelAnimationFrame(animation); animation = null;
    setTimeout(() => { suppressClick = false; }, 0);
  }
  container.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button,input,label,.project-drag-handle')) return;
    closeMenu(); closeEditor();
    const rect = container.getBoundingClientRect();
    band = {pointer:event.pointerId,startX:event.clientX,startY:event.clientY-rect.top+container.scrollTop,x:event.clientX,y:event.clientY,originY:event.clientY,before:[...management.items],additive:event.ctrlKey||event.metaKey,active:false};
    container.setPointerCapture(event.pointerId); event.preventDefault();
  });
  container.addEventListener('pointermove', event => {
    if (!band || band.pointer !== event.pointerId) return;
    band.x = event.clientX; band.y = event.clientY;
    if (!band.active && Math.hypot(band.x-band.startX,band.y-band.originY) >= 4) { band.active = true; marquee.hidden = false; tickBand(); }
    else updateBand();
  });
  container.addEventListener('pointerup', event => {
    if (!band || band.pointer !== event.pointerId) return;
    if (!band.active && !band.additive) selectTarget(null);
    finishBand(); if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
  });
  container.addEventListener('pointercancel', () => finishBand(true));
  container.addEventListener('lostpointercapture', () => finishBand(true));
  container.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); } }, true);
  function render() {
    const entries = getEntries(), selected = getSelected(), query = getQuery().trim().toLowerCase();
    for (const target of management.items) if (!exists(target)) management.items.delete(target);
    if (focused && !exists(focused)) focused = null;
    if (editorTargets.some(target => !exists(target))) closeEditor();
    if (query !== lastQuery) { limit = 200; lastQuery = query; management.clear(); focused = null; closeEditor(); closeMenu(); }
    const groupsByParent = new Map(), entriesByGroup = new Map(), membersByGroup = new Map();
    const matching = entries.filter(entry => project.matches(entry, query));
    const push = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
    for (const entry of matching) {
      push(entriesByGroup, entry.group || '', entry);
      for (let group = project.groups.get(entry.group); group; group = project.groups.get(group.parent)) push(membersByGroup, group.id, entry);
    }
    const visibleGroups = new Set(membersByGroup.keys());
    for (const group of project.groups.values()) if (!query || project.path(group.id).toLowerCase().includes(query)) {
      for (let current = group; current; current = project.groups.get(current.parent)) visibleGroups.add(current.id);
    }
    for (const group of project.groups.values()) if (visibleGroups.has(group.id)) push(groupsByParent, group.parent, group);
    const sort = (a,b) => (a.name || a.treeName || a.id).localeCompare(b.name || b.treeName || b.id, undefined, {numeric:true});
    for (const map of [groupsByParent, entriesByGroup]) for (const rows of map.values()) rows.sort(sort);
    const flat = [], stack = [{id:'',depth:0}];
    while (stack.length) {
      const task = stack.pop();
      if (task.entry || task.group) { flat.push(task); if (task.entry || task.group.collapsed && !query) continue; }
      const parent = task.group?.id || task.id, depth = task.group ? task.depth + 1 : task.depth;
      const rows = [...(groupsByParent.get(parent) || []).map(group => ({group,depth})), ...(entriesByGroup.get(parent) || []).map(entry => ({entry,depth}))];
      stack.push(...rows.reverse());
    }
    const fragment = document.createDocumentFragment(); rowTargets = new Map(); visible = flat.slice(0,limit).map(item=>item.group?.id || item.entry);
    for (const item of flat.slice(0, limit)) {
      const target = item.group?.id || item.entry, row = make('div', null, 'project-row' + (item.group ? ' project-folder' : ''));
      row.style.setProperty('--tree-depth', Math.min(item.depth, 8)); rowTargets.set(row,target);
      const members = item.group ? membersByGroup.get(item.group.id) || [] : [item.entry];
      const count = members.filter(entry => selected.has(entry)).length;
      const check = make('input'); check.type = 'checkbox'; check.checked = members.length > 0 && count === members.length; check.indeterminate = count > 0 && count < members.length;
      check.disabled = !!item.group && (getMode() === 'single' || !members.length);
      check.setAttribute('aria-label', t("显示 {0}", [label(target)]));
      const hit = make('label', null, 'project-check-hit'); hit.title = item.group && query ? t('仅选择当前搜索匹配的点云') : t('勾选后用于显示、计算与合并'); hit.append(check);
      hit.onpointerdown = event => { closeMenu(); event.stopPropagation(); }; hit.onclick = event => event.stopPropagation(); hit.ondragstart = event => event.preventDefault();
      check.onchange = () => item.group ? onGroupSelection(members, check.checked) : onToggle(item.entry);
      if (item.group) {
        const toggle = button(item.group.collapsed && !query ? '▸' : '▾', `${item.group.collapsed ? t('展开') : t('收起')} ${item.group.name}`, () => { item.group.collapsed = !item.group.collapsed; render(); });
        toggle.className = 'project-chevron'; toggle.setAttribute('aria-expanded', String(!item.group.collapsed || !!query)); row.append(toggle);
      } else row.append(make('span', '', 'project-chevron'));
      const name = button((item.group ? '▱ ' : '') + (item.group?.name || item.entry.treeName || item.entry.id), t("管理 {0}", [label(target)]), event => selectTarget(target,event));
      name.className = 'project-name'; name.title = item.group ? project.path(target) : t("{0} / {1}\n来源：{2}", [project.path(item.entry.group) || t('项目根目录'), item.entry.treeName || item.entry.id, item.entry.id]);
      const meta = make('span', item.group ? String(project.members(target, entries).length) : item.entry.file.generatedCloud ? t('结果') : detail(item.entry), 'project-meta');
      row.append(hit, name, meta, gripFor(target)); wireDrop(row, item.group ? item.group.id : item.entry.group || ''); fragment.append(row);
    }
    if (flat.length > limit) fragment.append(button(t("显示更多（剩余 {0} 项）", [flat.length - limit]), t('显示更多项目条目'), () => { limit += 200; render(); }));
    if (!flat.length) fragment.append(make('p', query ? t('没有匹配的点云') : t('拖入文件或文件夹\n开始整理你的点云'), 'empty-list'));
    const blank = make('div', null, 'project-selection-space'); blank.setAttribute('aria-hidden','true'); fragment.append(blank);
    const scroll = container.scrollTop; container.replaceChildren(fragment); container.scrollTop = scroll; paintSelection();
  }
  return {render};
}

