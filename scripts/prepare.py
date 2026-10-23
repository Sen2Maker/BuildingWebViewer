#!/usr/bin/env python3
"""Render this application's templates and copy ONLY its reviewed static allowlist."""
from pathlib import Path
import html,json,re,shutil
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
config=json.loads((ROOT/'app.config.json').read_text())
pkg=json.loads((ROOT/'package.json').read_text())
INPUT=ROOT/'.vite-input';PUBLIC=ROOT/'.vite-public'
for folder in [INPUT,PUBLIC]:
 if folder.is_symlink():raise ValueError('Refusing symlink build root')
 if folder.exists():shutil.rmtree(folder)
 folder.mkdir()
(INPUT/'src').symlink_to(ROOT/'src',target_is_directory=True)
def allowed(name):
 path=Path(name)
 if path.is_absolute() or '..' in path.parts:raise ValueError('Unsafe allowlist path: '+name)
 source=ROOT/path
 if source.is_symlink() or ROOT not in source.resolve().parents:raise ValueError('External asset: '+name)
 if config['app']=='main' and (name.startswith('assets/vendor/cad/') or name.startswith('src/cad/') or name in ['assets/css/cad.css','cad.html','cad-editor.html'] or re.search(r'assets/js/cad(?:-editor)?[.-]',name)):raise ValueError('CAD forbidden in main package: '+name)
 return source
for name in config['assets']+config['icons']:
 source=allowed(name)
 dest=(INPUT if name.startswith('assets/css/') else PUBLIC)/name
 dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
(PUBLIC/'.nojekyll').touch()
meta=json.loads((ROOT/'src/shared/site-meta.json').read_text())
def replace(text,marker,content):
 pattern=r'<!-- '+marker+r':start -->[\s\S]*?<!-- '+marker+r':end -->'
 text,n=re.subn(pattern,lambda _:f'<!-- {marker}:start -->\n{content}\n<!-- {marker}:end -->',text)
 if n!=1:raise ValueError('Expected one '+marker+' block')
 return text
def project_sidebar(text,name):
 path=ROOT/'src/shared/project-sidebar.json'
 if not path.exists():return text
 c=json.loads(path.read_text()).get(name)
 if not c:return text
 shell=(ROOT/'src/shared/project-sidebar.html').read_text()
 for k in ['accept','list_id','selection_actions']:shell=shell.replace('{{'+k+'}}',c[k])
 shell=shell.replace('  {{mode_controls}}',(ROOT/c['mode_file']).read_text() if c.get('mode_file') else '')
 shell=shell.replace('{{options}}',(ROOT/c['options_file']).read_text())
 return replace(text,'project-sidebar',shell)
for name in config['pages']:
 if name=='assets/mobile/index.html':
  destination=INPUT/name;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_text((ROOT/'src/mobile/home-page.html').read_text());continue
 source=ROOT/('src/cad/editor-page.html' if name=='cad-editor.html' else 'src/pages/'+name)
 text=source.read_text()
 head='<style>'+(ROOT/'src/shared/page-boot.css').read_text()+'</style>\n<script>'+(ROOT/'src/shared/page-boot.js').read_text()+'</script>'
 text=replace(text,'boot-head',head);text=replace(text,'boot-body',(ROOT/'src/shared/page-boot.html').read_text())
 text=project_sidebar(text,name)
 info=meta[name];appname='BuildingWebViewer' if config['app']=='main' else 'CAD application (staging)'
 metadata='<meta name="application-build" content="BUILD_PLACEHOLDER">\n<meta name="application-name" content="'+appname+'">\n<meta name="application-version" content="'+pkg['version']+'">\n<meta name="description" content="'+html.escape(info['description'],quote=True)+'">'
 if config['productionHomepage']:
  if not config['productionHomepage'].startswith('https://'):raise ValueError('Production homepage must be HTTPS')
  metadata+='\n<link rel="canonical" href="'+html.escape(config['productionHomepage'].rstrip('/')+'/'+('' if name=='index.html' else name),quote=True)+'">'
 text=replace(text,'site-meta',metadata)
 footer='<span>Local extraction candidate · not published · licensing review pending</span>'
 if config['repositoryUrl']:footer+='<a href="'+html.escape(config['repositoryUrl'],quote=True)+'" target="_blank" rel="noopener noreferrer">项目仓库 ↗</a>'
 text=replace(text,'site-footer',footer)
 for kind in ['mainWeb','cadWeb']:
  target=config['links'][kind]
  if not target or urlparse(target).scheme not in ['', 'https', 'http'] or target.startswith('//'):raise ValueError('Unsupported navigation URL')
  text=text.replace('{{'+kind+'}}',html.escape(target,quote=True))
 text=re.sub(r'<script (?:data-viewer-src|(?:defer )?src)=[\"\']assets/js/([\w-]+)\.bundle\.js(?:\?[^\"\']*)?[\"\']></script>',lambda m:f'<script type="module" src="/src/entries/{m[1]}.js"></script>',text)
 text=re.sub(r'((?:src|href)=[\"\'])(assets/[^\"\'?]+|favicon[^\"\'?]*|apple-touch-icon.png)(?:\?[^\"\']*)?([\"\'])',r'\1/\2\3',text)
 if 'data-viewer-src=' in text or 'type="module"' not in text:raise ValueError('Missing Vite module entry: '+name)
 (INPUT/name).write_text(text)
print(f"Prepared {config['app']}: {len(config['pages'])} pages, {len(config['assets'])} explicitly allowed static files.")
