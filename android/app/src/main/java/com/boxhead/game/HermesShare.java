package com.boxhead.game;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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
 * Delivery is exactly once, including across process death. The text is always
 * parked, and a live composer also gets a `sharedText` event for an instant
 * insert. The parked copy is cleared only when that composer acknowledges the
 * event (or when a reader takes it through getPendingText).
 *
 * A delivery fingerprint (action + type + text hash) is written to
 * SharedPreferences as soon as the share is accepted, and marked "placed" when
 * the text reaches the composer. A task that Android recreates after the
 * process was killed is relaunched with its retained SEND base intent; the
 * fingerprint recognises that intent as already delivered and drops it, so the
 * same text is not inserted a second time.
 */
@CapacitorPlugin(name = "HermesShare")
public class HermesShare extends Plugin {

    private static final String TAG = "HermesShare";
    private static final String EVENT_TEXT = "sharedText";
    private static final String EVENT_NOTICE = "sharedNotice";
    /** A pathological share (an entire log file) must not stall the WebView. */
    private static final int MAX_TEXT_CHARS = 100000;
    /** A gallery share can carry a whole album; keep the draft readable. */
    private static final int MAX_STREAM_URIS = 10;

    /** Delivery records survive the process, unlike the parked text. */
    private static final String PREFS = "hermes_share_delivery";
    private static final String KIND_TEXT = "text";
    private static final String KIND_NOTICE = "notice";
    /**
     * How many recent deliveries are remembered. A task's retained SEND base
     * intent can be replayed long after newer shares arrived, so checking only
     * the most recent one would deliver an older share again.
     */
    private static final int MAX_DELIVERIES = 16;

    private static final Object stateLock = new Object();
    private static String pendingText = null;
    private static long pendingAt = 0L;
    /** Fingerprint of the parked text, used to mark it placed natively. */
    private static String pendingTextFingerprint = null;
    /** Honest message for a share Hermes cannot use (e.g. an image only). */
    private static String pendingNotice = null;
    private static long pendingNoticeAt = 0L;
    private static String pendingNoticeFingerprint = null;
    /** Live plugin instance: only a running bridge can be notified. */
    private static HermesShare instance = null;
    /** Application context for the delivery record; set from load()/init(). */
    private static Context appContext = null;
    /**
     * The last intent that was already handled in this process.
     *
     * BridgeActivity.load() calls onNewIntent(getIntent()) and onCreate also
     * hands over the same intent, so a cold start reaches handleIntent twice;
     * the second call is a no-op. This is deliberately process-local: after a
     * process death the persisted fingerprint does the deduplication instead.
     */
    private static Intent lastHandledIntent = null;

    /** Called from MainActivity.onCreate before the first intent is handled. */
    public static void init(Context context) {
        if (context == null) return;
        appContext = context.getApplicationContext();
    }

    @Override
    public void load() {
        instance = this;
        init(getContext());
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
        String fingerprint;
        synchronized (stateLock) {
            text = pendingText == null ? "" : pendingText;
            receivedAt = pendingAt;
            fingerprint = pendingTextFingerprint;
            pendingText = null;
            pendingAt = 0L;
            pendingTextFingerprint = null;
        }
        if (!text.isEmpty()) recordPlaced(KIND_TEXT, fingerprint);
        JSObject ret = new JSObject();
        ret.put("text", text);
        ret.put("receivedAt", receivedAt);
        call.resolve(ret);
    }

    @PluginMethod
    public void getPendingNotice(PluginCall call) {
        String notice;
        long receivedAt;
        String fingerprint;
        synchronized (stateLock) {
            notice = pendingNotice == null ? "" : pendingNotice;
            receivedAt = pendingNoticeAt;
            fingerprint = pendingNoticeFingerprint;
            pendingNotice = null;
            pendingNoticeAt = 0L;
            pendingNoticeFingerprint = null;
        }
        if (!notice.isEmpty()) recordPlaced(KIND_NOTICE, fingerprint);
        JSObject ret = new JSObject();
        ret.put("notice", notice);
        ret.put("receivedAt", receivedAt);
        call.resolve(ret);
    }

