import { readCompareDescriptor } from '../shared/online-compare-core.js';
import { getLanguage } from '../shared/i18n.js';
import { createComparisonSession } from './session.js';
import { PairedComparisonRenderer } from './renderer.js';
import './compare.css';

const text = (zh, en) => getLanguage() === 'en' ? en : zh;
const number = value => Number(value).toLocaleString(getLanguage() === 'en' ? 'en-US' : 'zh-CN');
function element(tag, parent, content = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className) node.className = className;
  parent?.append(node);
  return node;
}
export function comparisonOnlineAllowed(host = globalThis) {
  return /^https?:$/.test(host.location?.protocol || '') && !host.Capacitor?.isNativePlatform?.() && host.navigator?.onLine !== false;
}

/** No file picker or modal: a validated link is the complete startup command. */
export function mountComparison(root) {
  root.replaceChildren();
  document.documentElement.lang = getLanguage() === 'en' ? 'en' : 'zh-CN';
  const toolbar = element('header', root, '', 'compare-toolbar');
  const previous = element('button', toolbar, '‹', 'compare-step');
  previous.type = 'button'; previous.title = previous.ariaLabel = text('上一个 ID', 'Previous ID');
  const title = element('strong', toolbar, text('在线对比', 'Online comparison'), 'compare-id');
  const next = element('button', toolbar, '›', 'compare-step');
  next.type = 'button'; next.title = next.ariaLabel = text('下一个 ID', 'Next ID');
  const counter = element('span', toolbar, '', 'compare-counter');
  const form = element('form', toolbar, '', 'compare-search');
  form.setAttribute('role', 'search');
  const search = element('input', form);
  search.type = 'search'; search.placeholder = text('搜索 ID', 'Search ID'); search.ariaLabel = text('搜索并跳转到建筑 ID', 'Find a building ID');
  search.autocomplete = 'off'; search.spellcheck = false; search.maxLength = 240;
  const suggestions = element('div', form, '', 'compare-suggestions');
  suggestions.id = 'compare-suggestions'; suggestions.hidden = true;
  suggestions.setAttribute('role', 'listbox'); search.setAttribute('aria-haspopup', 'listbox'); search.setAttribute('aria-controls', suggestions.id); search.setAttribute('aria-expanded', 'false');
  const notice = element('p', root, '', 'compare-notice'); notice.hidden = true; notice.setAttribute('role', 'status');
  const panes = element('div', root, '', 'compare-panes');
  const pane = (key, label) => {
    const section = element('section', panes, '', `compare-pane compare-${key}`);
    section.ariaLabel = label;
    const heading = element('div', section, '', 'compare-pane-heading');
    element('h1', heading, label);
    const state = element('span', heading, '', 'compare-state'); state.setAttribute('role', 'status'); state.setAttribute('aria-live', 'polite');
    const canvas = element('canvas', section, '', 'compare-canvas'); canvas.ariaLabel = label; canvas.tabIndex = 0;
    const message = element('p', section, '', 'compare-pane-message'); message.hidden = true;
    return {section, state, canvas, message};
  };
  const cloudPane = pane('cloud', text('点云', 'Point cloud')), meshPane = pane('mesh', 'Mesh');
  previous.disabled = next.disabled = search.disabled = true;
  let session = null, renderer = null, disposed = false, currentId = null, buildings = [], descriptor;
  let lastPhase = null;
  let details = {mesh: '', cloud: ''}, failures = {mesh: '', cloud: ''};
  const paneFor = key => key === 'mesh' ? meshPane : cloudPane;
  function showNotice(message) { notice.textContent = message; notice.hidden = !message; }
  function showError({id, pane: key, error}) {
    if (disposed || id && currentId && id !== currentId) return;
    const message = error?.message || String(error || '');
    if (key === 'catalog') { showNotice(message); return; }
    failures[key] = message;
    const view = paneFor(key); view.state.textContent = message ? text('无法显示', 'Unavailable') : '';
    view.message.textContent = message; view.message.hidden = !message;
    view.section.removeAttribute('aria-busy');
  }
  function select(id) {
    if (!session || disposed || !comparisonOnlineAllowed()) return;
    search.value = ''; suggestions.hidden = true; search.setAttribute('aria-expanded', 'false');
    void session.select(id);
  }
  function showSuggestions() {
    suggestions.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    const matches = query ? buildings.filter(building => building.id.toLocaleLowerCase().includes(query)).slice(0, 8) : [];
    for (const building of matches) {
      const button = element('button', suggestions, building.id); button.type = 'button'; button.setAttribute('role', 'option');
      button.onclick = () => select(building.id);
    }
    suggestions.hidden = !matches.length; search.setAttribute('aria-expanded', String(matches.length > 0));
  }
  search.addEventListener('input', showSuggestions);
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') { suggestions.hidden = true; search.setAttribute('aria-expanded', 'false'); }
    if (event.key === 'ArrowDown' && !suggestions.hidden) { event.preventDefault(); suggestions.firstElementChild?.focus(); }
  });
  form.addEventListener('keydown', event => {
    if (event.target === search || suggestions.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); suggestions.hidden = true; search.setAttribute('aria-expanded', 'false'); search.focus(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const choices = [...suggestions.children], index = choices.indexOf(event.target);
      choices[(index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length]?.focus();
    }
  });
  const dismissSuggestions = event => { if (!form.contains(event.target)) { suggestions.hidden = true; search.setAttribute('aria-expanded', 'false'); } };
  root.addEventListener('pointerdown', dismissSuggestions);
  form.onsubmit = event => {
    event.preventDefault(); const query = search.value.trim(); if (!query) return;
    const exact = buildings.find(building => building.id === query);
    const insensitive = buildings.filter(building => building.id.toLocaleLowerCase() === query.toLocaleLowerCase());
    if (exact || insensitive.length === 1) select((exact || insensitive[0]).id);
    else { showNotice(text('请选择匹配的 ID；未切换当前模型。', 'Choose a matching ID; the current model is unchanged.')); showSuggestions(); }
  };
  previous.onclick = () => { if (comparisonOnlineAllowed()) void session?.previous(); };
  next.onclick = () => { if (comparisonOnlineAllowed()) void session?.next(); };
  const offline = () => {
    session?.dispose(); previous.disabled = next.disabled = search.disabled = true;
    showNotice(text('网络已断开，已载入内容仍可查看。恢复网络后重新打开此链接。', 'You are offline. Loaded content remains viewable; reopen this link when online.'));
  };
  window.addEventListener('offline', offline);
  try {
    if (!comparisonOnlineAllowed()) throw Error(text('仅在线网页支持此对比；App 和离线模式不会下载远程数据。', 'Comparison requires the online website. Native apps and offline mode do not download remote data.'));
    descriptor = readCompareDescriptor();
    if (!descriptor) throw Error(text('此链接缺少对比配置，请打开包含建筑 ID 的完整分享链接。', 'This link has no comparison configuration. Open the complete shared link with a building ID.'));
    title.textContent = title.title = descriptor.buildingId;
    renderer = new PairedComparisonRenderer(cloudPane.canvas, meshPane.canvas, {preset: descriptor.preset,
      onError: (key, message) => showError({id: currentId, pane: key, error: message})});
    session = createComparisonSession({manifest: descriptor.manifest, initialId: descriptor.buildingId, preset: descriptor.preset, maxPoints: descriptor.maxPoints,
      onCatalog({buildings: entries}) { if (!disposed) { buildings = entries; search.disabled = !entries.length; } },
      onMesh({id, mesh}) {
        if (disposed || id !== currentId) return;
        renderer.setMesh(id, mesh); details.mesh = `${number(mesh.faces.length)} ${text('三角面', 'triangles')}`;
      },
      onCloud({id, cloud}) {
        if (disposed || id !== currentId) return;
        renderer.setCloud(id, cloud);
        details.cloud = `${number(cloud.count)}${cloud.totalCount > cloud.count ? ` / ${number(cloud.totalCount)}` : ''} ${text('点', 'points')}`;
      },
      onState(state) {
        if (disposed) return;
        const newSelection = state.id && (state.id !== currentId || state.phase === 'selection' && lastPhase !== 'selection');
        lastPhase = state.phase;
        if (newSelection) {
          currentId = state.id; details = {mesh: '', cloud: ''}; failures = {mesh: '', cloud: ''};
          title.textContent = title.title = currentId; renderer.select(currentId); showNotice('');
          document.title = `${currentId} · ${text('点云与网格对比', 'Point cloud / Mesh')}`;
          for (const view of [cloudPane, meshPane]) { view.message.hidden = true; view.message.textContent = ''; }
          // Keep copied URLs tied to the visible ID, without reloading either pane.
          const url = new URL(location.href);
          url.hash = new URLSearchParams({compare: JSON.stringify({...descriptor, buildingId: currentId})}).toString();
          try { history.replaceState(null, '', url); } catch { /* Navigation remains usable when history access is restricted. */ }
        }
        counter.textContent = state.total ? `${state.index + 1} / ${state.total}` : '';
        previous.disabled = !(state.index > 0); next.disabled = !(state.total && state.index < state.total - 1);
        for (const key of ['mesh', 'cloud']) {
          if (failures[key]) continue;
          const view = paneFor(key), status = state[key];
          view.section.setAttribute('aria-busy', String(['loading', 'parsing'].includes(status)));
          view.state.textContent = status === 'ready' ? details[key] : status === 'parsing' ? text('解析中…', 'Parsing…') : status === 'loading' ? text('加载中…', 'Loading…') : status === 'error' ? text('加载失败', 'Load failed') : text('等待数据', 'Waiting');
        }
      }, onError: showError,
    });
    void session.start();
  } catch (error) { showNotice(error.message || String(error)); renderer?.dispose(); renderer = null; }
  globalThis.BuildingViewerBoot?.ready();
  return () => { disposed = true; session?.dispose(); renderer?.dispose(); window.removeEventListener('offline', offline); root.removeEventListener('pointerdown', dismissSuggestions); };
}

const root = document.getElementById('compare-app');
if (root) {
  let dispose = mountComparison(root);
  window.addEventListener('hashchange', () => { dispose(); dispose = mountComparison(root); });
  window.addEventListener('pagehide', () => dispose());
  window.addEventListener('pageshow', event => { if (event.persisted) dispose = mountComparison(root); });
}
