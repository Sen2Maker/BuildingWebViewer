/* Constructor injection exists only for host tests; installed Android uses its real Worker. */
export function createWorkerProbe(WorkerClass = globalThis.Worker) {
  if (typeof WorkerClass !== 'function' || typeof WebAssembly !== 'object') return null;
  return ({runId, signal}) => new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    let worker;
    const finish = (error, value) => {
      signal.removeEventListener('abort', cancel);
      if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); }
      error ? reject(error) : resolve(value);
    };
    const cancel = () => finish(new DOMException('Cancelled', 'AbortError'));
    try {
      worker = new WorkerClass(new URL('./self-test-worker.mjs', import.meta.url), {type: 'module', name: 'bwv-selftest'});
      signal.addEventListener('abort', cancel, {once: true});
      worker.onerror = () => finish(new Error('WORKER_FAILED'));
      worker.onmessage = event => {
        const reply = event.data;
        if (!reply || reply.runId !== runId) return; // Never accept stale/cross-run completions.
        if (reply.failed || reply.wasmValue !== 42 || reply.sum !== 522240 || reply.length !== 4096) {
          finish(new Error('WORKER_RESULT_MISMATCH')); return;
        }
        finish(null, {wasmValue: 42, fixtureBytes: 4096, sum: 522240, transferred: bytes.byteLength === 0});
      };
      const bytes = new ArrayBuffer(4096); const view = new Uint8Array(bytes);
      for (let i = 0; i < view.length; i++) view[i] = i & 255;
      worker.postMessage({runId, bytes}, [bytes]);
    } catch (error) { finish(error); }
  });
}
