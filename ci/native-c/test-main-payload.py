#!/usr/bin/env python3
"""Tamper regressions on copied real reviewed assets; not Android/device tests."""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


class MainPayloadTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='bwv-m11-payload-')
        self.base = Path(self.tmp.name)
        self.root = self.base / 'project'
        # Never copy dependency trees or build output when this test is rerun later.
        manifest = json.loads((HERE / 'native-files.json').read_text())
        for row in manifest['files']:
            src, dst = HERE / 'project' / row['path'], self.root / row['path']
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
        self.manifest = self.base / 'native-files.json'
        shutil.copyfile(HERE / 'native-files.json', self.manifest)
        self.public = self.root / 'mobile/android/app/src/main/assets/public'
        self.pins = self.root / 'mobile/bundled-pins.json'

    def tearDown(self):
        self.tmp.cleanup()

    def check(self, ok, installed=False):
        args = [sys.executable, '-B', str(HERE / 'verify-main-payload.py'), str(self.root), str(self.manifest)]
        if installed:
            args.append('--installed')
        result = subprocess.run(args, capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, ok, result.stdout + result.stderr)
        return result

    def change_json(self, path, **changes):
        value = json.loads(path.read_text())
        value.update(changes)
        path.write_text(json.dumps(value))

    def rehash(self):
        # Deliberately changes the local test manifest too. Dedicated non-fixture,
        # shader and page constraints must still refuse invalid/self-authorized bytes.
        rows = []
        for p in sorted(self.public.rglob('*')):
            if p.is_file() and p.name != 'asset-inventory.json':
                data = p.read_bytes()
                rows.append({'path': p.relative_to(self.public).as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        raw = (json.dumps({'schema': 1, 'files': rows}, separators=(',', ':')) + '\n').encode()
        (self.public / 'asset-inventory.json').write_bytes(raw)
        self.change_json(self.pins, inventoryBytes=len(raw), inventorySha256=hashlib.sha256(raw).hexdigest())
        value = json.loads(self.manifest.read_text())
        for row in value['files']:
            p = self.root / row['path']
            data = p.read_bytes(); row.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        value.update(publicPayloadInventoryBytes=len(raw), publicPayloadInventorySha256=hashlib.sha256(raw).hexdigest())
        self.manifest.write_text(json.dumps(value))

    def test_exact_real_payload_passes(self):
        self.check(True)

    def test_fixture_flag_rejected(self):
        self.change_json(self.pins, fixtureOnly=True)
        self.check(False)

    def test_pre_sync_flag_rejected(self):
        self.change_json(self.pins, postSyncFinalized=False)
        self.check(False)

    def test_missing_finalized_flag_rejected(self):
        value = json.loads(self.pins.read_text()); del value['postSyncFinalized']; self.pins.write_text(json.dumps(value))
        self.check(False)

    def test_legacy_owner_marker_rejected(self):
        (self.root / 'mobile/native-fixture-owner.json').write_text('{}')
        self.check(False)

    def test_missing_page_rejected(self):
        (self.public / 'gaussian.html').unlink()
        self.check(False)

    def test_unlisted_cad_payload_rejected(self):
        (self.public / 'cad-engine.wasm').write_bytes(b'fake')
        self.check(False)

    def test_changed_asset_rejected(self):
        (self.public / 'gaussian.html').write_text('changed')
        self.check(False)

    def test_symlink_rejected(self):
        p = self.public / 'favicon.svg'; p.unlink(); p.symlink_to(self.public / 'index.html')
        self.check(False)

    def test_pins_drift_rejected(self):
        self.change_json(self.pins, inventorySha256='0' * 64)
        self.check(False)

    def test_fake_shader_rejected_even_when_rehashed(self):
        (self.public / 'assets/native/gaussian-vertex.glsl').write_text('#version 300 es\nvoid main(){gl_Position=vec4(0.0);}\n')
        self.rehash()
        self.check(False)

    def test_missing_core_rejected_even_when_rehashed(self):
        p = self.public / 'gaussian.html'; p.write_text(p.read_text().replace('capacitor.js', 'missing-core.js'))
        self.rehash()
        self.check(False)

    def test_empty_cordova_stub_required(self):
        (self.public / 'cordova.js').write_text('unexpected')
        self.rehash()
        self.check(False)

    def test_web_input_drift_rejected(self):
        (self.root / 'mobile/web/gaussian.html').write_text('changed')
        self.check(False)

    def test_manifest_not_frozen_rejected(self):
        self.change_json(self.manifest, status='DRAFT')
        self.check(False)

    def test_wrong_real_payload_kind_rejected(self):
        self.change_json(self.manifest, payloadKind='synthetic')
        self.check(False)

    def test_installed_check_missing_dependency_fails(self):
        self.check(False, installed=True)

    def installed_fixture(self):
        # Source-derived helper fixture only, not an npm installation or real signature check.
        mobile = self.root / 'mobile'
        patches = mobile / 'native-patches'
        target = mobile / 'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor'
        for name in json.loads((patches / 'capacitor-8.5.3-hashes.json').read_text()):
            out = target / name; out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(patches / 'patched' / name, out)
        for name in json.loads((patches / 'helper-hashes.json').read_text()):
            out = target / name; out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(patches / name, out)
        for row in json.loads((patches / 'runtime-hashes.json').read_text())['files']:
            out = mobile / 'node_modules' / row['path']; out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(patches / row['payload'], out)
        for package in ['android', 'core']:
            (mobile / 'node_modules/@capacitor' / package / 'package.json').write_text('{"version":"8.5.3"}')
        return mobile

    def test_installed_source_derived_fixture_passes(self):
        self.installed_fixture(); self.check(True, installed=True)

    def test_changed_installed_native_runtime_rejected(self):
        mobile = self.installed_fixture()
        (mobile / 'node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js').write_text('changed')
        self.check(False, installed=True)

    def test_changed_installed_core_runtime_rejected(self):
        mobile = self.installed_fixture()
        (mobile / 'node_modules/@capacitor/core/dist/capacitor.js').write_text('changed')
        self.check(False, installed=True)

    def test_changed_runtime_payload_rejected(self):
        mobile = self.installed_fixture()
        (mobile / 'native-patches/runtime/native-bridge.js').write_text('changed')
        self.check(False, installed=True)

    def test_duplicate_runtime_targets_rejected(self):
        mobile = self.installed_fixture(); p = mobile / 'native-patches/runtime-hashes.json'
        value = json.loads(p.read_text()); value['files'][1] = value['files'][0]; p.write_text(json.dumps(value))
        self.check(False, installed=True)

    def test_runtime_target_substitution_rejected(self):
        mobile = self.installed_fixture(); p = mobile / 'native-patches/runtime-hashes.json'
        value = json.loads(p.read_text()); value['files'][0]['path'] = '../outside.js'; p.write_text(json.dumps(value))
        self.check(False, installed=True)

    def test_runtime_symlink_rejected(self):
        mobile = self.installed_fixture(); p = mobile / 'node_modules/@capacitor/core/dist/capacitor.js'
        p.unlink(); p.symlink_to(mobile / 'native-patches/runtime/capacitor.js')
        self.check(False, installed=True)

    def test_installed_package_version_drift_rejected(self):
        mobile = self.installed_fixture()
        (mobile / 'node_modules/@capacitor/core/package.json').write_text('{"version":"9.0.0"}')
        self.check(False, installed=True)


if __name__ == '__main__':
    unittest.main()
