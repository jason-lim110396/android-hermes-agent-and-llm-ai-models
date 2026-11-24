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
 * duration, and the user heard nothing. Utterances are now queued until the
 * engine reports ready, and a real failure is returned to JS so it can fall
 * back to an audible chime and stop pretending to speak.
 */
@CapacitorPlugin(name = "HermesTTS")
public class HermesTTS extends Plugin implements TextToSpeech.OnInitListener {

    private static final String TAG = "HermesTTS";
    /** A phone with no engine never calls onInit at all. */
    private static final long INIT_TIMEOUT_MS = 6000;

    private TextToSpeech tts;
    private volatile boolean isInitialized = false;
    private volatile boolean initFailed = false;
    private Handler handler;
    private Runnable initTimeout;
    private final List<PendingSpeech> pending = new ArrayList<>();

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

    private synchronized void initTTS() {
        if (tts != null) return;
        Context context = getContext();
        if (context == null) {
            initFailed = true;
            return;
        }
        tts = new TextToSpeech(context.getApplicationContext(), this);
        if (handler != null) {
            initTimeout = () -> {
                if (!isInitialized) {
                    Log.w(TAG, "TTS init timed out - no working speech engine");
                    initFailed = true;
                    drainPending("engine_timeout");
                }
            };
            handler.postDelayed(initTimeout, INIT_TIMEOUT_MS);
        }
    }

    @Override
    public void onInit(int status) {
        if (handler != null && initTimeout != null) {
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
                    notifyListeners("ttsStart", new JSObject().put("utteranceId", utteranceId));
                }

                @Override
                public void onDone(String utteranceId) {
                    Log.i(TAG, "onDone " + utteranceId);
                    notifyListeners("ttsEnd", new JSObject().put("utteranceId", utteranceId));
                }

                @Override
                public void onError(String utteranceId) {
                    Log.e(TAG, "onError " + utteranceId);
                    notifyListeners("ttsError", new JSObject().put("utteranceId", utteranceId));
                }

                @Override
                public void onError(String utteranceId, int errorCode) {
                    Log.e(TAG, "onError " + utteranceId + " code=" + errorCode);
                    notifyListeners("ttsError", new JSObject().put("utteranceId", utteranceId).put("code", errorCode));
                }
            });
            Log.i(TAG, "TTS engine ready");
            drainPending(null);
        } else {
            isInitialized = false;
            initFailed = true;
            Log.e(TAG, "TTS init failed with status " + status);
            drainPending("engine_unavailable");
        }
    }

    /**
     * Speaks everything that was queued while the engine was binding.
     * `failureReason` is null when the engine became ready.
     */
    private void drainPending(String failureReason) {
        List<PendingSpeech> queued;
        synchronized (pending) {
            queued = new ArrayList<>(pending);
            pending.clear();
        }
        for (PendingSpeech speech : queued) {
            if (failureReason != null) {
                resolveFailure(speech.call, failureReason);
            } else {
                speakNow(speech.call, speech.text, speech.rate, speech.pitch, speech.lang);
            }
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", isInitialized && tts != null);
        ret.put("initializing", !isInitialized && !initFailed);
        if (initFailed) ret.put("reason", "engine_unavailable");
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

        initTTS();

        if (isInitialized) {
            speakNow(call, text, rate, pitch, lang);
            return;
        }
        if (initFailed) {
            resolveFailure(call, "engine_unavailable");
            return;
        }
        // Engine still binding: keep the call alive and speak when it is ready.
        call.setKeepAlive(true);
        synchronized (pending) {
            pending.add(new PendingSpeech(call, text, rate, pitch, lang));
        }
    }

    private void speakNow(PluginCall call, String text, float rate, float pitch, String lang) {
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
            int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);

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

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) {
            try {
                tts.stop();
            } catch (Exception ignored) {}
        }
        call.resolve(new JSObject().put("stopped", true));
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
        if (handler != null && initTimeout != null) {
            handler.removeCallbacks(initTimeout);
            initTimeout = null;
        }
        drainPending("engine_shutdown");
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Exception ignored) {}
            tts = null;
        }
        isInitialized = false;
        super.handleOnDestroy();
    }
}
