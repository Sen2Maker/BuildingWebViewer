package com.getcapacitor;

import android.webkit.WebView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.apache.cordova.PluginManager;

/**
 * MessageHandler handles messages from the WebView, dispatching them
 * to plugins.
 */
public class MessageHandler {

    private Bridge bridge;
    private WebView webView;
    private PluginManager cordovaPluginManager;
    private final java.util.Map<PluginCall, JavaScriptReplyProxy> replies = java.util.Collections.synchronizedMap(new java.util.WeakHashMap<>());

    public MessageHandler(Bridge bridge, WebView webView, PluginManager cordovaPluginManager) {
        this.bridge = bridge;
        this.webView = webView;
        this.cordovaPluginManager = cordovaPluginManager;

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) && !bridge.getConfig().isUsingLegacyBridge()) {
            WebViewCompat.WebMessageListener capListener = (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                if (isMainFrame) {
                    postMessage(message.getData(), sourceOrigin.toString(), view.getUrl(), replyProxy);
                } else {
                    Logger.warn("Plugin execution is allowed in Main Frame only");
                }
            };
            try {
                WebViewCompat.addWebMessageListener(webView, "androidBridge", bridge.getAllowedOriginRules(), capListener);
            } catch (Exception ex) {
                throw new IllegalStateException("Origin-bound native bridge registration failed", ex);
            }
        } else {
            throw new IllegalStateException("Origin-bound native bridge is required");
        }
    }

    /**
     * The main message handler that will be called from JavaScript
     * to send a message to the native bridge.
     * @param jsonStr
     */
    private void postMessage(String jsonStr, String sourceOrigin, String document, JavaScriptReplyProxy replyProxy) {
        try {
            if (jsonStr == null || jsonStr.length() > 2097152) return;
            JSObject postData = new JSObject(jsonStr);

            String type = postData.getString("type");

            boolean typeIsNotNull = type != null;
            boolean isCordovaPlugin = typeIsNotNull && type.equals("cordova");
            boolean isJavaScriptError = typeIsNotNull && type.equals("js.error");

            String callbackId = postData.getString("callbackId");

            if (isCordovaPlugin) {
                // This application exposes no Cordova capability, including from imported documents.
                return;
            } else if (isJavaScriptError) {
                Logger.error("JavaScript reported an error; inspect local startup diagnostics");
            } else {
                String pluginId = postData.getString("pluginId");
                String methodName = postData.getString("methodName");
                JSObject methodData = postData.getJSObject("options", new JSObject());

                Logger.verbose(
                    Logger.tags("Plugin"),
                    "To native (Capacitor plugin): callbackId: " + callbackId + ", pluginId: " + pluginId + ", methodName: " + methodName
                );

                String documentToken = methodData.getString("bwvDocumentToken");
                methodData.remove("bwvDocumentToken");
                this.callPluginMethod(callbackId, pluginId, methodName, methodData, sourceOrigin, document, documentToken, replyProxy);
            }
        } catch (Exception ex) {
            Logger.error("Post message error:", ex);
        }
    }

    /** Replies and call retirement are serialized with navigation and app-plugin invocation on UI. */
    public void sendResponseMessage(PluginCall call, PluginResult successResult, PluginResult errorResult) {
        final JavaScriptReplyProxy expectedReply = replies.get(call);
        if (expectedReply == null) return; // Already retired, never owned, or a restored unbound call.
        bridge.executeOnMainThread(() -> {
            if (replies.get(call) != expectedReply) return; // A remove/cancel/earlier terminal response won.
            boolean retain = false;
            boolean providerEntered = false;
            try {
                if (!BwvBridgeCallGuard.current(call, webView)) return;
                PluginResult data = new PluginResult();
                data.put("save", call.isKeptAlive());
                data.put("callbackId", call.getCallbackId());
                data.put("pluginId", call.getPluginId());
                data.put("methodName", call.getMethodName());
                if (errorResult != null) {
                    data.put("success", false);
                    data.put("error", errorResult);
                } else {
                    data.put("success", true);
                    if (successResult != null) data.put("data", successResult);
                }
                String response = data.toString();
                // Recheck in the actual UI delivery turn, not merely on the IO resolving thread.
                if (replies.get(call) != expectedReply || !BwvBridgeCallGuard.current(call, webView)) return;
                if (PluginCall.CALLBACK_ID_DANGLING.equals(call.getCallbackId())) return;
                providerEntered = true;
                expectedReply.postMessage(response);
                retain = call.isKeptAlive();
            } catch (Exception ex) {
                Logger.error("sendResponseMessage: provider response unavailable; outcome not acknowledged");
                if (providerEntered && BwvBridgeCallGuard.current(call, webView)) {
                    // Retire only this native document. Never reroute data or replay the operation.
                    java.util.List<PluginCall> affected = new java.util.ArrayList<>();
                    synchronized (replies) {
                        for (PluginCall owned : replies.keySet()) if (BwvBridgeCallGuard.sameDocument(call, owned)) affected.add(owned);
                    }
                    try { bridge.notifyTransportFailure(call); }
                    finally {
                        for (PluginCall owned : affected) if (replies.containsKey(owned)) owned.release(bridge);
                    }
                }
            } finally {
                if (!retain && replies.get(call) == expectedReply) call.release(bridge);
            }
        });
    }

    /** Native retirement hook; it does not remove document provenance used by export owners. */
    void releaseCall(PluginCall call) {
        replies.remove(call);
    }

    private void callPluginMethod(String callbackId, String pluginId, String methodName, JSObject methodData, String sourceOrigin, String document, String documentToken, JavaScriptReplyProxy replyProxy) {
        PluginCall call = new PluginCall(this, pluginId, callbackId, methodName, methodData);
        if (!BwvBridgeCallGuard.register(call, webView, bridge.getLocalUrl(), sourceOrigin, document, true, pluginId, methodName, documentToken)) return;
        replies.put(call, replyProxy);
        bridge.callPluginMethod(pluginId, methodName, call);
    }
}
