// Native boot-screen handover.
//
// Android can keep the WebView surface white after the system splash is gone,
// even when the renderer has already painted. MainActivity covers that gap
// with a dark native screen. The native side dismisses it on the first draw
// plus a short grace; this ready() call is an earlier-dismiss optimisation.
//
// On the plain web there is no native boot screen, so this is a no-op.

import { Capacitor, registerPlugin } from '@capacitor/core';

interface HermesBootPlugin {
  ready(): Promise<{ acknowledged: boolean }>;
}

let bootPlugin: HermesBootPlugin | null = null;
let acknowledged = false;

/** Prefer the plugin object Capacitor injected into the page. */
function getWindowPlugin(): HermesBootPlugin | null {
  try {
    const injected = (window as unknown as {
      Capacitor?: { Plugins?: Record<string, { ready?: () => Promise<{ acknowledged: boolean }> }> };
    }).Capacitor?.Plugins?.HermesBoot;
    if (injected && typeof injected.ready === 'function') {
      return injected as unknown as HermesBootPlugin;
    }
  } catch (_) {}
  return null;
}

function getPlugin(): HermesBootPlugin | null {
  const injected = getWindowPlugin();
  if (injected) return injected;
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return null;
    if (!bootPlugin) bootPlugin = registerPlugin<HermesBootPlugin>('HermesBoot');
    return bootPlugin;
  } catch {
    return null;
  }
}

function attempt(attemptNumber: number): void {
  if (acknowledged) return;
  const plugin = getPlugin();
  try {
    console.warn(
      '[HermesBoot] ready attempt=' +
        attemptNumber +
        ' native=' +
        Capacitor.isNativePlatform() +
        ' platform=' +
        Capacitor.getPlatform() +
        ' injected=' +
        Boolean(getWindowPlugin()) +
        ' plugin=' +
        Boolean(plugin)
    );
  } catch (_) {}

  if (!plugin) {
    if (attemptNumber < 6) setTimeout(() => attempt(attemptNumber + 1), 400);
    return;
  }

  try {
    plugin
      .ready()
      .then((result) => {
        acknowledged = true;
        console.warn('[HermesBoot] ready acknowledged ' + JSON.stringify(result));
      })
      .catch((error) => {
        console.warn('[HermesBoot] ready attempt ' + attemptNumber + ' failed: ' + String(error));
        if (attemptNumber < 6) setTimeout(() => attempt(attemptNumber + 1), 400);
      });
  } catch (error) {
    console.warn('[HermesBoot] ready threw: ' + String(error));
    if (attemptNumber < 6) setTimeout(() => attempt(attemptNumber + 1), 400);
  }
}

export function notifyWebViewReady(): void {
  attempt(0);
}
