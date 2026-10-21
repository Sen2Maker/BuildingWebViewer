#!/usr/bin/env python3
"""Hash-gate the frozen, native-only snapshot BEFORE any dependency tooling."""
import hashlib
import json
import sys
from pathlib import Path, PurePosixPath

root = Path(sys.argv[1]).resolve()
manifest = json.loads(Path(sys.argv[2]).read_text())
rows = manifest['files']
if manifest.get('status') != 'FROZEN_NATIVE_ONLY_REVIEW':
    raise SystemExit('Native snapshot is not frozen for review')
expected = {}
for row in rows:
    name = row['path']
    p = PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or str(p) != name or name in expected:
        raise SystemExit('Invalid/duplicate allowlist path: ' + name)
    expected[name] = row
actual = {}
for path in root.rglob('*'):
    if path.is_symlink():
        raise SystemExit('No symlinks in native review snapshot: ' + str(path.relative_to(root)))
    if path.is_file():
        actual[path.relative_to(root).as_posix()] = path
if set(actual) != set(expected):
    raise SystemExit('Snapshot path mismatch: ' + json.dumps({'missing': sorted(set(expected)-set(actual)), 'unlisted': sorted(set(actual)-set(expected))}))
for name, path in actual.items():
    data = path.read_bytes()
    row = expected[name]
    if len(data) != row['bytes'] or hashlib.sha256(data).hexdigest() != row['sha256']:
        raise SystemExit('Snapshot bytes changed: ' + name)
print(f'Verified exact native-only source snapshot: {len(actual)} files. Rights remain unchanged; no release claim.')
