package com.boxhead.game;

import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * Android share sheet front door.
 *
 * When the user shares text or a link from another app (Chrome, Mail, Notes,
 * YouTube ...) and picks Hermes, Android hands the activity an ACTION_SEND
 * intent instead of a launcher intent. Nothing listened for it before, so the
 * shared text was silently dropped: the app opened on whatever screen it was
 * left on and the user had to copy and paste by hand.
 *
 * The text is only ever staged as a draft for the composer. Nothing here sends
 * a prompt - a share must never start an inference the user did not ask for.
 *
 * Delivery is one-shot: setPendingText() parks the text in a static holder and
 * getPendingText() hands it to the web layer and clears it, so a restart or a
 * second read cannot duplicate the draft.
 */
@CapacitorPlugin(name = "HermesShare")
public class HermesShare extends Plugin {

    private static final String TAG = "HermesShare";
    /** A pathological share (an entire log file) must not stall the WebView. */
    private static final int MAX_TEXT_CHARS = 100000;
    /** A gallery share can carry a whole album; keep the draft readable. */
    private static final int MAX_STREAM_URIS = 10;

    private static final Object stateLock = new Object();
    private static String pendingText = null;
    private static long pendingAt = 0L;
    /** Honest message for a share Hermes cannot use (e.g. an image only). */
    private static String pendingNotice = null;
    private static long pendingNoticeAt = 0L;
    /** Live plugin instance: only a running bridge can be notified. */
    private static HermesShare instance = null;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getPendingText(PluginCall call) {
        String text;
        long receivedAt;
        synchronized (stateLock) {
            text = pendingText == null ? "" : pendingText;
            receivedAt = pendingAt;
            pendingText = null;
            pendingAt = 0L;
        }
        JSObject ret = new JSObject();
        ret.put("text", text);
        ret.put("receivedAt", receivedAt);
        call.resolve(ret);
    }

    @PluginMethod
    public void getPendingNotice(PluginCall call) {
        String notice;
        long receivedAt;
        synchronized (stateLock) {
            notice = pendingNotice == null ? "" : pendingNotice;
            receivedAt = pendingNoticeAt;
            pendingNotice = null;
            pendingNoticeAt = 0L;
        }
        JSObject ret = new JSObject();
        ret.put("notice", notice);
        ret.put("receivedAt", receivedAt);
        call.resolve(ret);
    }

    /**
     * Entry point for MainActivity: onCreate (cold start, nothing to notify yet)
     * and onNewIntent (app already running, the open composer must react).
     */
    public static void handleIntent(Intent intent) {
        if (intent == null) return;
        String action;
        try {
            action = intent.getAction();
        } catch (Exception ex) {
            Log.w(TAG, "Could not read intent action: " + ex.getMessage());
            return;
        }
        if (action == null) return;
        try {
            if (Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                if (!isTextShare(intent)) return;
                String text = readSendText(intent);
                if (text == null || text.trim().isEmpty()) {
                    setPendingNotice("That app shared no text Hermes can use. Share a link or some text instead.");
                } else {
                    setPendingText(text);
                }
            } else if (Intent.ACTION_PROCESS_TEXT.equals(action)) {
                // "Translate"/"Proofread" style selections carry the marked text.
                if (!isTextShare(intent)) return;
                String text = readExtraText(intent, Intent.EXTRA_PROCESS_TEXT);
                if (text == null || text.trim().isEmpty()) {
                    setPendingNotice("The selected text was empty, so there was nothing to draft.");
                } else {
                    setPendingText(text);
                }
            }
        } catch (Exception ex) {
            // A malformed share from a third-party app must never crash us.
            Log.w(TAG, "Could not read shared intent: " + ex.getMessage());
        }
    }

    /**
     * Shared media (an image, video or PDF) is not a chat draft. Say so
     * instead of pasting a content:// URI the model cannot use or silently
     * doing nothing.
     */
    private static boolean isTextShare(Intent intent) {
        String type;
        try {
            type = intent.getType();
        } catch (Exception ex) {
            Log.w(TAG, "Could not read intent type: " + ex.getMessage());
            return true;
        }
        if (type == null || type.isEmpty() || type.startsWith("text/")) return true;
        setPendingNotice("Only text and links can be shared to Hermes. Shared type: " + type);
        return false;
    }

