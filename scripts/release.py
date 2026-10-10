#!/usr/bin/env python3
"""Validate a reviewable release; never creates a tag, uploads or publishes anything."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def release_notes(version, text):
    match = re.search(r'^## \[' + re.escape(version) + r'\] - \d{4}-\d{2}-\d{2}\n(.*?)(?=^## |^\[Unreleased\]:|\Z)', text, re.M | re.S)
    if not match or not match[1].strip(): raise ValueError('Missing dated changelog entry for ' + version)
    return match[1].strip() + '\n'

def validate(tag=None, package=True):
    version = json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version): raise ValueError('Invalid version')
    notes = release_notes(version,(ROOT/'CHANGELOG.md').read_text(encoding='utf-8'))
    for name in ['index','lod','wireframe','pointcloud']:
        text = (ROOT/(name+'.html')).read_text(encoding='utf-8')
        if 'content="'+version+'"' not in text or '/releases/tag/v'+version+'"' not in text:
            raise ValueError('Stale version in '+name)
    if tag:
        if tag != 'v'+version: raise ValueError('Tag and package version disagree')
        git = lambda *args: subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
        if git('rev-parse',tag+'^{commit}') != git('rev-parse','HEAD'): raise ValueError('Tag does not point at this checkout')
    if not tag:
        current_tag = subprocess.run(['git','rev-parse','--verify','refs/tags/v'+version+'^{commit}'],cwd=ROOT,text=True,capture_output=True)
        if current_tag.returncode == 0:
            head = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
            if current_tag.stdout.strip() != head: raise ValueError('This version is already released; increment package.json.version and add a changelog entry')
    if package:
        name = 'BuildingWebViewer-Web-v'+version+'.zip'; file = ROOT/'dist'/name
        expected = hashlib.sha256(file.read_bytes()).hexdigest()+'  '+name+'\n'
        if (ROOT/'dist/SHA256SUMS.txt').read_text() != expected: raise ValueError('Package checksum mismatch')
        with zipfile.ZipFile(file) as archive:
            if archive.testzip(): raise ValueError('Broken archive')
            for member in archive.namelist():
                path = Path(member)
                if path.parts[0] != 'BuildingWebViewer' or '..' in path.parts: raise ValueError('Unsafe archive path')
                local = ROOT.joinpath(*path.parts[1:])
                if not local.is_file() or archive.read(member) != local.read_bytes(): raise ValueError('Stale archive member: '+member)
            for required in ['index.html','package.json','CHANGELOG.md','README.md','README.en.md','assets/js/cloud.bundle.js']:
                if 'BuildingWebViewer/'+required not in archive.namelist(): raise ValueError('Missing archive member: '+required)
    return version, notes

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-tag')
    parser.add_argument('--notes',action='store_true')
    args=parser.parse_args()
    version, notes=validate(args.check_tag,package=not args.notes)
    print(notes if args.notes else 'PASS release v'+version+': changelog, page versions, archive contents and checksum',end='' if args.notes else '\n')
