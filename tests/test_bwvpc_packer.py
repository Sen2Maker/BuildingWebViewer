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
if __name__=='__main__':unittest.main()
