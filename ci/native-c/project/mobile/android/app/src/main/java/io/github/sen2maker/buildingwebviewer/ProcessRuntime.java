package io.github.sen2maker.buildingwebviewer;
import bwv.update.BundledAssetVerifier;
import com.getcapacitor.BwvProcessRootGuard;
import com.getcapacitor.ServerPath;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
/** One process object, shared by every Activity, bridge and GL surface. */
final class ProcessRuntime {
    final String sessionId = UUID.randomUUID().toString();
    final BundledAssetVerifier.VerifiedAssets assets;
    final String updateStatus;
    ProcessRuntime(BundledAssetVerifier.VerifiedAssets assets, String updateStatus) {
        this.assets = assets; this.updateStatus = updateStatus;
        BwvProcessRootGuard.bind(true, "public");
    }
    ServerPath serverPath() { return new ServerPath(ServerPath.PathType.ASSET_PATH, "public"); }
    String rootIdentity() { return "asset:public"; }
    String contentId() { return assets.inventorySha256(); }
    String version() { return assets.identity().version(); }
    void assertBound() { BwvProcessRootGuard.require(true, "public"); }
    BundledAssetVerifier.ShaderPair shaderPair() throws IOException { assertBound(); return assets.shaderPair(); }
    String text(String relative, int maximum) throws IOException { assertBound(); return new String(assets.read(relative, maximum), StandardCharsets.UTF_8); }
}
