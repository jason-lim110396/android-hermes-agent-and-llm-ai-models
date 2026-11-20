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

  window.addEventListener('error', (event: ErrorEvent) => {
    recordError(event.message || 'Unknown script error', 'window.onerror');
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
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
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  isRepeatCrash: boolean;
  recoveredAt: number | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      isRepeatCrash: false,
      recoveredAt: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error.message || String(error),
    };
  }

  componentDidCatch(error: Error) {
    recordError(error.message || String(error), 'ErrorBoundary');
    // If the same fault resurfaces shortly after a recovery, offer a full reload instead
    const isRepeatCrash =
      this.state.recoveredAt !== null && Date.now() - this.state.recoveredAt < REPEAT_CRASH_WINDOW_MS;
    this.setState({ isRepeatCrash });
  }

  handleRecovery = () => {
    this.setState({
      hasError: false,
      errorMessage: '',
      isRepeatCrash: false,
      recoveredAt: Date.now(),
    });
  };

  handleFullReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

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
            <code className="block text-[11px] font-mono text-rose-300 break-all leading-relaxed">
              {this.state.errorMessage || 'Unknown error'}
            </code>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
            <button
              onClick={this.handleRecovery}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-black transition-all cursor-pointer shadow-md ring-1 ring-white/20 active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Recovery</span>
            </button>

            {this.state.isRepeatCrash && (
              <button
                onClick={this.handleFullReload}
                title="The same fault resurfaced shortly after recovery, reload the full session"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition-all cursor-pointer shadow-md shadow-rose-600/40 active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Full Reload</span>
              </button>
            )}
          </div>

          {this.state.isRepeatCrash && (
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              This fault repeated shortly after recovery. Try a full reload to reset the session state.
            </p>
          )}
        </div>
      </div>
    );
  }
}
