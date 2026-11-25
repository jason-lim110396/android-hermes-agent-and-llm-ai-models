// Unsent Chat composer drafts, kept per conversation and across an app restart.
//
// The composer text used to live in React state only. Android kills the
// WebView while the app is backgrounded, so a long prompt the user had typed
// by hand - or received from the Android share sheet - disappeared with the
// process. This module parks unsent drafts in localStorage so the next start
// can put them back in the composer.
//
// A draft belongs to the conversation it was typed in. One shared key meant a
// prompt started in one chat showed up in the next chat the user opened, and
// sending it there went to the wrong conversation. Each session now has its own
// key; the Chat view swaps the composer text with the session. The old single
// key is still read once, so a draft left by the previous build is adopted by
// the conversation that is restored on first launch instead of silently lost.
//
// Every access is best effort: private mode, a storage policy that blocks
// localStorage or a full quota must never break typing, so a failure simply
// means "no draft". Nothing here runs at module scope, and reads are safe
// during the static export render where `window` does not exist.

const DRAFT_KEY_PREFIX = 'hermes_composer_draft_v2:';
/** Single-key draft written by the previous build; migrated once on mount. */
const LEGACY_DRAFT_KEY = 'hermes_composer_draft_v1';

// A draft is a prompt, not a document. The cap bounds both the write and the
// restore, so a corrupt or runaway value can neither eat the storage quota nor
// stall the first paint with a huge textarea.
export const MAX_COMPOSER_DRAFT_CHARS = 20000;

function draftKey(sessionId: string): string {
  return `${DRAFT_KEY_PREFIX}${sessionId || 'default'}`;
}

function capDraft(text: string): string {
  return text.length > MAX_COMPOSER_DRAFT_CHARS ? text.slice(0, MAX_COMPOSER_DRAFT_CHARS) : text;
}

/** The unsent draft of this conversation, or '' when there is none. */
export function loadComposerDraft(sessionId: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = window.localStorage.getItem(draftKey(sessionId));
    return stored ? capDraft(stored) : '';
  } catch {
    return '';
  }
}

/**
 * The draft parked under the previous build's single key. Read once on mount
 * and moved to the restored conversation; '' on every other start.
 */
export function loadLegacyComposerDraft(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = window.localStorage.getItem(LEGACY_DRAFT_KEY);
    return stored ? capDraft(stored) : '';
  } catch {
    return '';
  }
}

/** Drop the legacy key after its text was adopted by a conversation. */
export function clearLegacyComposerDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    // Nothing to clean up when storage is blocked.
  }
}

/**
 * Persist the current composer text for one conversation. Whitespace is kept
 * exactly as typed; a blank draft removes the key so an emptied composer cannot
 * come back.
 */
export function saveComposerDraft(sessionId: string, text: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (!text.trim()) {
      window.localStorage.removeItem(draftKey(sessionId));
      return;
    }
    window.localStorage.setItem(draftKey(sessionId), capDraft(text));
  } catch {
    // Quota full or storage unavailable: the composer keeps working, the draft
    // is just not restored after a restart.
  }
}

/** Drop the stored draft after the text was sent or intentionally discarded. */
export function clearComposerDraft(sessionId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(draftKey(sessionId));
  } catch {
    // A blocked storage must not turn "send" into an error.
  }
}
