#!/usr/bin/env python3
"""Generate tiny synthetic archives for native tests; never packages user datasets."""
from pathlib import Path
import gzip,bz2,lzma,tarfile,zipfile,io,subprocess,tempfile,shutil
out=Path(__file__).parent/'android/app/src/androidTest/assets';out.mkdir(parents=True,exist_ok=True)
data=b'1 2 3 42\n4 5 6 99\n'
with zipfile.ZipFile(out/'sample.zip','w',zipfile.ZIP_DEFLATED) as z:z.writestr('group/cloud.txt',data)
for ext,mode in [('tar','w'),('tgz','w:gz'),('tbz2','w:bz2'),('txz','w:xz')]:
 with tarfile.open(out/('sample.'+ext),mode) as t:
  info=tarfile.TarInfo('group/cloud.txt');info.size=len(data);t.addfile(info,io.BytesIO(data))
for ext,fn in [('gz',gzip.compress),('bz2',bz2.compress),('xz',lzma.compress)]: (out/('cloud.txt.'+ext)).write_bytes(fn(data))
with zipfile.ZipFile(out/'unsafe.zip','w') as z:z.writestr('../escape.txt',data)
with tarfile.open(out/'symlink.tar','w') as t:
 info=tarfile.TarInfo('link.txt');info.type=tarfile.SYMTYPE;info.linkname='/tmp/escape';t.addfile(info)
with tempfile.TemporaryDirectory() as d:
 Path(d,'cloud.txt').write_bytes(data)
 if shutil.which('7z'):
  for name,args in [('sample.7z',[]),('encrypted.zip',['-psecret'])]:
   subprocess.run(['7z','a','-y',str((out/name).resolve()),'cloud.txt',*args],cwd=d,check=True,stdout=subprocess.DEVNULL)
 if shutil.which('zstd'):subprocess.run(['zstd','-q','-f','cloud.txt','-o',str((out/'cloud.txt.zst').resolve())],cwd=d,check=True)
for p in list(out.iterdir()):
 if p.suffix=='.gz':p.rename(p.with_name(p.name+'.fixture'))
print('Generated native archive fixtures')
