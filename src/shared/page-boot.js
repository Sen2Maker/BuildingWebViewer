/* Inlined by build.py before any stylesheet or page content can paint. */
(() => {
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem('BuildingWebViewer.language'); } catch {}
  const query = new URLSearchParams(location.search).get('lang');
  const language = query === 'en' || query === 'zh' ? query : saved === 'en' ? 'en' : 'zh';
  root.lang = language === 'en' ? 'en' : 'zh-CN';
  if (language === 'en') {
    const titles = {'lod.html':'LOD Model Viewer','wireframe.html':'Wireframe Viewer','pointcloud.html':'Point Cloud Viewer'};
    document.title = (titles[location.pathname?.split('/').pop()] || 'BuildingWebViewer') + ' · 3D Data Workspace';
  }
  root.classList.add('boot-pending');
  let ready = false;
  const slow = setTimeout(() => { if (!ready) root.classList.add('boot-slow'); }, 12000);
  window.BuildingViewerBoot = {
    ready() { ready = true; clearTimeout(slow); root.classList.remove('boot-pending','boot-slow','boot-failed'); document.getElementById('page-boot')?.remove(); },
    fail() { if (!ready) { clearTimeout(slow); root.classList.add('boot-failed'); } },
  };
  window.addEventListener('error', event => {
    if (event.target?.tagName === 'SCRIPT' || event.error) window.BuildingViewerBoot.fail();
  }, true);
})();
