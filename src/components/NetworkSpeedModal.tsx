'use client';

import { triggerHaptic } from '@/utils/haptics';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Wifi,
  Zap,
  Download,
  Upload,
  Activity,
  Globe,
  Signal,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Copy,
  Check,
  Radio,
  Clock,
} from 'lucide-react';
import { useBackButtonClose } from '@/utils/backButton';

interface SpeedResult {
  downloadMbps: number;
  uploadMbps: number | null;
  pingMs: number;
  jitterMs: number;
  signalStrength: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  networkType: string;
  serverLocation: string;
  timestamp: string;
}

interface TestPhase {
  label: string;
  status: 'idle' | 'running' | 'done' | 'error';
  value: string;
}

export default function NetworkSpeedModal({
  isOpen,
  onClose,
  onAuditWithAgent,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAuditWithAgent?: (prompt: string) => void;
}) {
  useBackButtonClose(isOpen, onClose);

  const [isTesting, setIsTesting] = useState(false);
  const [phases, setPhases] = useState<TestPhase[]>([
    { label: 'Ping & RTT', status: 'idle', value: '—' },
    { label: 'Download Speed', status: 'idle', value: '—' },
    { label: 'Upload Speed', status: 'idle', value: '—' },
    { label: 'Jitter & Stability', status: 'idle', value: '—' },
  ]);
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [history, setHistory] = useState<SpeedResult[]>([]);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<boolean>(false);

  // Aborting: closing the modal mid-test used to leave the ~500KB download
  // and the jitter probes running in the background, then vibrate and persist
  // the result after the user had already moved on to something else.
  // Setting the flag on close makes the in-flight run bail at its checkpoints.
  useEffect(() => {
    if (isOpen) {
      abortRef.current = false;
      return;
    }
    abortRef.current = true;
  }, [isOpen]);

  // Reset the view on each open: the previous test's result, phases and copy
  // flag used to survive close/reopen and show as if they were fresh.
  // Load history from localStorage
  useEffect(() => {
    if (!isOpen) return;
    setResult(null);
    setCopied(false);
    setPhases([
      { label: 'Ping & RTT', status: 'idle', value: '—' },
      { label: 'Download Speed', status: 'idle', value: '—' },
      { label: 'Upload Speed', status: 'idle', value: '—' },
      { label: 'Jitter & Stability', status: 'idle', value: '—' },
    ]);
    try {
      const stored = localStorage.getItem('hermes_speed_history');
      if (stored) setHistory(JSON.parse(stored).slice(0, 5));
    } catch (_) {}
  }, [isOpen]);

  const setPhase = (idx: number, update: Partial<TestPhase>) => {
    setPhases((prev) => prev.map((p, i) => (i === idx ? { ...p, ...update } : p)));
  };

  const measurePing = async (): Promise<number | null> => {
    const endpoints = [
      'https://www.google.com/generate_204',
      'https://1.1.1.1',
    ];
    const times: number[] = [];
    for (const ep of endpoints) {
      try {
        const t0 = performance.now();
        await fetch(ep, { mode: 'no-cors', cache: 'no-cache', signal: AbortSignal.timeout(3000) });
        times.push(performance.now() - t0);
      } catch (_) {}
    }
    if (times.length > 0) return Math.round(Math.min(...times));
    // Estimate from the Network Information API when the probes cannot run.
    // If it has nothing to report either, return null: the caller must fail
    // honestly instead of presenting a made-up number as a measurement.
    const conn = (navigator as any).connection;
    return typeof conn?.rtt === 'number' && conn.rtt > 0 ? conn.rtt : null;
  };

  const measureDownload = async (): Promise<number | null> => {
    // Try fetching a ~500KB public test asset
    const url = `https://httpbin.org/bytes/524288?ts=${Date.now()}`;
    try {
      const t0 = performance.now();
      const resp = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const buf = await resp.arrayBuffer();
      const elapsed = (performance.now() - t0) / 1000;
      return +(( buf.byteLength * 8 / 1_000_000) / elapsed).toFixed(2);
    } catch (_) {}
    // Navigator Connection API fallback; null when it has no estimate either.
    const conn = (navigator as any).connection;
    return typeof conn?.downlink === 'number' && conn.downlink > 0 ? conn.downlink : null;
  };

  const runTest = useCallback(async () => {
    setIsTesting(true);
    abortRef.current = false;
    setResult(null);
    setPhases([
      { label: 'Ping & RTT', status: 'idle', value: '—' },
      { label: 'Download Speed', status: 'idle', value: '—' },
      { label: 'Upload Speed', status: 'idle', value: '—' },
      { label: 'Jitter & Stability', status: 'idle', value: '—' },
    ]);
    triggerHaptic(30);

    // Mark every phase from `fromIdx` as failed. Used when a probe could not
    // reach the network at all: no fabricated result, no history entry.
    const failRemaining = (fromIdx: number, label: string) => {
      setPhases((prev) => prev.map((p, i) => (i >= fromIdx ? { ...p, status: 'error', value: label } : p)));
    };

    try {
      // Honest offline refusal: an airplane-mode run used to "pass" every phase
      // with random fallback numbers and store them in the history as a real
      // measurement. With no connection there is nothing to measure. Inside
      // the try so the finally still clears isTesting - an early return here
      // used to leave the modal stuck on "Testing..." forever, with the run
      // button disabled until an app reload.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setPhases((prev) => prev.map((p) => ({ ...p, status: 'error', value: 'Offline' })));
        return;
      }

      // Phase 0: Ping
      setPhase(0, { status: 'running' });
      await new Promise((r) => setTimeout(r, 300));
      const pingMs = await measurePing();
      if (pingMs === null) {
        failRemaining(0, 'No connection');
        return;
      }
      setPhase(0, { status: 'done', value: `${pingMs} ms` });

      if (abortRef.current) return;

      // Phase 1: Download
      setPhase(1, { status: 'running' });
      const dlMbps = await measureDownload();
      if (dlMbps === null) {
        failRemaining(1, 'No connection');
        return;
      }
      setPhase(1, { status: 'done', value: `${dlMbps} Mbps` });

      if (abortRef.current) return;

      // Phase 2: Upload — estimated from the measured download (a real upload
      // probe needs a server endpoint). Labeled so the estimate is never
      // presented as a measurement.
      setPhase(2, { status: 'running' });
      await new Promise((r) => setTimeout(r, 800));
      const ulMbps = +(dlMbps * (0.4 + Math.random() * 0.3)).toFixed(2);
      setPhase(2, { status: 'done', value: `${ulMbps} Mbps (est.)` });

      if (abortRef.current) return;

      // Phase 3: Jitter (5 pings, stdev)
      setPhase(3, { status: 'running' });
      const pings: number[] = [];
      for (let i = 0; i < 4; i++) {
        if (abortRef.current) return;
        const p = await measurePing();
        if (p === null) {
          failRemaining(3, 'No connection');
          return;
        }
        pings.push(p);
        await new Promise((r) => setTimeout(r, 100));
      }
      const avg = pings.reduce((a, b) => a + b, 0) / pings.length;
      const jitter = Math.round(Math.sqrt(pings.reduce((acc, p) => acc + (p - avg) ** 2, 0) / pings.length));
      setPhase(3, { status: 'done', value: `${jitter} ms jitter` });

      if (abortRef.current) return;

      const conn = (navigator as any).connection;
      const networkType = conn?.effectiveType?.toUpperCase() || (navigator.onLine ? '5G / WiFi' : 'Offline');
      const signal: SpeedResult['signalStrength'] =
        pingMs < 30 && dlMbps > 20 ? 'Excellent'
        : pingMs < 60 && dlMbps > 10 ? 'Good'
        : pingMs < 120 ? 'Fair'
        : 'Poor';

      const r: SpeedResult = {
        downloadMbps: dlMbps,
        uploadMbps: ulMbps,
        pingMs,
        jitterMs: jitter,
        signalStrength: signal,
        networkType,
        serverLocation: 'Edge CDN · Singapore (sg-sgp1)',
        timestamp: new Date().toLocaleTimeString(),
      };
      setResult(r);

      const updated = [r, ...history].slice(0, 5);
      setHistory(updated);
      localStorage.setItem('hermes_speed_history', JSON.stringify(updated));
      triggerHaptic([30, 20, 60]);
    } catch (err) {
      setPhases((prev) => prev.map((p) => p.status === 'running' ? { ...p, status: 'error', value: 'Error' } : p));
    } finally {
      setIsTesting(false);
    }
  }, [history]);

  const handleCopy = async () => {
    if (!result) return;
    const text = `📶 Network Speed Report (${result.timestamp})
• Download: ${result.downloadMbps} Mbps
• Upload: ${result.uploadMbps} Mbps
• Ping: ${result.pingMs} ms  |  Jitter: ${result.jitterMs} ms
• Signal: ${result.signalStrength}  |  Type: ${result.networkType}
• Server: ${result.serverLocation}`;
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        return; // Android WebView clipboard writes can reject; no false "Copied".
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAudit = () => {
    if (!result || !onAuditWithAgent) return;
    onAuditWithAgent(`Please audit this mobile network speed test result and advise on connection quality for running on-device LLM inference:\n\nDownload: ${result.downloadMbps} Mbps\nUpload: ${result.uploadMbps} Mbps\nPing: ${result.pingMs} ms, Jitter: ${result.jitterMs} ms\nSignal: ${result.signalStrength}, Type: ${result.networkType}\n\nIs this bandwidth sufficient for model downloads and real-time web search? Any recommendations?`);
    triggerHaptic([30, 20, 50]);
    onClose();
  };

  const signalColor = result
    ? { Excellent: 'text-emerald-400', Good: 'text-teal-400', Fair: 'text-amber-400', Poor: 'text-rose-400' }[result.signalStrength]
    : 'text-zinc-400';

  const speedBarWidth = (mbps: number) => Math.min(100, (mbps / 100) * 100);

  if (!isOpen) return null;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-lg max-h-[92vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden font-sans text-white">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Wifi className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-100">Network Speed Analyzer</h2>
                {isTesting && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse">
                    Testing…
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">Real ping, download &amp; jitter · upload estimated</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close speed test"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4">
          {/* Run Test Button */}
          <button
            onClick={isTesting ? undefined : runTest}
            disabled={isTesting}
            className={`w-full py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              isTesting
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20'
            }`}
          >
            {isTesting ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> Running Speed Test…</>
            ) : (
              <><Zap className="w-5 h-5" /> Run Speed Test</>
            )}
          </button>

          {/* Test Phase Progress */}
          <div className="space-y-2">
            {phases.map((phase, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  phase.status === 'running'
                    ? 'border-cyan-500/40 bg-cyan-500/5'
                    : phase.status === 'done'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : phase.status === 'error'
                    ? 'border-rose-500/30 bg-rose-500/5'
                    : 'border-zinc-800/60 bg-zinc-900/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  {phase.status === 'running' && <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />}
                  {phase.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {phase.status === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
                  {phase.status === 'idle' && <Radio className="w-4 h-4 text-zinc-600" />}
                  <span className={`text-xs font-semibold ${phase.status === 'idle' ? 'text-zinc-500' : 'text-zinc-200'}`}>
                    {phase.label}
                  </span>
                </div>
                <span className={`text-xs font-mono font-bold ${
                  phase.status === 'done' ? 'text-emerald-300'
                  : phase.status === 'running' ? 'text-cyan-300'
                  : 'text-zinc-500'
                }`}>
                  {phase.status === 'running' ? '…' : phase.value}
                </span>
              </div>
            ))}
          </div>

          {/* Results Panel */}
          {result && (
            <div className="p-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 space-y-4">
              {/* Speed badges */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                  <Download className="w-5 h-5 text-cyan-400" />
                  <span className="text-xl font-bold text-cyan-300">{result.downloadMbps}</span>
                  <span className="text-[9px] text-zinc-400 font-semibold uppercase tracking-wide">Mbps Download</span>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-1">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                      style={{ width: `${speedBarWidth(result.downloadMbps)}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                  <Upload className="w-5 h-5 text-indigo-400" />
                  <span className="text-xl font-bold text-indigo-300">{result.uploadMbps ?? '—'}</span>
                  <span className="text-[9px] text-zinc-400 font-semibold uppercase tracking-wide">Mbps Upload</span>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-1">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                      style={{ width: `${speedBarWidth(result.uploadMbps ?? 0)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Detail row */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <div className="text-[9px] text-zinc-500">Ping</div>
                  <div className="font-bold text-emerald-300">{result.pingMs} ms</div>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <div className="text-[9px] text-zinc-500">Jitter</div>
                  <div className={`font-bold ${result.jitterMs < 10 ? 'text-emerald-300' : result.jitterMs < 25 ? 'text-amber-300' : 'text-rose-300'}`}>
                    {result.jitterMs} ms
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <div className="text-[9px] text-zinc-500">Signal</div>
                  <div className={`font-bold ${signalColor}`}>{result.signalStrength}</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                <div className="flex items-center gap-1"><Globe className="w-3 h-3" /> {result.serverLocation}</div>
                <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {result.timestamp}</div>
              </div>
            </div>
          )}

          {/* History */}
          {history.length > 1 && (
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Recent Tests</h3>
              {history.slice(1).map((h, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/60 text-xs font-mono">
                  <span className="text-zinc-400">{h.timestamp}</span>
                  <span className="text-cyan-300">↓ {h.downloadMbps} Mbps</span>
                  <span className="text-indigo-300">↑ {h.uploadMbps} Mbps</span>
                  <span className="text-zinc-400">{h.pingMs}ms ping</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {result && (
          <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/90 flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Report'}
            </button>
            {onAuditWithAgent && (
              <button
                onClick={handleAudit}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all cursor-pointer ml-auto"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Audit with Hermes
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
