package com.boxhead.game;

import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Native TextToSpeech plugin for Android.
 *
 * Android System WebView does not bind to Android's TTS engine, so
 * `speechSynthesis` is silent there. This plugin talks to
 * android.speech.tts.TextToSpeech directly.
 *
 * The engine binds asynchronously (and not at all on a phone with the engine
 * missing or disabled). The old version called speak() anyway: it returned
 * SUCCESS into a dead engine, the UI showed "speaking" for an estimated
 * duration, and the user heard nothing. Requests are now queued until the
 * engine reports ready, and a real failure is returned to JS so it can fall
 * back to an audible chime and stop pretending to speak.
 *
 * Threading: Capacitor runs @PluginMethod calls on its own plugin thread while
 * onInit and the timeout land on the main looper. Every read/write of the
 * engine state and the pending queue therefore happens inside stateLock, and
 * each speak reaches the engine on the main thread. Without that, a request
 * arriving during onInit was drained into nothing and its promise never
 * settled - the silenced-but-"speaking" bug again.
 */
@CapacitorPlugin(name = "HermesTTS")
public class HermesTTS extends Plugin implements TextToSpeech.OnInitListener {

    private static final String TAG = "HermesTTS";
    /** A phone with no engine never calls onInit at all. */
    private static final long INIT_TIMEOUT_MS = 6000;
    /** A failed engine is retried (user may install voice data) at most this often. */
    private static final long INIT_RETRY_MS = 30000;

    private final Object stateLock = new Object();
    private final List<PendingSpeech> pending = new ArrayList<>();

    private TextToSpeech tts;
    private volatile boolean isInitialized = false;
    private volatile boolean initFailed = false;
    private long lastInitAttempt = 0L;
    private Handler handler;
    private Runnable initTimeout;

    private static final class PendingSpeech {
        final PluginCall call;
        final String text;
        final float rate;
        final float pitch;
        final String lang;

        PendingSpeech(PluginCall call, String text, float rate, float pitch, String lang) {
            this.call = call;
            this.text = text;
            this.rate = rate;
            this.pitch = pitch;
            this.lang = lang;
        }
    }

    @Override
    public void load() {
        super.load();
        handler = new Handler(Looper.getMainLooper());
        initTTS();
    }

    /** Must be called on the main thread, or at least with stateLock available. */
    private void initTTS() {
        synchronized (stateLock) {
            if (tts != null) return;
            Context context = getContext();
            if (context == null) {
                initFailed = true;
                return;
            }
            lastInitAttempt = System.currentTimeMillis();
            isInitialized = false;
            initFailed = false;
            if (handler == null) handler = new Handler(Looper.getMainLooper());
            tts = new TextToSpeech(context.getApplicationContext(), this);
            initTimeout = () -> {
                boolean timedOut;
                synchronized (stateLock) {
                    timedOut = !isInitialized;
                    if (timedOut) initFailed = true;
                }
                if (timedOut) {
                    Log.w(TAG, "TTS init timed out - no working speech engine");
                    drainPending("engine_timeout");
                }
            };
            handler.postDelayed(initTimeout, INIT_TIMEOUT_MS);
        }
    }

    /** Drops a dead engine so the next speak() can bind a fresh one. */
    private void resetEngine() {
        synchronized (stateLock) {
            if (initTimeout != null && handler != null) handler.removeCallbacks(initTimeout);
            initTimeout = null;
            if (tts != null) {
                try {
                    tts.shutdown();
                } catch (Exception ignored) {}
                tts = null;
            }
            isInitialized = false;
            initFailed = false;
        }
    }

