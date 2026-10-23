/** Gate module startup before importing app chunks. No dev-server requirement in production. */
export async function startViewer(load) {
  if (!import.meta.env.DEV && /^https?:$/.test(location.protocol) && !window.Capacitor?.isNativePlatform?.()) {
    const current = document.querySelector('meta[name="application-build"]')?.content;
    if (current) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 2500);
      try {
        const response = await fetch(new URL('version.json', location.href), {cache:'no-store', credentials:'omit', signal:controller.signal});
        if (response.ok) {
          const next = await response.json();
          if (/^[a-f0-9]{16}$/.test(next.build) && next.build !== current) {
            const url = new URL(location.href);
            if (url.searchParams.get('_bwvRefresh') !== next.build) {
              url.searchParams.set('_bwvRefresh', next.build); url.searchParams.set('build', next.build); location.replace(url.href);
            }
            window.BuildingViewerBoot?.fail(); return;
          }
        }
      } catch { /* Local data and startup stay usable offline. */ }
      finally { clearTimeout(timeout); }
    }
  }
  try { await load(); }
  catch (error) { window.BuildingViewerBoot?.fail(); console.error(error); throw error; }
}
