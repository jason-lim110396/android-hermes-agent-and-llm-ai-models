package com.boxhead.game;

import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.BridgeActivity;

import java.lang.ref.WeakReference;

public class MainActivity extends BridgeActivity {

    /** Native boot screen shown until the web layer has painted its first frame. */
    private View bootScreen;
    /** How long to wait for the web signal before revealing the WebView anyway. */
    private static final long BOOT_SCREEN_TIMEOUT_MS = 10000L;
    private static WeakReference<MainActivity> liveActivity = new WeakReference<>(null);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable bootTimeout = () -> dismissBootScreen(true);
    private boolean webViewDrawn = false;
    private boolean contentReady = false;
    private boolean dismissScheduled = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register BEFORE super.onCreate: the bridge (and the plugin header
        // injected into the WebView) is built during super.onCreate, so a
        // plugin added afterwards would be invisible to the web side.
        registerPlugin(HermesAppSettings.class);
        registerPlugin(HermesTTS.class);
        registerPlugin(HermesOCR.class);
        registerPlugin(HermesSTT.class);
        registerPlugin(HermesBoot.class);
        super.onCreate(savedInstanceState);
        liveActivity = new WeakReference<>(this);

        // The Android system splash is gone as soon as the activity window is
        // drawn. The WebView surface can still be white for several seconds
        // after that, and a rotation was the only thing that forced it to
        // present. A dark native screen now covers that gap; the web layer
        // removes it after its first mounted frame and we invalidate the
        // WebView so the already-painted frame is actually composited.
        installBootScreen();
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView != null) {
            webView.setBackgroundColor(Color.parseColor("#09090B"));
            // The renderer can paint without the screen being updated (the
            // old build showed white until a rotation). Dismiss on the
            // WebView's own first draw, then force one presented frame.
            webView.getViewTreeObserver().addOnDrawListener(new ViewTreeObserver.OnDrawListener() {
                @Override
                public void onDraw() {
                    if (webViewDrawn) return;
                    webViewDrawn = true;
                    mainHandler.post(() -> {
                        android.util.Log.i("HermesBoot", "WebView reported its first draw");
                        maybeDismissBootScreen();
                    });
                }
            });
        }
        mainHandler.postDelayed(bootTimeout, BOOT_SCREEN_TIMEOUT_MS);
    }

    private void installBootScreen() {
        ViewGroup root = findViewById(android.R.id.content);
        if (root == null) return;

        FrameLayout screen = new FrameLayout(this);
        screen.setBackgroundColor(Color.parseColor("#09090B"));
        screen.setClickable(true);
        screen.setFocusable(true);

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView title = new TextView(this);
        title.setText("HERMES");
        title.setTextColor(Color.parseColor("#FAFAFA"));
        title.setTextSize(26);
        title.setLetterSpacing(0.16f);
        title.setGravity(Gravity.CENTER);
        // Full width: letterSpacing adds a trailing space that wrap_content
        // measures without, which clipped the last letter ("HERME").
        column.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView subtitle = new TextView(this);
        subtitle.setText("Starting on-device AI");
        subtitle.setTextColor(Color.parseColor("#A1A1AA"));
        subtitle.setTextSize(12);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = (int) (10 * getResources().getDisplayMetrics().density);
        column.addView(subtitle, subtitleParams);

        FrameLayout.LayoutParams columnParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        columnParams.gravity = Gravity.CENTER;
        screen.addView(column, columnParams);

        root.addView(screen, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        bootScreen = screen;
    }

    /** Called from HermesBoot.ready() on the Capacitor plugin thread. */
    static void onWebViewReady() {
        MainActivity activity = liveActivity.get();
        if (activity == null) return;
        activity.mainHandler.post(() -> {
            activity.contentReady = true;
            activity.maybeDismissBootScreen();
            // Hydration can change layout after the first draw. One more
            // invalidate makes sure the presented frame follows it.
            activity.nudgeWebView();
        });
    }

    private void nudgeWebView() {
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) return;
        webView.requestLayout();
        webView.invalidate();
        // A second pass after layout: Android WebView sometimes only submits
        // its next frame on the vsync after invalidation.
        webView.postDelayed(webView::invalidate, 300);
    }

    /**
     * Do not reveal the WebView until the native view has drawn AND the web
     * layer reports its mounted content. The first WebView draw can still be a
     * blank surface; requiring both is what kept the white frame from showing.
     */
    private void maybeDismissBootScreen() {
        if (!webViewDrawn || !contentReady || dismissScheduled) return;
        dismissScheduled = true;
        mainHandler.postDelayed(() -> dismissBootScreen(false), 150);
    }

    private void dismissBootScreen(boolean timedOut) {
        mainHandler.removeCallbacks(bootTimeout);
        dismissScheduled = false;
        View screen = bootScreen;
        if (screen == null) return;
        bootScreen = null;

        ViewGroup parent = screen.getParent() instanceof ViewGroup ? (ViewGroup) screen.getParent() : null;
        if (parent != null) parent.removeView(screen);

        // A committed DOM is not always a presented frame on Android WebView.
        // Force one layout/paint pass at handover; this is the same class of
        // invalidation a rotation was performing manually.
        nudgeWebView();
        android.util.Log.i("HermesBoot", timedOut
                ? "boot screen timed out; revealed WebView"
                : "web layer ready; boot screen removed and WebView invalidated");
    }

    @Override
    public void onDestroy() {
        mainHandler.removeCallbacks(bootTimeout);
        if (liveActivity.get() == this) liveActivity = new WeakReference<>(null);
        super.onDestroy();
    }
}
