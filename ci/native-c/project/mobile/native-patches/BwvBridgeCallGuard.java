package com.getcapacitor;

import java.net.URI;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;

/** Native-only call provenance. No field supplied in JavaScript options can create a ticket. */
public final class BwvBridgeCallGuard {
    private BwvBridgeCallGuard() {}
    private static final Map<Object, Document> DOCUMENTS = new WeakHashMap<>();
    private static final Map<Object, Binding> CALLS = new WeakHashMap<>();
    private static final Set<String> PROJECT_PAGES = Set.of("/assets/mobile/index.html", "/lod.html", "/wireframe.html", "/pointcloud.html", "/gaussian.html", "/generate.html");
    private static final Set<String> PROJECT_METHODS = Set.of("showDiagnostics", "openRecovery", "runtimeInfo", "openCadAppDownload", "checkUpdate", "runtimeSnapshot", "showReleaseNotes", "openNativeGaussian", "cleanupStorage", "emptyTrash", "backupProject", "listProjects", "createProject", "getProject", "saveState", "renameProject", "trashProject", "retryImport", "discardImport", "pickFiles", "readChunk", "beginExport", "appendExport", "cancelExport", "finishExport", "commitExport", "commitSnapshot", "addListener", "removeListener", "removeAllListeners", "checkPermissions", "requestPermissions");
    private static final Set<String> DIAGNOSTIC_METHODS = Set.of("openRun", "runtimeSnapshot", "roundTrip", "probeFilesystem", "probeScratchStore", "readAsset", "cancelRun", "closeRun", "exportReport");
    private static final Set<String> PUBLIC_PAGES = Set.of("/", "/index.html", "/assets/mobile/self-test.html", "/assets/mobile/notices.html", "/assets/mobile/webview-required.html");
    private static final java.security.SecureRandom RANDOM = new java.security.SecureRandom();
    private static final class Document {
        final String url, nonce; boolean ready;
        Document(String url) { this.url = url; byte[] random = new byte[32]; RANDOM.nextBytes(random); StringBuilder value = new StringBuilder(64); for (byte b : random) value.append("0123456789abcdef".charAt((b & 255) >>> 4)).append("0123456789abcdef".charAt(b & 15)); nonce = value.toString(); }
    }
    private static final class Binding {
        final Object view; final Object document;
        Binding(Object view, Object document) { this.view = view; this.document = document; }
    }
    private static URI local(String value) throws Exception {
        URI uri = new URI(value);
        if (!"https".equals(uri.getScheme()) || !"localhost".equals(uri.getRawAuthority()) || uri.getUserInfo() != null || uri.getRawFragment() != null || uri.getRawQuery() != null || !(uri.getRawPath().isEmpty() || "/".equals(uri.getRawPath()))) throw new IllegalArgumentException("Unpinned origin");
        return uri;
    }
    private static String path(String origin, String document) throws Exception {
        URI trusted = local(origin), page = new URI(document);
        if (!trusted.getScheme().equals(page.getScheme()) || !trusted.getRawAuthority().equals(page.getRawAuthority()) || page.getUserInfo() != null || page.isOpaque()) throw new IllegalArgumentException("Foreign document");
        String path = page.getRawPath();
        if (path == null || path.isEmpty()) return "/";
        return path;
    }
    /** Query/hash-only history changes retain the same executing document; a nonce still separates reloads. */
    public static boolean samePage(String left, String right) {
        try { return path("https://localhost",left).equals(path("https://localhost",right)); }
        catch (Exception denied) { return false; }
    }
    public static boolean navigable(String origin, String document) {
        try { String path = path(origin, document); return PROJECT_PAGES.contains(path) || PUBLIC_PAGES.contains(path) || path.matches("/assets/(?:mobile/licenses|vendor/main-notices)/[A-Za-z0-9_-][A-Za-z0-9._-]*\\.txt"); }
        catch (Exception denied) { return false; }
    }
    public static boolean allowed(String origin, String sourceOrigin, String document, boolean mainFrame, String plugin, String method) {
        try {
            if (!mainFrame || !local(origin).getRawAuthority().equals(local(sourceOrigin).getRawAuthority())) return false;
            String path = path(origin, document);
            if ("BWVProjects".equals(plugin)) return PROJECT_PAGES.contains(path) && PROJECT_METHODS.contains(method);
            if ("BWVSelfTest".equals(plugin)) return document.equals(origin + "/assets/mobile/self-test.html") && DIAGNOSTIC_METHODS.contains(method);
            return false;
        } catch (Exception denied) { return false; }
    }
    public static synchronized void documentStarted(Object view, String url) { DOCUMENTS.put(view, new Document(url)); }
    /** Called by native onPageFinished; the nonce is delivered with evaluateJavascript to the current main document only. */
    public static synchronized String authorizeDocument(Object view, String url) {
        Document document = DOCUMENTS.get(view);
        if (document == null || url == null || !samePage(url,document.url) || (!allowed("https://localhost", "https://localhost", url, true, "BWVProjects", "runtimeSnapshot") && !allowed("https://localhost", "https://localhost", url, true, "BWVSelfTest", "openRun"))) return null;
        document.ready = true; return document.nonce;
    }
    public static synchronized void destroyed(Object view) { DOCUMENTS.remove(view); }
    public static synchronized boolean register(Object call, Object view, String origin, String sourceOrigin, String document, boolean mainFrame, String plugin, String method, String nonce) {
        if (call == null || view == null || CALLS.containsKey(call) || !allowed(origin, sourceOrigin, document, mainFrame, plugin, method)) return false;
        Document token = DOCUMENTS.get(view);
        if (token == null || !token.ready || !samePage(token.url,document) || nonce == null || !nonce.matches("[a-f0-9]{64}") || !java.security.MessageDigest.isEqual(token.nonce.getBytes(java.nio.charset.StandardCharsets.US_ASCII), nonce.getBytes(java.nio.charset.StandardCharsets.US_ASCII))) return false;
        CALLS.put(call, new Binding(view, token)); return true;
    }
    public static synchronized boolean current(Object call, Object view) {
        Binding binding = CALLS.get(call);
        return binding != null && binding.view == view && DOCUMENTS.get(view) == binding.document;
    }
    public static synchronized boolean sameDocument(Object left, Object right) {
        Binding a = CALLS.get(left), b = CALLS.get(right);
        return a != null && b != null && a.view == b.view && a.document == b.document && DOCUMENTS.get(a.view) == a.document;
    }
    public static void require(Object call, Object view) {
        if (!current(call, view)) throw new IllegalStateException("STALE_OR_UNAUTHORIZED_DOCUMENT");
    }
    // Bindings use weak call keys so async export ownership can retain a call without granting another document authority.
}
