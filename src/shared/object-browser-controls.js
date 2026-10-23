/** Keep file management in the sidebar and viewing choices beside the preview. */
export function mountObjectBrowserControls({root = document} = {}) {
  const controls = root.querySelector('[data-object-browser]');
  const heading = root.querySelector('.workspace > main > .main-heading');
  if (!controls || !heading) return;
  heading.classList.add('object-browser-heading');
  heading.append(controls);
  if (controls.dataset.objectBrowser === 'mesh') {
    const navigation = controls.querySelector('[data-object-navigation]');
    const actions = heading.querySelector('.button-row');
    if (navigation) {
      heading.classList.add('centered-object-heading');
      heading.append(navigation);
    }
    if (actions) controls.prepend(actions);
    const doc = controls.ownerDocument;
    const options = doc.createElement('div'); options.className = 'object-browser-options';
    options.id = 'mesh-browser-options';
    options.append(...controls.children);
    const toggle = doc.createElement('button'); toggle.type = 'button'; toggle.className = 'object-browser-more';
    toggle.textContent = doc.documentElement.lang === 'en' ? 'More ···' : '更多 ···';
    toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', options.id);
    controls.append(toggle, options);
    const close = () => { controls.classList.remove('options-open'); toggle.setAttribute('aria-expanded', 'false'); };
    toggle.addEventListener('click', () => {
      const open = controls.classList.toggle('options-open'); toggle.setAttribute('aria-expanded', String(open));
    });
    root.addEventListener('click', event => { if (!controls.contains(event.target)) close(); });
    options.addEventListener('click', event => { if (event.target.closest('button')) close(); });
    controls.addEventListener('keydown', event => {
      if (event.key === 'Escape' && controls.classList.contains('options-open')) { close(); toggle.focus(); }
    });
  }
  const help = controls.querySelector('details');
  root.addEventListener('click', event => {
    if (help.open && !help.contains(event.target)) help.open = false;
  });
  controls.addEventListener('keydown', event => {
    if (event.key === 'Escape' && help.open) {
      help.open = false; help.querySelector('summary').focus(); event.preventDefault();
    }
  });
}
