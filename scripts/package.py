#!/usr/bin/env python3
"""Validate and package only the inventoried output of this app. Never publish."""
from pathlib import Path
import argparse,hashlib,json,zipfile,re,sys
ROOT=Path(__file__).resolve().parents[1]
config=json.loads((ROOT/'app.config.json').read_text());dist=ROOT/'dist'
def validate():
 inventory=json.loads((dist/'asset-inventory.json').read_text())
 listed={row['path'] for row in inventory['files']}
 actual={p.relative_to(dist).as_posix() for p in dist.rglob('*') if p.is_file()}-{'asset-inventory.json'}
 if listed!=actual:raise ValueError('Output differs from the final inventory')
 for row in inventory['files']:
  path=Path(row['path'])
  if path.is_absolute() or '..' in path.parts:raise ValueError('Unsafe output path')
  file=dist/path
  if file.is_symlink() or ROOT not in file.resolve().parents:raise ValueError('External output path')
  data=file.read_bytes()
  if len(data)!=row['bytes'] or hashlib.sha256(data).hexdigest()!=row['sha256']:raise ValueError('Output integrity mismatch: '+row['path'])
  if config['app']=='main' and (str(path).startswith('assets/vendor/cad/') or path.suffix in ['.wasm','.ttf','.otf'] or re.search(r'(?:^|/)cad(?:-editor)?(?:[.-]|/)',str(path))):raise ValueError('Forbidden CAD output: '+str(path))
 modules=json.loads((dist/'build-modules.json').read_text())['modules']
 if config['app']=='main' and any('/cad/' in p for p in modules):raise ValueError('CAD source in main chunk graph')
 if config['app']=='cad' and any(re.search(r'/src/(?:lod|cloud|pointcloud|gaussian|generate)/', '/'+p) for p in modules):raise ValueError('Non-CAD tool source in CAD chunk graph')
 print(f"PASS {config['app']}: {len(actual)} inventoried files and {len(modules)} own source modules")
 return inventory
cli=argparse.ArgumentParser();cli.add_argument('--check',action='store_true');cli.add_argument('--release-check',action='store_true');args=cli.parse_args()
if args.release_check:
 missing=[key for key,value in config['releaseReview'].items() if value is not True]
 if not config['productionHomepage'] or not config['repositoryUrl']:missing.append('verified repository and Pages URLs')
 if not all(str(config['links'].get(key,'')).startswith('https://') for key in ['mainWeb','cadWeb']):missing.append('verified production cross-links')
 if missing:raise SystemExit('Release blocked: '+', '.join(missing))
validate()
if not args.check and not args.release_check:
 out=ROOT/'packages';out.mkdir(exist_ok=True);target=out/(config['app']+'-web-staging.zip')
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
  for path in sorted(dist.rglob('*')):
   if path.is_file():
    info=zipfile.ZipInfo(path.relative_to(dist).as_posix(),date_time=(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;archive.writestr(info,path.read_bytes())
 print('Created '+str(target))
