package com.getcapacitor.plugin;

import android.app.Activity;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin
public class WebView extends Plugin {

    public static final String WEBVIEW_PREFS_NAME = "CapWebViewSettings";
    public static final String CAP_SERVER_PATH = "serverBasePath";

    @PluginMethod
    public void setServerAssetPath(PluginCall call) {
        call.reject("Resource root mutation is disabled; staged updates require a new process");
    }

    @PluginMethod
    public void setServerBasePath(PluginCall call) {
        call.reject("Resource root mutation is disabled; staged updates require a new process");
    }

    @PluginMethod
    public void getServerBasePath(PluginCall call) {
        String path = bridge.getServerBasePath();
        JSObject ret = new JSObject();
        ret.put("path", path);
        call.resolve(ret);
    }

    @PluginMethod
    public void persistServerBasePath(PluginCall call) {
        call.reject("Resource root mutation is disabled; staged updates require a new process");
    }
}
