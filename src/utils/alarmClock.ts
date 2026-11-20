// Module-level wake-alarm engine.
//
// The alarm registry used to live in SettingsView component state, so every
// tab switch unmounted it and silently destroyed every pending alarm: the
// user set "wake me in 5 minutes", went back to chat, and nothing fired.
// The registry and its 1-second dispatcher now live at module scope (started
// once per page load), and pending alarms are persisted to localStorage so
// they even survive a WebView process kill. An alarm whose fire time passed
// while the app was dead fires once on restore - a late reminder beats a
// silently lost one.
//
// Side effects (vibrate + Notification) run in the dispatcher body, never
// inside a React state updater, so React 18 StrictMode double-invocation
// cannot duplicate them.

export interface ScheduledAlarm {
  id: string;
  title: string;
  fireAt: number;
  formattedTime: string;
}

const STORAGE_KEY = 'hermes_active_alarms';
const HAPTIC_PREF_KEY = 'hermes_haptic_alerts';

const registry = new Map<string, ScheduledAlarm>();
const listeners = new Set<(alarms: ScheduledAlarm[], fired: ScheduledAlarm[]) => void>();
let engineTimer: ReturnType<typeof setInterval> | null = null;

export function hapticAlertsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const saved = window.localStorage.getItem(HAPTIC_PREF_KEY);
    return saved === null ? true : saved === 'true';
  } catch (_) {
    return true;
  }
}

export function setHapticAlertsPref(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HAPTIC_PREF_KEY, String(enabled));
  } catch (_) {}
}

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...registry.values()]));
  } catch (_) {
    // Storage full or blocked: keep the in-memory alarms running.
  }
}

function isValidAlarm(a: unknown): a is ScheduledAlarm {
  if (!a || typeof a !== 'object') return false;
  const alarm = a as Partial<ScheduledAlarm>;
  return (
    typeof alarm.id === 'string' &&
    typeof alarm.title === 'string' &&
    typeof alarm.fireAt === 'number' &&
    Number.isFinite(alarm.fireAt)
  );
}

function loadPersisted(): void {
  if (typeof window === 'undefined') return;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return;
    for (const a of parsed) {
      if (!isValidAlarm(a)) continue;
      registry.set(a.id, {
        id: a.id,
        title: a.title,
        fireAt: a.fireAt,
        formattedTime: typeof a.formattedTime === 'string' ? a.formattedTime : '',
      });
    }
  } catch (_) {
    // Corrupt vault: self-heal to an empty registry.
  }
}

function fireAlarm(alarm: ScheduledAlarm): void {
  if (hapticAlertsEnabled() && typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([150, 100, 150, 100, 250]);
    } catch (_) {}
  }
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('⏰ Hermes AI Wake Reminder', {
        body: alarm.title,
        icon: '/icon.png',
      });
    } catch (_) {}
  }
}

function notifyListeners(fired: ScheduledAlarm[]): void {
  const list = [...registry.values()];
  for (const cb of listeners) {
    try {
      cb(list, fired);
    } catch (_) {}
  }
}

// Deliberately a plain setInterval (NOT a visibility-gated one): alarms are a
// notification feature and WebView timers keep running while the app is
// backgrounded, so the dispatcher must keep firing when hidden to deliver its
// vibrate/Notification side effects on time.
function startEngine(): void {
  if (engineTimer !== null || typeof window === 'undefined') return;
  engineTimer = setInterval(() => {
    const now = Date.now();
    const due: ScheduledAlarm[] = [];
    for (const alarm of registry.values()) {
      if (alarm.fireAt <= now) due.push(alarm);
    }
    if (due.length === 0) return;
    for (const alarm of due) {
      registry.delete(alarm.id);
      fireAlarm(alarm);
    }
    persist();
    notifyListeners(due);
  }, 1000);
}

/** Schedule a wake alarm. Returns the created alarm. Never throws. */
export function scheduleAlarm(title: string, minutesFromNow: number): ScheduledAlarm {
  const fireAt = Date.now() + minutesFromNow * 60 * 1000;
  const alarm: ScheduledAlarm = {
    id: `alarm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    fireAt,
    formattedTime: new Date(fireAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
  registry.set(alarm.id, alarm);
  persist();
  notifyListeners([]);
  return alarm;
}

/** Cancel a pending alarm by id. Never throws. */
export function cancelAlarm(id: string): void {
  if (registry.delete(id)) {
    persist();
    notifyListeners([]);
  }
}

/** Snapshot of pending alarms (persists across SettingsView remounts). */
export function listActiveAlarms(): ScheduledAlarm[] {
  return [...registry.values()];
}

/**
 * Subscribe to registry changes. The callback receives the full pending list
 * and the alarms that just fired (empty for schedule/cancel events).
 * Returns an unsubscribe function.
 */
export function subscribeAlarms(cb: (alarms: ScheduledAlarm[], fired: ScheduledAlarm[]) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Restore any alarms saved by a previous page load and start the single
// dispatcher. Alarms whose time already passed fire on the first tick.
loadPersisted();
startEngine();
