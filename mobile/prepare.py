#!/usr/bin/env python3
"""Build reproducible Capacitor web assets and a web-only update payload."""
from pathlib import Path
import hashlib,json,shutil,subprocess,sys,zipfile
ROOT=Path(__file__).resolve().parents[1];MOBILE=ROOT/'mobile'
subprocess.run([sys.executable,'build.py','--site'],cwd=ROOT,check=True)
WEB=MOBILE/'web'
if WEB.exists():shutil.rmtree(WEB)
shutil.copytree(ROOT/'_site',WEB)
shutil.copy2(MOBILE/'node_modules/@capacitor/core/dist/capacitor.js',WEB/'assets/js/capacitor.js')
version=json.loads((ROOT/'package.json').read_text())['version']
(WEB/'native-web.json').write_text(json.dumps({'version':version,'nativeApi':1}))
for p in WEB.rglob('*.html'):
 prefix='../../' if p.parent==WEB/'assets/mobile' else ''
 p.write_text(p.read_text().replace('<head>',f'<head><script src="{prefix}assets/js/capacitor.js"></script>',1))
name=f'BuildingWebViewer-web-v{version}.zip';dest=ROOT/'dist'/name;dest.parent.mkdir(exist_ok=True)
# Stored entries keep release hashes identical across Python/zlib versions.
with zipfile.ZipFile(dest,'w',zipfile.ZIP_STORED) as z:
 for p in sorted(WEB.rglob('*')):
  if not p.is_file():continue
  info=zipfile.ZipInfo(str(p.relative_to(WEB)),(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_STORED;info.external_attr=0o100644<<16;z.writestr(info,p.read_bytes())
manifest={'version':version,'nativeApi':1,'url':f'https://github.com/Sen2Maker/BuildingWebViewer/releases/download/v{version}/{name}','sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
(ROOT/'dist/mobile-update.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Prepared Android web bundle and update archive:',dest)
