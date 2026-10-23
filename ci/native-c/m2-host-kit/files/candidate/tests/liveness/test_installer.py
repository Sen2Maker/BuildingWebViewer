from pathlib import Path
import unittest,tempfile,shutil,json,subprocess,hashlib
ROOT=Path(__file__).resolve().parents[2];M=ROOT/'project/mobile';BASE=ROOT.parent/'main_app_integration_m1_2_staging/project/mobile'
class Installer(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='bwv-liveness-installer-');self.addCleanup(self.temp.cleanup);self.m=Path(self.temp.name)/'mobile';self.m.mkdir();shutil.copytree(M/'native-patches',self.m/'native-patches');(self.m/'scripts').mkdir();shutil.copy2(M/'scripts/apply-capacitor-root-lock.py',self.m/'scripts/apply-capacitor-root-lock.py');self.target=self.m/'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor';pins=json.loads((M/'native-patches/capacitor-8.5.3-hashes.json').read_text());helpers=json.loads((M/'native-patches/helper-hashes.json').read_text())
  for name in [*pins,*helpers]:
   target=self.target/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(M/'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor'/name,target)
  self.runtime=json.loads((M/'native-patches/runtime-hashes.json').read_text())
  for name in ['@capacitor/android/package.json','@capacitor/core/package.json',*[x['path'] for x in self.runtime['files']]]:
   target=self.m/'node_modules'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(M/'node_modules'/name,target)
 def snapshot(self):return {p.relative_to(self.m/'node_modules').as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in (self.m/'node_modules').rglob('*') if p.is_file()}
 def run_install(self):return subprocess.run(['python3','-B',str(self.m/'scripts/apply-capacitor-root-lock.py')],text=True,capture_output=True)
 def refused(self):
  before=self.snapshot();run=self.run_install();self.assertNotEqual(run.returncode,0);self.assertEqual(self.snapshot(),before,'All inputs preflight before any dependency write')
 def test_idempotent(self):
  before=self.snapshot();self.assertEqual(self.run_install().returncode,0);self.assertEqual(self.run_install().returncode,0);self.assertEqual(self.snapshot(),before)
 def test_original_runtime_and_previous_java_are_supported(self):
  for item in self.runtime['files']:shutil.copy2(BASE/'node_modules'/item['path'],self.m/'node_modules'/item['path'])
  for name in ['Bridge.java','MessageHandler.java']:shutil.copy2(BASE/'native-patches/patched'/name,self.target/name)
  self.assertEqual(self.run_install().returncode,0)
  for item in self.runtime['files']:self.assertEqual(hashlib.sha256((self.m/'node_modules'/item['path']).read_bytes()).hexdigest(),item['after'])
 def test_previous_l1_runtime_transition(self):
  previous=ROOT.parent/'main_transport_liveness_staging/project/mobile'
  for item in self.runtime['files']:shutil.copy2(previous/'native-patches'/item['payload'],self.m/'node_modules'/item['path'])
  self.assertEqual(self.run_install().returncode,0)
  for item in self.runtime['files']:self.assertEqual(hashlib.sha256((self.m/'node_modules'/item['path']).read_bytes()).hexdigest(),item['after'])
 def test_runtime_target_tamper_blocks_java_writes(self):
  (self.m/'node_modules'/self.runtime['files'][0]['path']).write_text('changed');self.refused()
 def test_runtime_payload_tamper_blocks_every_write(self):
  (self.m/'native-patches'/self.runtime['files'][1]['payload']).write_text('changed');self.refused()
 def test_core_version_drift_blocks_every_write(self):
  (self.m/'node_modules/@capacitor/core/package.json').write_text('{"version":"9.0.0"}');self.refused()
 def test_java_payload_drift_blocks_runtime_writes(self):
  (self.m/'native-patches/patched/Bridge.java').write_text('changed');self.refused()
if __name__=='__main__':unittest.main(verbosity=2)
