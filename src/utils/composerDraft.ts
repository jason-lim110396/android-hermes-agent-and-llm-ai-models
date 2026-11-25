// Unsent Chat composer draft, kept across an app restart.
//
// The composer text used to live in React state only. Android kills the
// WebView while the app is backgrounded, so a long prompt the user had typed
// by hand - or received from the Android share sheet - disappeared with the
// process. This module parks the last unsent draft in localStorage so the next
// start can put it back in the composer.
//
// Every access is best effort: private mode, a storage policy that blocks
// localStorage or a full quota must never break typing, so a failure simply
// means "no draft". Nothing here runs at module scope, and reads are safe
// during the static export render where `window` does not exist.

const DRAFT_KEY = 'hermes_composer_draft_v1';

// A draft is a prompt, not a document. The cap bounds both the write and the
// restore, so a corrupt or runaway value can neither eat the storage quota nor
// stall the first paint with a huge textarea.
export const MAX_COMPOSER_DRAFT_CHARS = 20000;

/** The stored unsent draft, or '' when there is none (or storage is blocked). */
export function loadComposerDraft(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = window.localStorage.getItem(DRAFT_KEY);
    if (!stored) return '';
    return stored.length > MAX_COMPOSER_DRAFT_CHARS
      ? stored.slice(0, MAX_COMPOSER_DRAFT_CHARS)
      : stored;
  } catch {
    return '';
  }
}

/**
 * Persist the current composer text. Whitespace is kept exactly as typed; a
 * blank draft removes the key so an emptied composer cannot come back.
 */
export function saveComposerDraft(text: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (!text.trim()) {
      window.localStorage.removeItem(DRAFT_KEY);
      return;
    }
    window.localStorage.setItem(
      DRAFT_KEY,
      text.length > MAX_COMPOSER_DRAFT_CHARS ? text.slice(0, MAX_COMPOSER_DRAFT_CHARS) : text
    );
  } catch {
    // Quota full or storage unavailable: the composer keeps working, the draft
    // is just not restored after a restart.
  }
}

/** Drop the stored draft after the text was sent or intentionally discarded. */
export function clearComposerDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // A blocked storage must not turn "send" into an error.
  }
}
