package io.github.sen2maker.buildingwebviewer;
import android.content.Context;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import org.json.JSONArray;
import org.json.JSONObject;
/** Read-only current-format check. Never silently skips a future or corrupt manifest. */
final class ProjectReaderReadiness {
    private ProjectReaderReadiness() { }
    static void requireCurrentReaders(Context context) throws Exception {
        File directory = new File(context.getFilesDir(), "bwv/projects");
        if (!directory.exists()) return;
        if (!Files.isDirectory(directory.toPath(), LinkOption.NOFOLLOW_LINKS)) throw new IOException("Project directory is not a regular private directory");
        File[] manifests = directory.listFiles();
        if (manifests == null || manifests.length > 20000) throw new IOException("Project manifest scan unavailable or exceeds bound");
        File objectRoot = new File(context.getFilesDir(), "bwv/objects");
        if (!Files.isDirectory(directory.getParentFile().toPath(), LinkOption.NOFOLLOW_LINKS) || !Files.isDirectory(objectRoot.toPath(), LinkOption.NOFOLLOW_LINKS)) throw new IOException("Project root is not private storage");
        for (File file : manifests) {
            String name = file.getName();
            if (name.endsWith(".json.bak")) name = name.substring(0, name.length() - 4);
            else if (!name.endsWith(".json")) continue;
            if (!Files.isRegularFile(file.toPath(), LinkOption.NOFOLLOW_LINKS)) throw new IOException("Unsupported project manifest file");
            String id = name.substring(0, name.length() - 5);
            if (!id.matches("[a-f0-9-]{36}")) throw new IOException("Invalid project ID");
            // Observe AtomicFile backup precedence without calling openRead(), which can rename/delete.
            File backup = new File(directory, name + ".bak");
            File selected = backup.exists() ? backup : new File(directory, name);
            JSONObject project;
            try (java.io.InputStream input = Files.newInputStream(selected.toPath(), LinkOption.NOFOLLOW_LINKS)) { project = new JSONObject(ProjectStore.readText(input)); }
            if (project.getInt("schemaVersion") != 1 || !id.equals(project.getString("id"))) throw new IOException("Project requires an unsupported reader");
            project.getString("name"); project.getJSONObject("states");
            JSONArray files = project.getJSONArray("files");
            for (int i = 0; i < files.length(); i++) {
                JSONObject item = files.getJSONObject(i); ArchivePolicy.path(item.getString("path"));
                String key = item.getString("key");
                if (!key.matches("[a-f0-9]{64}")) throw new IOException("Invalid object key");
                File object = new File(objectRoot, key);
                if (!Files.isRegularFile(object.toPath(), LinkOption.NOFOLLOW_LINKS) || item.getLong("size") != object.length()) throw new IOException("Project object missing or changed");
            }
        }
    }
}
