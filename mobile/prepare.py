#!/usr/bin/env python3
"""Build reproducible Capacitor web assets and a web-only update payload."""
from pathlib import Path
import hashlib,json,shutil,subprocess,sys,zipfile
ROOT=Path(__file__).resolve().parents[1];MOBILE=ROOT/'mobile'
subprocess.run([sys.executable,'build.py','--site'],cwd=ROOT,check=True)
config=json.loads((MOBILE/'capacitor.config.json').read_text())
assert config['server']['appStartPath'].startswith('/'), 'Capacitor appStartPath must start with /'
assert not config['server'].get('url'), 'Android startup must be local'
WEB=MOBILE/'web'
if WEB.exists():shutil.rmtree(WEB)
shutil.copytree(ROOT/'_site',WEB)
shutil.copy2(MOBILE/'node_modules/@capacitor/core/dist/capacitor.js',WEB/'assets/js/capacitor.js')
release=json.loads((MOBILE/'update-release.json').read_text())
version=json.loads((ROOT/'package.json').read_text())['version']
assert release['version']==version, 'Release notes version mismatch'
(WEB/'release-notes.json').write_text(json.dumps({'version':version,'notes':release['notes']},ensure_ascii=False)+'\n')
(WEB/'native-web.json').write_text(json.dumps({'version':version,'nativeApi':5}))
for p in WEB.rglob('*.html'):
 prefix='../../' if p.parent==WEB/'assets/mobile' else ''
 p.write_text(p.read_text().replace('<head>',f'<head><script src="{prefix}assets/js/capacitor.js"></script>',1))
subprocess.run(['node',str(MOBILE/'compat-build.mjs')],cwd=ROOT,check=True)
subprocess.run(['node',str(MOBILE/'compat-test.mjs')],cwd=ROOT,check=True)
name=f'BuildingWebViewer-Update-v{version}.bwvupdate';dest=ROOT/'dist'/name;dest.parent.mkdir(exist_ok=True)
# Stored entries keep release hashes identical across Python/zlib versions.
with zipfile.ZipFile(dest,'w',zipfile.ZIP_STORED) as z:
 for p in sorted(WEB.rglob('*')):
  if not p.is_file():continue
  info=zipfile.ZipInfo(str(p.relative_to(WEB)),(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_STORED;info.external_attr=0o100644<<16;z.writestr(info,p.read_bytes())
manifest={'schema':1,'channel':'preview','packageName':'io.github.sen2maker.buildingwebviewer.preview','version':version,'nativeApi':5,
 'sequence':release['sequence'],'issuedAt':release['issuedAt'],'expiresAt':release['expiresAt'],'notes':release['notes'],
 'web':{'url':f'https://github.com/Sen2Maker/BuildingWebViewer/releases/download/v{version}/{name}','size':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}}
(ROOT/'dist/mobile-update.unsigned.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('Prepared unsigned metadata and Android web update:',dest)
