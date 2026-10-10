package io.github.sen2maker.buildingwebviewer.preview;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.zip.*;
/** Per-project atomic manifests; immutable content-addressed files are shared across projects. */
final class ProjectStore {
  final File root,objects,projects,inbox;final Context context;
  ProjectStore(Context context){this.context=context;root=new File(context.getFilesDir(),"bwv");objects=new File(root,"objects");projects=new File(root,"projects");inbox=new File(root,"inbox");objects.mkdirs();projects.mkdirs();inbox.mkdirs();}
  static String id(){return UUID.randomUUID().toString();}
  File manifest(String id)throws IOException{if(id==null||!id.matches("[a-f0-9-]{36}"))throw new IOException("Invalid project ID");return new File(projects,id+".json");}
  synchronized JSONObject get(String id)throws Exception {try(InputStream in=new AtomicFile(manifest(id)).openRead()){return new JSONObject(readText(in));}}
  static String readText(InputStream in)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1){if(out.size()+n>4*1024*1024)throw new IOException("Project metadata exceeds 4 MiB");out.write(b,0,n);}return out.toString("UTF-8");}
  synchronized void put(JSONObject project)throws Exception{
    project.put("updatedAt",System.currentTimeMillis());AtomicFile target=new AtomicFile(manifest(project.getString("id")));FileOutputStream out=null;
    try{byte[] bytes=project.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>4*1024*1024)throw new IOException("Project metadata too large");out=target.startWrite();out.write(bytes);target.finishWrite(out);}catch(Exception e){if(out!=null)target.failWrite(out);throw e;}
  }
  synchronized JSONObject create(String name)throws Exception{
    JSONObject p=new JSONObject().put("id",id()).put("schemaVersion",1).put("name",name==null||name.isBlank()?new SimpleDateFormat("yyyy-MM-dd HH:mm",Locale.ROOT).format(new Date()):name).put("files",new JSONArray()).put("states",new JSONObject()).put("status","ready").put("createdAt",System.currentTimeMillis());put(p);return p;
  }
  synchronized JSONArray list()throws Exception{
    ArrayList<JSONObject> list=new ArrayList<>();File[] files=projects.listFiles((dir,name)->name.endsWith(".json"));if(files!=null)for(File f:files){try{list.add(get(f.getName().replace(".json","")));}catch(Exception ignored){}}
    list.sort((a,b)->Long.compare(b.optLong("updatedAt"),a.optLong("updatedAt")));return new JSONArray(list);
  }
  synchronized JSONObject saveState(String id,String tool,JSONObject state)throws Exception{
    if(!Arrays.asList("lod","wireframe","pointcloud").contains(tool))throw new IOException("Invalid viewer");JSONObject p=get(id);p.getJSONObject("states").put(tool,state);p.put("tool",tool);put(p);return p;
  }
  synchronized void rename(String id,String name)throws Exception{if(name==null||name.isBlank()||name.length()>120)throw new IOException("Invalid project name");JSONObject p=get(id);p.put("name",name);put(p);}
  synchronized void trash(String id,boolean value)throws Exception{JSONObject p=get(id);p.put("trashed",value);put(p);}
  String displayName(Uri uri){try(Cursor c=context.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst())return c.getString(0);}catch(Exception ignored){}return "shared-file";}
  void copy(InputStream in,File dest)throws Exception{dest.getParentFile().mkdirs();try(FileOutputStream out=new FileOutputStream(dest)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){if(dest.getParentFile().getUsableSpace()<64L*1024*1024)throw new IOException("Not enough storage / 存储空间不足");out.write(b,0,n);}out.getFD().sync();}}
  JSONObject object(File source,String path)throws Exception{
    MessageDigest sha=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(source)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)sha.update(b,0,n);}
    StringBuilder hex=new StringBuilder();for(byte value:sha.digest())hex.append(String.format(Locale.ROOT,"%02x",value&255));String key=hex.toString();File target=new File(objects,key);
    if(!target.exists()){File tmp=new File(objects,key+".tmp");try(InputStream in=new FileInputStream(source)){copy(in,tmp);}if(!tmp.renameTo(target))throw new IOException("Cannot commit imported file");}
    return new JSONObject().put("key",key).put("path",ArchivePolicy.path(path)).put("size",target.length()).put("modified",0);
  }
  File objectFile(String key)throws IOException{if(key==null||!key.matches("[a-f0-9]{64}"))throw new IOException("Invalid file key");return new File(objects,key);}
  /** Durable receipt comes before decoding. Previously committed project data survives any failure. */
  JSONObject importUris(String projectId,List<Uri> uris)throws Exception{
    JSONObject project=projectId==null?create(null):get(projectId);String projectKey=project.getString("id");File job=new File(inbox,id());job.mkdirs();
    project.put("status","importing");project.put("importJob",job.getName());put(project);
    try{
      JSONArray receipt=new JSONArray();int i=0;
      for(Uri uri:uris){if(!"content".equals(uri.getScheme()))throw new IOException("Only granted content URIs are supported");String name=displayName(uri);name=new File(name.replace('\\','/')).getName();if(ArchivePolicy.split(name))throw new IOException("Split archives are not supported / 不支持分卷压缩包");File dir=new File(job,"source-"+(i++));dir.mkdirs();File tmp=new File(dir,"incoming.tmp"),source=new File(dir,name);
        try(InputStream in=context.getContentResolver().openInputStream(uri)){if(in==null)throw new IOException("Cannot read shared file");copy(in,tmp);}if(!tmp.renameTo(source))throw new IOException("Cannot save shared file");receipt.put(source.getAbsolutePath());
      }
      try(FileOutputStream out=new FileOutputStream(new File(job,"receipt.json"))){out.write(receipt.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
      return decodeJob(projectKey,job);
    }catch(Exception e){project=get(projectKey);project.put("status","failed").put("error",String.valueOf(e.getMessage()));put(project);throw e;}
  }
  JSONObject decodeJob(String id,File job)throws Exception{
    JSONArray receipt;try(InputStream in=new FileInputStream(new File(job,"receipt.json"))){receipt=new JSONArray(readText(in));}
    JSONObject project=get(id);JSONArray next=new JSONArray(project.getJSONArray("files").toString());Set<String> names=new HashSet<>();for(int i=0;i<next.length();i++)names.add(next.getJSONObject(i).getString("path"));
    final int before=next.length();int skipped=0;
    for(int i=0;i<receipt.length();i++){
      File source=new File(receipt.getString(i));if(!source.getCanonicalPath().startsWith(job.getCanonicalPath()+File.separator))throw new IOException("Invalid import receipt");
      String name=source.getName();File stage=new File(job,"extract-"+i);stage.mkdirs();
      if(name.toLowerCase(Locale.ROOT).endsWith(".bwv.zip")){
        if(before!=0||receipt.length()!=1)throw new IOException("Import a project backup as a separate new project");JSONObject restored=restoreBackup(source,stage);project=get(id);project.put("name",restored.getString("name")).put("states",restored.getJSONObject("states")).put("files",restored.getJSONArray("files")).put("status","ready");project.remove("error");project.remove("importJob");put(project);deleteTree(job);return project;
      }

      ArchiveImporter.Sink sink=(file,path)->{String unique=path;int suffix=2;while(names.contains(unique))unique="import-"+(suffix++)+"/"+path;names.add(unique);next.put(object(file,unique));};
      if(ArchivePolicy.archive(name))ArchiveImporter.extract(source,stage,(file,path)->sink.accept(file,name+"/"+path));
      else if(ArchivePolicy.data(name))sink.accept(source,name);else skipped++;
    }
    if(next.length()==before)throw new IOException("No supported data / 未找到支持的模型或点云");
    project=get(id);project.put("files",next).put("status","ready").put("ignoredFiles",skipped);project.remove("error");project.remove("importJob");put(project);deleteTree(job);return project;
  }
  synchronized JSONObject retry(String id)throws Exception{JSONObject p=get(id);String job=p.optString("importJob");if(!job.matches("[a-f0-9-]{36}"))throw new IOException("No recoverable import");return decodeJob(id,new File(inbox,job));}
  synchronized long cleanup()throws Exception{
    Set<String> referenced=new HashSet<>();File[] manifests=projects.listFiles((dir,name)->name.endsWith(".json"));
    if(manifests!=null)for(File f:manifests){JSONObject p=get(f.getName().replace(".json",""));JSONArray files=p.getJSONArray("files");for(int i=0;i<files.length();i++)referenced.add(files.getJSONObject(i).getString("key"));}
    long freed=0;File[] blobs=objects.listFiles();if(blobs!=null)for(File f:blobs)if(!referenced.contains(f.getName())){long bytes=f.length();if(f.delete())freed+=bytes;}return freed;
  }
  synchronized long emptyTrash()throws Exception{
    JSONArray all=list();for(int i=0;i<all.length();i++){JSONObject p=all.getJSONObject(i);if(p.optBoolean("trashed")){String job=p.optString("importJob");if(job.matches("[a-f0-9-]{36}"))deleteTree(new File(inbox,job));new AtomicFile(manifest(p.getString("id"))).delete();}}
    return cleanup();
  }
  synchronized File backup(String id,File dir)throws Exception{
    JSONObject p=get(id);dir.mkdirs();File output=new File(dir,"BuildingWebViewer-"+id+".bwv.zip");
    JSONObject metadata=new JSONObject().put("format","BuildingWebViewer.project").put("version",1).put("project",p);
    try(ZipOutputStream out=new ZipOutputStream(new FileOutputStream(output))){out.putNextEntry(new ZipEntry("bwv-project.json"));out.write(metadata.toString().getBytes(StandardCharsets.UTF_8));out.closeEntry();JSONArray files=p.getJSONArray("files");byte[] b=new byte[65536];for(int i=0;i<files.length();i++){JSONObject file=files.getJSONObject(i);out.putNextEntry(new ZipEntry("files/"+ArchivePolicy.path(file.getString("path"))));try(InputStream in=new FileInputStream(objectFile(file.getString("key")))){int n;while((n=in.read(b))!=-1){if(dir.getUsableSpace()<64L*1024*1024)throw new IOException("Not enough space for backup");out.write(b,0,n);}}out.closeEntry();}}return output;
  }
  JSONObject restoreBackup(File source,File stage)throws Exception{
    JSONObject metadata;try(ZipFile zip=new ZipFile(source)){ZipEntry entry=zip.getEntry("bwv-project.json");if(entry==null||entry.getSize()>4L*1024*1024)throw new IOException("Invalid project backup");try(InputStream in=zip.getInputStream(entry)){metadata=new JSONObject(readText(in));}}
    if(!metadata.optString("format").equals("BuildingWebViewer.project")||metadata.optInt("version")!=1)throw new IOException("Unsupported backup version");JSONObject saved=metadata.getJSONObject("project");JSONArray expected=saved.getJSONArray("files"),files=new JSONArray();Map<String,JSONObject> paths=new HashMap<>();for(int i=0;i<expected.length();i++){JSONObject f=expected.getJSONObject(i);String path=ArchivePolicy.path(f.getString("path"));if(paths.put(path,f)!=null)throw new IOException("Duplicate backup file");}
    ArchiveImporter.extract(source,stage,(file,path)->{if(!path.startsWith("files/"))throw new IOException("Invalid backup member");String relative=path.substring(6);JSONObject original=paths.remove(relative);if(original==null)throw new IOException("Unexpected backup file");JSONObject record=object(file,relative);if(!record.getString("key").equals(original.getString("key")))throw new IOException("Backup file checksum mismatch");files.put(record);});
    if(!paths.isEmpty())throw new IOException("Backup is missing files");return new JSONObject().put("name",saved.optString("name","Restored project")).put("states",saved.optJSONObject("states")==null?new JSONObject():saved.getJSONObject("states")).put("files",files);
  }
  static void deleteTree(File file){File[] children=file.listFiles();if(children!=null)for(File child:children)deleteTree(child);file.delete();}
}
