package io.github.sen2maker.buildingwebviewer;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;
/** Platform-only recovery: no bridge, update store, network or resource-cache cleanup. */
public final class RecoveryActivity extends Activity {
    private static final int SAVE_BACKUP = 4101;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private TextView status; private File pendingBackup; private volatile boolean busy;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout column = new LinearLayout(this); column.setOrientation(LinearLayout.VERTICAL); column.setPadding(24, 32, 24, 24);
        status = new TextView(this); status.setText("本地恢复与导出 / Local recovery and export\n" + ((BwvApplication)getApplication()).failure() + "\nNo projects or trust state will be deleted. Export requires your document-provider selection."); column.addView(status);
        ScrollView scroll = new ScrollView(this); scroll.addView(column); setContentView(scroll);
        io.execute(() -> {
            try {
                ProjectStore store = ((BwvApplication)getApplication()).projects(); File[] manifests = store.projects.listFiles((d, n) -> n.endsWith(".json"));
                if (manifests == null) throw new IOException("Project list unavailable");
                for (File manifest : manifests) {
                    String id = manifest.getName().substring(0, manifest.getName().length() - 5);
                    try {
                        JSONObject project = store.get(id); String title = project.optString("name", id);
                        runOnUiThread(() -> { if (isFinishing() || isDestroyed()) return; Button button = new Button(this); button.setText("导出 / Export: " + title); button.setOnClickListener(v -> prepareBackup(store, id)); column.addView(button); });
                    } catch (Exception error) { note("Unreadable manifest retained: " + id + ". No project was removed."); }
                }
                if (manifests.length == 0) note("No local projects in this App package. The old App's data is separate.");
            } catch (Exception error) { note("Recovery scan failed: " + error.getMessage()); }
        });
    }
    private void prepareBackup(ProjectStore store, String id) {
        if (busy) return; busy = true; note("Preparing a local backup copy, without changing project data.");
        io.execute(() -> {
            try {
                File directory = new File(getCacheDir(), "exports/recovery-" + java.util.UUID.randomUUID());
                File backup = store.backup(id, directory);
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) { busy = false; return; }
                    pendingBackup = backup;
                    Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/zip").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, backup.getName());
                    startActivityForResult(save, SAVE_BACKUP);
                });
            } catch (Exception error) { busy = false; note("Backup failed; original retained: " + error.getMessage()); }
        });
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != SAVE_BACKUP) return;
        File backup = pendingBackup; pendingBackup = null;
        if (result != RESULT_OK || data == null || data.getData() == null || backup == null) { busy = false; note("Export not completed. No source data deleted."); return; }
        Uri destination = data.getData();
        io.execute(() -> {
            try {
                byte[] expected = digest(backup);
                ParcelFileDescriptor descriptor = getContentResolver().openFileDescriptor(destination, "w");
                if (descriptor == null) throw new IOException("Cannot open export destination");
                try (FileInputStream input = new FileInputStream(backup); ParcelFileDescriptor.AutoCloseOutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(descriptor)) {
                        byte[] buffer = new byte[65536]; int n; while ((n = input.read(buffer)) >= 0) if (n > 0) output.write(buffer, 0, n);
                        output.flush();
                        try { output.getFD().sync(); } catch (IOException unsupported) { note("Provider does not confirm durable flush; readback still required."); }
                }
                try (InputStream check = getContentResolver().openInputStream(destination)) {
                    if (check == null) throw new IOException("Provider readback unavailable");
                    MessageDigest hash = MessageDigest.getInstance("SHA-256"); byte[] buffer = new byte[65536]; long bytes = 0; int n;
                    while ((n = check.read(buffer)) >= 0) { if (n == 0) continue; bytes += n; if (bytes > backup.length()) throw new IOException("Export readback size mismatch"); hash.update(buffer, 0, n); }
                    if (bytes != backup.length() || !MessageDigest.isEqual(expected, hash.digest())) throw new IOException("Export readback checksum mismatch");
                }
                note("Export copy readback verified. Keep the old App until import/restoration is also verified. This does not prove provider power-loss durability.");
            } catch (Exception error) { note("Export not fully verified: " + error.getMessage() + ". Original project and local backup retained."); }
            finally { busy = false; }
        });
    }
    private static byte[] digest(File file) throws Exception { MessageDigest digest = MessageDigest.getInstance("SHA-256"); try (InputStream in = new FileInputStream(file)) { byte[] b = new byte[65536]; int n; while ((n = in.read(b)) >= 0) if (n > 0) digest.update(b, 0, n); } return digest.digest(); }
    private void note(String text) { runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) status.append("\n" + text); }); }
    @Override public void onDestroy() { io.shutdown(); super.onDestroy(); }
}
