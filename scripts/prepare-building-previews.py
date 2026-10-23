#!/usr/bin/env python3
"""Make immutable, bounded binary PLY previews from an explicitly selected XYZ index.

Requires NumPy. Reads originals without modifying them; never uploads anything.
Spatial voxel representatives are existing points, not averaged replacement points.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import numpy as np


def sample_points(points, limit, return_indices=False):
    if len(points) <= limit:
        return (np.arange(len(points)) if return_indices else points), 0.0
    origin = points.min(axis=0)
    span = float(np.ptp(points, axis=0).max())
    if not span:
        return (np.arange(min(len(points), limit)) if return_indices else points[:limit]), 0.0
    # Find a cell size with no more than the requested number of occupied voxels.
    low, high = 0.0, span
    chosen = np.array([0])
    for _ in range(20):
        width = (low + high) / 2
        cells = np.floor((points - origin) / width).astype(np.int64)
        _, indices = np.unique(cells, axis=0, return_index=True)
        if len(indices) > limit:
            low = width
        else:
            high, chosen = width, indices
    return (np.sort(chosen) if return_indices else points[np.sort(chosen)]), high


def encode_ply(points):
    header = ('ply\nformat binary_little_endian 1.0\n'
              f'element vertex {len(points)}\nproperty float x\nproperty float y\nproperty float z\nend_header\n')
    return header.encode('ascii') + points.astype('<f4').tobytes()


def prepare(source, output, base, original_base, limit=120000, workers=4):
    if output.exists():
        raise ValueError('Output must be a new directory')
    if not base.startswith('https://') or not original_base.startswith('https://'):
        raise ValueError('Public resource bases must use HTTPS')
    index = json.loads((source / 'index.json').read_text())
    buildings = index['buildings']
    ids = [str(item['id']) for item in buildings]
    if len(set(ids)) != len(ids) or any(not re.fullmatch(r'[A-Za-z0-9_-]+', id) for id in ids):
        raise ValueError('Building IDs must be unique safe path segments')
    if not 1000 <= limit <= 120000:
        raise ValueError('Point budget must be 1000–120000')
    output.mkdir(parents=True)
    def one(item):
        id = str(item['id'])
        path = source / item['point_cloud']['path']
        if source.resolve() not in path.resolve().parents:
            raise ValueError('Source path escaped dataset root')
        raw = path.read_bytes()
        if len(raw) != item['point_cloud']['bytes'] or hashlib.sha256(raw).hexdigest() != item['point_cloud']['sha256']:
            raise ValueError(f'Source integrity mismatch: {id}')
        points = np.loadtxt(path, dtype=np.float64, ndmin=2)
        if points.shape[1] != 3 or not len(points) or not np.isfinite(points).all():
            raise ValueError(f'Expected finite XYZ-only points: {id}')
        sampled, voxel = sample_points(points, limit)
        precision = float(np.abs(sampled - sampled.astype('<f4').astype(np.float64)).max())
        if precision > 0.0001:
            raise ValueError(f'Float32 precision exceeds 0.1 mm: {id}')
        data = encode_ply(sampled)
        folder = output / id
        folder.mkdir()
        (folder / 'pc.ply').write_bytes(data)
        cloud = dict(id=f'{id}/point_cloud', name=f'{id} · 点云', viewer='pointcloud', format='ply',
                     url=f'{base.rstrip("/")}/{id}/pc.ply', bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        mesh = item['mesh']
        mesh_entry = dict(id=f'{id}/mesh', name=f'{id} · Mesh', viewer='lod', format='obj',
                          url=f'{original_base.rstrip("/")}/{mesh["path"]}', bytes=mesh['bytes'], sha256=mesh['sha256'])
        audit = dict(id=id, original_points=len(points), preview_points=len(sampled), original_bytes=len(raw),
                     preview_bytes=len(data), voxel_size=voxel, max_coordinate_error=precision,
                     source_sha256=item['point_cloud']['sha256'], preview_sha256=cloud['sha256'])
        return cloud, mesh_entry, audit
    datasets, audits = [], []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for i, (cloud, mesh, audit) in enumerate(pool.map(one, buildings), 1):
            datasets.extend([cloud, mesh]); audits.append(audit)
            if i % 500 == 0:
                print(f'Prepared {i}/{len(buildings)}', flush=True)
    (output / 'index.json').write_text(json.dumps({'schemaVersion':1, 'datasets':datasets}, ensure_ascii=False, separators=(',', ':'))+'\n')
    report = dict(buildings=len(audits), max_points=limit, original_bytes=sum(a['original_bytes'] for a in audits),
                  preview_bytes=sum(a['preview_bytes'] for a in audits), sampled_buildings=sum(a['preview_points'] < a['original_points'] for a in audits),
                  max_preview_bytes=max(a['preview_bytes'] for a in audits), records=audits)
    (output.parent / (output.name+'-audit.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k != 'records'}), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--base-url', required=True)
    p.add_argument('--original-base-url', required=True)
    p.add_argument('--max-points', type=int, default=120000)
    p.add_argument('--workers', type=int, default=4)
    a = p.parse_args()
    prepare(a.source, a.output, a.base_url, a.original_base_url, a.max_points, a.workers)
