#!/usr/bin/env python3
"""Audit actual upstream lifecycle access; compile a source-derived save override probe."""
from pathlib import Path
import argparse,hashlib,json,os,re,subprocess,sys,tempfile
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'tests/activity-results'))
from source_extract import method
p=argparse.ArgumentParser(description=__doc__);p.add_argument('project',type=Path);p.add_argument('output',type=Path);p.add_argument('--api-signatures',type=Path,help='Local-only pinned AOSP API text, not a substitute for hosted SDK audit');args=p.parse_args()
root=args.project.resolve();out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
package=root/'mobile/node_modules/@capacitor/android'
if json.loads((package/'package.json').read_text())['version']!='8.5.3':raise SystemExit('Unexpected Capacitor version')
bridge=package/'capacitor/src/main/java/com/getcapacitor/BridgeActivity.java'
if sha(bridge)!='344dda9fcee959138cbd70fbe2f66f73938727048455d1082188527266297c67':raise SystemExit('Pinned BridgeActivity source drift')
b=bridge.read_text()
if args.api_signatures:
 if sha(args.api_signatures)!='1f84aa28d5e59cd4b24087032bdd6880d87570dda64a8a6474817fb043b39b16':raise SystemExit('Pinned Android 16 r1 API text drift')
 s=args.api_signatures.read_text();start=s.index('public class Activity extends android.view.ContextThemeWrapper');api=s[start:s.index('\n  }',start)]
 origin={'kind':'LOCAL_PINNED_AOSP_API_TEXT','sha256':sha(args.api_signatures),'source':'https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/android-16.0.0_r1/core/api/current.txt','android_sdk_checked':False}
else:
 sdk=Path(os.environ['ANDROID_HOME']);jar=sdk/'platforms/android-36/android.jar';props=(jar.parent/'source.properties').read_text()
 if not re.search(r'^AndroidVersion.ApiLevel=36$',props,re.M):raise SystemExit('Expected preinstalled Android API 36')
 cmd=['java','-m','jdk.jdeps/com.sun.tools.javap.Main','-protected','-classpath',str(jar),'android.app.Activity']
 result=subprocess.run(cmd,text=True,capture_output=True);result.check_returncode();api=result.stdout
 origin={'kind':'HOSTED_PREINSTALLED_ANDROID36_JAR_JAVAP','sha256':sha(jar),'android_sdk_checked':True}
(out/'actual-activity-declarations.txt').write_text(api)
def clean_type(t):
 t=re.sub(r'@\w+(?:\([^)]*\))?\s*','',t).strip();return t.split()[0].rsplit('.',1)[-1] if t else ''
def declarations(text):
 result={}
 for visibility,name,params in re.findall(r'\b(public|protected)\s+void\s+(\w+)\s*\(([^)]*)\)',text):
  types=tuple(clean_type(t) for t in params.split(',')) if params.strip() else ();result[(name,types)]=visibility
 return result
base=declarations(api);upstream=declarations(b);app=root/'mobile/android/app/src/main/java/io/github/sen2maker/buildingwebviewer';records=[];ranks={'protected':1,'public':2}
for cls,count in [('MainActivity',7),('RecoveryActivity',4),('DiagnosticReportSaveActivity',5)]:
 s=(app/(cls+'.java')).read_text();matches=re.findall(r'@Override\s+(public|protected)\s+void\s+(\w+)\s*\(([^)]*)\)',s)
 if len(matches)!=count:raise SystemExit('Lifecycle inventory changed: '+cls)
 for visibility,name,params in matches:
  types=tuple(clean_type(t) for t in params.split(',')) if params.strip() else ();key=(name,types)
  inherited=upstream.get(key) if cls=='MainActivity' else None;source='BridgeActivity' if inherited else 'android.app.Activity';inherited=inherited or base.get(key)
  if inherited is None or ranks[visibility]<ranks[inherited]:raise SystemExit('Lifecycle access reduction/unresolved declaration: '+cls+'.'+name)
  records.append({'class':cls,'method':name,'parameters':types,'declared':visibility,'parent':inherited,'parent_source':source})
# Extract the actual installed upstream declaration, not a permissive invented superclass.
parent=method(b,'public void onSaveInstanceState(').text;declaration=parent[:parent.index('{')].strip()
child_source=(app/'MainActivity.java').read_text();child=method(child_source,'public void onSaveInstanceState(').text
prefix='class Bundle {}\nclass BridgeActivity { '+declaration+' {} }\nclass MainActivity extends BridgeActivity { void saveOperations(Bundle state) {}\n@Override '
suffix='\n}\n'
for name,body,ok in [('actual',child,True),('protected-negative',child.replace('public void onSaveInstanceState(','protected void onSaveInstanceState(',1),False)]:
 folder=out/name;folder.mkdir(exist_ok=True);source=folder/'LifecycleProbe.java';source.write_text(prefix+body+suffix)
 result=subprocess.run(['java','-m','jdk.compiler/com.sun.tools.javac.Main','-source','21','-target','21','-Xlint:all','-Werror','-d',str(folder),str(source)],text=True,capture_output=True);log=result.stdout+result.stderr;(folder/'compiler.txt').write_text(log)
 if ok and (result.returncode or log):raise SystemExit('Actual lifecycle override probe failed: '+log)
 if not ok and (result.returncode==0 or 'weaker access privileges' not in log):raise SystemExit('Protected override negative did not reproduce intended compiler failure')
result={'status':'passed','audit_count':len(records),'records':records,'activity_api':origin,'bridge_activity_sha256':sha(bridge),'actual_save_method_sha256':hashlib.sha256(child.encode()).hexdigest(),'public_override_compiles':True,'protected_negative_reproduces_access_error':True,'scope':'Actual upstream declaration audit and source-derived Java visibility probe, not full Android compilation/runtime/device acceptance','user_data_read':False}
(out/'results.json').write_text(json.dumps(result,indent=2)+'\n');print('NATIVE_LIFECYCLE_VISIBILITY_RESULT='+json.dumps(result,sort_keys=True))
