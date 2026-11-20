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

async function requestLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  try {
    // Re-requesting while a lock is held is a no-op on the platform side.
    activeSentinel = await (navigator as any).wakeLock.request('screen');
  } catch (_) {
    // Denied (battery saver, unsupported WebView, document hidden): best-effort.
    activeSentinel = null;
  }
}

function handleVisibility(): void {
  if (document.visibilityState === 'visible' && activeSentinel !== null) {
    // The OS releases wake locks when the document is hidden; re-request on
    // return so a long generation keeps the screen awake after a tab switch.
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
    const sentinel = activeSentinel;
    activeSentinel = null;
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch (_) {}
    }
  }, 2000);
}
