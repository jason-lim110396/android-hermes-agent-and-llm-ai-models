// Network guard helper for mobile inference and connectivity telemetry.

export interface NetworkTelemetry {
  isOnline: boolean;
  effectiveType: string | null;
  rttMs: number | null;
  downlinkMbps: number | null;
  saveData: boolean;
  quality: 'fast' | 'slow' | 'offline';
}

/**
 * Deterministic first-paint value.
 *
 * Node has a global `navigator` object but no `onLine` property, so the old
 * `typeof navigator === 'undefined'` check treated the server as offline and
 * prerendered the "100% Offline Mode" pill. The browser then rendered
 * "4G / 50ms", a text mismatch that React reports as #418 and that left the
 * Android WebView showing server HTML with no working handlers. Components
 * must render this value first and read the real telemetry in an effect.
 */
export const DEFAULT_NETWORK_TELEMETRY: NetworkTelemetry = {
  isOnline: true,
  effectiveType: null,
  rttMs: null,
  downlinkMbps: null,
  saveData: false,
  quality: 'fast',
};

export function isOnline(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true;
  return navigator.onLine;
}

/**
 * Returns comprehensive network telemetry from the browser/Capacitor environment.
 */
export function getNetworkTelemetry(): NetworkTelemetry {
  // A partial SSR navigator (Node) must not be treated as a real offline
  // browser: it would bake "offline" into the prerendered HTML.
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    return { ...DEFAULT_NETWORK_TELEMETRY };
  }

  const online = navigator.onLine;
  const conn = (navigator as any).connection;
  const effectiveType = conn?.effectiveType || (online ? '4g' : null);
  const rttMs = typeof conn?.rtt === 'number' && conn.rtt > 0 ? conn.rtt : null;
  const downlinkMbps = typeof conn?.downlink === 'number' && conn.downlink > 0 ? conn.downlink : null;
  const saveData = Boolean(conn?.saveData);

  const quality: 'fast' | 'slow' | 'offline' = !online
    ? 'offline'
    : (effectiveType === '4g' || effectiveType === '5g' || effectiveType === '3g') && (!rttMs || rttMs < 500)
    ? 'fast'
    : 'slow';

  return {
    isOnline: online,
    effectiveType,
    rttMs,
    downlinkMbps,
    saveData,
    quality,
  };
}

/**
 * Subscribes to window and network connection change events.
 * Returns an unsubscription function.
 */
export function subscribeNetworkChanges(listener: (telemetry: NetworkTelemetry) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = () => listener(getNetworkTelemetry());

  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);

  const conn = (navigator as any).connection;
  if (conn && typeof conn.addEventListener === 'function') {
    conn.addEventListener('change', handler);
  }

  return () => {
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
    if (conn && typeof conn.removeEventListener === 'function') {
      conn.removeEventListener('change', handler);
    }
  };
}
