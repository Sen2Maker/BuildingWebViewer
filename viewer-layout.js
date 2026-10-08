/** A shared, non-modal inspector: the canvas remains usable while editing. */
export function mountViewerLayout({root = document} = {}) {
  const panel = root.getElementById('viewer-inspector');
  if (!panel) return null;
  const workspace = panel.parentElement;
  const triggers = [...root.querySelectorAll('[data-open-settings]')];
  const tabs = [...panel.querySelectorAll('[data-settings-tab]')];
  const sections = [...panel.querySelectorAll('[data-settings-panel]')];
  const closeButton = panel.querySelector('[data-close-settings]');
  let current = 'display', returnFocus = null;

  function select(name, focus = false) {
    if (!tabs.some(tab => tab.dataset.settingsTab === name)) return;
    current = name;
    for (const tab of tabs) {
      const active = tab.dataset.settingsTab === name;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    }
    for (const section of sections) section.hidden = section.dataset.settingsPanel !== name;
    for (const trigger of triggers) {
      const active = !panel.hidden && trigger.dataset.openSettings === name;
      trigger.setAttribute('aria-expanded', String(active));
      trigger.classList.toggle('active', active);
    }
    // A second disclosure inside the display tab would hide the very controls
    // the user has just asked to open. Standalone palette panels remain unchanged.
    const palette = panel.querySelector('.palette-panel');
    if (palette) palette.open = true;
  }
  function close() {
    if (panel.hidden) return;
    const hadFocus = panel.contains(root.activeElement);
    panel.hidden = true; workspace.classList.remove('inspector-open'); select(current);
    if (hadFocus) returnFocus?.focus();
  }
  function open(name, trigger = null) {
    returnFocus = trigger || returnFocus;
    panel.hidden = false; workspace.classList.add('inspector-open'); select(name, true);
  }
  for (const trigger of triggers) trigger.addEventListener('click', () => {
    const name = trigger.dataset.openSettings;
    if (!panel.hidden && name === current) close(); else open(name, trigger);
  });
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => select(tab.dataset.settingsTab));
    tab.addEventListener('keydown', event => {
      const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (target < 0) return;
      event.preventDefault(); select(tabs[target].dataset.settingsTab, true);
    });
  }
  closeButton.addEventListener('click', close);
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !panel.hidden) { event.preventDefault(); close(); }
  });
  select(current);
  return {open, close};
}
