package io.github.sen2maker.buildingwebviewer;
import bwv.diagnostics.DiagnosticRunLease;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.json.JSONArray;
import org.json.JSONObject;
/** Uses the real unchanged storage/import classes on fixed, tiny, private fixtures only. */
final class DiagnosticStoreProbe {
    private DiagnosticStoreProbe() { }
    static JSONObject run(android.content.Context context, DiagnosticRunLease.Scratch scratch) throws Exception {
        scratch.checkCancelled();
        Path first = scratch.reserveTree("store-a", 128 * 1024, 64);
        Path second = scratch.reserveTree("store-b", 128 * 1024, 64);
        DiagnosticSandboxContext a = new DiagnosticSandboxContext(context, first);
        DiagnosticSandboxContext b = new DiagnosticSandboxContext(context, second);
        ProjectStore original = new ProjectStore(a); ProjectStore restored = new ProjectStore(b);
        for (File file : new File[]{original.root,original.objects,original.projects,original.inbox}) a.check(file);
        for (File file : new File[]{restored.root,restored.objects,restored.projects,restored.inbox}) b.check(file);
        if (a.getApplicationContext() != a || b.getApplicationContext() != b) throw new IllegalStateException("Context escaped");
        byte[] points = "0 0 0\n1 2 3\n".getBytes(StandardCharsets.UTF_8);
        scratch.createDirectory("fixtures");
        Path source = scratch.write("fixtures/tiny.xyz", points);
        JSONObject project = original.create("Isolated diagnostic fixture"); String id = project.getString("id");
        JSONObject object = original.object(source.toFile(), "tiny.xyz"); project.getJSONArray("files").put(object); original.put(project);
        original.saveState(id,"pointcloud",new JSONObject().put("diagnosticFixture",true).put("schema",1));
        ProjectStore reopened = new ProjectStore(a); JSONObject observed = reopened.get(id);
        if (!observed.getJSONObject("states").getJSONObject("pointcloud").getBoolean("diagnosticFixture")) throw new IllegalStateException("State did not reopen");
        if (!java.util.Arrays.equals(points,Files.readAllBytes(reopened.objectFile(object.getString("key")).toPath()))) throw new IllegalStateException("Object bytes changed");
        scratch.checkCancelled();
        File backup = original.backup(id,new File(a.getCacheDir(),"exports")); a.check(backup);
        // Actual ArchiveImporter/libarchive executes inside restoreBackup, not a fake ZIP decoder.
        JSONObject snapshot = restored.restoreBackup(backup,new File(b.getCacheDir(),"restore"));
        JSONArray files = snapshot.getJSONArray("files");
        if (files.length()!=1 || !files.getJSONObject(0).getString("key").equals(object.getString("key")) || !snapshot.getJSONObject("states").getJSONObject("pointcloud").getBoolean("diagnosticFixture")) throw new IllegalStateException("Backup restore mismatch");
        JSONObject target = restored.create("Restored diagnostic fixture"); target.put("files",files).put("states",snapshot.getJSONObject("states"));restored.put(target);
        if (!java.util.Arrays.equals(points,Files.readAllBytes(restored.objectFile(object.getString("key")).toPath()))) throw new IllegalStateException("Restored object changed");
        scratch.checkCancelled(); scratch.validate();
        // Cleanup assertion uses the unchanged store's object reclamation on a scratch-only orphan.
        Path orphan = scratch.write("store-a/files/bwv/objects/"+"f".repeat(64),new byte[]{7});
        if (original.cleanup()!=1 || Files.exists(orphan)) throw new IllegalStateException("Scratch orphan cleanup failed");
        scratch.validate();
        return new JSONObject().put("scratchRootChecked",true).put("contextFilesIsolated",true).put("contextCacheIsolated",true).put("applicationContextIsolated",true).put("created",true).put("reopened",true).put("stateRoundtrip",true).put("backupRestored",true).put("cleanupVerified",true);
    }
}
