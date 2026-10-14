package com.nexusai.roleplay;

import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String SPLASH_GUARD = "(function(){"
            + "var id='nexus-splash-guard';"
            + "if(!document.documentElement)return;"
            + "var s=document.getElementById(id);"
            + "if(!s){s=document.createElement('style');s.id=id;(document.head||document.documentElement).appendChild(s);}"
            + "s.textContent='[data-splash]{background:#000000!important}'"
            + "+'[data-splash] video{opacity:0!important;background:#000000!important}'"
            + "+'[data-splash] video.nexus-splash-live{opacity:1!important}'"
            + "+'[data-splash] video::-webkit-media-controls,[data-splash] video::-webkit-media-controls-enclosure,[data-splash] video::-webkit-media-controls-panel,[data-splash] video::-webkit-media-controls-play-button,[data-splash] video::-webkit-media-controls-start-playback-button,[data-splash] video::-webkit-media-controls-overlay-play-button{display:none!important;opacity:0!important;-webkit-appearance:none;width:0!important;height:0!important;pointer-events:none!important}';"
            + "var nodes=document.querySelectorAll('[data-splash] video');"
            + "for(var i=0;i<nodes.length;i++){"
            + "var v=nodes[i];v.controls=false;v.removeAttribute('controls');"
            + "if(!v.__nexusSplash){v.__nexusSplash=1;v.addEventListener('playing',function(){this.classList.add('nexus-splash-live');});}"
            + "if(v.readyState>=2&&!v.paused)v.classList.add('nexus-splash-live');"
            + "}"
            + "})();";

    private final Handler splashGuard = new Handler(Looper.getMainLooper());
    private int splashGuardPasses;

    @Override
    public void onStart() {
        super.onStart();
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        webView.setBackgroundColor(Color.BLACK);
        WebSettings settings = webView.getSettings();
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        var prefs = getSharedPreferences("nexus", MODE_PRIVATE);
        if (prefs.getInt("assetCache", 0) < 10) {
            webView.clearCache(true);
            prefs.edit().putInt("assetCache", 10).apply();
        }
        splashGuardPasses = 0;
        splashGuard.removeCallbacksAndMessages(null);
        splashGuard.post(new Runnable() {
            @Override
            public void run() {
                WebView view = getBridge() == null ? null : getBridge().getWebView();
                if (view == null || splashGuardPasses++ > 12) return;
                view.evaluateJavascript(SPLASH_GUARD, null);
                splashGuard.postDelayed(this, 250);
            }
        });
    }
}
