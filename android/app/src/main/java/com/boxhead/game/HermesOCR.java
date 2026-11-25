package com.boxhead.game;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.util.regex.Pattern;

/**
 * On-device OCR bridge.
 *
 * Android System WebView has no text-recognition API, so the web layer could
 * only ever fake OCR. This plugin runs Google ML Kit's bundled recognizers
 * inside the app process: the image never leaves the phone and it works
 * offline once the APK is installed.
 *
 * A Latin-only recognizer turned Chinese/Japanese/Korean pages into garbage
 * Latin transliteration ("ÖRAit"), so the Chinese model (Han + Latin) runs
 * alongside it and wins whenever it actually returns CJK characters.
 */
@CapacitorPlugin(name = "HermesOCR")
public class HermesOCR extends Plugin {

    private TextRecognizer latinRecognizer;
    private TextRecognizer chineseRecognizer;
    /** Guards lazy recognizer creation against two concurrent first calls. */
    private final Object recognizerLock = new Object();

    // Han, kana and hangul. If the Chinese model sees any of these, the page is
    // CJK and the Latin model's output for the same page is noise.
    private static final Pattern CJK =
        Pattern.compile("[\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af]");

    @Override
    public void load() {
        // Recognizers are created on first use instead. Building both ML Kit
        // clients during bridge creation measured 0.6-2.0s on a cold start,
        // which delayed the WebView load and the boot-screen ready signal for
        // every launch whether or not the user ever opened OCR.
    }

    /**
     * Creates both recognizers on first use, on the Capacitor plugin thread
     * (never the main thread). Returns false when ML Kit cannot provide them.
     */
    private boolean ensureRecognizers() {
        synchronized (recognizerLock) {
            if (latinRecognizer != null && chineseRecognizer != null) return true;
            try {
                if (latinRecognizer == null) {
                    latinRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
                }
                if (chineseRecognizer == null) {
                    chineseRecognizer = TextRecognition.getClient(
                            new ChineseTextRecognizerOptions.Builder().build());
                }
                android.util.Log.i("HermesOCR", "recognizers created on first use");
                return true;
            } catch (Exception ex) {
                android.util.Log.e("HermesOCR", "Could not create the recognizers", ex);
                return false;
            }
        }
    }

    @PluginMethod
    public void recognize(PluginCall call) {
        String image = call.getString("image");
        if (image == null || image.isEmpty()) {
            call.reject("No image supplied");
            return;
        }

        Bitmap bitmap;
        try {
            String base64 = image.contains(",") ? image.substring(image.indexOf(",") + 1) : image;
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception e) {
            call.reject("Could not decode image: " + e.getMessage());
            return;
        }
        if (bitmap == null) {
            call.reject("Unsupported or empty image data");
            return;
        }

        if (!ensureRecognizers()) {
            bitmap.recycle();
            call.reject("OCR is not available on this device");
            return;
        }

        InputImage input = InputImage.fromBitmap(bitmap, 0);
        // Both models read the same bitmap; run them together so a CJK page
        // costs one recognition pass in wall time, not two.
        Task<Text> latinTask = latinRecognizer.process(input);
        Task<Text> chineseTask = chineseRecognizer.process(input);

        Tasks.whenAllComplete(latinTask, chineseTask).addOnCompleteListener(done -> {
            Text latin = latinTask.isSuccessful() ? latinTask.getResult() : null;
            Text chinese = chineseTask.isSuccessful() ? chineseTask.getResult() : null;

            if (latin == null && chinese == null) {
                String reason = latinTask.getException() != null
                    ? latinTask.getException().getMessage()
                    : chineseTask.getException() != null
                        ? chineseTask.getException().getMessage()
                        : "unknown error";
                bitmap.recycle();
                call.reject("OCR failed: " + reason);
                return;
            }

            String latinText = latin != null ? safeText(latin.getText()) : "";
            String chineseText = chinese != null ? safeText(chinese.getText()) : "";
            boolean cjk = CJK.matcher(chineseText).find();

            // CJK page: the Chinese model's output is the real text.
            // Latin page: the Latin model is the better reader, and the Chinese
            // model is used only if the Latin model found nothing.
            Text chosen = cjk ? chinese : (latinText.trim().isEmpty() ? chinese : latin);
            if (chosen == null) chosen = latin != null ? latin : chinese;

            JSArray lines = new JSArray();
            if (chosen != null) {
                for (Text.TextBlock block : chosen.getTextBlocks()) {
                    for (Text.Line line : block.getLines()) {
                        lines.put(line.getText());
                    }
                }
            }

            JSObject out = new JSObject();
            out.put("text", chosen != null ? chosen.getText() : "");
            out.put("lines", lines);
            out.put("blockCount", chosen != null ? chosen.getTextBlocks().size() : 0);
            out.put("engine", cjk ? "mlkit-text-recognition-chinese" : "mlkit-text-recognition");
            out.put("script", cjk ? "cjk" : "latin");

            bitmap.recycle();
            call.resolve(out);
        });
    }

    private static String safeText(String value) {
        return value == null ? "" : value;
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (recognizerLock) {
            if (latinRecognizer != null) {
                latinRecognizer.close();
                latinRecognizer = null;
            }
            if (chineseRecognizer != null) {
                chineseRecognizer.close();
                chineseRecognizer = null;
            }
        }
        super.handleOnDestroy();
    }
}
