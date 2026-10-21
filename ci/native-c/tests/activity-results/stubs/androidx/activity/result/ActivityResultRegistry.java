package androidx.activity.result;
import androidx.activity.result.contract.ActivityResultContract;
import java.util.*;
/** Deterministic host provider double: recorded callbacks permit deliberate late/duplicate injection. */
public class ActivityResultRegistry {
 public enum Failure { NONE,REGISTER_BEFORE,REGISTER_AFTER,LAUNCH_BEFORE,LAUNCH_AFTER }
 public Failure failure=Failure.NONE;
 public final Map<String,ActivityResultCallback<?>> active=new LinkedHashMap<>(),history=new LinkedHashMap<>();
 public final Map<String,Object> queued=new HashMap<>();
 public final List<String> registrations=new ArrayList<>(),launches=new ArrayList<>(),unregistrations=new ArrayList<>();
 public final Map<String,Object> inputs=new HashMap<>();
 public Object synchronousRegistrationResult,synchronousLaunchResult;
 public final Set<String> launchedKeys=new LinkedHashSet<>();
 public final Map<String,Integer> keyToRc=new LinkedHashMap<>();
 public final Map<Integer,String> rcToKey=new LinkedHashMap<>();
 private int nextRequestCode=65536;
 public <I,O> ActivityResultLauncher<I> register(String key,ActivityResultContract<I,O> contract,ActivityResultCallback<O> callback){
  registrations.add(key);
  Failure registrationFailure=failure;
  if(registrationFailure==Failure.REGISTER_BEFORE)throw new IllegalStateException("register before side effect");
  if(!keyToRc.containsKey(key)){int code=nextRequestCode++;keyToRc.put(key,code);rcToKey.put(code,key);}
  if(active.putIfAbsent(key,callback)!=null)throw new IllegalStateException("duplicate key");
  history.put(key,callback);
  Object result=queued.remove(key);
  if(synchronousRegistrationResult!=null){result=synchronousRegistrationResult;synchronousRegistrationResult=null;}
  if(result!=null)send(callback,result);
  if(registrationFailure==Failure.REGISTER_AFTER)throw new IllegalStateException("register after callback publication");
  return new ActivityResultLauncher<I>(){
   @Override public void launch(I input){
    if(!keyToRc.containsKey(key))throw new IllegalStateException("unregistered launcher");
    launchedKeys.add(key);
    Failure launchFailure=failure;
    try{
     if(launchFailure==Failure.LAUNCH_BEFORE)throw new IllegalStateException("provider failed before launching");
     launches.add(key);inputs.put(key,input);
     if(synchronousLaunchResult!=null){Object result=synchronousLaunchResult;synchronousLaunchResult=null;send(callback,result);launchedKeys.remove(key);}
     if(launchFailure==Failure.LAUNCH_AFTER)throw new IllegalStateException("provider failed after launching");
    }catch(RuntimeException error){launchedKeys.remove(key);throw error;}
   }
   @Override public void unregister(){
    unregistrations.add(key);
    if(!launchedKeys.contains(key)){Integer code=keyToRc.remove(key);if(code!=null)rcToKey.remove(code);}
    active.remove(key);queued.remove(key);
   }
  };
 }
 @SuppressWarnings("unchecked") private static <O>void send(ActivityResultCallback<O> callback,Object result){callback.onActivityResult((O)result);}
 /** Controlled callback injection; unlike rawResult this can deliberately deliver after a throwing provider removed its launch marker. */
 public void result(String key,ActivityResult result){ActivityResultCallback<?> callback=active.get(key);if(callback==null)queued.put(key,result);else{send(callback,result);launchedKeys.remove(key);}}
 /** Mirrors AndroidX 1.11 raw doDispatch: callback first, launchedKeys removal afterward, only when marked launched. */
 public void rawResult(String key,ActivityResult result){ActivityResultCallback<?> callback=active.get(key);if(callback!=null&&launchedKeys.contains(key)){send(callback,result);launchedKeys.remove(key);}else queued.put(key,result);}
 public void restoreRoutingFrom(ActivityResultRegistry old){keyToRc.putAll(old.keyToRc);rcToKey.putAll(old.rcToKey);launchedKeys.addAll(old.launchedKeys);queued.putAll(old.queued);nextRequestCode=old.nextRequestCode;}
 public void duplicate(String key,ActivityResult result){ActivityResultCallback<?> callback=history.get(key);if(callback==null)throw new AssertionError("No historical callback "+key);send(callback,result);}
 public String latestKey(){return registrations.get(registrations.size()-1);}
}
