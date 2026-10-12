package com.nexusai.roleplay;

import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        var prefs = getSharedPreferences("nexus", MODE_PRIVATE);
        if (prefs.getInt("assetCache", 0) < 10) {
            webView.clearCache(true);
            prefs.edit().putInt("assetCache", 10).apply();
        }
    }
}
