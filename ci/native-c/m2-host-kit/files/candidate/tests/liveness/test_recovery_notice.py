#!/usr/bin/env python3
"""Compile actual RecoveryActivity UI construction with controlled Android view doubles."""
from pathlib import Path
import argparse,hashlib,json,re,subprocess,tempfile,sys
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tests/regression'))
from run_transport_regression import method
p=argparse.ArgumentParser();p.add_argument('--output',type=Path);a=p.parse_args();out=a.output or Path(tempfile.mkdtemp(prefix='bwv-recovery-notice-'));out.mkdir(parents=True,exist_ok=True)
source=ROOT/'project/mobile/android/app/src/main/java/io/github/sen2maker/buildingwebviewer/RecoveryActivity.java';text=source.read_text()
field=re.search(r'static final String EXTRA_TRANSPORT_OUTCOME_UNKNOWN[^;]+;',text).group();create=method(text,'public void onCreate(');caution=method(text,'private String transportCaution(')
routing=text[text.index('private static final int FIRST_BACKUP_REQUEST'):text.index('private final ExecutorService')];restore=method(text,'private void restoreBackupState(')
java='''import java.io.*;import java.util.*;
public class RecoveryNoticeRegression {
 static int checks;static void check(boolean value){checks++;if(!value)throw new AssertionError("recovery visible warning check "+checks);}
 static class Bundle{final Map<String,Object> values=new HashMap<>();Object get(String key){return values.get(key);}} static class Intent{final Map<String,Object> extras=new HashMap<>();Intent(){}Intent(Object o,Class<?> c){}boolean getBooleanExtra(String k,boolean d){return extras.get(k) instanceof Boolean?(Boolean)extras.get(k):d;}}
 static class Activity{Intent intent;View content;final BwvApplication app=new BwvApplication();public void onCreate(Bundle state){}Intent getIntent(){return intent;}Object getApplication(){return app;}void setContentView(View view){content=view;}void startActivity(Intent i){}boolean isFinishing(){return false;}boolean isDestroyed(){return false;}void runOnUiThread(Runnable r){throw new AssertionError("No IO run expected");}}
 static class View{final List<View> children=new ArrayList<>();String text="";String all(){StringBuilder b=new StringBuilder(text);for(View c:children)b.append(c.all());return b.toString();}}
 static class TextView extends View{TextView(Object c){}void setText(String s){text=s;}}
 static class Button extends TextView{Button(Object c){super(c);}void setOnClickListener(java.util.function.Consumer<Object> listener){}}
 static class LinearLayout extends View{static final int VERTICAL=1;LinearLayout(Object c){}void setOrientation(int i){}void setPadding(int a,int b,int c,int d){}void addView(View v){children.add(v);}}
 static class ScrollView extends View{ScrollView(Object c){}void addView(View v){children.add(v);}}
 static class NoIo{int queued;void execute(Runnable r){queued++;}}
 static class ProjectStore{final File projects=new File("/not-read");JSONObject get(String id){return new JSONObject();}}
 static class JSONObject{String optString(String key,String fallback){return fallback;}}
 static class BwvApplication{String failure(){return "FIXED_STARTUP_STATUS";}ProjectStore projects(){return new ProjectStore();}}
 static class NativeSelfTestActivity{} static class BuildConfig{static final boolean DIAGNOSTIC_ENABLED=true;}
 static class RecoveryActivity extends Activity{
  final NoIo io=new NoIo();TextView status;boolean busy;
  @@ROUTING@@
  @@RESTORE@@
  @@FIELD@@
  @@CREATE@@
  @@CAUTION@@
  void note(String text){status.text+="\\n"+text;}void prepareBackup(ProjectStore store,String id){}
 }
 public static void main(String[] args){
  for(Object value:new Object[]{null,Boolean.FALSE,"untrusted text",Boolean.TRUE}){
   RecoveryActivity activity=new RecoveryActivity();if(value!=null){activity.intent=new Intent();activity.intent.extras.put(RecoveryActivity.EXTRA_TRANSPORT_OUTCOME_UNKNOWN,value);activity.intent.extras.put("arbitraryReason","PRIVATE_SYNTHETIC_PROJECT_NAME");}
   activity.onCreate(null);String visible=activity.content.all();boolean expected=Boolean.TRUE.equals(value);
   check(visible.contains("operation outcome is unknown")==expected);check(visible.contains("Do not resubmit")==expected);check(visible.contains("不要重复提交")==expected);check(!visible.contains("PRIVATE_SYNTHETIC_PROJECT_NAME"));check(visible.contains("Local recovery and export"));check(visible.contains("Native self-test"));check(activity.io.queued==1);check(visible.contains("FIXED_STARTUP_STATUS"));check(!activity.backupClosed&&!activity.busy);
  }
  RecoveryActivity restored=new RecoveryActivity();restored.intent=new Intent();restored.intent.extras.put(RecoveryActivity.EXTRA_TRANSPORT_OUTCOME_UNKNOWN,true);Bundle saved=new Bundle();saved.values.put("recoveryBackupNext","4102");saved.values.put("recoveryBackupPending","4101");restored.onCreate(saved);check(restored.busy&&restored.pendingBackup.backup==null);check(restored.content.all().contains("Do not resubmit"));check(restored.io.queued==1);
  RecoveryActivity invalid=new RecoveryActivity();invalid.intent=restored.intent;invalid.onCreate(new Bundle());check(invalid.backupClosed&&invalid.busy);check(invalid.content.all().contains("Backup routing state unavailable"));check(invalid.content.all().contains("Do not resubmit"));
  System.out.println(checks+" actual RecoveryActivity UI-construction checks PASS; visible tree asserted with view doubles, not rendered Android UI");
 }
}
'''
for key,value in [('FIELD',field),('CREATE',create),('CAUTION',caution),('ROUTING',routing),('RESTORE',restore)]:java=java.replace('@@'+key+'@@',value)
path=out/'RecoveryNoticeRegression.java';path.write_text(java)
run=subprocess.run(['java','-m','jdk.compiler/com.sun.tools.javac.Main','-source','21','-target','21','-Xlint:all','-Werror','-d',str(out),str(path)],text=True,capture_output=True);(out/'compile.txt').write_text(run.stdout+run.stderr);assert run.returncode==0,run.stderr
run=subprocess.run(['java','-cp',str(out),'RecoveryNoticeRegression'],text=True,capture_output=True);(out/'result.txt').write_text(run.stdout+run.stderr);assert run.returncode==0,run.stderr;print(run.stdout,end='')
(out/'source-pins.json').write_text(json.dumps({'source':str(source.relative_to(ROOT)),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'actualFragments':{k:hashlib.sha256(v.encode()).hexdigest() for k,v in [('field',field),('onCreate',create),('transportCaution',caution)]}},indent=2)+'\n')
