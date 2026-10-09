import { t } from './i18n.js';
// Project groups are virtual: source identity and disk paths never change on a move.
export class ViewerProject {
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

export class ProjectSelection {
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

export function projectBoxIntersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

