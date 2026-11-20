// Screen Wake Lock for heavy on-device work: while inference, voice or a
// model download is running, Android would otherwise dim and sleep the
// screen, which suspends WebView JS timers and can corrupt long WebGPU/WASM
// runs. Holding a screen wake lock keeps the generation alive.
//
// The API is missing in some WebViews and the lock is silently released by
// the OS under some conditions (e.g. tab switch, battery saver), so this is
// strictly best-effort: every failure is swallowed and the lock is simply
// re-requested when the document becomes visible again.

type Sentinel = { released: boolean; release: () => Promise<void> };

let activeSentinel: Sentinel | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
// Intent flag: true while heavy work wants the lock held, even if the grant
// is still pending or was denied. Gates re-requests on intent, not possession.
let holdDesired = false;
// Monotonic id so a stale grant/reject (settling after a newer request or
// after work ended) can be detected and never clobbers newer state.
let requestId = 0;

async function requestLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  const thisRequest = ++requestId;
  try {
    const granted: Sentinel = await (navigator as any).wakeLock.request('screen');
    if (thisRequest !== requestId || !holdDesired) {
      // Superseded by a newer request, or work ended while the grant was in
      // flight: release immediately instead of leaking a live sentinel.
      if (!granted.released) {
        try {
          await granted.release();
        } catch (_) {}
      }
      return;
    }
    activeSentinel = granted;
  } catch (_) {
    // Denied (battery saver, unsupported WebView, document hidden).
    if (thisRequest === requestId) activeSentinel = null;
  }
}

function handleVisibility(): void {
  // Gate on intent, not possession: if the initial grant was denied, a
  // foreground return retries it even though no sentinel is held.
  if (document.visibilityState === 'visible' && holdDesired) {
    requestLock();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', handleVisibility);
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
  if (!activeSentinel) requestLock();
}

/** Release the wake lock a short grace period after the last call. */
export function releaseWakeLock(): void {
  if (typeof window === 'undefined') return;
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(async () => {
    releaseTimer = null;
    holdDesired = false;
    const sentinel = activeSentinel;
    activeSentinel = null;
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch (_) {}
    }
  }, 2000);
}
