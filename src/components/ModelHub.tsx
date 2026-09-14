'use client';

import React, { useState } from 'react';
import {
  Download,
  Check,
  Cpu,
  HardDrive,
  Bot,
  Zap,
  Trash2,
  AlertTriangle,
  Sparkles,
  Search,
  Volume2,
  Layers,
  Octagon,
  ShieldCheck,
  ShieldAlert,
  MessageSquare,
  Image as ImageIcon,
} from 'lucide-react';
import { AVAILABLE_MODELS, ModelSpec } from '@/models';
import { useAppStore } from '@/appStore';

export default function ModelHub() {
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const hardwareProfile = useAppStore((s) => s.hardwareProfile);
  const downloads = useAppStore((s) => s.downloads);
  const startDownloadModel = useAppStore((s) => s.startDownloadModel);
  const pauseDownloadModel = useAppStore((s) => s.pauseDownloadModel);
  const stopAllRunningTasks = useAppStore((s) => s.stopAllRunningTasks);
  const deleteModel = useAppStore((s) => s.deleteModel);
  const checkCacheStatus = useAppStore((s) => s.checkCacheStatus);

  const [selectedFamily, setSelectedFamily] = useState<'all' | 'recommended' | 'chat' | 'image' | 'audio'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  React.useEffect(() => {
    checkCacheStatus();
  }, [checkCacheStatus]);

  // Filter and sort models:
  // 1. Strictly Chat, Image, and Audio/Voice models (or Recommended)
  // 2. Sort by downloaded / ready 1st!
  const filteredModels = AVAILABLE_MODELS
    .filter((m) => {
      if (selectedFamily === 'recommended') {
        const isRec = m.isRecommended || hardwareProfile?.recommendedModelId === m.id;
        if (!isRec) return false;
      } else if (selectedFamily !== 'all' && m.family !== selectedFamily) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.tagline.toLowerCase().includes(q) ||
          m.family.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const aReady = downloads[a.id]?.isReady ? 1 : 0;
      const bReady = downloads[b.id]?.isReady ? 1 : 0;
      if (aReady !== bReady) return bReady - aReady; // Downloaded / Ready first!

      const aDownloading = downloads[a.id]?.isDownloading ? 1 : 0;
      const bDownloading = downloads[b.id]?.isDownloading ? 1 : 0;
      if (aDownloading !== bDownloading) return bDownloading - aDownloading;

      const aRec = (a.isRecommended || hardwareProfile?.recommendedModelId === a.id) ? 1 : 0;
      const bRec = (b.isRecommended || hardwareProfile?.recommendedModelId === b.id) ? 1 : 0;
      if (aRec !== bRec) return bRec - aRec;

      // Prioritize compact mobile models with lowest memory requirement
      return a.sizeMB - b.sizeMB;
    });

  // Calculate counts for categories
  const categoryCounts = {
    all: AVAILABLE_MODELS.length,
    recommended: AVAILABLE_MODELS.filter((m) => m.isRecommended || hardwareProfile?.recommendedModelId === m.id).length,
    chat: AVAILABLE_MODELS.filter((m) => m.family === 'chat').length,
    image: AVAILABLE_MODELS.filter((m) => m.family === 'image').length,
    audio: AVAILABLE_MODELS.filter((m) => m.family === 'audio').length,
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-zinc-950 px-3 py-3 max-w-4xl mx-auto w-full pb-20">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-950/50 via-zinc-900 to-indigo-950/40 border border-cyan-500/20 p-4 mb-4 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-3 h-3" />
              <span>Verified On-Device Local AI Repository</span>
            </div>
            <h1 className="text-xl font-black text-white tracking-tight">Local AI Hub</h1>
            <p className="text-xs text-zinc-400 max-w-md mt-1">
              Select verified local AI models for <strong>Chat</strong>, <strong>Image Generation</strong>, and <strong>Voice & Speech</strong>.
            </p>
          </div>

          {/* Global Stop All Button in ModelHub */}
          {Object.values(downloads).some((d) => d.isDownloading) && (
            <button
              onClick={stopAllRunningTasks}
              title="Stop all active downloads"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-300 hover:bg-rose-500/30 text-xs font-bold transition-all cursor-pointer shadow-lg animate-pulse"
            >
              <Octagon className="w-3.5 h-3.5 text-rose-400 fill-rose-500/20" />
              <span>Stop All Downloads</span>
            </button>
          )}
        </div>

        {/* Device Hardware Spec Bar */}
        {hardwareProfile && (
          <div className="mt-3 pt-3 border-t border-zinc-800/80 grid grid-cols-3 gap-2 text-[10px]">
            <div className="flex items-center gap-1.5 text-zinc-300">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>{hardwareProfile.cpuCores} Cores ({hardwareProfile.estimatedRamGB} GB RAM)</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-300">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>Storage Free: {hardwareProfile.storageEstimateGB.available} GB</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-300">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>{hardwareProfile.hasWebGpu ? 'WebGPU Accelerated' : 'CPU WebAssembly'}</span>
            </div>
          </div>
        )}
      </div>

      {/* WebGPU Note */}
      {hardwareProfile && !hardwareProfile.hasWebGpu && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-cyan-950/40 border border-cyan-800/60 text-cyan-300 text-[11px] mb-3">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            <strong>Universal CPU Engine Enabled:</strong> Models with the <strong className="text-teal-300">CPU Universal</strong> badge execute directly on CPU via WebAssembly with zero GPU driver errors.
          </span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="space-y-2 mb-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search chat, image, or voice models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        {/* Filter by Category: Chat, Image Generation, Voice */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1 shrink-0 mr-1">
            <Layers className="w-3 h-3 text-cyan-400" />
            Category:
          </span>
          {[
            { id: 'all', label: 'All Models', count: categoryCounts.all },
            { id: 'recommended', label: '★ Recommended', count: categoryCounts.recommended },
            { id: 'chat', label: '💬 Chat', count: categoryCounts.chat },
            { id: 'image', label: '🎨 Image Gen', count: categoryCounts.image },
            { id: 'audio', label: '🔊 Voice', count: categoryCounts.audio },
          ].map((catItem) => {
            const isActive = selectedFamily === catItem.id;
            return (
              <button
                key={catItem.id}
                onClick={() => setSelectedFamily(catItem.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20 ring-1 ring-cyan-400 font-bold'
                    : 'bg-zinc-900 border border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                <span>{catItem.label}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {catItem.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty State */}
      {filteredModels.length === 0 && (
        <div className="flex flex-col items-center justify-center text-center py-10 px-4 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl">
          <AlertTriangle className="w-6 h-6 text-amber-400 mb-2" />
          <p className="text-sm font-bold text-white mb-1">No matching models</p>
          <p className="text-xs text-zinc-400 max-w-xs">
            Try adjusting your search query or selecting another category.
          </p>
        </div>
      )}

      {/* Models Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredModels.map((model) => {
          const isSelected = selectedModelId === model.id;
          const dlState = downloads[model.id];
          const isDownloaded = dlState?.isReady;
          const isDownloading = dlState?.isDownloading;
          const isRecommended = model.isRecommended || hardwareProfile?.recommendedModelId === model.id;

          return (
            <div
              key={model.id}
              className={`relative rounded-2xl border p-3.5 transition-all flex flex-col justify-between ${
                isSelected
                  ? 'bg-zinc-900/90 border-cyan-500 shadow-xl shadow-cyan-500/10 ring-1 ring-cyan-500/40'
                  : 'bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700'
              }`}
            >
              <div>
                {/* Top Badges */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {model.family === 'chat' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[9px] font-bold">
                        <MessageSquare className="w-2.5 h-2.5" />
                        Chat Model
                      </span>
                    )}
                    {model.family === 'image' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-300 text-[9px] font-bold">
                        <ImageIcon className="w-2.5 h-2.5" />
                        Image Generation
                      </span>
                    )}
                    {model.family === 'audio' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] font-bold">
                        <Volume2 className="w-2.5 h-2.5" />
                        Voice & Audio
                      </span>
                    )}
                    {model.engine === 'cpu-wasm' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300 text-[9px] font-bold" title="Runs on pure CPU via WebAssembly — no WebGPU needed, works on any phone">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        CPU Universal (Crash-Free)
                      </span>
                    )}
                  </div>

                  {isRecommended && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[9px] font-extrabold flex items-center gap-1 animate-pulse shrink-0">
                      <Sparkles className="w-2.5 h-2.5" />
                      RECOMMENDED
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-black text-white mb-0.5">{model.name}</h3>
                <p className="text-[11px] text-cyan-400 font-medium mb-1.5">{model.tagline}</p>
                <p className="text-[10px] text-zinc-400 leading-relaxed mb-2.5">{model.description}</p>

                {/* Specs Pill List */}
                <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[10px] font-mono text-zinc-400">
                  <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                    💾 {(model.sizeMB / 1024).toFixed(2)} GB
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                    🧠 {model.parameters}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                    ⚡ {model.quantization}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                    📜 {model.contextWindow.toLocaleString()} ctx
                  </span>
                </div>
              </div>

              {/* Action Bar / Download Progress */}
              <div className="pt-2.5 border-t border-zinc-800/80">
                {isDownloading ? (
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-cyan-300 font-mono mb-1">
                      <span>Downloading: {dlState.progressPct}%</span>
                      <span>{dlState.speedMBs} MB/s</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-200"
                        style={{ width: `${dlState.progressPct}%` }}
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => pauseDownloadModel(model.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-600/40 text-rose-300 text-[10px] font-bold hover:bg-rose-900 transition-all cursor-pointer"
                      >
                        <Octagon className="w-3 h-3 text-rose-400" />
                        <span>Stop Download</span>
                      </button>
                    </div>
                  </div>
                ) : isDownloaded ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                      <Check className="w-4 h-4" />
                      <span>Ready Locally</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => deleteModel(model.id)}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-rose-400 transition-all"
                        title="Remove weights from storage"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setSelectedModelId(model.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                        }`}
                      >
                        {isSelected ? 'Active Model' : 'Switch Model'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {dlState?.errorMessage && (
                      <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-[10px] mb-2 leading-relaxed">
                        <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                        <span>{dlState.errorMessage}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500">
                        {dlState?.errorMessage ? 'Download Failed' : 'Not Downloaded'}
                      </span>
                      <button
                        onClick={() => startDownloadModel(model.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/20 cursor-pointer transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{dlState?.errorMessage ? 'Retry' : `Download (${(model.sizeMB / 1024).toFixed(1)} GB)`}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
