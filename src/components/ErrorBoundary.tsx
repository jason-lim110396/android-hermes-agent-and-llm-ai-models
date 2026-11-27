'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

const CRASH_LOG_PREFIX = '[Hermes Crash Guard]';
const MAX_RECORDED_ERRORS = 10;
const REPEAT_CRASH_WINDOW_MS = 30_000;

export interface CrashRecord {
  message: string;
  source: string;
  timestamp: number;
}

// In-memory ring buffer of the most recent global exceptions (last 10 entries)
const recentErrors: CrashRecord[] = [];

function recordError(message: string, source: string) {
  recentErrors.push({ message, source, timestamp: Date.now() });
  if (recentErrors.length > MAX_RECORDED_ERRORS) {
    recentErrors.shift();
  }
  console.warn(`${CRASH_LOG_PREFIX} ${source}: ${message}`);
}

// Exposed for diagnostics tooling; not rendered anywhere in the UI
export function getRecentErrors(): CrashRecord[] {
  return [...recentErrors];
}

// Register global exception handlers exactly once per browser session
let globalHandlersRegistered = false;

export function registerGlobalCrashHandlers() {
  if (typeof window === 'undefined' || globalHandlersRegistered) return;
  globalHandlersRegistered = true;

  // Capture phase: resource-load <error> events do not bubble, so only a capturing
  // listener sees them; script errors dispatched at window still arrive in the target phase
  if (typeof window !== 'undefined') window.addEventListener('error', (event: ErrorEvent) => {
    // Resource-load failures (script/img/link/svg) arrive with the failing element as
    // the event target and an empty message, instead of a script error on window
    const target = event.target as EventTarget | null;
    if (target !== null && target !== window) {
      const element = target as HTMLElement | SVGElement;
      const url = (element as HTMLImageElement).src || (element as HTMLLinkElement).href || '';
      recordError(
        `Failed to load <${element.tagName.toLowerCase()}>${url ? `: ${url}` : ''}`,
        'resource-load'
      );
      return;
    }
    recordError(event.message || 'Unknown script error', 'window.onerror');
  }, true);

  if (typeof window !== 'undefined') window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? 'unknown rejection');
    recordError(reason, 'unhandledrejection');
  });
}

// Attach immediately when this module loads in a client bundle; no-op on the server
if (typeof window !== 'undefined') {
  registerGlobalCrashHandlers();
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** 'fullscreen' covers the whole app as a last resort; 'tab' renders a compact recovery panel inside one studio tab */
  variant?: 'fullscreen' | 'tab';
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  isRepeatCrash: boolean;
}

// Recovery timestamps keyed by fault fingerprint (error message). getDerivedStateFromError
// is static and cannot read instance state, so this map lets it detect repeat crashes
// atomically while the fallback is still being derived, before anything paints. Keying by
// fingerprint keeps recoveries isolated per fault instead of one global slot masking others.
const recentRecoveries = new Map<string, number>();

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      isRepeatCrash: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const message = error.message || String(error);
    // Computed during the render phase so a repeat crash paints the Full Reload button
    // immediately with no one-render flash. Only this exact fault (matching message)
    // recovered within the window counts as a repeat.
    const recoveredAt = recentRecoveries.get(message);
    const isRepeatCrash =
      recoveredAt !== undefined && Date.now() - recoveredAt < REPEAT_CRASH_WINDOW_MS;
    return {
      hasError: true,
      errorMessage: message,
      isRepeatCrash,
    };
  }

  componentDidCatch(error: Error) {
    recordError(error.message || String(error), 'ErrorBoundary');
  }

  handleRecovery = () => {
    const fingerprint = this.state.errorMessage;
    if (fingerprint) {
      const now = Date.now();
      // Opportunistically prune entries older than the window so the map cannot grow unboundedly
      recentRecoveries.forEach((timestamp, key) => {
        if (now - timestamp >= REPEAT_CRASH_WINDOW_MS) {
          recentRecoveries.delete(key);
        }
      });
      recentRecoveries.set(fingerprint, now);
    }
    this.setState({
      hasError: false,
      errorMessage: '',
      isRepeatCrash: false,
    });
  };

  handleFullReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Compact in-tab fallback: the header and tab navigation stay alive around it
    if (this.props.variant === 'tab') {
      return (
        <div className="w-full h-full bg-zinc-950 text-white flex flex-col items-center justify-center gap-4 px-6 py-8 font-sans select-none overflow-y-auto">
          <div className="flex flex-col items-center gap-3 text-center max-w-sm w-full">
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-amber-950/80 border border-amber-500/40 shadow-md">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>

            <h2 className="text-base font-bold text-zinc-100">This tab tripped a neural circuit</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              An unexpected error interrupted this tab. Everything stays on-device, nothing was lost
              or sent anywhere.
            </p>

            {/* Runtime fault details in a small mono block */}
            <div className="w-full rounded-xl bg-zinc-900/80 border border-zinc-800/80 px-3 py-2 text-left">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Runtime Fault</p>
              <code className="block max-h-32 overflow-y-auto text-[11px] font-mono text-rose-300 break-all leading-relaxed">
                {this.state.errorMessage || 'Unknown error'}
              </code>
            </div>

            {this.state.isRepeatCrash && (
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                The identical fault repeated shortly after recovery. Try a full reload to reset the
                session state.
              </p>
            )}

            <div className="flex w-full flex-col items-stretch gap-2 mt-1">
              <button
                onClick={this.handleRecovery}
                className="flex min-h-12 w-full items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-black transition-all cursor-pointer shadow-md ring-1 ring-white/20 active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Recovery</span>
              </button>

              {this.state.isRepeatCrash && (
                <button
                  onClick={this.handleFullReload}
                  title="The exact same fault resurfaced within 30 seconds of recovery, reload the full session"
                  className="flex min-h-12 w-full items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition-all cursor-pointer shadow-md shadow-rose-600/40 active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Full Reload</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Fullscreen fallback of last resort for the whole-app boundary
    return (
      <div className="fixed inset-0 w-full h-full bg-zinc-950 text-white flex flex-col items-center justify-center gap-5 px-6 py-8 font-sans select-none overflow-y-auto">
        <div className="flex flex-col items-center gap-3 text-center max-w-md w-full">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-950/80 border border-amber-500/40 shadow-md">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
          </div>

          <h1 className="text-xl font-bold text-zinc-100">Something tripped a neural circuit</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            An unexpected error interrupted this session. Everything stays on-device, nothing was lost or sent
            anywhere.
          </p>

          {/* Runtime fault details in a small mono block */}
          <div className="w-full rounded-xl bg-zinc-900/80 border border-zinc-800/80 px-3 py-2 text-left">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Runtime Fault</p>
            <code className="block max-h-32 overflow-y-auto text-[11px] font-mono text-rose-300 break-all leading-relaxed">
              {this.state.errorMessage || 'Unknown error'}
            </code>
          </div>

          {this.state.isRepeatCrash && (
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              The identical fault repeated shortly after recovery. Try a full reload to reset the session state.
            </p>
          )}

          <div className="flex w-full flex-col items-stretch gap-2 mt-1">
            <button
              onClick={this.handleRecovery}
              className="flex min-h-12 w-full items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-black transition-all cursor-pointer shadow-md ring-1 ring-white/20 active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Recovery</span>
            </button>

            {this.state.isRepeatCrash && (
              <button
                onClick={this.handleFullReload}
                title="The exact same fault resurfaced within 30 seconds of recovery, reload the full session"
                className="flex min-h-12 w-full items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition-all cursor-pointer shadow-md shadow-rose-600/40 active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Full Reload</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
