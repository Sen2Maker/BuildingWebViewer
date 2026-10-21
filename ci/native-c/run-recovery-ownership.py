#!/usr/bin/env python3
"""Run exact reviewed Recovery tests only from a disposable copy, not the source tree."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,tempfile
root=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve()
if out==root or out.is_relative_to(root):raise SystemExit('Evidence must be outside the source snapshot')
source='project/mobile/android/app/src/main/java/io/github/sen2maker/buildingwebviewer/RecoveryActivity.java'
pin='133eb4ee37d883ae35839eafa202c09b64797c6c7a9482cab0562e7961a3ba21'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if sha(root/source)!=pin:raise SystemExit('Recovery source does not match the reviewed R1 overlay')
kit=root/'tests/recovery-ownership';manifest=json.loads((root/'recovery-tests.json').read_text())
if {p.relative_to(kit).as_posix() for p in kit.rglob('*') if p.is_file()}!={r['path'] for r in manifest['files']}:raise SystemExit('Recovery kit path mismatch')
if any(p.is_symlink() for p in kit.rglob('*')):raise SystemExit('Recovery kit symlink rejected')
for r in manifest['files']:
 if sha(kit/r['path'])!=r['sha256'] or (kit/r['path']).stat().st_size!=r['bytes']:raise SystemExit('Recovery kit bytes changed')
out.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='run-',dir=out));dest=work/source;dest.parent.mkdir(parents=True);shutil.copyfile(root/source,dest);shutil.copytree(kit,work/'tests')
env=os.environ.copy();env['PYTHONDONTWRITEBYTECODE']='1';tmp=work/'tmp';tmp.mkdir();env['TMPDIR']=str(tmp)
for script in ['run_regression.py','run_mutations.py']:
 r=subprocess.run([sys.executable,'-B',str(work/'tests'/script)],text=True,capture_output=True,env=env)
 (out/(script+'.log')).write_text(r.stdout+r.stderr);print(r.stdout+r.stderr,end='');r.check_returncode()
text=(work/'evidence/results.txt').read_text()
if 'PASS 21 scenarios / 59 assertions; exact production methods, host doubles only' not in text:raise SystemExit('Unexpected Recovery scenario/assertion contract')
rows=json.loads((work/'evidence/mutation-results.json').read_text())
if len(rows)!=4 or {r['name'] for r in rows}!={'stale-route','duplicate-result','orphan-block','settlement-owner'} or not all(r['compiled'] and r['killed'] for r in rows):raise SystemExit('Recovery negative controls incomplete')
if sha(root/source)!=pin or sha(dest)!=pin:raise SystemExit('Recovery source changed during host checks')
result={'status':'passed','scenarios':21,'assertions':59,'runtime_killed_mutations':4,'source_sha256':pin,'scope':'Actual production method slices with controlled host doubles and synthetic temporary bytes; not Android/SAF/provider/device acceptance','user_data_read':False,'source_edited':False}
(out/'results.json').write_text(json.dumps(result,indent=2)+'\n');print('NATIVE_RECOVERY_HOST_RESULT='+json.dumps(result,sort_keys=True))
