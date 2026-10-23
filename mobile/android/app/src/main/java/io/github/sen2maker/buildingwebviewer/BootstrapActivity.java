package io.github.sen2maker.buildingwebviewer;
import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;
/** Native launcher survives missing WebView. Only granted import fields cross into BridgeActivity. */
public final class BootstrapActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(32, 48, 32, 32);
        TextView status = new TextView(this); status.setText("正在验证本地资源 / Verifying local resources"); layout.addView(status);
        Button recovery = new Button(this); recovery.setText("本地恢复与导出 / Recovery and export"); recovery.setOnClickListener(v -> { startActivity(new Intent(this, RecoveryActivity.class)); finish(); }); layout.addView(recovery);
        Button cadDownload = new Button(this);cadDownload.setText("下载 CAD App（独立应用，地址待配置） / CAD App download not configured");cadDownload.setEnabled(false);layout.addView(cadDownload);
        if(BuildConfig.DIAGNOSTIC_ENABLED){
            Button nativeTest=new Button(this);nativeTest.setText("一键原生自检 / Native self-test");nativeTest.setOnClickListener(v->startActivity(new Intent(this,NativeSelfTestActivity.class)));layout.addView(nativeTest);
            Button webTest=new Button(this);webTest.setText("打开网页自检 / Open WebView diagnostics");webTest.setOnClickListener(v->{try{if(((BwvApplication)getApplication()).runtime()!=null)startActivity(new Intent(this,MainActivity.class));}catch(RuntimeException unavailable){status.setText("Bundled runtime unavailable; use native diagnostics.");}});layout.addView(webTest);
        }
        setContentView(layout);
        ((BwvApplication)getApplication()).readiness().whenComplete((runtime, error) -> runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) return;
            if (error != null) { status.setText("本地资源或数据读取检查失败。可使用原生导出。\nResource/data-reader check failed. Native export remains available."); return; }
            if (BuildConfig.NATIVE_COMPILE_FIXTURE) { status.setText("Native compile fixture only. This is not the installable viewer or full device-test App."); return; }
            startActivity(forwardImport(getIntent())); finish();
        }));
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        try { if (!BuildConfig.NATIVE_COMPILE_FIXTURE && ((BwvApplication)getApplication()).runtime() != null) { startActivity(forwardImport(intent)); finish(); } }
        catch (RuntimeException unavailable) { /* Keep native recovery reachable. */ }
    }
    private Intent forwardImport(Intent source) {
        Intent target = new Intent(this, MainActivity.class);
        String action = source.getAction();
        if (Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action) || Intent.ACTION_VIEW.equals(action)) {
            target.setAction(action); target.setDataAndType(source.getData(), source.getType());
            target.setClipData(source.getClipData());
            target.addFlags(source.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION));
            if (Intent.ACTION_SEND_MULTIPLE.equals(action)) { ArrayList<Uri> list = source.getParcelableArrayListExtra(Intent.EXTRA_STREAM); if (list != null) target.putParcelableArrayListExtra(Intent.EXTRA_STREAM, list); }
            else { Uri uri = source.getParcelableExtra(Intent.EXTRA_STREAM); if (uri != null) target.putExtra(Intent.EXTRA_STREAM, uri); }
        }
        // No arbitrary extras, Cordova preferences, remote URL or server path is forwarded.
        return target;
    }
}
