package com.boxhead.game;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tiny bridge used only for the boot handover.
 *
 * Android can keep showing the white WebView surface after the system splash
 * is gone, even though the renderer already painted. The web layer calls
 * ready() after its first mounted frame; MainActivity then removes the dark
 * native boot screen and forces the WebView to present that frame.
 */
@CapacitorPlugin(name = "HermesBoot")
public class HermesBoot extends Plugin {

    @PluginMethod
    public void ready(PluginCall call) {
        android.util.Log.i("HermesBoot", "ready() reached native");
        MainActivity.onWebViewReady();
        call.resolve(new JSObject().put("acknowledged", true));
    }
}
