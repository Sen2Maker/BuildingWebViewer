package android.content;
import android.net.Uri;
import java.util.*;
public class Intent {
 public static final String ACTION_OPEN_DOCUMENT="open",ACTION_SEND="send",ACTION_SEND_MULTIPLE="sendMany",ACTION_VIEW="view",CATEGORY_OPENABLE="openable",EXTRA_ALLOW_MULTIPLE="multi",EXTRA_STREAM="stream";
 public static final int FLAG_GRANT_READ_URI_PERMISSION=1;
 public final Map<String,Object> extras=new LinkedHashMap<>();
 public String action;public Class<?> component;private Uri data;private ClipData clip;
 public Intent(){}
 public Intent(String action){this.action=action;}
 public Intent(Object context,Class<?> component){this.component=component;}
 public Intent putExtra(String key,Object value){extras.put(key,value);return this;}
 public Intent setType(String type){return this;}
 public Intent addCategory(String category){return this;}
 public Intent addFlags(int flags){return this;}
 public String getAction(){return action;}
 public Intent setData(Uri uri){data=uri;return this;}
 public Uri getData(){return data;}
 public Intent setClipData(ClipData value){clip=value;return this;}
 public ClipData getClipData(){return clip;}
 public boolean getBooleanExtra(String key,boolean fallback){Object value=extras.get(key);return value instanceof Boolean?(Boolean)value:fallback;}
 public String getStringExtra(String key){return (String)extras.get(key);}
 @SuppressWarnings("unchecked") public <T>T getParcelableExtra(String key){return (T)extras.get(key);}
 @SuppressWarnings("unchecked") public <T>ArrayList<T> getParcelableArrayListExtra(String key){return (ArrayList<T>)extras.get(key);}
}