    /**
     * Opens the real Android share sheet for a reply the user wants to send
     * somewhere else. Android WebView has no Web Share API, so the JS
     * `navigator.share()` path never runs on the phone; without this method the
     * reply could only be copied.
     *
     * Nothing leaves the app until the user picks a target in the chooser.
     */
    @PluginMethod
    public void shareText(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("There is nothing to share.");
            return;
        }
        String cleaned = text.trim();
        if (cleaned.length() > MAX_TEXT_CHARS) {
            cleaned = cleaned.substring(0, MAX_TEXT_CHARS);
        }
        String subject = call.getString("subject", "Shared from Hermes");
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, cleaned);
            if (subject != null && !subject.trim().isEmpty()) {
                send.putExtra(Intent.EXTRA_SUBJECT, subject.trim());
            }
            Intent chooser = Intent.createChooser(send, "Share reply with");
            if (getActivity() != null) {
                getActivity().startActivity(chooser);
            } else {
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
            }
            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception ex) {
            // No share target installed, or the activity is gone: say so so the
            // web layer can offer the copy fallback instead of a false "shared".
            Log.w(TAG, "Could not open the share sheet: " + ex.getMessage());
            call.reject("Could not open the share sheet.");
        }
    }

    /**
     * Entry point for MainActivity: onCreate (cold start, nothing to notify yet)
     * and onNewIntent (app already running, the open composer must react).
     *
     * @param launchReplay true when Android is replaying this activity's launch
     *     intent (a task recreated after process death, or Capacitor's
     *     load() -> onNewIntent(getIntent()) call). Only a launch replay may be
     *     dropped as a duplicate; a genuine warm share always delivers, even
     *     when it repeats the same text.
     * @return true when the intent was a share/process-text intent Hermes owns.
     */
    public static boolean handleIntent(Intent intent, boolean launchReplay) {
        if (intent == null) return false;
        String action;
        try {
            action = intent.getAction();
        } catch (Exception ex) {
            Log.w(TAG, "Could not read intent action: " + ex.getMessage());
            return false;
        }
        if (action == null) return false;
        boolean isSend = Intent.ACTION_SEND.equals(action);
        boolean isProcessText = Intent.ACTION_PROCESS_TEXT.equals(action);
        if (!isSend && !isProcessText) return false;

        synchronized (stateLock) {
            // BridgeActivity.load() replays the launch intent, and onCreate
            // hands over the same object again. Handle each object once.
            if (lastHandledIntent == intent) return false;
            lastHandledIntent = intent;
        }

        String type;
        try {
            type = intent.getType();
        } catch (Exception ex) {
            Log.w(TAG, "Could not read intent type: " + ex.getMessage());
            type = null;
        }

        try {
            if (type != null && !type.isEmpty() && !type.startsWith("text/")) {
                // Shared media is not a chat draft; say so instead of pasting
                // a content:// URI the model cannot use.
                acceptNotice(
                        "Only text and links can be shared to Hermes. Shared type: " + type,
                        fingerprint(action, type, ""),
                        launchReplay);
                return true;
            }
            String text = isSend
                    ? readSendText(intent)
                    : readExtraText(intent, Intent.EXTRA_PROCESS_TEXT);
            if (text == null || text.trim().isEmpty()) {
                acceptNotice(
                        isSend
                                ? "That app shared no text Hermes can use. Share a link or some text instead."
                                : "The selected text was empty, so there was nothing to draft.",
                        fingerprint(action, type, ""),
                        launchReplay);
            } else {
                acceptText(action, type, text, launchReplay);
            }
        } catch (Exception ex) {
            // A malformed share from a third-party app must never crash us.
            Log.w(TAG, "Could not read shared intent: " + ex.getMessage());
        }
        return true;
    }

    /**
     * Parks a shared text and, when a composer is listening, emits `sharedText`
     * for an instant insert.
     *
     * The fingerprint is persisted before anything is parked: a task recreated
     * after process death comes back with the same retained SEND intent, and
     * that fingerprint is what stops the text from being delivered twice. The
     * record is marked placed once the composer took the text, so a delivery
     * that never reached the page is still retried on the next cold start.
     */
    private static void acceptText(String action, String type, String text, boolean launchReplay) {
        String cleaned = text == null ? "" : text.trim();
        if (cleaned.length() > MAX_TEXT_CHARS) {
            cleaned = cleaned.substring(0, MAX_TEXT_CHARS);
        }
        if (cleaned.isEmpty()) return;

        String fp = fingerprint(action, type, cleaned);
        if (launchReplay && wasPlaced(KIND_TEXT, fp)) {
            Log.i(TAG, "duplicate share ignored (already delivered): fingerprint=" + shortFingerprint(fp));
            return;
        }
        long seq = recordAccepted(KIND_TEXT, fp);
        long receivedAt = System.currentTimeMillis();
        synchronized (stateLock) {
            pendingText = cleaned;
            pendingAt = receivedAt;
            pendingTextFingerprint = fp;
        }
        Log.i(TAG, "share accepted (" + (launchReplay ? "cold start" : "warm")
                + "): fingerprint=" + shortFingerprint(fp) + " seq=" + seq);
        emit(EVENT_TEXT, "text", cleaned, receivedAt);
    }

    /**
     * Parks an honest "cannot use this share" notice and, when a composer is
     * listening, emits `sharedNotice`. Same durable-park and fingerprint rules
     * as the text.
     */
    private static void acceptNotice(String notice, String fp, boolean launchReplay) {
        String cleaned = notice == null ? "" : notice.trim();
        if (cleaned.isEmpty()) return;
        if (cleaned.length() > 500) cleaned = cleaned.substring(0, 500);

        if (launchReplay && wasPlaced(KIND_NOTICE, fp)) {
            Log.i(TAG, "duplicate share notice ignored (already delivered): fingerprint="
                    + shortFingerprint(fp));
            return;
        }
        long seq = recordAccepted(KIND_NOTICE, fp);
        long receivedAt = System.currentTimeMillis();
        synchronized (stateLock) {
            pendingNotice = cleaned;
            pendingNoticeAt = receivedAt;
            pendingNoticeFingerprint = fp;
        }
        Log.i(TAG, "share notice (" + (launchReplay ? "cold start" : "warm")
                + "): fingerprint=" + shortFingerprint(fp) + " seq=" + seq);
        emit(EVENT_NOTICE, "notice", cleaned, receivedAt);
    }

    /**
     * A live composer reports that it inserted the share with this
     * `receivedAt`. Only the matching parked value is cleared, so an
     * acknowledgement that arrives after a newer share landed cannot wipe it.
     */
    @PluginMethod
    public void acknowledgeShared(PluginCall call) {
        Long receivedAt = call.getLong("receivedAt");
        boolean textCleared = false;
        boolean noticeCleared = false;
        String textFp = null;
        String noticeFp = null;
        synchronized (stateLock) {
            if (receivedAt != null && receivedAt != 0L && pendingAt == receivedAt) {
                textFp = pendingTextFingerprint;
                pendingText = null;
                pendingAt = 0L;
                pendingTextFingerprint = null;
                textCleared = true;
            }
            if (receivedAt != null && receivedAt != 0L && pendingNoticeAt == receivedAt) {
                noticeFp = pendingNoticeFingerprint;
                pendingNotice = null;
                pendingNoticeAt = 0L;
                pendingNoticeFingerprint = null;
                noticeCleared = true;
            }
        }
        if (textCleared) recordPlaced(KIND_TEXT, textFp);
        if (noticeCleared) recordPlaced(KIND_NOTICE, noticeFp);
        JSObject ret = new JSObject();
        ret.put("textCleared", textCleared);
        ret.put("noticeCleared", noticeCleared);
        call.resolve(ret);
    }

    /**
     * Emits `eventName` to a live bridge when a listener is attached. The
     * parked copy is the durable delivery; this is only the fast path, so a
     * failed or dead emit costs nothing.
     */
    private static void emit(String eventName, String field, String value, long receivedAt) {
        HermesShare live = instance;
        if (live == null || live.getBridge() == null) return;
        try {
            if (!live.hasListeners(eventName)) return;
            JSObject payload = new JSObject();
            payload.put(field, value);
            payload.put("receivedAt", receivedAt);
            live.notifyListeners(eventName, payload);
        } catch (Exception ex) {
            // The bridge can be torn down between the check and the emit; the
            // parked copy above is still delivered by the next getPending* call.
            Log.w(TAG, "Could not emit " + eventName + ": " + ex.getMessage());
        }
    }

    // ---------------------------------------------------------------- delivery record

    private static SharedPreferences prefs() {
        Context context = appContext;
        if (context == null) return null;
        try {
            return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        } catch (Exception ex) {
            Log.w(TAG, "Could not open delivery record: " + ex.getMessage());
            return null;
        }
    }

    /**
     * Recent deliveries, newest first, as `fingerprint|placedFlag` entries.
     * A bounded list is enough: the retained SEND intent is replayed only when
     * this one task is recreated, so it is always near the front.
     */
    private static String historyKey(String kind) {
        return kind + "_history";
    }

    /** True only when this exact share already reached the composer. */
    private static boolean wasPlaced(String kind, String fp) {
        if (fp == null) return false;
        SharedPreferences p = prefs();
        if (p == null) return false;
        for (String entry : p.getString(historyKey(kind), "").split(";")) {
            int sep = entry.lastIndexOf('|');
            if (sep <= 0) continue;
            if (entry.substring(0, sep).equals(fp)) {
                return "1".equals(entry.substring(sep + 1));
            }
        }
        return false;
    }

    /**
     * Records the accepted share at the front of the history and bumps the
     * monotonic delivery counter. Uses commit() so the record is on disk
     * before the process can die; the write is tiny and a share is rare.
     */
    private static long recordAccepted(String kind, String fp) {
        SharedPreferences p = prefs();
        if (p == null || fp == null) return 0L;
        synchronized (stateLock) {
            StringBuilder history = new StringBuilder(fp).append("|0");
            int kept = 0;
            for (String entry : p.getString(historyKey(kind), "").split(";")) {
                if (entry.isEmpty()) continue;
                // A retry after a process death keeps exactly one entry.
                if (entry.startsWith(fp + "|")) continue;
                if (kept >= MAX_DELIVERIES - 1) break;
                history.append(';').append(entry);
                kept++;
            }
            long seq = p.getLong(kind + "_seq", 0L) + 1L;
            boolean ok = p.edit()
                    .putString(kind + "_fingerprint", fp)
                    .putString(historyKey(kind), history.toString())
                    .putLong(kind + "_seq", seq)
                    .putLong(kind + "_at", System.currentTimeMillis())
                    .commit();
            if (!ok) Log.w(TAG, "Could not persist the " + kind + " delivery fingerprint");
            return seq;
        }
    }

    /** Marks the share placed once its text/notice reached the composer. */
    private static void recordPlaced(String kind, String fp) {
        if (fp == null) return;
        SharedPreferences p = prefs();
        if (p == null) return;
        synchronized (stateLock) {
            String previous = p.getString(historyKey(kind), "");
            StringBuilder history = new StringBuilder();
            boolean changed = false;
            for (String entry : previous.split(";")) {
                if (entry.isEmpty()) continue;
                int sep = entry.lastIndexOf('|');
                String entryFp = sep > 0 ? entry.substring(0, sep) : entry;
                boolean placed = sep > 0 && "1".equals(entry.substring(sep + 1));
                if (entryFp.equals(fp) && !placed) {
                    placed = true;
                    changed = true;
                }
                if (history.length() > 0) history.append(';');
                history.append(entryFp).append('|').append(placed ? '1' : '0');
            }
            if (!changed) return;
            boolean ok = p.edit().putString(historyKey(kind), history.toString()).commit();
            if (ok) {
                Log.i(TAG, "share placed in composer: fingerprint=" + shortFingerprint(fp));
            }
        }
    }

    /** action + type + text hash, stable across processes and app restarts. */
    private static String fingerprint(String action, String type, String text) {
        String raw = (action == null ? "" : action)
                + "|" + (type == null ? "" : type)
                + "|" + (text == null ? "" : text);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception ex) {
            // No SHA-256 on an unusual runtime: still stable within a process.
            Log.w(TAG, "Could not hash the share: " + ex.getMessage());
            return Integer.toHexString(raw.hashCode());
        }
    }

    private static String shortFingerprint(String fp) {
        if (fp == null) return "none";
        return fp.length() <= 12 ? fp : fp.substring(0, 12);
    }

    // ---------------------------------------------------------------- intent reading

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
