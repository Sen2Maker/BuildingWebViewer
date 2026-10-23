#!/usr/bin/env python3
"""BWVPC v1 experimental writer: disjoint additive octree, local-origin Float32 chunks.
Requires NumPy. No network, no uploads, no modification of source data.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import numpy as np
spec=importlib.util.spec_from_file_location('sample',Path(__file__).with_name('prepare-building-previews.py'))
sample=importlib.util.module_from_spec(spec);spec.loader.exec_module(sample)


def pack_cloud(points, directory, root_budget=120000, node_budget=60000):
    if len(points)<1 or points.shape[1]!=3 or not np.isfinite(points).all():raise ValueError('Finite XYZ points required')
    directory.mkdir(parents=True,exist_ok=False)
    owners=np.zeros(len(points),dtype=np.uint16); nodes=[]; max_error=0.0
    def visit(indices, id, depth):
        nonlocal max_error
        if depth>16 or len(nodes)>=128:raise ValueError('Octree safety limit exceeded')
        subset=points[indices]; minimum=subset.min(axis=0); maximum=subset.max(axis=0)
        budget=root_budget if depth==0 else node_budget
        selected,_=sample.sample_points(subset,budget,True)
        chosen=indices[selected]
        if np.any(owners[chosen]):raise ValueError('A source row was assigned twice')
        owners[chosen]=len(nodes)+1
        origin=(minimum+maximum)/2
        offsets=(points[chosen]-origin).astype('<f4')
        error=float(np.abs(points[chosen]-(offsets.astype(np.float64)+origin)).max());max_error=max(max_error,error)
        if error>0.0001:raise ValueError('Coordinate error exceeds 0.1 mm')
        header=struct.pack('<8sII3dI20x',b'BWVPC001',len(chosen),0,*origin,12)
        payload=header+offsets.tobytes(); filename=id+'.bpc';(directory/filename).write_bytes(payload)
        node=dict(id=id,path=filename,points=len(chosen),subtreePoints=len(indices),bounds=[minimum.tolist(),maximum.tolist()],
                  bytes=len(payload),sha256=hashlib.sha256(payload).hexdigest(),children=[])
        nodes.append(node)
        mask=np.ones(len(indices),dtype=bool);mask[selected]=False
        remaining=indices[mask]
        if len(remaining):
            mid=(minimum+maximum)/2
            positions=points[remaining]
            octants=(positions[:,0]>=mid[0]).astype(np.uint8)+2*(positions[:,1]>=mid[1])+4*(positions[:,2]>=mid[2])
            for octant in range(8):
                part=remaining[octants==octant]
                if len(part):
                    child=id+str(octant);node['children'].append(child);visit(part,child,depth+1)
    visit(np.arange(len(points)),'r',0)
    if np.any(owners==0) or sum(n['points'] for n in nodes)!=len(points):raise ValueError('Partition lost source points')
    # Proof over source-row ownership, not float-coordinate equality after quantization.
    manifest=dict(format='BWVPC',version=1,refinement='additive-disjoint',pointCount=len(points),root='r',bounds=nodes[0]['bounds'],nodes=nodes)
    data=(json.dumps(manifest,separators=(',',':'))+'\n').encode();(directory/'cloud.bwvpc.json').write_bytes(data)
    return dict(bytes=len(data),sha256=hashlib.sha256(data).hexdigest()), dict(points=len(points),nodes=len(nodes),root_points=nodes[0]['points'],
        payload_bytes=sum(n['bytes'] for n in nodes),max_coordinate_error=max_error,assigned_exactly_once=True,
        ownership_sha256=hashlib.sha256(owners.tobytes()).hexdigest())


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--base-url',required=True);p.add_argument('--original-base-url',required=True);p.add_argument('--workers',type=int,default=4);a=p.parse_args()
    if a.output.exists():raise ValueError('Output must be new')
    if not a.base_url.startswith('https://') or not a.original_base_url.startswith('https://'):raise ValueError('HTTPS base URLs required')
    original=json.loads((a.source/'index.json').read_text()); items=original['buildings'];a.output.mkdir(parents=True)
    def one(item):
        id=str(item['id'])
        if not id.isdecimal():raise ValueError('This collection packer requires numeric building IDs')
        source=a.source/item['point_cloud']['path']
        if a.source.resolve() not in source.resolve().parents:raise ValueError('Invalid source path')
        raw=source.read_bytes()
        if len(raw)!=item['point_cloud']['bytes'] or hashlib.sha256(raw).hexdigest()!=item['point_cloud']['sha256']:raise ValueError('Source integrity failed')
        points=np.loadtxt(source,dtype=np.float64,ndmin=2)
        meta,audit=pack_cloud(points,a.output/id);mesh=item['mesh']
        return dict(id=id,pointCloud=dict(url=a.base_url.rstrip('/')+'/'+id+'/cloud.bwvpc.json',**meta),
                    mesh=dict(url=a.original_base_url.rstrip('/')+'/'+mesh['path'],bytes=mesh['bytes'],sha256=mesh['sha256'])),dict(id=id,source_sha256=item['point_cloud']['sha256'],**audit)
    buildings=[]; audits=[]
    with ThreadPoolExecutor(max_workers=a.workers) as pool:
        for building,audit in pool.map(one,items):
            buildings.append(building);audits.append(audit)
            if len(buildings)%500==0:print(f'Packed {len(buildings)}/{len(items)}',flush=True)
    index=dict(schemaVersion=3,format='BWVPC-COMPARISON',buildings=buildings)
    (a.output/'index.json').write_text(json.dumps(index,separators=(',',':'))+'\n')
    report=dict(buildings=len(buildings),points=sum(x['points'] for x in audits),nodes=sum(x['nodes'] for x in audits),
                bytes=sum(x['payload_bytes'] for x in audits),all_assigned_exactly_once=all(x['assigned_exactly_once'] for x in audits),records=audits)
    a.output.with_name(a.output.name+'-audit.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='records'}),flush=True)
if __name__=='__main__':main()
