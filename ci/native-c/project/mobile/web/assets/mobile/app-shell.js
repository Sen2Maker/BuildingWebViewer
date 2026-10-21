/* Android-only shell; injected before page boot. No browser session is changed. */
(() => {
  if (!window.Capacitor?.isNativePlatform?.()) return;
  // A page URL alone cannot prove which document queued a native message before navigation.
  // Native onPageFinished delivers a fresh capability only to this current main document.
  const cap = window.Capacitor;
  let token = null, expired = false, settle, fail;
  const ready = new Promise((resolve, reject) => { settle = resolve; fail = reject; });
  ready.catch(() => {});
  const timeout = setTimeout(() => { expired = true; fail(new Error('NATIVE_DOCUMENT_AUTHORIZATION_UNAVAILABLE')); }, 15000);
  Object.defineProperty(window, 'bwvAuthorizeDocument', {value(value) {
    if (expired || typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return false;
    if (token !== null) return token === value;
    token = value; clearTimeout(timeout); settle(); return true;
  }, writable:false, configurable:false});
  const options = value => { const payload = {...(value || {}), bwvDocumentToken:token}; if (JSON.stringify(payload).length > 2000000) throw new Error('NATIVE_REQUEST_TOO_LARGE'); return payload; };
  const nativePromise = cap.nativePromise?.bind(cap), nativeCallback = cap.nativeCallback?.bind(cap);
  if (!nativePromise || !nativeCallback) throw new Error('NATIVE_DOCUMENT_TRANSPORT_UNAVAILABLE');
  cap.nativePromise = (plugin, method, value) => ready.then(() => nativePromise(plugin, method, options(value)));
  // Capacitor's registerPlugin proxy already assimilates the asynchronous callback ID.
  cap.nativeCallback = (plugin, method, value, callback) => ready.then(() => nativeCallback(plugin, method, options(value), callback));
  const home = '/assets/mobile/index.html', language = () => new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh';
  const homeURL = () => `${home}?lang=${language()}`;
  const isHub = path => path === '/' || path === '/index.html' || path === '';
  if (isHub(location.pathname)) { location.replace(homeURL()); return; }
  document.documentElement.classList.add('native-app');
  function returnHome(event) {
    event?.preventDefault(); event?.stopImmediatePropagation();
    if (typeof window.bwvNavigateProjectHome === 'function') window.bwvNavigateProjectHome();
    else location.replace(homeURL()); // A viewer still loading has not enabled edits or a save session yet.
  }
  // Capture early: the normal viewer session may still be reading a large project.
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href]'); if (!anchor) return;
    const url = new URL(anchor.href, location.href);
    if (anchor.classList.contains('back-home') || url.origin === location.origin && isHub(url.pathname)) returnHome(event);
    if (url.hostname === 'sen2maker.github.io' && url.pathname.startsWith('/BuildingWebViewer')) event.preventDefault();
  }, true);
  const apply = () => {
    const link = document.querySelector('.back-home');
    if (link) { link.href = homeURL(); link.textContent = language() === 'en' ? '‹ Projects' : '‹ 项目'; link.setAttribute('aria-label', language() === 'en' ? 'Return to projects' : '返回项目'); }
    for (const anchor of document.querySelectorAll('a[href]')) {
      const url = new URL(anchor.href, location.href);
      if (url.hostname === 'sen2maker.github.io' && url.pathname.startsWith('/BuildingWebViewer')) anchor.hidden = true;
    }
    const header = document.querySelector('.app-header');
    if (header && !header.querySelector('.native-app-badge')) {
      const badge = document.createElement('span'); badge.className = 'native-app-badge'; badge.textContent = 'APP'; header.append(badge);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, {once:true}); else apply();
})();
