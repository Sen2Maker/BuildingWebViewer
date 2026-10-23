#!/usr/bin/env python3
from pathlib import Path
import hashlib,json,subprocess,sys
root=Path(__file__).resolve().parents[1]
source=root/'project/mobile/android/app/src/main/java/io/github/sen2maker/buildingwebviewer/RecoveryActivity.java'
s=source.read_text();pins=[]
def extract(sig):
 start=s.index(sig);p=s.index('{',start);depth=1;end=p+1
 while depth:
  if s[end]=='{':depth+=1
  elif s[end]=='}':depth-=1
  end+=1
 value=s[start:end];pins.append({'signature':sig,'offset':start,'sha256':hashlib.sha256(value.encode()).hexdigest()});return value
methods='\n'.join(extract(x) for x in ['private void restoreBackupState(', '@Override protected void onSaveInstanceState(', 'private void settleBackup(', 'private void prepareBackup(', 'private void backupPreparationFailed(', '@Override protected void onActivityResult(', 'private static byte[] digest(', '@Override public void onDestroy('])
start=s.index('private static final int FIRST_BACKUP_REQUEST');end=s.index('private final ExecutorService',start)
fields=s[start:end];pins.append({'slice':'routing fields and immutable attempt','sha256':hashlib.sha256(fields.encode()).hexdigest()})
assert 'setContentView(scroll);\n        restoreBackupState(saved);' in s
assert 'private TextView status; private boolean busy;' in s
h=(root/'tests/harness.java.in').read_text().replace('@@FIELDS@@',fields).replace('@@METHODS@@',methods)
out=root/'evidence';out.mkdir(exist_ok=True);(out/'RecoveryOwnershipRegression.java').write_text(h)
(out/'source-pins.json').write_text(json.dumps({'source':str(source.relative_to(root)),'sha256':hashlib.sha256(s.encode()).hexdigest(),'slices':pins},indent=2)+'\n')
cmd=['java','-m','jdk.compiler/com.sun.tools.javac.Main','-source','21','-target','21','-Xlint:all','-Werror','-d',str(out/'classes'),str(out/'RecoveryOwnershipRegression.java')]
a=subprocess.run(cmd,capture_output=True,text=True);(out/'compiler.txt').write_text(a.stdout+a.stderr);print(a.stdout+a.stderr,end='');a.check_returncode()
b=subprocess.run(['java','-ea','-cp',str(out/'classes'),'RecoveryOwnershipRegression'],capture_output=True,text=True);(out/'results.txt').write_text(b.stdout+b.stderr);print(b.stdout+b.stderr,end='');b.check_returncode()
