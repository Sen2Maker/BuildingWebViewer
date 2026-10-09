// Project groups are virtual: source identity and disk paths never change on a move.
export class PointProject {
  constructor() { this.groups = new Map(); this.serial = 0; }
  create(name, parent = '') {
    name = name.trim();
    if (!name || /[/\\\x00-\x1f]/.test(name)) throw Error('请输入文件夹名称，不含斜线或控制字符');
    if (parent && !this.groups.has(parent)) throw Error('目标文件夹已不存在');
    if ([...this.groups.values()].some(group => group.parent === parent && group.name === name)) throw Error('此位置已有同名文件夹');
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
    if (parent && !this.groups.has(parent)) throw Error('目标文件夹已不存在');
    if (typeof target === 'string') {
      const group = this.groups.get(target); if (!group) throw Error('文件夹已不存在');
      if (this.within(parent, target)) throw Error('不能移动到自身或其子文件夹');
      if ([...this.groups.values()].some(other => other.id !== target && other.parent === parent && other.name === group.name)) throw Error('目标位置已有同名文件夹');
      group.parent = parent;
    } else target.group = parent;
    if (parent) this.groups.get(parent).collapsed = false;
  }
  removeGroup(id) {
    const removed = [...this.groups.keys()].filter(key => this.within(key, id));
    for (const key of removed) this.groups.delete(key);
  }
  matches(entry, query) {
    return `${this.path(entry.group)}/${entry.treeName || entry.id} ${entry.id}`.toLowerCase().includes(query.toLowerCase().trim());
  }
}

