// Speech-to-text front door for the app.
//
// Android System WebView has no `SpeechRecognition` object at all, so the mic
// entry points (voice call, chat dictation, voice studio) could only record
// audio and never produced a transcript. This helper drives the native
// `HermesSTT` Capacitor plugin (android.speech.SpeechRecognizer) on the
// installed app, and falls back to the browser's Web Speech API on a desktop
// browser preview.
//
// When neither engine exists it reports the real reason. It never invents a
// transcript: a session that cannot listen returns `started: false` with a
// reason the UI shows as-is.

import { Capacitor, registerPlugin } from '@capacitor/core';

export type SpeechInputEngine = 'native' | 'web' | 'none';

export type SpeechFailureReason =
  | 'no_recognizer'
  | 'permission_denied'
  | 'busy'
  | 'no_match'
  | 'no_speech'
  | 'network'
  | 'audio'
  | 'server'
  | 'client'
  | 'rate_limited'
  | 'language_unsupported'
  | 'unknown'
  | 'stopped';

export interface SpeechFailure {
  reason: SpeechFailureReason;
  message: string;
  /** True for silence/no-match, where retrying is reasonable. */
  recoverable: boolean;
}

export interface SpeechStartResult {
  started: boolean;
  engine: SpeechInputEngine;
  lang?: string;
  /** Native recognizer session id; stale events from an older run carry a different id. */
  session?: number;
  reason?: SpeechFailureReason;
  message?: string;
}

export interface SpeechSessionState {
  /** Final segments confirmed in this session, joined with spaces. */
  finalText: string;
  /** Current unconfirmed partial, empty when nothing is being heard. */
  interimText: string;
}

export interface SpeechSessionHandlers {
  onStart?: (engine: SpeechInputEngine) => void;
  onUpdate?: (state: SpeechSessionState) => void;
  /** One newly confirmed segment (not the accumulated text). */
  onFinal?: (text: string) => void;
  onError?: (failure: SpeechFailure) => void;
  onEnd?: (state: SpeechSessionState & { reason?: string }) => void;
}

export interface SpeechSessionOptions {
  lang?: string;
  /** Keep listening after end-of-speech (native auto-restarts). */
  continuous?: boolean;
}

export interface SpeechSession {
  readonly engine: SpeechInputEngine;
  start(): Promise<SpeechStartResult>;
  stop(): void;
  abort(): void;
  isActive(): boolean;
  getState(): SpeechSessionState;
}

interface HermesSTTPlugin {
  isAvailable(): Promise<{
    available: boolean;
    engine?: string;
    service?: string;
    reason?: string;
  }>;
  start(options: { lang?: string; continuous?: boolean }): Promise<SpeechStartResult>;  stop(): Promise<{ stopped: boolean }>;
  addListener?: (
    event: 'sttStart' | 'sttSpeechStart' | 'sttPartial' | 'sttFinal' | 'sttError' | 'sttEnd',
    listener: (data: Record<string, unknown>) => void
  ) => Promise<unknown>;
}

function isNativeAndroid(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === 'android'
    );
  } catch {
    return false;
  }
}

let sttPlugin: HermesSTTPlugin | null = null;
function getSttPlugin(): HermesSTTPlugin | null {
  if (!isNativeAndroid()) return null;
  if (!sttPlugin) {
    sttPlugin = registerPlugin<HermesSTTPlugin>('HermesSTT');
  }
  return sttPlugin;
}

interface WebSpeechResult {
  isFinal?: boolean;
  0?: { transcript?: string };
}

interface WebSpeechEvent {
  resultIndex: number;
  results: ArrayLike<WebSpeechResult>;
}

