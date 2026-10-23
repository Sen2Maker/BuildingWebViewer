package bwv.update.probe;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.DirectoryStream;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SecureDirectoryStream;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Standalone capability probe. Does not load update state, touch projects or enable updates. */
public final class FilesystemCapabilityProbe {
    private FilesystemCapabilityProbe() { }
    public static final class Result {
        public final String providerClass;
        public final String directoryStreamClass;
        public final boolean secureTraversal;
        public final boolean unixLinkCount;
        public final boolean singleLinkCountObserved;
        public final String hardLinkFixture;
        public final boolean fileNoFollow;
        public final boolean directoryNoFollow;
        public final boolean exclusiveCreation;
        public final boolean atomicRename;
        public final boolean directoryForce;
        private Result(String providerClass, String directoryStreamClass, boolean secureTraversal,
                boolean unixLinkCount, boolean singleLinkCountObserved, String hardLinkFixture, boolean fileNoFollow, boolean directoryNoFollow,
                boolean exclusiveCreation, boolean atomicRename, boolean directoryForce) {
            this.providerClass = providerClass; this.directoryStreamClass = directoryStreamClass;
            this.secureTraversal = secureTraversal; this.unixLinkCount = unixLinkCount;
            this.singleLinkCountObserved = singleLinkCountObserved; this.hardLinkFixture = hardLinkFixture;
            this.fileNoFollow = fileNoFollow; this.directoryNoFollow = directoryNoFollow;
            this.exclusiveCreation = exclusiveCreation; this.atomicRename = atomicRename; this.directoryForce = directoryForce;
        }
        public boolean supportsExternalUpdates() { return secureTraversal && unixLinkCount && fileNoFollow
                && directoryNoFollow && exclusiveCreation && atomicRename && directoryForce; }
        @Override public String toString() { return "provider=" + providerClass + ",stream=" + directoryStreamClass
                + ",secure=" + secureTraversal + ",nlink=" + unixLinkCount + ",fileNoFollow=" + fileNoFollow
                + ",directoryNoFollow=" + directoryNoFollow + ",createNew=" + exclusiveCreation
                + ",atomicRename=" + atomicRename + ",directoryForce=" + directoryForce; }
    }
    public enum LinkCreation { CREATED, ACCESS_DENIED, NOT_SUPPORTED }
    @FunctionalInterface public interface HardLinkCreator {
        LinkCreation create(Path link, Path existing) throws IOException;
    }
    public enum Stage { ROOT, CREATE_TREE, WRITE_FILE, EXCLUSIVE_CREATE, HARD_LINK, SYMBOLIC_LINK, DIRECTORY_STREAM, SECURE_READ, FILE_NOFOLLOW, DIRECTORY_NOFOLLOW, ATOMIC_RENAME, DIRECTORY_FORCE, CLEANUP }
    public static final class ProbeFailure extends IOException {
        private final Stage stage;
        private ProbeFailure(Stage stage, Throwable cause) { super("FILESYSTEM_PROBE_" + stage.name(), cause); this.stage = stage; }
        public String code() { return "FILESYSTEM_PROBE_" + stage.name(); }
    }
    /** Caller supplies application filesDir, not an untrusted URI or external-storage path. */
    public static Result run(Path applicationFilesDir) throws IOException {
        return run(applicationFilesDir, (link, existing) -> {
            try { Files.createLink(link, existing); return LinkCreation.CREATED; }
            catch (java.nio.file.AccessDeniedException denied) { return LinkCreation.ACCESS_DENIED; }
            catch (UnsupportedOperationException unavailable) { return LinkCreation.NOT_SUPPORTED; }
        });
    }
    /** Trusted native adapter only; never accepts a JavaScript callback or user path. */
    public static Result run(Path applicationFilesDir, HardLinkCreator creator) throws IOException {
        Stage stage = Stage.ROOT;
        try {
        if (!applicationFilesDir.isAbsolute() || !applicationFilesDir.normalize().equals(applicationFilesDir)
                || Files.isSymbolicLink(applicationFilesDir) || !Files.isDirectory(applicationFilesDir, LinkOption.NOFOLLOW_LINKS))
            throw new IOException("Expected real application-private files directory");
        stage = Stage.CREATE_TREE;
        Path own = Files.createTempDirectory(applicationFilesDir, "bwv-fs-probe-");
        try {
            Path left = Files.createDirectory(own.resolve("left")), right = Files.createDirectory(own.resolve("right"));
            Path original = left.resolve("original"); byte[] expected = {1, 2, 3, 4};
            stage = Stage.WRITE_FILE;
            try (FileChannel output = FileChannel.open(original, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) {
                ByteBuffer bytes = ByteBuffer.wrap(expected); while (bytes.hasRemaining()) output.write(bytes); output.force(true);
            }
            stage = Stage.EXCLUSIVE_CREATE;
            boolean exclusive;
            try (FileChannel unexpected = FileChannel.open(original, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                exclusive = !unexpected.isOpen();
            } catch (java.nio.file.FileAlreadyExistsException expectedFailure) { exclusive = true; }
            stage = Stage.HARD_LINK;
            boolean links = false;
            if (linkCount(original) != 1) throw new IOException("Fresh fixture is not single-linked");
            boolean singleLinkCountObserved = true;
            Path hard = right.resolve("hardlink");
            LinkCreation creation = creator.create(hard, original);
            String hardLinkFixture;
            if (creation == LinkCreation.CREATED) {
                links = linkCount(original) == 2 && linkCount(hard) == 2;
                Files.delete(hard); links &= linkCount(original) == 1;
                if (!links) throw new IOException("Hardlink count transition mismatch");
                hardLinkFixture = "VERIFIED";
            } else if (creation == LinkCreation.ACCESS_DENIED || creation == LinkCreation.NOT_SUPPORTED) {
                if (!Files.notExists(hard, LinkOption.NOFOLLOW_LINKS) || linkCount(original) != 1)
                    throw new IOException("Unavailable hardlink fixture changed files");
                hardLinkFixture = creation == LinkCreation.ACCESS_DENIED ? "UNSUPPORTED_ACCESS_DENIED" : "UNSUPPORTED_PROVIDER";
            } else { throw new IOException("Invalid hardlink fixture result"); }
            stage = Stage.SYMBOLIC_LINK;
            Path fileLink = left.resolve("file-link"), directoryLink = left.resolve("directory-link");
            Files.createSymbolicLink(fileLink, original); Files.createSymbolicLink(directoryLink, right);
            boolean fileNoFollow = false, directoryNoFollow = false, secure = false;
            String streamClass;
            stage = Stage.DIRECTORY_STREAM;
            try (DirectoryStream<Path> directory = Files.newDirectoryStream(left)) {
                streamClass = directory.getClass().getName();
                if (directory instanceof SecureDirectoryStream<?>) {
                    @SuppressWarnings("unchecked") SecureDirectoryStream<Path> handle = (SecureDirectoryStream<Path>) directory;
                    Set<java.nio.file.OpenOption> options = new HashSet<>(); options.add(StandardOpenOption.READ); options.add(LinkOption.NOFOLLOW_LINKS);
            stage = Stage.SECURE_READ;
                    try (var channel = handle.newByteChannel(Paths.get("original"), options)) {
                        ByteBuffer read = ByteBuffer.allocate(4); while (read.hasRemaining()) { if (channel.read(read) == -1) break; }
                        secure = Arrays.equals(read.array(), expected);
                    }
            stage = Stage.FILE_NOFOLLOW;
                    try (var unexpected = handle.newByteChannel(Paths.get("file-link"), options)) {
                        fileNoFollow = !unexpected.isOpen();
                    } catch (IOException expectedFailure) { fileNoFollow = true; }
            stage = Stage.DIRECTORY_NOFOLLOW;
                    try (var unexpected = handle.newDirectoryStream(Paths.get("directory-link"), LinkOption.NOFOLLOW_LINKS)) {
                        unexpected.iterator(); directoryNoFollow = false;
                    } catch (IOException expectedFailure) { directoryNoFollow = true; }
                }
            }
            stage = Stage.ATOMIC_RENAME;
            Path moved = right.resolve("renamed"); boolean atomic;
            try {
                Files.move(original, moved, StandardCopyOption.ATOMIC_MOVE);
                atomic = !Files.exists(original, LinkOption.NOFOLLOW_LINKS) && Arrays.equals(Files.readAllBytes(moved), expected);
            } catch (java.nio.file.AtomicMoveNotSupportedException unsupported) { atomic = false; }
            stage = Stage.DIRECTORY_FORCE;
            boolean directoryForce;
            try {
                for (Path directory : new Path[]{left, right, own}) {
                    try (FileChannel descriptor = FileChannel.open(directory, StandardOpenOption.READ)) { descriptor.force(true); }
                }
                directoryForce = true;
            } catch (IOException | UnsupportedOperationException unsupported) { directoryForce = false; }
            return new Result(applicationFilesDir.getFileSystem().provider().getClass().getName(), streamClass,
                    secure, links, singleLinkCountObserved, hardLinkFixture, fileNoFollow, directoryNoFollow, exclusive, atomic, directoryForce);
        } finally {
            // Only the just-created probe tree. Never follows its intentionally created symbolic links.
            try { Files.walkFileTree(own, new SimpleFileVisitor<Path>() {
                @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException { Files.delete(file); return FileVisitResult.CONTINUE; }
                @Override public FileVisitResult postVisitDirectory(Path directory, IOException error) throws IOException {
                    if (error != null) throw error; Files.delete(directory); return FileVisitResult.CONTINUE;
                }
            }); } catch (IOException | RuntimeException | LinkageError cleanupFailure) { throw new ProbeFailure(Stage.CLEANUP, cleanupFailure); }
        }
        } catch (ProbeFailure failure) { throw failure; }
          catch (IOException | RuntimeException | LinkageError failure) { throw new ProbeFailure(stage, failure); }
    }
    private static long linkCount(Path path) throws IOException {
        Object value = Files.getAttribute(path, "unix:nlink", LinkOption.NOFOLLOW_LINKS);
        if (!(value instanceof Number)) throw new IOException("Missing Unix link count"); return ((Number) value).longValue();
    }
}
