package com.boxhead.game;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

/**
 * Native speech-to-text plugin for Android.
 *
 * Android System WebView has no `SpeechRecognition` object at all, so every
 * microphone entry point in the web app could only record audio and never turn
 * it into text. This plugin talks to android.speech.SpeechRecognizer, which
 * uses the recognition service already installed on the phone (Google's
 * on-device/Assistant recognizer on most devices). No API key and no paid
 * service are involved.
 *
 * Behaviour that matters for a real phone:
 * - start() only resolves started=true after startListening() was actually
 *   called; an absent recognizer, a denied microphone or a busy engine is
 *   reported with an explicit reason instead of a fake success.
 * - partial results are emitted as they arrive, and each final segment is
 *   emitted once, so the UI can show a live transcript.
 * - continuous mode restarts listening after end-of-speech / no-match, which
 *   is how hands-free dictation keeps working without the user tapping again.
 * - stop() cancels the recognizer and stops the auto-restart loop.
 *
 * Threading: SpeechRecognizer must be created and driven on the main thread.
 * @PluginMethod calls arrive on Capacitor's plugin thread, so every recognizer
 * action is posted to the main looper. A session counter invalidates the
 * auto-restart scheduled by an older session, which would otherwise revive the
 * microphone after the user pressed stop.
 */
@CapacitorPlugin(
        name = "HermesSTT",
        permissions = @Permission(
                alias = "microphone",
                strings = { Manifest.permission.RECORD_AUDIO }
        )
)
public class HermesSTT extends Plugin implements RecognitionListener {

    private static final String TAG = "HermesSTT";
    private static final long RESTART_DELAY_MS = 300L;

    private final Object stateLock = new Object();

    private Handler handler;
    private SpeechRecognizer recognizer;

    /** Incremented by every start/stop; a stale restart checks it first. */
    private int sessionId = 0;
    /** Session id of the last recognizer run; tags every emitted event. */
    private int listeningSession = 0;
    private boolean listening = false;
    private boolean continuous = false;
    private boolean destroyed = false;
    private String language = "en-US";
    /** The start() call waiting for onReadyForSpeech (or a first error). */
    private PluginCall pendingStartCall = null;
    /**
     * The start() call waiting on the system microphone dialog. A stop/abort
     * clears it, so a dialog the user answers afterwards cannot resurrect a
     * recognizer whose dictation was already cancelled.
     */
    private PluginCall pendingPermissionCall = null;
    /**
     * cancel() delivers ERROR_CLIENT asynchronously. Until this time that code
     * is attributed to the cancel, not to the new session that may have
     * started in between, so it is not shown as a failure.
     */
    private long ignoreClientErrorsUntil = 0L;

    @Override
    public void load() {
        super.load();
        handler = new Handler(Looper.getMainLooper());
    }

    private Handler mainHandler() {
        if (handler == null) handler = new Handler(Looper.getMainLooper());
        return handler;
    }

    private boolean ensureRecognizer() {
        if (destroyed) return false;
        if (recognizer != null) return true;
        Context context = getContext();
        if (context == null) return false;
        try {
            recognizer = SpeechRecognizer.createSpeechRecognizer(context.getApplicationContext());
            recognizer.setRecognitionListener(this);
            Log.i(TAG, "SpeechRecognizer created");
            return true;
        } catch (Exception ex) {
            Log.e(TAG, "Could not create SpeechRecognizer", ex);
            recognizer = null;
            return false;
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        boolean available = false;
        String service = null;
        try {
            Context context = getContext();
            if (context != null) {
                available = SpeechRecognizer.isRecognitionAvailable(context);
                if (available) {
                    service = resolveServicePackage(context);
                }
            }
        } catch (Exception ex) {
            Log.w(TAG, "isRecognitionAvailable failed: " + ex.getMessage());
        }
        ret.put("available", available);
        ret.put("engine", "android.speech.SpeechRecognizer");
        if (service != null) ret.put("service", service);
        if (!available) ret.put("reason", "no_recognizer");
        call.resolve(ret);
    }

    /** Package that currently handles android.speech.RecognitionService, for logs. */
    private String resolveServicePackage(Context context) {
        try {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            android.content.pm.ResolveInfo info =
                    context.getPackageManager().resolveActivity(intent, 0);
            if (info != null && info.activityInfo != null) {
                return info.activityInfo.packageName;
            }
        } catch (Exception ignored) {}
        return null;
    }

    @PluginMethod
    public void start(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            resolveFailure(call, "no_recognizer", "The app context is not available.");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            Log.w(TAG, "start rejected: no recognition service installed");
            resolveFailure(call, "no_recognizer",
                    "No speech recognition service is installed on this device.");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            synchronized (stateLock) {
                if (pendingPermissionCall != null || pendingStartCall != null || listening) {
                    resolveFailure(call, "busy", "The speech recognizer is already running.");
                    return;
                }
                pendingPermissionCall = call;
                call.setKeepAlive(true);
            }
            Log.i(TAG, "start: microphone permission not granted, asking");
            try {
                requestPermissionForAlias("microphone", call, "microphoneCallback");
            } catch (Exception ex) {
                synchronized (stateLock) {
                    if (pendingPermissionCall == call) pendingPermissionCall = null;
                }
                Log.e(TAG, "Could not request microphone permission", ex);
                resolveFailure(call, "permission_denied",
                        "Microphone permission is required for voice input.");
            }
            return;
        }
        beginListening(call);
    }

