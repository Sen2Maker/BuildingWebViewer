#!/usr/bin/env python3
"""Compile complete production coordinator, guard, lease, and unchanged method slices. Host-only."""
from pathlib import Path
import argparse,hashlib,json,re,subprocess,sys,tempfile
sys.dont_write_bytecode=True
from source_extract import method,field
HERE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def run(candidate,output):
 app=candidate/'project/mobile/android/app/src/main/java/io/github/sen2maker/buildingwebviewer'
 paths={'projects':app/'BWVProjectsPlugin.java','reports':app/'BWVSelfTestPlugin.java','activity':app/'MainActivity.java','service':app/'NativeDiagnosticService.java','save_activity':app/'DiagnosticReportSaveActivity.java'}
 source={k:p.read_text() for k,p in paths.items()};values={};pins={}
 for key,name,signature in [
  ('ACTIVITY_RECOVERY','activity','private void recovery('),
  ('ACTIVITY_INITIALIZE','activity','private void initializeOperations('),('ACTIVITY_LAUNCH','activity','void launchOperation('),('ACTIVITY_INVALIDATE','activity','void invalidateOperations('),('ACTIVITY_SAVE','activity','private void saveOperations('),('ACTIVITY_CLOSE','activity','private void closeOperations('),
  ('PROJECT_AUTHORIZED','projects','private boolean authorized('),('PROJECT_RUN','projects','private void run('),('PROJECT_PICK','projects','public void pickFiles('),('PROJECT_PICKED','projects','private void picked('),('PROJECT_GAUSSIAN','projects','public void openNativeGaussian('),('PROJECT_RETURNED','projects','private void nativeGaussianReturned('),('PROJECT_URIS','projects','static List<Uri> uris('),
  ('REPORT_GATE','reports','private void gate('),('REPORT_RUN_ID','reports','private String runId('),('REPORT_EXPORT','reports','public void exportReport('),('REPORT_SAVED','reports','private void reportSaved('),('SERVICE_FINISH','service','synchronized void finishExport('),('REPORT_DESTROY','save_activity','protected void onDestroy(')]:
  fragment=method(source[name],signature);values[key]=fragment.text;pins[key]={'path':str(paths[name].relative_to(candidate)),'signature':signature,'start':fragment.start,'end':fragment.end,'sha256':sha(fragment.text.encode())}
 fields=[field(source['activity'],prefix) for prefix in ['private MainActivityOperations operations','private static final String OPERATION_STATE_KEY','private static final String OPERATION_COUNT_KEY']]
 values['ACTIVITY_FIELDS']='\n'.join(f.text for f in fields)
 values['TEST_CASES']=(HERE/'cases.java.in').read_text()
 forbidden=['startActivityForResult','lastPluginCallId','getPluginCallForLastActivity','getSavedCall','getCallbackId','@ActivityCallback']
 target='\n'.join(values[k] for k in ['PROJECT_PICK','PROJECT_PICKED','PROJECT_GAUSSIAN','PROJECT_RETURNED','REPORT_EXPORT','REPORT_SAVED'])
 for term in forbidden:
  if term in target:raise AssertionError('Mutable upstream activity-result dispatch present: '+term)
 if '@ActivityCallback' in source['projects']+source['reports']:raise AssertionError('Plugin retains upstream ActivityCallback annotation')
 wiring={}
 for signature,requirements in [('public void onCreate(',['initializeOperations(state)']),('public void onSaveInstanceState(',['saveOperations(state);super.onSaveInstanceState(state)']),('public void onDestroy(',['closeOperations()']),('void documentStarted(',['invalidateOperations()'])]:
  fragment=method(source['activity'],signature)
  for expected in requirements:
   if expected not in fragment.text:raise AssertionError('Missing source wiring '+signature+': '+expected)
  wiring[signature]={'sha256':sha(fragment.text.encode()),'required':requirements}
 template=(HERE/'harness.java.in').read_text()
 for key,value in values.items():template=template.replace('@@'+key+'@@',value)
 if re.search(r'@@\w+@@',template):raise AssertionError('Unexpanded source fragment')
 output.mkdir(parents=True,exist_ok=True);(output/'MainActivityResultRegression.java').write_text(template)
 full=[app/'MainActivityOperations.java',candidate/'project/mobile/native-patches/BwvBridgeCallGuard.java',candidate/'project/mobile/android/app/src/main/java/bwv/diagnostics/DiagnosticExportLease.java']
 stubs=sorted((HERE/'stubs').rglob('*.java'))
 source_files={('candidate/'+str(p.relative_to(candidate)) if p.is_relative_to(candidate) else 'tests/'+str(p.relative_to(HERE))):sha(p.read_bytes()) for p in sorted(set(paths.values())|set(full)|set(stubs))}
 meta={'claim':'Host-only full production coordinator + unchanged plugin/MainActivity/service/save-activity method slices, real guard and export lease, controlled Android/AndroidX doubles. No SDK, APK, device, real provider, OS recreation, or Android runtime acceptance.','source_files_sha256':source_files,'actual_source_fragments':pins,'activity_fields_sha256':sha(values['ACTIVITY_FIELDS'].encode()),'lifecycle_wiring_source_only':wiring,'harness_sha256':sha(template.encode()),'test_inputs_sha256':{p.name:sha(p.read_bytes()) for p in [HERE/'harness.java.in',HERE/'cases.java.in',HERE/'source_extract.py']}}
 audit=candidate/'evidence/androidx-activity-1.11.0/ActivityResultRegistry.kt'
 if audit.exists():meta['androidx_registry_source_audit_sha256']=sha(audit.read_bytes())
 (output/'source-pins.json').write_text(json.dumps(meta,indent=2)+'\n')
 classes=output/'classes';classes.mkdir(exist_ok=True)
 compile=subprocess.run(['java','-m','jdk.compiler/com.sun.tools.javac.Main','-source','21','-target','21','-Xlint:all','-Werror','-d',str(classes),str(output/'MainActivityResultRegression.java'),*map(str,full+stubs)],capture_output=True,text=True)
 (output/'compile.txt').write_text(compile.stdout+compile.stderr)
 if compile.returncode:print(compile.stdout+compile.stderr);raise subprocess.CalledProcessError(compile.returncode,compile.args)
 result=subprocess.run(['java','-ea','-cp',str(classes),'io.github.sen2maker.buildingwebviewer.MainActivityResultRegression'],capture_output=True,text=True)
 (output/'result.txt').write_text(result.stdout+result.stderr);print(result.stdout+result.stderr,end='')
 if result.returncode:raise subprocess.CalledProcessError(result.returncode,result.args)
 return meta
if __name__=='__main__':
 default_candidate=next((p for p in HERE.parents if (p/'project/mobile').is_dir()),next((p/'main_app_integration_m1_2_staging' for p in HERE.parents if (p/'main_app_integration_m1_2_staging/project/mobile').is_dir()),HERE.parent/'main_app_integration_m1_2_staging'))
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--candidate',type=Path,default=default_candidate);parser.add_argument('--output',type=Path);args=parser.parse_args();output=args.output or Path(tempfile.mkdtemp(prefix='main-activity-results-'));run(args.candidate.resolve(),output.resolve());print('Evidence: '+str(output.resolve()))
