package androidx.activity.result.contract;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
public final class ActivityResultContracts {
 private ActivityResultContracts(){}
 public static final class StartActivityForResult extends ActivityResultContract<Intent,ActivityResult>{}
}
