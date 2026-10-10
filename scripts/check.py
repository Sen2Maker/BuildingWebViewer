#!/usr/bin/env python3
"""Run regression suites and check build/package contracts. Requires Node 18+ and Python 3."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
subprocess.run(['node','--test',*[str(f) for f in sorted((ROOT/'tests').glob('*.test.mjs'))]],cwd=ROOT,check=True)
subprocess.run([sys.executable,'build.py','--check'],cwd=ROOT,check=True)
for f in sorted((ROOT/'assets/js').glob('*.js')):
    subprocess.run(['node','--check',str(f)],check=True)
class Links(HTMLParser):
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        target=(attrs.get('src') or attrs.get('data-viewer-src')) if tag in ['script','img'] else attrs.get('href') if tag in ['link','a'] else None
        if target and not urlsplit(target).scheme and not target.startswith('#'):
            assert (ROOT/urlsplit(target).path).is_file(), 'Missing asset: '+target
for page in ROOT.glob('*.html'): Links().feed(page.read_text(encoding='utf-8'))
print('PASS generated bundles and all HTML asset links')
