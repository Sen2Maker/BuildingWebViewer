import test from 'node:test';
import assert from 'node:assert/strict';
import {SelfTestRunner,STATUS,serializeReport} from '../src/self-test-runner.mjs';
import {realHostWorkerProbe,simulatedNative,canaryReader,find,delay,deferred} from './helpers.mjs';
const host=extra=>({hostKind:'node',workerProbe:null,...extra});

test('host execution never invents Android evidence or a complete acceptance pass',async()=>{
  const report=await new SelfTestRunner(host()).run();
  assert.equal(report.environment.platform,'node');assert.equal(report.execution,'WEB_OR_HOST_ONLY');
  for(const id of ['native.runtime','native.bridge','native.filesystem','native.scratchStore','runtime.assets'])assert.equal(find(report,id).status,STATUS.UNSUPPORTED);
  assert.equal(report.summary.automaticOutcome,'INCOMPLETE');assert.equal(report.summary.manualAcceptance,'NOT_ASSESSED');
  for(const id of ['manual.install','manual.touch','manual.powerLoss'])assert.equal(find(report,id).status,STATUS.NOT_RUN);
  assert.equal(report.cleanup,'NOT_NEEDED');assert.ok(Object.isFrozen(report.cases[0]));
});
test('actual Node worker executes bundled WASM and transferred fixture, explicitly host-only',async()=>{
  const report=await new SelfTestRunner(host({workerProbe:realHostWorkerProbe})).run();
  assert.equal(find(report,'web.workerWasm').status,STATUS.PASS);assert.equal(find(report,'web.workerWasm').evidence.executionHost,'node');
  assert.equal(find(report,'native.runtime').status,STATUS.UNSUPPORTED);
});
test('real WebCrypto fixture accepts signature, rejects tamper and wrong key without testing production trust',async()=>{
  const report=await new SelfTestRunner(host()).run();const item=find(report,'fixture.crypto');
  assert.equal(item.status,STATUS.PASS);assert.equal(item.evidence.rejectedTamper,true);assert.equal(item.evidence.rejectedWrongKey,true);assert.equal(item.evidence.productionManifestVerifierTested,false);
});
test('simulated adapter wiring yields all automated passes but manual gates remain unassessed',async()=>{
  const {adapter,calls}=simulatedNative();const report=await new SelfTestRunner(host({native:adapter,readAsset:canaryReader,workerProbe:realHostWorkerProbe})).run();
  assert.equal(report.summary.automaticOutcome,'PASSED');assert.equal(report.summary.manualAcceptance,'NOT_ASSESSED');assert.deepEqual(calls,['open','close']);assert.equal(report.cleanup,'VERIFIED');
});
test('missing filesystem capability is UNSUPPORTED, not PASS or generic failure',async()=>{
  const {adapter}=simulatedNative();const original=adapter.probeFilesystem;adapter.probeFilesystem=async()=>({...await original(),secureTraversal:false});
  const report=await new SelfTestRunner(host({native:adapter})).run();assert.equal(find(report,'native.filesystem').status,STATUS.UNSUPPORTED);
});
test('missing probe observations fail rather than accepting a truthy fabricated summary',async()=>{
  const {adapter}=simulatedNative({probeFilesystem:async()=>({supportsExternalUpdates:true})});
  const report=await new SelfTestRunner(host({native:adapter})).run();assert.equal(find(report,'native.filesystem').status,STATUS.FAIL);
});
test('bridge rejects stale run ID and mismatched immutable runtime snapshot',async()=>{
  const {adapter}=simulatedNative();const original=adapter.roundTrip;adapter.roundTrip=async ctx=>({...await original(ctx),runId:'stale-run'});
  let report=await new SelfTestRunner(host({native:adapter})).run();assert.equal(find(report,'native.bridge').code,'BRIDGE_SNAPSHOT_MISMATCH');
  adapter.roundTrip=async ctx=>{const r=await original(ctx);r.runtime.webRootIdentity='f'.repeat(64);return r;};
  report=await new SelfTestRunner(host({native:adapter})).run();assert.equal(find(report,'native.bridge').status,STATUS.FAIL);
});
test('asset root and canary bytes are checked, not just successful read',async()=>{
  const {adapter}=simulatedNative();const report=await new SelfTestRunner(host({native:adapter,readAsset:async ctx=>({...await canaryReader(ctx),rootIdentity:'f'.repeat(64)})})).run();
  assert.equal(find(report,'runtime.assets').code,'ASSET_ROOT_OR_CONTENT_MISMATCH');
});
test('oversized canary response is rejected',async()=>{
  const {adapter}=simulatedNative();const report=await new SelfTestRunner(host({native:adapter,readAsset:async ctx=>({...await canaryReader(ctx),bytes:new Uint8Array(65537)})})).run();
  assert.equal(find(report,'runtime.assets').status,STATUS.FAIL);
});
test('scratch adapter must prove both files/cache and application context isolation',async()=>{
  const {adapter}=simulatedNative();const original=adapter.probeScratchStore;adapter.probeScratchStore=async()=>({...await original(),applicationContextIsolated:false});
  const report=await new SelfTestRunner(host({native:adapter})).run();assert.equal(find(report,'native.scratchStore').status,STATUS.FAIL);
});
test('raw error messages, extra metadata, session IDs and personal paths never enter report',async()=>{
  const secret='/data/user/0/private-project/secret-token';const {adapter}=simulatedNative();const original=adapter.runtimeSnapshot;
  adapter.runtimeSnapshot=async()=>{const r=await original();r.environment.secret=secret;r.runtime.sessionId=secret;return r;};
  adapter.probeFilesystem=async()=>{throw new Error(secret);};
  const report=await new SelfTestRunner(host({native:adapter})).run();const json=serializeReport(report);assert.ok(!json.includes(secret));assert.ok(!json.includes('IN_MEMORY_ONLY'));assert.equal(find(report,'native.filesystem').code,'OPERATION_FAILED');
});
test('version fields containing paths are rejected rather than leaked',async()=>{
  const {adapter}=simulatedNative();const original=adapter.runtimeSnapshot;adapter.runtimeSnapshot=async()=>{const r=await original();r.environment.apkVersion='/data/private/token';return r;};
  const report=await new SelfTestRunner(host({native:adapter})).run();assert.equal(find(report,'native.runtime').code,'INVALID_NATIVE_EVIDENCE');assert.ok(!serializeReport(report).includes('/data/private'));
});
test('second runner cannot overlap a pending run in the same JS realm',async()=>{
  const pending=deferred();const runner=new SelfTestRunner(host({workerProbe:()=>pending.promise}),{caseMs:1000});const running=runner.run();await delay(5);
  await assert.rejects(new SelfTestRunner(host()).run(),/SELF_TEST_ALREADY_RUNNING/);runner.cancel();const report=await running;assert.equal(report.state,'QUARANTINED');pending.resolve({});await delay(10);assert.equal(runner.busy,false);
});
test('cancel returns promptly, blocks reruns until real settlement and ignores late PASS',async()=>{
  const pending=deferred();const runner=new SelfTestRunner(host({workerProbe:()=>pending.promise}),{caseMs:1000});const running=runner.run();await delay(5);assert.equal(runner.cancel(),true);assert.equal(runner.cancel(),false);
  const report=await running;assert.equal(find(report,'web.workerWasm').status,STATUS.CANCELLED);assert.equal(report.state,'QUARANTINED');assert.equal(runner.busy,true);
  pending.resolve({wasmValue:42,fixtureBytes:4096,sum:522240,transferred:true});await delay(10);
  assert.equal(runner.busy,false);assert.equal(find(runner.lastReport,'web.workerWasm').status,STATUS.CANCELLED);
});
test('timeout is FAIL, and unstarted tests are NOT_RUN, not cancelled or pass',async()=>{
  const pending=deferred();const runner=new SelfTestRunner(host({workerProbe:()=>pending.promise}),{caseMs:10});const report=await runner.run();
  assert.equal(find(report,'web.workerWasm').status,STATUS.FAIL);assert.equal(find(report,'web.workerWasm').code,'CASE_TIMEOUT');assert.equal(find(report,'fixture.crypto').status,STATUS.NOT_RUN);
  pending.resolve({});await delay(10);assert.equal(runner.busy,false);
});
test('whole-run timeout settles to bounded visible report',async()=>{
  const pending=deferred();const runner=new SelfTestRunner(host({workerProbe:()=>pending.promise}),{runMs:10,caseMs:100});const report=await runner.run();
  assert.equal(find(report,'web.workerWasm').code,'RUN_TIMEOUT');assert.equal(report.state,'QUARANTINED');pending.resolve({});await delay(10);
});
test('late openRun handle is retained only for deferred scratch cleanup',async()=>{
  const pending=deferred();const {adapter,calls}=simulatedNative({openRun:()=>pending.promise});const runner=new SelfTestRunner(host({native:adapter}),{caseMs:10});
  const report=await runner.run();assert.equal(report.state,'QUARANTINED');assert.equal(report.cleanup,'PENDING');assert.deepEqual(calls,[]);
  pending.resolve({opaque:'test-only'});await delay(10);assert.deepEqual(calls,['close']);assert.equal(runner.lastReport.cleanup,'VERIFIED');assert.equal(find(runner.lastReport,'native.runtime').status,STATUS.FAIL);
});
test('cleanup failure is explicit and no cleanup is claimed on missing closeRun',async()=>{
  const {adapter}=simulatedNative({closeRun:async()=>({removed:false})});const runner=new SelfTestRunner(host({native:adapter}));let report=await runner.run();assert.equal(report.cleanup,'FAILED');
  delete adapter.closeRun;report=await runner.run();assert.equal(report.cleanup,'FAILED');
});
test('hanging cleanup retains run lock and reports quarantine',async()=>{
  const pending=deferred();const {adapter}=simulatedNative({closeRun:()=>pending.promise});const runner=new SelfTestRunner(host({native:adapter}),{cleanupMs:10});const report=await runner.run();
  assert.equal(report.state,'QUARANTINED');assert.equal(runner.busy,true);pending.resolve({removed:true});await delay(10);assert.equal(runner.busy,false);assert.equal(runner.lastReport.cleanup,'FAILED');
});
test('observer exceptions cannot turn test outcomes into failures',async()=>{
  const runner=new SelfTestRunner(host());runner.subscribe(()=>{throw new Error('UI error');});const report=await runner.run();assert.equal(find(report,'fixture.crypto').status,STATUS.PASS);
});
test('report and time budgets cannot be expanded through options',async()=>{
  assert.throws(()=>new SelfTestRunner({}, {caseMs:999999}),/INVALID_LIMIT/);assert.throws(()=>new SelfTestRunner({}, {runMs:0}),/INVALID_LIMIT/);
  const runner=new SelfTestRunner({}, {scratchBytes:999999999});assert.equal(runner.limits.scratchBytes,4194304);
  assert.throws(()=>serializeReport({data:'x'.repeat(65537)}),/REPORT_TOO_LARGE/);
});
test('cleanup failure prevents an otherwise all-pass automatic summary',async()=>{
  const {adapter}=simulatedNative({closeRun:async()=>({removed:false})});const report=await new SelfTestRunner(host({native:adapter,readAsset:canaryReader,workerProbe:realHostWorkerProbe})).run();
  assert.equal(report.summary.counts.PASS,8);assert.equal(report.summary.automaticOutcome,'FAILED');assert.equal(report.cleanup,'FAILED');
});
test('unsupported WebCrypto stays unsupported, not pass',async()=>{
  const report=await new SelfTestRunner(host({crypto:{randomUUID:()=>globalThis.crypto.randomUUID()}})).run();assert.equal(find(report,'fixture.crypto').status,STATUS.UNSUPPORTED);
});
test('malformed worker reply fails rather than accepting a successful promise',async()=>{
  const report=await new SelfTestRunner(host({workerProbe:async()=>({ok:true})})).run();assert.equal(find(report,'web.workerWasm').status,STATUS.FAIL);
});
test('actual C bundled-root identity asset:public is accepted and fixture-only metadata is preserved',async()=>{
  const {adapter}=simulatedNative();const original=adapter.runtimeSnapshot;adapter.runtimeSnapshot=async()=>{const r=await original();r.runtime.webRootIdentity='asset:public';r.runtime.shaderRootIdentity='asset:public';r.environment.fixtureOnly=true;return r;};
  adapter.roundTrip=async ctx=>({runId:ctx.runId,challenge:ctx.challenge,runtime:(await adapter.runtimeSnapshot()).runtime});
  const report=await new SelfTestRunner(host({native:adapter,readAsset:async ctx=>({...await canaryReader(ctx),rootIdentity:'asset:public'})})).run();
  assert.equal(find(report,'native.runtime').status,STATUS.PASS);assert.equal(find(report,'native.bridge').status,STATUS.PASS);assert.equal(find(report,'runtime.assets').status,STATUS.PASS);assert.equal(report.environment.fixtureOnly,true);
});
