package bwv.update;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Bounded UTF-8 JSON for protocols whose numbers are signed 64-bit integers only. */
public final class StrictJson {
    private StrictJson() { }
    public static final int HARD_MAX_BYTES = 32 * 1024 * 1024;
    public static final int HARD_MAX_DEPTH = 64;

    public static final class ParseException extends IOException {
        private static final long serialVersionUID = 1L;
        public ParseException(String message) { super(message); }
    }

    /**
     * Rejects duplicate decoded keys, malformed Unicode, noninteger numbers and
     * trailing content. Maps/lists are immutable. Null, Boolean, String and Long
     * are the only scalar types. The byte bound also bounds strings and nodes.
     * The root container has depth one; scalar values add no nesting depth.
     */
    public static Object parse(byte[] input, int maxBytes, int maxDepth) throws ParseException {
        if (input == null || maxBytes < 1 || maxBytes > HARD_MAX_BYTES
                || maxDepth < 1 || maxDepth > HARD_MAX_DEPTH) throw error("Invalid JSON limits/input");
        if (input.length > maxBytes) throw error("JSON exceeds byte limit");
        String decoded;
        try {
            decoded = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(input)).toString();
        } catch (CharacterCodingException malformed) {
            throw error("Malformed UTF-8");
        }
        Parser parser = new Parser(decoded, maxDepth);
        Object result = parser.value(0);
        parser.whitespace();
        if (parser.position != decoded.length()) throw error("Trailing JSON content");
        return result;
    }

    public static Map<String, Object> object(Object value) throws ParseException {
        if (!(value instanceof Map<?, ?> map)) throw error("Expected object");
        for (Object key : map.keySet()) if (!(key instanceof String)) throw error("Expected string object key");
        @SuppressWarnings("unchecked") Map<String, Object> result = (Map<String, Object>) map;
        return result;
    }
    public static List<Object> array(Object value) throws ParseException {
        if (!(value instanceof List<?> list)) throw error("Expected array");
        @SuppressWarnings("unchecked") List<Object> result = (List<Object>) list;
        return result;
    }
    public static String string(Object value) throws ParseException {
        if (!(value instanceof String result)) throw error("Expected string");
        return result;
    }
    public static long integer(Object value) throws ParseException {
        if (!(value instanceof Long result)) throw error("Expected integer");
        return result;
    }
    public static int int32(Object value) throws ParseException {
        long result = integer(value);
        if (result < Integer.MIN_VALUE || result > Integer.MAX_VALUE) throw error("Integer outside int32 range");
        return (int) result;
    }
    public static String string(Map<String, Object> map, String key) throws ParseException { return string(map.get(key)); }
    public static long integer(Map<String, Object> map, String key) throws ParseException { return integer(map.get(key)); }
    public static int int32(Map<String, Object> map, String key) throws ParseException { return int32(map.get(key)); }
    public static void exactKeys(Map<String, Object> map, String... keys) throws ParseException {
        if (!map.keySet().equals(Set.of(keys))) throw error("Unknown or missing object field");
    }
    private static ParseException error(String message) { return new ParseException(message); }

    private static final class Parser {
        private final String text;
        private final int maxDepth;
        private int position;
        private Parser(String text, int maxDepth) { this.text = text; this.maxDepth = maxDepth; }
        private void whitespace() {
            while (position < text.length()) {
                char c = text.charAt(position);
                if (c != ' ' && c != '\t' && c != '\r' && c != '\n') return;
                position++;
            }
        }
        private Object value(int depth) throws ParseException {
            whitespace();
            if (position == text.length()) throw error("Missing JSON value");
            return switch (text.charAt(position)) {
                case '{' -> objectValue(depth + 1);
                case '[' -> arrayValue(depth + 1);
                case '"' -> stringValue();
                case 't' -> literal("true", Boolean.TRUE);
                case 'f' -> literal("false", Boolean.FALSE);
                case 'n' -> literal("null", null);
                default -> number();
            };
        }
        private Object literal(String literal, Object value) throws ParseException {
            if (!text.startsWith(literal, position)) throw error("Invalid JSON literal");
            position += literal.length();
            return value;
        }
        private Map<String, Object> objectValue(int depth) throws ParseException {
            if (depth > maxDepth) throw error("JSON exceeds depth limit");
            position++;
            whitespace();
            Map<String, Object> result = new LinkedHashMap<>();
            if (take('}')) return Collections.unmodifiableMap(result);
            while (true) {
                whitespace();
                String key = stringValue();
                if (result.containsKey(key)) throw error("Duplicate JSON key");
                whitespace();
                expect(':');
                result.put(key, value(depth));
                whitespace();
                if (take('}')) return Collections.unmodifiableMap(result);
                expect(',');
            }
        }
        private List<Object> arrayValue(int depth) throws ParseException {
            if (depth > maxDepth) throw error("JSON exceeds depth limit");
            position++;
            whitespace();
            List<Object> result = new ArrayList<>();
            if (take(']')) return Collections.unmodifiableList(result);
            while (true) {
                result.add(value(depth));
                whitespace();
                if (take(']')) return Collections.unmodifiableList(result);
                expect(',');
            }
        }
        private String stringValue() throws ParseException {
            expect('"');
            StringBuilder result = new StringBuilder();
            while (position < text.length()) {
                char c = text.charAt(position++);
                if (c == '"') return result.toString();
                if (c < 0x20) throw error("Control character in JSON string");
                if (c == '\\') {
                    if (position == text.length()) throw error("Incomplete JSON escape");
                    c = text.charAt(position++);
                    switch (c) {
                        case '"', '\\', '/' -> result.append(c);
                        case 'b' -> result.append('\b');
                        case 'f' -> result.append('\f');
                        case 'n' -> result.append('\n');
                        case 'r' -> result.append('\r');
                        case 't' -> result.append('\t');
                        case 'u' -> {
                            char first = hexChar();
                            if (Character.isHighSurrogate(first)) {
                                expect('\\'); expect('u');
                                char second = hexChar();
                                if (!Character.isLowSurrogate(second)) throw error("Unpaired Unicode surrogate");
                                result.append(first).append(second);
                            } else {
                                if (Character.isLowSurrogate(first)) throw error("Unpaired Unicode surrogate");
                                result.append(first);
                            }
                        }
                        default -> throw error("Invalid JSON escape");
                    }
                } else if (Character.isHighSurrogate(c)) {
                    if (position == text.length() || !Character.isLowSurrogate(text.charAt(position)))
                        throw error("Unpaired Unicode surrogate");
                    result.append(c).append(text.charAt(position++));
                } else {
                    if (Character.isLowSurrogate(c)) throw error("Unpaired Unicode surrogate");
                    result.append(c);
                }
            }
            throw error("Unterminated JSON string");
        }
        private char hexChar() throws ParseException {
            if (text.length() - position < 4) throw error("Incomplete Unicode escape");
            int value = 0;
            for (int i = 0; i < 4; i++) {
                char c = text.charAt(position++);
                int digit = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10
                        : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1;
                if (digit < 0) throw error("Invalid Unicode escape");
                value = value * 16 + digit;
            }
            return (char) value;
        }
        private Long number() throws ParseException {
            int start = position;
            take('-');
            if (position == text.length()) throw error("Invalid JSON integer");
            if (take('0')) {
                if (position < text.length() && digit(text.charAt(position))) throw error("Leading zero in JSON integer");
            } else {
                if (text.charAt(position) < '1' || text.charAt(position) > '9') throw error("Invalid JSON integer");
                while (position < text.length() && digit(text.charAt(position))) position++;
            }
            if (position < text.length()) {
                char c = text.charAt(position);
                if (c == '.' || c == 'e' || c == 'E') throw error("Only integer JSON numbers are permitted");
            }
            if (position - start > 20) throw error("JSON integer outside int64 range");
            String number = text.substring(start, position);
            if (number.equals("-0")) throw error("Negative zero is not a protocol integer");
            try { return Long.valueOf(number); }
            catch (NumberFormatException bad) { throw error("JSON integer outside int64 range"); }
        }
        private static boolean digit(char c) { return c >= '0' && c <= '9'; }
        private boolean take(char c) {
            if (position < text.length() && text.charAt(position) == c) { position++; return true; }
            return false;
        }
        private void expect(char c) throws ParseException {
            if (!take(c)) throw error("Unexpected JSON token");
        }
    }
}
