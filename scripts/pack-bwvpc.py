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
import shutil
import subprocess
import tempfile
import numpy as np
spec=importlib.util.spec_from_file_location('sample',Path(__file__).with_name('prepare-building-previews.py'))
sample=importlib.util.module_from_spec(spec);spec.loader.exec_module(sample)


MAX_POINTS=10000000
MAX_NODES=4096
MAX_DEPTH=32
MANIFEST_MAX_BYTES=5*1024*1024
DEFAULT_ROOT_POINTS=8000
DEFAULT_NODE_POINTS=8000
SUPPORTED_INPUTS={'.xyz','.txt','.csv','.pts','.ply','.pcd'}


def pack_cloud(points, directory, root_budget=DEFAULT_ROOT_POINTS, node_budget=DEFAULT_NODE_POINTS):
    for budget in (root_budget,node_budget):
        if isinstance(budget,bool) or not isinstance(budget,(int,np.integer)) or not 1<=budget<=120000:
            raise ValueError('Node point budgets must be integers from 1 to 120000')
    if points.ndim!=2 or points.shape[1]!=3 or not 1<=len(points)<=MAX_POINTS or not np.isfinite(points).all():
        raise ValueError('Finite XYZ points required; maximum 10000000 points per cloud')
    if np.abs(points).max()>1e12:raise ValueError('Coordinates exceed the reader limit')
    directory.mkdir(parents=True,exist_ok=False)
    owners=np.zeros(len(points),dtype=np.uint16); nodes=[]; max_error=0.0
    def visit(indices, id, depth):
        nonlocal max_error
        if depth>MAX_DEPTH or len(nodes)>=MAX_NODES:raise ValueError('Octree safety limit exceeded; increase point budgets or split this source into separate spatial tiles')
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
    try:
        visit(np.arange(len(points)),'r',0)
        if np.any(owners==0) or sum(n['points'] for n in nodes)!=len(points):raise ValueError('Partition lost source points')
        # Proof over source-row ownership, not float-coordinate equality after quantization.
        manifest=dict(format='BWVPC',version=1,refinement='additive-disjoint',pointCount=len(points),root='r',bounds=nodes[0]['bounds'],nodes=nodes)
        data=(json.dumps(manifest,separators=(',',':'))+'\n').encode()
        if len(data)>MANIFEST_MAX_BYTES:raise ValueError('Manifest exceeds the 5 MiB reader limit')
        (directory/'cloud.bwvpc.json').write_bytes(data)
        return dict(bytes=len(data),sha256=hashlib.sha256(data).hexdigest()), dict(points=len(points),nodes=len(nodes),root_points=nodes[0]['points'],
            root_budget=root_budget,node_budget=node_budget,max_node_points=max(n['points'] for n in nodes),
            max_node_bytes=max(n['bytes'] for n in nodes),max_depth=max(len(n['id'])-1 for n in nodes),
            payload_bytes=sum(n['bytes'] for n in nodes),max_coordinate_error=max_error,assigned_exactly_once=True,
            ownership_sha256=hashlib.sha256(owners.tobytes()).hexdigest())
    except BaseException:
        # Only this invocation's exclusively created directory is removed.
        shutil.rmtree(directory)
        raise


def pack_inputs(source, output, root_budget=DEFAULT_ROOT_POINTS, node_budget=DEFAULT_NODE_POINTS, xyz_only=False):
    """Offline single-file / recursive batch conversion using the viewer's readers."""
    if source.is_symlink() or not (source.is_file() or source.is_dir()):raise ValueError('Input must be a regular file or directory, not a symlink')
    if output.exists() or output.is_symlink():raise ValueError('Output must be new')
    if source.is_dir() and (source.resolve()==output.resolve() or source.resolve() in output.resolve().parents):raise ValueError('Output must be outside the input directory')
    files=[source] if source.is_file() else sorted(p for p in source.rglob('*') if p.suffix.lower() in SUPPORTED_INPUTS and p.is_file())
    if not files:raise ValueError('No supported point-cloud inputs found')
    for file in files:
        if file.is_symlink() or file.suffix.lower() not in SUPPORTED_INPUTS:raise ValueError('Supported inputs: XYZ, TXT, CSV, PTS, PLY, PCD; symlinks are not accepted')
        if source.is_dir() and source.resolve() not in file.resolve().parents:raise ValueError('Input escaped source directory')
    output.mkdir(parents=True,exist_ok=False)
    records=[]
    try:
        for file in files:
            relative=Path(file.name) if source.is_file() else file.relative_to(source)
            target=output/relative.parent/(relative.name+'.bwvpc')
            # Temporary Float64 coordinates avoid text re-encoding and preserve large origins.
            with tempfile.TemporaryDirectory(prefix='bwvpc-input-',dir=output) as temporary:
                raw=Path(temporary)/'positions.f64'
                command=['node',str(Path(__file__).with_name('read-bwvpc-input.mjs')),str(file),str(raw)]
                if xyz_only:command.append('--xyz-only')
                read=subprocess.run(command,capture_output=True,text=True)
                if read.returncode:raise ValueError(read.stderr.strip() or 'Point-cloud reader failed')
                details=json.loads(read.stdout)
                points=np.memmap(raw,dtype='<f8',mode='r',shape=(details['points'],3))
                try:meta,audit=pack_cloud(points,target,root_budget,node_budget)
                finally:points._mmap.close()
            records.append(dict(source=relative.as_posix(),manifest=(target/'cloud.bwvpc.json').relative_to(output).as_posix(),
                manifest_integrity=meta,input=details,**audit))
            print(f'Packed {len(records)}/{len(files)}: {relative}',flush=True)
        report=dict(format='BWVPC-PACKING-REPORT',version=1,clouds=len(records),points=sum(r['points'] for r in records),
            nodes=sum(r['nodes'] for r in records),all_assigned_exactly_once=True,records=records)
        (output/'packing-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        return report
    except BaseException:
        shutil.rmtree(output)
        raise


def main():
    p=argparse.ArgumentParser(description=__doc__)
    mode=p.add_mutually_exclusive_group(required=True)
    mode.add_argument('--source',type=Path,help='Existing comparison dataset directory with index.json')
    mode.add_argument('--input',type=Path,help='Single point cloud or directory; offline conversion, no mesh required')
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--root-points',type=int,default=DEFAULT_ROOT_POINTS)
    p.add_argument('--node-points',type=int,default=DEFAULT_NODE_POINTS)
    p.add_argument('--xyz-only',action='store_true',help='Explicitly allow dropping non-XYZ attributes in --input mode')
    p.add_argument('--base-url');p.add_argument('--original-base-url');p.add_argument('--workers',type=int,default=4);a=p.parse_args()
    if a.input:
        if a.base_url or a.original_base_url:p.error('--input outputs local trees, not an online comparison catalog')
        report=pack_inputs(a.input,a.output,a.root_points,a.node_points,a.xyz_only)
        print(json.dumps({k:v for k,v in report.items() if k!='records'}));return
    if a.xyz_only:p.error('--xyz-only is only used with --input')
    if not a.base_url or not a.original_base_url:p.error('--source requires --base-url and --original-base-url')
    if not 1<=a.workers<=16:p.error('--workers must be 1..16')
    if a.output.with_name(a.output.name+'-audit.json').exists():raise ValueError('Audit output already exists')
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
        meta,audit=pack_cloud(points,a.output/id,a.root_points,a.node_points);mesh=item['mesh']
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
