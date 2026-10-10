package io.github.sen2maker.buildingwebviewer.preview;
import android.content.*;import androidx.test.ext.junit.runners.AndroidJUnit4;import androidx.test.platform.app.InstrumentationRegistry;import org.junit.*;import org.junit.runner.RunWith;import static org.junit.Assert.*;import java.io.*;import org.json.*;import java.util.*;
@RunWith(AndroidJUnit4.class)
public class UpdateRollbackTest{
 @Test public void failedStartupRollsBackAndHealthyStartupPersists()throws Exception{
  Context base=InstrumentationRegistry.getInstrumentation().getTargetContext();File work=new File(base.getCacheDir(),"update-test-"+UUID.randomUUID());String key=work.getName();
  Context context=new ContextWrapper(base){@Override public File getFilesDir(){return work;}@Override public SharedPreferences getSharedPreferences(String name,int mode){return super.getSharedPreferences(key,mode);}};
  WebUpdater updater=new WebUpdater(context);
  try{String[] versions={"9.0.1","9.0.2"};for(String version:versions){File dir=new File(updater.root,"v"+version);new File(dir,"assets/mobile").mkdirs();new File(dir,"assets/mobile/index.html").createNewFile();try(FileOutputStream out=new FileOutputStream(new File(dir,"native-web.json"))){out.write(new JSONObject().put("nativeApi",WebUpdater.NATIVE_API).put("version",version).toString().getBytes("UTF-8"));}}
   updater.prefs.edit().putString("active","v9.0.2").putString("previous","v9.0.1").commit();assertTrue(updater.startupPath().endsWith("v9.0.2"));assertTrue(updater.prefs.getBoolean("booting",false));
   assertTrue(updater.startupPath().endsWith("v9.0.1"));updater.healthy();assertFalse(updater.prefs.getBoolean("booting",true));assertTrue(updater.startupPath().endsWith("v9.0.1"));updater.healthy();
  }finally{updater.prefs.edit().clear().commit();ProjectStore.deleteTree(work);}
 }
}
