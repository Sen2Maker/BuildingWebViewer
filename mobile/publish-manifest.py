#!/usr/bin/env python3
"""Verify uploaded signed metadata and artifacts before advertising an App update."""
from pathlib import Path
import hashlib,json,urllib.request
from update_signing import ROOT,verify
expected=json.loads((ROOT/'dist/mobile-update.unsigned.json').read_text())
base=f"https://github.com/Sen2Maker/BuildingWebViewer/releases/download/v{expected['version']}/"
def fetch(url,limit):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'BuildingWebViewer-release-check'}),timeout=60) as response:
        content=response.read(limit+1)
    assert len(content)<=limit,'Release file too large'
    return content
raw=fetch(base+'mobile-update.json',65536)
signed=verify(json.loads(raw))
assert {key:signed[key] for key in expected}==expected,'Signed manifest differs from the tagged build'
for kind,limit in [('web',32*1024*1024),('apk',128*1024*1024)]:
    asset=signed[kind];content=fetch(asset['url'],limit)
    assert len(content)==asset['size'] and hashlib.sha256(content).hexdigest()==asset['sha256'],'Uploaded artifact mismatch'
(ROOT/'_site/mobile-update.json').write_bytes(raw)
print('Verified signature and uploaded web/APK hashes; signed manifest added to Pages output')