interface WebSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: WebSpeechEvent) => void) | null;
  onerror: ((event: { error?: string } | null) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type WebSpeechCtor = new () => WebSpeechRecognition;

function getWebSpeechCtor(): WebSpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: WebSpeechCtor;
    webkitSpeechRecognition?: WebSpeechCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Which engine this build can attempt, without an async probe. */
export function getSpeechInputEngine(): SpeechInputEngine {
  if (getSttPlugin()) return 'native';
  if (getWebSpeechCtor()) return 'web';
  return 'none';
}

/** True when some speech input path exists (native app or supporting browser). */
export function hasSpeechInput(): boolean {
  return getSpeechInputEngine() !== 'none';
}

export interface SpeechAvailability {
  available: boolean;
  engine: SpeechInputEngine;
  reason?: SpeechFailureReason;
  message?: string;
}

const NO_ENGINE_MESSAGE =
  'Voice input needs the installed Android app: this browser has no speech recognition.';

/**
 * Ask the native recognizer whether a service is really installed. On the web
 * this is a synchronous capability check.
 */
export async function probeSpeechInput(): Promise<SpeechAvailability> {
  const plugin = getSttPlugin();
  if (plugin) {
    try {
      const result = await plugin.isAvailable();
      if (result?.available) {
        return { available: true, engine: 'native' };
      }
      return {
        available: false,
        engine: 'native',
        reason: 'no_recognizer',
        message: 'No speech recognition service is installed on this device.',
      };
    } catch (error) {
      return {
        available: false,
        engine: 'native',
        reason: 'no_recognizer',
        message: `Speech recognition is unavailable: ${
          error instanceof Error ? error.message : String(error || 'unknown error')
        }`,
      };
    }
  }
  if (getWebSpeechCtor()) return { available: true, engine: 'web' };
  return {
    available: false,
    engine: 'none',
    reason: 'no_recognizer',
    message: NO_ENGINE_MESSAGE,
  };
}

const FAILURE_MESSAGES: Record<SpeechFailureReason, string> = {
  no_recognizer: NO_ENGINE_MESSAGE,
  permission_denied: 'Microphone permission is required for voice input.',
  busy: 'The speech recognizer is already running. Try again in a moment.',
  no_match: 'No words were recognized. Try speaking again.',
  no_speech: 'No speech was detected.',
  network: 'Speech recognition needs a network connection.',
  audio: 'The microphone audio could not be captured.',
  server: 'The speech recognition service failed.',
  client: 'The speech recognizer could not start.',
  rate_limited: 'The speech service is busy. Try again in a moment.',
  language_unsupported: 'This device has no speech model for the chosen language.',
  unknown: 'Speech recognition stopped unexpectedly.',
  stopped: 'Voice input was stopped.',
};

function failure(reason: SpeechFailureReason, message?: string): SpeechFailure {
  return {
    reason,
    message: message || FAILURE_MESSAGES[reason] || FAILURE_MESSAGES.unknown,
    recoverable: reason === 'no_match' || reason === 'no_speech',
  };
}

function mapWebError(code: string | undefined): SpeechFailureReason {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission_denied';
    case 'no-speech':
      return 'no_speech';
    case 'audio-capture':
      return 'audio';
    case 'network':
      return 'network';
    case 'aborted':
      return 'stopped';
    case 'language-not-supported':
      return 'unknown';
    default:
      return 'unknown';
  }
}

// Only one recognition session can own the microphone; native events are
// delivered to the module, not to the object that called start().
let activeNativeSession: NativeSpeechSession | null = null;
let nativeEventsBound = false;

async function ensureNativeEvents(plugin: HermesSTTPlugin): Promise<void> {
  if (nativeEventsBound || typeof plugin.addListener !== 'function') return;
  const sessionOf = (data: Record<string, unknown>) =>
    typeof data?.session === 'number' ? data.session : undefined;
  try {
    await plugin.addListener('sttStart', (data) =>
      activeNativeSession?.handleStart(sessionOf(data))
    );
    await plugin.addListener('sttSpeechStart', (data) =>
      activeNativeSession?.handleSpeechStart(sessionOf(data))
    );
    await plugin.addListener('sttPartial', (data) =>
      activeNativeSession?.handlePartial(String(data?.text ?? ''), sessionOf(data))
    );
    await plugin.addListener('sttFinal', (data) =>
      activeNativeSession?.handleFinal(String(data?.text ?? ''), sessionOf(data))
    );
    await plugin.addListener('sttError', (data) =>
      activeNativeSession?.handleError(
        String(data?.reason ?? 'unknown'),
        typeof data?.message === 'string' ? data.message : undefined,
        sessionOf(data)
      )
    );
    await plugin.addListener('sttEnd', (data) =>
      activeNativeSession?.handleEnd(
        typeof data?.reason === 'string' ? data.reason : undefined,
        sessionOf(data)
      )
    );
    nativeEventsBound = true;
  } catch (_) {
    // If listener binding fails the start result still reports the truth; the
    // session simply cannot stream partials. Leave the flag unset so a later
    // start retries the binding instead of silently losing partials forever.
  }
}

class NativeSpeechSession implements SpeechSession {
  readonly engine: SpeechInputEngine = 'native';

  private finalText = '';
  private interimText = '';
  private active = false;
  private startNotified = false;
  private ended = false;
  private suppressCallbacks = false;
  /** Native recognizer session id; filters events from an older run. */
  private nativeSession: number | null = null;
  /** True between plugin.start() being called and its result arriving. */
  private startPending = false;

  constructor(
    private readonly handlers: SpeechSessionHandlers,
    private readonly options: SpeechSessionOptions
  ) {}

