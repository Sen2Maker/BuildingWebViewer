package bwv.update;
/** Narrow Android API30-compatible lowercase hexadecimal codec. */
final class PortableHex {
    private PortableHex() { }
    static byte[] parse(String text) {
        if (text == null || (text.length() & 1) != 0) throw new IllegalArgumentException("Invalid hex");
        byte[] out = new byte[text.length() / 2];
        for (int i = 0; i < out.length; i++) {
            int a = Character.digit(text.charAt(i * 2), 16), b = Character.digit(text.charAt(i * 2 + 1), 16);
            if (a < 0 || b < 0) throw new IllegalArgumentException("Invalid hex");
            out[i] = (byte) ((a << 4) | b);
        }
        return out;
    }
    static String format(byte[] bytes) {
        char[] out = new char[bytes.length * 2]; String digits = "0123456789abcdef";
        for (int i = 0; i < bytes.length; i++) { out[i * 2] = digits.charAt((bytes[i] & 255) >>> 4); out[i * 2 + 1] = digits.charAt(bytes[i] & 15); }
        return new String(out);
    }
}
