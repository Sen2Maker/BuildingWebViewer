#!/usr/bin/env python3
"""Validate the uploaded official release web bundle before advertising an app update."""
from pathlib import Path
import hashlib,json,shutil,urllib.request
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'dist/mobile-update.json').read_text())
request=urllib.request.Request(manifest['url'],headers={'User-Agent':'BuildingWebViewer-release-check'})
sha=hashlib.sha256();size=0
with urllib.request.urlopen(request,timeout=60) as response:
 while block:=response.read(65536):
  size+=len(block)
  if size>32*1024*1024:raise RuntimeError('App update archive exceeds 32 MiB')
  sha.update(block)
if sha.hexdigest()!=manifest['sha256']:raise RuntimeError('Uploaded app web archive does not match this build')
shutil.copy2(ROOT/'dist/mobile-update.json',ROOT/'_site/mobile-update.json')
print('Verified uploaded app web bundle; update manifest added to Pages output')
