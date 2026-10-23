import { mountOnlineBuilder } from '../shared/online-preview.js';
import { initializeLocale, getLanguage, setLanguage } from '../shared/i18n.js';
const switchLanguage = document.getElementById('language-toggle');
function renderHubLanguage() {
  initializeLocale();
  const english = getLanguage() === 'en';
  switchLanguage.setAttribute('aria-checked',String(english));
  switchLanguage.setAttribute('aria-label',english ? '切换到中文' : 'Switch to English');
}
switchLanguage.onclick = () => {
  setLanguage(getLanguage() === 'en' ? 'zh' : 'en');
  const url = new URL(location.href); url.searchParams.set('lang',getLanguage());
  try { history.replaceState(null,'',url); } catch {}
  renderHubLanguage();
};
renderHubLanguage();

mountOnlineBuilder();

const localMode = document.getElementById('local-mode'), onlineMode = document.getElementById('online-mode');
function selectMode(online) {
  const supported = /^https?:$/.test(location.protocol) && !globalThis.Capacitor?.isNativePlatform?.();
  online = Boolean(online && supported);
  localMode.setAttribute('aria-pressed', String(!online)); onlineMode.setAttribute('aria-pressed', String(online));
  document.getElementById('local-tools').hidden = online;
  document.getElementById('online-tools').hidden = !online;
  document.querySelector('.how').hidden = online;
  document.querySelector('main').classList.toggle('is-online', online);
  onlineMode.disabled = !supported;
  const url = new URL(location.href);
  if (online) url.searchParams.set('mode', 'online'); else url.searchParams.delete('mode');
  try { history.replaceState(null, '', url); } catch {}
}
localMode.onclick = () => selectMode(false);
onlineMode.onclick = () => selectMode(true);
selectMode(new URLSearchParams(location.search).get('mode') === 'online');
