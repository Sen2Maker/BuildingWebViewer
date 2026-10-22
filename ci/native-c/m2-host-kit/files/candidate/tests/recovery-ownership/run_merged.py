#!/usr/bin/env python3
"""Run unchanged reviewed ownership harness against a byte-exact copy of integrated source."""
from pathlib import Path
import argparse,hashlib,json,shutil,subprocess,tempfile,sys
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--output',type=Path);a=p.parse_args();out=a.output or Path(tempfile.mkdtemp(prefix='main-merged-recovery-'));out.mkdir(parents=True,exist_ok=True)
rel=Path('project/mobile/android/app/src/main/java/io/github/sen2maker/buildingwebviewer/RecoveryActivity.java');dest=out/'input';(dest/rel).parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/rel,dest/rel);(dest/'tests').mkdir(exist_ok=True)
pins={'harness.java.in':'f2d14ee7f690b5621ffc244dc8351d268b261debb8444d2eb582648e6e61d643','run_regression.py':'a6b4217ad524a290c5a5c422f572bcb360c688adea2bd920804484ed6f9059d2','run_mutations.py':'413ed625aa82bef86723c89e9c7f388304686e3a829655d327c3a780d3409678'}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name,pin in pins.items():
 assert sha(HERE/name)==pin,(name,'reviewed harness drift');shutil.copy2(HERE/name,dest/'tests'/name)
for command in ['run_regression.py','run_mutations.py']:
 run=subprocess.run([sys.executable,'-B',str(dest/'tests'/command)],text=True,capture_output=True);(out/(command+'.txt')).write_text(run.stdout+run.stderr);print(run.stdout+run.stderr,end='');run.check_returncode()
assert sha(ROOT/rel)==sha(dest/rel)
(out/'integration-pins.json').write_text(json.dumps({'source':rel.as_posix(),'sha256':sha(ROOT/rel),'harness':pins,'scope':'Unchanged reviewed ownership suite on exact merged source in isolated temp layout; no Android/provider execution'},indent=2)+'\n')
