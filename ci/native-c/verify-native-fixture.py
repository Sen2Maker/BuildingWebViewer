#!/usr/bin/env python3
"""Independently bind the final APK public-resource tree to fixture pins."""
import hashlib
import json
import sys
from pathlib import Path, PurePosixPath

root = Path(sys.argv[1]).resolve()
mobile = root / 'mobile'
public = mobile / 'android/app/src/main/assets/public'
pins = json.loads((mobile / 'bundled-pins.json').read_text())
if pins.get('fixtureOnly') is not True or pins.get('build') != 'native-compile-fixture-c1':
    raise SystemExit('Not the explicitly synthetic C compile fixture')
raw = (public / 'asset-inventory.json').read_bytes()
if len(raw) != pins['inventoryBytes'] or hashlib.sha256(raw).hexdigest() != pins['inventorySha256']:
    raise SystemExit('Final public inventory differs from compile-time BuildConfig pins')
inventory = json.loads(raw)
if inventory.get('schema') != 1:
    raise SystemExit('Unsupported fixture inventory schema')
entries = {}
for row in inventory['files']:
    name = row['path']
    p = PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or str(p) != name or name in entries or name == 'asset-inventory.json':
        raise SystemExit('Unsafe/duplicate fixture inventory path')
    entries[name] = row
actual = {}
for path in public.rglob('*'):
    if path.is_symlink():
        raise SystemExit('Symlink in final public fixture')
    if path.is_file():
        actual[path.relative_to(public).as_posix()] = path
if set(actual) != set(entries) | {'asset-inventory.json'}:
    raise SystemExit('Final public assets violate exact inventory bijection')
for name, row in entries.items():
    data = actual[name].read_bytes()
    if len(data) != row['bytes'] or hashlib.sha256(data).hexdigest() != row['sha256']:
        raise SystemExit('Fixture byte drift: ' + name)
    if name.lower().endswith(('.wasm', '.dwg', '.dxf', '.step', '.stp', '.zip', '.so', '.ttf', '.apk', '.aab')):
        raise SystemExit('CAD/binary payload outside this native-only checkpoint: ' + name)
native = json.loads(actual['native-web.json'].read_text())
if native.get('build') != pins['build']:
    raise SystemExit('Native metadata/BuildConfig fixture mismatch')
print(f'Final synthetic fixture verified: {len(actual)} files, inventory {pins["inventorySha256"]}; no CAD payload.')
