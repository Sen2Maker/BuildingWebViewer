package bwv.diagnostics;

import java.io.IOException;
import java.util.UUID;

/** Application-owned single-flight local export. A cancelled UI never unlocks live I/O. */
public final class DiagnosticExportLease {
    public record Export(String token, String runId, byte[] bytes) {
        public Export { bytes = bytes.clone(); }
        @Override public byte[] bytes() { return bytes.clone(); }
    }
    private Export current;
    private boolean writing, abandoned;
    private Boolean outcome;

    public synchronized boolean busy() { return current != null; }
    public synchronized Export reserve(String runId, byte[] bytes) throws IOException {
        if (current != null || runId == null || !runId.matches("selftest-[a-f0-9-]{36}")
                || bytes == null || bytes.length == 0 || bytes.length > 65536) throw new IOException("EXPORT_BUSY_OR_INVALID");
        current = new Export(UUID.randomUUID().toString(), runId, bytes);
        writing = false; abandoned = false; outcome = null;
        return current;
    }
    public synchronized Export get(String token) throws IOException {
        if (current == null || !current.token().equals(token)) throw new IOException("STALE_EXPORT");
        return current;
    }
    public synchronized Export beginWrite(String token) throws IOException {
        Export captured = get(token);
        if (writing || outcome != null) throw new IOException("EXPORT_ALREADY_WRITING");
        writing = true; return captured;
    }
    /** Exact object identity prevents stale completion from changing a later export. */
    public synchronized void complete(Export operation, boolean readbackVerified) throws IOException {
        if (current != operation || !writing) throw new IOException("STALE_EXPORT_COMPLETION");
        writing = false; outcome = readbackVerified;
        if (abandoned) current = null;
    }
    public synchronized Boolean outcome(String token) throws IOException { get(token); return outcome; }
    public synchronized void release(String token) {
        if (current == null || !current.token().equals(token)) return;
        if (writing) abandoned = true;
        else current = null;
    }
}
