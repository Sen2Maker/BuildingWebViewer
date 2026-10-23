"""Verify promoted App source matches the frozen M2-derived payload-refresh candidate.
This is a source identity check, not new Android compile or device acceptance.
"""
from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[1]
rows=json.loads((root/'ci/root-native-files.json').read_text())['files']
for r in rows:
 p=root/r['path'].removeprefix('project/');data=p.read_bytes()
 assert len(data)==r['bytes'] and hashlib.sha256(data).hexdigest()==r['sha256'],r['path']
print(f'PASS {len(rows)} frozen M2-derived native source/payload files; no new hosted CI, APK or device claim')
