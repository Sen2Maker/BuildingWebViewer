package io.github.sen2maker.buildingwebviewer;
import android.content.pm.PackageInfo;
import android.os.Build;
import bwv.diagnostics.DiagnosticRunLease;
import bwv.diagnostics.DiagnosticStart;
import bwv.diagnostics.DiagnosticExportLease;
import bwv.diagnostics.DiagnosticExportLease.Export;
import bwv.diagnostics.DiagnosticReportValidator;
import bwv.update.probe.FilesystemCapabilityProbe;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.json.JSONObject;
/** One application-wide authority for synthetic diagnostics only. No updater/service reference. */
final class NativeDiagnosticService {
    final ExecutorService io=Executors.newSingleThreadExecutor();
    // Start admission never queues behind a long-running probe on io; bounded across Activities.
    final ExecutorService admission=new java.util.concurrent.ThreadPoolExecutor(1,1,0L,java.util.concurrent.TimeUnit.MILLISECONDS,new java.util.concurrent.ArrayBlockingQueue<>(1),new java.util.concurrent.ThreadPoolExecutor.AbortPolicy());
    private final BwvApplication app;
    private final DiagnosticRunLease manager;
    private DiagnosticRunLease.Lease active;
    private String completedRunId;
    private Future<?> currentTask;
    private volatile Thread operationThread;
    private volatile String cancelledHandle;
    final java.util.concurrent.ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor();
    private String deadlineToken;
    private final DiagnosticExportLease exports=new DiagnosticExportLease();
    NativeDiagnosticService(BwvApplication app) throws IOException {this.app=app;manager=new DiagnosticRunLease(app.getCacheDir().toPath());}
    synchronized String open(String runId) throws IOException {
        if(!BuildConfig.DIAGNOSTIC_ENABLED)throw new DiagnosticStart.Rejected(DiagnosticStart.Reason.UNAVAILABLE);
        if(active!=null)throw new DiagnosticStart.Rejected(DiagnosticStart.Reason.LEASE_BUSY);
        active=DiagnosticStart.open(manager,exports,runId);cancelledHandle=null;return active.handle();
    }
    synchronized void task(Future<?> future){currentTask=future;}
    private synchronized void require(String handle,String runId)throws IOException {if(active==null||!active.handle().equals(handle)||!active.runId().equals(runId))throw new IOException("STALE_DIAGNOSTIC_HANDLE");}
    private <T> T operation(String handle,DiagnosticRunLease.Operation<T> body)throws Exception {
        operationThread=Thread.currentThread();
        try{return manager.operation(handle,body);}finally{operationThread=null;}
    }
    boolean cancelled(String handle){return handle!=null&&handle.equals(cancelledHandle);}
    synchronized String armDeadline(String handle,String runId,long delayMs){
        String token=UUID.randomUUID().toString();deadlineToken=token;
        timer.schedule(()->{synchronized(NativeDiagnosticService.this){if(!token.equals(deadlineToken))return;try{cancel(handle,runId);}catch(IOException ignored){}}},delayMs,java.util.concurrent.TimeUnit.MILLISECONDS);return token;
    }
    synchronized void disarmDeadline(String token){if(token.equals(deadlineToken))deadlineToken=null;}
    JSONObject snapshot(String handle,String runId)throws Exception {require(handle,runId);return operation(handle,scratch->{scratch.checkCancelled();return observedSnapshot();});}
    JSONObject roundTrip(String handle,String runId,String challenge)throws Exception {
        if(challenge==null||!challenge.matches("[a-f0-9-]{36}"))throw new IOException("INVALID_CHALLENGE");
        return snapshot(handle,runId).put("runId",runId).put("challenge",challenge);
    }
    JSONObject filesystem(String handle,String runId)throws Exception {require(handle,runId);return operation(handle,scratch->{
        FilesystemCapabilityProbe.Result r=FilesystemCapabilityProbe.run(scratch.root());scratch.checkCancelled();
        return new JSONObject().put("providerClass",r.providerClass).put("directoryStreamClass",r.directoryStreamClass).put("secureTraversal",r.secureTraversal).put("unixLinkCount",r.unixLinkCount).put("fileNoFollow",r.fileNoFollow).put("directoryNoFollow",r.directoryNoFollow).put("exclusiveCreation",r.exclusiveCreation).put("atomicRename",r.atomicRename).put("directoryForce",r.directoryForce);
    });}
    JSONObject store(String handle,String runId)throws Exception {require(handle,runId);return operation(handle,scratch->DiagnosticStoreProbe.run(app,scratch));}
    JSONObject asset(String handle,String runId,String kind,int maxBytes)throws Exception {require(handle,runId);if(maxBytes<1||maxBytes>65536)throw new IOException("ASSET_LIMIT");return operation(handle,scratch->{
        ProcessRuntime runtime=app.runtime();if(runtime==null)throw new IOException("RUNTIME_UNAVAILABLE");
        String path=switch(kind){case "web-canary"->"assets/diagnostics/web-canary.txt";case "shader-canary"->"assets/diagnostics/shader-canary.txt";default->throw new IOException("UNKNOWN_CANARY");};
        if("shader-canary".equals(kind))runtime.shaderPair();
        byte[] bytes=runtime.assets.read(path,maxBytes);runtime.assertBound();
        return new JSONObject().put("rootIdentity",runtime.rootIdentity()).put("base64",android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP));
    });}
    synchronized void cancel(String handle,String runId)throws IOException {require(handle,runId);cancelledHandle=handle;Thread worker=operationThread;manager.cancel(handle);if(worker!=null)worker.interrupt();}
    synchronized boolean close(String handle,String runId)throws IOException {require(handle,runId);DiagnosticRunLease.CloseResult result=manager.close(handle);if(result==DiagnosticRunLease.CloseResult.CLOSED){completedRunId=runId;active=null;currentTask=null;return true;}return false;}
    JSONObject observedSnapshot()throws Exception {
        ProcessRuntime runtime=app.runtime();if(runtime==null)throw new IOException("RUNTIME_UNAVAILABLE");runtime.assertBound();
        PackageInfo apk=app.getPackageManager().getPackageInfo(app.getPackageName(),0);PackageInfo web=null;
        try{web=android.webkit.WebView.getCurrentWebViewPackage();}catch(RuntimeException unavailable){/* Native recovery must remain useful. */}
        JSONObject environment=new JSONObject().put("platform","android").put("apkPackage",apk.packageName).put("apkVersion",apk.versionName).put("apkVersionCode",apk.getLongVersionCode()).put("apkBuildSha256",JSONObject.NULL).put("androidRelease",Build.VERSION.RELEASE).put("androidApi",Build.VERSION.SDK_INT).put("webviewPackage",web==null?JSONObject.NULL:web.packageName).put("webviewVersion",web==null?JSONObject.NULL:web.versionName).put("nativeApi",BuildConfig.NATIVE_API).put("contentId",runtime.contentId()).put("fixtureOnly",BuildConfig.NATIVE_COMPILE_FIXTURE);
        JSONObject snapshot=new JSONObject().put("sessionId",runtime.sessionId).put("contentId",runtime.contentId()).put("nativeApi",BuildConfig.NATIVE_API).put("webRootIdentity",runtime.rootIdentity()).put("shaderRootIdentity",runtime.rootIdentity());
        return new JSONObject().put("environment",environment).put("runtime",snapshot);
    }
    synchronized boolean canExport(String runId){return active==null&&!exports.busy()&&runId!=null&&runId.equals(completedRunId);}
    synchronized Export reserveExport(String runId,String text)throws Exception {
        if(active!=null||exports.busy()||runId==null||!runId.equals(completedRunId))throw new IOException("EXPORT_RUN_NOT_CURRENT");
        byte[] bytes=text.getBytes(StandardCharsets.UTF_8);if(bytes.length>65536)throw new IOException("REPORT_LIMIT");
        DiagnosticReportValidator.validate(bytes,runId);
        return exports.reserve(runId,bytes);
    }
    synchronized Export export(String token)throws IOException {return exports.get(token);}
    synchronized void finishExport(String token){exports.release(token);}
    synchronized Boolean exportOutcome(String token)throws IOException {return exports.outcome(token);}
    synchronized void writeExport(String token,android.net.Uri uri)throws IOException {
        Export captured=exports.beginWrite(token);
        io.execute(()->{boolean success=false;try{byte[] bytes=captured.bytes();
            android.os.ParcelFileDescriptor descriptor=app.getContentResolver().openFileDescriptor(uri,"w");if(descriptor==null)throw new IOException("NO_DESTINATION");
            try(android.os.ParcelFileDescriptor.AutoCloseOutputStream output=new android.os.ParcelFileDescriptor.AutoCloseOutputStream(descriptor)){output.write(bytes);output.flush();try{output.getFD().sync();}catch(IOException unsupported){/* Only readback is certified. */}}
            try(java.io.InputStream input=app.getContentResolver().openInputStream(uri)){if(input==null)throw new IOException("NO_READBACK");java.security.MessageDigest digest=java.security.MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[4096];int total=0,n;while((n=input.read(buffer))!=-1){if(n==0)continue;total+=n;if(total>bytes.length)throw new IOException("LONG_READBACK");digest.update(buffer,0,n);}if(total!=bytes.length||!java.security.MessageDigest.isEqual(digest.digest(),java.security.MessageDigest.getInstance("SHA-256").digest(bytes)))throw new IOException("CHANGED_READBACK");}success=true;
        }catch(Exception failed){/* Fixed local outcome, no raw provider error disclosure. */}
        try{exports.complete(captured,success);}catch(IOException stale){/* Exact operation cannot complete a replacement export. */}
        });
    }
}
