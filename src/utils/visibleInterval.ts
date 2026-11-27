/**
 * Battery Saver utility: a drop-in setInterval replacement that suspends
 * callback execution while the document is hidden (e.g. the Android app is
 * backgrounded and the Capacitor WebView keeps JS timers alive). The timer
 * keeps ticking but no work happens, and the callback runs once immediately
 * when the page becomes visible again so the UI refreshes promptly on resume.
 */

export function startVisibleInterval(callback: () => void, ms: number): () => void {
  // SSR safety: no document on the server. Return a no-op cancel function.
  if (typeof document === 'undefined') {
    return () => {};
  }

  // Skip the cadence tick right after an immediate visibility fire so the
  // average cadence is preserved.
  let skipNextTick = false;

  const run = () => {
    if (!document.hidden) {
      callback();
    }
  };

  const handleVisibilityChange = () => {
    if (!document.hidden) {
      // Refresh promptly on resume: run the callback once when visible again.
      run();
      skipNextTick = true;
    }
  };

  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', handleVisibilityChange);
  const timer = setInterval(() => {
    if (skipNextTick) {
      skipNextTick = false;
      return;
    }
    run();
  }, ms);

  // Cancel function: clears the timer and removes the listener.
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
