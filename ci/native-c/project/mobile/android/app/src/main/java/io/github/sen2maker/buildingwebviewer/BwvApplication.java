package io.github.sen2maker.buildingwebviewer;
import android.app.Application;
import bwv.update.BundledAssetVerifier;
import bwv.update.probe.FilesystemCapabilityProbe;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
/** Bootstrap failures do not terminate native recovery/export. */
public final class BwvApplication extends Application {
    private final ExecutorService bootstrap = Executors.newSingleThreadExecutor();
    private final CompletableFuture<ProcessRuntime> ready = new CompletableFuture<>();
    private volatile String failure = "Preparing verified bundled resources";
    private volatile FilesystemCapabilityProbe.Result filesystem;
    private ProjectStore projectStore;
    synchronized ProjectStore projects() { if (projectStore == null) projectStore = new ProjectStore(this); return projectStore; }
    @Override public void onCreate() {
        super.onCreate();
        bootstrap.execute(() -> {
            try {
                BundledAssetVerifier.Identity identity = new BundledAssetVerifier.Identity("BuildingWebViewer", getPackageName(), "stable-v1", "stable", BuildConfig.VERSION_NAME, BuildConfig.BUNDLE_BUILD, BuildConfig.NATIVE_API, 1);
                BundledAssetVerifier.Pins pins = new BundledAssetVerifier.Pins(identity, BuildConfig.BUNDLE_INVENTORY_SHA256, BuildConfig.BUNDLE_INVENTORY_BYTES);
                BundledAssetVerifier.VerifiedAssets assets = BundledAssetVerifier.verify(new AndroidAssetSource(getAssets()), pins, BundledAssetVerifier.Limits.defaults());
                ProjectReaderReadiness.requireCurrentReaders(this);
                // Asset verification/viewing does not depend on external update provider support.
                ProcessRuntime runtime = new ProcessRuntime(assets, "disabled: Android external-update adapters are not yet enabled");
                ready.complete(runtime);
            } catch (Exception | LinkageError error) { failure = error.getClass().getSimpleName() + ": " + error.getMessage(); ready.completeExceptionally(error); }
            try { filesystem = FilesystemCapabilityProbe.run(getFilesDir().toPath()); }
            catch (Exception error) { failure += "; update filesystem probe unavailable: " + error.getClass().getSimpleName(); }
        });
    }
    CompletableFuture<ProcessRuntime> readiness() { return ready; }
    ProcessRuntime runtime() { return ready.getNow(null); }
    String failure() { return failure; }
    FilesystemCapabilityProbe.Result filesystem() { return filesystem; }
}
