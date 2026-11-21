package com.boxhead.game;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register BEFORE super.onCreate: the bridge (and the plugin header
        // injected into the WebView) is built during super.onCreate, so a
        // plugin added afterwards would be invisible to the web side.
        registerPlugin(HermesAppSettings.class);
        super.onCreate(savedInstanceState);
        // Deliberately no startup permission prompt. Capacitor's bridge asks
        // for each permission at the moment the feature needs it - camera
        // and microphone through the WebView media request
        // (BridgeWebChromeClient.onPermissionRequest), location through
        // onGeolocationPermissionsShowPrompt - which is exactly the
        // contextual behavior the user asked for. A denied permission is
        // then handled honestly in the UI (open the app's settings page
        // via the HermesAppSettings plugin).
    }
}
