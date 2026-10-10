package io.github.sen2maker.buildingwebviewer.preview;
import android.content.Context;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;import org.junit.runner.RunWith;
import java.util.concurrent.*;
import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.matcher.ViewMatchers.withId;
import static androidx.test.espresso.action.ViewActions.click;
@RunWith(AndroidJUnit4.class)
public class AnnouncementTest {
 @Test public void announcementAcknowledgesActualLocalVersionAndCanBeReopened()throws Exception{
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();WebUpdater updater=new WebUpdater(context);String key="announcement."+updater.bundledVersion();assertEquals(updater.announcement(null).getString("version"),updater.announcement("public").getString("version"));boolean old=updater.prefs.getBoolean(key,false);updater.prefs.edit().putBoolean(key,false).commit();
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   boolean shown=false;
   for(int i=0;i<90;i++){try{onView(withId(android.R.id.button1)).perform(click());shown=true;break;}catch(androidx.test.espresso.NoMatchingViewException e){SystemClock.sleep(500);}}
   assertTrue("Local release announcement must appear",shown);assertTrue(updater.prefs.getBoolean(key,false));assertFalse(updater.announcement(null).getBoolean("unread"));
   ArrayBlockingQueue<String> result=new ArrayBlockingQueue<>(1);
   scenario.onActivity(a->a.getBridge().getWebView().evaluateJavascript("document.getElementById('show-updates').click(); !document.getElementById('mobile-updates').hidden",result::offer));
   assertEquals("true",result.poll(5,TimeUnit.SECONDS));
   scenario.onActivity(a->a.getBridge().getWebView().evaluateJavascript("document.getElementById('show-release-notes').click()",v->{}));
   SystemClock.sleep(1000);onView(withId(android.R.id.button1)).perform(click());
  }finally{updater.prefs.edit().putBoolean(key,old).commit();}
 }
}
