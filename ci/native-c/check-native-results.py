#!/usr/bin/env python3
"""Report independent native CI diagnostics before failing any result gate."""
import json
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

MAX_XML_BYTES = 8 * 1024 * 1024
MAX_UNIT_REPORTS = 200
MAX_ISSUES = 200  # Full current lint triage; bounded fields and explicit omitted count.
MAX_LOCATIONS = 3
MAX_PATHS = 20
SEVERITIES = ('Fatal', 'Error', 'Warning', 'Information', 'Ignore')


def bounded(value, limit):
    value = str(value or '')
    return value if len(value) <= limit else value[:limit] + '…'


def read_xml(path, root):
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise ValueError('XML report escapes the project or is a symlink')
    if path.stat().st_size > MAX_XML_BYTES:
        raise ValueError('XML report exceeds 8 MiB limit')
    data = path.read_bytes()
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('XML document type/entity declarations are forbidden')
    return ET.fromstring(data)


def lint_result(android, root):
    path = android / 'app/build/reports/lint-results-release.xml'
    result = {'status': 'missing', 'severity_counts': {}, 'issues': [], 'omitted_issues': 0}
    if not path.is_file():
        return result
    try:
        node = read_xml(path, root)
        if node.tag != 'issues':
            raise ValueError('Unexpected lint XML root')
        issues = node.findall('issue')
        counts = result['severity_counts']
        for issue in issues:
            level = issue.get('severity', 'UNKNOWN')
            level = level if level in SEVERITIES else 'UNKNOWN'
            counts[level] = counts.get(level, 0) + 1
        # Show blockers first even when the report lists many warnings first.
        order = {'Fatal': 0, 'Error': 1, 'UNKNOWN': 2, 'Warning': 3, 'Information': 4, 'Ignore': 5}
        issues.sort(key=lambda issue: order.get(issue.get('severity'), 2))
        for issue in issues[:MAX_ISSUES]:
            locations = issue.findall('location')
            result['issues'].append({
                'id': bounded(issue.get('id', 'UNKNOWN'), 100),
                'severity': bounded(issue.get('severity', 'UNKNOWN'), 30),
                'message': bounded(issue.get('message', ''), 600),
                'locations': [{key: bounded(location.get(key, ''), 300 if key == 'file' else 20)
                               for key in ('file', 'line', 'column')} for location in locations[:MAX_LOCATIONS]],
                'omitted_locations': max(0, len(locations) - MAX_LOCATIONS),
            })
        result['omitted_issues'] = max(0, len(issues) - MAX_ISSUES)
        result['status'] = 'failed' if any(counts.get(level, 0) for level in ('Fatal', 'Error', 'UNKNOWN')) else 'passed'
    except (OSError, ValueError, ET.ParseError) as exc:
        result.update(status='invalid', error=bounded(exc, 300))
    return result


def junit_result(android, root):
    reports = sorted((android / 'app/build/test-results/testReleaseUnitTest').glob('TEST-*.xml'))
    result = {'status': 'missing', 'reports': len(reports), 'tests': 0, 'failures': 0, 'errors': 0, 'skipped': 0}
    if not reports:
        result['reason'] = 'No actual release-unit XML results; NO-SOURCE is not acceptance'
        return result
    try:
        if len(reports) > MAX_UNIT_REPORTS:
            raise ValueError('Too many JUnit XML reports')
        for report in reports:
            node = read_xml(report, root)
            if node.tag != 'testsuite':
                raise ValueError('Unexpected JUnit XML root: ' + bounded(report.name, 100))
            values = {}
            for key in ('tests', 'failures', 'errors', 'skipped'):
                value = node.get(key, '0' if key != 'tests' else '')
                if not value.isascii() or not value.isdecimal() or len(value) > 10:
                    raise ValueError('Invalid JUnit count: ' + key)
                values[key] = int(value)
            if any(values[key] > values['tests'] for key in ('failures', 'errors', 'skipped')):
                raise ValueError('JUnit subcount exceeds tests')
            for key, value in values.items():
                result[key] += value
        result['status'] = 'passed' if (result['tests'] > result['skipped'] and
                                         not result['failures'] and not result['errors']) else 'failed'
    except (OSError, ValueError, ET.ParseError) as exc:
        result.update(status='invalid', error=bounded(exc, 300))
    return result


def output_result(root):
    result = {'status': 'passed', 'count': 0, 'paths': [], 'omitted_paths': 0}
    try:
        suffixes = {'.apk', '.aab', '.apks', '.jks', '.keystore', '.p12', '.pfx'}
        for path in root.rglob('*'):
            if path.is_file() and path.suffix.lower() in suffixes:
                result['count'] += 1
                if len(result['paths']) < MAX_PATHS:
                    result['paths'].append(bounded(path.relative_to(root), 300))
        result['omitted_paths'] = max(0, result['count'] - MAX_PATHS)
        if result['count']:
            result['status'] = 'failed'
    except OSError as exc:
        result.update(status='invalid', error=bounded(exc, 300))
    return result


def main():
    root = Path(sys.argv[1]).resolve()
    android = root / 'mobile/android'
    # Do not short-circuit: all diagnostics are printed before the final failure.
    results = {'lint': lint_result(android, root), 'junit': junit_result(android, root),
               'forbidden_outputs': output_result(root)}
    for name, result in results.items():
        print('NATIVE_' + name.upper() + '_RESULT=' + json.dumps(result, sort_keys=True))
    passed = all(result['status'] == 'passed' for result in results.values())
    print('NATIVE_RESULT_GATE=' + json.dumps({
        'status': 'passed' if passed else 'failed',
        'scope': 'Native compile/lint/local unit checks only; not APK, full App, rendering, or device acceptance',
        'gradle_status': 'The Gradle step outcome remains independently authoritative; this report cannot turn it green',
    }, sort_keys=True))
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main())
