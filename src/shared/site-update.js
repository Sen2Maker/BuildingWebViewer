/* Inlined startup freshness gate. No polling, update banner or manual check UI. */
(() => {
  const pages = new Set(['index.html', 'lod.html', 'wireframe.html', 'pointcloud.html']);
  const current = document.querySelector('meta[name="application-build"]')?.content;
  const base = new URL('./', location.href);
  const networkUpdates = /^https?:$/.test(location.protocol) && !window.Capacitor?.isNativePlatform?.();
  const startup = (async () => {
    if (!networkUpdates || !current) return true;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const manifest = new URL('version.json', base); manifest.searchParams.set('check', String(Date.now()));
      const response = await fetch(manifest, {cache: 'no-store', signal: controller.signal, credentials: 'omit'});
      if (!response.ok) return true;
      const next = await response.json();
      if (!/^[a-f0-9]{16}$/.test(next.build) || !/^\d+\.\d+\.\d+$/.test(next.version) || next.build === current) return true;
      const url = new URL(location.href);
      if (url.searchParams.get('_bwvRefresh') !== next.build) {
        url.searchParams.set('build', next.build);
        url.searchParams.set('_bwvRefresh', next.build);
        url.searchParams.set('_fresh', String(Date.now()));
        location.replace(url.href);
      }
      return false; // Do not run stale scripts, or loop if a deployment is incomplete.
    } catch { return true; } // Offline or slow connection: the cached package remains usable.
    finally { clearTimeout(timeout); }
  })();
  async function start() {
    if (!(await startup)) { window.BuildingViewerBoot?.fail(); return; }
    for (const placeholder of document.querySelectorAll('script[data-viewer-src]')) {
      const script = document.createElement('script'); script.src = placeholder.getAttribute('data-viewer-src');
      script.onerror = () => window.BuildingViewerBoot?.fail(); document.body.append(script);
    }
    if (!networkUpdates) return;
    document.addEventListener('click', event => {
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.hasAttribute('download') || anchor.getAttribute('href')?.startsWith('#')) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin === base.origin && new URL('./', url).pathname === base.pathname && pages.has(url.pathname.split('/').pop() || 'index.html')) {
        url.searchParams.set('build', current); anchor.href = url.href;
      }
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();
