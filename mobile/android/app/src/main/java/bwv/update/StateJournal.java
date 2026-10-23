package bwv.update;

import static bwv.update.UpdateModel.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

/** Atomic local state, not signed metadata. Digest detects corruption, not a malicious local writer. */
public final class StateJournal {
    public enum FaultPoint { BEFORE_WRITE, AFTER_WRITE, AFTER_FILE_SYNC, BEFORE_RENAME, AFTER_RENAME, AFTER_DIRECTORY_SYNC }
    @FunctionalInterface public interface Fault { void hit(FaultPoint point) throws IOException; }
    private static final int MAX_BYTES = 1024 * 1024;
    private final Path directory;
    private final Path file;
    private final Fault fault;
    public StateJournal(Path directory) throws IOException { this(directory, point -> {}); }
    public StateJournal(Path directory, Fault fault) throws IOException {
        this.directory = directory.toAbsolutePath().normalize();
        Files.createDirectories(this.directory);
        if (Files.isSymbolicLink(this.directory) || !Files.isDirectory(this.directory, LinkOption.NOFOLLOW_LINKS))
            throw new IOException("Journal directory is not a real directory");
        this.file = this.directory.resolve("state.bin"); this.fault = Objects.requireNonNull(fault);
    }
    public Path file() { return file; }
    public synchronized Optional<State> load() throws IOException {
        if (!Files.exists(file, LinkOption.NOFOLLOW_LINKS)) return Optional.empty();
        if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) || Files.size(file) > MAX_BYTES)
            throw new IOException("Invalid journal file");
        byte[] all = Files.readAllBytes(file);
        if (all.length < 36 || all.length > MAX_BYTES) throw new IOException("Invalid journal size");
        byte[] body = Arrays.copyOf(all, all.length - 32);
        if (!MessageDigest.isEqual(digest(body), Arrays.copyOfRange(all, body.length, all.length)))
            throw new IOException("Journal corruption; trust must not be reset");
        try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(body))) {
            if (in.readInt() != 0x42575632) throw new IOException("Unsupported journal schema");
            Identity identity = identity(in);
            Trust trust = new Trust(in.readLong(), text(in), Version.parse(text(in)));
            Bundle good = bundle(in), pending = bundle(in); Trial trial = null;
            if (in.readBoolean()) {
                Bundle b = bundle(in); if (b == null) throw new IOException("Missing trial bundle");
                trial = new Trial(b, in.readInt(), text(in));
            }
            int count = in.readInt(); if (count < 0 || count > 1024) throw new IOException("Invalid quarantine count");
            Set<String> failed = new HashSet<>();
            for (int i = 0; i < count; i++) if (!failed.add(text(in))) throw new IOException("Duplicate quarantine entry");
            if (in.read() != -1) throw new IOException("Trailing journal bytes");
            return Optional.of(new State(identity, trust, good, pending, trial, failed));
        } catch (IllegalArgumentException e) { throw new IOException("Invalid journal state", e); }
    }
    public synchronized void save(State state) throws IOException {
        byte[] bytes = encode(state); Path temporary = null;
        try {
            fault.hit(FaultPoint.BEFORE_WRITE);
            temporary = Files.createTempFile(directory, "state-", ".part");
            try (FileChannel out = FileChannel.open(temporary, StandardOpenOption.WRITE)) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) out.write(buffer);
                fault.hit(FaultPoint.AFTER_WRITE); out.force(true); fault.hit(FaultPoint.AFTER_FILE_SYNC);
            }
            fault.hit(FaultPoint.BEFORE_RENAME);
            Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            temporary = null;
            fault.hit(FaultPoint.AFTER_RENAME);
            try (FileChannel parent = FileChannel.open(directory, StandardOpenOption.READ)) { parent.force(true); }
            fault.hit(FaultPoint.AFTER_DIRECTORY_SYNC);
        } finally { if (temporary != null) Files.deleteIfExists(temporary); }
    }
    private static byte[] encode(State state) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            out.writeInt(0x42575632); identity(out, state.identity());
            out.writeLong(state.trust().sequence()); text(out, state.trust().digest()); text(out, state.trust().highestVersion().toString());
            bundle(out, state.lastKnownGood()); bundle(out, state.pending()); out.writeBoolean(state.trial() != null);
            if (state.trial() != null) { bundle(out, state.trial().bundle()); out.writeInt(state.trial().attempts()); text(out, state.trial().attemptToken()); }
            out.writeInt(state.failedContentIds().size());
            for (String id : new TreeSet<>(state.failedContentIds())) text(out, id);
        }
        byte[] body = bytes.toByteArray(); bytes.write(digest(body));
        if (bytes.size() > MAX_BYTES) throw new IOException("Journal exceeds budget");
        return bytes.toByteArray();
    }
    private static byte[] digest(byte[] bytes) {
        try { return MessageDigest.getInstance("SHA-256").digest(bytes); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new AssertionError(impossible); }
    }
    private static void text(DataOutputStream out, String value) throws IOException { out.writeUTF(value); }
    private static String text(DataInputStream in) throws IOException { String s = in.readUTF(); if (s.length() > 4096) throw new IOException("Oversized journal field"); return s; }
    private static void identity(DataOutputStream out, Identity value) throws IOException {
        text(out, value.packageName()); text(out, value.generation()); text(out, value.channel());
    }
    private static Identity identity(DataInputStream in) throws IOException { return new Identity(text(in), text(in), text(in)); }
    private static void bundle(DataOutputStream out, Bundle b) throws IOException {
        out.writeBoolean(b != null); if (b == null) return;
        identity(out, b.identity()); text(out, b.contentId()); text(out, b.root()); text(out, b.version().toString()); text(out, b.buildId());
        out.writeInt(b.nativeApi()); out.writeLong(b.minNativeVersionCode()); out.writeLong(b.sequence()); text(out, b.metadataDigest()); text(out, b.keyId());
    }
    private static Bundle bundle(DataInputStream in) throws IOException {
        if (!in.readBoolean()) return null;
        return new Bundle(identity(in), text(in), text(in), Version.parse(text(in)), text(in), in.readInt(), in.readLong(), in.readLong(), text(in), text(in));
    }
}
