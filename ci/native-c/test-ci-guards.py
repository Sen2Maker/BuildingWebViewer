#!/usr/bin/env python3
"""Local synthetic tests for CI validation helpers, not Android tests."""
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='bwv-native-guards-')
        self.base = Path(self.tmp.name)
        self.root = self.base / 'project'
        self.root.mkdir()
        self.junit_source = b'// Synthetic reviewed unit-test source\n'
        (self.base / 'expected-junit.json').write_text(json.dumps({
            'schema': 1, 'suiteCount': 1, 'testCount': 2, 'allowSkipped': False,
            'suites': [{'suite': 'synthetic.GuardTest', 'sourcePath': 'unit-source.java',
                        'sourceSha256': hashlib.sha256(self.junit_source).hexdigest(),
                        'tests': ['case0', 'case1']}]}))

    def tearDown(self):
        self.tmp.cleanup()

    def run_helper(self, name, *args, ok):
        if name == 'check-native-results.py' and len(args) == 1:
            args = (*args, self.base / 'expected-junit.json')
        if name == 'verify-native-fixture.py' and len(args) == 1:
            args = (*args, self.base / 'fixture-manifest.json')
        result = subprocess.run([sys.executable, str(HERE / name), *map(str, args)], text=True, capture_output=True)
        self.assertEqual(result.returncode == 0, ok, result.stdout + result.stderr)
        return result

    def manifest(self, **changes):
        source = self.root / 'source.java'
        source.write_bytes(b'// own synthetic test source\n')
        data = {'status': 'FROZEN_NATIVE_ONLY_REVIEW', 'files': [{'path': 'source.java', 'bytes': source.stat().st_size, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}]}
        data.update(changes)
        path = self.base / 'native-files.json'
        path.write_text(json.dumps(data))
        return path

    def fixture(self):
        public = self.root / 'mobile/android/app/src/main/assets/public'
        public.mkdir(parents=True)
        data = b'{"build":"native-diagnostic-fixture-c2"}\n'
        (public / 'native-web.json').write_bytes(data)
        raw = (json.dumps({'schema': 1, 'files': [{'path': 'native-web.json', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}]}, separators=(',', ':')) + '\n').encode()
        (public / 'asset-inventory.json').write_bytes(raw)
        (self.root / 'mobile/bundled-pins.json').write_text(json.dumps({'fixtureOnly': True, 'build': 'native-diagnostic-fixture-c2', 'inventoryBytes': len(raw), 'inventorySha256': hashlib.sha256(raw).hexdigest()}))
        (self.base / 'fixture-manifest.json').write_text(json.dumps({
            'status': 'FROZEN_NATIVE_ONLY_REVIEW', 'publicFixtureBuild': 'native-diagnostic-fixture-c2',
            'publicFixtureInventoryBytes': len(raw), 'publicFixtureFiles': 2,
            'publicFixtureInventorySha256': hashlib.sha256(raw).hexdigest()}))
        return public

    def results(self, tests='2', skipped='0', failures='0', errors='0', severity=None):
        app = self.root / 'mobile/android/app/build'
        unit = app / 'test-results/testReleaseUnitTest'
        unit.mkdir(parents=True)
        (self.root / 'unit-source.java').write_bytes(self.junit_source)
        cases = []
        for i in range(max(0, int(tests))):
            status = '<skipped/>' if i < int(skipped) else '<failure/>' if i < int(skipped) + int(failures) else '<error/>' if i < int(skipped) + int(failures) + int(errors) else ''
            cases.append(f'<testcase classname="synthetic.GuardTest" name="case{i}">{status}</testcase>')
        (unit / 'TEST-synthetic.GuardTest.xml').write_text(f'<testsuite name="synthetic.GuardTest" tests="{tests}" skipped="{skipped}" failures="{failures}" errors="{errors}">' + ''.join(cases) + '</testsuite>')
        lint = app / 'reports'
        lint.mkdir()
        (lint / 'lint-results-release.xml').write_text('<issues>' + (f'<issue severity="{severity}"/>' if severity else '') + '</issues>')
        return app

    def test_allowlist_pass(self):
        self.run_helper('verify-native-allowlist.py', self.root, self.manifest(), ok=True)

    def test_allowlist_unfrozen(self):
        self.run_helper('verify-native-allowlist.py', self.root, self.manifest(status='DRAFT'), ok=False)

    def test_allowlist_unlisted(self):
        m = self.manifest()
        (self.root / 'extra').write_text('unexpected')
        self.run_helper('verify-native-allowlist.py', self.root, m, ok=False)

    def test_allowlist_drift(self):
        m = self.manifest()
        (self.root / 'source.java').write_text('changed')
        self.run_helper('verify-native-allowlist.py', self.root, m, ok=False)

    def test_allowlist_symlink(self):
        m = self.manifest()
        (self.root / 'link').symlink_to(self.root / 'source.java')
        self.run_helper('verify-native-allowlist.py', self.root, m, ok=False)

    def test_allowlist_traversal(self):
        m = self.manifest(files=[{'path': '../outside', 'bytes': 0, 'sha256': '0' * 64}])
        self.run_helper('verify-native-allowlist.py', self.root, m, ok=False)

    def test_fixture_pass(self):
        self.fixture()
        self.run_helper('verify-native-fixture.py', self.root, ok=True)

    def test_fixture_extra_stub(self):
        (self.fixture() / 'cordova.js').write_bytes(b'')
        self.run_helper('verify-native-fixture.py', self.root, ok=False)

    def test_fixture_changed(self):
        (self.fixture() / 'native-web.json').write_text('{}')
        self.run_helper('verify-native-fixture.py', self.root, ok=False)

    def test_fixture_symlink(self):
        p = self.fixture()
        (p / 'link').symlink_to(p / 'native-web.json')
        self.run_helper('verify-native-fixture.py', self.root, ok=False)

    def test_fixture_changed_pins(self):
        self.fixture()
        p = self.root / 'mobile/bundled-pins.json'
        obj = json.loads(p.read_text())
        obj['inventorySha256'] = '0' * 64
        p.write_text(json.dumps(obj))
        self.run_helper('verify-native-fixture.py', self.root, ok=False)

    def test_results_pass(self):
        self.results()
        self.run_helper('check-native-results.py', self.root, ok=True)

    def test_results_warning_reported(self):
        self.results(severity='Warning')
        self.run_helper('check-native-results.py', self.root, ok=True)

    def test_results_no_source(self):
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_zero(self):
        self.results(tests='0')
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_all_skipped(self):
        self.results(skipped='2')
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_failure(self):
        self.results(failures='1')
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_error(self):
        self.results(errors='1')
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_lint_error(self):
        self.results(severity='Error')
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_apk(self):
        (self.results() / 'unexpected.apk').write_bytes(b'synthetic')
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_private_key_store(self):
        self.results()
        (self.root / 'test.keystore').write_bytes(b'synthetic')
        self.run_helper('check-native-results.py', self.root, ok=False)


    def diagnostics(self, ok=False):
        result = self.run_helper('check-native-results.py', self.root, ok=ok)
        parsed = {}
        for line in result.stdout.splitlines():
            key, value = line.split('=', 1)
            parsed[key] = json.loads(value)
        self.assertEqual(set(parsed), {'NATIVE_LINT_RESULT', 'NATIVE_JUNIT_RESULT',
                                      'NATIVE_FORBIDDEN_OUTPUTS_RESULT', 'NATIVE_RESULT_GATE'})
        return parsed, result.stdout

    def test_results_missing_junit_still_exposes_lint(self):
        app = self.results(severity='Error')
        (app / 'test-results/testReleaseUnitTest/TEST-synthetic.GuardTest.xml').unlink()
        data, _ = self.diagnostics()
        self.assertEqual(data['NATIVE_JUNIT_RESULT']['status'], 'missing')
        self.assertEqual(data['NATIVE_LINT_RESULT']['severity_counts'], {'Error': 1})
        self.assertEqual(data['NATIVE_LINT_RESULT']['status'], 'failed')

    def test_results_invalid_junit_still_exposes_lint(self):
        app = self.results(severity='Error')
        (app / 'test-results/testReleaseUnitTest/TEST-synthetic.GuardTest.xml').write_text('<broken')
        data, _ = self.diagnostics()
        self.assertEqual(data['NATIVE_JUNIT_RESULT']['status'], 'invalid')
        self.assertEqual(data['NATIVE_LINT_RESULT']['status'], 'failed')

    def test_results_missing_lint_still_exposes_junit(self):
        app = self.results()
        (app / 'reports/lint-results-release.xml').unlink()
        data, _ = self.diagnostics()
        self.assertEqual(data['NATIVE_LINT_RESULT']['status'], 'missing')
        self.assertEqual(data['NATIVE_JUNIT_RESULT']['status'], 'passed')

    def test_results_invalid_lint_still_exposes_junit(self):
        app = self.results()
        (app / 'reports/lint-results-release.xml').write_text('<broken')
        data, _ = self.diagnostics()
        self.assertEqual(data['NATIVE_LINT_RESULT']['status'], 'invalid')
        self.assertEqual(data['NATIVE_JUNIT_RESULT']['status'], 'passed')

    def test_results_forbidden_output_does_not_hide_xml_status(self):
        (self.results(severity='Error') / 'unexpected.APK').write_bytes(b'synthetic')
        data, _ = self.diagnostics()
        self.assertEqual(data['NATIVE_FORBIDDEN_OUTPUTS_RESULT']['count'], 1)
        self.assertEqual(data['NATIVE_JUNIT_RESULT']['status'], 'passed')
        self.assertEqual(data['NATIVE_LINT_RESULT']['status'], 'failed')

    def test_results_lint_diagnostics_are_bounded_and_blockers_first(self):
        app = self.results()
        locations = ''.join('<location file="' + 'x' * 1000 + '" line="212" column="7"/>' for _ in range(5))
        warning = '<issue id="WarningId" severity="Warning" message="' + 'w' * 2000 + '">' + locations + '</issue>'
        error = '<issue id="NewApi" severity="Error" message="Requires API 35">' + locations + '</issue>'
        (app / 'reports/lint-results-release.xml').write_text('<issues>' + warning * 253 + error + '</issues>')
        data, output = self.diagnostics()
        lint = data['NATIVE_LINT_RESULT']
        self.assertEqual(lint['severity_counts'], {'Warning': 253, 'Error': 1})
        self.assertEqual(len(lint['issues']), 200)
        self.assertEqual(lint['omitted_issues'], 54)
        first = lint['issues'][0]
        self.assertEqual(first['id'], 'NewApi')
        self.assertEqual(first['message'], 'Requires API 35')
        self.assertEqual(first['locations'][0]['line'], '212')
        self.assertEqual(len(first['locations']), 3)
        self.assertEqual(first['omitted_locations'], 2)
        self.assertLess(len(output), 400000)

    def test_results_all_current_53_warnings_visible(self):
        app = self.results()
        warnings = ''.join(f'<issue id="Warning{i}" severity="Warning" message="Synthetic warning {i}"/>' for i in range(53))
        (app / 'reports/lint-results-release.xml').write_text('<issues>' + warnings + '</issues>')
        data, _ = self.diagnostics(ok=True)
        lint = data['NATIVE_LINT_RESULT']
        self.assertEqual(lint['severity_counts'], {'Warning': 53})
        self.assertEqual(len(lint['issues']), 53)
        self.assertEqual(lint['omitted_issues'], 0)
        self.assertEqual(lint['issues'][-1]['id'], 'Warning52')

    def test_fixture_rehashed_pins_do_not_replace_frozen_manifest(self):
        public = self.fixture()
        data = b'{"build":"native-diagnostic-fixture-c2","unexpected":"drift"}'
        (public / 'native-web.json').write_bytes(data)
        raw = (json.dumps({'schema': 1, 'files': [{'path': 'native-web.json', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}]}) + '\n').encode()
        (public / 'asset-inventory.json').write_bytes(raw)
        pins = self.root / 'mobile/bundled-pins.json'
        value = json.loads(pins.read_text())
        value.update(inventoryBytes=len(raw), inventorySha256=hashlib.sha256(raw).hexdigest())
        pins.write_text(json.dumps(value))
        self.run_helper('verify-native-fixture.py', self.root, ok=False)

    def test_fixture_previous_c1_build_rejected(self):
        self.fixture()
        pins = self.root / 'mobile/bundled-pins.json'
        value = json.loads(pins.read_text())
        value['build'] = 'native-compile-fixture-c1'
        pins.write_text(json.dumps(value))
        self.run_helper('verify-native-fixture.py', self.root, ok=False)

    def test_fixture_unfrozen_manifest_rejected(self):
        self.fixture()
        manifest = self.base / 'fixture-manifest.json'
        value = json.loads(manifest.read_text())
        value['status'] = 'DRAFT'
        manifest.write_text(json.dumps(value))
        self.run_helper('verify-native-fixture.py', self.root, ok=False)

    def test_fixture_wrong_frozen_file_count_rejected(self):
        self.fixture()
        manifest = self.base / 'fixture-manifest.json'
        value = json.loads(manifest.read_text())
        value['publicFixtureFiles'] = 3
        manifest.write_text(json.dumps(value))
        self.run_helper('verify-native-fixture.py', self.root, ok=False)

    def unit_report(self):
        return self.root / 'mobile/android/app/build/test-results/testReleaseUnitTest/TEST-synthetic.GuardTest.xml'

    def test_results_partial_skip_fails(self):
        self.results(skipped='1')
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_full_record_set_visible(self):
        self.results()
        data, _ = self.diagnostics(ok=True)
        self.assertEqual(data['NATIVE_JUNIT_RESULT']['records'], [
            {'suite': 'synthetic.GuardTest', 'test': 'case0', 'status': 'passed'},
            {'suite': 'synthetic.GuardTest', 'test': 'case1', 'status': 'passed'}])

    def test_results_summary_without_cases_rejected(self):
        self.results()
        self.unit_report().write_text('<testsuite name="synthetic.GuardTest" tests="2"/>')
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_duplicate_case_rejected(self):
        self.results()
        p = self.unit_report(); p.write_text(p.read_text().replace('case1', 'case0'))
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_substituted_case_rejected(self):
        self.results()
        p = self.unit_report(); p.write_text(p.read_text().replace('case1', 'unknown'))
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_other_class_rejected(self):
        self.results()
        p = self.unit_report(); p.write_text(p.read_text().replace('classname="synthetic.GuardTest"', 'classname="other.Test"'))
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_extra_suite_rejected(self):
        self.results()
        (self.unit_report().parent / 'TEST-extra.Test.xml').write_text('<testsuite name="extra.Test" tests="0"/>')
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_hidden_skip_rejected(self):
        self.results()
        p = self.unit_report(); p.write_text(p.read_text().replace('name="case0"></testcase>', 'name="case0"><skipped/></testcase>'))
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_changed_expected_source_rejected(self):
        self.results()
        (self.root / 'unit-source.java').write_text('changed')
        self.run_helper('check-native-results.py', self.root, ok=False)

    def test_results_unknown_severity_fails_closed(self):
        self.results(severity='UnexpectedLevel')
        data, _ = self.diagnostics()
        self.assertEqual(data['NATIVE_LINT_RESULT']['severity_counts'], {'UNKNOWN': 1})

    def test_results_oversized_lint_does_not_hide_junit(self):
        app = self.results()
        (app / 'reports/lint-results-release.xml').write_bytes(b' ' * (8 * 1024 * 1024 + 1))
        data, _ = self.diagnostics()
        self.assertEqual(data['NATIVE_LINT_RESULT']['status'], 'invalid')
        self.assertEqual(data['NATIVE_JUNIT_RESULT']['status'], 'passed')

    def test_results_entity_declaration_rejected(self):
        app = self.results()
        (app / 'reports/lint-results-release.xml').write_text('<!DOCTYPE issues [<!ENTITY x "content">]><issues/>')
        data, _ = self.diagnostics()
        self.assertEqual(data['NATIVE_LINT_RESULT']['status'], 'invalid')

    def test_results_negative_unit_counts_rejected(self):
        self.results(tests='-1')
        data, _ = self.diagnostics()
        self.assertEqual(data['NATIVE_JUNIT_RESULT']['status'], 'invalid')

    def test_results_inconsistent_unit_counts_rejected(self):
        self.results(skipped='3')
        data, _ = self.diagnostics()
        self.assertEqual(data['NATIVE_JUNIT_RESULT']['status'], 'invalid')

    def test_results_symlink_report_rejected(self):
        app = self.results()
        lint = app / 'reports/lint-results-release.xml'
        outside = self.base / 'outside.xml'
        outside.write_text('<issues/>')
        lint.unlink()
        lint.symlink_to(outside)
        data, _ = self.diagnostics()
        self.assertEqual(data['NATIVE_LINT_RESULT']['status'], 'invalid')

    def test_results_no_reports_reports_both_missing(self):
        data, _ = self.diagnostics()
        self.assertEqual(data['NATIVE_LINT_RESULT']['status'], 'missing')
        self.assertEqual(data['NATIVE_JUNIT_RESULT']['status'], 'missing')

    def test_results_warning_details_preserved_on_pass(self):
        self.results(severity='Warning')
        data, _ = self.diagnostics(ok=True)
        self.assertEqual(data['NATIVE_LINT_RESULT']['severity_counts'], {'Warning': 1})
        self.assertEqual(data['NATIVE_JUNIT_RESULT']['tests'], 2)
        self.assertEqual(data['NATIVE_RESULT_GATE']['status'], 'passed')


if __name__ == '__main__':
    unittest.main()
