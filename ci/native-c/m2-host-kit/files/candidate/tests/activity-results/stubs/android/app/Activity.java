package android.app;
public class Activity {
 public static final int RESULT_OK=-1,RESULT_CANCELED=0;
 public boolean isDestroyed(){return false;}
 public boolean isFinishing(){return false;}
 public void runOnUiThread(Runnable task){task.run();}
 public Object getApplication(){return null;}
 protected void onDestroy(){}
}
