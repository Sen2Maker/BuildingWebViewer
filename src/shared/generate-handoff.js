import { t } from './i18n.js';

const GEN_DB = 'BuildingWebViewer.generate';
const GEN_STORE = 'handoff';

function genOpenDb() {
  if (!globalThis.indexedDB) return Promise.reject(Error(t('当前环境不能把点云交给查看器，请改用导出 PLY。')));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(GEN_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(GEN_STORE)) db.createObjectStore(GEN_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || Error(t('当前环境不能把点云交给查看器，请改用导出 PLY。')));
  });
}

/** Local handoff from the generator page to the point-cloud viewer. One record, replaced on each send. */
export async function genSaveHandoff(files) {
  if (!Array.isArray(files) || !files.length || files.some(file => typeof file?.name !== 'string' || !(file.buffer instanceof ArrayBuffer))) throw Error(t('没有可送出的点云'));
  const db = await genOpenDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(GEN_STORE, 'readwrite');
      tx.objectStore(GEN_STORE).put({files, savedAt: Date.now()}, 'latest');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || Error(t('当前环境不能把点云交给查看器，请改用导出 PLY。')));
    });
  } finally { db.close(); }
}

export async function genTakeHandoff() {
  const db = await genOpenDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(GEN_STORE, 'readwrite');
      const store = tx.objectStore(GEN_STORE);
      const request = store.get('latest');
      let record = null;
      request.onsuccess = () => {
        record = request.result || null;
        if (record) store.delete('latest');
      };
      request.onerror = () => reject(request.error || Error(t('当前环境不能把点云交给查看器，请改用导出 PLY。')));
      tx.oncomplete = () => resolve(record?.files || null);
      tx.onerror = () => reject(tx.error || Error(t('当前环境不能把点云交给查看器，请改用导出 PLY。')));
    });
  } finally { db.close(); }
}
