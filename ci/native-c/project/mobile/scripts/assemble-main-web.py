#!/usr/bin/env python3
"""Assemble actual CAD-free Vite output for native offline use; never build an APK.

The prototype Vite inventory is input evidence, not the native inventory schema.
Capacitor injects native-bridge.js into the literal <head> while serving HTML.
That bridge lacks registerPlugin. The pinned core JS must execute exactly once
after native injection and before app-shell or any application module.
"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import argparse
import hashlib
import json
import os
import posixpath
import re
import shutil
import stat
import tempfile

MOBILE = Path(__file__).resolve().parents[1]
PROJECT = MOBILE.parent
INVENTORY = 'asset-inventory.json'
STUBS = {'cordova.js': b'', 'cordova_plugins.js': b''}
SHADERS = ('assets/native/gaussian-vertex.glsl', 'assets/native/gaussian-fragment.glsl')
DIAGNOSTICS = ('android-adapter.mjs', 'android-adapter-core.mjs',
               'src/self-test-panel.css', 'src/self-test-panel.mjs',
               'src/self-test-runner.mjs', 'src/self-test-worker.mjs',
               'src/browser-worker-adapter.mjs')
RESERVED = {INVENTORY, 'resource-inventory.json', 'inventory.json', 'update-receipt.json',
            '.update-receipt.json', 'native-receipt.json', '.native-receipt.json',
            'receipt.json', '.receipt.json'}
MAX_FILE = MAX_TOTAL = 64 * 1024 * 1024
MAX_INVENTORY = 2 * 1024 * 1024
MAX_FILES = 3000
TRUSTED_CSP = ("default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; "
               "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
               "media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; "
               "worker-src 'self' blob:; frame-src 'none'; object-src 'none'; "
               "base-uri 'none'; form-action 'none'")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=True, separators=(',', ':')) + '\n').encode('ascii')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_root(root):
    root = Path(root).absolute()
    for component in [*reversed(root.parents), root]:
        require(not component.is_symlink(), 'Symlink path component: ' + str(component))
    return root


def tree_bytes(root):
    """Fail on ambiguous entries, including links and empty directories."""
    root = safe_root(root)
    require(root.is_dir(), 'Missing input directory: ' + str(root))
    result, total = {}, 0
    for current, dirs, files in os.walk(root, followlinks=False):
        require(bool(dirs or files), 'Empty payload directory: ' + str(current))
        for name in dirs + files:
            path = Path(current) / name
            mode = path.lstat().st_mode
            require(not stat.S_ISLNK(mode), 'Symlink in payload: ' + str(path))
            require(stat.S_ISDIR(mode) or stat.S_ISREG(mode), 'Non-regular payload: ' + str(path))
        for name in files:
            path = Path(current) / name
            require(path.stat().st_size <= MAX_FILE, 'Oversized asset: ' + str(path))
            data = path.read_bytes()
            total += len(data)
            require(total <= MAX_TOTAL + MAX_INVENTORY, 'Payload exceeds byte limit')
            result[path.relative_to(root).as_posix()] = data
            require(len(result) <= MAX_FILES + 1, 'Payload exceeds file count limit')
    return result


def validate_names(payload):
    """Mirror InventoryVerifier portable paths, case folding and metadata rules."""
    spellings, directories = {}, set()
    for name in payload:
        require(isinstance(name, str) and 0 < len(name) <= 240, 'Invalid path length')
        require(all(0x21 <= ord(c) <= 0x7e and c not in '\\"<>:|?*' for c in name),
                'Nonportable asset path: ' + name)
        parts = name.split('/')
        require(len(parts) <= 32, 'Asset path too deep: ' + name)
        for i, part in enumerate(parts):
            require(part and part not in ('.', '..') and not part.endswith('.'), 'Ambiguous path: ' + name)
            require(part.lower() not in RESERVED, 'Reserved metadata alias: ' + name)
            require(not re.fullmatch(r'CON|PRN|AUX|NUL|(?:COM|LPT)[1-9]', part.split('.')[0].upper()),
                    'Reserved device path: ' + name)
            # Only known empty root .nojekyll is filtered before this check.
            require(not part.startswith('.') and part.lower() not in ('cvs', 'thumbs.db', 'picasa.ini')
                    and not part.lower().endswith('.scc') and not part.endswith('~'),
                    'Asset would be excluded by AAPT: ' + name)
            prefix = '/'.join(parts[:i + 1])
            previous = spellings.setdefault(prefix.lower(), prefix)
            require(previous == prefix, 'Case-colliding asset: ' + name)
            if i < len(parts) - 1:
                directories.add(prefix)
        require(not re.search(r'(?:^|/)(?:cad(?:-editor)?(?:[./-]|$)|libredwg|dxf-parser|opencascade|occt|libdxfrw)', name, re.I)
                and Path(name).suffix.lower() not in ('.wasm', '.ttf', '.otf', '.woff', '.woff2', '.eot', '.dwg', '.dxf'),
                'CAD engine, parser, drawing or font forbidden in main App: ' + name)
    require(not (set(payload) & directories), 'File/directory path collision')


def canonical_inventory(payload):
    require(INVENTORY not in payload, 'Inventory cannot inventory itself')
    validate_names(payload)
    require(len(payload) <= MAX_FILES and sum(map(len, payload.values())) <= MAX_TOTAL, 'Inventory budget exceeded')
    rows = []
    for name, data in sorted(payload.items()):
        require(len(data) <= MAX_FILE, 'Asset exceeds native size limit: ' + name)
        rows.append({'path': name, 'bytes': len(data), 'sha256': digest(data)})
    encoded = json_bytes({'schema': 1, 'files': rows})
    require(len(encoded) <= MAX_INVENTORY, 'Inventory exceeds native size limit')
    return encoded


def verified_inventory(files, *, prototype=False):
    require(INVENTORY in files, 'Missing inventory')
    inventory = json.loads(files[INVENTORY])
    require(inventory.get('schema') == 1, 'Unsupported inventory schema')
    if prototype:
        require(inventory.get('prototype') is True, 'Expected finalized Vite prototype input')
    else:
        require(set(inventory) == {'schema', 'files'}, 'Native inventory must use the exact canonical schema')
    rows = inventory['files']
    require(all(isinstance(row, dict) and set(row) == {'path', 'bytes', 'sha256'} for row in rows), 'Invalid inventory entry schema')
    names = [row['path'] for row in rows]
    require(len(set(names)) == len(names), 'Duplicate inventory entries')
    payload = {name: data for name, data in files.items() if name != INVENTORY}
    require(set(names) == set(payload), 'Input inventory does not exactly match its payload')
    for row in rows:
        data = payload[row['path']]
        require(type(row['bytes']) is int and row['bytes'] == len(data) and row['sha256'] == digest(data),
                'Input inventory byte/hash mismatch: ' + row['path'])
    if not prototype:
        require(files[INVENTORY] == canonical_inventory(payload), 'Noncanonical inventory bytes')
    return payload


class PageResources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.resources, self.scripts = [], []
        self.csp = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta' and attrs.get('http-equiv', '').lower() == 'content-security-policy':
            self.csp.append(attrs.get('content'))
        if tag == 'script' and attrs.get('src'):
            self.scripts.append(attrs['src'])
            self.resources.append(attrs['src'])
        elif tag in ('img', 'source') and attrs.get('src'):
            self.resources.append(attrs['src'])
        elif tag == 'link' and attrs.get('href') and any(
                rel in attrs.get('rel', '').split() for rel in ('stylesheet', 'modulepreload', 'icon', 'apple-touch-icon')):
            self.resources.append(attrs['href'])


def native_html(name, data):
    text = data.decode('utf-8')
    original = PageResources()
    original.feed(text)
    require(not original.csp, 'Unexpected existing trusted-page CSP: ' + name)
    # Remove only the reviewed diagnostic wrapper's legacy core include.
    if name == 'assets/mobile/self-test.html':
        legacy = '<script src="../js/capacitor.js"></script>'
        require(text.count(legacy) == 1, 'Diagnostic bridge include drifted')
        text = text.replace(legacy, '')
    require(len(re.findall(r'<head(?:\s[^<>]*)?>', text, re.I)) == 1
            and len(re.findall(r'</head\s*>', text, re.I)) == 1, 'HTML must have one head: ' + name)
    text = re.sub(r'<head(?:\s[^<>]*)?>', '<head>', text, flags=re.I)
    text = re.sub(r'</head\s*>', '</head>', text, flags=re.I)
    require(text.index('<head>') < text.index('</head>'), 'Invalid head order: ' + name)
    base = posixpath.dirname(name) or '.'
    shell = posixpath.relpath('assets/mobile/app-shell.js', base)
    css = posixpath.relpath('assets/mobile/app-shell.css', base)
    core = posixpath.relpath('assets/js/capacitor.js', base)
    # This meta policy is for trusted bundled pages only. It does not replace or
    # weaken C2's native sandbox headers on imported content. Inline execution is
    # needed by audited page boot and Capacitor; actual viewers use blob workers.
    bootstrap = (f'\n<meta http-equiv="Content-Security-Policy" content="{TRUSTED_CSP}">\n'
                 f'<link rel="stylesheet" href="{css}">\n<script src="{core}"></script>\n'
                 f'<script src="{shell}"></script>\n')
    return text.replace('<head>', '<head>' + bootstrap, 1).encode('utf-8')


def validate_pages(payload):
    for name, data in payload.items():
        if not name.endswith('.html'):
            continue
        text = data.decode('utf-8')
        require(text.count('<head>') == text.count('</head>') == 1, 'Missing literal HTML head: ' + name)
        parsed = PageResources()
        parsed.feed(text)
        require(parsed.csp == [TRUSTED_CSP], 'Missing, duplicate or changed trusted-page CSP: ' + name)
        require(text.index('http-equiv="Content-Security-Policy"') < text.index('capacitor.js'),
                'Trusted-page CSP must precede core: ' + name)
        require(len(parsed.scripts) >= 2 and
                [posixpath.basename(urlsplit(src).path) for src in parsed.scripts[:2]] == ['capacitor.js', 'app-shell.js'],
                'Core must execute before shell and application modules: ' + name)
        require(sum(src.endswith('app-shell.js') for src in parsed.scripts) == 1, 'Duplicate app shell: ' + name)
        require(sum(posixpath.basename(urlsplit(src).path) == 'capacitor.js' for src in parsed.scripts) == 1,
                'Pinned Capacitor core must execute exactly once: ' + name)
        for resource in parsed.resources:
            url = urlsplit(resource)
            require(not url.scheme and not url.netloc, 'Remote runtime resource in offline page: ' + name)
            target = (posixpath.normpath(posixpath.join(posixpath.dirname(name), unquote(url.path)))
                      if not url.path.startswith('/') else unquote(url.path[1:]))
            require(target in payload, f'Missing page resource: {name} -> {resource}')


def source_file(path):
    safe_root(path)
    require(path.is_file(), 'Missing source file: ' + str(path))
    return path.read_bytes()


def build_payload(project=PROJECT, mobile=MOBILE, dist=None):
    project, mobile = Path(project), Path(mobile)
    dist = Path(dist) if dist else project / 'dist'
    config = json.loads(source_file(project / 'app.config.json'))
    package = json.loads(source_file(project / 'package.json'))
    require(config['app'] == 'main', 'Assembler accepts only the main App')
    require(package['version'] == '1.0.0', 'Native version identity needs reviewed synchronization')
    payload = verified_inventory(tree_bytes(dist), prototype=True)
    require(payload.pop('.nojekyll', None) == b'', 'Expected only the known empty .nojekyll marker')
    validate_names(payload)
    require(set(config['pages']) <= set(payload) and 'assets/mobile/index.html' in config['pages'], 'Missing full Vite pages/mobile entry')
    modules = json.loads(payload['build-modules.json'])
    require(modules['app'] == 'main' and modules['modules'] and
            not any(re.search(r'(?:^|/)cad/', name, re.I) for name in modules['modules']), 'CAD source in Vite module graph')
    for shader in SHADERS:
        require(payload.get(shader) == source_file(project / shader), 'Real native shader source mismatch: ' + shader)
    additions = {}
    for name in DIAGNOSTICS:
        additions['assets/diagnostics/' + name] = source_file(mobile / 'diagnostics-r1' / name)
    for name in ('web-canary.txt', 'shader-canary.txt'):
        additions['assets/diagnostics/' + name] = source_file(mobile / 'diagnostics-r1/fixtures' / name)
    additions['assets/mobile/self-test.html'] = source_file(mobile / 'diagnostics-r1/self-test.html')
    for name in ('app-shell.js', 'app-shell.css'):
        additions['assets/mobile/' + name] = source_file(project / 'src/mobile' / name)
    core = mobile / 'node_modules/@capacitor/core'
    require(json.loads(source_file(core / 'package.json'))['version'] == '8.5.3', 'Unexpected Capacitor core version')
    additions['assets/js/capacitor.js'] = source_file(core / 'dist/capacitor.js')
    android = mobile / 'node_modules/@capacitor/android'
    require(json.loads(source_file(android / 'package.json'))['version'] == '8.5.3', 'Unexpected Capacitor Android version')
    bridge = source_file(android / 'capacitor/src/main/assets/native-bridge.js')
    export = source_file(android / 'capacitor/src/main/java/com/getcapacitor/JSExport.java')
    require(b'registerPlugin' not in bridge and b'registerPlugin' in additions['assets/js/capacitor.js']
            and b'return getFilesContent(context, "native-bridge.js");' in export,
            'Capacitor native/core initialization contract changed; review bootstrap ordering')
    require(not (set(payload) & (set(additions) | set(STUBS) | {'native-web.json', 'release-notes.json'})), 'Unexpected assembly source collision')
    payload.update(additions)
    for name in list(payload):
        if name.endswith('.html'):
            payload[name] = native_html(name, payload[name])
    # Bind the real assembled resources, rather than a fixture or prototype ID.
    build = 'main-app-' + digest(canonical_inventory(payload))[:24]
    payload['native-web.json'] = json_bytes({
        'schema': 1, 'product': 'BuildingWebViewer',
        'packageId': 'io.github.sen2maker.buildingwebviewer',
        'generation': 'stable-v1', 'channel': 'stable', 'version': package['version'],
        'build': build, 'nativeApi': 1, 'minNativeVersionCode': 1,
    })
    payload['release-notes.json'] = json_bytes({'version': package['version'], 'notes': {
        'en': 'Full offline main App integration candidate. Actual viewer pages, native Gaussian shaders and R1 device diagnostics are bundled. CAD is a separate app. External updates and CAD download remain unavailable. Not a signed or published release; device acceptance remains pending.',
        'zh': '完整离线主 App 集成候选：包含实际查看器页面、原生高斯着色器及 R1 手机自检。CAD 为独立 App。外部更新与 CAD 下载尚未开放。本候选未签名、未发布，真机验收待完成。',
    }})
    validate_pages(payload)
    canonical_inventory(payload)
    return payload, build


def pins_for(payload, build, *, finalized):
    inventory = canonical_inventory(payload)
    return {'build': build, 'inventoryBytes': len(inventory), 'inventorySha256': digest(inventory),
            'fixtureOnly': False, 'postSyncFinalized': finalized}


def replace_tree(target, files):
    target = safe_root(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        tree_bytes(target)  # Validate before cleanup, never follow existing links.
    staging = Path(tempfile.mkdtemp(prefix=target.name + '-assemble-', dir=target.parent))
    try:
        for name, data in sorted(files.items()):
            path = staging / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        if target.exists():
            shutil.rmtree(target)
        staging.rename(target)
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def assemble(project=PROJECT, mobile=MOBILE, dist=None):
    mobile = Path(mobile)
    payload, build = build_payload(project, mobile, dist)
    inventory = canonical_inventory(payload)
    replace_tree(mobile / 'web', {**payload, INVENTORY: inventory})
    pins = pins_for(payload, build, finalized=False)
    (mobile / 'bundled-pins.json').write_text(json.dumps(pins, indent=2) + '\n')
    return pins, len(payload)


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    pins, count = assemble()
    print(f"Assembled real main App: {count} payload files, build {pins['build']}; cap sync and finalization still required.")


if __name__ == '__main__':
    main()
