import { EN_MESSAGES } from '../locales/en.js';

const LANGUAGE_KEY = 'BuildingWebViewer.language';
export function resolveLanguage(search = '', stored = null) {
  const requested = new URLSearchParams(search).get('lang');
  return ['zh','en'].includes(requested) ? requested : stored === 'en' ? 'en' : 'zh';
}
let savedLanguage = null;
try { savedLanguage = globalThis.localStorage?.getItem(LANGUAGE_KEY); } catch {}
let currentLanguage = resolveLanguage(globalThis.location?.search, savedLanguage);
export const getLanguage = () => currentLanguage;
export function setLanguage(language) {
  currentLanguage = language === 'en' ? 'en' : 'zh';
  try { globalThis.localStorage?.setItem(LANGUAGE_KEY, currentLanguage); } catch {}
  return currentLanguage;
}
/** Source-language keys keep messages readable; positional arguments are never translated. */
export function t(message, values = []) {
  const format = currentLanguage === 'en' ? EN_MESSAGES[message] ?? message : message;
  return format.replace(/\{(\d+)\}/g, (token,index) => index < values.length ? String(values[index]) : token);
}
const sourceText = new WeakMap(), sourceAttributes = new WeakMap();
/** Explicit lifecycle call, not a page-wide mutation observer. Never touches inputs or user filenames. */
export function translateTree(root) {
  const doc = root.ownerDocument || root;
  const visit = node => {
    if(node.nodeType === 3) {
      const original = sourceText.get(node) ?? node.nodeValue;
      sourceText.set(node,original);
      const content = original.trim();
      if(Object.hasOwn(EN_MESSAGES,content)) node.nodeValue = original.replace(content,t(content));
      return;
    }
    if(node.nodeType === 1) {
      if(['SCRIPT','STYLE','TEXTAREA','CODE'].includes(node.tagName) || node.hasAttribute('data-no-i18n')) return;
      let values = sourceAttributes.get(node);
      if(!values) { values = Object.fromEntries(['title','aria-label','placeholder'].filter(a=>node.hasAttribute(a)).map(a=>[a,node.getAttribute(a)])); sourceAttributes.set(node,values); }
      for(const [name,value] of Object.entries(values)) node.setAttribute(name,t(value));
      // A text input's value, option value, ID, path or custom tag is never translated.
    }
    for(const child of node.childNodes || []) visit(child);
  };
  visit(root);
  if(root.nodeType === 9 && doc.documentElement) doc.documentElement.lang = currentLanguage === 'en' ? 'en' : 'zh-CN';
}
export function localizeHTML(markup) {
  if(currentLanguage !== 'en' || !globalThis.document) return markup;
  const template=document.createElement('template'); template.innerHTML=markup;
  translateTree(template.content); return template.innerHTML;
}
export function initializeLocale(doc = document) {
  setLanguage(currentLanguage);
  translateTree(doc);
  // URL propagation also works when browser storage is disabled, including file:// usage.
  for(const link of doc.querySelectorAll('a[href]')) {
    const href=link.getAttribute('href');
    const url=new URL(href,doc.baseURI), name=url.pathname.split('/').pop();
    if(!/^(index|lod|wireframe|pointcloud)\.html$/.test(name))continue;
    url.searchParams.set('lang',currentLanguage);
    link.setAttribute('href',name + url.search + url.hash);
  }
}
