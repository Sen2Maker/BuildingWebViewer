#!/usr/bin/env python3
"""Verifier unit tests use synthetic ZIPs/mocked tools, NOT Android acceptance."""
import hashlib,importlib.util,json,subprocess,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('verify',Path(__file__).with_name('verify-unsigned-apk.py'));v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
BADGING="package: name='io.github.sen2maker.buildingwebviewer' versionCode='1' versionName='1.0.0'\nsdkVersion:'30'\ntargetSdkVersion:'36'\n"
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);(self.root/'ci').mkdir();self.apk=self.root/'app-release-unsigned.apk'
  b=b'ordinary fixture';self.entries={'AndroidManifest.xml':b'compiled-placeholder','classes.dex':b'dex-placeholder','resources.arsc':b'resources-placeholder','assets/public/index.html':b}
  (self.root/'ci/root-native-payload.json').write_text(json.dumps({'files':[{'path':'mobile/android/app/src/main/assets/public/index.html','bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}]}))
 def tearDown(self):self.tmp.cleanup()
 def make(self):
  with zipfile.ZipFile(self.apk,'w') as z:
   for n,b in self.entries.items():z.writestr(n,b)
 def runcheck(self,badging=BADGING,code=1,error='ERROR: Missing META-INF/MANIFEST.MF'):
  self.make()
  responses=[subprocess.CompletedProcess([],0,badging,''),subprocess.CompletedProcess([],code,'',error)]
  with patch.object(v.subprocess,'run',side_effect=responses):return v.inspect(self.apk,self.root,Path('aapt'),Path('apksigner'))
 def test_good_fixture(self):self.assertEqual(self.runcheck()['assetFilesVerified'],1)
 def test_signed(self):
  with self.assertRaises(ValueError):self.runcheck(code=0,error='')
 def test_unrelated_signature_error(self):
  with self.assertRaises(ValueError):self.runcheck(error='Java not found')
 def test_manifest_package(self):
  with self.assertRaises(ValueError):self.runcheck(badging=BADGING.replace('buildingwebviewer','bad'))
 def test_sdk(self):
  with self.assertRaises(ValueError):self.runcheck(badging=BADGING.replace("sdkVersion:'30'","sdkVersion:'29'"))
 def test_debuggable(self):
  with self.assertRaises(ValueError):self.runcheck(badging=BADGING+'application-debuggable\n')
 def test_changed_asset(self):
  self.entries['assets/public/index.html']=b'wrong'
  with self.assertRaises(ValueError):self.runcheck()
 def test_extra_asset(self):
  self.entries['assets/private.txt']=b'wrong'
  with self.assertRaises(ValueError):self.runcheck()
 def test_jar_signature(self):
  self.entries['META-INF/CERT.RSA']=b'wrong'
  with self.assertRaises(ValueError):self.runcheck()
 def test_key_material(self):
  self.entries['res/key.keystore']=b'wrong'
  with self.assertRaises(ValueError):self.runcheck()
 def test_missing_dex(self):
  del self.entries['classes.dex']
  with self.assertRaises(ValueError):self.runcheck()
 def test_unsafe_path(self):
  self.entries['../wrong']=b'wrong'
  with self.assertRaises(ValueError):self.runcheck()
if __name__=='__main__':unittest.main()
