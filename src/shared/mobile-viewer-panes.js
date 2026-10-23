/** Keep pane titles available while a mobile comparison canvas is folded. */
export function mountMobileViewerPanes(grid) {
  const panels = [...grid.querySelectorAll('.viewer-panel')];
  const collapsed = new Set();
  let count = 1;
  const en = grid.ownerDocument.documentElement.lang.startsWith('en');
  const buttons = panels.map((panel, index) => {
    const viewport = panel.querySelector('.viewport');
    viewport.id ||= `mesh-viewport-${index + 1}`;
    const button = grid.ownerDocument.createElement('button');
    button.type = 'button'; button.className = 'mobile-pane-toggle';
    button.setAttribute('aria-controls', viewport.id);
    panel.querySelector('.comparison-heading').append(button);
    button.addEventListener('click', () => {
      if (index >= count || count < 2) return;
      if (collapsed.has(index)) collapsed.delete(index);
      else {
        collapsed.add(index);
        // Folding the last open pane switches focus to another pane.
        if (collapsed.size === count) collapsed.delete((index + 1) % count);
      }
      render();
    });
    return button;
  });
  function render() {
    grid.style.setProperty('--mobile-pane-rows', panels.slice(0, count)
      .map((_, index) => collapsed.has(index) ? 'auto' : 'minmax(0,1fr)').join(' '));
    panels.forEach((panel, index) => {
      const folded = collapsed.has(index);
      panel.classList.toggle('mobile-pane-collapsed', folded);
      buttons[index].textContent = folded ? (en ? 'Expand' : '展开') : (en ? 'Collapse' : '折叠');
      buttons[index].setAttribute('aria-expanded', String(!folded));
      buttons[index].setAttribute('aria-label', en ? `${folded ? 'Expand' : 'Collapse'} pane ${index + 1}` : `${folded ? '展开' : '折叠'}视窗 ${index + 1}`);
    });
  }
  return {update(nextCount) {
    if (nextCount !== count) collapsed.clear();
    count = nextCount;
    render();
  }};
}
