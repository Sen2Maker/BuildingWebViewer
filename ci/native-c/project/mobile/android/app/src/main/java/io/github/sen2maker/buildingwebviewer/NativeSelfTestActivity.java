package io.github.sen2maker.buildingwebviewer;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import bwv.diagnostics.DiagnosticPresentation;
import bwv.diagnostics.DiagnosticStart;
import org.json.JSONObject;
/** Real one-tap native fallback. Rejected start is never presented as a completed test report. */
public final class NativeSelfTestActivity extends Activity {
    private NativeDiagnosticService service;
    private volatile String handle,runId;
    private volatile boolean destroyed,cancelRequested;
    private final DiagnosticPresentation<JSONObject> presentation=new DiagnosticPresentation<>();
    private DiagnosticPresentation.ExportTicket exportTicket;
    private Button start,cancel,save;private TextView status;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);service=((BwvApplication)getApplication()).diagnostics();
        LinearLayout column=new LinearLayout(this);column.setOrientation(LinearLayout.VERTICAL);column.setPadding(24,32,24,24);
        status=new TextView(this);status.setText("原生手机自检 / Native device self-test\n仅使用隔离夹具，不修改项目，不联网或上传。主 App 不含 CAD。\nOnly isolated fixtures. Main App has no CAD. Web/Worker, touch and power loss are not certified here.");column.addView(status);
        start=new Button(this);start.setText("一键原生自检 / Run native self-test");column.addView(start);
        cancel=new Button(this);cancel.setText("取消 / Cancel");column.addView(cancel);
        save=new Button(this);save.setText("保存本地报告 / Save local report");column.addView(save);
        ScrollView scroll=new ScrollView(this);scroll.addView(column);setContentView(scroll);
        start.setOnClickListener(v->begin());cancel.setOnClickListener(v->cancel());save.setOnClickListener(v->saveReport());renderControls();
    }
    private boolean reportCurrent(){DiagnosticPresentation.OwnedReport<JSONObject> report=presentation.report();return service!=null&&report!=null&&service.canExport(report.runId());}
    private void renderControls(){
        if(start==null)return;
        start.setEnabled(BuildConfig.DIAGNOSTIC_ENABLED&&service!=null&&presentation.canStart());
        cancel.setEnabled(presentation.canCancel()&&!cancelRequested);
        save.setEnabled(presentation.canSave(reportCurrent()));
    }
    private void begin(){
        if(service==null||!presentation.canStart())return;
        final DiagnosticPresentation.Attempt attempt=presentation.begin();handle=null;runId=null;cancelRequested=false;renderControls();
        status.append("\n正在申请自检任务 / Requesting a diagnostic run");
        new NativeDiagnosticRunner(service).start(new NativeDiagnosticRunner.Observer(){
            public void rejected(DiagnosticStart.Reason reason){runOnUiThread(()->{
                if(!presentation.rejected(attempt,reason))return;
                handle=null;runId=null;renderControls();
                status.append(reason==DiagnosticStart.Reason.EXPORT_BUSY?"\n未启动：已有报告保存任务，请完成或取消后重试 / Not started: report save is still pending":reason==DiagnosticStart.Reason.LEASE_BUSY?"\n未启动：已有自检任务或清理尚未结束 / Not started: another diagnostic or cleanup is still active":"\n未启动：诊断服务暂不可用，可重试 / Not started: diagnostic service unavailable");
            });}
            public void opened(String h,String r){runOnUiThread(()->{
                boolean accepted=presentation.opened(attempt,r);
                if(accepted){handle=h;runId=r;renderControls();}
                if(!accepted||destroyed||cancelRequested)try{service.cancel(h,r);}catch(Exception ignored){}
            });}
            public void progress(String r,String id,String value){runOnUiThread(()->{if(presentation.isRunning(attempt,r))status.append("\n"+id+": "+value);});}
            public void finished(String r,JSONObject value){runOnUiThread(()->{
                if(!presentation.finished(attempt,r,value))return;
                handle=null;runId=null;renderControls();
                status.append(value==null?"\n任务已结束，但报告未通过校验，不能保存 / Run ended without a valid report; save is unavailable":"\n检查结束，完整功能仍需真机验收 / Checks ended; full acceptance remains pending");
                if(value!=null&&!reportCurrent())status.append("\n此报告不再拥有当前保存权限 / This report is not currently exportable");
            });}
        });
    }
    private void saveReport(){
        if(!presentation.canSave(reportCurrent())){renderControls();return;}
        DiagnosticPresentation.OwnedReport<JSONObject> report=presentation.report();
        DiagnosticPresentation.ExportTicket ticket=presentation.beginExport(true);exportTicket=ticket;renderControls();
        try{
            bwv.diagnostics.DiagnosticExportLease.Export export=service.reserveExport(report.runId(),report.report().toString(2));
            try{startActivityForResult(new Intent(this,DiagnosticReportSaveActivity.class).putExtra("exportToken",export.token()),4401);}
            catch(RuntimeException unavailable){service.finishExport(export.token());throw unavailable;}
        }catch(Exception unavailable){presentation.finishExport(ticket);exportTicket=null;renderControls();status.append("\n报告尚未保存 / Report not saved");}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);if(request!=4401)return;
        DiagnosticPresentation.ExportTicket ticket=exportTicket;exportTicket=null;
        if(!presentation.finishExport(ticket))return; // A recreated/new Activity does not inherit an old report's authority.
        renderControls();status.append(result==RESULT_OK?"\n本地报告读回校验通过 / Local report readback verified":"\n报告未确认保存，可重试 / Report not confirmed saved; retry is available");
    }
    @Override protected void onResume(){super.onResume();renderControls();}
    private void cancel(){cancelRequested=true;if(handle!=null)try{service.cancel(handle,runId);}catch(Exception ignored){}renderControls();}
    @Override protected void onDestroy(){destroyed=true;if(presentation.canCancel())cancel();presentation.dispose();super.onDestroy();}
}
