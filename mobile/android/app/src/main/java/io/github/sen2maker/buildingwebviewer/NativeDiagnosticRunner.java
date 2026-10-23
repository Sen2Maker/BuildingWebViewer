package io.github.sen2maker.buildingwebviewer;
import java.time.Instant;
import bwv.diagnostics.DiagnosticStart;
import bwv.diagnostics.DiagnosticReportValidator;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;
/** Same real native adapters as the WebView button, usable without any WebView. */
final class NativeDiagnosticRunner {
    interface Observer {void rejected(DiagnosticStart.Reason reason);void opened(String handle,String runId);void progress(String runId,String id,String status);void finished(String runId,JSONObject report);}
    private static final String[] IDS={"web.environment","native.runtime","native.bridge","native.filesystem","native.scratchStore","runtime.assets","web.workerWasm","fixture.crypto","manual.install","manual.touch","manual.powerLoss"};
    private final NativeDiagnosticService service;
    NativeDiagnosticRunner(NativeDiagnosticService service){this.service=service;}
    void start(Observer observer){
        String runId="selftest-"+UUID.randomUUID();
        try{service.admission.execute(()->{
            final String handle;
            try{handle=service.open(runId);}
            catch(DiagnosticStart.Rejected rejected){observer.rejected(rejected.reason());return;}
            catch(Exception unavailable){observer.rejected(DiagnosticStart.Reason.UNAVAILABLE);return;}
            try{observer.opened(handle,runId);service.task(service.io.submit(()->run(observer,handle,runId)));}
            catch(RuntimeException unavailable){try{service.cancel(handle,runId);service.close(handle,runId);}catch(Exception ignored){}observer.finished(runId,null);}
        });}catch(java.util.concurrent.RejectedExecutionException busy){observer.rejected(DiagnosticStart.Reason.LEASE_BUSY);}
    }
    private void run(Observer observer,String handle,String runId){
        long began=System.currentTimeMillis(),monotonic=android.os.SystemClock.elapsedRealtime();JSONArray cases=new JSONArray();JSONObject environment=new JSONObject();String cleanup="NOT_NEEDED";boolean cancelled=false;
        try{
            for(String id:IDS){long start=android.os.SystemClock.elapsedRealtime();String status="NOT_RUN",code="NATIVE_ONLY_ENTRY";JSONObject evidence=new JSONObject();
                if(id.startsWith("manual.")){code="MANUAL_REQUIRED";}
                else if(Thread.currentThread().isInterrupted()||service.cancelled(handle)||cancelled){cancelled=true;status="CANCELLED";code="USER_CANCELLED";}
                else try{
                    if(android.os.SystemClock.elapsedRealtime()-monotonic>=60000){service.cancel(handle,runId);throw new InterruptedException("RUN_TIMEOUT");}
                    String deadline=service.armDeadline(handle,runId,Math.min(8000,Math.max(1,60000-(android.os.SystemClock.elapsedRealtime()-monotonic))));
                    try{switch(id){
                        case "native.runtime"->{JSONObject snapshot=service.snapshot(handle,runId);environment=snapshot.getJSONObject("environment");status="PASS";code="NATIVE_RUNTIME_OBSERVED";evidence.put("apkBuildIdentityAvailable",false).put("webviewObserved",!environment.isNull("webviewVersion"));}
                        case "native.filesystem"->{evidence=service.filesystem(handle,runId);if(evidence.has("failureCode")){code=evidence.getString("failureCode");status="FAIL";evidence=new JSONObject();break;}boolean all=true;for(String field:new String[]{"secureTraversal","unixLinkCount","fileNoFollow","directoryNoFollow","exclusiveCreation","atomicRename","directoryForce"})all&=evidence.getBoolean(field);status=all?"PASS":"UNSUPPORTED";code=all?"PROVIDER_CAPABILITIES_OBSERVED":"REQUIRED_PROVIDER_CAPABILITY_MISSING";}
                        case "native.scratchStore"->{evidence=service.store(handle,runId);status="PASS";code="ISOLATED_STORE_FIXTURE_VERIFIED";}
                        case "runtime.assets"->{JSONObject web=service.asset(handle,runId,"web-canary",65536),shader=service.asset(handle,runId,"shader-canary",65536);String a=new String(android.util.Base64.decode(web.getString("base64"),android.util.Base64.DEFAULT),java.nio.charset.StandardCharsets.UTF_8);String b=new String(android.util.Base64.decode(shader.getString("base64"),android.util.Base64.DEFAULT),java.nio.charset.StandardCharsets.UTF_8);if(!a.equals("bwv-selftest:v1:web\n")||!b.equals("// bwv-selftest:v1:shader\n")||!web.getString("rootIdentity").equals(shader.getString("rootIdentity")))throw new IllegalStateException("CANARY_MISMATCH");status="PASS";code="PINNED_ROOT_CANARIES_VERIFIED";evidence.put("webRootMatched",true).put("shaderRootMatched",true).put("webContentVerified",true).put("shaderContentVerified",true);}
                        default->{/* Web/Worker/WebCrypto are never synthesized by the native fallback. */}
                    }}finally{service.disarmDeadline(deadline);}
                }catch(Exception|LinkageError failed){status=Thread.currentThread().isInterrupted()||service.cancelled(handle)?"CANCELLED":"FAIL";code=status.equals("CANCELLED")?"USER_CANCELLED":"NATIVE_OPERATION_FAILED";cancelled|=status.equals("CANCELLED");}
                cases.put(new JSONObject().put("id",id).put("title",id).put("manual",id.startsWith("manual.")).put("status",status).put("code",code).put("evidence",evidence).put("durationMs",Math.max(0,android.os.SystemClock.elapsedRealtime()-start)));observer.progress(runId,id,status);
            }
        }catch(Exception failed){cancelled=true;}
        finally{if(handle!=null){Thread.interrupted();try{cleanup=service.close(handle,runId)?"VERIFIED":"FAILED";}catch(Exception failed){cleanup="FAILED";}}}
        try{
            // Only an admitted run reaches this path; unexpected later interruption leaves remaining cases NOT_RUN.
            while(cases.length()<IDS.length){String id=IDS[cases.length()];cases.put(new JSONObject().put("id",id).put("title",id).put("manual",id.startsWith("manual.")).put("status","NOT_RUN").put("code","RUN_NOT_STARTED").put("evidence",new JSONObject()).put("durationMs",0));}
            if(environment.length()==0)environment.put("platform","android");
            JSONObject counts=new JSONObject();for(String status:new String[]{"PASS","FAIL","UNSUPPORTED","NOT_RUN","CANCELLED"}){int count=0;for(int i=0;i<cases.length();i++)if(cases.getJSONObject(i).getString("status").equals(status))count++;counts.put(status,count);}
            String outcome=counts.getInt("FAIL")>0||cleanup.equals("FAILED")?"FAILED":counts.getInt("CANCELLED")>0?"CANCELLED":"INCOMPLETE";
            JSONObject report=new JSONObject().put("schemaVersion",1).put("runnerVersion","0.1.0-proposal").put("runId",runId).put("startedAt",Instant.ofEpochMilli(began).toString()).put("finishedAt",Instant.now().toString()).put("durationMs",Math.max(0,android.os.SystemClock.elapsedRealtime()-monotonic)).put("state","FINISHED").put("execution","ANDROID_ADAPTER").put("environment",environment).put("limits",new JSONObject().put("runMs",60000).put("caseMs",8000).put("cleanupMs",5000).put("scratchBytes",4194304).put("assetBytes",65536).put("reportBytes",65536)).put("cleanup",cleanup).put("cases",cases).put("summary",new JSONObject().put("counts",counts).put("automaticOutcome",outcome).put("manualAcceptance","NOT_ASSESSED")).put("policy",new JSONObject().put("network","FORBIDDEN").put("automaticUpload","FORBIDDEN").put("userProjectAccess","FORBIDDEN").put("productionTrustChanges","FORBIDDEN").put("installation","MANUAL_ONLY").put("powerLoss","MANUAL_ONLY")).put("verification","CASE_EVIDENCE_ONLY_NOT_RELEASE_ACCEPTANCE");
            DiagnosticReportValidator.validate(report.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8),runId);
            observer.finished(runId,report);
        }catch(Exception failed){observer.finished(runId,null);}
    }
}
