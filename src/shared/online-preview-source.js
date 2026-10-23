import { normalizePublicUrl, fetchBounded } from './online-preview-core.js';
/** Provider classification never implies that an owner-only file is public. */
export function classifyPreviewSource(value) {
  const url=normalizePublicUrl(value), parsed=new URL(url);
  if(parsed.hostname==='drive.google.com') {
    const fileId=parsed.pathname==='/uc'?parsed.searchParams.get('id'):null;
    if(!fileId||! /^[A-Za-z0-9_-]{1,200}$/.test(fileId))throw Error('Use a Google Drive file sharing URL, not a folder or login page');
    return {provider:'google-drive',fileId};
  }
  return {provider:'https',url};
}
/** No Drive credentials or proxy is shipped. A future approved Drive adapter must
 * use its explicit deployment configuration, never a key from a share descriptor.
 */
export function requirePreviewSource(value){
  const source=classifyPreviewSource(value);
  if(source.provider==='google-drive')throw Error('Google Drive anonymous reader is not configured. Making a file public alone does not guarantee browser downloads. Use a public CORS-enabled HTTPS raw-data URL for now. / 谷歌硬盘匿名读取尚未配置；公开分享不等于浏览器可下载。当前请使用允许跨域的公开 HTTPS 数据直链。');
  return source;
}
export async function fetchPreviewSource(value,options = {}) {
  const source=requirePreviewSource(value);
  const {signal, timeoutMs = 60000, ...rest} = options;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw Error('Preview timeout must be between 1 and 120000 ms');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once:true});
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await fetchBounded(source.url, {...rest, signal:controller.signal});
  } catch (error) {
    if (timedOut) { const timeout = Error('Online download timed out. Retry or choose a smaller resource. / 在线下载超时，请重试或选择更小的数据。'); timeout.code='PREVIEW_TIMEOUT'; throw timeout; }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
