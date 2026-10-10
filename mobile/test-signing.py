#!/usr/bin/env python3
"""Host regression for the release signer; uses disposable test keys only."""
import copy,json,tempfile,time,unittest
from pathlib import Path
from update_signing import openssl,verify,sign
class SigningTest(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name);self.key=self.path/'test.pem'
  openssl('genpkey','-algorithm','EC','-pkeyopt','ec_paramgen_curve:prime256v1','-out',self.key)
  public=openssl('pkey','-in',self.key,'-pubout','-outform','DER')
  self.trust={'minimumSequence':1,'keys':{'test':public.hex()}};now=int(time.time());base='https://github.com/Sen2Maker/BuildingWebViewer/releases/download/v1.3.0/'
  self.data={'schema':1,'channel':'preview','packageName':'io.github.sen2maker.buildingwebviewer.preview','version':'1.3.0','nativeApi':5,'sequence':1,'issuedAt':now-10,'expiresAt':now+3600,'notes':{'zh':'更新','en':'Update'},'web':{'url':base+'BuildingWebViewer-Update-v1.3.0.bwvupdate','size':1,'sha256':'a'*64},'apk':{'version':'1.3.0','nativeApi':5,'url':base+'BuildingWebViewer-Android-v1.3.0-preview.1.apk','size':2,'sha256':'b'*64,'versionCode':1030001,'certificateSha256':'c'*64}}
 def tearDown(self):self.temp.cleanup()
 def test_valid_and_tampered_metadata(self):
  envelope=sign(self.data,self.key,'test',self.trust);self.assertEqual(verify(envelope,self.trust),self.data)
  envelope['payload']+=' '
  with self.assertRaises(Exception):verify(envelope,self.trust)
 def test_unknown_key_and_expired_metadata(self):
  envelope=sign(self.data,self.key,'test',self.trust)
  with self.assertRaises(Exception):verify(envelope,self.trust,now=self.data['expiresAt'])
  self.assertEqual(verify(envelope,self.trust,now=self.data['expiresAt'],fresh=False),self.data)
  envelope['keyId']='unknown'
  with self.assertRaises(Exception):verify(envelope,self.trust)
 def test_web_release_can_reuse_older_compatible_apk(self):
  self.data['version']='1.3.1';self.data['sequence']=2;self.data['web']['url']=self.data['web']['url'].replace('1.3.0','1.3.1')
  envelope=sign(self.data,self.key,'test',self.trust);self.assertEqual(verify(envelope,self.trust)['apk']['version'],'1.3.0')
  self.data['nativeApi']=6
  with self.assertRaises(Exception):sign(self.data,self.key,'test',self.trust)
if __name__=='__main__':unittest.main()
