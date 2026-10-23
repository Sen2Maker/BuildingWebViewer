package io.github.sen2maker.buildingwebviewer;

import android.content.Context;
import android.os.Build;
import android.util.Log;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import bwv.update.probe.FilesystemCapabilityProbe;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.assertTrue;

/** Not integrated/compiled yet. Materialize helper + this test into checkpoint C Android source sets. */
@RunWith(AndroidJUnit4.class)
public final class UpdateFilesystemCapabilityTest {
    @Test public void privateFilesystemSatisfiesExternalUpdateContract() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("Supported product floor is API 30", Build.VERSION.SDK_INT >= 30);
        FilesystemCapabilityProbe.Result result = FilesystemCapabilityProbe.run(context.getFilesDir().toPath());
        Log.i("BWVUpdateFsProbe", "API=" + Build.VERSION.SDK_INT + "," + result);
        assertTrue("Disable external updates; retain safe bundled viewer and native export: " + result,
                result.supportsExternalUpdates());
    }
}
