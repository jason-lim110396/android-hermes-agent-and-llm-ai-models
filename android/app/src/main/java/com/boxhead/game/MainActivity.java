package com.boxhead.game;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
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
    /** Worst case: reveal even if the WebView never draws. */
    private static final long BOOT_SCREEN_TIMEOUT_MS = 4000L;
    /**
     * After the WebView has drawn, do not keep the overlay for much longer even
     * if the web ready signal is late: the drawn surface is already dark, so
     * this cannot show the old white frame, and a stalled JS bundle must not
     * leave the user staring at a splash.
     */
    private static final long DRAW_GRACE_MS = 800L;
    /** One short settle after ready() so the first content frame is presented. */
    private static final long READY_SETTLE_MS = 150L;
    private static WeakReference<MainActivity> liveActivity = new WeakReference<>(null);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable bootTimeout = () -> dismissBootScreen("timeout");
    private final Runnable drawGraceDismiss = () -> dismissBootScreen("draw+grace");
    private final Runnable readyDismiss = () -> dismissBootScreen("ready");
    private boolean webViewDrawn = false;
    private boolean contentReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // The share plugin needs a context for its persisted delivery record
        // before BridgeActivity.load() replays the launch intent.
        HermesShare.init(this);
        // Register BEFORE super.onCreate: the bridge (and the plugin header
        // injected into the WebView) is built during super.onCreate, so a
        // plugin added afterwards would be invisible to the web side.
        registerPlugin(HermesAppSettings.class);
        registerPlugin(HermesTTS.class);
        registerPlugin(HermesOCR.class);
        registerPlugin(HermesSTT.class);
        registerPlugin(HermesShare.class);
        registerPlugin(HermesBoot.class);
        super.onCreate(savedInstanceState);
        liveActivity = new WeakReference<>(this);
        // A share-sheet launch arrives as this activity's intent, not as a
        // launcher intent. Hand it to the share plugin before the web layer
        // asks for it, so the first getPendingText() finds the text.
        // BridgeActivity.load() already replayed this same object through
        // onNewIntent; the plugin handles each intent object once.
        HermesShare.handleIntent(getIntent(), true);
        normaliseShareIntent();

        // The Android system splash is gone as soon as the activity window is
        // drawn. The WebView surface can still be white for several seconds
        // after that, and a rotation was the only thing that forced it to
        // present. A dark native screen now covers that gap; it goes on the
        // web ready() signal, or 800ms after the WebView's first draw if that
        // signal is late, and each reveal invalidates the WebView so the
        // already-painted frame is actually composited.
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
                        if (contentReady) {
                            mainHandler.postDelayed(readyDismiss, READY_SETTLE_MS);
                        } else {
                            mainHandler.postDelayed(drawGraceDismiss, DRAW_GRACE_MS);
                        }
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
        // A wrap_content column is narrower than the letter-spaced title, which
        // clipped the last letter ("HERME"). Full width, with side padding so
        // the title never touches the screen edge.
        int columnPad = (int) (24 * getResources().getDisplayMetrics().density);
        column.setPadding(columnPad, 0, columnPad, 0);

        TextView title = new TextView(this);
        title.setText("HERMES");
        title.setTextColor(Color.parseColor("#FAFAFA"));
        title.setTextSize(26);
        title.setGravity(Gravity.CENTER);
        column.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView subtitle = new TextView(this);
        subtitle.setText("Starting on-device AI");
        subtitle.setTextColor(Color.parseColor("#A1A1AA"));
        subtitle.setTextSize(12);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = (int) (10 * getResources().getDisplayMetrics().density);
        column.addView(subtitle, subtitleParams);

        FrameLayout.LayoutParams columnParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        columnParams.gravity = Gravity.CENTER;
        screen.addView(column, columnParams);

        root.addView(screen, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        bootScreen = screen;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        // BridgeActivity.load() calls this with getIntent() itself, so the
        // launch intent is its own replay; a genuine warm share is a different
        // object. That distinction lets the plugin drop a retained SEND intent
        // after process death without dropping a real second share.
        boolean launchReplay = intent == getIntent();
        super.onNewIntent(intent);
        // A share that arrives while the app is already open (launchMode
        // singleTask): keep it as the current intent and hand the text over
        // without a restart.
        setIntent(intent);
        HermesShare.handleIntent(intent, launchReplay);
        String action = intent == null ? null : intent.getAction();
        if (Intent.ACTION_SEND.equals(action) || Intent.ACTION_PROCESS_TEXT.equals(action)) {
            Log.i("HermesShare", launchReplay
                    ? "share intent path: launch replay"
                    : "share intent path: warm share");
        }
        normaliseShareIntent();
    }

    /**
     * Replaces a SEND/PROCESS_TEXT activity intent with a plain MAIN intent so
     * a later read of getIntent() in this activity carries no share payload.
     * The task's retained base intent is fixed only by the fingerprint; this is
     * the in-process half of the same guarantee.
     */
    private void normaliseShareIntent() {
        Intent current = getIntent();
        if (current == null) return;
        String action = current.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_PROCESS_TEXT.equals(action)) {
            return;
        }
        Intent clean = new Intent(Intent.ACTION_MAIN);
        clean.addCategory(Intent.CATEGORY_LAUNCHER);
        clean.setClass(this, MainActivity.class);
        setIntent(clean);
        Log.i("HermesShare", "activity intent normalised after share (SEND payload cleared)");
    }

    /** Called from HermesBoot.ready() on the Capacitor plugin thread. */
    static void onWebViewReady() {
        MainActivity activity = liveActivity.get();
        if (activity == null) return;
        activity.mainHandler.post(() -> {
            if (activity.isFinishing() || activity.isDestroyed()) return;
            activity.contentReady = true;
            // A ready signal before the first draw waits for that draw; the
            // overlay may only go once the WebView surface is actually there.
            if (activity.webViewDrawn) {
                activity.mainHandler.postDelayed(activity.readyDismiss, READY_SETTLE_MS);
            }
            // Hydration can change layout after the first draw. One more
            // invalidate makes sure the presented frame follows it.
            activity.nudgeWebView();
        });
    }

    private void nudgeWebView() {
        if (isFinishing() || isDestroyed()) return;
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) return;
        webView.requestLayout();
        webView.invalidate();
        // A second pass after layout: Android WebView sometimes only submits
        // its next frame on the vsync after invalidation.
        webView.postDelayed(webView::invalidate, 300);
    }

    /**
     * Removes the native boot screen. The first WebView draw can be a blank
     * surface, so the overlay never goes before the WebView has drawn: either
     * on the web ready() signal (early), 800ms after that draw (fallback), or
     * the hard timeout if the WebView never draws at all.
     *
     * @param reason "ready", "draw+grace" or "timeout"; logged so a gate can
     *     tell which path actually revealed the app.
     */
    private void dismissBootScreen(String reason) {
        mainHandler.removeCallbacks(bootTimeout);
        mainHandler.removeCallbacks(drawGraceDismiss);
        mainHandler.removeCallbacks(readyDismiss);
        View screen = bootScreen;
        if (screen == null) return;
        bootScreen = null;

        ViewGroup parent = screen.getParent() instanceof ViewGroup ? (ViewGroup) screen.getParent() : null;
        if (parent != null) parent.removeView(screen);

        // A committed DOM is not always a presented frame on Android WebView.
        // Force one layout/paint pass at handover; this is the same class of
        // invalidation a rotation was performing manually.
        nudgeWebView();
        android.util.Log.i("HermesBoot", "boot screen removed (" + reason + ") and WebView invalidated");
    }

    @Override
    public void onDestroy() {
        mainHandler.removeCallbacks(bootTimeout);
        mainHandler.removeCallbacks(drawGraceDismiss);
        mainHandler.removeCallbacks(readyDismiss);
        if (liveActivity.get() == this) liveActivity = new WeakReference<>(null);
        super.onDestroy();
    }
}

