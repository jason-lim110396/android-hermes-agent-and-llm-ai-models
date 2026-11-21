// Native app-settings access and permission-denied predicates.
//
// Contextual permissions: Capacitor's bridge shows the native permission
// dialog at the moment a feature asks for the capability (camera/mic via the
// WebView media request, location via the geolocation prompt). But once the
// user has permanently denied a permission, Android auto-denies every later
// request without showing any dialog - the feature then fails with a
// NotAllowedError. These helpers let each feature detect that state, say so
// honestly, and offer the one real way out: the app's system settings page.

import { Capacitor } from '@capacitor/core';

/** True inside the packaged Android APK (Capacitor android platform). */
export function isNativeAndroidApp(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/** True when the in-app "Open App Settings" button can actually do something. */
export function canOpenNativeAppSettings(): boolean {
  return isNativeAndroidApp();
}

/**
 * Open this app's page in the Android system settings. Returns false (and
 * does nothing) on the plain web or when the native bridge/plugin is
 * unavailable - never claims a success it did not perform.
 */
export function openNativeAppSettings(): boolean {
  if (!canOpenNativeAppSettings()) return false;
  try {
    const plugin = (Capacitor.Plugins as { HermesAppSettings?: { openAppSettings?: () => Promise<unknown> } })
      .HermesAppSettings;
    if (!plugin?.openAppSettings) return false;
    // Fire-and-forget: the app switches to the settings app; a rejected
    // promise (settings page unavailable) must not surface as an
    // unhandled rejection.
    plugin.openAppSettings().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** getUserMedia error names that mean "the permission was denied". */
export function isPermissionDeniedError(err: unknown): boolean {
  const name = (err as { name?: string } | null | undefined)?.name || '';
  return name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError';
}

/** Geolocation error code for a user-denied permission (PERMISSION_DENIED). */
export function isGeolocationPermissionDenied(err: unknown): boolean {
  return (err as { code?: number } | null | undefined)?.code === 1;
}

/** SpeechRecognition error codes for a denied microphone permission. */
export function isSpeechRecognitionPermissionDenied(event: unknown): boolean {
  const error = (event as { error?: string } | null | undefined)?.error;
  return error === 'not-allowed' || error === 'service-not-allowed';
}