    /**
     * Parks a shared text and, when the bridge is already running, emits
     * `sharedText` so an open app reacts without a restart.
     *
     * A blank share is ignored rather than stored: some apps send an
     * ACTION_SEND with no EXTRA_TEXT, and that must not wipe the draft.
     */
    public static void setPendingText(String text) {
        String cleaned = text == null ? "" : text.trim();
        if (cleaned.length() > MAX_TEXT_CHARS) {
            cleaned = cleaned.substring(0, MAX_TEXT_CHARS);
        }
        if (cleaned.isEmpty()) return;

        long receivedAt = System.currentTimeMillis();
        synchronized (stateLock) {
            pendingText = cleaned;
            pendingAt = receivedAt;
        }

        HermesShare live = instance;
        if (live == null || live.getBridge() == null) return;
        JSObject payload = new JSObject();
        payload.put("text", cleaned);
        payload.put("receivedAt", receivedAt);
        try {
            live.notifyListeners("sharedText", payload);
        } catch (Exception ex) {
            // The bridge can be torn down between the check and the emit; the
            // parked text above is still delivered by the next getPendingText.
            Log.w(TAG, "Could not emit sharedText: " + ex.getMessage());
        }
    }

    /**
     * Parks an honest "cannot use this share" notice and, when the bridge is
     * already running, emits `sharedNotice`. Same one-shot delivery as text.
     */
    public static void setPendingNotice(String notice) {
        String cleaned = notice == null ? "" : notice.trim();
        if (cleaned.isEmpty()) return;
        if (cleaned.length() > 500) cleaned = cleaned.substring(0, 500);

        long receivedAt = System.currentTimeMillis();
        synchronized (stateLock) {
            pendingNotice = cleaned;
            pendingNoticeAt = receivedAt;
        }

        HermesShare live = instance;
        if (live == null || live.getBridge() == null) return;
        JSObject payload = new JSObject();
        payload.put("notice", cleaned);
        payload.put("receivedAt", receivedAt);
        try {
            live.notifyListeners("sharedNotice", payload);
        } catch (Exception ex) {
            Log.w(TAG, "Could not emit sharedNotice: " + ex.getMessage());
        }
    }

    /** EXTRA_TEXT, or the stream URIs when the share carried no caption. */
    private static String readSendText(Intent intent) {
        String text = readExtraText(intent, Intent.EXTRA_TEXT);
        if (!text.trim().isEmpty()) return text;

        // An image/PDF share has no text at all. Showing the URI keeps the
        // draft honest about what was shared instead of an empty composer.
        List<String> uris = new ArrayList<>();
        try {
            Object extra = intent.getExtras() == null ? null : intent.getExtras().get(Intent.EXTRA_STREAM);
            if (extra instanceof Uri) {
                uris.add(extra.toString());
            } else if (extra instanceof Iterable) {
                for (Object item : (Iterable<?>) extra) {
                    if (item instanceof Uri) {
                        uris.add(item.toString());
                        if (uris.size() >= MAX_STREAM_URIS) break;
                    }
                }
            }
        } catch (Exception ex) {
            Log.w(TAG, "Could not read shared stream: " + ex.getMessage());
            return "";
        }
        return joinLines(uris);
    }

    private static String readExtraText(Intent intent, String key) {
        if (intent == null) return "";
        try {
            CharSequence value = intent.getCharSequenceExtra(key);
            return value == null ? "" : value.toString();
        } catch (Exception ex) {
            // A third-party app can put a non-CharSequence under EXTRA_TEXT.
            Log.w(TAG, "Could not read " + key + ": " + ex.getMessage());
            return "";
        }
    }

    /** String.join needs API 26; this app still installs on API 22. */
    private static String joinLines(List<String> lines) {
        StringBuilder builder = new StringBuilder();
        for (String line : lines) {
            if (builder.length() > 0) builder.append('\n');
            builder.append(line);
        }
        return builder.toString();
    }
}