  async start(): Promise<SpeechStartResult> {
    const plugin = getSttPlugin();
    if (!plugin) {
      return {
        started: false,
        engine: 'none',
        reason: 'no_recognizer',
        message: NO_ENGINE_MESSAGE,
      };
    }
    if (this.active) {
      return {
        started: false,
        engine: 'native',
        reason: 'busy',
        message: FAILURE_MESSAGES.busy,
      };
    }
    await ensureNativeEvents(plugin);
    this.ended = false;
    this.suppressCallbacks = false;
    this.nativeSession = null;
    this.startPending = true;
    try {
      const result = await plugin.start({
        lang: this.options.lang || 'en-US',
        continuous: this.options.continuous === true,
      });
      this.startPending = false;
      if (this.suppressCallbacks) {
        // abort() ran while this start was in flight: never bind the new
        // session over the one the caller already moved on to.
        this.active = false;
        return {
          started: false,
          engine: 'native',
          reason: 'stopped',
          message: FAILURE_MESSAGES.stopped,
        };
      }
      if (!result?.started) {
        this.active = false;
        return {
          started: false,
          engine: 'native',
          reason: (result?.reason as SpeechFailureReason) || 'unknown',
          message: result?.message,
        };
      }
      this.nativeSession = typeof result.session === 'number' ? result.session : null;
      // Bind only after start() succeeded. A stop() from the previous session
      // emits its end while this start is in flight; binding earlier let that
      // stale end trigger an auto-rearm and a duplicate "busy" start.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      activeNativeSession = this;
      this.active = true;
      this.notifyStart();
      return { started: true, engine: 'native', lang: result.lang, session: result.session };
    } catch (error) {
      this.startPending = false;
      this.active = false;
      return {
        started: false,
        engine: 'native',
        reason: 'unknown',
        message: `Speech recognition could not start: ${
          error instanceof Error ? error.message : String(error || 'unknown error')
        }`,
      };
    }
  }

  stop(): void {
    // Tell the native side even when this object is not active: a continuous
    // session can leave the recognizer armed without a JS owner, and only the
    // plugin knows. Stopping an idle recognizer is a no-op there.
    if (this.startPending) this.suppressCallbacks = true;
    this.active = false;
    this.interimText = '';
    const plugin = getSttPlugin();
    try {
      plugin?.stop().catch(() => {});
    } catch (_) {}
  }

  abort(): void {
    // Only tell the native side to stop when it might actually be running or
    // waiting on the permission dialog. An abort before start() must not
    // create bridge traffic or an end event for a session that never began.
    const shouldStop = this.active || this.startPending;
    this.suppressCallbacks = true;
    this.active = false;
    this.interimText = '';
    if (shouldStop) {
      const plugin = getSttPlugin();
      try {
        plugin?.stop().catch(() => {});
      } catch (_) {}
    }
    if (activeNativeSession === this) activeNativeSession = null;
  }

  isActive(): boolean {
    return this.active;
  }

  getState(): SpeechSessionState {
    return { finalText: this.finalText, interimText: this.interimText };
  }

  private notifyStart() {
    if (this.startNotified) return;
    this.startNotified = true;
    this.handlers.onStart?.('native');
  }

  /** Events from a previous recognizer run must not touch this session. */
  private acceptsEvent(session?: number): boolean {
    if (session === undefined) return true;
    if (this.nativeSession === null) return false;
    return session === this.nativeSession;
  }

  handleStart(session?: number) {
    if (!this.active || this.suppressCallbacks || !this.acceptsEvent(session)) return;
    this.notifyStart();
  }

  handleSpeechStart(session?: number) {
    // Nothing to show yet; the UI keeps the listening state until partials.
    if (!this.active || !this.acceptsEvent(session)) return;
  }

  handlePartial(text: string, session?: number) {
    if (!this.active || this.suppressCallbacks || !this.acceptsEvent(session)) return;
    this.interimText = text;
    this.handlers.onUpdate?.(this.getState());
  }

  handleFinal(text: string, session?: number) {
    if (!this.active || this.suppressCallbacks || !this.acceptsEvent(session)) return;
    const clean = text.trim();
    this.interimText = '';
    if (clean) {
      this.finalText = this.finalText ? `${this.finalText} ${clean}` : clean;
    }
    // Update before final: a consumer that commits the turn on onFinal and
    // clears its draft would otherwise see the draft repopulated right after,
    // and send the same utterance twice when the session ends.
    this.handlers.onUpdate?.(this.getState());
    if (clean) {
      this.handlers.onFinal?.(clean);
    }
  }

