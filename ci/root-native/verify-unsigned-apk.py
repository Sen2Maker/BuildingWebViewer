#!/usr/bin/env python3
"""Inspect a real unsigned release APK. No signing or installability claim."""
import hashlib,json,re,struct,subprocess,sys,zipfile
from pathlib import Path,PurePosixPath

def inspect(apk, root, aapt, apksigner):
 data=apk.read_bytes()
 if not 0<len(data)<=256*1024*1024: raise ValueError('APK size outside bound')
 end=data.rfind(b'PK\x05\x06',max(0,len(data)-65557))
 if end<0 or end+22>len(data): raise ValueError('Missing ZIP end record')
 if end+22+struct.unpack_from('<H',data,end+20)[0]!=len(data): raise ValueError('ZIP trailing bytes')
 cd=struct.unpack_from('<I',data,end+16)[0]
 if cd>=16 and data[cd-16:cd]==b'APK Sig Block 42': raise ValueError('APK has v2/v3 signing block')
 manifest=json.loads((root/'ci/root-native-payload.json').read_text())
 prefix='mobile/android/app/src/main/assets/'
 expected={'assets/'+r['path'][len(prefix):]:r for r in manifest['files'] if r['path'].startswith(prefix)}
 bridge=[r for r in manifest['files'] if r['path']=='mobile/native-patches/runtime/native-bridge.js']
 if len(bridge)!=1: raise ValueError('Missing exact frozen native bridge identity')
 expected['assets/native-bridge.js']=bridge[0]
 with zipfile.ZipFile(apk) as z:
  names=z.namelist()
  if sum(i.file_size for i in z.infolist())>512*1024*1024 or any(i.file_size>128*1024*1024 for i in z.infolist()): raise ValueError('Expanded APK size exceeds bound')
  if len(names)!=len(set(names)) or len(names)>10000: raise ValueError('Duplicate or excessive APK entries')
  for name in names:
   p=PurePosixPath(name)
   if p.is_absolute() or '..' in p.parts or '\\' in name: raise ValueError('Unsafe APK entry')
   if re.match(r'^META-INF/[^/]+\.(RSA|DSA|EC|SF)$',name,re.I): raise ValueError('JAR signature present')
   if name.lower().endswith(('.jks','.keystore','.p12','.pfx')): raise ValueError('Signing material in APK')
  if any(x not in names for x in ['AndroidManifest.xml','classes.dex','resources.arsc']): raise ValueError('Not a compiled APK')
  actual={n for n in names if n.startswith('assets/') and not n.endswith('/')}
  profiles={
   'assets/dexopt/baseline.prof':'mobile/android/app/build/intermediates/binary_art_profile/release/compileReleaseArtProfile/baseline.prof',
   'assets/dexopt/baseline.profm':'mobile/android/app/build/intermediates/binary_art_profile_metadata/release/compileReleaseArtProfile/baseline.profm',
  }
  extra=actual-set(expected);missing=set(expected)-actual
  if missing or (extra and extra!=set(profiles)):
   raise ValueError('APK asset set mismatch: '+json.dumps({'missing':sorted(missing),'extra':sorted(extra)}))
  generated=[]
  for name in sorted(extra):
   source=root/profiles[name]
   if not source.is_file() or source.is_symlink() or source.stat().st_size>16*1024*1024: raise ValueError('Missing/bounded AGP profile output: '+name)
   b=z.read(name)
   if b!=source.read_bytes(): raise ValueError('Generated profile mismatch: '+name)
   generated.append({'path':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
  for name,row in expected.items():
   b=z.read(name)
   if len(b)!=row['bytes'] or hashlib.sha256(b).hexdigest()!=row['sha256']: raise ValueError('APK asset mismatch: '+name)
  native=[{'path':n,'bytes':z.getinfo(n).file_size,'sha256':hashlib.sha256(z.read(n)).hexdigest()} for n in names if n.startswith('lib/') and n.endswith('.so')]
  if z.testzip() is not None: raise ValueError('APK CRC failure')
 badging=subprocess.run([str(aapt),'dump','badging',str(apk)],check=True,capture_output=True,text=True).stdout
 if not re.search(r"^package: name='io.github.sen2maker.buildingwebviewer' versionCode='2' versionName='1.0.0'",badging,re.M): raise ValueError('Unexpected package identity/version')
 if "sdkVersion:'30'" not in badging or "targetSdkVersion:'36'" not in badging or 'application-debuggable' in badging: raise ValueError('Unexpected SDK/debug flag')
 signature=subprocess.run([str(apksigner),'verify','--verbose',str(apk)],capture_output=True,text=True)
 if signature.returncode==0: raise ValueError('APK unexpectedly verifies as signed')
 if 'Missing META-INF/MANIFEST.MF' not in signature.stderr+signature.stdout and 'No JAR signatures' not in signature.stderr+signature.stdout:
  raise ValueError('apksigner failed for an unrecognized reason: '+(signature.stderr+signature.stdout)[:500])
 return {'schema':1,'scope':'Unsigned root release APK, NOT installable production or device acceptance','apk':apk.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'assetFilesVerified':len(expected),'nativeLibraries':native,'generatedProfiles':generated,'signingVerifiedAbsent':True,'deviceTested':False,'releaseApproved':False}

if __name__=='__main__':
 apk,root,aapt,apksigner,out=map(Path,sys.argv[1:])
 result=inspect(apk,root,aapt,apksigner)
 out.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result,sort_keys=True))
