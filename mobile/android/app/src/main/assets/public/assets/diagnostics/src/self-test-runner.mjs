import {createWorkerProbe} from './browser-worker-adapter.mjs';

export const STATUS = Object.freeze({PASS:'PASS', FAIL:'FAIL', UNSUPPORTED:'UNSUPPORTED', NOT_RUN:'NOT_RUN', CANCELLED:'CANCELLED'});
export const DEFAULT_LIMITS = Object.freeze({runMs:60000, caseMs:8000, cleanupMs:5000, scratchBytes:4194304, assetBytes:65536, reportBytes:65536});
export const CASES = Object.freeze([
  ['web.environment', '网页运行环境'], ['native.runtime', 'APK、Android 与 WebView 版本'],
  ['native.bridge', '原生桥接往返与会话一致性'], ['native.filesystem', '真实文件系统能力'],
  ['native.scratchStore', '隔离项目存储读写与恢复'], ['runtime.assets', '网页与着色器资源根一致性'],
  ['web.workerWasm', 'Worker、数据转移与 WASM 执行'], ['fixture.crypto', '隔离签名与篡改拒绝'],
  ['manual.install', '安装权限与系统安装确认'], ['manual.touch', '真实触控与视觉检查'], ['manual.powerLoss', '断电与系统杀进程恢复']
].map(([id,title]) => Object.freeze({id,title,manual:id.startsWith('manual.')})));
let realmLease = null;
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const digestRE = /^[a-f0-9]{64}$/;
const rootIdentity = value => value === 'asset:public' || digestRE.test(value || '');
const token = (value, max = 100) => typeof value === 'string' && value.length <= max && /^[A-Za-z0-9_.:+ -]+$/.test(value) ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const bool = value => typeof value === 'boolean' ? value : null;
const now = () => performance.now();
const result = (status, code, evidence = {}) => ({status, code, evidence});
class Stop extends Error { constructor(code) { super(code); this.code = code; } }
function metadata(raw) {
  if (!raw || raw.platform !== 'android') throw new Stop('INVALID_NATIVE_EVIDENCE');
  const data = {
    platform:'android', apkPackage:token(raw.apkPackage), apkVersion:token(raw.apkVersion), apkVersionCode:count(raw.apkVersionCode),
    apkBuildSha256:digestRE.test(raw.apkBuildSha256 || '') ? raw.apkBuildSha256 : null,
    androidRelease:token(raw.androidRelease), androidApi:count(raw.androidApi),
    webviewPackage:token(raw.webviewPackage), webviewVersion:token(raw.webviewVersion), nativeApi:count(raw.nativeApi),
    contentId:digestRE.test(raw.contentId || '') ? raw.contentId : null, fixtureOnly:bool(raw.fixtureOnly)
  };
  if (!data.apkPackage || !data.apkVersion || data.apkVersionCode === null || !data.androidRelease || data.androidApi === null || data.nativeApi === null) throw new Stop('INVALID_NATIVE_EVIDENCE');
  return data;
}
function snapshot(raw) {
  if (!raw || typeof raw.sessionId !== 'string' || raw.sessionId.length > 160 || !raw.sessionId ||
      !digestRE.test(raw.contentId || '') || !rootIdentity(raw.webRootIdentity) || !rootIdentity(raw.shaderRootIdentity) || count(raw.nativeApi) === null) throw new Stop('INVALID_RUNTIME_SNAPSHOT');
  // Session ID is retained only in memory for comparison, never copied into a report.
  return {sessionId:raw.sessionId, contentId:raw.contentId, webRootIdentity:raw.webRootIdentity, shaderRootIdentity:raw.shaderRootIdentity, nativeApi:raw.nativeApi};
}
function sameSnapshot(a,b) { return ['sessionId','contentId','webRootIdentity','shaderRootIdentity','nativeApi'].every(key => a[key] === b[key]); }
function nativePresent(env) { return env.native && typeof env.native.openRun === 'function'; }
export function summarize(cases, cleanup = 'NOT_NEEDED') {
  const counts = Object.fromEntries(Object.values(STATUS).map(status => [status, cases.filter(item => item.status === status).length]));
  const automatic = cases.filter(item => !item.manual);
  return {counts, automaticOutcome:cleanup === 'FAILED' || automatic.some(item => item.status === STATUS.FAIL) ? 'FAILED' : automatic.some(item => item.status === STATUS.CANCELLED) ? 'CANCELLED' : automatic.every(item => item.status === STATUS.PASS) && !['PENDING','UNVERIFIED'].includes(cleanup) ? 'PASSED' : 'INCOMPLETE', manualAcceptance:'NOT_ASSESSED'};
}
export function serializeReport(report) {
  const serialized = JSON.stringify(report, null, 2);
  if (new TextEncoder().encode(serialized).byteLength > DEFAULT_LIMITS.reportBytes) throw new Error('REPORT_TOO_LARGE');
  return serialized;
}

