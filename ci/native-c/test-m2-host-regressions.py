#!/usr/bin/env python3
"""Local fail-closed wrapper regressions. No frozen/source-tree writes."""
from pathlib import Path
import copy, hashlib, importlib.util, json, os, runpy, shutil, tempfile, unittest

HERE=Path(os.path.abspath(__file__)).parent
spec=importlib.util.spec_from_file_location('m2_host_runner',HERE/'run-m2-host-regressions.py')
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)

class InputGuards(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='m2-host-wrapper-test-');self.addCleanup(self.temp.cleanup)
  self.root=Path(self.temp.name);self.p=self.root/'a/file';self.p.parent.mkdir();self.p.write_bytes(b'exact')
  self.rows=[{'path':'a/file','bytes':5,'sha256':hashlib.sha256(b'exact').hexdigest()}]
 def test_exact_inputs_pass(self):
  expected=runner.verify_rows(self.root,self.rows);runner.exact_tree(self.root,expected)
 def test_hash_drift_rejected(self):
  self.p.write_bytes(b'drift')
  with self.assertRaisesRegex(ValueError,'Hash/size mismatch'):runner.verify_rows(self.root,self.rows)
 def test_size_drift_rejected(self):
  self.p.write_bytes(b'exact extra')
  with self.assertRaisesRegex(ValueError,'Hash/size mismatch'):runner.verify_rows(self.root,self.rows)
 def test_missing_input_rejected(self):
  self.p.unlink()
  with self.assertRaisesRegex(ValueError,'Missing regular file'):runner.verify_rows(self.root,self.rows)
 def test_duplicate_manifest_rejected(self):
  with self.assertRaisesRegex(ValueError,'Duplicate manifest entry'):runner.verify_rows(self.root,self.rows+self.rows)
 def test_unlisted_file_rejected(self):
  (self.root/'extra').write_text('no')
  with self.assertRaisesRegex(ValueError,'Unlisted file'):runner.exact_tree(self.root,{'a/file'})
 def test_unlisted_empty_directory_rejected(self):
  (self.root/'extra').mkdir()
  with self.assertRaisesRegex(ValueError,'Unlisted directory'):runner.exact_tree(self.root,{'a/file'})
 def test_missing_tree_entry_rejected(self):
  with self.assertRaisesRegex(ValueError,'Missing files'):runner.exact_tree(self.root,{'a/file','a/missing'})
 def test_file_symlink_rejected(self):
  self.p.unlink();self.p.symlink_to('/dev/null')
  with self.assertRaisesRegex(ValueError,'Symlink rejected'):runner.verify_rows(self.root,self.rows)
 def test_ancestor_symlink_rejected(self):
  link=self.root/'alias';link.symlink_to(self.root/'a',target_is_directory=True)
  with self.assertRaisesRegex(ValueError,'Symlink rejected'):runner.no_links(link/'file')
 def test_excluded_root_symlink_rejected(self):
  (self.root/'node_modules').symlink_to(self.root/'a',target_is_directory=True)
  with self.assertRaisesRegex(ValueError,'Symlink rejected'):runner.exact_tree(self.root,{'a/file'},excluded=('node_modules',))
 def test_unrelated_dependency_tree_not_copied(self):
  (self.root/'node_modules').mkdir();(self.root/'node_modules/ignored').write_text('unused')
  runner.exact_tree(self.root,{'a/file'},excluded=('node_modules',))
 def test_unsafe_manifest_paths_rejected(self):
  for value in ['../escape','/absolute','a/../file','a//file','a\\file','']:
   with self.subTest(value=value),self.assertRaisesRegex(ValueError,'Unsafe relative path'):runner.relative(value)
 def test_copy_reverified_and_no_symlinks(self):
  dst=self.root/'copy';runner.copy_rows(self.root,dst,self.rows)
  self.assertFalse((dst/'a/file').is_symlink());runner.exact_tree(dst,{'a/file'})

