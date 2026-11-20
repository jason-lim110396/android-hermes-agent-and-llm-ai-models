// Speech-synthesis guard helpers for mobile WebViews.
//
// Android WebViews are inconsistent with `speechSynthesis`: a request can be
// accepted with no available TTS engine (onstart never fires), or `onend` can
// be dropped after playback finishes. Both cases leave the UI's speaking flag
// wrong - stuck false (user thinks nothing happened) or stuck true (the user
// cannot trigger speech again). A single guarded session keeps that flag
// honest for every call site.

/** True when the window can actually attempt speech synthesis. */
export function hasSpeechSynthesis(): boolean {
  if (typeof window === 'undefined') return false;
  return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

/**
 * Milliseconds to wait for onstart before assuming the request silently
 * failed. Low-end Android WebViews can be slow to start TTS, so this is
 * deliberately generous; we additionally check that the engine is not
 * speaking before clearing a slow-but-working request.
 */
const START_WATCHDOG_MS = 3000;
/**
 * Hard cap for a single utterance. Call sites truncate text to mobile-friendly
 * chunks (<=500 chars), so a normal utterance is far shorter than this. It only
 * exists to clear a stuck flag when a WebView drops `onend`.
 */
const MAX_SPEECH_MS = 60_000;

type SpeakingListener = (active: boolean) => void;

let active = false;
let startTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<SpeakingListener>();

function clearTimers() {
  if (startTimer) {
    clearTimeout(startTimer);
    startTimer = null;
  }
  if (maxTimer) {
    clearTimeout(maxTimer);
    maxTimer = null;
  }
}

function setActive(next: boolean) {
  if (active === next) return;
  active = next;
  listeners.forEach((listener) => {
    try {
      listener(next);
    } catch (_) {}
  });
}

function finish() {
  clearTimers();
  setActive(false);
}

/** Subscribe to guarded speaking-state changes. Returns an unsubscribe fn. */
export function onSpeakingChange(listener: SpeakingListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current guarded speaking state. */
export function isSpeakingActive(): boolean {
  return active;
}

/**
 * Speak an utterance with watchdogs. Sets the active flag immediately (so the
 * stop control appears even before onstart) and clears it on end, error,
 * cancel, a missed onstart, or a dropped onend. Returns true when the request
 * was handed to the engine.
 */
export function speakGuarded(utterance: SpeechSynthesisUtterance): boolean {
  if (!hasSpeechSynthesis()) {
    setActive(false);
    return false;
  }
  clearTimers();
  try {
    window.speechSynthesis.cancel();
  } catch (_) {}

  setActive(true);
  let started = false;

  const prevStart = utterance.onstart;
  utterance.onstart = (event) => {
    started = true;
    if (startTimer) {
      clearTimeout(startTimer);
      startTimer = null;
    }
    try {
      prevStart?.call(utterance, event);
    } catch (_) {}
  };
  const prevEnd = utterance.onend;
  utterance.onend = (event) => {
    finish();
    try {
      prevEnd?.call(utterance, event);
    } catch (_) {}
  };
  const prevError = utterance.onerror;
  utterance.onerror = (event) => {
    finish();
    try {
      prevError?.call(utterance, event);
    } catch (_) {}
  };

  try {
    window.speechSynthesis.speak(utterance);
  } catch (_) {
    finish();
    return false;
  }

  startTimer = setTimeout(() => {
    startTimer = null;
    // A slow engine may not have fired onstart yet but is already speaking;
    // do not clear the flag in that case. Only clear when nothing is active.
    let engineSpeaking = false;
    try {
      engineSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.pending;
    } catch (_) {}
    if (!started && !engineSpeaking) finish();
  }, START_WATCHDOG_MS);
  maxTimer = setTimeout(() => {
    maxTimer = null;
    finish();
  }, MAX_SPEECH_MS);
  return true;
}

/** Cancel any active utterance and clear all watchdogs/flags. */
export function cancelSpeech(): void {
  try {
    if (hasSpeechSynthesis()) window.speechSynthesis.cancel();
  } catch (_) {}
  finish();
}
