// Session guard for voice callbacks.
//
// SpeechRecognition and speechSynthesis deliver their events asynchronously.
// A stopped or superseded session can still deliver its last onstart/onresult/
// onend after a newer session has started - on Android WebViews this is
// common. PR #141 gave speechSynthesis a generation token so a late utterance
// event cannot clear the new session's speaking flag; this helper applies the
// same rule to SpeechRecognition callers and to the local UI mirrors they own.

/** The parts of a SpeechRecognition result event these call sites use.
 * Each entry is an alternatives list that also carries the DOM isFinal flag. */
export interface RecognitionResultLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
}

/** The part of a SpeechRecognition error event the call sites read. */
export interface RecognitionErrorLike {
  error?: string;
}

export interface RecognitionLike {
  onstart: ((event: unknown) => void) | null;
  onend: ((event: unknown) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onresult: ((event: RecognitionResultLike) => void) | null;
}

export interface GuardedRecognitionHandlers {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (event: RecognitionErrorLike) => void;
  onResult?: (event: RecognitionResultLike) => void;
}

/**
 * Wire a recognition instance so only the session that is current at event
 * time may run a handler. `isCurrent` is captured per request by the caller
 * (typically "token matches AND this instance is still the active one").
 */
export function attachGuardedRecognition(
  recognition: RecognitionLike,
  isCurrent: () => boolean,
  handlers: GuardedRecognitionHandlers
): void {
  recognition.onstart = () => {
    if (isCurrent()) handlers.onStart?.();
  };
  recognition.onend = () => {
    if (isCurrent()) handlers.onEnd?.();
  };
  recognition.onerror = (event) => {
    if (isCurrent()) handlers.onError?.(event);
  };
  recognition.onresult = (event) => {
    if (isCurrent()) handlers.onResult?.(event);
  };
}

/**
 * True when a recorder chunk still belongs to the current voice note.
 * A superseded recorder can deliver one last chunk after cancel/send cleared
 * the buffer; accepting it would mix the old note's audio into a newer one.
 * The final chunk of the note being sent is accepted while finalize is running
 * and the recorder is still the active one.
 */
export function voiceChunkBelongsToCurrentNote(args: {
  chunkRequestId: number;
  currentRequestId: number;
  finalizing: boolean;
  isActiveRecorder: boolean;
}): boolean {
  return (
    args.chunkRequestId === args.currentRequestId ||
    (args.finalizing && args.isActiveRecorder)
  );
}

/**
 * Auto-silence timer manager for speech recognition.
 * Arms a timer whenever new speech/interim results arrive.
 * Calls onSilence() if no further speech event fires within timeoutMs.
 */
export interface SilenceDetector {
  reset: () => void;
  clear: () => void;
  isActive: () => boolean;
}

export function createSilenceDetector(
  timeoutMs: number,
  onSilence: () => void
): SilenceDetector {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    reset: () => {
      if (timer) clearTimeout(timer);
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timer = null;
          onSilence();
        }, timeoutMs);
      }
    },
    clear: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    isActive: () => timer !== null,
  };
}

export interface NoiseGateStatus {
  isGated: boolean;
  db: number;
  threshold: number;
  headroomDb: number;
}

export function evaluateNoiseGate(db: number, thresholdDb: number): NoiseGateStatus {
  const safeDb = Math.max(0, Math.min(100, Math.round(db)));
  const safeThreshold = Math.max(0, Math.min(60, Math.round(thresholdDb)));
  const isGated = safeDb < safeThreshold;
  return {
    isGated,
    db: safeDb,
    threshold: safeThreshold,
    headroomDb: safeDb - safeThreshold,
  };
}

export function getStoredNoiseGateThreshold(defaultVal: number = 18): number {
  if (typeof window === 'undefined') return defaultVal;
  try {
    const raw = localStorage.getItem('hermes_noise_gate_threshold');
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 60) {
        return parsed;
      }
    }
  } catch (_) {}
  return defaultVal;
}

export function setStoredNoiseGateThreshold(val: number): void {
  if (typeof window === 'undefined') return;
  try {
    const clamped = Math.max(0, Math.min(60, Math.round(val)));
    localStorage.setItem('hermes_noise_gate_threshold', clamped.toString());
  } catch (_) {}
}

