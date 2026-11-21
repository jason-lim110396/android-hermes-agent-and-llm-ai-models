// Screen Wake Lock for heavy on-device work: while inference, voice or a
// model download is running, Android would otherwise dim and sleep the
// screen, which suspends WebView JS timers and can corrupt long WebGPU/WASM
// runs. Holding a screen wake lock keeps the generation alive.
//
// Features:
// - Automatic screen lock while heavy tasks run
// - Low-battery safety cutoff (releases if battery <= 15% and discharging)
// - User preference toggle persisted to localStorage ('hermes_wake_lock_enabled')
// - Active state listener subscriptions

type Sentinel = { released: boolean; release: () => Promise<void> };

let activeSentinel: Sentinel | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let holdDesired = false;
let requestId = 0;
let isBatterySaverActive = false;
let userPrefEnabled = true;

const listeners = new Set<(active: boolean) => void>();

function notifyListeners(): void {
  const active = !!activeSentinel && !activeSentinel.released;
  listeners.forEach((fn) => {
    try {
      fn(active);
    } catch (_) {}
  });
}

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export function isWakeLockActive(): boolean {
  return !!activeSentinel && !activeSentinel.released;
}

export function getWakeLockUserPreference(): boolean {
  return userPrefEnabled;
}

export function setWakeLockUserPreference(enabled: boolean): void {
  userPrefEnabled = enabled;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem('hermes_wake_lock_enabled', String(enabled));
    } catch (_) {}
  }
  if (!enabled && activeSentinel) {
    releaseWakeLockImmediate();
  } else if (enabled && holdDesired) {
    requestLock();
  }
}

export function subscribeWakeLockState(listener: (active: boolean) => void): () => void {
  listeners.add(listener);
  listener(isWakeLockActive());
  return () => {
    listeners.delete(listener);
  };
}

async function requestLock(): Promise<void> {
  if (!isWakeLockSupported() || !userPrefEnabled || isBatterySaverActive) return;
  const thisRequest = ++requestId;
  try {
    const granted: Sentinel = await (navigator as any).wakeLock.request('screen');
    if (thisRequest !== requestId || !holdDesired || !userPrefEnabled || isBatterySaverActive) {
      if (!granted.released) {
        try {
          await granted.release();
        } catch (_) {}
      }
      return;
    }
    activeSentinel = granted;
    notifyListeners();
  } catch (_) {
    if (thisRequest === requestId) {
      activeSentinel = null;
      notifyListeners();
    }
  }
}

function handleVisibility(): void {
  if (document.visibilityState === 'visible' && holdDesired && userPrefEnabled && !isBatterySaverActive) {
    requestLock();
  }
}

async function releaseWakeLockImmediate(): Promise<void> {
  const sentinel = activeSentinel;
  activeSentinel = null;
  notifyListeners();
  if (sentinel && !sentinel.released) {
    try {
      await sentinel.release();
    } catch (_) {}
  }
}

if (typeof window !== 'undefined') {
  try {
    const saved = window.localStorage.getItem('hermes_wake_lock_enabled');
    if (saved !== null) userPrefEnabled = saved === 'true';
  } catch (_) {}

  window.addEventListener('visibilitychange', handleVisibility);

  if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
    (navigator as any).getBattery().then((battery: any) => {
      const updateBattery = () => {
        isBatterySaverActive = battery.level <= 0.15 && !battery.charging;
        if (isBatterySaverActive && activeSentinel) {
          releaseWakeLockImmediate();
        }
      };
      updateBattery();
      battery.addEventListener('levelchange', updateBattery);
      battery.addEventListener('chargingchange', updateBattery);
    }).catch(() => {});
  }
}

/**
 * Hold a screen wake lock while heavy work is running. Safe to call
 * repeatedly; the lock is requested once and released shortly after the
 * last release call (short grace period covers chained agent steps).
 */
export function holdWakeLock(): void {
  if (typeof window === 'undefined') return;
  holdDesired = true;
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  if (!activeSentinel && userPrefEnabled && !isBatterySaverActive) {
    requestLock();
  }
}

/** Release the wake lock a short grace period after the last call. */
export function releaseWakeLock(): void {
  if (typeof window === 'undefined') return;
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(async () => {
    releaseTimer = null;
    holdDesired = false;
    await releaseWakeLockImmediate();
  }, 2000);
}