export function mountPointProject({project, container, root, controls, getEntries, getSelected, getMode, getQuery,
  onToggle, onGroupSelection, onRemove, onChange, detail}) {
  const make = (tag, text, cls) => { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
  const button = (text, label, fn) => { const node = make('button', text); node.type = 'button'; node.title = label; node.setAttribute('aria-label', label); node.onclick = fn; return node; };
  const dragType = 'application/x-buildingwebviewer-node';
  let focused = null, dragged = null, limit = 200, lastQuery = '', editorMode = null;
  const tools = make('div', null, 'project-tools');
  const createButton = button('+ 文件夹', '新建项目内文件夹', () => openEditor('create'));
  const moveButton = button('移动', '移动当前条目', () => openEditor('move'));
  const deleteButton = button('移除', '移除当前条目', () => openEditor('remove'));
  tools.append(createButton, moveButton, deleteButton);
  const focusNote = make('p', '点击名称管理，勾选方框显示', 'project-focus');
  const editor = make('form', null, 'project-editor'); editor.hidden = true;
  const editorTitle = make('strong'), nameInput = make('input'); nameInput.placeholder = '文件夹名称'; nameInput.setAttribute('aria-label', '新文件夹名称');
  const destinations = make('select'); destinations.setAttribute('aria-label', '目标文件夹');
  const editorNote = make('p'), actions = make('div', null, 'project-editor-actions');
  const submit = make('button', '确定'); submit.type = 'submit';
  const cancel = button('取消', '取消管理操作', () => { editorMode = null; editor.hidden = true; });
  actions.append(submit, cancel); editor.append(editorTitle, nameInput, destinations, editorNote, actions);
  controls.append(tools, focusNote, editor);
  const status = make('p', null, 'project-status'); status.setAttribute('role', 'status'); controls.append(status);
  function label(target) { return typeof target === 'string' ? project.path(target) : target?.treeName || target?.id || '项目根目录'; }
  function exists(target) { return typeof target === 'string' ? project.groups.has(target) : getEntries().includes(target); }
  function focus(target) { focused = target; editor.hidden = true; editorMode = null; render(); }
  function candidates(target = focused) { return typeof target === 'string' ? project.members(target, getEntries()) : target ? [target] : []; }
  function fillDestinations() {
    destinations.replaceChildren();
    const add = (value, text) => { const option = make('option', text); option.value = value; destinations.append(option); };
    add('', '项目根目录');
    for (const group of [...project.groups.values()].sort((a,b) => project.path(a.id).localeCompare(project.path(b.id), undefined, {numeric:true}))) {
      if (editorMode === 'move' && typeof focused === 'string' && project.within(group.id, focused)) continue;
      add(group.id, project.path(group.id));
    }
    destinations.value = typeof focused === 'string' ? editorMode === 'create' ? focused : project.groups.get(focused)?.parent || '' : focused?.group || '';
  }
  function openEditor(mode) {
    if (mode !== 'create' && !focused) return;
    editorMode = mode; editor.hidden = false; status.textContent = ''; nameInput.value = '';
    editorTitle.textContent = {create:'新建项目文件夹',move:`移动：${label(focused)}`,remove:`移除：${label(focused)}`}[mode];
    nameInput.hidden = mode !== 'create'; destinations.hidden = mode === 'remove';
    submit.textContent = mode === 'remove' ? '确认移除' : mode === 'move' ? '移动到此处' : '创建';
    editorNote.textContent = mode === 'remove'
      ? `从页面移除 ${candidates().length} 个点云${typeof focused === 'string' ? '及其文件夹' : ''}。磁盘文件不变；未导出的计算结果将丢失。`
      : '仅调整当前页面的分组，不修改磁盘文件。';
    fillDestinations(); if (mode === 'create') nameInput.focus();
  }
  editor.onsubmit = event => {
    event.preventDefault();
    try {
      if (editorMode === 'create') focused = project.create(nameInput.value, destinations.value);
      else if (editorMode === 'move') project.move(focused, destinations.value);
      else if (editorMode === 'remove') {
        const removed = candidates(); if (typeof focused === 'string') project.removeGroup(focused);
        focused = null; onRemove(removed);
      }
      editorMode = null; editor.hidden = true; status.textContent = ''; onChange();
    } catch (error) { status.textContent = error.message; }
  };
  function wireDrag(row, target, parent) {
    row.draggable = target !== null;
    row.ondragstart = event => {
      if (!target) return;
      dragged = target; event.dataTransfer.setData(dragType, 'project-node'); event.dataTransfer.setData('text/plain', label(target)); event.dataTransfer.effectAllowed = 'move';
      row.classList.add('project-dragging'); event.stopPropagation();
    };
    row.ondragend = () => { dragged = null; row.classList.remove('project-dragging'); container.querySelectorAll('.project-drop-target').forEach(node => node.classList.remove('project-drop-target')); root.classList.remove('project-drop-target'); };
    row.ondragover = event => {
      if (!dragged || !Array.from(event.dataTransfer.types).includes(dragType)) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; row.classList.add('project-drop-target');
    };
    row.ondragleave = event => { if (!row.contains(event.relatedTarget)) row.classList.remove('project-drop-target'); };
    row.ondrop = event => {
      if (!dragged || !Array.from(event.dataTransfer.types).includes(dragType)) return;
      event.preventDefault(); event.stopPropagation(); row.classList.remove('project-drop-target');
      try { project.move(dragged, parent); focused = dragged; status.textContent = `已移动到 ${project.path(parent) || '项目根目录'}`; }
      catch (error) { status.textContent = error.message; }
      dragged = null; editor.hidden = true; editorMode = null; onChange();
    };
  }
  wireDrag(root, null, ''); root.onclick = () => focus(null);
  function render() {
    const entries = getEntries(), selected = getSelected(), query = getQuery().trim().toLowerCase();
    if (focused && !exists(focused)) { focused = null; editorMode = null; editor.hidden = true; }
    if (query !== lastQuery) { limit = 200; lastQuery = query; }
    moveButton.disabled = deleteButton.disabled = !focused;
    focusNote.textContent = focused ? `管理：${label(focused)}` : '点击名称管理 · 勾选方框显示'; focusNote.title = focusNote.textContent;
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
    const fragment = document.createDocumentFragment();
    for (const item of flat.slice(0, limit)) {
      const target = item.group?.id || item.entry, row = make('div', null, 'project-row' + (item.group ? ' project-folder' : ''));
      row.style.setProperty('--tree-depth', Math.min(item.depth, 8)); row.dataset.focused = String(focused === target);
      const members = item.group ? membersByGroup.get(item.group.id) || [] : [item.entry];
      const count = members.filter(entry => selected.has(entry)).length;
      const check = make('input'); check.type = 'checkbox'; check.checked = members.length > 0 && count === members.length; check.indeterminate = count > 0 && count < members.length;
      check.disabled = !!item.group && (getMode() === 'single' || !members.length);
      check.setAttribute('aria-label', `显示 ${label(target)}`);
      check.title = item.group && query ? '仅选择当前搜索匹配的点云' : '勾选后用于显示、计算与合并';
      check.onchange = () => item.group ? onGroupSelection(members, check.checked) : onToggle(item.entry);
      if (item.group) {
        const toggle = button(item.group.collapsed && !query ? '▸' : '▾', `${item.group.collapsed ? '展开' : '收起'} ${item.group.name}`, () => { item.group.collapsed = !item.group.collapsed; focus(target); });
        toggle.className = 'project-chevron'; toggle.setAttribute('aria-expanded', String(!item.group.collapsed || !!query)); row.append(toggle);
      } else row.append(make('span', '', 'project-chevron'));
      const name = button((item.group ? '▱ ' : '⠿ ') + (item.group?.name || item.entry.treeName || item.entry.id), `管理 ${label(target)}`, () => focus(target));
      name.className = 'project-name'; name.title = item.group ? project.path(target) : `${project.path(item.entry.group) || '项目根目录'} / ${item.entry.treeName || item.entry.id}\n来源：${item.entry.id}`;
      const meta = make('span', item.group ? String(project.members(target, entries).length) : item.entry.file.generatedCloud ? '结果' : detail(item.entry), 'project-meta');
      row.append(check, name, meta); wireDrag(row, target, item.group ? item.group.id : item.entry.group || ''); fragment.append(row);
    }
    if (flat.length > limit) fragment.append(button(`显示更多（剩余 ${flat.length - limit} 项）`, '显示更多项目条目', () => { limit += 200; render(); }));
    if (!flat.length) fragment.append(make('p', query ? '没有匹配的点云' : '拖入文件或文件夹\n开始整理你的点云', 'empty-list'));
    const scroll = container.scrollTop; container.replaceChildren(fragment); container.scrollTop = scroll;
  }
  return {render};
}
