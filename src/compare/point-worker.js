import { readPointCloud } from '../cloud/point-io.js';

/** One short-lived worker per selected cloud. Its owner terminates it on newer
 * navigation/disposal; the generation ID also rejects late queued messages. */
export async function parseComparisonCloudMessage(message, post, parse = readPointCloud) {
  if (message?.type !== 'parse') return;
  const {id, buffer, filename, maxPoints} = message;
  try {
    if (!(buffer instanceof ArrayBuffer)) throw Error('Point-cloud worker requires file bytes');
    if (!Number.isSafeInteger(maxPoints) || maxPoints < 1 || maxPoints > 1000000) throw Error('Point-cloud worker limit must be between 1 and 1000000');
    const cloud = await parse(new File([buffer], filename), {
      maxPoints,
      onProgress: progress => post({type: 'progress', id, progress}),
    });
    // All parser output arrays are transferred once, including original-row
    // sampling indices and scalar fields. Shared backing buffers are deduplicated.
    const buffers = new Set();
    const visit = value => {
      if (ArrayBuffer.isView(value)) { if (value.buffer instanceof ArrayBuffer) buffers.add(value.buffer); }
      else if (value && typeof value === 'object') for (const item of Object.values(value)) visit(item);
    };
    visit(cloud);
    post({type: 'result', id, cloud}, [...buffers]);
  } catch (error) {
    post({type: 'error', id, error: {name: error?.name || 'Error', message: error?.message || String(error)}});
  }
}

if (typeof globalThis.postMessage === 'function' && typeof globalThis.document === 'undefined') {
  globalThis.onmessage = event => parseComparisonCloudMessage(event.data, (message, transfers = []) => globalThis.postMessage(message, transfers));
}
