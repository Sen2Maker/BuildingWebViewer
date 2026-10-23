#!/usr/bin/env python3
"""Independently bind the final APK public-resource tree to fixture pins."""
import hashlib
import json
import sys
from pathlib import Path, PurePosixPath

if len(sys.argv) != 3:
    raise SystemExit('Usage: verify-native-fixture.py project native-files.json')
root = Path(sys.argv[1]).resolve()
manifest = json.loads(Path(sys.argv[2]).read_text())
if manifest.get('status') != 'FROZEN_NATIVE_ONLY_REVIEW':
    raise SystemExit('Fixture requires the frozen native source manifest')
mobile = root / 'mobile'
public = mobile / 'android/app/src/main/assets/public'
pins = json.loads((mobile / 'bundled-pins.json').read_text())
if pins.get('fixtureOnly') is not True or pins.get('build') != 'native-diagnostic-fixture-c2':
    raise SystemExit('Not the explicitly synthetic C compile fixture')
if (pins['build'] != manifest.get('publicFixtureBuild') or
        pins['inventorySha256'] != manifest.get('publicFixtureInventorySha256') or
        pins['inventoryBytes'] != manifest.get('publicFixtureInventoryBytes')):
    raise SystemExit('Regenerated fixture pins differ from the frozen C2.2 source manifest')
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
if len(actual) != manifest.get('publicFixtureFiles'):
    raise SystemExit('Unexpected frozen fixture file count')
for name, row in entries.items():
    data = actual[name].read_bytes()
    if len(data) != row['bytes'] or hashlib.sha256(data).hexdigest() != row['sha256']:
        raise SystemExit('Fixture byte drift: ' + name)
    if name.lower().endswith(('.wasm', '.dwg', '.dxf', '.step', '.stp', '.zip', '.so', '.ttf', '.otf', '.woff', '.woff2', '.apk', '.aab')):
        raise SystemExit('CAD/binary payload outside this native-only checkpoint: ' + name)
native = json.loads(actual['native-web.json'].read_text())
if native.get('build') != pins['build']:
    raise SystemExit('Native metadata/BuildConfig fixture mismatch')
print(f'Final synthetic fixture verified: {len(actual)} files, inventory {pins["inventorySha256"]}; no CAD payload.')
