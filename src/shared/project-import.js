/** Import adapters preserve entry/File identity so tree edits do not invalidate render caches. */
export function projectFilePath(file, paths) {
  return (paths?.get(file) || file.webkitRelativePath || file.name).replaceAll('\\', '/');
}
export function projectFileKey(file, path) { return `${path}\0${file.size}\0${file.lastModified}`; }
export function projectUniqueId(base, names) {
  let id = base, suffix = 2;
  while (names.has(id)) id = `${base}_${suffix++}`;
  names.add(id); return id;
}
export function appendLegacyLodFiles(entries, project, files, paths) {
  const keys = new Set(entries.map(entry => entry.key)), names = new Set(entries.map(entry => entry.id));
  let added = 0, duplicates = 0;
  for (const file of files) {
    if (!/\.obj$/i.test(file.name)) continue;
    const path = projectFilePath(file, paths), key = projectFileKey(file,path);
    if (keys.has(key)) { duplicates++; continue; }
    const base = file.name.replace(/\.obj$/i,''), id = projectUniqueId(base,names);
    const entry = {id,key,file,bytes:file.size}; project.assign(entry,path);
    // Keep names clear when separate folders contain the same model number.
    if (id !== base) entry.treeName += ` [${id}]`;
    entries.push(entry); keys.add(key); added++;
  }
  return {added,duplicates};
}
export function appendLegacyWireFiles(entries, project, files, paths) {
  const groups = new Map(entries.map(entry => [entry.sourceGroup,entry]));
  const names = new Set(entries.map(entry => entry.id));
  let added = 0, duplicates = 0;
  for (const file of files) {
    if (!/\.(obj|xyz|txt|csv|pts|ply|pcd)$/i.test(file.name)) continue;
    const path = projectFilePath(file,paths), parts = path.split('/');
    const sourceGroup = parts.slice(0,-1).join('/');
    let entry = groups.get(sourceGroup);
    if (!entry) {
      const base = parts.length > 2 ? parts.slice(1,-1).join('/') : parts.length === 2 ? parts[0] : 'Files';
      entry = {id:projectUniqueId(base,names),sourceGroup,wires:[],clouds:[],fileKeys:new Set()};
      // A leaf is a building set; its parent folders remain independently manageable.
      project.assign(entry,sourceGroup || 'Files');
      entries.push(entry); groups.set(sourceGroup,entry);
    }
    const key = projectFileKey(file,path);
    if (entry.fileKeys.has(key)) { duplicates++; continue; }
    entry.fileKeys.add(key); entry[/\.obj$/i.test(file.name)?'wires':'clouds'].push(file); added++;
  }
  // Keep file ordering stable while adding files: selected dropdown indices remain valid.
  return {added,duplicates};
}

/** Numeric ID parents take precedence; flat numeric filenames remain separate at any depth. */
export function objectFileSource(file,paths) {
  const path=projectFilePath(file,paths),parts=path.split('/').filter(Boolean),name=parts.at(-1)||file.name;
  const stem=name.replace(/\.[^.]+$/,''),directory=parts.slice(0,-1).join('/'),parent=parts.at(-2)||'';
  const generic=/^(?:mesh|model|raw|refined|final|reconstruction|wireframe|wire|pc|points?|point_cloud|cloud)(?:[_. -].*)?$/i.test(stem);
  const folder=!!directory && (/^\d+$/.test(parent) || (!/^\d+$/.test(stem) && (parts.length>2 || generic)));
  const base=folder ? (parts.length>2?parts.slice(1,-1).join('/'):parent) : stem;
  return {path,key:projectFileKey(file,path),identity:folder?`folder:${directory}`:`file:${directory}/${stem}`,base,folder,sourceGroup:folder?directory:[directory,stem].filter(Boolean).join('/'),treePath:folder?directory:path.replace(/\.[^.]+$/,'')};
}
function appendObjectFiles(entries,project,files,paths,mesh) {
  const groups=new Map(entries.filter(e=>e.sourceIdentity).map(e=>[e.sourceIdentity,e])),names=new Set(entries.map(e=>e.id));
  let added=0,duplicates=0;
  for(const file of files) {
    if(!(mesh?/\.obj$/i:/\.(obj|xyz|txt|csv|pts|ply|pcd)$/i).test(file.name))continue;
    const source=objectFileSource(file,paths);let entry=groups.get(source.identity);
    if(!entry){
      entry={id:projectUniqueId(source.base,names),sourceIdentity:source.identity,sourceGroup:source.sourceGroup,sourceLayout:source.folder?'folder':'file',files:[],wires:[],clouds:[],fileKeys:new Set(),sourceKeys:new Map()};
      project.assign(entry,source.treePath);if(entry.id!==source.base)entry.treeName+=` [${entry.id}]`;
      entries.push(entry);groups.set(source.identity,entry);
    }
    if(entry.fileKeys.has(source.key)){duplicates++;continue;}
    entry.fileKeys.add(source.key);entry.sourceKeys.set(file,source.key);entry[/\.obj$/i.test(file.name)?'wires':'clouds'].push(file);
    if(mesh){entry.files.push(file);if(!entry.file){entry.file=file;entry.key=source.key;entry.bytes=file.size;}}
    added++;
  }
  return {added,duplicates};
}
export function appendLodFiles(entries,project,files,paths){return appendObjectFiles(entries,project,files,paths,true);}
export function appendWireFiles(entries,project,files,paths){return appendObjectFiles(entries,project,files,paths,false);}
