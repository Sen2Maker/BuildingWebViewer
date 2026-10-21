package com.getcapacitor;
import org.junit.Test;
import static org.junit.Assert.*;
/** Portable native capability policy; real WebMessage callbacks still require device instrumentation. */
public final class BwvBridgeAuthorityTest {
    private static final String ORIGIN="https://localhost", HOME=ORIGIN+"/assets/mobile/index.html";
    @Test public void nativeNonceRequiredAndStaleSameUrlReplayRejected(){
        Object view=new Object(),call=new Object();
        BwvBridgeCallGuard.documentStarted(view,HOME);
        assertFalse(BwvBridgeCallGuard.register(call,view,ORIGIN,ORIGIN,HOME,true,"BWVProjects","listProjects",null));
        String old=BwvBridgeCallGuard.authorizeDocument(view,HOME);
        assertTrue(BwvBridgeCallGuard.register(call,view,ORIGIN,ORIGIN,HOME,true,"BWVProjects","listProjects",old));
        BwvBridgeCallGuard.documentStarted(view,HOME);String next=BwvBridgeCallGuard.authorizeDocument(view,HOME);
        assertNotEquals(old,next);assertFalse(BwvBridgeCallGuard.current(call,view));
        assertFalse(BwvBridgeCallGuard.register(new Object(),view,ORIGIN,ORIGIN,HOME,true,"BWVProjects","listProjects",old));
        assertTrue(BwvBridgeCallGuard.register(new Object(),view,ORIGIN,ORIGIN,HOME,true,"BWVProjects","listProjects",next));
    }
    @Test public void importedFrameAndDiagnosticPageNeverGainProjectCapability(){
        assertFalse(BwvBridgeCallGuard.allowed(ORIGIN,ORIGIN,HOME,false,"BWVProjects","readChunk"));
        assertFalse(BwvBridgeCallGuard.allowed(ORIGIN,"https://evil.example",HOME,true,"BWVProjects","readChunk"));
        assertFalse(BwvBridgeCallGuard.allowed(ORIGIN,ORIGIN,ORIGIN+"/assets/mobile/self-test.html",true,"BWVProjects","readChunk"));
        assertFalse(BwvBridgeCallGuard.allowed(ORIGIN,ORIGIN,ORIGIN+"/_capacitor_file_/file.html",true,"BWVProjects","readChunk"));
    }
    @Test public void noUpdaterOrLegacyGenericPluginCapability(){
        for(String method:new String[]{"activateWebUpdate","updateHealthy","installWebUpdate"})assertFalse(BwvBridgeCallGuard.allowed(ORIGIN,ORIGIN,HOME,true,"BWVProjects",method));
        assertFalse(BwvBridgeCallGuard.allowed(ORIGIN,ORIGIN,HOME,true,"CapacitorHttp","request"));
        assertFalse(BwvBridgeCallGuard.allowed(ORIGIN,ORIGIN,HOME,true,"WebView","setServerBasePath"));
    }
    @Test public void crossDocumentExportOwnershipDenied(){
        Object view=new Object(),owner=new Object(),next=new Object();BwvBridgeCallGuard.documentStarted(view,HOME);String nonce=BwvBridgeCallGuard.authorizeDocument(view,HOME);
        assertTrue(BwvBridgeCallGuard.register(owner,view,ORIGIN,ORIGIN,HOME,true,"BWVProjects","beginExport",nonce));
        BwvBridgeCallGuard.documentStarted(view,HOME);nonce=BwvBridgeCallGuard.authorizeDocument(view,HOME);
        assertTrue(BwvBridgeCallGuard.register(next,view,ORIGIN,ORIGIN,HOME,true,"BWVProjects","appendExport",nonce));assertFalse(BwvBridgeCallGuard.sameDocument(owner,next));
    }
}
