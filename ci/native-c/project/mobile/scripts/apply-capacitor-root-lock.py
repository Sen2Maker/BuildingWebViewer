#!/usr/bin/env python3
"""Apply only audited Capacitor8.5.3 changes; drift fails before any write."""
from pathlib import Path
import hashlib,json,sys
MOBILE=Path(__file__).resolve().parents[1]
PATCH=MOBILE/'native-patches'
TARGET=MOBILE/'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor'
if json.loads((MOBILE/'node_modules/@capacitor/android/package.json').read_text()).get('version')!='8.5.3':raise SystemExit('Unexpected Capacitor package version')
hashes=json.loads((PATCH/'capacitor-8.5.3-hashes.json').read_text())
helpers=json.loads((PATCH/'helper-hashes.json').read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
# Complete preflight, then idempotent writes. No version-tolerant substitutions.
for name,pins in hashes.items():
 if digest(TARGET/name) not in [pins['before'],pins['after'],pins.get('previous')]:raise SystemExit('Unexpected Capacitor source: '+name)
 if digest(PATCH/'patched'/name)!=pins['after']:raise SystemExit('Changed patch payload: '+name)
for name,pin in helpers.items():
 source=PATCH/name;dest=TARGET/name
 if digest(source)!=pin:raise SystemExit('Changed helper payload: '+name)
 if dest.exists() and digest(dest)!=pin:raise SystemExit('Unexpected helper source: '+name)
for name,pins in hashes.items():(TARGET/name).write_bytes((PATCH/'patched'/name).read_bytes())
for name in helpers:(TARGET/name).write_bytes((PATCH/name).read_bytes())
print('Applied pinned Capacitor8.5.3 process-root and imported-content boundaries; all hashes verified')
