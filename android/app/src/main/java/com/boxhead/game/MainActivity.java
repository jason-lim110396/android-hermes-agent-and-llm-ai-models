package com.boxhead.game;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register BEFORE super.onCreate: the bridge (and the plugin header
        // injected into the WebView) is built during super.onCreate, so a
        // plugin added afterwards would be invisible to the web side.
        registerPlugin(HermesAppSettings.class);
        registerPlugin(HermesTTS.class);
        registerPlugin(HermesOCR.class);
        registerPlugin(HermesSTT.class);
        registerPlugin(HermesShare.class);
        super.onCreate(savedInstanceState);
        // A share-sheet launch arrives as this activity's intent, not as a
        // launcher intent. Hand it to the share plugin before the web layer
        // asks for it, so the first getPendingText() finds the text.
        HermesShare.handleIntent(getIntent());
        // Deliberately no startup permission prompt. Capacitor's bridge asks
        // for each permission at the moment the feature needs it - camera
        // and microphone through the WebView media request
        // (BridgeWebChromeClient.onPermissionRequest), location through
        // onGeolocationPermissionsShowPrompt - which is exactly the
        // contextual behavior the user asked for. A denied permission is
        // then handled honestly in the UI (open the app's settings page
        // via the HermesAppSettings plugin).
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // A share that arrives while the app is already open (launchMode
        // singleTask): keep it as the current intent and hand the text over
        // without a restart.
        setIntent(intent);
        HermesShare.handleIntent(intent);
    }
}
