package com.boxhead.game;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens this app's own page in the Android system settings.
 *
 * After a user permanently denies a permission, Android auto-denies every
 * later request without showing any dialog, so a feature can only say so and
 * point at the settings page. Without this plugin the web UI had no way to
 * send the user there.
 */
@CapacitorPlugin(name = "HermesAppSettings")
public class HermesAppSettings extends Plugin {

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve(new JSObject());
        } catch (Exception ex) {
            call.reject("Could not open app settings: " + ex.getMessage());
        }
    }
}
