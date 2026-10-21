package android.os;
import java.util.*;
/** Explicitly drained main-loop queue for source-exact deferred cleanup tests. */
public final class Handler {
 private static final Queue<Runnable> MAIN_QUEUE=new ArrayDeque<>();
 public Handler(Looper looper){if(looper!=Looper.getMainLooper())throw new IllegalArgumentException("main only");}
 public boolean post(Runnable task){MAIN_QUEUE.add(task);return true;}
 public static int pending(){return MAIN_QUEUE.size();}
 public static void drain(){if(Looper.myLooper()!=Looper.getMainLooper())throw new IllegalStateException("main only");Runnable task;while((task=MAIN_QUEUE.poll())!=null)task.run();}
}
