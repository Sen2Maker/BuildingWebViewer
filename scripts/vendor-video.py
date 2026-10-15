#!/usr/bin/env python3
"""Rebuild the pinned offline video writer; ordinary build.py needs no npm install."""
from pathlib import Path
import base64,hashlib,io,json,shutil,subprocess,tarfile,tempfile
ROOT=Path(__file__).resolve().parents[1]
meta=json.loads((ROOT/'docs/third-party/mediabunny.json').read_text())
raw=(ROOT/'docs/third-party'/meta['sourceArchive']).read_bytes()
assert 'sha512-'+base64.b64encode(hashlib.sha512(raw).digest()).decode()==meta['integrity']
esbuild=ROOT/'mobile/node_modules/.bin/esbuild'
if not esbuild.exists():esbuild=shutil.which('esbuild')
assert esbuild,'Install mobile dev dependencies or provide esbuild on PATH to refresh this vendor asset'
with tempfile.TemporaryDirectory(prefix='bwv-video-') as tmp:
 with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as archive:
  for entry in archive.getmembers():assert not entry.name.startswith('/') and '..' not in Path(entry.name).parts and not entry.issym() and not entry.islnk()
  archive.extractall(tmp)
 package=Path(tmp)/'package'
 subprocess.run([str(esbuild),str(ROOT/'src/vendor/video-writer-entry.js'),'--bundle','--format=iife','--global-name=BWVVideoWriter','--minify','--target=es2020','--legal-comments=inline','--alias:mediabunny='+str(package/'dist/modules/src/index.js'),'--outfile='+str(ROOT/'assets/vendor/video-writer.js')],check=True)
 shutil.copy2(package/'LICENSE',ROOT/'assets/vendor/MEDIABUNNY-LICENSE.txt')
print('Pinned offline video writer rebuilt; upstream source archive and license retained')
