package com.getcapacitor;
import java.util.Objects;
/** Native-only process pin. A bridge rebuild is not a new update activation. */
public final class BwvProcessRootGuard {
    private static Root root;
    private BwvProcessRootGuard() { }
    private record Root(boolean asset, String path) { }
    public static synchronized void bind(boolean asset, String path) {
        if (path == null || path.isEmpty() || (!asset && !path.startsWith("/"))) throw new IllegalArgumentException("Missing native root");
        Root next = new Root(asset, path);
        if (root != null && !root.equals(next)) throw new IllegalStateException("Process resource root is immutable");
        root = next;
    }
    public static synchronized void require(boolean asset, String path) {
        if (root == null || root.asset() != asset || !Objects.equals(root.path(), path)) throw new IllegalStateException("Unbound or changed resource root");
    }
    public static synchronized String identity() {
        if (root == null) throw new IllegalStateException("No native resource root");
        return (root.asset() ? "asset:" : "file:") + root.path();
    }
}
