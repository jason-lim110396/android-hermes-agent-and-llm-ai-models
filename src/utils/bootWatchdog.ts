// Server-rendered boot watchdog handover.
//
// layout.tsx renders a plain-HTML panel that stays invisible until a 7s CSS
// animation reveals it, so a WebView whose bundle never loads can never look
// like an empty app. The panel is only meant for that case.
//
// Hiding it from the mount effect alone is too late: on a low-end phone the
// bundle can take longer than 7s to download, parse and hydrate, and a healthy
// app would show a blocking "Hermes did not finish starting" panel. So the
// panel is disarmed as soon as the client bundle starts executing - this
// module runs that at evaluation time, which is before any startup call that
// could throw.

const WATCHDOG_ID = 'hermes-boot-fallback';

export function disarmBootWatchdog(): void {
  if (typeof document === 'undefined') return;
  const panel = document.getElementById(WATCHDOG_ID);
  if (!panel) return;
  // Cancel the reveal animation as well as hiding: a cancelled animation
  // cannot bring the panel back on a later frame.
  panel.style.animation = 'none';
  panel.style.visibility = 'hidden';
  panel.style.opacity = '0';
  panel.style.display = 'none';
}

disarmBootWatchdog();
