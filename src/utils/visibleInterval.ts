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

  const tick = () => {
    if (!document.hidden) {
      callback();
    }
  };

  const handleVisibilityChange = () => {
    if (!document.hidden) {
      callback();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  const timer = setInterval(tick, ms);

  // Cancel function: clears the timer and removes the listener.
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
