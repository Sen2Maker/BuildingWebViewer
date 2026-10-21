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
    private static final int FIRST_BACKUP_REQUEST = 4101, LAST_BACKUP_REQUEST = 65535;
    private static final String NEXT_REQUEST_STATE = "recoveryBackupNext", PENDING_REQUEST_STATE = "recoveryBackupPending";
    private static final class BackupAttempt {
        final int request; final File backup; boolean delivered;
        BackupAttempt(int request, File backup) { this.request = request; this.backup = backup; }
    }
    private int nextBackupRequest = FIRST_BACKUP_REQUEST, preparingRequest;
    private BackupAttempt pendingBackup;
    private boolean backupClosed;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private TextView status; private boolean busy;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout column = new LinearLayout(this); column.setOrientation(LinearLayout.VERTICAL); column.setPadding(24, 32, 24, 24);
        status = new TextView(this); status.setText("本地恢复与导出 / Local recovery and export\n" + ((BwvApplication)getApplication()).failure() + "\nNo projects or trust state will be deleted. Export requires your document-provider selection.\n若系统选择操作中断或恢复次数已达安全上限，请先退出仍打开的系统选择器，再关闭本次 App 任务并从图标重新打开。可先在这里导出备份；不要清除存储或卸载。\nIf a system operation was interrupted or its safe restoration limit was reached, close any open picker, close this App task, then reopen from its icon. You can export here first. Do not clear App storage or uninstall."); column.addView(status);
        if(BuildConfig.DIAGNOSTIC_ENABLED){Button test=new Button(this);test.setText("一键原生自检 / Native self-test");test.setOnClickListener(v->startActivity(new Intent(this,NativeSelfTestActivity.class)));column.addView(test);}
        ScrollView scroll = new ScrollView(this); scroll.addView(column); setContentView(scroll);
        restoreBackupState(saved);
        io.execute(() -> {
            try {
                ProjectStore store = ((BwvApplication)getApplication()).projects(); File[] manifests = store.projects.listFiles((d, n) -> n.endsWith(".json") || n.endsWith(".json.bak"));
                if (manifests == null) throw new IOException("Project list unavailable");
                java.util.Set<String> projectIds = new java.util.TreeSet<>();
                for (File manifest : manifests) { String name = manifest.getName(); if (name.endsWith(".bak")) name = name.substring(0,name.length()-4); projectIds.add(name.substring(0,name.length()-5)); }
                for (String id : projectIds) {
                    try {
                        JSONObject project = store.get(id); String title = project.optString("name", id);
                        runOnUiThread(() -> { if (isFinishing() || isDestroyed()) return; Button button = new Button(this); button.setText("导出 / Export: " + title); button.setOnClickListener(v -> prepareBackup(store, id)); column.addView(button); });
                    } catch (Exception error) { note("Unreadable manifest retained: " + id + ". No project was removed."); }
                }
                if (manifests.length == 0) note("No local projects in this App package. The old App's data is separate.");
            } catch (Exception error) { note("Recovery scan failed: " + error.getMessage()); }
        });
    }
    /** Codes are never reused within a saved Activity lineage, including canceled attempts. */
    private void restoreBackupState(Bundle saved) {
        if (saved == null) return;
        try {
            Object next = saved.get(NEXT_REQUEST_STATE), pending = saved.get(PENDING_REQUEST_STATE);
            if (!(next instanceof String) || !(pending instanceof String)) throw new IllegalStateException("Missing backup routing state");
            String n = (String)next, p = (String)pending;
            if (!n.matches("[1-9][0-9]{0,4}") || !p.matches("0|[1-9][0-9]{0,4}")) throw new IllegalStateException("Invalid backup routing state");
            int parsedNext = Integer.parseInt(n), parsedPending = Integer.parseInt(p);
            if (parsedNext < FIRST_BACKUP_REQUEST || parsedNext > LAST_BACKUP_REQUEST + 1 ||
                (parsedPending != 0 && (parsedPending < FIRST_BACKUP_REQUEST || parsedPending >= parsedNext)))
                throw new IllegalStateException("Invalid backup routing bounds");
            nextBackupRequest = parsedNext;
            if (parsedPending != 0) { pendingBackup = new BackupAttempt(parsedPending, null); busy = true; }
        } catch (RuntimeException invalid) {
            backupClosed = true; busy = true;
            note("Backup routing state unavailable. Close any picker, close this App task, and reopen. No source data deleted.");
        }
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        // Save only routing, never project identity, file authority or a destination URI.
        // Preparation is conservatively orphaned too: it may launch after this snapshot.
        state.putString(NEXT_REQUEST_STATE, backupClosed ? "closed" : Integer.toString(nextBackupRequest));
        int outstanding = preparingRequest != 0 ? preparingRequest :
            pendingBackup != null && !pendingBackup.delivered ? pendingBackup.request : 0;
        state.putString(PENDING_REQUEST_STATE, Integer.toString(outstanding));
    }
    private void settleBackup(BackupAttempt attempt) {
        if (pendingBackup != attempt) return;
        pendingBackup = null; busy = false;
    }
    private void prepareBackup(ProjectStore store, String id) {
        if (backupClosed || busy) return;
        if (nextBackupRequest > LAST_BACKUP_REQUEST) {
            note("Backup routing limit reached. Close any picker, close this App task, and reopen. No source data deleted."); return;
        }
        final int request = nextBackupRequest++;
        preparingRequest = request; busy = true;
        note("Preparing a local backup copy, without changing project data.");
        try { io.execute(() -> {
            try {
                File directory = new File(getCacheDir(), "exports/recovery-" + java.util.UUID.randomUUID());
                File backup = store.backup(id, directory);
                runOnUiThread(() -> {
                    if (backupClosed || isFinishing() || isDestroyed() || preparingRequest != request) return;
                    preparingRequest = 0;
                    BackupAttempt attempt = new BackupAttempt(request, backup); pendingBackup = attempt;
                    Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/zip").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, backup.getName());
                    try { startActivityForResult(save, request); }
                    catch (RuntimeException uncertain) {
                        // Launch may have had a side effect. Retain its routing slot, discard any late result.
                        if (pendingBackup == attempt && !attempt.delivered) pendingBackup = new BackupAttempt(request, null);
                        note("Backup picker launch uncertain. Close any picker, close this App task, and reopen. Local backup retained.");
                    }
                });
            } catch (Exception error) { backupPreparationFailed(request, error); }
        }); } catch (RuntimeException rejected) { backupPreparationFailed(request, rejected); }
    }
    private void backupPreparationFailed(int request, Exception error) {
        runOnUiThread(() -> {
            if (backupClosed || preparingRequest != request) return;
            preparingRequest = 0; busy = false;
            note("Backup failed; original retained: " + error.getMessage());
        });
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        final BackupAttempt attempt = pendingBackup;
        if (backupClosed || attempt == null || attempt.request != request || attempt.delivered) return;
        attempt.delivered = true;
        final File backup = attempt.backup;
        if (result != RESULT_OK || data == null || data.getData() == null || backup == null) {
            settleBackup(attempt); note("Export not completed. No source data deleted."); return;
        }
        final Uri destination = data.getData();
        try { io.execute(() -> {
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
            finally { runOnUiThread(() -> settleBackup(attempt)); }
        }); } catch (RuntimeException rejected) {
            settleBackup(attempt); note("Export not started. Original project and local backup retained.");
        }
    }
    private static byte[] digest(File file) throws Exception { MessageDigest digest = MessageDigest.getInstance("SHA-256"); try (InputStream in = new FileInputStream(file)) { byte[] b = new byte[65536]; int n; while ((n = in.read(b)) >= 0) if (n > 0) digest.update(b, 0, n); } return digest.digest(); }
    private void note(String text) { runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) status.append("\n" + text); }); }
    @Override public void onDestroy() { backupClosed = true; preparingRequest = 0; pendingBackup = null; io.shutdown(); super.onDestroy(); }
}