    @PermissionCallback
    private void microphoneCallback(PluginCall call) {
        boolean stillWanted;
        synchronized (stateLock) {
            stillWanted = pendingPermissionCall == call;
            pendingPermissionCall = null;
        }
        if (!stillWanted) {
            // The dictation was stopped/aborted while the system dialog was
            // open. Its start() was already resolved as stopped; do not create
            // a recognizer or turn the microphone on for a cancelled note.
            Log.i(TAG, "permission result for a cancelled start ignored");
            return;
        }
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            beginListening(call);
        } else {
            Log.w(TAG, "start rejected: microphone permission denied");
            resolveFailure(call, "permission_denied",
                    "Microphone permission is required for voice input.");
        }
    }

    private void beginListening(PluginCall call) {
        synchronized (stateLock) {
            if (listening || pendingStartCall != null) {
                resolveFailure(call, "busy", "The speech recognizer is already running.");
                return;
            }
            continuous = call.getBoolean("continuous", false);
            String requested = call.getString("lang", "en-US");
            language = (requested == null || requested.trim().isEmpty()) ? "en-US" : requested;
            sessionId++;
            final int session = sessionId;
            pendingStartCall = call;
            call.setKeepAlive(true);

            mainHandler().post(() -> startListeningNow(session));
        }
    }

    /** Must run on the main thread. */
    private void startListeningNow(int session) {
        synchronized (stateLock) {
            if (session != sessionId || destroyed) return;
            if (!ensureRecognizer()) {
                finishStartFailure("no_recognizer",
                        "No speech recognition service is available.");
                return;
            }
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE,
                    getContext().getPackageName());
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
            // Ask for the language's default model; an unsupported language is
            // reported by the recognizer as an error, not silently ignored.
            intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false);

            try {
                listeningSession = session;
                recognizer.startListening(intent);
                listening = true;
                Log.i(TAG, "startListening lang=" + language + " continuous=" + continuous
                        + " session=" + session);
            } catch (Exception ex) {
                Log.e(TAG, "startListening threw", ex);
                listening = false;
                finishStartFailure("client", "The speech recognizer could not start: "
                        + ex.getMessage());
            }
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        int endedSession;
        PluginCall orphanedPermission;
        synchronized (stateLock) {
            endedSession = listeningSession;
            sessionId++;
            listening = false;
            continuous = false;
            ignoreClientErrorsUntil = System.currentTimeMillis() + 2000L;
            orphanedPermission = pendingPermissionCall;
            pendingPermissionCall = null;
            resolvePendingStartIfAny();
        }
        if (orphanedPermission != null) {
            // This start() is still sitting in the system permission dialog.
            // Resolve it as stopped and let the callback drop the result.
            Log.i(TAG, "stop: cancelling a start waiting on the permission dialog");
            resolveStopped(orphanedPermission);
        }
        mainHandler().post(() -> {
            synchronized (stateLock) {
                if (recognizer != null) {
                    try {
                        recognizer.cancel();
                    } catch (Exception ignored) {}
                }
            }
            Log.i(TAG, "stop: listening cancelled");
            emitEndAt("stopped", endedSession);
        });
        call.resolve(new JSObject().put("stopped", true));
    }

    private void resolvePendingStartIfAny() {
        if (pendingStartCall != null) {
            PluginCall call = pendingStartCall;
            pendingStartCall = null;
            JSObject ret = new JSObject();
            ret.put("started", true);
            ret.put("engine", "native");
            ret.put("session", listeningSession);
            call.resolve(ret);
        }
    }

    private void finishStartFailure(String reason, String message) {
        PluginCall call;
        synchronized (stateLock) {
            listening = false;
            continuous = false;
            call = pendingStartCall;
            pendingStartCall = null;
        }
        if (call != null) {
            resolveFailure(call, reason, message);
        }
        emitError(reason, message, -1);
        emitEnd(reason);
    }

    // --- RecognitionListener (all callbacks arrive on the main thread) ---

    @Override
    public void onReadyForSpeech(Bundle params) {
        Log.i(TAG, "onReadyForSpeech");
        PluginCall call;
        synchronized (stateLock) {
            call = pendingStartCall;
            pendingStartCall = null;
        }
        if (call != null) {
            JSObject ret = new JSObject();
            ret.put("started", true);
            ret.put("engine", "native");
            ret.put("lang", language);
            ret.put("session", listeningSession);
            call.resolve(ret);
        }
        emit("sttStart", new JSObject().put("engine", "native").put("lang", language));
    }

    @Override
    public void onBeginningOfSpeech() {
        Log.i(TAG, "onBeginningOfSpeech");
        emit("sttSpeechStart", new JSObject());
    }

    @Override
    public void onRmsChanged(float rmsdB) {
        // Not forwarded: a per-frame bridge event would flood the WebView.
    }

    @Override
    public void onBufferReceived(byte[] buffer) {}

    @Override
    public void onEndOfSpeech() {
        Log.i(TAG, "onEndOfSpeech");
    }

    @Override
    public void onError(int error) {
        String reason = mapError(error);
        String message = messageFor(reason);
        boolean sessionAlive;
        synchronized (stateLock) {
            sessionAlive = listening;
            listening = false;
        }
        Log.w(TAG, "onError code=" + error + " reason=" + reason + " sessionAlive=" + sessionAlive);

        // A cancel() (user stop) surfaces as ERROR_CLIENT. It is not a failure
        // worth showing, and stop() already ended the session. The timestamp
        // covers a cancel whose error lands after the next startListening.
        if (reason.equals("client")) {
            boolean fromCancel;
            synchronized (stateLock) {
                fromCancel = System.currentTimeMillis() < ignoreClientErrorsUntil;
            }
            if (fromCancel || !sessionAlive) {
                Log.i(TAG, "onError client from cancel ignored");
                return;
            }
        }

        PluginCall call;
        synchronized (stateLock) {
            call = pendingStartCall;
            pendingStartCall = null;
        }
        if (call != null) {
            resolveFailure(call, reason, message);
        }

        // Silence during continuous dictation is normal: restart quietly
        // instead of flashing an error every few seconds.
        if (continuous && (reason.equals("no_match") || reason.equals("no_speech"))) {
            scheduleRestart();
            return;
        }

        emitError(reason, message, error);
        // A real failure (no permission, network, dead service) must not loop:
        // end continuous mode and let the UI show the reason.
        synchronized (stateLock) {
            continuous = false;
        }
        emitEnd(reason);
    }

    @Override
    public void onResults(Bundle results) {
        ArrayList<String> matches =
                results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        String text = matches != null && !matches.isEmpty() ? matches.get(0) : "";
        synchronized (stateLock) {
            listening = false;
            resolvePendingStartIfAny();
        }
        if (text != null && !text.trim().isEmpty()) {
            Log.i(TAG, "onResults chars=" + text.trim().length());
            emit("sttFinal", new JSObject().put("text", text.trim()));
        } else {
            Log.i(TAG, "onResults: empty transcript");
        }
        if (continuous) {
            scheduleRestart();
        } else {
            emitEnd("final");
        }
    }

    @Override
    public void onPartialResults(Bundle partialResults) {
        ArrayList<String> matches = partialResults == null ? null
                : partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) return;
        String text = matches.get(0);
        if (text == null || text.trim().isEmpty()) return;
        emit("sttPartial", new JSObject().put("text", text.trim()));
    }

    @Override
    public void onEvent(int eventType, Bundle params) {}

    /** Re-arms the recognizer for continuous dictation, unless stopped. */
    private void scheduleRestart() {
        final int session;
        synchronized (stateLock) {
            if (!continuous || destroyed) return;
            session = sessionId;
        }
        mainHandler().postDelayed(() -> {
            synchronized (stateLock) {
                if (session != sessionId || !continuous || destroyed || listening) return;
            }
            Log.i(TAG, "continuous: restarting recognizer");
            startListeningNow(session);
        }, RESTART_DELAY_MS);
    }

    private static String mapError(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO:
                return "audio";
            case SpeechRecognizer.ERROR_CLIENT:
                return "client";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "permission_denied";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "network";
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "no_match";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "busy";
            case SpeechRecognizer.ERROR_SERVER:
                return "server";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "no_speech";
            case SpeechRecognizer.ERROR_TOO_MANY_REQUESTS:
                return "rate_limited";
            case SpeechRecognizer.ERROR_SERVER_DISCONNECTED:
                return "network";
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:
            case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:
            case SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT:
                return "language_unsupported";
            default:
                return "unknown";
        }
    }

    private static String messageFor(String reason) {
        switch (reason) {
            case "audio":
                return "The microphone audio could not be captured.";
            case "permission_denied":
                return "Microphone permission is required for voice input.";
            case "network":
                return "Speech recognition needs a network connection.";
            case "no_match":
                return "No words were recognized. Try speaking again.";
            case "no_speech":
                return "No speech was detected.";
            case "busy":
                return "The speech recognizer is busy. Try again in a moment.";
            case "server":
                return "The speech recognition service failed.";
            case "rate_limited":
                return "The speech service is busy. Try again in a moment.";
            case "language_unsupported":
                return "This device has no speech model for the chosen language.";
            default:
                return "Speech recognition stopped unexpectedly.";
        }
    }

    private void emitError(String reason, String message, int code) {
        JSObject payload = new JSObject();
        payload.put("reason", reason);
        payload.put("message", message);
        if (code >= 0) payload.put("code", code);
        emit("sttError", payload);
    }

    private void emitEnd(String reason) {
        emit("sttEnd", new JSObject().put("reason", reason));
    }

    private void emit(String event, JSObject payload) {
        emitAt(event, payload, listeningSession);
    }

    /**
     * Tags an event with the recognizer session that produced it. A stop's end
     * event must carry the OLD session id: the web side starts the next session
     * immediately, and an untagged end would be mistaken for that new session
     * ending, which made it re-arm a duplicate start ("recognizer is busy").
     */
    private void emitAt(String event, JSObject payload, int session) {
        try {
            payload.put("session", session);
            notifyListeners(event, payload);
        } catch (Exception ex) {
            // The bridge can be gone while a recognition callback is in flight.
            Log.w(TAG, "Could not emit " + event + ": " + ex.getMessage());
        }
    }

    private void emitEndAt(String reason, int session) {
        emitAt("sttEnd", new JSObject().put("reason", reason), session);
    }

    private void resolveFailure(PluginCall call, String reason, String message) {
        JSObject ret = new JSObject();
        ret.put("started", false);
        ret.put("reason", reason);
        ret.put("message", message);
        call.resolve(ret);
    }

    private void resolveStopped(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("started", false);
        ret.put("reason", "stopped");
        ret.put("message", "Voice input was stopped.");
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        PluginCall orphanedPermission;
        synchronized (stateLock) {
            destroyed = true;
            sessionId++;
            listening = false;
            continuous = false;
            orphanedPermission = pendingPermissionCall;
            pendingPermissionCall = null;
            resolvePendingStartIfAny();
        }
        if (orphanedPermission != null) resolveStopped(orphanedPermission);
        mainHandler().post(() -> {
            synchronized (stateLock) {
                if (recognizer != null) {
                    try {
                        recognizer.cancel();
                        recognizer.destroy();
                    } catch (Exception ignored) {}
                    recognizer = null;
                }
            }
        });
        super.handleOnDestroy();
    }
}
