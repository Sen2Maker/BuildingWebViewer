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

    def tearDown(self):
        self.tmp.cleanup()

    def run_helper(self, name, *args, ok):
        result = subprocess.run([sys.executable, str(HERE / name), *map(str, args)], text=True, capture_output=True)
        self.assertEqual(result.returncode == 0, ok, result.stdout + result.stderr)

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
        data = b'{"build":"native-compile-fixture-c1"}\n'
        (public / 'native-web.json').write_bytes(data)
        raw = (json.dumps({'schema': 1, 'files': [{'path': 'native-web.json', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}]}, separators=(',', ':')) + '\n').encode()
        (public / 'asset-inventory.json').write_bytes(raw)
        (self.root / 'mobile/bundled-pins.json').write_text(json.dumps({'fixtureOnly': True, 'build': 'native-compile-fixture-c1', 'inventoryBytes': len(raw), 'inventorySha256': hashlib.sha256(raw).hexdigest()}))
        return public

    def results(self, tests='2', skipped='0', failures='0', errors='0', severity=None):
        app = self.root / 'mobile/android/app/build'
        unit = app / 'test-results/testReleaseUnitTest'
        unit.mkdir(parents=True)
        (unit / 'TEST-Synthetic.xml').write_text(f'<testsuite tests="{tests}" skipped="{skipped}" failures="{failures}" errors="{errors}"/>')
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


if __name__ == '__main__':
    unittest.main()
