#!/usr/bin/env python3
"""Negative controls: copy only needed candidate Java sources, mutate locally, require runtime assertion failure."""
from pathlib import Path
import argparse,contextlib,io,json,shutil,subprocess,sys,tempfile
sys.dont_write_bytecode=True
from run_regression import run
HERE=Path(__file__).resolve().parent
APP='project/mobile/android/app/src/main/java/io/github/sen2maker/buildingwebviewer/'
MUTATIONS=[
 ('wrong-original-owner',APP+'MainActivityOperations.java','attempt.owner.complete(result);','if(pending!=null)pending.owner.complete(result);','only original complete and settle'),
 ('free-slot-on-navigation',APP+'MainActivityOperations.java','void invalidate() { requireUi(); if(pending!=null)revoke(pending); }','void invalidate() { requireUi(); if(pending!=null)revoke(pending); pending=null; }','in-flight key survives navigation'),
 ('duplicate-result-replay',APP+'MainActivityOperations.java','if (attempt.consumed) return;\n        callbackDepth++;','if (false) return;\n        callbackDepth++;','original consumed once'),
 ('mutable-picker-project',APP+'BWVProjectsPlugin.java','store.importUris(projectId,selected)','store.importUris(originalCall.getString("id"),selected)','import uses launch-time original project'),
 ('mutable-gaussian-project',APP+'BWVProjectsPlugin.java','.putExtra("project",projectId)','.putExtra("project",call.getString("id"))','captured Gaussian project'),
 ('free-uncertain-report-lease',APP+'BWVSelfTestPlugin.java','catch(MainActivityOperations.LaunchFailure uncertain){throw uncertain;}','catch(MainActivityOperations.LaunchFailure uncertain){service.finishExport(export.token());throw uncertain;}','uncertain report launch must retain lease'),
 ('forget-report-settlement',APP+'BWVSelfTestPlugin.java','@Override public void settled(){service.finishExport(export.token());}','@Override public void settled(){}','report sync definitive result settles lease'),
 ('omit-deferred-retirement',APP+'MainActivityOperations.java','cleanup.post(()->finishRetirement(launcher));','/* negative control: no deferred native cleanup */','repeated completed operations reclaim both request-code maps'),
 ('omit-save-retirement-flush',APP+'MainActivityOperations.java','String savedKey() { requireUi(); flushRetired();','String savedKey() { requireUi();','save outside callback flushes completed key before framework snapshot'),
 ('remove-restored-orphan-budget',APP+'MainActivityOperations.java','if(restoredCount==MAX_RESTORED_ATTEMPTS)throw new IllegalStateException("OPERATION_RESTORE_BUDGET_EXHAUSTED");','/* negative control: restoration budget bypassed */','seventeenth stored-pending restoration rejected before registration'),
 ('skip-restoration-count',APP+'MainActivityOperations.java','restoredCount++;','/* negative control: restoration not counted */','one restoration consumed per orphan lineage step'),
 ('accept-noncanonical-state-count',APP+'MainActivity.java','count.matches("(?:0|[1-9]|1[0-6])")','count.matches(".*")','malformed count +1'),
 ('skip-queued-import-gate',APP+'BWVProjectsPlugin.java','BwvBridgeCallGuard.require(call,bridge.getWebView());JSONObject result=task.run();','JSONObject result=task.run();','old queued IO cannot execute under replacement authority'),
]
def mutations(candidate,output):
 output.mkdir(parents=True,exist_ok=True)
 files=[APP+name+'.java' for name in ['MainActivityOperations','MainActivity','BWVProjectsPlugin','BWVSelfTestPlugin','NativeDiagnosticService','DiagnosticReportSaveActivity']]+['project/mobile/native-patches/BwvBridgeCallGuard.java','project/mobile/android/app/src/main/java/bwv/diagnostics/DiagnosticExportLease.java']
 rows=[]
 for name,path,before,after,expected in MUTATIONS:
  root=output/name/'candidate'
  for relative in files:
   target=root/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(candidate/relative,target)
  target=root/path;text=target.read_text()
  if text.count(before)!=1:raise AssertionError(name+': mutation target must occur exactly once; found '+str(text.count(before)))
  target.write_text(text.replace(before,after))
  evidence=output/name/'evidence'
  failed=False
  with contextlib.redirect_stdout(io.StringIO()):
   try:run(root,evidence)
   except subprocess.CalledProcessError:failed=True
  compile_log=(evidence/'compile.txt').read_text() if (evidence/'compile.txt').exists() else 'missing compiler output'
  result=(evidence/'result.txt').read_text() if (evidence/'result.txt').exists() else ''
  if not failed or compile_log or expected not in result:raise AssertionError(name+' was not killed by intended runtime assertion; compile='+compile_log+' result='+result[-2000:])
  row={'mutation':name,'status':'KILLED_BY_RUNTIME_ASSERTION','expected_failure':expected,'evidence':str(evidence.relative_to(output))};rows.append(row);print('KILLED '+name+': '+expected)
 (output/'results.json').write_text(json.dumps(rows,indent=2)+'\n');print(str(len(rows))+' mutation controls killed by runtime assertions.')
if __name__=='__main__':
 default_candidate=next((p for p in HERE.parents if (p/'project/mobile').is_dir()),next((p/'main_app_integration_m1_2_staging' for p in HERE.parents if (p/'main_app_integration_m1_2_staging/project/mobile').is_dir()),HERE.parent/'main_app_integration_m1_2_staging'))
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--candidate',type=Path,default=default_candidate);parser.add_argument('--output',type=Path);args=parser.parse_args();mutations(args.candidate.resolve(),(args.output or Path(tempfile.mkdtemp(prefix='main-activity-mutations-'))).resolve())
