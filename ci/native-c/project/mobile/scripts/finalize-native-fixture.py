#!/usr/bin/env python3
"""After cap sync: inventory exact APK public/ bytes, including known Cordova stubs."""
from pathlib import Path
import hashlib,json
MOBILE=Path(__file__).resolve().parents[1]; WEB=MOBILE/'web'; PUBLIC=MOBILE/'android/app/src/main/assets/public'
old=json.loads((WEB/'asset-inventory.json').read_text()); expected={row['path']:row for row in old['files']}
source_inventory_hash=hashlib.sha256((WEB/'asset-inventory.json').read_bytes()).hexdigest()
expected['asset-inventory.json']={'sha256':source_inventory_hash}
actual={str(p.relative_to(PUBLIC)):p for p in PUBLIC.rglob('*') if p.is_file()}
if set(actual)!=set(expected)|{'cordova.js','cordova_plugins.js'}:raise SystemExit('Unexpected post-sync assets; inventory not finalized')
for p in PUBLIC.rglob('*'):
 if p.is_symlink():raise SystemExit('Symlink in public assets')
for name,pin in expected.items():
 if name=='asset-inventory.json':continue # Generated below, source entries and final bytes are independently rechecked.
 if hashlib.sha256(actual[name].read_bytes()).hexdigest()!=pin['sha256']:raise SystemExit('Changed source asset: '+name)
for name in ['cordova.js','cordova_plugins.js']:
 if actual[name].read_bytes()!=b'':raise SystemExit('Unexpected nonempty Cordova stub')
entries=[{'path':name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for name,p in sorted(actual.items()) if name!='asset-inventory.json']
encoded=(json.dumps({'schema':1,'files':entries},separators=(',',':'))+'\n').encode();(PUBLIC/'asset-inventory.json').write_bytes(encoded)
pins=json.loads((MOBILE/'bundled-pins.json').read_text());pins.update(inventorySha256=hashlib.sha256(encoded).hexdigest(),inventoryBytes=len(encoded));(MOBILE/'bundled-pins.json').write_text(json.dumps(pins,indent=2)+'\n')
print('Final APK public fixture inventory:',len(entries)+1,'files;',pins['inventorySha256'])
