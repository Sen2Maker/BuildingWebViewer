/** Keep file management in the sidebar and viewing choices beside the preview. */
export function mountObjectBrowserControls({root = document} = {}) {
  const controls = root.querySelector('[data-object-browser]');
  const heading = root.querySelector('.workspace > main > .main-heading');
  if (!controls || !heading) return;
  heading.classList.add('object-browser-heading');
  heading.append(controls);
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
