/* Inlined by build.py before any stylesheet or page content can paint. */
(() => {
  const root = document.documentElement, sourceTitle = document.title;
  let saved = null;
  try { if (!new URLSearchParams((location.hash || '').slice(1)).has('preview')) saved = localStorage.getItem('BuildingWebViewer.language'); } catch {}
  const query = new URLSearchParams(location.search).get('lang');
  const language = query === 'en' || query === 'zh' ? query : saved === 'en' ? 'en' : 'zh';
  root.lang = language === 'en' ? 'en' : 'zh-CN';
  if (language === 'en') {
    const titles = {'lod.html':'Mesh Viewer','wireframe.html':'Wireframe Viewer','pointcloud.html':'Point Cloud Viewer','gaussian.html':'Gaussian Splatting Viewer','generate.html':'Point Cloud Studio','cad.html':'CAD Viewer'};
    document.title = (titles[location.pathname?.split('/').pop()] || 'BuildingWebViewer') + ' · 3D Data Workspace';
  }
  root.classList.add('boot-pending');
  let ready = false;
  const slow = setTimeout(() => { if (!ready) root.classList.add('boot-slow'); }, 12000);
  window.BuildingViewerBoot = {
    sourceTitle,
    ready() { ready = true; clearTimeout(slow); root.classList.remove('boot-pending','boot-slow','boot-failed'); document.getElementById('page-boot')?.remove(); },
    fail() { if (!ready) { clearTimeout(slow); root.classList.add('boot-failed'); } },
  };
  window.addEventListener('error', event => {
    if (event.target?.tagName === 'SCRIPT' || event.error) window.BuildingViewerBoot.fail();
  }, true);
})();
