package android.content;
import android.net.Uri;
import java.util.*;
public class ClipData {
 private final List<Item> items=new ArrayList<>();
 public ClipData(Uri... uris){for(Uri uri:uris)items.add(new Item(uri));}
 public int getItemCount(){return items.size();}
 public Item getItemAt(int index){return items.get(index);}
 public record Item(Uri getUri){}
}
