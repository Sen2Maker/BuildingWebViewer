#!/usr/bin/env python3
from pathlib import Path
import tempfile,shutil,subprocess,json
root=Path(__file__).resolve().parents[1];rel=Path('project/mobile/android/app/src/main/java/io/github/sen2maker/buildingwebviewer/RecoveryActivity.java');s=(root/rel).read_text()
mutations=[('stale-route','attempt.request != request || ','','late A cannot consume B'),('duplicate-result',' || attempt.delivered) return;',') return;','one writer, no replacement'),('orphan-block','pendingBackup = new BackupAttempt(parsedPending, null); busy = true;','pendingBackup = new BackupAttempt(parsedPending, null); busy = false;','routing only'),('settlement-owner','if (pendingBackup != attempt) return;','if (false) return;','old settlement ignored')]
results=[]
for name,old,new,expected in mutations:
 assert s.count(old)==1,(name,s.count(old))
 tmp=Path(tempfile.mkdtemp(prefix='recovery-mutation-'+name+'-'));(tmp/rel).parent.mkdir(parents=True);(tmp/rel).write_text(s.replace(old,new));shutil.copytree(root/'tests',tmp/'tests')
 run=subprocess.run(['python',str(tmp/'tests/run_regression.py')],capture_output=True,text=True)
 compiled=(tmp/'evidence/compiler.txt').exists() and not (tmp/'evidence/compiler.txt').read_text()
 killed=run.returncode!=0 and compiled and 'AssertionError: '+expected in run.stdout+run.stderr
 results.append({'name':name,'compiled':compiled,'killed':killed,'expectedAssertion':expected,'evidence':str(tmp/'evidence')})
 print(('PASS ' if killed else 'FAIL ')+name+' compiled and killed by '+expected)
 if not killed:print(run.stdout+run.stderr)
(root/'evidence/mutation-results.json').write_text(json.dumps(results,indent=2)+'\n')
assert all(r['killed'] for r in results)
