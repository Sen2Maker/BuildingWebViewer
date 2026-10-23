package io.github.sen2maker.buildingwebviewer;

import android.content.Context;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Actual Android adapters on synthetic scratch only. Source exists; device execution is still required. */
@RunWith(AndroidJUnit4.class)
public final class DiagnosticAdaptersTest {
    @Test public void realStoreProviderAndPinnedAssetsUseOneIsolatedLease() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        BwvApplication app=(BwvApplication)context.getApplicationContext();
        try(ActivityScenario<BootstrapActivity> ignored=ActivityScenario.launch(BootstrapActivity.class)) {
            app.readiness().get(15,TimeUnit.SECONDS);
            NativeDiagnosticService service=app.diagnostics();assertNotNull(service);
            String run="selftest-"+UUID.randomUUID(),handle=service.open(run);
            try {
                JSONObject snapshot=service.snapshot(handle,run);
                JSONObject runtime=snapshot.getJSONObject("runtime");
                assertEquals(runtime.getString("webRootIdentity"),runtime.getString("shaderRootIdentity"));
                assertTrue(runtime.getString("contentId").matches("[a-f0-9]{64}"));
                JSONObject provider=service.filesystem(handle,run);
                for(String field:new String[]{"secureTraversal","unixLinkCount","fileNoFollow","directoryNoFollow","exclusiveCreation","atomicRename","directoryForce"})assertTrue(provider.get(field) instanceof Boolean);
                // Capability false is an observed UNSUPPORTED result, not a reason to disable bundled/native recovery.
                JSONObject store=service.store(handle,run);
                for(String field:new String[]{"scratchRootChecked","contextFilesIsolated","contextCacheIsolated","applicationContextIsolated","created","reopened","stateRoundtrip","backupRestored","cleanupVerified"})assertTrue(store.getBoolean(field));
                for(String kind:new String[]{"web-canary","shader-canary"})assertEquals(runtime.getString("webRootIdentity"),service.asset(handle,run,kind,65536).getString("rootIdentity"));
                try{service.asset(handle,run,"../project",65536);fail("Arbitrary asset path accepted");}catch(java.io.IOException expected) { }
                assertTrue(service.close(handle,run));
                handle=null;
            } finally {if(handle!=null){service.cancel(handle,run);assertTrue(service.close(handle,run));}}
        }
    }
    @Test public void readerRejectsCoercedSchemaAndBackupOnlyProjectRemainsVisible() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        bwv.diagnostics.DiagnosticRunLease leases=new bwv.diagnostics.DiagnosticRunLease(context.getCacheDir().toPath());
        bwv.diagnostics.DiagnosticRunLease.Lease lease=leases.begin("reader-"+UUID.randomUUID());
        try {
            leases.operation(lease.handle(),scratch->{
                DiagnosticSandboxContext isolated=new DiagnosticSandboxContext(context,scratch.reserveTree("reader",131072,64));
                ProjectStore store=new ProjectStore(isolated);JSONObject project=store.create("Reader fixture");String id=project.getString("id");
                ProjectReaderReadiness.requireCurrentReaders(isolated);
                java.io.File main=new java.io.File(store.projects,id+".json"),backup=new java.io.File(store.projects,id+".json.bak");
                assertTrue(main.renameTo(backup));ProjectReaderReadiness.requireCurrentReaders(isolated);
                project.put("schemaVersion","1");java.nio.file.Files.write(backup.toPath(),project.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                try{ProjectReaderReadiness.requireCurrentReaders(isolated);fail("String schema was coerced");}catch(java.io.IOException expected) { }
                return null;
            });
        } finally {assertEquals(bwv.diagnostics.DiagnosticRunLease.CloseResult.CLOSED,leases.close(lease.handle()));}
    }
    @Test public void nativeRunnerReportsBusyAsRejectedStartNotCompletedReport() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        BwvApplication app=(BwvApplication)context.getApplicationContext();
        NativeDiagnosticService service=app.diagnostics();assertNotNull(service);
        String existingRun="selftest-"+UUID.randomUUID(),existingHandle=service.open(existingRun);
        java.util.concurrent.CountDownLatch response=new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.atomic.AtomicReference<bwv.diagnostics.DiagnosticStart.Reason> reason=new java.util.concurrent.atomic.AtomicReference<>();
        java.util.concurrent.atomic.AtomicInteger invalidCallbacks=new java.util.concurrent.atomic.AtomicInteger();
        try {
            new NativeDiagnosticRunner(service).start(new NativeDiagnosticRunner.Observer(){
                public void rejected(bwv.diagnostics.DiagnosticStart.Reason value){reason.set(value);response.countDown();}
                public void opened(String h,String r){invalidCallbacks.incrementAndGet();response.countDown();}
                public void progress(String r,String id,String status){invalidCallbacks.incrementAndGet();}
                public void finished(String r,JSONObject report){invalidCallbacks.incrementAndGet();response.countDown();}
            });
            assertTrue(response.await(5,TimeUnit.SECONDS));
            assertEquals(bwv.diagnostics.DiagnosticStart.Reason.LEASE_BUSY,reason.get());
            assertEquals(0,invalidCallbacks.get());assertFalse(service.canExport(existingRun));
            // Cancelled scratch can already be cleaned, but the service owner stays busy until close.
            service.cancel(existingHandle,existingRun);
            try{service.open("selftest-"+UUID.randomUUID());fail("Replaced an unclosed owner");}
            catch(bwv.diagnostics.DiagnosticStart.Rejected rejected){assertEquals(bwv.diagnostics.DiagnosticStart.Reason.LEASE_BUSY,rejected.reason());}
        } finally {assertTrue(service.close(existingHandle,existingRun));}
    }

}
