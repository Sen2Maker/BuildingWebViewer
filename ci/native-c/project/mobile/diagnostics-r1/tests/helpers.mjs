import {Worker} from 'node:worker_threads';
import {createWorkerProbe} from '../src/browser-worker-adapter.mjs';
export class ActualNodeWorker {
  constructor(){this.worker=new Worker(new URL('./node-worker-wrapper.mjs',import.meta.url));this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}
  postMessage(data,transfer){this.worker.postMessage(data,transfer);}
  terminate(){return this.worker.terminate();}
}
export const realHostWorkerProbe=createWorkerProbe(ActualNodeWorker);
export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
export const fixtureSnapshot={sessionId:'IN_MEMORY_ONLY',contentId:'a'.repeat(64),webRootIdentity:'b'.repeat(64),shaderRootIdentity:'c'.repeat(64),nativeApi:13};
// Simulated native adapter is unit-test scaffolding only. Never packaged or exported as device evidence.
export function simulatedNative(overrides={}) {
  const calls=[];
  const adapter={
    async openRun(ctx){calls.push('open');return {runId:ctx.runId};},
    async runtimeSnapshot(){return {environment:{platform:'android',apkPackage:'unit.test.fixture',apkVersion:'0.0.0-test',apkVersionCode:1,apkBuildSha256:'d'.repeat(64),androidRelease:'SIMULATED',androidApi:35,webviewPackage:'test.webview',webviewVersion:'0.0',nativeApi:13,contentId:'a'.repeat(64)},runtime:{...fixtureSnapshot}};},
    async roundTrip(ctx){return {runId:ctx.runId,challenge:ctx.challenge,runtime:{...fixtureSnapshot}};},
    async probeFilesystem(){return {providerClass:'test.SimulatedProvider',directoryStreamClass:'test.SimulatedStream',secureTraversal:true,unixLinkCount:true,fileNoFollow:true,directoryNoFollow:true,exclusiveCreation:true,atomicRename:true,directoryForce:true};},
    async probeScratchStore(){return Object.fromEntries(['scratchRootChecked','contextFilesIsolated','contextCacheIsolated','applicationContextIsolated','created','reopened','stateRoundtrip','backupRestored','cleanupVerified'].map(key=>[key,true]));},
    async closeRun(){calls.push('close');return {removed:true};},...overrides
  };
  return {adapter,calls};
}
export const canaryReader=async({kind})=>({rootIdentity:kind==='web-canary'?fixtureSnapshot.webRootIdentity:fixtureSnapshot.shaderRootIdentity,bytes:new TextEncoder().encode(kind==='web-canary'?'bwv-selftest:v1:web\n':'// bwv-selftest:v1:shader\n')});
export const find=(report,id)=>report.cases.find(item=>item.id===id);
