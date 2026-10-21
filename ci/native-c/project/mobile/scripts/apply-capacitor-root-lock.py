#!/usr/bin/env python3
"""Apply only audited Capacitor8.5.3 changes; drift fails before any write."""
from pathlib import Path
import hashlib,json,sys
MOBILE=Path(__file__).resolve().parents[1]
PATCH=MOBILE/'native-patches'
TARGET=MOBILE/'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor'
hashes=json.loads((PATCH/'capacitor-8.5.3-hashes.json').read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
# Complete preflight, then idempotent writes. No version-tolerant substitutions.
for name,pins in hashes.items():
 if digest(TARGET/name) not in [pins['before'],pins['after']]:raise SystemExit('Unexpected Capacitor source: '+name)
 if digest(PATCH/'patched'/name)!=pins['after']:raise SystemExit('Changed patch payload: '+name)
source=PATCH/'BwvProcessRootGuard.java';dest=TARGET/source.name
if dest.exists() and dest.read_bytes()!=source.read_bytes():raise SystemExit('Unexpected root guard source')
for name,pins in hashes.items():(TARGET/name).write_bytes((PATCH/'patched'/name).read_bytes())
dest.write_bytes(source.read_bytes())
print('Applied pinned Capacitor8.5.3 process-root lock; all changed hashes verified')
