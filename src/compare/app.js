/** Legacy comparison links now open the existing Mesh viewer. */
export function comparisonRedirectUrl(href) {
  const source = new URL(href);
  if (!['http:', 'https:', 'file:', 'capacitor:', 'ionic:'].includes(source.protocol) || source.username || source.password) {
    throw new TypeError('Unsupported comparison page address');
  }
  // The destination is fixed in this page's directory. Neither descriptors nor
  // query parameters may choose a host, scheme or destination page.
  const target = new URL('lod.html', source);
  target.search = source.search;
  target.hash = source.hash;
  return target.href;
}

export function redirectComparison(host = globalThis) {
  const target = comparisonRedirectUrl(host.location.href);
  host.location.replace(target);
  return target;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  try {
    redirectComparison();
  } catch {
    const root = document.getElementById('compare-app');
    if (root) root.textContent = '无法打开查看器，请返回首页。 / Unable to open the viewer. Return to the home page.';
  } finally {
    globalThis.BuildingViewerBoot?.ready?.();
  }
}
