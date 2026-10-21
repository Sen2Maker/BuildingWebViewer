#!/usr/bin/env python3
"""Deterministic tiny compile fixture. This is NOT the full App payload."""
from pathlib import Path
import hashlib,json,shutil
MOBILE=Path(__file__).resolve().parents[1]; WEB=MOBILE/'web'
if WEB.is_symlink():raise SystemExit('Refusing linked web directory')
if WEB.exists():
 for path in WEB.rglob('*'):
  if path.is_symlink():raise SystemExit('Refusing linked fixture entries')
 owner=MOBILE/'native-fixture-owner.json'
 inventory=WEB/'asset-inventory.json'
 if not owner.is_file() or not inventory.is_file() or hashlib.sha256(inventory.read_bytes()).hexdigest()!=json.loads(owner.read_text()).get('inventorySha256'):raise SystemExit('Refusing non-fixture web directory')
 recorded=json.loads(inventory.read_bytes())['files']
 expected={row['path']:row for row in recorded}
 actual={str(p.relative_to(WEB)):p for p in WEB.rglob('*') if p.is_file()}
 if set(actual)!=set(expected)|{'asset-inventory.json'}:raise SystemExit('Refusing changed fixture files')
 for name,row in expected.items():
  if actual[name].is_symlink() or hashlib.sha256(actual[name].read_bytes()).hexdigest()!=row['sha256']:raise SystemExit('Refusing changed fixture bytes')
 shutil.rmtree(WEB)
WEB.mkdir()
build='native-compile-fixture-c1'
files={
 'index.html':b'<!doctype html><title>Native compile fixture</title><p>Not a full App build.</p>\n',
 'assets/mobile/index.html':b'<!doctype html><meta charset="utf-8"><title>Native compile fixture</title><script src="../js/capacitor.js"></script><p>Compile fixture only. CAD and updates unavailable.</p>\n',
 'assets/native/gaussian-vertex.glsl':b'#version 300 es\nvoid main(){gl_Position=vec4(0.0);}\n',
 'assets/native/gaussian-fragment.glsl':b'#version 300 es\nprecision mediump float;out vec4 color;void main(){color=vec4(1.0);}\n',
 'native-web.json':(json.dumps({'schema':1,'product':'BuildingWebViewer','packageId':'io.github.sen2maker.buildingwebviewer','generation':'stable-v1','channel':'stable','version':'1.0.0','build':build,'nativeApi':1,'minNativeVersionCode':1},separators=(',',':'))+'\n').encode(),
 'release-notes.json':b'{"version":"1.0.0","notes":{"en":"Native compile fixture only","zh":"Native compile fixture only"}}\n',
}
bridge=MOBILE/'node_modules/@capacitor/core/dist/capacitor.js'
if not bridge.is_file():raise SystemExit('Run npm ci first; pinned Capacitor bridge missing')
files['assets/js/capacitor.js']=bridge.read_bytes()
for name,data in files.items():
 p=WEB/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
entries=[{'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for name,data in sorted(files.items())]
inventory=(json.dumps({'schema':1,'files':entries},separators=(',',':'))+'\n').encode();(WEB/'asset-inventory.json').write_bytes(inventory)
# Owner marker outside public so the exact inventory has no hidden exclusions.
(MOBILE/'native-fixture-owner.json').write_text(json.dumps({'inventorySha256':hashlib.sha256(inventory).hexdigest()})+'\n')
(MOBILE/'bundled-pins.json').write_text(json.dumps({'build':build,'inventoryBytes':len(inventory),'inventorySha256':hashlib.sha256(inventory).hexdigest(),'fixtureOnly':True},indent=2)+'\n')
print('Prepared only synthetic native compile assets:',len(entries)+1,'files; no CAD payload')
