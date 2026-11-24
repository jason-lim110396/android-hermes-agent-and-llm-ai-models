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
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * On-device OCR bridge.
 *
 * Android System WebView has no text-recognition API, so the web layer could
 * only ever fake OCR. This plugin runs Google ML Kit's bundled Latin text
 * recognizer inside the app process: the image never leaves the phone and it
 * works offline once the APK is installed.
 */
@CapacitorPlugin(name = "HermesOCR")
public class HermesOCR extends Plugin {

    private TextRecognizer recognizer;

    @Override
    public void load() {
        recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
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

        InputImage input = InputImage.fromBitmap(bitmap, 0);
        recognizer.process(input)
            .addOnSuccessListener(result -> {
                JSArray lines = new JSArray();
                for (Text.TextBlock block : result.getTextBlocks()) {
                    for (Text.Line line : block.getLines()) {
                        lines.put(line.getText());
                    }
                }
                JSObject out = new JSObject();
                out.put("text", result.getText());
                out.put("lines", lines);
                out.put("blockCount", result.getTextBlocks().size());
                out.put("engine", "mlkit-text-recognition");
                call.resolve(out);
            })
            .addOnFailureListener(e -> call.reject("OCR failed: " + e.getMessage()));
    }

    @Override
    protected void handleOnDestroy() {
        if (recognizer != null) {
            recognizer.close();
            recognizer = null;
        }
        super.handleOnDestroy();
    }
}
