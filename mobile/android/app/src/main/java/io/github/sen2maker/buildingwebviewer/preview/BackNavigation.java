package io.github.sen2maker.buildingwebviewer.preview;

import android.net.Uri;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.Bridge;

/** Project home is the navigation root; never replay stale viewer entries from WebView history. */
final class BackNavigation {
  private final MainActivity activity;
  private final Bridge bridge;
  private final String home;
  private final OnBackPressedCallback callback;

  BackNavigation(MainActivity activity, Bridge bridge) {
    this.activity=activity;this.bridge=bridge;home=bridge.getLocalUrl()+bridge.getConfig().getStartPath();
    callback=new OnBackPressedCallback(false) {
      @Override public void handleOnBackPressed() { navigate(); }
    };
    activity.getOnBackPressedDispatcher().addCallback(activity,callback);
    update(bridge.getWebView().getUrl());
  }

  void update(String url) {
    if(url==null){callback.setEnabled(false);return;}
    Uri current=Uri.parse(url),root=Uri.parse(home);
    callback.setEnabled(!(root.getScheme().equals(current.getScheme())&&root.getAuthority().equals(current.getAuthority())&&root.getPath().equals(current.getPath())));
  }

  private void navigate() {
    if(activity.diagnostics.rendererGone){callback.setEnabled(false);activity.getOnBackPressedDispatcher().onBackPressed();return;}
    final String before=bridge.getWebView().getUrl();
    // The shared viewer handler saves first, and keeps the current page if saving fails.
    bridge.getWebView().evaluateJavascript("(function(){if(typeof window.bwvReturnToProjectHome==='function'){window.bwvReturnToProjectHome();return true;}return false;})()",handled->{
      if("true".equals(handled)||activity.isFinishing()||activity.isDestroyed())return;
      if(before!=null&&!before.equals(bridge.getWebView().getUrl()))return;
      String lang=before==null?null:Uri.parse(before).getQueryParameter("lang");
      bridge.getWebView().loadUrl(home+("en".equals(lang)||"zh".equals(lang)?"?lang="+lang:""));
    });
  }
}
