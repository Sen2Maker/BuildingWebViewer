#!/usr/bin/env python3
"""Sign a prepared release after the APK exists. Never upload private keys."""
import argparse,hashlib,json,os,re,stat
from pathlib import Path
from update_signing import ROOT,sign,verify,openssl
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--key',type=Path,required=True)
choice=p.add_mutually_exclusive_group(required=True);choice.add_argument('--apk',type=Path);choice.add_argument('--reuse-apk-from',type=Path)
p.add_argument('--apksigner',type=Path);p.add_argument('--aapt',type=Path)
a=p.parse_args()
key=a.key.resolve()
assert ROOT not in key.parents, 'Keep the private key outside the repository'
assert stat.S_IMODE(key.stat().st_mode)&0o077==0, 'Private key must be owner-only'
base=json.loads((ROOT/'dist/mobile-update.unsigned.json').read_text());version=base['version']
if a.apk:
    assert a.apk.name==f'BuildingWebViewer-Android-v{version}-preview.1.apk'
    import subprocess
    report=subprocess.check_output([str(a.apksigner),'verify','--print-certs',str(a.apk)],text=True)
    cert=re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-f]+)',report)[1]
    trust=json.loads((ROOT/'mobile/android/app/src/main/res/raw/update_trust.json').read_text())
    assert cert==trust['installerCertificateSha256'], 'Unexpected preview installer certificate'
    import zipfile
    with zipfile.ZipFile(a.apk) as archive:
        assert json.loads(archive.read('res/raw/update_trust.json'))==trust, 'APK has stale update trust'
        bundled=json.loads(archive.read('assets/public/native-web.json'))
        assert bundled=={'version':version,'nativeApi':base['nativeApi']}, 'APK native/web metadata mismatch'
        for source in (ROOT/'mobile/web').rglob('*'):
            if source.is_file() and source.name!='.nojekyll': assert archive.read('assets/public/'+source.relative_to(ROOT/'mobile/web').as_posix())==source.read_bytes(), 'APK has stale web files'
    package=subprocess.check_output([str(a.aapt),'dump','badging',str(a.apk)],text=True)
    major,minor,patch=map(int,version.split('.'));code=major*1000000+minor*10000+patch*100+1
    assert f"name='{base['packageName']}'" in package and f"versionCode='{code}'" in package and f"versionName='{version}-preview.1'" in package
    base['apk']={'url':f"https://github.com/Sen2Maker/BuildingWebViewer/releases/download/v{version}/{a.apk.name}",'size':a.apk.stat().st_size,'sha256':hashlib.sha256(a.apk.read_bytes()).hexdigest(),'version':version,'nativeApi':base['nativeApi'],'versionCode':code,'certificateSha256':cert}
else:
    previous=verify(json.loads(a.reuse_apk_from.read_text()),fresh=False)
    assert previous['nativeApi']==base['nativeApi'], 'Native interface changed; build a new APK'
    base['apk']=previous['apk']
key_id=json.loads((ROOT/'mobile/update-release.json').read_text())['keyId']
envelope=sign(base,key,key_id)
(ROOT/'dist/mobile-update.json').write_text(json.dumps(envelope,ensure_ascii=False,indent=2)+'\n')
print('Verified and signed release',version,'with key',key_id)
