package com.boxhead.game;

import android.content.Context;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * Native TextToSpeech plugin for Android.
 * Android System WebView does not bind to Android's native TTS engine,
 * causing speechSynthesis to either throw ReferenceError or remain completely silent.
 * This Capacitor plugin connects directly to android.speech.tts.TextToSpeech.
 */
@CapacitorPlugin(name = "HermesTTS")
public class HermesTTS extends Plugin implements TextToSpeech.OnInitListener {

    private TextToSpeech tts;
    private boolean isInitialized = false;

    @Override
    public void load() {
        super.load();
        initTTS();
    }

    private synchronized void initTTS() {
        if (tts == null) {
            Context context = getContext();
            if (context != null) {
                tts = new TextToSpeech(context.getApplicationContext(), this);
            }
        }
    }

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS) {
            isInitialized = true;
            if (tts != null) {
                tts.setLanguage(Locale.US);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {
                        notifyListeners("ttsStart", new JSObject().put("utteranceId", utteranceId));
                    }

                    @Override
                    public void onDone(String utteranceId) {
                        notifyListeners("ttsEnd", new JSObject().put("utteranceId", utteranceId));
                    }

                    @Override
                    public void onError(String utteranceId) {
                        notifyListeners("ttsError", new JSObject().put("utteranceId", utteranceId));
                    }
                });
            }
        } else {
            isInitialized = false;
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", isInitialized && tts != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) {
            call.resolve(new JSObject().put("spoken", false));
            return;
        }

        float rate = call.getFloat("rate", 1.0f);
        float pitch = call.getFloat("pitch", 1.0f);
        String lang = call.getString("lang", "en-US");

        initTTS();

        if (tts != null) {
            try {
                if (lang != null && !lang.isEmpty()) {
                    Locale locale = Locale.forLanguageTag(lang);
                    tts.setLanguage(locale);
                }
                tts.setSpeechRate(rate);
                tts.setPitch(pitch);

                String utteranceId = "hermes_" + System.currentTimeMillis();
                Bundle params = new Bundle();
                params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
                int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);

                JSObject ret = new JSObject();
                ret.put("success", result == TextToSpeech.SUCCESS);
                ret.put("utteranceId", utteranceId);
                call.resolve(ret);
                return;
            } catch (Exception ex) {
                call.reject("TTS speech failure: " + ex.getMessage());
                return;
            }
        }

        call.reject("TextToSpeech service is not initialized");
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

    @Override
    protected void handleOnDestroy() {
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
