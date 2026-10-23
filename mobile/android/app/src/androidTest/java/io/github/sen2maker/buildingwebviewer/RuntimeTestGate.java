package io.github.sen2maker.buildingwebviewer;

import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.TimeUnit;

/** Test-only readiness observation. It neither changes the selected root nor bypasses validation. */
public final class RuntimeTestGate {
    private RuntimeTestGate() { }
    public static void awaitVerifiedBundle() throws Exception {
        BwvApplication app=(BwvApplication)InstrumentationRegistry.getInstrumentation().getTargetContext().getApplicationContext();
        app.readiness().get(15,TimeUnit.SECONDS);
    }
}
