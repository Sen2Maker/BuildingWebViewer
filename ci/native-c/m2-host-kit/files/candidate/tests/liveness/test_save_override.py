#!/usr/bin/env python3
"""Type-check actual Main override against the pinned dependency's public signature.

Dependency method body alone is replaced by a counter; Android execution is not claimed.
"""
from pathlib import Path
import hashlib,json,re,subprocess,tempfile,argparse,sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/regression'))
from run_transport_regression import method

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path);args=parser.parse_args()
 out=args.output or Path(tempfile.mkdtemp(prefix='bwv-save-override-'));out.mkdir(parents=True,exist_ok=True)
 dependency=ROOT/'project/mobile/node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeActivity.java'
 package=ROOT/'project/mobile/node_modules/@capacitor/android/package.json'
 assert json.loads(package.read_text())['version']=='8.5.3'
 parent_source=dependency.read_text();parent_method=method(parent_source,'public void onSaveInstanceState(');signature=parent_method[:parent_method.index('{')].strip()
 source_rel='project/mobile/android/app/src/main/java/io/github/sen2maker/buildingwebviewer/MainActivity.java'
 records={};checks=0
 for label,root,success in [('baseline',ROOT.parent/'main_app_integration_m1_2_staging',False),('candidate',ROOT,True)]:
  text=(root/source_rel).read_text();match=re.search(r'(?:public|protected) void onSaveInstanceState\(',text);assert match
  actual=method(text,match.group());dest=out/label;dest.mkdir(exist_ok=True)
  generated=('class Bundle {}\nclass BridgeActivity {int inheritedSaves; '+signature+' {inheritedSaves++;}}\n'
    'public class SaveOverrideRegression extends BridgeActivity {int ownSaves; void saveOperations(Bundle state){ownSaves++;}\n@Override '+actual+'\n'
    'public static void main(String[] args){SaveOverrideRegression value=new SaveOverrideRegression(); value.onSaveInstanceState(new Bundle());'
    'if(value.ownSaves!=1||value.inheritedSaves!=1)throw new AssertionError("Both save paths must execute once"); System.out.println("Actual override preserves own and inherited save calls");}}\n')
  path=dest/'SaveOverrideRegression.java';path.write_text(generated)
  command=['java','-m','jdk.compiler/com.sun.tools.javac.Main','-source','21','-target','21','-Xlint:all','-Werror','-XDrawDiagnostics','-d',str(dest),str(path)]
  result=subprocess.run(command,text=True,capture_output=True);(dest/'compile.txt').write_text(result.stdout+result.stderr)
  if success:
   assert result.returncode==0,result.stderr
   run=subprocess.run(['java','-cp',str(dest),'SaveOverrideRegression'],text=True,capture_output=True);assert run.returncode==0,run.stderr;(dest/'runtime.txt').write_text(run.stdout);checks+=3
  else:
   assert result.returncode!=0,'Frozen baseline must expose access reduction'
   assert 'compiler.err.override.weaker.access' in result.stderr,result.stderr;checks+=2
  records[label]={'sourceSha256':hashlib.sha256((root/source_rel).read_bytes()).hexdigest(),'methodSha256':hashlib.sha256(actual.encode()).hexdigest(),'compiles':success}
 checks+=2
 records['dependency']={'version':'8.5.3','sha256':hashlib.sha256(dependency.read_bytes()).hexdigest(),'signature':signature}
 (out/'actual-source.json').write_text(json.dumps(records,indent=2)+'\n')
 print(f'{checks} actual parent-signature/override checks PASS; baseline rejects reduced access; no Android execution')
if __name__=='__main__':main()
