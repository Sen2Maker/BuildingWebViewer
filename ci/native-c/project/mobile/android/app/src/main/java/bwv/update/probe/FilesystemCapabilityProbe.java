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
        public final boolean fileNoFollow;
        public final boolean directoryNoFollow;
        public final boolean exclusiveCreation;
        public final boolean atomicRename;
        public final boolean directoryForce;
        private Result(String providerClass, String directoryStreamClass, boolean secureTraversal,
                boolean unixLinkCount, boolean fileNoFollow, boolean directoryNoFollow,
                boolean exclusiveCreation, boolean atomicRename, boolean directoryForce) {
            this.providerClass = providerClass; this.directoryStreamClass = directoryStreamClass;
            this.secureTraversal = secureTraversal; this.unixLinkCount = unixLinkCount;
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
    /** Caller supplies application filesDir, not an untrusted URI or external-storage path. */
    public static Result run(Path applicationFilesDir) throws IOException {
        if (!applicationFilesDir.isAbsolute() || !applicationFilesDir.normalize().equals(applicationFilesDir)
                || Files.isSymbolicLink(applicationFilesDir) || !Files.isDirectory(applicationFilesDir, LinkOption.NOFOLLOW_LINKS))
            throw new IOException("Expected real application-private files directory");
        Path own = Files.createTempDirectory(applicationFilesDir, "bwv-fs-probe-");
        try {
            Path left = Files.createDirectory(own.resolve("left")), right = Files.createDirectory(own.resolve("right"));
            Path original = left.resolve("original"); byte[] expected = {1, 2, 3, 4};
            try (FileChannel output = FileChannel.open(original, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) {
                ByteBuffer bytes = ByteBuffer.wrap(expected); while (bytes.hasRemaining()) output.write(bytes); output.force(true);
            }
            boolean exclusive;
            try (FileChannel unexpected = FileChannel.open(original, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                exclusive = !unexpected.isOpen();
            } catch (java.nio.file.FileAlreadyExistsException expectedFailure) { exclusive = true; }
            boolean links = false;
            try {
                Path hard = right.resolve("hardlink"); Files.createLink(hard, original);
                links = linkCount(original) == 2 && linkCount(hard) == 2;
                Files.delete(hard); links &= linkCount(original) == 1;
            } catch (UnsupportedOperationException unsupported) { /* capability remains false */ }
            Path fileLink = left.resolve("file-link"), directoryLink = left.resolve("directory-link");
            Files.createSymbolicLink(fileLink, original); Files.createSymbolicLink(directoryLink, right);
            boolean fileNoFollow = false, directoryNoFollow = false, secure = false;
            String streamClass;
            try (DirectoryStream<Path> directory = Files.newDirectoryStream(left)) {
                streamClass = directory.getClass().getName();
                if (directory instanceof SecureDirectoryStream<?>) {
                    @SuppressWarnings("unchecked") SecureDirectoryStream<Path> handle = (SecureDirectoryStream<Path>) directory;
                    Set<java.nio.file.OpenOption> options = new HashSet<>(); options.add(StandardOpenOption.READ); options.add(LinkOption.NOFOLLOW_LINKS);
                    try (var channel = handle.newByteChannel(Paths.get("original"), options)) {
                        ByteBuffer read = ByteBuffer.allocate(4); while (read.hasRemaining()) { if (channel.read(read) == -1) break; }
                        secure = Arrays.equals(read.array(), expected);
                    }
                    try (var unexpected = handle.newByteChannel(Paths.get("file-link"), options)) {
                        fileNoFollow = !unexpected.isOpen();
                    } catch (IOException expectedFailure) { fileNoFollow = true; }
                    try (var unexpected = handle.newDirectoryStream(Paths.get("directory-link"), LinkOption.NOFOLLOW_LINKS)) {
                        unexpected.iterator(); directoryNoFollow = false;
                    } catch (IOException expectedFailure) { directoryNoFollow = true; }
                }
            }
            Path moved = right.resolve("renamed"); boolean atomic;
            try {
                Files.move(original, moved, StandardCopyOption.ATOMIC_MOVE);
                atomic = !Files.exists(original, LinkOption.NOFOLLOW_LINKS) && Arrays.equals(Files.readAllBytes(moved), expected);
            } catch (java.nio.file.AtomicMoveNotSupportedException unsupported) { atomic = false; }
            boolean directoryForce;
            try {
                for (Path directory : new Path[]{left, right, own}) {
                    try (FileChannel descriptor = FileChannel.open(directory, StandardOpenOption.READ)) { descriptor.force(true); }
                }
                directoryForce = true;
            } catch (IOException | UnsupportedOperationException unsupported) { directoryForce = false; }
            return new Result(applicationFilesDir.getFileSystem().provider().getClass().getName(), streamClass,
                    secure, links, fileNoFollow, directoryNoFollow, exclusive, atomic, directoryForce);
        } finally {
            // Only the just-created probe tree. Never follows its intentionally created symbolic links.
            Files.walkFileTree(own, new SimpleFileVisitor<Path>() {
                @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException { Files.delete(file); return FileVisitResult.CONTINUE; }
                @Override public FileVisitResult postVisitDirectory(Path directory, IOException error) throws IOException {
                    if (error != null) throw error; Files.delete(directory); return FileVisitResult.CONTINUE;
                }
            });
        }
    }
    private static long linkCount(Path path) throws IOException {
        Object value = Files.getAttribute(path, "unix:nlink", LinkOption.NOFOLLOW_LINKS);
        if (!(value instanceof Number)) throw new IOException("Missing Unix link count"); return ((Number) value).longValue();
    }
}
