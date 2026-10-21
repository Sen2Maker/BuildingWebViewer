package io.github.sen2maker.buildingwebviewer;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.BwvBridgeCallGuard;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
/** Dedicated diagnostic capability; no ProjectStore, path, updater or health input is accepted. */
@CapacitorPlugin(name="BWVSelfTest")
public final class BWVSelfTestPlugin extends Plugin {
    private NativeDiagnosticService service; private volatile String ownedHandle,ownedRun; private volatile boolean destroyed;
    @Override public void load(){service=((BwvApplication)getActivity().getApplication()).diagnostics();}
    private void gate(PluginCall call)throws Exception {
        BwvBridgeCallGuard.require(call,bridge.getWebView());
        if(destroyed||!BuildConfig.DIAGNOSTIC_ENABLED||service==null)throw new IllegalStateException("DIAGNOSTICS_DISABLED");
        ProcessRuntime runtime=((BwvApplication)getActivity().getApplication()).runtime();if(runtime==null)throw new IllegalStateException("RUNTIME_UNAVAILABLE");runtime.assertBound();
        String expected=bridge.getLocalUrl()+"/assets/mobile/self-test.html";
        if(!expected.equals(bridge.getWebView().getUrl()))throw new IllegalStateException("DIAGNOSTIC_PAGE_REQUIRED");
    }
    private interface Work {JSONObject run()throws Exception;}
    private void work(PluginCall call,Work work){
        getActivity().runOnUiThread(()->{
            try{gate(call);}catch(Exception denied){call.reject("DIAGNOSTIC_UNAVAILABLE");return;}
            service.io.execute(()->{try{if(destroyed)throw new IllegalStateException("DESTROYED");BwvBridgeCallGuard.require(call,bridge.getWebView());call.resolve(JSObject.fromJSONObject(work.run()));}catch(Exception|LinkageError error){call.reject("DIAGNOSTIC_OPERATION_FAILED");}});
        });
    }
    private String handle(PluginCall call){return call.getString("handle");}
    private String runId(PluginCall call){return call.getString("runId");}
    @PluginMethod public void openRun(PluginCall call){work(call,()->{String run=runId(call);String handle=service.open(run);ownedRun=run;ownedHandle=handle;if(destroyed||!BwvBridgeCallGuard.current(call,bridge.getWebView())){service.cancel(handle,run);service.close(handle,run);throw new IllegalStateException("DESTROYED");}return new JSONObject().put("handle",handle);});}
    @PluginMethod public void runtimeSnapshot(PluginCall call){work(call,()->service.snapshot(handle(call),runId(call)));}
    @PluginMethod public void roundTrip(PluginCall call){work(call,()->service.roundTrip(handle(call),runId(call),call.getString("challenge")));}
    @PluginMethod public void probeFilesystem(PluginCall call){work(call,()->service.filesystem(handle(call),runId(call)));}
    @PluginMethod public void probeScratchStore(PluginCall call){work(call,()->service.store(handle(call),runId(call)));}
    @PluginMethod public void readAsset(PluginCall call){work(call,()->service.asset(handle(call),runId(call),call.getString("kind"),call.getInt("maxBytes",65536)));}
    @PluginMethod public void cancelRun(PluginCall call){getActivity().runOnUiThread(()->{try{gate(call);service.cancel(handle(call),runId(call));call.resolve();}catch(Exception error){call.reject("DIAGNOSTIC_CANCEL_REJECTED");}});}
    @PluginMethod public void closeRun(PluginCall call){work(call,()->{boolean removed=service.close(handle(call),runId(call));if(removed){ownedHandle=null;ownedRun=null;}return new JSONObject().put("removed",removed);});}
    @PluginMethod public void exportReport(PluginCall call){getActivity().runOnUiThread(()->{
        try{gate(call);String text=call.getString("text");if(text==null||text.length()>65536)throw new IllegalArgumentException();
            final bwv.diagnostics.DiagnosticExportLease.Export export=service.reserveExport(runId(call),text);
            Intent intent=new Intent(getActivity(),DiagnosticReportSaveActivity.class).putExtra("exportToken",export.token());
            try{
                ((MainActivity)getActivity()).launchOperation(MainActivityOperations.Kind.DIAGNOSTIC_SAVE,intent,new MainActivityOperations.Owner(){
                    @Override public void complete(ActivityResult result){reportSaved(call,result);}
                    @Override public void invalidated(){call.release(bridge);}
                    @Override public void settled(){service.finishExport(export.token());}
                });
            }catch(MainActivityOperations.LaunchFailure uncertain){throw uncertain;}
            catch(RuntimeException rejectedBeforeLaunch){service.finishExport(export.token());throw rejectedBeforeLaunch;}
        }catch(Exception error){call.reject("REPORT_EXPORT_REJECTED");}
    });}
    private void reportSaved(PluginCall originalCall,ActivityResult result){if(!BwvBridgeCallGuard.current(originalCall,bridge.getWebView())){originalCall.release(bridge);return;}if(result!=null&&result.getData()!=null&&result.getData().getBooleanExtra("failed",false)){originalCall.reject("REPORT_SAVE_NOT_VERIFIED");return;}boolean saved=result!=null&&result.getResultCode()==android.app.Activity.RESULT_OK;originalCall.resolve(new JSObject().put("cancelled",!saved).put("readbackVerified",saved));}
    void documentStarted(){releaseOwned();}
    @Override protected void handleOnDestroy(){destroyed=true;releaseOwned();}
    private void releaseOwned(){if(service!=null&&ownedHandle!=null){try{service.cancel(ownedHandle,ownedRun);service.close(ownedHandle,ownedRun);}catch(Exception ignored){/* Failed cleanup remains quarantined, never broad cache cleanup. */}}}
}
