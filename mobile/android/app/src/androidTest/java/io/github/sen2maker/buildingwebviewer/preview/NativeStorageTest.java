package io.github.sen2maker.buildingwebviewer.preview;
import android.content.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.core.content.FileProvider;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import org.json.*;
import java.io.*;
import java.util.*;
@RunWith(AndroidJUnit4.class)
public class NativeStorageTest {
 Context context;File work;ProjectStore store;
 @Before public void setup(){context=InstrumentationRegistry.getInstrumentation().getTargetContext();work=new File(context.getCacheDir(),"native-tests-"+UUID.randomUUID());work.mkdirs();store=new ProjectStore(new ContextWrapper(context){@Override public File getFilesDir(){return work;}});}
 @After public void cleanup(){ProjectStore.deleteTree(work);}
 File fixture(String name)throws Exception{File file=new File(work,name);try(InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open(name.endsWith(".gz")?name+".fixture":name)){store.copy(in,file);}return file;}
 @Test public void realNativeArchiveFormats()throws Exception{
  for(String name:new String[]{"sample.zip","sample.tar","sample.tgz","sample.tbz2","sample.txz","sample.7z","cloud.txt.gz","cloud.txt.bz2","cloud.txt.xz","cloud.txt.zst"}){
   final int[] count={0};ArchiveImporter.extract(fixture(name),new File(work,name+"-out"),(file,path)->{assertTrue(path.endsWith(".txt"));try(InputStream in=new FileInputStream(file)){assertEquals("1 2 3 42\n4 5 6 99\n",ProjectStore.readText(in));}count[0]++;});assertEquals(name,1,count[0]);
  }
 }
 @Test public void rejectsUnsafeAndEncryptedArchives()throws Exception{for(String name:new String[]{"unsafe.zip","symlink.tar","encrypted.zip"}){try{ArchiveImporter.extract(fixture(name),new File(work,"reject-"+name),(f,p)->{});fail(name);}catch(Exception expected){}}}
 @Test public void persistentStateDedupAndBackupRoundtrip()throws Exception{
  JSONObject p=store.create("Test project");String id=p.getString("id");File source=new File(work,"cloud.txt");try(FileOutputStream out=new FileOutputStream(source)){out.write("1 2 3 42\n".getBytes("UTF-8"));}
  JSONObject f=store.object(source,"group/cloud.txt");p.getJSONArray("files").put(f);store.put(p);store.saveState(id,"pointcloud",new JSONObject().put("camera",new JSONObject().put("zoom",2.5)).put("selected",new JSONArray().put("group/cloud.txt")));
  assertEquals(f.getString("key"),store.object(source,"same.txt").getString("key"));assertEquals(1,store.objects.list().length);
  ProjectStore reopened=new ProjectStore(new ContextWrapper(context){@Override public File getFilesDir(){return work;}});assertEquals(2.5,reopened.get(id).getJSONObject("states").getJSONObject("pointcloud").getJSONObject("camera").getDouble("zoom"),0.0);
  File backup=store.backup(id,new File(work,"backup"));JSONObject restored=store.restoreBackup(backup,new File(work,"restored"));assertEquals("Test project",restored.getString("name"));assertEquals("group/cloud.txt",restored.getJSONArray("files").getJSONObject(0).getString("path"));assertEquals(f.getString("key"),restored.getJSONArray("files").getJSONObject(0).getString("key"));
  store.trash(id,true);assertEquals(1,store.list().length());assertEquals(0,store.cleanup());store.emptyTrash();assertEquals(0,store.list().length());assertEquals(0,store.objects.list().length);
 }
 @Test public void interruptedImportDoesNotReplaceCommittedData()throws Exception{
  JSONObject p=store.create("Existing");String id=p.getString("id");File folder=new File(context.getCacheDir(),"exports/native-test-"+UUID.randomUUID());folder.mkdirs();File original=new File(work,"original.txt");try(FileOutputStream out=new FileOutputStream(original)){out.write("0 0 0 1\n".getBytes("UTF-8"));}JSONObject kept=store.object(original,"original.txt");p.getJSONArray("files").put(kept);store.put(p);File valid=new File(folder,"new.txt");try(FileOutputStream out=new FileOutputStream(valid)){out.write("1 1 1 2\n".getBytes("UTF-8"));}File unsupported=new File(folder,"bad.zip");try(FileOutputStream out=new FileOutputStream(unsupported)){out.write(new byte[]{80,75,3,4,1});}
  try{store.importUris(id,Arrays.asList(FileProvider.getUriForFile(context,context.getPackageName()+".fileprovider",valid),FileProvider.getUriForFile(context,context.getPackageName()+".fileprovider",unsupported)));fail();}catch(Exception expected){}finally{ProjectStore.deleteTree(folder);}
  JSONObject saved=store.get(id);assertEquals("Existing",saved.getString("name"));assertEquals("failed",saved.getString("status"));assertEquals(1,saved.getJSONArray("files").length());assertEquals(kept.getString("key"),saved.getJSONArray("files").getJSONObject(0).getString("key"));assertTrue(new File(store.inbox,saved.getString("importJob")+"/receipt.json").isFile());
 }
}
