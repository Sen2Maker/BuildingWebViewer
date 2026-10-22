#!/usr/bin/env python3
"""Verify exact reviewed M2 real payload/runtime; never synthesize/rebuild assets."""
import argparse
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify(root, manifest_path, installed=False):
    root = Path(root).resolve()
    mobile = root / 'mobile'
    manifest = json.loads(Path(manifest_path).read_text())
    require(manifest.get('status') == 'FROZEN_NATIVE_ONLY_REVIEW' and
            manifest.get('payloadKind') == 'full-cad-free-main-app', 'Not a frozen real-main payload manifest')
    rows = {row['path']: row for row in manifest['files']}
    require(len(rows) == len(manifest['files']) == manifest.get('fileCount'), 'Source manifest count/duplicates')
    pins = json.loads((mobile / 'bundled-pins.json').read_text())
    expected_pins = {'build': manifest['publicPayloadBuild'],
                     'inventoryBytes': manifest['publicPayloadInventoryBytes'],
                     'inventorySha256': manifest['publicPayloadInventorySha256'],
                     'fixtureOnly': False, 'postSyncFinalized': True}
    require(pins == expected_pins, 'Synthetic, pre-sync, changed or unexpected main bundle pins')
    require(pins['build'].startswith('main-app-') and 'fixture' not in pins['build'], 'Not the real main build')
    require(not (mobile / 'native-fixture-owner.json').exists(), 'Synthetic fixture owner marker remains')
    spec = importlib.util.spec_from_file_location('reviewed_main_assembly', mobile / 'scripts/assemble-main-web.py')
    assembler = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(assembler)
    public_root = mobile / 'android/app/src/main/assets/public'
    files = assembler.tree_bytes(public_root)
    source_prefix = 'mobile/android/app/src/main/assets/public/'
    frozen = {name.removeprefix(source_prefix): row for name, row in rows.items() if name.startswith(source_prefix)}
    require(set(files) == set(frozen), 'Public payload differs from exact frozen source path set')
    require(len(files) == manifest['publicPayloadFiles'] == 109, 'Expected exact 109-file main payload')
    for name, data in files.items():
        row = frozen[name]
        require(len(data) == row['bytes'] and digest(data) == row['sha256'], 'Frozen public bytes changed: ' + name)
    raw = files['asset-inventory.json']
    require(len(raw) == pins['inventoryBytes'] and digest(raw) == pins['inventorySha256'], 'Inventory/pins mismatch')
    payload = assembler.verified_inventory(files)
    assembler.validate_pages(payload)
    for page in ['assets/mobile/index.html', 'assets/mobile/self-test.html', 'lod.html',
                 'wireframe.html', 'pointcloud.html', 'gaussian.html', 'generate.html']:
        require(page in payload, 'Missing real entry: ' + page)
    for name, length, sha in [
        ('assets/native/gaussian-vertex.glsl', 6724, '95e93940f5d8705aa5578f1e5314ac6961a4b93979c1f29076dcae19a7548c11'),
        ('assets/native/gaussian-fragment.glsl', 270, 'a98a387cba72dcdb2c399d0e9cb363894dd73ae23e608efbe9bff2dcfbac2f70')]:
        require(len(payload[name]) == length and digest(payload[name]) == sha, 'Missing/fake native shader')
    for name in ['cordova.js', 'cordova_plugins.js']:
        require(payload[name] == b'', 'Unexpected generated Cordova stub')
    web = assembler.tree_bytes(mobile / 'web')
    source_payload = assembler.verified_inventory(web)
    require(payload == {**source_payload, **assembler.STUBS}, 'Packaged bytes differ from exact pre-sync web inputs')
    identity = json.loads(payload['native-web.json'])
    require(identity['build'] == pins['build'] and identity['packageId'] == 'io.github.sen2maker.buildingwebviewer'
            and identity['version'] == '1.0.0' and identity['nativeApi'] == 1, 'Native identity mismatch')
    graph = json.loads(payload['build-modules.json'])
    require(graph.get('app') == 'main' and graph.get('modules'), 'Missing real main module graph')
    forbidden = re.compile(r'(?:^|/)(?:cad(?:-editor)?(?:[./-]|$)|libredwg|dxf-parser|opencascade|occt|libdxfrw)', re.I)
    require(not any(forbidden.search(name) for name in graph['modules']), 'CAD module in main payload')
    if installed:
        target = mobile / 'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor'
        patches = mobile / 'native-patches'
        for package in ['android', 'core']:
            require(json.loads((mobile / 'node_modules/@capacitor' / package / 'package.json').read_text()).get('version') == '8.5.3',
                    'Installed Capacitor package version drift: ' + package)
        for name, pin in json.loads((patches / 'capacitor-8.5.3-hashes.json').read_text()).items():
            require(digest((target / name).read_bytes()) == pin['after'], 'Installed overlay mismatch: ' + name)
        for name, pin in json.loads((patches / 'helper-hashes.json').read_text()).items():
            require(digest((target / name).read_bytes()) == pin, 'Installed helper mismatch: ' + name)
        runtime = json.loads((patches / 'runtime-hashes.json').read_text())
        expected_runtime = {
            '@capacitor/android/capacitor/src/main/assets/native-bridge.js': 'runtime/native-bridge.js',
            '@capacitor/core/dist/capacitor.js': 'runtime/capacitor.js'}
        require(runtime.get('schema') == 1 and runtime.get('version') == '8.5.3' and
                len(runtime['files']) == 2 and {r['path']: r['payload'] for r in runtime['files']} == expected_runtime,
                'Runtime overlay target set/version drift')
        for row in runtime['files']:
            payload_file = patches / row['payload']
            installed_file = mobile / 'node_modules' / row['path']
            require(not payload_file.is_symlink() and not installed_file.is_symlink(), 'Runtime overlay symlink')
            require(digest(payload_file.read_bytes()) == row['after'] == digest(installed_file.read_bytes()),
                    'Installed runtime overlay mismatch: ' + row['path'])
        require((mobile / 'node_modules/@capacitor/core/dist/capacitor.js').read_bytes() == payload['assets/js/capacitor.js'],
                'Installed core is not the reviewed real payload core')
        require(not any('addJavascriptInterface(' in p.read_text() for p in target.rglob('*.java')),
                'Unexpected origin-blind JavaScript interface in dependency')
    return {'status': 'passed', 'scope': 'Exact frozen real-main payload/source only; not runtime startup or device acceptance',
            'files': len(files), 'bytes': sum(map(len, files.values())), 'inventory_sha256': pins['inventorySha256'],
            'build': pins['build'], 'fixture_only': False, 'installed_overlay_checked': installed,
            'installed_runtime_files_checked': 2 if installed else 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project')
    parser.add_argument('manifest')
    parser.add_argument('--installed', action='store_true')
    args = parser.parse_args()
    try:
        result = verify(args.project, args.manifest, args.installed)
        print('NATIVE_MAIN_PAYLOAD_RESULT=' + json.dumps(result, sort_keys=True))
        return 0
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print('NATIVE_MAIN_PAYLOAD_RESULT=' + json.dumps({'status': 'failed', 'reason': str(exc)[:400]}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
