package com.getcapacitor;

import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Pure streaming range logic. Never uses InputStream.available() as a length. */
public final class BwvDataOnlyResponse {
    private static final Pattern RANGE = Pattern.compile("bytes=([0-9]*)-([0-9]*)");
    public final String mimeType;
    public final int status;
    public final String reason;
    public final Map<String, String> headers;
    public final InputStream body;

    private BwvDataOnlyResponse(String mimeType, int status, Map<String, String> headers, InputStream body) {
        this.mimeType = mimeType;
        this.status = status;
        this.reason = reason(status);
        this.headers = headers;
        this.body = body;
    }

    public static BwvDataOnlyResponse empty(int status) {
        Map<String, String> headers = BwvDataOnlyRoutes.headers();
        headers.put("Content-Length", "0");
        if (status == 405) headers.put("Allow", "GET, HEAD");
        return new BwvDataOnlyResponse("application/octet-stream", status, headers, new ByteArrayInputStream(new byte[0]));
    }

    public static BwvDataOnlyResponse open(InputStream stream, long length, String mime,
                                           String method, String range) throws IOException {
        if (stream == null) return empty(404);
        Map<String, String> headers = BwvDataOnlyRoutes.headers();
        try {
            if ("HEAD".equals(method)) {
                stream.close();
                if (length >= 0) headers.put("Content-Length", Long.toString(length));
                return new BwvDataOnlyResponse(mime, 200, headers, new ByteArrayInputStream(new byte[0]));
            }
            if (range != null) {
                Matcher matcher = RANGE.matcher(range.trim());
                if (!matcher.matches() || (matcher.group(1).isEmpty() && matcher.group(2).isEmpty())) {
                    return unsatisfied(stream, length);
                }
                // Validate numbers even when a provider cannot tell us its length.
                long start = matcher.group(1).isEmpty() ? -1 : Long.parseLong(matcher.group(1));
                long end = matcher.group(2).isEmpty() ? -1 : Long.parseLong(matcher.group(2));
                if ((start == -1 && end <= 0) || (start >= 0 && end >= 0 && start > end)) return unsatisfied(stream, length);
                if (length >= 0) {
                    if (length == 0 || start >= length) return unsatisfied(stream, length);
                    if (start == -1) { start = Math.max(0, length - end); end = length - 1; }
                    else { end = end == -1 ? length - 1 : Math.min(end, length - 1); }
                    skipFully(stream, start);
                    long count = end - start + 1;
                    headers.put("Accept-Ranges", "bytes");
                    headers.put("Content-Range", "bytes " + start + "-" + end + "/" + length);
                    headers.put("Content-Length", Long.toString(count));
                    return new BwvDataOnlyResponse(mime, 206, headers, new Limited(stream, count));
                }
                // Unknown provider length: RFC 9110 permits ignoring Range. Full body, status 200.
            }
            if (length >= 0) {
                headers.put("Content-Length", Long.toString(length));
                headers.put("Accept-Ranges", "bytes");
            }
            return new BwvDataOnlyResponse(mime, 200, headers, length < 0 ? stream : new Limited(stream, length));
        } catch (NumberFormatException invalidRange) {
            return unsatisfied(stream, length);
        } catch (IOException | RuntimeException failure) {
            try { stream.close(); } catch (IOException ignored) { }
            throw failure;
        }
    }

    private static BwvDataOnlyResponse unsatisfied(InputStream stream, long length) throws IOException {
        stream.close();
        BwvDataOnlyResponse response = empty(416);
        if (length >= 0) response.headers.put("Content-Range", "bytes */" + length);
        return response;
    }

    private static void skipFully(InputStream stream, long amount) throws IOException {
        while (amount > 0) {
            long skipped = stream.skip(amount);
            if (skipped > 0) amount -= skipped;
            else if (stream.read() != -1) amount--;
            else throw new IOException("Data stream ended before range start");
        }
    }

    private static String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 206: return "Partial Content";
            case 400: return "Bad Request";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 416: return "Range Not Satisfiable";
            default: return "Internal Server Error";
        }
    }

    private static final class Limited extends FilterInputStream {
        private long remaining;
        Limited(InputStream in, long remaining) { super(in); this.remaining = remaining; }
        @Override public int read() throws IOException {
            if (remaining == 0) return -1;
            int value = in.read();
            if (value >= 0) remaining--;
            return value;
        }
        @Override public int read(byte[] target, int offset, int count) throws IOException {
            if (target == null) throw new NullPointerException("target");
            if (offset < 0 || count < 0 || offset > target.length - count) throw new IndexOutOfBoundsException();
            if (count == 0) return 0;
            if (remaining == 0) return -1;
            int read = in.read(target, offset, (int) Math.min(count, remaining));
            if (read > 0) remaining -= read;
            return read;
        }
        @Override public long skip(long count) throws IOException {
            long skipped = in.skip(Math.min(Math.max(0, count), remaining));
            remaining -= skipped;
            return skipped;
        }
        @Override public int available() throws IOException { return (int) Math.min(in.available(), remaining); }
        @Override public boolean markSupported() { return false; }
        @Override public synchronized void mark(int readlimit) { }
        @Override public synchronized void reset() throws IOException { throw new IOException("mark/reset unsupported"); }
    }
}
