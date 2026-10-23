package bwv.diagnostics;

import bwv.update.StrictJson;
import java.io.IOException;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Strict privacy/shape boundary for local export, NOT an attestation of JavaScript evidence. */
public final class DiagnosticReportValidator {
    private DiagnosticReportValidator() { }
    private static final String[] IDS={"web.environment","native.runtime","native.bridge","native.filesystem","native.scratchStore","runtime.assets","web.workerWasm","fixture.crypto","manual.install","manual.touch","manual.powerLoss"};
    private static final String[] STATUSES={"PASS","FAIL","UNSUPPORTED","NOT_RUN","CANCELLED"};
    private static final Set<String> ENV=Set.of("platform","apkPackage","apkVersion","apkVersionCode","apkBuildSha256","androidRelease","androidApi","webviewPackage","webviewVersion","nativeApi","contentId","fixtureOnly");
    public static void validate(byte[] bytes,String runId) throws IOException {
        Map<String,Object> r=StrictJson.object(StrictJson.parse(bytes,65536,16));
        StrictJson.exactKeys(r,"schemaVersion","runnerVersion","runId","startedAt","finishedAt","durationMs","state","execution","environment","limits","cleanup","cases","summary","policy","verification");
        equal(r,"schemaVersion",1L);equal(r,"runnerVersion","0.1.0-proposal");equal(r,"runId",runId);equal(r,"state","FINISHED");
        one(r,"execution","ANDROID_ADAPTER","WEB_OR_HOST_ONLY");one(r,"cleanup","NOT_NEEDED","VERIFIED","FAILED","UNVERIFIED");
        equal(r,"verification","CASE_EVIDENCE_ONLY_NOT_RELEASE_ACCEPTANCE");
        time(r.get("startedAt"));time(r.get("finishedAt"));number(r.get("durationMs"),Long.MAX_VALUE);
        Map<String,Object> env=StrictJson.object(r.get("environment"));
        if(!ENV.containsAll(env.keySet()))fail();one(env,"platform","android","browser","node");
        for(Map.Entry<String,Object> e:env.entrySet()) {
            Object v=e.getValue();if(v==null)continue;
            switch(e.getKey()) {
                case "apkVersionCode","androidApi","nativeApi" -> number(v,Long.MAX_VALUE);
                case "apkBuildSha256","contentId" -> {if(!StrictJson.string(v).matches("[a-f0-9]{64}"))fail();}
                case "fixtureOnly" -> {if(!(v instanceof Boolean))fail();}
                default -> token(v,100);
            }
        }
        Map<String,Object> limits=StrictJson.object(r.get("limits"));
        String[] names={"runMs","caseMs","cleanupMs","scratchBytes","assetBytes","reportBytes"};long[] maxima={60000,8000,5000,4194304,65536,65536};StrictJson.exactKeys(limits,names);
        for(int i=0;i<names.length;i++)if(number(limits.get(names[i]),maxima[i])<1)fail();
        List<Object> cases=StrictJson.array(r.get("cases"));if(cases.size()!=IDS.length)fail();
        Map<String,Long> counts=new HashMap<>();for(String status:STATUSES)counts.put(status,0L);
        boolean automaticFailed=false,automaticCancelled=false,automaticPassed=true;
        for(int i=0;i<IDS.length;i++) {
            Map<String,Object> c=StrictJson.object(cases.get(i));StrictJson.exactKeys(c,"id","title","manual","status","code","evidence","durationMs");equal(c,"id",IDS[i]);equal(c,"manual",i>=8);
            String title=StrictJson.string(c,"title");if(title.length()>100||title.codePoints().anyMatch(Character::isISOControl))fail();
            String status=one(c,"status",STATUSES);counts.put(status,counts.get(status)+1);
            if(i>=8&&!status.equals("NOT_RUN"))fail();
            if(i<8){automaticFailed|=status.equals("FAIL");automaticCancelled|=status.equals("CANCELLED");automaticPassed&=status.equals("PASS");}
            String code=StrictJson.string(c,"code");if(code.length()>80||!code.matches("[A-Z_]+"))fail();number(c.get("durationMs"),Long.MAX_VALUE);
            Map<String,Object> evidence=StrictJson.object(c.get("evidence"));if(evidence.size()>20)fail();
            for(Map.Entry<String,Object> e:evidence.entrySet()) {
                if(!e.getKey().matches("[A-Za-z][A-Za-z0-9]+"))fail();Object v=e.getValue();
                if(v==null||v instanceof Boolean)continue;if(v instanceof Long){number(v,Long.MAX_VALUE);continue;}token(v,160);
            }
        }
        Map<String,Object> summary=StrictJson.object(r.get("summary"));StrictJson.exactKeys(summary,"counts","automaticOutcome","manualAcceptance");equal(summary,"manualAcceptance","NOT_ASSESSED");
        Map<String,Object> reported=StrictJson.object(summary.get("counts"));StrictJson.exactKeys(reported,STATUSES);for(String status:STATUSES)equal(reported,status,counts.get(status));
        String cleanup=StrictJson.string(r,"cleanup");String expected=automaticFailed||cleanup.equals("FAILED")?"FAILED":automaticCancelled?"CANCELLED":automaticPassed&&!cleanup.equals("UNVERIFIED")?"PASSED":"INCOMPLETE";equal(summary,"automaticOutcome",expected);
        Map<String,Object> policy=StrictJson.object(r.get("policy"));StrictJson.exactKeys(policy,"network","automaticUpload","userProjectAccess","productionTrustChanges","installation","powerLoss");
        for(String key:new String[]{"network","automaticUpload","userProjectAccess","productionTrustChanges"})equal(policy,key,"FORBIDDEN");for(String key:new String[]{"installation","powerLoss"})equal(policy,key,"MANUAL_ONLY");
    }
    private static void equal(Map<String,Object> m,String key,Object expected)throws IOException {if(expected==null||!expected.equals(m.get(key)))fail();}
    private static String one(Map<String,Object> m,String key,String... values)throws IOException {String s=StrictJson.string(m,key);for(String value:values)if(s.equals(value))return s;fail();return "";}
    private static long number(Object value,long max)throws IOException {long n=StrictJson.integer(value);if(n<0||n>max)fail();return n;}
    private static void token(Object value,int max)throws IOException {String s=StrictJson.string(value);if(s.length()>max||!s.matches("[A-Za-z0-9_.:+ -]+"))fail();}
    private static void time(Object value)throws IOException {String text=StrictJson.string(value);if(text.length()>40)fail();try{Instant.parse(text);}catch(RuntimeException invalid){fail();}}
    private static void fail()throws IOException {throw new IOException("INVALID_DIAGNOSTIC_REPORT");}
}
