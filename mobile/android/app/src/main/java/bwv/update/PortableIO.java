package bwv.update;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
final class PortableIO {
    private PortableIO() { }
    static byte[] readAtMost(InputStream input, int maximum) throws IOException {
        if (maximum < 0) throw new IllegalArgumentException("Negative limit");
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.min(maximum, 8192));
        byte[] bytes = new byte[Math.min(Math.max(maximum, 1), 8192)];
        while (out.size() < maximum) {
            int n = input.read(bytes, 0, Math.min(bytes.length, maximum - out.size()));
            if (n < 0) break;
            if (n == 0) { int one = input.read(); if (one < 0) break; out.write(one); } else out.write(bytes, 0, n);
        }
        return out.toByteArray();
    }
}
