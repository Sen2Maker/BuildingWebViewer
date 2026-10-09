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