/** Pure orchestration. Native adapters own scratch allocation and enforce an app-wide lease. */
export class SelfTestRunner {
  constructor(environment = {}, limits = {}) {
    this.environment = environment;
    this.limits = {...DEFAULT_LIMITS};
    for (const key of ['runMs','caseMs','cleanupMs']) if (limits[key] !== undefined) {
      if (!Number.isInteger(limits[key]) || limits[key] < 1 || limits[key] > DEFAULT_LIMITS[key]) throw new Error('INVALID_LIMIT');
      this.limits[key] = limits[key];
    }
    Object.freeze(this.limits);
    this.active = null; this.lastReport = null; this.listeners = new Set();
  }
  get busy() { return this.active !== null; }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(type, report) { for (const listener of this.listeners) { try { listener({type, report}); } catch { /* UI failure must not alter test outcome. */ } } }
  cancel() { if (!this.active || this.active.controller.signal.aborted) return false; this.active.controller.abort('USER_CANCELLED'); return true; }
  report(state) {
    const report = {schemaVersion:1, runnerVersion:'0.1.0-proposal', runId:state.id, startedAt:state.startedAt,
      finishedAt:state.finishedAt || null, durationMs:Math.max(0,Math.round(now()-state.start)), state:state.phase,
      execution:state.metadata ? 'ANDROID_ADAPTER' : 'WEB_OR_HOST_ONLY', environment:state.metadata || {platform:this.environment.hostKind === 'node' ? 'node' : 'browser'},
      limits:this.limits, cleanup:state.cleanup, cases:state.results, summary:summarize(state.results,state.cleanup),
      policy:{network:'FORBIDDEN',automaticUpload:'FORBIDDEN',userProjectAccess:'FORBIDDEN',productionTrustChanges:'FORBIDDEN',installation:'MANUAL_ONLY',powerLoss:'MANUAL_ONLY'},
      verification:'CASE_EVIDENCE_ONLY_NOT_RELEASE_ACCEPTANCE'};
    const copy = freeze(clone(report)); serializeReport(copy); this.lastReport = copy; return copy;
  }
  async run() {
    if (realmLease !== null || this.active) throw new Error('SELF_TEST_ALREADY_RUNNING');
    const cryptoAPI = this.environment.crypto || globalThis.crypto;
    if (!cryptoAPI?.randomUUID) throw new Error('SECURE_RUN_ID_UNAVAILABLE');
    const state = {id:`selftest-${cryptoAPI.randomUUID()}`, start:now(), startedAt:new Date().toISOString(), controller:new AbortController(),
      phase:'RUNNING', pending:new Set(), cleanup:'NOT_NEEDED', results:CASES.map(item => ({...item,...result(STATUS.NOT_RUN,item.manual?'MANUAL_REQUIRED':'PENDING'),durationMs:0})), nativeHandle:null, metadata:null, runtime:null};
    this.active = state; realmLease = state.id;
    const timer = setTimeout(() => state.controller.abort('RUN_TIMEOUT'), this.limits.runMs);
    const signal = state.controller.signal;
    const context = () => ({runId:state.id, signal, limits:{...this.limits}, deadlineInMs:Math.max(0,this.limits.runMs-(now()-state.start))});
    const invoke = async (operation, ms = this.limits.caseMs, useRunSignal = true) => {
      const local = new AbortController();
      const abort = () => local.abort(signal.reason || 'USER_CANCELLED');
      if (useRunSignal) { if (signal.aborted) abort(); else signal.addEventListener('abort',abort,{once:true}); }
      let timeout;
      const pending = Promise.resolve().then(() => { if (local.signal.aborted) throw new Stop(String(local.signal.reason)); return operation({...context(),signal:local.signal}); });
      state.pending.add(pending); pending.then(() => state.pending.delete(pending), () => state.pending.delete(pending));
      const stopped = new Promise((_,reject) => {
        if (local.signal.aborted) { reject(new Stop(String(local.signal.reason))); return; }
        local.signal.addEventListener('abort',()=>reject(new Stop(String(local.signal.reason))),{once:true});
        timeout=setTimeout(()=>local.abort('CASE_TIMEOUT'),ms);
      });
      try { return await Promise.race([pending,stopped]); }
      finally { clearTimeout(timeout); signal.removeEventListener('abort',abort); }
    };
    const native = this.environment.native;
    const unavailable = () => result(STATUS.UNSUPPORTED,'NATIVE_ADAPTER_UNAVAILABLE');
    const needNative = () => nativePresent(this.environment) && state.nativeHandle !== null;
    const operations = {
      'web.environment': async () => result(STATUS.PASS,'ENVIRONMENT_OBSERVED',{workerAvailable:typeof globalThis.Worker === 'function', wasmAvailable:typeof WebAssembly === 'object', secureContext:globalThis.isSecureContext === true, hostKind:this.environment.hostKind === 'node'?'node':'browser'}),
      'native.runtime': async () => {
        if (!nativePresent(this.environment)) return unavailable();
        state.cleanup='PENDING';
        const opened = await invoke(async ctx => {
          const handle = await native.openRun(ctx);
          // Record a late handle only for cleanup; never convert a cancelled case to PASS.
          state.nativeHandle = handle;
          return handle;
        });
        if (!opened) throw new Stop('INVALID_NATIVE_HANDLE');
        const reply = await invoke(ctx => native.runtimeSnapshot({...ctx,handle:opened}));
        const observed = metadata(reply.environment), runtime = snapshot(reply.runtime);
        if (observed.nativeApi !== runtime.nativeApi || (observed.contentId && observed.contentId !== runtime.contentId)) throw new Stop('NATIVE_METADATA_MISMATCH');
        state.metadata = observed; state.runtime = runtime;
        return result(STATUS.PASS,'NATIVE_RUNTIME_OBSERVED',{apkBuildIdentityAvailable:observed.apkBuildSha256!==null, webviewObserved:observed.webviewVersion!==null});
      },
      'native.bridge': async () => {
        if (!needNative()) return unavailable(); if (!state.runtime) return result(STATUS.NOT_RUN,'RUNTIME_SNAPSHOT_REQUIRED');
        if (typeof native.roundTrip !== 'function') return result(STATUS.UNSUPPORTED,'BRIDGE_PROBE_UNAVAILABLE');
        const challenge=cryptoAPI.randomUUID();
        const reply=await invoke(ctx=>native.roundTrip({...ctx,handle:state.nativeHandle,challenge}));
        if (reply?.runId!==state.id || reply.challenge!==challenge || !sameSnapshot(state.runtime,snapshot(reply.runtime))) throw new Stop('BRIDGE_SNAPSHOT_MISMATCH');
        return result(STATUS.PASS,'BRIDGE_ROUNDTRIP_VERIFIED',{runIdMatched:true, challengeMatched:true, snapshotMatched:true});
      },
      'native.filesystem': async () => {
        if (!needNative()) return unavailable();
        if (typeof native.probeFilesystem!=='function') return result(STATUS.UNSUPPORTED,'FILESYSTEM_PROBE_UNAVAILABLE');
        const reply=await invoke(ctx=>native.probeFilesystem({...ctx,handle:state.nativeHandle}));
        if (reply?.failureCode !== undefined) {
          const stages = ['ROOT','CREATE_TREE','WRITE_FILE','EXCLUSIVE_CREATE','HARD_LINK','SYMBOLIC_LINK','DIRECTORY_STREAM','SECURE_READ','FILE_NOFOLLOW','DIRECTORY_NOFOLLOW','ATOMIC_RENAME','DIRECTORY_FORCE','CLEANUP'];
          if (!stages.some(stage => reply.failureCode === `FILESYSTEM_PROBE_${stage}`)) throw new Stop('INVALID_PROVIDER_EVIDENCE');
          throw new Stop(reply.failureCode);
        }
        const evidence={providerClass:token(reply?.providerClass),directoryStreamClass:token(reply?.directoryStreamClass)};
        if (!evidence.providerClass || !evidence.directoryStreamClass) throw new Stop('INVALID_PROVIDER_EVIDENCE');
        for (const key of ['secureTraversal','unixLinkCount','fileNoFollow','directoryNoFollow','exclusiveCreation','atomicRename','directoryForce']) {
          if (bool(reply[key])===null) throw new Stop('INVALID_PROVIDER_EVIDENCE'); evidence[key]=reply[key];
        }
        const supported=Object.values(evidence).every(value=>value!==false);
        return result(supported?STATUS.PASS:STATUS.UNSUPPORTED,supported?'PROVIDER_CAPABILITIES_OBSERVED':'REQUIRED_PROVIDER_CAPABILITY_MISSING',evidence);
      },
      'native.scratchStore': async () => {
        if (!needNative()) return unavailable();
        if (typeof native.probeScratchStore!=='function') return result(STATUS.UNSUPPORTED,'SCRATCH_STORE_ADAPTER_UNAVAILABLE');
        const reply=await invoke(ctx=>native.probeScratchStore({...ctx,handle:state.nativeHandle})); const evidence={};
        for (const key of ['scratchRootChecked','contextFilesIsolated','contextCacheIsolated','applicationContextIsolated','created','reopened','stateRoundtrip','backupRestored','cleanupVerified']) {
          if (bool(reply?.[key])===null) throw new Stop('INVALID_STORE_EVIDENCE'); evidence[key]=reply[key];
        }
        if (Object.values(evidence).some(value=>value!==true)) return result(STATUS.FAIL,'SCRATCH_STORE_INVARIANT_FAILED',evidence);
        return result(STATUS.PASS,'ISOLATED_STORE_FIXTURE_VERIFIED',evidence);
      },
      'runtime.assets': async () => {
        if (!state.runtime) return result(nativePresent(this.environment)?STATUS.NOT_RUN:STATUS.UNSUPPORTED,'RUNTIME_SNAPSHOT_REQUIRED');
        if (typeof this.environment.readAsset!=='function') return result(STATUS.UNSUPPORTED,'ASSET_READER_UNAVAILABLE');
        for (const [kind,identity,expected] of [['web-canary',state.runtime.webRootIdentity,'bwv-selftest:v1:web\n'],['shader-canary',state.runtime.shaderRootIdentity,'// bwv-selftest:v1:shader\n']]) {
          const reply=await invoke(ctx=>this.environment.readAsset({...ctx,handle:state.nativeHandle,kind,maxBytes:this.limits.assetBytes}));
          if (reply?.rootIdentity!==identity || !(reply.bytes instanceof Uint8Array) || reply.bytes.byteLength>this.limits.assetBytes || new TextDecoder().decode(reply.bytes)!==expected) throw new Stop('ASSET_ROOT_OR_CONTENT_MISMATCH');
        }
        return result(STATUS.PASS,'PINNED_ROOT_CANARIES_VERIFIED',{webRootMatched:true,shaderRootMatched:true,webContentVerified:true,shaderContentVerified:true});
      },
      'web.workerWasm': async () => {
        const probe=this.environment.workerProbe===undefined?createWorkerProbe():this.environment.workerProbe;
        if (typeof probe!=='function') return result(STATUS.UNSUPPORTED,'WORKER_OR_WASM_UNAVAILABLE');
        const reply=await invoke(probe);
        if (reply?.wasmValue!==42 || reply.fixtureBytes!==4096 || reply.sum!==522240 || reply.transferred!==true) throw new Stop('WORKER_WASM_RESULT_MISMATCH');
        return result(STATUS.PASS,'REAL_WORKER_WASM_EXECUTED',{wasmValue:42,fixtureBytes:4096,transferred:true,executionHost:this.environment.hostKind==='node'?'node':'browser'});
      },
      'fixture.crypto': async () => {
        if (!cryptoAPI?.subtle) return result(STATUS.UNSUPPORTED,'WEBCRYPTO_UNAVAILABLE');
        return invoke(async ctx=>{
          const algorithm={name:'ECDSA',namedCurve:'P-256'}, sign={name:'ECDSA',hash:'SHA-256'};
          const pair=await cryptoAPI.subtle.generateKey(algorithm,false,['sign','verify']);
          const wrong=await cryptoAPI.subtle.generateKey(algorithm,false,['sign','verify']);
          if (ctx.signal.aborted) throw new Stop(String(ctx.signal.reason));
          const bytes=new TextEncoder().encode('BWV isolated self-test fixture v1');
          const signature=await cryptoAPI.subtle.sign(sign,pair.privateKey,bytes), tampered=bytes.slice(); tampered[0]^=1;
          const valid=await cryptoAPI.subtle.verify(sign,pair.publicKey,signature,bytes);
          const rejectTamper=!(await cryptoAPI.subtle.verify(sign,pair.publicKey,signature,tampered));
          const rejectWrongKey=!(await cryptoAPI.subtle.verify(sign,wrong.publicKey,signature,bytes));
          if (!valid || !rejectTamper || !rejectWrongKey) throw new Stop('CRYPTO_FIXTURE_FAILED');
          return result(STATUS.PASS,'ISOLATED_CRYPTO_PRIMITIVE_VERIFIED',{validSignature:true,rejectedTamper:true,rejectedWrongKey:true,productionManifestVerifierTested:false});
        });
      }
    };
    try {
      for (let index=0;index<state.results.length;index++) {
        const item=state.results[index]; if (item.manual) continue;
        if (signal.aborted) { item.status=signal.reason==='USER_CANCELLED'?STATUS.CANCELLED:STATUS.NOT_RUN;item.code=signal.reason==='USER_CANCELLED'?'USER_CANCELLED':'RUN_TIMEOUT';continue; }
        if (state.pending.size) { item.code='EARLIER_OPERATION_UNSETTLED';continue; }
        this.emit('progress',this.report(state)); const started=now();
        try { Object.assign(item,await operations[item.id]()); }
        catch (error) { const code=error instanceof Stop?error.code:'OPERATION_FAILED';Object.assign(item,result(code==='USER_CANCELLED'?STATUS.CANCELLED:STATUS.FAIL,code)); }
        item.durationMs=Math.max(0,Math.round(now()-started));this.emit('progress',this.report(state));
      }
    } finally { clearTimeout(timer); }
    const settle = async () => {
      if (state.pending.size) await Promise.allSettled([...state.pending]);
      if (state.nativeHandle!==null && typeof native?.closeRun==='function') {
        try { const reply=await invoke(ctx=>native.closeRun({...ctx,handle:state.nativeHandle}),this.limits.cleanupMs,false);state.cleanup=reply?.removed===true?'VERIFIED':'FAILED'; }
        catch { state.cleanup='FAILED'; }
        if (state.pending.size) await Promise.allSettled([...state.pending]);
      } else if (state.cleanup!=='NOT_NEEDED') state.cleanup=state.nativeHandle===null?'UNVERIFIED':'FAILED';
      state.phase='FINISHED';state.finishedAt=new Date().toISOString();
      if (this.active===state) this.active=null; if (realmLease===state.id) realmLease=null;
      this.emit('finished',this.report(state));
    };
    if (state.pending.size) {
      state.phase='QUARANTINED';const report=this.report(state);this.emit('quarantined',report);
      // Lock stays held. There is no new run or scratch cleanup until all actual operations settle.
      void settle(); return report;
    }
    const completion=settle();
    // Cleanup has its own bounded visible wait; a non-cooperative adapter stays quarantined.
    let visibleTimer; const visible=new Promise(resolve=>{visibleTimer=setTimeout(()=>resolve(false),this.limits.cleanupMs+5);});
    const completed=await Promise.race([completion.then(()=>true),visible]);clearTimeout(visibleTimer);
    if (!completed) { state.phase='QUARANTINED';const report=this.report(state);this.emit('quarantined',report);return report; }
    return this.lastReport;
  }
}
