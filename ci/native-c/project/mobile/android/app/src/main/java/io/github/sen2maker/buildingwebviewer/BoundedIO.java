package io.github.sen2maker.buildingwebviewer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
/** Existing bookmark-reader limit, without any legacy update authority. */
final class BoundedIO {
    private BoundedIO() { }
    static String readLimited(InputStream input, int maximum) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int n;
        while ((n = input.read(buffer)) != -1) { if (n > maximum - out.size()) throw new IOException("Metadata too large"); out.write(buffer, 0, n); }
        return out.toString("UTF-8");
    }
}