class FrozenInventory(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.path=HERE/'m2-host-kit/manifest.json';cls.m=json.loads(cls.path.read_text())
 def test_script_path_alias_is_normalized(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);(root/'alias').mkdir();shutil.copyfile(HERE/'run-m2-host-regressions.py',root/'run-m2-host-regressions.py')
   module=runpy.run_path(str(root/'alias/../run-m2-host-regressions.py'),run_name='m2_path_alias')
   self.assertEqual(module['HERE'],root)
   self.assertEqual(module['KIT'],root/'m2-host-kit')
 def test_reviewed_manifest_pin(self):
  self.assertEqual(runner.digest(self.path),runner.MANIFEST_SHA256)
 def test_all_52_frozen_kit_files_exact(self):
  expected=runner.verify_rows(HERE/'m2-host-kit/files',self.m['kitFiles'])
  self.assertEqual(len(expected),52)
  runner.exact_tree(HERE/'m2-host-kit',{'manifest.json',*('files/'+p for p in expected)})
 def test_394_native_inputs_and_selected_subset(self):
  native={r['path']:r for r in self.m['sourceNativeFiles']};self.assertEqual(len(native),394)
  for row in self.m['selectedNativeFiles']:self.assertEqual(native[row['path']],row)
 def test_exact_runtime_shell_remap(self):
  rows={r['path']:r for r in self.m['sourceNativeFiles']}
  remap=self.m['sourceRemaps'];self.assertEqual(len(remap),1)
  self.assertEqual(remap[0]['from'],'mobile/web/assets/mobile/app-shell.js')
  self.assertEqual(remap[0]['to'],'project/src/mobile/app-shell.js')
  self.assertEqual(remap[0]['sha256'],rows[remap[0]['from']]['sha256'])
 def test_no_frozen_test_adaptations(self):
  self.assertEqual(self.m['frozenTestAdaptations'],[])
 def test_exact_baseline_dependencies_present(self):
  paths={r.get('scratchPath',r['path']) for r in self.m['kitFiles']}
  counts={root:sum(p.startswith(root+'/') for p in paths) for root in ['main_app_integration_staging','main_app_integration_m1_1_staging','main_app_integration_m1_2_staging','main_transport_liveness_staging']}
  self.assertEqual(list(counts.values()),[5,3,5,2])
 def test_public_fixture_paths_exclude_node_modules(self):
  moves=[r for r in self.m['kitFiles'] if 'scratchPath' in r]
  self.assertEqual(len(moves),4)
  for row in self.m['kitFiles']:self.assertNotIn('node_modules',Path(row['path']).parts)
  for row in moves:
   self.assertTrue(row['path'].startswith('fixture-dependencies/'))
   self.assertIn('/node_modules/',row['scratchPath'])
 def test_kit_storage_remap_preserves_exact_bytes(self):
  row=next(r for r in self.m['kitFiles'] if 'scratchPath' in r)
  with tempfile.TemporaryDirectory() as t:
   dest=Path(t);runner.materialize_kit(HERE/'m2-host-kit/files',dest,[row])
   self.assertEqual(runner.digest(dest/row['scratchPath']),row['sha256'])
   self.assertFalse((dest/row['path']).exists())
 def test_merged_recovery_runner_preserved(self):
  paths={r['path']:r for r in self.m['kitFiles']}
  for name in ['run_merged.py','run_regression.py','run_mutations.py','harness.java.in']:
   self.assertIn('candidate/tests/recovery-ownership/'+name,paths)
 def test_dependency_closure_has_no_duplicate_paths(self):
  paths=[r['path'] for r in self.m['dependencyFiles']]
  self.assertEqual(len(paths),len(set(paths)));self.assertEqual(len(paths),1248)
  self.assertEqual(self.m['dependencyPackages']['jsdom']['version'],'26.1.0')
  self.assertIn('@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeActivity.java',paths)
 def test_manifest_drift_rejected_before_output(self):
  with tempfile.TemporaryDirectory() as t:
   kit=Path(t);(kit/'manifest.json').write_text('{}')
   old=runner.KIT;runner.KIT=kit
   try:
    with self.assertRaisesRegex(ValueError,'manifest drift'):runner.validate(kit/'missing',kit/'missing')
   finally:runner.KIT=old
 def test_existing_output_rejected_before_inputs(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t)
   with self.assertRaisesRegex(ValueError,'Output must not already exist'):
    runner.main(['--project',str(root/'missing'),'--output',str(root)])
 def test_output_input_overlap_rejected(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t)
   with self.assertRaisesRegex(ValueError,'Output overlaps input tree'):
    runner.main(['--project',str(root),'--output',str(root/'new')])

if __name__=='__main__':unittest.main(verbosity=2)
