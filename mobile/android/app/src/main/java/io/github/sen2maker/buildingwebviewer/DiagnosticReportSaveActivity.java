package io.github.sen2maker.buildingwebviewer;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.TextView;
/** Native save flow; application-owned write/outcome survives Activity rotation. */
public final class DiagnosticReportSaveActivity extends Activity {
    private static final int CREATE=4301;
    private String token; private NativeDiagnosticService service;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Runnable observe=new Runnable(){public void run(){
        if(isFinishing()||isDestroyed())return;
        try{Boolean outcome=service.exportOutcome(token);if(outcome!=null){setResult(outcome?RESULT_OK:RESULT_CANCELED,new Intent().putExtra("failed",!outcome));finish();return;}}
        catch(Exception unavailable){setResult(RESULT_CANCELED,new Intent().putExtra("failed",true));finish();return;}
        handler.postDelayed(this,200);
    }};
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);service=((BwvApplication)getApplication()).diagnostics();token=getIntent().getStringExtra("exportToken");
        TextView note=new TextView(this);note.setText("保存本地自检报告 / Save local diagnostic report\n报告不会自动上传 / No automatic upload");setContentView(note);
        try{bwv.diagnostics.DiagnosticExportLease.Export export=service.export(token);if(saved==null)startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"bwv-selftest-"+export.runId().substring(9)+".json"),CREATE);}
        catch(Exception unavailable){setResult(RESULT_CANCELED,new Intent().putExtra("failed",true));finish();}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);if(request!=CREATE)return;
        if(result!=RESULT_OK||data==null||data.getData()==null){setResult(RESULT_CANCELED);finish();return;}
        try{service.writeExport(token,data.getData());}catch(Exception failed){setResult(RESULT_CANCELED,new Intent().putExtra("failed",true));finish();}
    }
    @Override protected void onResume(){super.onResume();handler.post(observe);}
    @Override protected void onPause(){handler.removeCallbacks(observe);super.onPause();}
    @Override protected void onDestroy(){handler.removeCallbacks(observe);if(isFinishing()&&service!=null)service.finishExport(token);super.onDestroy();}
}
