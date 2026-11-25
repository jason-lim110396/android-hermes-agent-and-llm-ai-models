// Android share sheet -> composer.
//
// When the user shares a link or a note from another app and picks Hermes,
// Android delivers an ACTION_SEND intent to MainActivity instead of a
// launcher intent. The native `HermesShare` plugin parks that text and, if
// the app is already running, emits `sharedText`. Both paths land here: the
// text becomes an unsent draft in the Chat composer, never an auto-send.
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

/** Read a parked "cannot use this share" notice once. */
export async function consumePendingShareNotice(): Promise<string | null> {
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
        if (!cancelled && notice) onNotice(notice);
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
          // This event is the delivery to a live app. Drain the parked copy
          // so a later cold start cannot show the same share a second time.
          plugin.getPendingText().catch(() => {});
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
