package com.boxhead.game;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int PERMISSION_REQ_DEVICE_FEATURES = 101;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        checkDeviceFeaturePermissions();
    }

    /**
     * Capacitor denies WebView capability requests for permissions the app has
     * not been granted, so the camera preview, GPS fixes and haptic feedback
     * silently failed on the installed APK while working in desktop browsers.
     * Request them up front, in one prompt, alongside the microphone.
     */
    private void checkDeviceFeaturePermissions() {
        String[] wanted = new String[] {
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        };
        boolean missing = false;
        for (String permission : wanted) {
            if (ContextCompat.checkSelfPermission(this, permission)
                    != PackageManager.PERMISSION_GRANTED) {
                missing = true;
                break;
            }
        }
        if (missing) {
            ActivityCompat.requestPermissions(this, wanted, PERMISSION_REQ_DEVICE_FEATURES);
        }
    }
}
