'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Download, Loader2, X, Zap } from 'lucide-react';
import { useAppStore } from '@/appStore';
import { AVAILABLE_MODELS } from '@/models';
import { triggerHaptic } from '@/utils/haptics';

/**
 * Pre-flight model prompt.
 *
 * When a page needs a model that is not on this phone yet, this sheet opens
 * instead of letting the action fail inside inference: the user can download
 * the required weights (with live progress) or switch to a model that is
 * already downloaded, and the original action resumes afterwards.
 *
 * Rendered once from the app shell; the store owns the open/closed state and
 * the promise the caller is waiting on.
 */
export default function ModelGateModal() {
  const gate = useAppStore((s) => s.modelGate);
  const downloads = useAppStore((s) => s.downloads);
  const startDownloadModel = useAppStore((s) => s.startDownloadModel);
  const closeModelGate = useAppStore((s) => s.closeModelGate);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const hardwareProfile = useAppStore((s) => s.hardwareProfile);

  const [showPicker, setShowPicker] = useState(false);

  const modelId = gate?.modelId || '';
  const spec = AVAILABLE_MODELS.find((m) => m.id === modelId);
  const state = downloads[modelId];
  const isReady = !!state?.isReady;
  const isDownloading = !!state?.isDownloading;

  // Continue automatically once the weights land, so "download first, then
  // run" needs no second tap after a long download.
  useEffect(() => {
    if (gate && isReady) {
      const timer = setTimeout(() => closeModelGate(true), 600);
      return () => clearTimeout(timer);
    }
  }, [gate, isReady, closeModelGate]);

  if (!gate || !spec) return null;

  const readyModels = AVAILABLE_MODELS.filter(
    (m) => downloads[m.id]?.isReady && m.id !== modelId
  ).slice(0, 6);

  const ramGb = hardwareProfile?.estimatedRamGB ?? 0;
  const lowRam = ramGb > 0 && ramGb < spec.minRamGB;

  const handleDownload = () => {
    triggerHaptic(20);
    startDownloadModel(modelId);
  };

  const handlePick = (id: string) => {
    triggerHaptic(15);
    setSelectedModelId(id);
    closeModelGate(true);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Model required"
    >
      <div className="w-full sm:max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-start gap-2 px-4 pt-4">
          <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white leading-tight">
              {isReady ? 'Model ready' : 'Model not downloaded'}
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{gate.reason}</p>
          </div>
          <button
            onClick={() => closeModelGate(false)}
            className="p-2 -mr-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 shrink-0"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white truncate">{spec.name}</span>
              <span className="text-[10px] font-mono text-zinc-400 shrink-0">{spec.sizeMB} MB</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
              <span>{spec.parameters}</span>
              <span>·</span>
              <span>{spec.quantization}</span>
              <span>·</span>
              <span>needs {spec.minRamGB} GB RAM</span>
            </div>

            {lowRam && (
              <p className="mt-2 text-[10px] text-amber-300 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>
                  This phone reports {ramGb} GB RAM, below the recommended {spec.minRamGB} GB. It may run
                  slowly or fail to load.
                </span>
              </p>
            )}

            {isDownloading && (
              <div className="mt-3 space-y-1">
                <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.max(2, Math.min(100, state?.progressPct || 0))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>
                    {(state?.downloadedMB || 0).toFixed(0)} / {(state?.totalMB || spec.sizeMB).toFixed(0)} MB
                  </span>
                  <span>{(state?.speedMBs || 0).toFixed(1)} MB/s</span>
                </div>
              </div>
            )}

            {isReady && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                Downloaded - continuing in a moment
              </p>
            )}

            {state?.errorMessage && !isDownloading && !isReady && (
              <p className="mt-2 text-[10px] text-rose-300 leading-snug">
                Last attempt failed: {state.errorMessage}
              </p>
            )}
          </div>
        </div>

        {showPicker && (
          <div className="px-4 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
              Already on this phone
            </p>
            {readyModels.length === 0 ? (
              <p className="text-[11px] text-zinc-400 pb-1">
                No other model is downloaded yet. Download one below, then try again.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto overscroll-contain">
                {readyModels.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handlePick(m.id)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700 text-left min-h-[44px]"
                  >
                    <span className="text-[11px] font-bold text-white truncate">{m.name}</span>
                    <span className="text-[10px] font-mono text-emerald-400 shrink-0 flex items-center gap-1">
                      <Check className="w-3 h-3" /> ready
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="p-4 grid grid-cols-1 gap-2">
          {!isReady && !isDownloading && (
            <button
              onClick={handleDownload}
              className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25"
            >
              <Download className="w-4 h-4" />
              Download {spec.sizeMB} MB, then continue
            </button>
          )}

          {isDownloading && (
            <button
              onClick={() => useAppStore.getState().pauseDownloadModel(modelId)}
              className="w-full min-h-[48px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-bold flex items-center justify-center gap-2 border border-zinc-700"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Downloading - tap to pause
            </button>
          )}

          {!showPicker && (
            <button
              onClick={() => setShowPicker(true)}
              className="w-full min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center justify-center gap-2 border border-zinc-700"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Use a model already downloaded
            </button>
          )}

          <button
            onClick={() => closeModelGate(false)}
            className="w-full min-h-[44px] rounded-xl text-zinc-400 hover:text-white text-xs font-bold"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
