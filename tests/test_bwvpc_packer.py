"""Small source-row partition and independent binary reconstruction regression."""
import importlib.util
from pathlib import Path
import json
import struct
import tempfile
import unittest
import numpy as np
spec=importlib.util.spec_from_file_location('packer',Path(__file__).resolve().parents[1]/'scripts/pack-bwvpc.py')
packer=importlib.util.module_from_spec(spec);spec.loader.exec_module(packer)

class TreePacking(unittest.TestCase):
    def test_exact_partition_and_precision(self):
        points=np.array([[x,y,z] for x in range(20) for y in range(10) for z in range(3)],dtype=np.float64)+[4000000,5000000,200]
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'cloud';_,audit=packer.pack_cloud(points,root,root_budget=80,node_budget=40)
            manifest=json.loads((root/'cloud.bwvpc.json').read_text());decoded=[]
            for node in manifest['nodes']:
                data=(root/node['path']).read_bytes();magic,count,flags,*tail=struct.unpack('<8sII3dI20x',data[:64]);origin=np.array(tail[:3])
                self.assertEqual(magic,b'BWVPC001');self.assertEqual(count,node['points'])
                decoded.extend((np.frombuffer(data[64:],dtype='<f4').reshape(-1,3)+origin).tolist())
            self.assertTrue(audit['assigned_exactly_once']);self.assertGreater(audit['nodes'],1)
            self.assertEqual(sorted(map(tuple,decoded)),sorted(map(tuple,points.tolist())))
            self.assertEqual(len(set(map(tuple,decoded))),len(points))
    def test_duplicates_are_source_rows_not_accidental_parent_child_repetition(self):
        points=np.zeros((300,3))
        with tempfile.TemporaryDirectory() as folder:
            _,audit=packer.pack_cloud(points,Path(folder)/'cloud',root_budget=80,node_budget=40)
            self.assertEqual(audit['points'],300);self.assertTrue(audit['assigned_exactly_once'])
    def test_small_blocks_grow_beyond_old_node_limit(self):
        points=np.array([[x,y,z] for x in range(10) for y in range(10) for z in range(10)],dtype=float)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'cloud';_,audit=packer.pack_cloud(points,root,root_budget=3,node_budget=3)
            self.assertGreater(audit['nodes'],128);self.assertLessEqual(audit['max_node_points'],3)
            self.assertLessEqual(audit['max_node_bytes'],100);self.assertTrue(audit['assigned_exactly_once'])

    def test_invalid_budgets_and_failed_conversion_leave_no_partial_tree(self):
        points=np.zeros((100,3))
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'cloud'
            for budget in [0,-1,1.5,120001,True]:
                with self.assertRaises(ValueError):packer.pack_cloud(points,root,root_budget=budget)
                self.assertFalse(root.exists())
            with self.assertRaisesRegex(ValueError,'safety limit'):packer.pack_cloud(points,root,root_budget=1,node_budget=1)
            self.assertFalse(root.exists())
            root.mkdir();(root/'keep').write_text('original')
            with self.assertRaises(FileExistsError):packer.pack_cloud(points,root)
            self.assertEqual((root/'keep').read_text(),'original')

    def test_general_inputs_batch_and_explicit_attribute_discard(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);source=base/'inputs';source.mkdir()
            (source/'a.xyz').write_text('1 2 3\n4 5 6\n')
            (source/'b.csv').write_text('z,x,y\n9,7,8\n')
            (source/'c.pts').write_text('2\n1 2 3\n4 5 6\n')
            (source/'d.ply').write_text('ply\nformat ascii 1.0\nelement vertex 1\nproperty double x\nproperty float y\nproperty float z\nend_header\n1000000.1234 2 3\n')
            (source/'e.pcd').write_text('VERSION .7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nWIDTH 1\nHEIGHT 1\nPOINTS 1\nDATA ascii\n1 2 3\n')
            report=packer.pack_inputs(source,base/'result',root_budget=1,node_budget=1)
            self.assertEqual(report['clouds'],5);self.assertEqual(report['points'],7)
            self.assertTrue(all(not r['input']['discarded_attributes'] for r in report['records']))
            rgb=base/'color.csv';rgb.write_text('x,y,z,r,g,b\n1,2,3,255,0,0\n')
            with self.assertRaisesRegex(ValueError,'extra attributes'):packer.pack_inputs(rgb,base/'rejected')
            self.assertFalse((base/'rejected').exists())
            report=packer.pack_inputs(rgb,base/'allowed',xyz_only=True)
            self.assertEqual(report['records'][0]['input']['discarded_attributes'],['r','g','b'])
            self.assertEqual(rgb.read_text(),'x,y,z,r,g,b\n1,2,3,255,0,0\n')

if __name__=='__main__':unittest.main()
