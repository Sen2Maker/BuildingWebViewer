#!/usr/bin/env python3
"""Bounded source-only startup/transport evidence. Does not run an Android app."""
import json
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
policy = json.loads(Path(sys.argv[2]).read_text())
results = []
for row in policy['indicators']:
    path = root / row['path']
    try:
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise ValueError('Source escapes snapshot')
        source = path.read_text()
        passed = all(text in source for text in row['required']) and not any(text in source for text in row['forbidden'])
    except (OSError, ValueError):
        passed = False
    results.append({'id': row['id'], 'passed': passed})
passed = len(results) == 30 and len({r['id'] for r in results}) == 30 and all(r['passed'] for r in results)
print('NATIVE_STARTUP_SOURCE_INDICATORS=' + json.dumps({'status': 'passed' if passed else 'failed',
      'count': len(results), 'indicators': results, 'scope': policy['scope'],
      'android_runtime_started': False, 'document_epoch_simulation': False, 'user_data_read': False}, sort_keys=True))
sys.exit(0 if passed else 1)
