package com.nexusai.roleplay;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.VideoView;

public class SplashActivity extends Activity {
    private boolean opened;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        CoverVideo video = new CoverVideo(this);
        video.setBackgroundColor(Color.BLACK);
        video.setMediaController(null);
        video.setAlpha(0f);
        video.setVisibility(View.INVISIBLE);
        root.addView(video, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER));
        setContentView(root);
        hideSystemBars();

        video.setVideoURI(Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.splash_intro));
        video.setMediaController(null);
        video.setOnPreparedListener(mp -> {
            fitTall(root, video, mp.getVideoWidth(), mp.getVideoHeight());
            mp.setVideoScalingMode(MediaPlayer.VIDEO_SCALING_MODE_SCALE_TO_FIT);
            mp.setOnInfoListener((player, what, extra) -> {
                if (what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) {
                    reveal(video);
                    return true;
                }
                return false;
            });
            video.setBackgroundColor(Color.BLACK);
            video.start();
            video.postDelayed(() -> {
                if (video.isPlaying()) reveal(video);
            }, 700);
        });
        video.setOnCompletionListener(mp -> openApp());
        video.setOnErrorListener((mp, what, extra) -> {
            openApp();
            return true;
        });
    }

    /**
     * Taller than a plain 16:9 fit, short of filling the whole phone.
     * 38% of the frame width stays on screen, which keeps the title letters intact.
     */
    private void fitTall(FrameLayout root, VideoView video, int videoW, int videoH) {
        int screenW = root.getWidth();
        int screenH = root.getHeight();
        if (screenW <= 0 || screenH <= 0) {
            android.util.DisplayMetrics metrics = new android.util.DisplayMetrics();
            getWindowManager().getDefaultDisplay().getRealMetrics(metrics);
            screenW = metrics.widthPixels;
            screenH = metrics.heightPixels;
        }
        int viewW = screenW;
        int viewH = screenH;
        if (videoW > 0 && videoH > 0 && screenW > 0 && screenH > 0) {
            float videoRatio = (float) videoW / (float) videoH;
            float keepVisible = 0.38f;
            viewW = Math.round(screenW / keepVisible);
            viewH = Math.round(viewW / videoRatio);
            if (viewH > screenH) {
                viewH = screenH;
                viewW = Math.round(viewH * videoRatio);
            }
        }
        video.setLayoutParams(new FrameLayout.LayoutParams(viewW, viewH, Gravity.CENTER));
    }

    private void reveal(VideoView video) {
        if (video.getVisibility() == View.VISIBLE && video.getAlpha() >= 1f) return;
        video.setBackgroundColor(Color.TRANSPARENT);
        video.setVisibility(View.VISIBLE);
        video.setAlpha(1f);
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = null;
            try {
                controller = getWindow().getInsetsController();
            } catch (RuntimeException ignored) {
                controller = null;
            }
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    public void onBackPressed() {
        openApp();
    }

    private void openApp() {
        if (opened || isFinishing()) return;
        opened = true;
        startActivity(new Intent(this, MainActivity.class));
        finish();
        overridePendingTransition(0, 0);
    }

    /** Fills the window instead of shrinking to a strip at the top. */
    static final class CoverVideo extends VideoView {
        CoverVideo(Context context) {
            super(context);
            setMediaController(null);
            setBackgroundColor(Color.BLACK);
            setClickable(false);
            setFocusable(false);
        }

        @Override
        protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
            setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec));
        }
    }
}
