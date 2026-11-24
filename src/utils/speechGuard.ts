// Speech-synthesis guard helpers for mobile WebViews and native Android.
//
// Android WebViews are inconsistent with `speechSynthesis`:
// 1. In some WebViews, `SpeechSynthesisUtterance` is completely omitted, throwing ReferenceError.
// 2. In other WebViews, `speechSynthesis` exists but has no voice engine connected (silent no-op).
// 3. Native Android apps running Capacitor can speak directly via `HermesTTS` (android.speech.tts.TextToSpeech).
// 4. Acoustic Web Audio fallback is used when no synthesis is available or when speech errors.

import { Capacitor, registerPlugin } from '@capacitor/core';

// --- Global Polyfill for SpeechSynthesisUtterance ---
if (typeof window !== 'undefined') {
  if (typeof (window as any).SpeechSynthesisUtterance === 'undefined') {
    class MockSpeechSynthesisUtterance extends EventTarget {
      text: string;
      lang: string = 'en-US';
      pitch: number = 1.0;
      rate: number = 1.0;
      volume: number = 1.0;
      voice: any = null;
      onstart: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => any) | null = null;
      onend: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => any) | null = null;
      onerror: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisErrorEvent) => any) | null = null;
      onpause: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => any) | null = null;
      onresume: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => any) | null = null;
      onmark: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => any) | null = null;
      onboundary: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => any) | null = null;

      constructor(text?: string) {
        super();
        this.text = text || '';
      }
    }
    (window as any).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
    if (typeof (globalThis as any) !== 'undefined') {
      (globalThis as any).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
    }
  }
}

export interface HermesTTSPlugin {
  isAvailable(): Promise<{ available: boolean; initializing?: boolean; reason?: string }>;
  speak(options: { text: string; rate?: number; pitch?: number; lang?: string }): Promise<{
    success: boolean;
    utteranceId?: string;
    reason?: string;
    languageFallback?: boolean;
    lang?: string;
  }>;
  stop(): Promise<{ stopped: boolean }>;
}

let hermesTTSInstance: HermesTTSPlugin | null = null;
function getHermesTTS(): HermesTTSPlugin | null {
  if (hermesTTSInstance) return hermesTTSInstance;
  try {
    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
      hermesTTSInstance = registerPlugin<HermesTTSPlugin>('HermesTTS');
      return hermesTTSInstance;
    }
  } catch (_) {}
  return null;
}

/** True when the window can actually attempt speech synthesis. */
export function hasSpeechSynthesis(): boolean {
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return true;
  try {
    return (
      'speechSynthesis' in window &&
      typeof (window as any).SpeechSynthesisUtterance !== 'undefined' &&
      typeof (window as any).SpeechSynthesisUtterance === 'function'
    );
  } catch (_) {
    return false;
  }
}

/**
 * Safe utterance factory that never throws ReferenceError on barebones Android WebViews.
 * Returns null if SpeechSynthesisUtterance is not supported.
 */
export function createSpeechUtterance(text: string): SpeechSynthesisUtterance | null {
  try {
    const UtteranceClass = typeof window !== 'undefined' ? (window as any).SpeechSynthesisUtterance : null;
    if (!UtteranceClass) return null;
    return new UtteranceClass(text);
  } catch (_) {
    return null;
  }
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

const START_WATCHDOG_MS = 3000;
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
 * Speak an utterance or text with watchdogs and native Android TTS support.
 */
export function speakGuarded(
  utterance: SpeechSynthesisUtterance | null,
  fallbackText?: string,
  options?: { rate?: number; pitch?: number; lang?: string }
): boolean {
  const textToSpeak = utterance?.text || fallbackText || '';
  if (!textToSpeak.trim()) return false;

  clearTimers();
  const my = ++sessionId;
  const finishIfCurrent = () => {
    if (my === sessionId) finish();
  };

  setActive(true);

  // 1. Try Native Android TextToSpeech via Capacitor Plugin if running on native app
  if (Capacitor.isNativePlatform()) {
    const nativeTTS = getHermesTTS();
    if (nativeTTS) {
      const rate = options?.rate ?? (utterance?.rate || 1.0);
      const pitch = options?.pitch ?? (utterance?.pitch || 1.0);
      const lang = options?.lang ?? (utterance?.lang || 'en-US');

      nativeTTS
        .speak({ text: textToSpeak, rate, pitch, lang })
        .then((result) => {
          if (!result || result.success === false) {
            // No engine, missing voice data or a rejected request. Reporting
            // "speaking" here is how the old build looked like it worked while
            // the phone stayed silent, so release the state and play the
            // audible chime instead of a fake countdown.
            console.warn('[speechGuard] native TTS could not speak:', result?.reason || 'unknown');
            playWebAudioSpeechChime(textToSpeak);
            setTimeout(finishIfCurrent, 1200);
            return;
          }
          if (result.languageFallback && result.lang) {
            console.warn(`[speechGuard] voice data for ${lang} is not installed; spoke with ${result.lang}`);
          }
          // Estimate duration roughly at ~150wpm (2.5 words/sec) with minimum 1.5s
          const wordCount = textToSpeak.split(/\s+/).length;
          const durationMs = Math.max(1500, Math.min(30000, (wordCount / 2.5) * 1000));
          setTimeout(finishIfCurrent, durationMs);
        })
        .catch(() => {
          // Native TTS failed, fall back to Web Audio Chime
          playWebAudioSpeechChime(textToSpeak);
          setTimeout(finishIfCurrent, 1200);
        });
      return true;
    }
  }

  // 2. Browser speechSynthesis
  if (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.speechSynthesis.speak === 'function' &&
    utterance
  ) {
    if (!utterance.lang) utterance.lang = options?.lang || 'en-US';
    if (utterance.volume === undefined || utterance.volume === null || utterance.volume <= 0) {
      utterance.volume = 1.0;
    }

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    } catch (_) {}

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
      playWebAudioSpeechChime(textToSpeak);
      finishIfCurrent();
      try {
        prevError?.call(utterance, event);
      } catch (_) {}
    };

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    } catch (_) {
      playWebAudioSpeechChime(textToSpeak);
      if (my === sessionId) finish();
      return false;
    }

    startTimer = setTimeout(() => {
      if (my !== sessionId) return;
      startTimer = null;
      let engineSpeaking = false;
      try {
        engineSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.pending;
      } catch (_) {}
      if (!started && !engineSpeaking) {
        playWebAudioSpeechChime(textToSpeak);
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

  // 3. Fallback: Web Audio Chime
  playWebAudioSpeechChime(textToSpeak);
  setTimeout(finishIfCurrent, 1200);
  return true;
}

/** Cancel any active utterance and clear all watchdogs/flags. */
export function cancelSpeech(): void {
  sessionId++;
  if (Capacitor.isNativePlatform()) {
    try {
      getHermesTTS()?.stop().catch(() => {});
    } catch (_) {}
  }
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch (_) {}
  finish();
}