    @Override
    public void onInit(int status) {
        synchronized (stateLock) {
            if (initTimeout != null && handler != null) {
                handler.removeCallbacks(initTimeout);
                initTimeout = null;
            }
            if (status == TextToSpeech.SUCCESS && tts != null) {
                isInitialized = true;
                initFailed = false;
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {
                        Log.i(TAG, "onStart " + utteranceId);
                        emit("ttsStart", utteranceId, null);
                    }

                    @Override
                    public void onDone(String utteranceId) {
                        Log.i(TAG, "onDone " + utteranceId);
                        emit("ttsEnd", utteranceId, null);
                    }

                    @Override
                    public void onError(String utteranceId) {
                        Log.e(TAG, "onError " + utteranceId);
                        emit("ttsError", utteranceId, null);
                    }

                    @Override
                    public void onError(String utteranceId, int errorCode) {
                        Log.e(TAG, "onError " + utteranceId + " code=" + errorCode);
                        emit("ttsError", utteranceId, errorCode);
                    }
                });
                Log.i(TAG, "TTS engine ready");
            } else {
                isInitialized = false;
                initFailed = true;
                Log.e(TAG, "TTS init failed with status " + status);
            }
        }
        // Draining outside the lock: speakNow() posts to the main thread and
        // resolving calls must not run while the state lock is held.
        drainPending(status == TextToSpeech.SUCCESS ? null : "engine_unavailable");
    }

    /**
     * Speaks everything that was queued while the engine was binding.
     * `failureReason` is null when the engine became ready.
     */
    private void drainPending(String failureReason) {
        List<PendingSpeech> queued;
        synchronized (stateLock) {
            queued = new ArrayList<>(pending);
            pending.clear();
        }
        for (PendingSpeech speech : queued) {
            if (failureReason != null) {
                resolveFailure(speech.call, failureReason);
            } else {
                postSpeak(speech.call, speech.text, speech.rate, speech.pitch, speech.lang, false);
            }
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        synchronized (stateLock) {
            ret.put("available", isInitialized && tts != null);
            ret.put("initializing", !isInitialized && !initFailed);
            if (initFailed) ret.put("reason", "engine_unavailable");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) {
            resolveFailure(call, "empty_text");
            return;
        }

        float rate = call.getFloat("rate", 1.0f);
        float pitch = call.getFloat("pitch", 1.0f);
        String lang = call.getString("lang", "en-US");

        boolean retry = false;
        synchronized (stateLock) {
            if (!isInitialized && initFailed
                && System.currentTimeMillis() - lastInitAttempt >= INIT_RETRY_MS) {
                retry = true;
            }
        }
        if (retry) {
            // Voice data may have just been installed; try once with a fresh engine.
            resetEngine();
            initTTS();
        }

        synchronized (stateLock) {
            if (isInitialized) {
                postSpeak(call, text, rate, pitch, lang, true);
                return;
            }
            if (initFailed) {
                resolveFailure(call, "engine_unavailable");
                return;
            }
            // Engine still binding: keep the call alive and speak when it is ready.
            // Holding stateLock here closes the window where onInit drained an
            // empty queue and this request was added afterwards forever.
            call.setKeepAlive(true);
            pending.add(new PendingSpeech(call, text, rate, pitch, lang));
        }
    }

    private void postSpeak(PluginCall call, String text, float rate, float pitch, String lang, boolean flush) {
        Handler main = handler;
        if (main == null) {
            main = new Handler(Looper.getMainLooper());
            handler = main;
        }
        main.post(() -> speakNow(call, text, rate, pitch, lang, flush));
    }

    private void speakNow(PluginCall call, String text, float rate, float pitch, String lang, boolean flush) {
        synchronized (stateLock) {
            if (tts == null || !isInitialized) {
                resolveFailure(call, "engine_unavailable");
                return;
            }
            try {
                boolean languageFallback = false;
                if (lang != null && !lang.isEmpty()) {
                    int langStatus = tts.setLanguage(Locale.forLanguageTag(lang));
                    if (langStatus == TextToSpeech.LANG_MISSING_DATA || langStatus == TextToSpeech.LANG_NOT_SUPPORTED) {
                        // The requested voice data is not installed. Speaking with it
                        // produces silence, so read with the device language instead
                        // and tell the caller which language actually played.
                        languageFallback = true;
                        Log.w(TAG, "Language " + lang + " unavailable (status " + langStatus + "), using device default");
                        int fallbackStatus = tts.setLanguage(Locale.getDefault());
                        if (fallbackStatus == TextToSpeech.LANG_MISSING_DATA || fallbackStatus == TextToSpeech.LANG_NOT_SUPPORTED) {
                            fallbackStatus = tts.setLanguage(Locale.US);
                        }
                        if (fallbackStatus == TextToSpeech.LANG_MISSING_DATA || fallbackStatus == TextToSpeech.LANG_NOT_SUPPORTED) {
                            resolveFailure(call, "language_unavailable");
                            return;
                        }
                    }
                }

                tts.setSpeechRate(clamp(rate, 0.1f, 3.0f));
                tts.setPitch(clamp(pitch, 0.1f, 3.0f));

                String utteranceId = "hermes_" + System.currentTimeMillis();
                Bundle params = new Bundle();
                params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
                int queueMode = flush ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD;
                int result = tts.speak(text, queueMode, params, utteranceId);

                if (result != TextToSpeech.SUCCESS) {
                    Log.e(TAG, "speak() rejected with " + result);
                    resolveFailure(call, "speak_rejected");
                    return;
                }

                Locale speaking = tts.getLanguage();
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("utteranceId", utteranceId);
                ret.put("languageFallback", languageFallback);
                if (speaking != null) ret.put("lang", speaking.toLanguageTag());
                call.resolve(ret);
            } catch (Exception ex) {
                Log.e(TAG, "TTS speak failed", ex);
                resolveFailure(call, "speak_error");
            }
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        // A Stop must also drop requests still queued behind the binding engine,
        // or the phrase the user just cancelled plays a second later.
        drainPending("stopped");
        synchronized (stateLock) {
            if (tts != null) {
                try {
                    tts.stop();
                } catch (Exception ignored) {}
            }
        }
        call.resolve(new JSObject().put("stopped", true));
    }

    private void emit(String event, String utteranceId, Integer code) {
        try {
            JSObject payload = new JSObject().put("utteranceId", utteranceId);
            if (code != null) payload.put("code", code);
            notifyListeners(event, payload);
        } catch (Exception ex) {
            // The bridge can be gone while the engine finishes an utterance.
            Log.w(TAG, "Could not emit " + event + ": " + ex.getMessage());
        }
    }

    private void resolveFailure(PluginCall call, String reason) {
        JSObject ret = new JSObject();
        ret.put("success", false);
        ret.put("reason", reason);
        call.resolve(ret);
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    @Override
    protected void handleOnDestroy() {
        drainPending("engine_shutdown");
        synchronized (stateLock) {
            if (initTimeout != null && handler != null) {
                handler.removeCallbacks(initTimeout);
                initTimeout = null;
            }
            if (tts != null) {
                try {
                    tts.stop();
                    tts.shutdown();
                } catch (Exception ignored) {}
                tts = null;
            }
            isInitialized = false;
            initFailed = false;
        }
        super.handleOnDestroy();
    }
}
