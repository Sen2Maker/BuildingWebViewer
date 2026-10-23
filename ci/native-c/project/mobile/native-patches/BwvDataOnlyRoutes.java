package com.getcapacitor;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** Pure policy. This controls interpretation, not authorization to private files. */
public final class BwvDataOnlyRoutes {
    public static final String FILE = "/_capacitor_file_";
    public static final String CONTENT = "/_capacitor_content_";
    public static final String CSP = "sandbox; default-src 'none'; script-src 'none'; object-src 'none'; " +
        "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    private BwvDataOnlyRoutes() {}

    /** Include malformed prefix lookalikes so they fail closed, never enter the HTML pipeline. */
    public static boolean isReservedPath(String path) {
        return path != null && (path.startsWith(FILE) || path.startsWith(CONTENT));
    }

    public static boolean isReserved(String encodedPath, String decodedPath) {
        return isReservedPath(encodedPath) || isReservedPath(decodedPath);
    }

    public static boolean validPath(String encodedPath, String decodedPath) {
        if (encodedPath == null || decodedPath == null) return false;
        String prefix = decodedPath.startsWith(FILE) ? FILE : CONTENT;
        if (!decodedPath.startsWith(prefix + "/") || !encodedPath.startsWith(prefix + "/")) return false;
        String target = decodedPath.substring(prefix.length());
        if (target.length() <= 1 || target.startsWith("//")) return false;
        for (int i = 0; i < decodedPath.length(); i++) {
            char c = decodedPath.charAt(i);
            if (c == '\\' || c < 0x20 || c == 0x7f || c == '\ufffd') return false;
        }
        for (String segment : target.split("/", -1)) {
            if (segment.equals(".") || segment.equals("..")) return false;
        }
        // Ambiguous repeated route markers must not reach AndroidProtocolHandler.replace().
        if (target.contains(FILE) || target.contains(CONTENT)) return false;
        return true;
    }

    public static String header(Map<String, String> headers, String key) {
        if (headers == null) return null;
        String result = null;
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            if (key.equalsIgnoreCase(entry.getKey())) {
                if (result != null) return "__ambiguous__";
                result = entry.getValue();
            }
        }
        return result;
    }

    public static boolean denyDestination(boolean mainFrame, Map<String, String> headers) {
        if (mainFrame || header(headers, "Upgrade-Insecure-Requests") != null) return true;
        String mode = header(headers, "Sec-Fetch-Mode");
        if (mode != null && (mode.trim().equalsIgnoreCase("navigate") || mode.equals("__ambiguous__"))) return true;
        String dest = header(headers, "Sec-Fetch-Dest");
        if (dest == null) return false; // Missing Fetch Metadata is not treated as an authorization signal.
        dest = dest.trim().toLowerCase(Locale.ROOT);
        return !(dest.isEmpty() || dest.equals("empty") || dest.equals("image") || dest.equals("audio") || dest.equals("video"));
    }

    public static int denialStatus(String encodedPath, String decodedPath, String method,
                                    boolean mainFrame, Map<String, String> headers) {
        if (!validPath(encodedPath, decodedPath)) return 400;
        if (!"GET".equals(method) && !"HEAD".equals(method)) return 405;
        if (denyDestination(mainFrame, headers)) return 403;
        return 0;
    }

    /** Never return HTML/XML/SVG/JS/CSS/WASM, even when the provider or extension says otherwise. */
    public static String safeMime(String decodedPath, String providerType) {
        if (providerType != null) {
            String type = providerType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
            if (isSafeMedia(type)) return type;
        }
        String lower = decodedPath == null ? "" : decodedPath.toLowerCase(Locale.ROOT);
        String ext = lower.substring(lower.lastIndexOf('.') + 1);
        switch (ext) {
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "gif": return "image/gif";
            case "webp": return "image/webp";
            case "avif": return "image/avif";
            case "bmp": return "image/bmp";
            case "mp3": return "audio/mpeg";
            case "wav": return "audio/wav";
            case "flac": return "audio/flac";
            case "aac": return "audio/aac";
            case "m4a": return "audio/mp4";
            case "mp4": return "video/mp4";
            case "webm": return "video/webm";
            case "ogg": return "audio/ogg";
            default: return "application/octet-stream";
        }
    }

    private static boolean isSafeMedia(String type) {
        switch (type) {
            case "image/png": case "image/jpeg": case "image/gif": case "image/webp":
            case "image/avif": case "image/bmp": case "audio/mpeg": case "audio/wav":
            case "audio/flac": case "audio/aac": case "audio/mp4": case "audio/ogg":
            case "video/mp4": case "video/webm": case "video/ogg": return true;
            default: return false;
        }
    }

    /** Fresh map on every response, including denied, missing, range and HEAD responses. */
    public static Map<String, String> headers() {
        Map<String, String> result = new LinkedHashMap<>();
        result.put("Cache-Control", "no-store");
        result.put("X-Content-Type-Options", "nosniff");
        result.put("Content-Security-Policy", CSP);
        result.put("X-Frame-Options", "DENY");
        result.put("Cross-Origin-Resource-Policy", "same-origin");
        result.put("Referrer-Policy", "no-referrer");
        return result;
    }
}
