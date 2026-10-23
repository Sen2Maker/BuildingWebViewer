import {parentPort} from 'node:worker_threads';
globalThis.self={addEventListener(type,handler){if(type==='message')parentPort.on('message',data=>handler({data}));},postMessage(data){parentPort.postMessage(data);}};
await import('../src/self-test-worker.mjs');
