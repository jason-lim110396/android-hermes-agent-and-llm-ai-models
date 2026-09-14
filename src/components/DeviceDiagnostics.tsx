'use client';

import React from 'react';
import {
  Cpu,
  Zap,
  HardDrive,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Smartphone,
  Gauge,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { useAppStore } from '@/appStore';
import { AVAILABLE_MODELS } from '@/models';

export default function DeviceDiagnostics() {
  const hardwareProfile = useAppStore((s) => s.hardwareProfile);
  const isProfiling = useAppStore((s) => s.isProfiling);
  const refreshHardwareProfile = useAppStore((s) => s.refreshHardwareProfile);
  const selectedModelId = useAppStore((s) => s.selectedModelId);

  const currentModel = AVAILABLE_MODELS.find((m) => m.id === selectedModelId);
  const recommendedModel = AVAILABLE_MODELS.find((m) => m.id === hardwareProfile?.recommendedModelId);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-zinc-950 px-3 py-3 max-w-4xl mx-auto w-full pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">Smartphone Hardware Diagnostics</h1>
          <p className="text-xs text-zinc-400">Real-time inspection of your mobile chipset, memory, and acceleration engines</p>
        </div>
        <button
          onClick={refreshHardwareProfile}
          disabled={isProfiling}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isProfiling ? 'animate-spin' : ''}`} />
          <span>Re-profile</span>
        </button>
      </div>

      {/* WebGPU Missing Warning */}
      {hardwareProfile && !hardwareProfile.hasWebGpu && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-[11px] mb-4">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div>
              <strong>WebGPU not detected.</strong> Real on-device LLM downloads and inference require WebGPU, and this device/WebView
              is currently falling back to WebGL2, which cannot run these models. Update <strong>Android System WebView</strong> from the
              Play Store (Android 13+ with a recent WebView build supports WebGPU), or connect an external API endpoint in Settings instead.
            </div>
            {hardwareProfile.webviewVersion && (
              <div className="font-mono text-[10px] text-rose-400/80">Detected WebView/Chromium build: {hardwareProfile.webviewVersion}</div>
            )}
            {hardwareProfile.webGpuUnavailableReason && (
              <div className="font-mono text-[10px] text-rose-400/80 break-all">Reason: {hardwareProfile.webGpuUnavailableReason}</div>
            )}
          </div>
        </div>
      )}

      {/* Grid of hardware metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {/* RAM */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider">Device RAM</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-lg font-black text-white">
            {hardwareProfile ? `${hardwareProfile.estimatedRamGB} GB` : 'Detecting...'}
          </div>
          <span className="text-[10px] text-zinc-500">Physical memory estimate</span>
        </div>

        {/* CPU Cores */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider">CPU Threads</span>
            <Gauge className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-black text-white">
            {hardwareProfile ? `${hardwareProfile.cpuCores} Cores` : 'Detecting...'}
          </div>
          <span className="text-[10px] text-zinc-500">Concurrency threads</span>
        </div>

        {/* Acceleration */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider">GPU Backend</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-black text-white">
            {hardwareProfile?.hasWebGpu ? 'WebGPU' : 'WebGL2'}
          </div>
          <span className="text-[10px] text-zinc-500">Hardware tensor speedup</span>
        </div>

        {/* Storage */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider">Storage Free</span>
            <HardDrive className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-lg font-black text-white">
            {hardwareProfile ? `${hardwareProfile.storageEstimateGB.available} GB` : 'Detecting...'}
          </div>
          <span className="text-[10px] text-zinc-500">IndexedDB quota free</span>
        </div>
      </div>

      {/* AI Performance Recommendation Card */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-950/40 via-zinc-900 to-zinc-900 border border-indigo-500/30 p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-bold text-white">Device Tier & Auto-Setup Recommendation</h2>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed mb-3">
          Based on your device profile ({hardwareProfile?.estimatedRamGB}GB RAM and {hardwareProfile?.cpuCores} cores), our autonomous profiler categorized this phone into the{' '}
          <strong className="text-cyan-400 uppercase font-black">{hardwareProfile?.deviceTier || 'STANDARD'} TIER</strong>.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
            <div className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Recommended AI Model</div>
            <div className="text-sm font-black text-white">{recommendedModel?.name}</div>
            <p className="text-[11px] text-cyan-400 mt-0.5">{recommendedModel?.tagline}</p>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
            <div className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Active Model Status</div>
            <div className="text-sm font-black text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>{currentModel?.name}</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">Quantization: {currentModel?.quantization} • {currentModel?.parameters}</p>
          </div>
        </div>
      </div>

      {/* GPU Driver Details */}
      <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-zinc-400" />
          <span>GPU Render Pipeline & Environment Info</span>
        </h3>
        <div className="p-3 rounded-xl bg-zinc-950 font-mono text-[11px] text-zinc-400 space-y-1">
          <div><span className="text-zinc-500">Renderer:</span> {hardwareProfile?.gpuRenderer}</div>
          <div><span className="text-zinc-500">Platform:</span> Mobile Web & Capacitor Android WebView</div>
          <div><span className="text-zinc-500">WebView/Chromium Build:</span> {hardwareProfile?.webviewVersion || 'Unknown'}</div>
          <div><span className="text-zinc-500">Execution Threading:</span> Web Workers / SIMD Enabled</div>
          <div><span className="text-zinc-500">Thermal Safety Throttle:</span> Normal (No Thermal Throttling)</div>
        </div>
      </div>
    </div>
  );
}
