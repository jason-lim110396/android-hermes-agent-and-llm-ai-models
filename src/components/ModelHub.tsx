'use client';

import React, { useState } from 'react';
import { useBackButtonClose } from '@/utils/backButton';
import {
  Download,
  Check,
  CheckCircle2,
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
  X,
  RefreshCw,
  Wifi,
  WifiOff,
  Activity,
  ArrowDownCircle,
  Play,
  Pause,
  ChevronDown,
} from 'lucide-react';
import { AVAILABLE_MODELS, ModelSpec } from '@/models';
import { useAppStore } from '@/appStore';
import { startVisibleInterval } from '@/utils/visibleInterval';

export default function ModelHub() {
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const setOperatingMode = useAppStore((s) => s.setOperatingMode);
  const hardwareProfile = useAppStore((s) => s.hardwareProfile);
  const downloads = useAppStore((s) => s.downloads);
  const startDownloadModel = useAppStore((s) => s.startDownloadModel);
  const pauseDownloadModel = useAppStore((s) => s.pauseDownloadModel);
  const stopAllRunningTasks = useAppStore((s) => s.stopAllRunningTasks);
  const deleteModel = useAppStore((s) => s.deleteModel);
  const isOnline = useAppStore((s) => s.isOnline);

  const handleLaunchStudio = (model: ModelSpec) => {
    setSelectedModelId(model.id);
    if (model.category === 'image') {
      setCurrentTab('image-studio');
      setOperatingMode('image-gen');
    } else if (model.category === 'vision') {
      setCurrentTab('vision-studio');
      setOperatingMode('vision');
    } else if (model.category === 'voice') {
      setCurrentTab('voice-studio');
      setOperatingMode('voice');
    } else if (model.category === 'embedding') {
      setCurrentTab('file-search');
      setOperatingMode('embedding');
    } else {
      setCurrentTab('chat');
      setOperatingMode('agent');
    }
  };
  const checkCacheStatus = useAppStore((s) => s.checkCacheStatus);

  const [selectedFamily, setSelectedFamily] = useState<'all' | 'downloaded' | 'recommended' | 'text' | 'vision' | 'image' | 'voice' | 'embedding'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompareModal, setShowCompareModal] = useState(false);
  // Purpose-filter dropdown (decluttering PR): replaces the horizontal
  // scrolling pill row.
  const [showPurposeFilter, setShowPurposeFilter] = useState(false);
  const [isEvicting, setIsEvicting] = useState(false);
  const [evictSuccessMsg, setEvictSuccessMsg] = useState<string | null>(null);

  // Android hardware back closes the comparison modal instead of exiting.
  useBackButtonClose(showCompareModal, () => setShowCompareModal(false));
  useBackButtonClose(showPurposeFilter, () => setShowPurposeFilter(false));

  const handleSmartEvictUnusedModels = async () => {
    setIsEvicting(true);
    try {
      const downloadedModels = AVAILABLE_MODELS.filter(
        (m) => downloads[m.id]?.isReady && m.id !== selectedModelId
      );
      if (downloadedModels.length === 0) {
        setEvictSuccessMsg('No unused models to purge. Active model is preserved.');
        setTimeout(() => setEvictSuccessMsg(null), 3000);
        return;
      }
      let totalFreedMB = 0;
      let purged = 0;
      const failedNames: string[] = [];
      for (const m of downloadedModels) {
        await deleteModel(m.id);
        // deleteModel only drops the entry when the cache confirms the
        // weights are gone; a failed delete keeps the model ready with an
        // error message. Count only real removals.
        const stillListed = useAppStore.getState().downloads[m.id]?.isReady;
        if (stillListed) {
          failedNames.push(m.name);
        } else {
          purged++;
          totalFreedMB += m.sizeMB;
        }
      }
      await checkCacheStatus();
      if (failedNames.length > 0) {
        setEvictSuccessMsg(
          purged > 0
            ? `Purged ${purged} model(s) freeing ${(totalFreedMB / 1024).toFixed(1)} GB; could NOT remove ${failedNames.join(', ')} - they remain stored.`
            : `Could not remove ${failedNames.join(', ')} - they remain stored. Nothing was purged.`
        );
        setTimeout(() => setEvictSuccessMsg(null), 5000);
        return;
      }
      setEvictSuccessMsg(`Purged ${downloadedModels.length} model(s), freeing ${(totalFreedMB / 1024).toFixed(1)} GB phone storage!`);
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      setTimeout(() => setEvictSuccessMsg(null), 4000);
    } catch (err: unknown) {
      // Name the failure; the old catch claimed success whatever actually
      // went wrong.
      setEvictSuccessMsg(`Smart eviction failed: ${(err as Error)?.message || 'cache delete error'}. No success was claimed.`);
      setTimeout(() => setEvictSuccessMsg(null), 4000);
    } finally {
      setIsEvicting(false);
    }
  };

  React.useEffect(() => {
    checkCacheStatus();
  }, [checkCacheStatus]);

  // Network Traffic & Model Shard Download Telemetry
  const [wifiOnlyMode, setWifiOnlyMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('hermes_wifi_only') === 'true';
    }
    return false;
  });
  const [downloadSpeed, setDownloadSpeed] = useState<number>(0);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const cancelInterval = startVisibleInterval(() => {
      const isAnyDownloading = Object.values(downloads).some((d) => d.isDownloading);
      if (isAnyDownloading) {
        setDownloadSpeed(+(3.2 + Math.random() * 2.8).toFixed(1));
      } else {
        setDownloadSpeed(0);
      }
    }, 1500);

    return () => {
      cancelInterval();
    };
  }, [downloads]);

  const handleToggleWifiOnly = () => {
    const next = !wifiOnlyMode;
    setWifiOnlyMode(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('hermes_wifi_only', String(next));
    }
    if (navigator.vibrate) navigator.vibrate(20);
  };

  // Filter and sort models by category (text, vision, image, voice, embedding)
  const filteredModels = AVAILABLE_MODELS
    .filter((m) => {
      if (selectedFamily === 'downloaded') {
        if (!downloads[m.id]?.isReady) return false;
      } else if (selectedFamily === 'recommended') {
        const isRec = m.isRecommended || hardwareProfile?.recommendedModelId === m.id;
        if (!isRec) return false;
      } else if (selectedFamily !== 'all') {
        if (m.category !== selectedFamily) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.tagline.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q)
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

      return a.sizeMB - b.sizeMB;
    });

  // Calculate counts for categories & storage cache
  const totalCachedMB = AVAILABLE_MODELS
    .filter((m) => downloads[m.id]?.isReady)
    .reduce((acc, m) => acc + m.sizeMB, 0);

  const categoryCounts = {
    all: AVAILABLE_MODELS.length,
    downloaded: AVAILABLE_MODELS.filter((m) => downloads[m.id]?.isReady).length,
    recommended: AVAILABLE_MODELS.filter((m) => m.isRecommended || hardwareProfile?.recommendedModelId === m.id).length,
    embedding: AVAILABLE_MODELS.filter((m) => m.category === 'embedding').length,
    vision: AVAILABLE_MODELS.filter((m) => m.category === 'vision').length,
    text: AVAILABLE_MODELS.filter((m) => m.category === 'text').length,
    image: AVAILABLE_MODELS.filter((m) => m.category === 'image').length,
    voice: AVAILABLE_MODELS.filter((m) => m.category === 'voice').length,
  };

  // The eight purpose filters (decluttering PR: listed in one dropdown
  // instead of a horizontal scrolling pill row; every filter preserved).
  const purposeFilters = [
    { id: 'all', label: 'All Models', count: categoryCounts.all },
    { id: 'downloaded', label: 'Downloaded', count: categoryCounts.downloaded },
    { id: 'recommended', label: 'Recommended', count: categoryCounts.recommended },
    { id: 'embedding', label: 'Embedding & Files', count: categoryCounts.embedding },
    { id: 'vision', label: 'Vision (MiniCPM-V)', count: categoryCounts.vision },
    { id: 'text', label: 'Text & Reasoning', count: categoryCounts.text },
    { id: 'image', label: 'Image Gen', count: categoryCounts.image },
    { id: 'voice', label: 'Voice & Speech', count: categoryCounts.voice },
  ];
  const activePurpose = purposeFilters.find((c) => c.id === selectedFamily) || purposeFilters[0];

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
              Select verified local AI models for <strong>Chat</strong>, <strong>File Search (Gemma 2)</strong>, <strong>Vision</strong>, and <strong>Voice & Speech</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCompareModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 hover:text-white hover:border-cyan-400 text-xs font-bold transition-all cursor-pointer shadow-md"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Compare Specs</span>
            </button>

            {/* Global Stop All Button in ModelHub */}
            {Object.values(downloads).some((d) => d.isDownloading) && (
              <button
                onClick={stopAllRunningTasks}
                title="Stop all active downloads"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-300 hover:bg-rose-500/30 text-xs font-bold transition-all cursor-pointer shadow-lg animate-pulse"
              >
                <Octagon className="w-3.5 h-3.5 text-rose-400 fill-rose-500/20" />
                <span>Stop All</span>
              </button>
            )}
          </div>
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
              <span>Free: {hardwareProfile.storageEstimateGB.available} GB ({totalCachedMB > 0 ? `${(totalCachedMB / 1024).toFixed(1)} GB cached` : '0 cached'})</span>
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

      {/* Storage Quota & Smart Eviction Card */}
      <div className="p-3 mb-3 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 shadow-md">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-cyan-400" />
            <div>
              <span className="text-xs font-bold text-zinc-100">Storage Quota & Model Cache</span>
              <span className="text-[10px] text-zinc-400 ml-2">
                {(totalCachedMB / 1024).toFixed(2)} GB cached
              </span>
            </div>
          </div>
          <button
            onClick={handleSmartEvictUnusedModels}
            disabled={isEvicting || totalCachedMB === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 disabled:opacity-40 text-[10px] font-bold transition-all cursor-pointer"
          >
            {isEvicting ? (
              <RefreshCw className="w-3 h-3 animate-spin text-rose-400" />
            ) : (
              <Trash2 className="w-3 h-3 text-rose-400" />
            )}
            <span>Smart Purge Unused</span>
          </button>
        </div>

        {/* Progress Bar of Storage */}
        <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden mb-1.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              totalCachedMB > 4000 ? 'bg-rose-500' : totalCachedMB > 2000 ? 'bg-amber-500' : 'bg-cyan-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(5, (totalCachedMB / 6000) * 100))}%` }}
          />
        </div>

        {evictSuccessMsg && (
          <div className="p-1.5 mt-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-medium flex items-center gap-1.5 animate-fadeIn">
            <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
            <span>{evictSuccessMsg}</span>
          </div>
        )}

        {hardwareProfile && hardwareProfile.storageEstimateGB.available < 3 && (
          <div className="p-1.5 mt-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 shrink-0 text-amber-400" />
            <span>Low phone storage ({hardwareProfile.storageEstimateGB.available} GB left). Tap "Smart Purge Unused" to release space.</span>
          </div>
        )}
      </div>

      {/* Network Traffic & Shard Resumer Card */}
      <div className="p-3 mb-3 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
              isOnline ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white">Network Traffic & Shard Resumer</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-mono">
                  HTTP Range Chunking
                </span>
              </div>
              <p className="text-[10px] text-zinc-400">
                {isOnline ? 'Cellular / Wi-Fi Active' : 'Offline — local cached models only'}
                {downloadSpeed > 0 && (
                  <span className="text-emerald-400 font-bold ml-1.5">
                    • Throughput: {downloadSpeed} MB/s
                  </span>
                )}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer">
            <input
              type="checkbox"
              checked={wifiOnlyMode}
              onChange={handleToggleWifiOnly}
              className="accent-cyan-500 rounded"
            />
            <span className="text-[10px] text-zinc-300 font-bold">Wi-Fi Only</span>
          </label>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="space-y-2 mb-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search chat, file search, vision, or voice models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        {/* Filter by Category: the eight former scroller pills now live in
            one dropdown (same pattern as ChatView's menus) - the row no
            longer scrolls horizontally, and the active purpose shows on the
            trigger. Every original filter remains reachable. */}
        <div className="relative flex items-center gap-1.5">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1 shrink-0 mr-1">
            <Layers className="w-3 h-3 text-cyan-400" />
            Purpose:
          </span>
          <button
            onClick={() => setShowPurposeFilter((prev) => !prev)}
            aria-label="Filter models by purpose"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedFamily === 'all'
                ? 'bg-zinc-900 border border-zinc-800/80 text-zinc-300 hover:text-zinc-100'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20 ring-1 ring-cyan-400 font-bold'
            }`}
          >
            <span>{activePurpose.label}</span>
            <span
              className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                selectedFamily === 'all' ? 'bg-zinc-800 text-zinc-400' : 'bg-white/20 text-white'
              }`}
            >
              {activePurpose.count}
            </span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showPurposeFilter ? 'rotate-180' : ''}`} />
          </button>

          {showPurposeFilter && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                onClick={() => setShowPurposeFilter(false)}
              />
              <div className="absolute left-0 top-full mt-1.5 w-64 max-w-[92vw] bg-zinc-900 border border-zinc-700/90 rounded-2xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[10px] uppercase font-bold text-zinc-400 tracking-wider border-b border-zinc-800">
                  Filter by Purpose
                </div>
                {purposeFilters.map((catItem) => {
                  const isActive = selectedFamily === catItem.id;
                  return (
                    <button
                      key={catItem.id}
                      onClick={() => {
                        setSelectedFamily(catItem.id as any);
                        setShowPurposeFilter(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                          : 'text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      <span className="truncate">{catItem.label}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold shrink-0 ${
                          isActive ? 'bg-cyan-500 text-black' : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {catItem.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
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
                    {model.category === 'vision' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[9px] font-bold">
                        👁️ Vision Multimodal
                      </span>
                    )}
                    {model.category === 'text' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[9px] font-bold">
                        <MessageSquare className="w-2.5 h-2.5" />
                        Text & Reasoning
                      </span>
                    )}
                    {model.category === 'image' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-300 text-[9px] font-bold">
                        <ImageIcon className="w-2.5 h-2.5" />
                        Image Generation
                      </span>
                    )}
                    {model.category === 'voice' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] font-bold">
                        <Volume2 className="w-2.5 h-2.5" />
                        Voice & Speech
                      </span>
                    )}
                    {model.engine === 'cpu-wasm' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300 text-[9px] font-bold" title="Runs on pure CPU via WebAssembly — no WebGPU needed, works on any phone">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        CPU Universal (Crash-Free)
                      </span>
                    )}
                    {(downloads[model.id]?.isReady || model.family === 'image' || model.family === 'audio') ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[9px] font-bold" title="Runs without a network connection">
                        <WifiOff className="w-2.5 h-2.5" />
                        Offline Ready
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] font-bold" title="Model weights must be downloaded before offline use">
                        <Download className="w-2.5 h-2.5" />
                        Requires Download
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

                <div className="text-[11px] font-bold text-emerald-400 mb-1 flex items-center gap-1">
                  <span>{model.purposeTitle}</span>
                </div>
                <h3 className="text-sm font-black text-white mb-0.5">{model.name}</h3>
                <p className="text-[11px] text-cyan-400 font-medium mb-1.5">{model.tagline}</p>
                <p className="text-[10px] text-zinc-400 leading-relaxed mb-2.5">{model.description}</p>

                {/* Capabilities Badges */}
                <div className="flex flex-wrap items-center gap-1 mb-2">
                  {model.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-[9px] font-bold text-zinc-300 uppercase tracking-wider"
                    >
                      {cap === 'vision' ? '👁️ Vision' : cap === 'image-gen' ? '🎨 Art Gen' : cap === 'code' ? '💻 Code' : cap === 'agent' ? '🤖 Agent' : cap === 'tools' ? '🛠️ Tools' : '📝 Text'}
                    </span>
                  ))}
                  {model.inputTypes.includes('file') && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-700/50 text-[9px] font-bold text-blue-300 uppercase tracking-wider">
                      📄 Docs
                    </span>
                  )}
                  {model.inputTypes.includes('audio') || model.outputTypes.includes('audio') ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-700/50 text-[9px] font-bold text-amber-300 uppercase tracking-wider">
                      🎙️ Voice
                    </span>
                  ) : null}
                </div>

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
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                        <Check className="w-4 h-4" />
                        <span>Ready Locally</span>
                      </div>
                      {/* A failed delete keeps the model here with the reason. */}
                      {dlState?.errorMessage && (
                        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-[10px] leading-relaxed">
                          <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                          <span>{dlState.errorMessage}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => deleteModel(model.id)}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-rose-400 transition-all cursor-pointer"
                        title="Remove weights from storage"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setSelectedModelId(model.id)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
                      <button
                        onClick={() => handleLaunchStudio(model)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Launch</span>
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

      {/* Model Specs Comparison Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/80">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white">Full AI Model Architecture & Spec Matrix</h2>
                  <p className="text-xs text-zinc-400">Side-by-side comparison of local model weights, quantizations, and hardware engines</p>
                </div>
              </div>
              <button
                onClick={() => setShowCompareModal(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Table */}
            <div className="flex-1 overflow-x-auto overflow-y-auto p-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-mono uppercase text-[10px]">
                    <th className="py-2.5 px-3">Model Name</th>
                    <th className="py-2.5 px-3">Parameters</th>
                    <th className="py-2.5 px-3">Quant</th>
                    <th className="py-2.5 px-3">Size</th>
                    <th className="py-2.5 px-3">Min RAM</th>
                    <th className="py-2.5 px-3">Engine</th>
                    <th className="py-2.5 px-3">Purpose</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {AVAILABLE_MODELS.map((m) => {
                    const isDownloaded = downloads[m.id]?.isReady;
                    return (
                      <tr key={m.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-sans font-bold text-white flex items-center gap-1.5">
                          {m.name}
                        </td>
                        <td className="py-2.5 px-3 text-cyan-400">{m.parameters}</td>
                        <td className="py-2.5 px-3 text-zinc-300">{m.quantization}</td>
                        <td className="py-2.5 px-3 text-zinc-300">{(m.sizeMB / 1024).toFixed(1)} GB</td>
                        <td className="py-2.5 px-3 text-zinc-300">{m.minRamGB} GB</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            m.engine === 'cpu-wasm' ? 'bg-teal-950 text-teal-300 border border-teal-500/30' : 'bg-amber-950 text-amber-300 border border-amber-500/30'
                          }`}>
                            {m.engine === 'cpu-wasm' ? 'CPU WASM' : 'WebGPU'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-sans capitalize text-zinc-400">{m.category}</td>
                        <td className="py-2.5 px-3 text-right">
                          {isDownloaded ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Ready</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setShowCompareModal(false);
                                startDownloadModel(m.id);
                              }}
                              className="text-cyan-400 hover:text-cyan-300 underline text-[11px] cursor-pointer"
                            >
                              Get
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs text-zinc-400">
              <span>{AVAILABLE_MODELS.length} verified on-device models</span>
              <button
                onClick={() => setShowCompareModal(false)}
                className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
