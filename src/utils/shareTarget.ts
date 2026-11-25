// Android share sheet -> composer.
//
// When the user shares a link or a note from another app and picks Hermes,
// Android delivers an ACTION_SEND intent to MainActivity instead of a
// launcher intent. The native `HermesShare` plugin keeps the text parked and,
// when a composer is already listening, also emits `sharedText` for an instant
// insert. Both paths land here: the text becomes an unsent draft in the Chat
// composer, never an auto-send. The parked copy is cleared by whichever path
// took it - a read through getPendingText(), or an acknowledgement after the
// event was inserted - so one share becomes one draft.
//
// On the plain web (desktop preview, QA harness) there is no share intent to
// read. Every helper is then a harmless no-op that returns no text, so the UI
// never shows a draft that was not really shared.

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** Payload of the native `sharedText` event and of `getPendingText()`. */
export interface SharedTextPayload {
  /** Shared text (a link, a note, a selection). Empty when nothing was shared. */
  text: string;
  /** Epoch milliseconds when the share arrived; 0 when unknown. */
  receivedAt: number;
}

/** Payload of `sharedNotice` and `getPendingNotice()`. */
export interface SharedNoticePayload {
  /** Honest reason the share could not become a draft (e.g. an image). */
  notice: string;
  receivedAt: number;
}

interface HermesSharePlugin {
  getPendingText(): Promise<SharedTextPayload>;
  getPendingNotice(): Promise<SharedNoticePayload>;
  /** Clears the parked copy that a listener already inserted. */
  acknowledgeShared(options: { receivedAt: number }): Promise<unknown>;
  /** Opens the Android share sheet for an outgoing reply. */
  shareText(options: { text: string; subject?: string }): Promise<{ opened: boolean }>;
  addListener(
    eventName: 'sharedText',
    listenerFunc: (data: SharedTextPayload) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'sharedNotice',
    listenerFunc: (data: SharedNoticePayload) => void
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

let sharePlugin: HermesSharePlugin | null = null;

function getSharePlugin(): HermesSharePlugin | null {
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return null;
    if (!sharePlugin) {
      sharePlugin = registerPlugin<HermesSharePlugin>('HermesShare');
    }
    return sharePlugin;
  } catch {
    return null;
  }
}

/** The shared text with surrounding whitespace removed, or null when blank. */
function normalizeSharedText(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Tell the native side a listener inserted the share with this `receivedAt`,
 * so the parked copy is not handed out a second time. Best effort: a failed
 * acknowledgement only risks the native side keeping a copy that the next
 * read would consume, never a lost or duplicated draft on this page.
 */
function acknowledgeShared(plugin: HermesSharePlugin, receivedAt: unknown): void {
  if (typeof receivedAt !== 'number' || receivedAt <= 0) return;
  try {
    plugin.acknowledgeShared({ receivedAt }).catch(() => {});
  } catch {
    // A bridge that is already gone has nothing left to clear.
  }
}

/**
 * Read the text that launched the app (a share from another app), once.
 *
 * Returns null on the web, when nothing was shared, or when the bridge is
 * unavailable - it never throws and never invents text.
 */
export async function consumePendingSharedText(): Promise<string | null> {
  const plugin = getSharePlugin();
  if (!plugin) return null;
  try {
    const result = await plugin.getPendingText();
    return normalizeSharedText(result?.text);
  } catch {
    return null;
  }
}

/** True when a reply can leave through a real share sheet on this platform. */
export function canShareToApps(): boolean {
  if (getSharePlugin()) return true;
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Outcome of an outgoing share; only `shared` means the sheet was handed off. */
export type ShareOutcome = 'shared' | 'cancelled' | 'unavailable';

/**
 * Hand a reply to the Android share sheet.
 *
 * Android WebView has no Web Share API, so `navigator.share()` is never
 * available on the phone: the native plugin opens the real chooser. On the web
 * build the browser share sheet is used instead. A cancelled sheet is not an
 * error, and an unavailable one must not be reported as shared.
 */
export async function shareTextToApps(text: string, subject?: string): Promise<ShareOutcome> {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return 'unavailable';

  const plugin = getSharePlugin();
  if (plugin) {
    try {
      await plugin.shareText({ text: trimmed, subject });
      return 'shared';
    } catch {
      return 'unavailable';
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: subject, text: trimmed });
      return 'shared';
    } catch (err) {
      // The user closing the sheet is not a failure; offer nothing afterwards.
      return (err as { name?: string } | null)?.name === 'AbortError' ? 'cancelled' : 'unavailable';
    }
  }

  return 'unavailable';
}

/** Read a parked "cannot use this share" notice once. */export async function consumePendingShareNotice(): Promise<string | null> {
  const plugin = getSharePlugin();
  if (!plugin) return null;
  try {
    const result = await plugin.getPendingNotice();
    return normalizeSharedText(result?.notice);
  } catch {
    return null;
  }
}

/** Subscribe to unsupported-share notices; safe no-op on the web. */
export function startShareNoticeListener(onNotice: (notice: string) => void): () => void {
  const plugin = getSharePlugin();
  if (!plugin) return () => {};

  let cancelled = false;
  let handle: PluginListenerHandle | null = null;

  try {
    plugin
      .addListener('sharedNotice', (data) => {
        const notice = normalizeSharedText(data?.notice);
        if (!cancelled && notice) {
          onNotice(notice);
          // Inserted once: clear the parked copy so a later mount or a cold
          // start cannot show the same notice again.
          acknowledgeShared(plugin, data?.receivedAt);
        }
      })
      .then((added) => {
        if (cancelled) {
          added.remove().catch(() => {});
          return;
        }
        handle = added;
      })
      .catch(() => {});
  } catch {
    return () => {};
  }

  return () => {
    cancelled = true;
    if (handle) {
      handle.remove().catch(() => {});
      handle = null;
    }
  };
}

/**
 * Subscribe to shares that arrive while the app is already running.
 *
 * Returns an unsubscribe function; calling it is always safe, even on the web
 * or when the native listener never attached.
 */
export function startShareTargetListener(onText: (text: string) => void): () => void {
  const plugin = getSharePlugin();
  if (!plugin) return () => {};

  let cancelled = false;
  let handle: PluginListenerHandle | null = null;

  try {
    plugin
      .addListener('sharedText', (data) => {
        const text = normalizeSharedText(data?.text);
        if (!cancelled && text) {
          onText(text);
          // The parked copy is the fallback for a listener that outlived its
          // page; once this page inserted the share, drop it natively.
          acknowledgeShared(plugin, data?.receivedAt);
        }
      })
      .then((added) => {
        // Unsubscribed before the native side answered: drop it immediately so
        // a re-mount does not leave two listeners on the same event.
        if (cancelled) {
          added.remove().catch(() => {});
          return;
        }
        handle = added;
      })
      .catch(() => {});
  } catch {
    return () => {};
  }

  return () => {
    cancelled = true;
    if (handle) {
      handle.remove().catch(() => {});
      handle = null;
    }
  };
}
