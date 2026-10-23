package io.github.sen2maker.buildingwebviewer;
import android.content.res.AssetManager;
import bwv.update.BundledAssetVerifier;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
/** Captures the installed APK asset manager and one immutable public prefix. */
final class AndroidAssetSource implements BundledAssetVerifier.Source {
    private final AssetManager assets;
    AndroidAssetSource(AssetManager assets) { this.assets = assets; }
    @Override public List<String> listFiles(int maxFiles, int maxDepth, int maxPathBytes) throws IOException {
        List<String> result = new ArrayList<>(); walk("", 0, maxFiles, maxDepth, maxPathBytes, result, new int[]{0}); return result;
    }
    private void walk(String relative, int depth, int maxFiles, int maxDepth, int maxPathBytes, List<String> out, int[] nodes) throws IOException {
        if (++nodes[0] > 1L + (long)maxFiles * maxDepth) throw new IOException("Too many APK asset nodes");
        if (depth > maxDepth || relative.length() > maxPathBytes) throw new IOException("APK asset enumeration exceeds bounds");
        String[] children = assets.list(relative.isEmpty() ? "public" : "public/" + relative);
        if (children == null) throw new IOException("Cannot enumerate APK assets");
        if (children.length == 0) {
            if (relative.isEmpty()) throw new IOException("No bundled assets");
            try (InputStream ignored = open(relative)) { /* AssetManager does not preserve empty directories. */ }
            if (out.size() >= maxFiles) throw new IOException("Too many bundled files");
            out.add(relative); return;
        }
        if (children.length > maxFiles) throw new IOException("Too many bundled children");
        for (String child : children) {
            if (child.isEmpty() || child.equals(".") || child.equals("..") || child.indexOf('/') >= 0 || child.indexOf('\\') >= 0) throw new IOException("Invalid APK asset child");
            walk(relative.isEmpty() ? child : relative + "/" + child, depth + 1, maxFiles, maxDepth, maxPathBytes, out, nodes);
        }
    }
    @Override public InputStream open(String relative) throws IOException {
        if (relative == null || relative.isEmpty() || relative.startsWith("/") || relative.contains("\\") || relative.contains("//")) throw new IOException("Invalid asset path");
        for (String part : relative.split("/")) if (part.equals(".") || part.equals("..") || part.isEmpty()) throw new IOException("Invalid asset path");
        return assets.open("public/" + relative, AssetManager.ACCESS_STREAMING);
    }
}
