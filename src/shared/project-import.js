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
export function appendLodFiles(entries, project, files, paths) {
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
export function appendWireFiles(entries, project, files, paths) {
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
