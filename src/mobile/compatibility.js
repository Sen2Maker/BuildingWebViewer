// Bundled only into Android assets; no network/CDN dependency.
import 'core-js/stable';
import ResizeObserverFallback from 'resize-observer-polyfill';
import AbortControllerFallback from 'abort-controller/dist/abort-controller.mjs';
if (!globalThis.ResizeObserver) globalThis.ResizeObserver = ResizeObserverFallback;
if (!globalThis.AbortController) globalThis.AbortController = AbortControllerFallback;
for (const type of [Element, Document, DocumentFragment]) {
  if (!type.prototype.replaceChildren) Object.defineProperty(type.prototype, 'replaceChildren', {configurable:true,writable:true,value:function(...nodes) {
    const fragment = (this.ownerDocument || this).createDocumentFragment();
    for (const node of nodes) fragment.appendChild(typeof node === 'object' && node !== null ? node : (this.ownerDocument || this).createTextNode(String(node)));
    while (this.firstChild) this.removeChild(this.firstChild);
    this.appendChild(fragment);
  }});
}
if (!Element.prototype.toggleAttribute) Object.defineProperty(Element.prototype,'toggleAttribute',{configurable:true,writable:true,value:function(name,force) {
  const enabled = arguments.length > 1 ? Boolean(force) : !this.hasAttribute(name);
  if (enabled) this.setAttribute(name,''); else this.removeAttribute(name);
  return enabled;
}});
function readBlob(blob, method) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || Error('File read failed'));
    reader.onabort = () => reject(new DOMException('File read cancelled','AbortError'));
    reader[method](blob);
  });
}
if (!Blob.prototype.arrayBuffer) Object.defineProperty(Blob.prototype,'arrayBuffer',{configurable:true,writable:true,value:function(){return readBlob(this,'readAsArrayBuffer');}});
if (!Blob.prototype.text) Object.defineProperty(Blob.prototype,'text',{configurable:true,writable:true,value:function(){return readBlob(this,'readAsText');}});
if (!Blob.prototype.stream && globalThis.ReadableStream) Object.defineProperty(Blob.prototype,'stream',{configurable:true,writable:true,value:function(){
  const blob=this;let offset=0;
  return new ReadableStream({async pull(controller){if(offset>=blob.size){controller.close();return;}const end=Math.min(blob.size,offset+262144);controller.enqueue(new Uint8Array(await blob.slice(offset,end).arrayBuffer()));offset=end;}});
}});
