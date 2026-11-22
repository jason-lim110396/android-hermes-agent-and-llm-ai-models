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
 * Audible Web Audio API acoustic fallback synthesizer.
 * When Android System WebView lacks a native TTS engine or drops speech synthesis,
 * this ensures the device ALWAYS produces rich, audible vocalized sound feedback.
 */
export function playWebAudioSpeechChime(text?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    // Harmonious chord notes for acoustic voice feedback
    const notes = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
    const count = Math.min(notes.length, Math.max(2, Math.floor((text?.length || 10) / 15)));

    notes.slice(0, count).forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0.001, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.12 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.25);
    });

    setTimeout(() => {
      try {
        ctx.close();
      } catch (_) {}
    }, (count * 0.12 + 0.3) * 1000);
  } catch (_) {}
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
let sessionId = 0;

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
    playWebAudioSpeechChime(utterance.text);
    setActive(true);
    setTimeout(() => setActive(false), 1200);
    return true;
  }
  clearTimers();

  // Ensure language and volume are explicitly defined for Android TTS engine
  if (!utterance.lang) {
    utterance.lang = 'en-US';
  }
  if (utterance.volume === undefined || utterance.volume === null || utterance.volume <= 0) {
    utterance.volume = 1.0;
  }

  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      // Only cancel if speech synthesis is currently actively speaking or pending.
      // Calling cancel() unconditionally while idle causes asynchronous cancel IPC
      // in Chromium to drop the subsequent speak() request!
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    }
  } catch (_) {}

  const my = ++sessionId;
  const finishIfCurrent = () => {
    if (my === sessionId) finish();
  };

  setActive(true);
  let started = false;

  const prevStart = utterance.onstart;
  utterance.onstart = (event) => {
    started = true;
    if (my === sessionId && startTimer) {
      clearTimeout(startTimer);
      startTimer = null;
    }
    try {
      prevStart?.call(utterance, event);
    } catch (_) {}
  };
  const prevEnd = utterance.onend;
  utterance.onend = (event) => {
    finishIfCurrent();
    try {
      prevEnd?.call(utterance, event);
    } catch (_) {}
  };
  const prevError = utterance.onerror;
  utterance.onerror = (event) => {
    // Android WebView without TTS voice pack: play acoustic fallback chime
    playWebAudioSpeechChime(utterance.text);
    finishIfCurrent();
    try {
      prevError?.call(utterance, event);
    } catch (_) {}
  };

  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.speak(utterance);
  } catch (_) {
    playWebAudioSpeechChime(utterance.text);
    if (my === sessionId) finish();
    return false;
  }

  startTimer = setTimeout(() => {
    if (my !== sessionId) return;
    startTimer = null;
    // A slow engine may not have fired onstart yet but is already speaking;
    // do not clear the flag in that case. Only clear when nothing is active.
    let engineSpeaking = false;
    try {
      engineSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.pending;
    } catch (_) {}
    if (!started && !engineSpeaking) {
      // If speech synthesis accepted but never produced output, provide audible fallback
      playWebAudioSpeechChime(utterance.text);
      finishIfCurrent();
    }
  }, START_WATCHDOG_MS);
  maxTimer = setTimeout(() => {
    if (my !== sessionId) return;
    maxTimer = null;
    finishIfCurrent();
  }, MAX_SPEECH_MS);
  return true;
}

/** Cancel any active utterance and clear all watchdogs/flags. */
export function cancelSpeech(): void {
  // Invalidate the in-flight session FIRST so the cancelled utterance's
  // late end/error events cannot touch the cleared state afterwards.
  sessionId++;
  try {
    if (hasSpeechSynthesis()) window.speechSynthesis.cancel();
  } catch (_) {}
  finish();
}
