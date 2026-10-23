package io.github.sen2maker.buildingwebviewer;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import bwv.update.probe.FilesystemCapabilityProbe;
import java.io.IOException;
import java.nio.file.Path;
/** Uses typed Android errno, never localized exception text, for optional fixture denial. */
final class AndroidFilesystemProbe {
    private AndroidFilesystemProbe() { }
    static FilesystemCapabilityProbe.Result run(Path root) throws IOException {
        return FilesystemCapabilityProbe.run(root, (link, existing) -> {
            try { Os.link(existing.toString(), link.toString()); return FilesystemCapabilityProbe.LinkCreation.CREATED; }
            catch (ErrnoException failure) {
                if (failure.errno == OsConstants.EPERM || failure.errno == OsConstants.EACCES)
                    return FilesystemCapabilityProbe.LinkCreation.ACCESS_DENIED;
                throw new IOException("Hardlink fixture syscall failed", failure);
            }
        });
    }
}
