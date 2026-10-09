import { t } from './i18n.js';
export function projectSidebarWidth(value, available, inspector = false) {
  const maximum = Math.max(240, Math.min(500, available - 360 - (inspector && available >= 1200 ? 348 : 0)));
  return Math.round(Math.max(240, Math.min(maximum, Number.isFinite(value) ? value : 300)));
}

export function mountProjectSidebar({workspace, sidebar, toggle, collapse, separator}) {
  let width = 300, folded = false, resizing = null;
  function apply() {
    width = projectSidebarWidth(width, workspace.clientWidth, workspace.classList.contains('inspector-open'));
    workspace.style.setProperty('--project-width', `${width}px`);
    separator.setAttribute('aria-valuenow', String(width));
    separator.setAttribute('aria-valuemax', String(projectSidebarWidth(500, workspace.clientWidth, workspace.classList.contains('inspector-open'))));
  }
  function fold(value) {
    const hadSidebarFocus = sidebar.contains(sidebar.ownerDocument.activeElement);
    folded = value; workspace.classList.toggle('project-collapsed', value); sidebar.inert = value;
    toggle.setAttribute('aria-expanded', String(!value)); toggle.title = value ? t('展开项目栏') : t('收起项目栏');
    toggle.setAttribute('aria-label', toggle.title);
    toggle.classList.toggle('active', !value);
    collapse.setAttribute('aria-expanded', String(!value));
    collapse.setAttribute('aria-controls', sidebar.id);
    separator.tabIndex = value ? -1 : 0;
    if (value && hadSidebarFocus) toggle.focus();
  }
  toggle.onclick = () => fold(!folded); collapse.onclick = () => fold(true);
  separator.onpointerdown = event => {
    if (event.button !== 0 || folded) return;
    event.preventDefault(); resizing = {pointer:event.pointerId, x:event.clientX, width};
    separator.setPointerCapture(event.pointerId); workspace.classList.add('project-resizing');
  };
  separator.onpointermove = event => {
    if (!resizing || event.pointerId !== resizing.pointer) return;
    width = resizing.width + event.clientX - resizing.x; apply();
  };
  const stop = () => { resizing = null; workspace.classList.remove('project-resizing'); };
  separator.onpointerup = event => { stop(); if (separator.hasPointerCapture(event.pointerId)) separator.releasePointerCapture(event.pointerId); };
  separator.onpointercancel = stop; separator.onlostpointercapture = stop;
  separator.ondblclick = () => { width = 300; apply(); };
  separator.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','Home'].includes(event.key)) return;
    event.preventDefault(); width = event.key === 'Home' ? 300 : width + (event.key === 'ArrowRight' ? 16 : -16); apply();
  };
  // Resizing the layout is independent of the camera and never reloads point data.
  const observer = new ResizeObserver(apply); observer.observe(workspace);
  new MutationObserver(apply).observe(workspace, {attributes:true, attributeFilter:['class']});
  apply(); fold(window.matchMedia?.('(max-width: 700px)').matches || false);
}
