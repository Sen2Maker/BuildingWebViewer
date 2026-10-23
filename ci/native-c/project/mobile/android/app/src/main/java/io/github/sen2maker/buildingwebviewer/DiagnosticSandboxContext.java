package io.github.sen2maker.buildingwebviewer;
import android.content.Context;
import android.content.ContextWrapper;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
/** Fixed-fixture context only. Never instantiate the store with a production Context first. */
final class DiagnosticSandboxContext extends ContextWrapper {
    private final File files, cache, data;
    DiagnosticSandboxContext(Context base, Path reservedRoot) throws IOException {
        super(base);
        Path root = reservedRoot.toRealPath(LinkOption.NOFOLLOW_LINKS);
        if (Files.isSymbolicLink(root)) throw new IOException("Linked diagnostic root");
        data = root.toFile(); files = root.resolve("files").toFile(); cache = root.resolve("cache").toFile();
        if (!files.mkdir() || !cache.mkdir()) throw new IOException("Diagnostic directories must be fresh");
        check(files); check(cache);
    }
    void check(File path) throws IOException {
        String root = data.getCanonicalPath() + File.separator;
        if (!path.getCanonicalPath().startsWith(root)) throw new IOException("Diagnostic context escape");
    }
    @Override public File getFilesDir() { return files; }
    @Override public File getCacheDir() { return cache; }
    @Override public File getDataDir() { return data; }
    @Override public Context getApplicationContext() { return this; }
    @Override public File getNoBackupFilesDir() { throw new UnsupportedOperationException("Not part of fixed diagnostic fixtures"); }
    @Override public File getExternalFilesDir(String type) { throw new UnsupportedOperationException("No diagnostic external storage"); }
    @Override public File getExternalCacheDir() { throw new UnsupportedOperationException("No diagnostic external storage"); }
    @Override public File getDatabasePath(String name) { throw new UnsupportedOperationException("No diagnostic databases"); }
    @Override public android.content.SharedPreferences getSharedPreferences(String name, int mode) { throw new UnsupportedOperationException("No diagnostic preferences"); }
}
