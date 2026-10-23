/** Explicit application entry links share only an explicit locale, never a project or file. */
export function appLinkURL(href, baseURI, search = '') {
 const target = new URL(href, baseURI);
 if (!['https:', 'http:', 'file:'].includes(target.protocol)) throw new Error('Unsupported app link protocol');
 const locale = new URLSearchParams(search).get('lang');
 target.search = ''; target.hash = '';
 if (locale === 'en' || locale === 'zh') target.searchParams.set('lang', locale);
 return target.href;
}
export function initializeAppLinks(doc = document, location = globalThis.location) {
 const locale = new URLSearchParams(location?.search || '').get('lang');
 const language = locale === 'en' || locale === 'zh' ? locale : doc.documentElement?.lang === 'en' ? 'en' : 'zh';
 for (const link of doc.querySelectorAll('a[data-app-link], a[data-app-route]')) {
  link.href = appLinkURL(link.getAttribute('href'), doc.baseURI, '?lang=' + language);
  if (link.target === '_blank') link.rel = 'noopener noreferrer';
 }
}
