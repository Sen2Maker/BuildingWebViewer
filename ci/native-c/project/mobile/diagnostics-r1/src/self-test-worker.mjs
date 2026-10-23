/* Local, test-only worker. No network, storage, imports or production updater access. */
const addWasm = new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11]);
self.addEventListener('message', async event => {
  const {runId, bytes} = event.data || {};
  if (!/^selftest-[a-f0-9-]{36}$/.test(runId || '') || !(bytes instanceof ArrayBuffer) || bytes.byteLength !== 4096) return;
  try {
    const {instance} = await WebAssembly.instantiate(addWasm);
    const fixture = new Uint8Array(bytes);
    let sum = 0; for (const byte of fixture) sum += byte;
    self.postMessage({runId, wasmValue: instance.exports.add(19, 23), sum, length: fixture.length});
  } catch { self.postMessage({runId, failed: true}); }
});
