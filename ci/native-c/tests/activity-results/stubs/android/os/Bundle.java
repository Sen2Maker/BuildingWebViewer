package android.os;
import java.util.*;
public final class Bundle {
 public final Map<String,Object> values=new LinkedHashMap<>();
 public void putString(String key,String value){values.put(key,value);}
 public String getString(String key){return (String)values.get(key);}
 public boolean containsKey(String key){return values.containsKey(key);}
}
