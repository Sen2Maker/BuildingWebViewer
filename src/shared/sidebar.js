import { t } from './i18n.js';
export function projectSidebarWidth(value, available, inspector = false) {
  const maximum = Math.max(240, Math.min(500, available - 360 - (inspector && available >= 1200 ? 348 : 0)));
  return Math.round(Math.max(240, Math.min(maximum, Number.isFinite(value) ? value : 300)));
}

export const PROJECT_SIDEBAR_STORAGE = 'BWV.project-sidebar.v1';
export function projectSidebarPreferences(value) {
  return {
    width: Number.isFinite(value?.width) ? Math.max(240, Math.min(500, value.width)) : 300,
    desktopCollapsed: typeof value?.desktopCollapsed === 'boolean' ? value.desktopCollapsed : false,
    mobileCollapsed: typeof value?.mobileCollapsed === 'boolean' ? value.mobileCollapsed : true
  };
}

export function mountProjectSidebar({workspace, sidebar, toggle, collapse, separator}) {
  const win = sidebar.ownerDocument.defaultView || window;
  const media = win.matchMedia?.('(max-width: 700px)');
  let preferences = projectSidebarPreferences();
  try { preferences = projectSidebarPreferences(JSON.parse(win.localStorage.getItem(PROJECT_SIDEBAR_STORAGE))); } catch {}
  let preferredWidth = preferences.width, width = preferredWidth, folded = false, resizing = null;
  const save = () => { try { win.localStorage.setItem(PROJECT_SIDEBAR_STORAGE, JSON.stringify(preferences)); } catch {} };
  const foldKey = () => media?.matches ? 'mobileCollapsed' : 'desktopCollapsed';
  function apply() {
    width = projectSidebarWidth(preferredWidth, workspace.clientWidth, workspace.classList.contains('inspector-open'));
    workspace.style.setProperty('--project-width', `${width}px`);
    separator.setAttribute('aria-valuenow', String(width));
    separator.setAttribute('aria-valuemax', String(projectSidebarWidth(500, workspace.clientWidth, workspace.classList.contains('inspector-open'))));
  }
  function fold(value, remember = true) {
    const hadSidebarFocus = sidebar.contains(sidebar.ownerDocument.activeElement);
    folded = value; workspace.classList.toggle('project-collapsed', value); sidebar.inert = value;
    toggle.setAttribute('aria-expanded', String(!value)); toggle.title = value ? t('展开项目栏') : t('收起项目栏');
    toggle.setAttribute('aria-label', toggle.title);
    toggle.classList.toggle('active', !value);
    collapse.setAttribute('aria-expanded', String(!value));
    collapse.setAttribute('aria-controls', sidebar.id);
    separator.tabIndex = value ? -1 : 0;
    if (value && hadSidebarFocus) toggle.focus();
    if (remember) { preferences[foldKey()] = value; save(); }
  }
  toggle.onclick = () => fold(!folded); collapse.onclick = () => fold(true);
  separator.onpointerdown = event => {
    if (event.button !== 0 || folded) return;
    event.preventDefault(); resizing = {pointer:event.pointerId, x:event.clientX, width};
    separator.setPointerCapture(event.pointerId); workspace.classList.add('project-resizing');
  };
  separator.onpointermove = event => {
    if (!resizing || event.pointerId !== resizing.pointer) return;
    preferredWidth = projectSidebarWidth(resizing.width + event.clientX - resizing.x, workspace.clientWidth, workspace.classList.contains('inspector-open'));
    preferences.width = preferredWidth; apply();
  };
  const stop = () => { if (resizing) save(); resizing = null; workspace.classList.remove('project-resizing'); };
  separator.onpointerup = event => { stop(); if (separator.hasPointerCapture(event.pointerId)) separator.releasePointerCapture(event.pointerId); };
  separator.onpointercancel = stop; separator.onlostpointercapture = stop;
  separator.ondblclick = () => { preferredWidth = preferences.width = 300; apply(); save(); };
  separator.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','Home'].includes(event.key)) return;
    event.preventDefault(); preferredWidth = preferences.width = event.key === 'Home' ? 300 : projectSidebarWidth(width + (event.key === 'ArrowRight' ? 16 : -16), workspace.clientWidth, workspace.classList.contains('inspector-open')); apply(); save();
  };
  // Resizing the layout is independent of the camera and never reloads point data.
  const observer = new ResizeObserver(apply); observer.observe(workspace);
  const mutation = new MutationObserver(apply); mutation.observe(workspace, {attributes:true, attributeFilter:['class']});
  const breakpoint = () => { stop(); fold(preferences[foldKey()], false); apply(); };
  if (media?.addEventListener) media.addEventListener('change', breakpoint); else media?.addListener?.(breakpoint);
  apply(); fold(preferences[foldKey()], false);
  return {destroy() {
    stop(); observer.disconnect(); mutation.disconnect();
    if (media?.removeEventListener) media.removeEventListener('change', breakpoint); else media?.removeListener?.(breakpoint);
    toggle.onclick = collapse.onclick = null;
    for (const name of ['onpointerdown','onpointermove','onpointerup','onpointercancel','onlostpointercapture','ondblclick','onkeydown']) separator[name] = null;
  }};
}
