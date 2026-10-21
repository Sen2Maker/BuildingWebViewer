#!/usr/bin/env python3
"""Require real local-unit/lint results, and refuse any installable output."""
import json
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

root = Path(sys.argv[1]).resolve()
android = root / 'mobile/android'
for suffix in ('.apk', '.aab', '.apks', '.jks', '.keystore'):
    found = [str(p.relative_to(root)) for p in root.rglob('*' + suffix) if p.is_file()]
    if found:
        raise SystemExit('Forbidden output: ' + ', '.join(found))

reports = sorted((android / 'app/build/test-results/testReleaseUnitTest').glob('TEST-*.xml'))
if not reports:
    raise SystemExit('No actual release-unit XML results; NO-SOURCE is not acceptance')
tests = failures = errors = skipped = 0
for report in reports:
    node = ET.parse(report).getroot()
    if node.tag != 'testsuite':
        raise SystemExit('Unexpected JUnit XML root: ' + report.name)
    tests += int(node.get('tests', '0'))
    failures += int(node.get('failures', '0'))
    errors += int(node.get('errors', '0'))
    skipped += int(node.get('skipped', '0'))
if tests == 0 or tests == skipped or failures or errors:
    raise SystemExit(f'Unit results not passing: tests={tests}, skipped={skipped}, failures={failures}, errors={errors}')

lint = android / 'app/build/reports/lint-results-release.xml'
if not lint.is_file():
    raise SystemExit('Missing actual release lint XML result')
lint_node = ET.parse(lint).getroot()
if lint_node.tag != 'issues':
    raise SystemExit('Unexpected lint XML root')
severity = {}
for issue in lint_node.findall('issue'):
    level = issue.get('severity', 'UNKNOWN')
    severity[level] = severity.get(level, 0) + 1
if any(severity.get(level, 0) for level in ('Fatal', 'Error', 'UNKNOWN')):
    raise SystemExit('Lint contains failures: ' + json.dumps(severity, sort_keys=True))
print(json.dumps({'scope': 'Native compilation/lint/local unit tests only; no APK, full App, rendering or device acceptance', 'unit_tests': tests, 'unit_skipped': skipped, 'lint_severity_counts': severity}, sort_keys=True))
