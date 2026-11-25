// Native boot-screen handover.
//
// Android can keep the WebView surface white after the system splash is gone,
// even when the renderer has already painted. MainActivity covers that gap
// with a dark native screen; this call removes it after React has committed
// and painted its first frame, so the user never sees a bare white WebView.
//
// On the plain web there is no native boot screen, so this is a no-op.

import { Capacitor, registerPlugin } from '@capacitor/core';

interface HermesBootPlugin {
  ready(): Promise<{ acknowledged: boolean }>;
}

let bootPlugin: HermesBootPlugin | null = null;

function getBootPlugin(): HermesBootPlugin | null {
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return null;
    if (!bootPlugin) bootPlugin = registerPlugin<HermesBootPlugin>('HermesBoot');
    return bootPlugin;
  } catch {
    return null;
  }
}

export function notifyWebViewReady(): void {
  const plugin = getBootPlugin();
  if (!plugin) return;
  try {
    plugin.ready().catch(() => {});
  } catch {
    // A missing bridge only means the native timeout will reveal the WebView.
  }
}