  handleError(reason: string, message?: string, session?: number) {
    if (this.suppressCallbacks || !this.acceptsEvent(session)) return;
    this.active = false;
    this.interimText = '';
    if (activeNativeSession === this) activeNativeSession = null;
    this.handlers.onError?.(failure((reason as SpeechFailureReason) || 'unknown', message));
  }

  handleEnd(reason?: string, session?: number) {
    if (this.suppressCallbacks || this.ended || !this.acceptsEvent(session)) return;
    this.ended = true;
    this.active = false;
    this.interimText = '';
    if (activeNativeSession === this) activeNativeSession = null;
    this.handlers.onEnd?.({ ...this.getState(), reason });
  }
}

class WebSpeechSession implements SpeechSession {
  readonly engine: SpeechInputEngine = 'web';

  private recognition: WebSpeechRecognition | null = null;
  private finalText = '';
  private interimText = '';
  private active = false;
  private suppressCallbacks = false;
  private ended = false;

  constructor(
    private readonly handlers: SpeechSessionHandlers,
    private readonly options: SpeechSessionOptions
  ) {}

  async start(): Promise<SpeechStartResult> {
    const Ctor = getWebSpeechCtor();
    if (!Ctor) {
      return {
        started: false,
        engine: 'none',
        reason: 'no_recognizer',
        message: NO_ENGINE_MESSAGE,
      };
    }
    if (this.active) {
      return { started: false, engine: 'web', reason: 'busy', message: FAILURE_MESSAGES.busy };
    }
    try {
      const recognition = new Ctor();
      recognition.lang = this.options.lang || 'en-US';
      recognition.continuous = this.options.continuous === true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (this.suppressCallbacks) return;
        this.active = true;
        this.handlers.onStart?.('web');
      };
      recognition.onresult = (event: WebSpeechEvent) => {
        if (this.suppressCallbacks) return;
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result?.[0]?.transcript || '';
          if (!text) continue;
          if (result.isFinal) {
            const clean = text.trim();
            if (clean) {
              this.finalText = this.finalText ? `${this.finalText} ${clean}` : clean;
              this.handlers.onFinal?.(clean);
            }
          } else {
            interim += text;
          }
        }
        this.interimText = interim.trim();
        this.handlers.onUpdate?.(this.getState());
      };
      recognition.onerror = (event: { error?: string } | null) => {
        if (this.suppressCallbacks) return;
        const reason = mapWebError(event?.error);
        this.active = false;
        this.interimText = '';
        if (reason === 'stopped') return;
        this.handlers.onError?.(failure(reason));
      };
      recognition.onend = () => {
        if (this.suppressCallbacks || this.ended) return;
        this.ended = true;
        this.active = false;
        this.interimText = '';
        this.handlers.onEnd?.(this.getState());
      };

      this.recognition = recognition;
      this.ended = false;
      this.suppressCallbacks = false;
      recognition.start();
      // Some browsers fire onstart late; report the attempt as started so the
      // UI does not sit in "connecting" forever.
      this.active = true;
      return { started: true, engine: 'web', lang: recognition.lang };
    } catch (error) {
      this.active = false;
      this.recognition = null;
      return {
        started: false,
        engine: 'web',
        reason: 'unknown',
        message: `Speech recognition could not start: ${
          error instanceof Error ? error.message : String(error || 'unknown error')
        }`,
      };
    }
  }

  stop(): void {
    if (!this.recognition) return;
    this.active = false;
    this.interimText = '';
    try {
      this.recognition.stop();
    } catch (_) {}
  }

  abort(): void {
    this.suppressCallbacks = true;
    this.active = false;
    this.interimText = '';
    try {
      this.recognition?.abort();
    } catch (_) {}
    this.recognition = null;
  }

  isActive(): boolean {
    return this.active;
  }

  getState(): SpeechSessionState {
    return { finalText: this.finalText, interimText: this.interimText };
  }
}

/**
 * Create a speech-input session. `start()` is the only async step and returns
 * exactly what happened; callbacks stream the transcript.
 */
export function createSpeechInputSession(
  handlers: SpeechSessionHandlers = {},
  options: SpeechSessionOptions = {}
): SpeechSession {
  const engine = getSpeechInputEngine();
  if (engine === 'native') return new NativeSpeechSession(handlers, options);
  if (engine === 'web') return new WebSpeechSession(handlers, options);

  // No engine: every call fails honestly instead of throwing or pretending.
  return {
    engine: 'none',
    async start() {
      return {
        started: false,
        engine: 'none',
        reason: 'no_recognizer',
        message: NO_ENGINE_MESSAGE,
      };
    },
    stop() {},
    abort() {},
    isActive() {
      return false;
    },
    getState() {
      return { finalText: '', interimText: '' };
    },
  };
}
