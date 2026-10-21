package com.getcapacitor;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;

/** Android adapter. Reserved routes never enter RouteProcessor, MIME sniffing or JSInjector. */
final class BwvDataOnlyAssetServer {
    private final Context context;
    BwvDataOnlyAssetServer(Context context) { this.context = context.getApplicationContext(); }

    WebResourceResponse intercept(WebResourceRequest request) {
        Uri uri = request.getUrl();
        String path = uri.getPath();
        int denied = BwvDataOnlyRoutes.denialStatus(uri.getEncodedPath(), path, request.getMethod(),
            request.isForMainFrame(), request.getRequestHeaders());
        if (denied != 0) return response(BwvDataOnlyResponse.empty(denied));
        InputStream stream = null;
        try {
            long length;
            String providerMime = null;
            if (path.startsWith(BwvDataOnlyRoutes.FILE + "/")) {
                // Remove one exact leading marker, never String.replace(). No route processor.
                File file = new File(path.substring(BwvDataOnlyRoutes.FILE.length()));
                if (!file.isFile()) return response(BwvDataOnlyResponse.empty(404));
                FileInputStream fileStream = new FileInputStream(file);
                stream = fileStream;
                length = fileStream.getChannel().size();
            } else {
                String target = "content:/" + uri.getEncodedPath().substring(BwvDataOnlyRoutes.CONTENT.length());
                Uri content = Uri.parse(target).buildUpon().encodedQuery(uri.getEncodedQuery()).build();
                if (content.getAuthority() == null || content.getAuthority().isEmpty()) return response(BwvDataOnlyResponse.empty(400));
                AssetFileDescriptor descriptor = context.getContentResolver().openAssetFileDescriptor(content, "r");
                if (descriptor == null) return response(BwvDataOnlyResponse.empty(404));
                try {
                    length = descriptor.getLength(); // UNKNOWN_LENGTH (-1) is supported, never available().
                    stream = descriptor.createInputStream(); // Also closes the descriptor when WebView closes the stream.
                } catch (IOException | RuntimeException failure) {
                    descriptor.close();
                    throw failure;
                }
                providerMime = context.getContentResolver().getType(content);
            }
            return response(BwvDataOnlyResponse.open(stream, length, BwvDataOnlyRoutes.safeMime(path, providerMime),
                request.getMethod(), BwvDataOnlyRoutes.header(request.getRequestHeaders(), "Range")));
        } catch (SecurityException deniedAccess) {
            close(stream);
            return response(BwvDataOnlyResponse.empty(403));
        } catch (IOException | RuntimeException missingOrInvalid) {
            close(stream);
            return response(BwvDataOnlyResponse.empty(404));
        }
    }

    private static void close(InputStream stream) {
        if (stream != null) try { stream.close(); } catch (IOException ignored) { }
    }
    private static WebResourceResponse response(BwvDataOnlyResponse response) {
        return new WebResourceResponse(response.mimeType, null, response.status, response.reason, response.headers, response.body);
    }
}
