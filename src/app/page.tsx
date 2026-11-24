'use client';

import React, { useEffect } from 'react';
import {
  Bot,
  Layers,
  Cpu,
  Settings,
  Sparkles,
  Octagon,
  Image as ImageIcon,
  Eye,
  Volume2,
  Search,
  Wand2,
  Zap,
  Gauge,
} from 'lucide-react';
import { useAppStore, NavigationTab } from '@/appStore';
import { holdWakeLock, releaseWakeLock } from '@/utils/wakeLock';
import { initAndroidBackButton } from '@/utils/backButton';
import { startVisibleInterval } from '@/utils/visibleInterval';
import { startProactiveMemoryWatcher } from '@/utils/memoryGuard';
import {
  getNetworkTelemetry,
  subscribeNetworkChanges,
  type NetworkTelemetry,
} from '@/utils/networkGuard';
import ErrorBoundary from '@/components/ErrorBoundary';
import ChatView from '@/components/ChatView';
import ModelHub from '@/components/ModelHub';
import DeviceDiagnostics from '@/components/DeviceDiagnostics';
import SettingsView from '@/components/SettingsView';
import ImageStudio from '@/components/ImageStudio';
import VisionStudio from '@/components/VisionStudio';
import VoiceStudio from '@/components/VoiceStudio';
import FileSearchStudio from '@/components/FileSearchStudio';
import TaskWorkflowsStudio from '@/components/TaskWorkflowsStudio';
import BenchmarkStudio from '@/components/BenchmarkStudio';
import ModelGateModal from '@/components/ModelGateModal';

export default function Home() {
  const currentTab = useAppStore((s) => s.currentTab);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const refreshHardwareProfile = useAppStore((s) => s.refreshHardwareProfile);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const isSpeaking = useAppStore((s) => s.isSpeaking);
  const downloads = useAppStore((s) => s.downloads);
  const stopAllRunningTasks = useAppStore((s) => s.stopAllRunningTasks);

  const checkCacheStatus = useAppStore((s) => s.checkCacheStatus);
  const restorePersistedSessions = useAppStore((s) => s.restorePersistedSessions);

  const isDownloadingAny = Object.values(downloads).some((d) => d.isDownloading);
  const hasRunningTasks = isGenerating || isSpeaking || isDownloadingAny;

  // Screen wake lock during heavy work: keeps Android from sleeping the
  // screen (and suspending WebView JS) mid-generation or mid-download.
  useEffect(() => {
    if (hasRunningTasks) {
      holdWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [hasRunningTasks]);

  // Network connectivity telemetry
  const [networkInfo, setNetworkInfo] = React.useState<NetworkTelemetry>(() => getNetworkTelemetry());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unsub = subscribeNetworkChanges((telemetry) => {
      setNetworkInfo(telemetry);
    });
    const cancelInterval = startVisibleInterval(() => {
      setNetworkInfo(getNetworkTelemetry());
    }, 5000);
    return () => {
      unsub();
      cancelInterval();
    };
  }, []);

  useEffect(() => {
    refreshHardwareProfile();
    checkCacheStatus();
    restorePersistedSessions();
    const stopWatcher = startProactiveMemoryWatcher();
    // Android hardware back: close the top-most modal first (wired per
    // modal via useBackButtonClose), exit only when nothing is open.
    initAndroidBackButton();

    return () => {
      stopWatcher();
    };
  }, [refreshHardwareProfile, checkCacheStatus, restorePersistedSessions]);

  const studioTabs: { id: NavigationTab; label: string; icon: any; color: string }[] = [
    { id: 'chat', label: 'Hermes Agent', icon: Bot, color: 'from-cyan-500 to-blue-600' },
    { id: 'workflows', label: 'Workflows', icon: Zap, color: 'from-amber-500 to-rose-600' },
    { id: 'benchmark', label: 'Benchmark', icon: Gauge, color: 'from-violet-600 to-indigo-600' },
    { id: 'image-studio', label: 'Image Studio', icon: ImageIcon, color: 'from-fuchsia-600 to-pink-600' },
    { id: 'vision-studio', label: 'Vision OCR', icon: Eye, color: 'from-emerald-600 to-teal-600' },
    { id: 'voice-studio', label: 'Neural Voice', icon: Volume2, color: 'from-amber-500 to-orange-500' },
    { id: 'file-search', label: 'File Search', icon: Search, color: 'from-blue-600 to-indigo-600' },
    { id: 'models', label: 'Model Hub', icon: Layers, color: 'from-zinc-700 to-zinc-800' },
  ];

  const isStudioTab =
    currentTab === 'image-studio' ||
    currentTab === 'vision-studio' ||
    currentTab === 'voice-studio' ||
    currentTab === 'file-search';

  return (
    <ErrorBoundary>
      <main className="fixed inset-0 w-full h-full bg-zinc-950 text-white flex flex-col overflow-hidden font-sans select-none">
      {/* Top Workspace & Studio Switcher Bar */}
      <header className="w-full shrink-0 z-30 bg-zinc-950/95 border-b border-zinc-800/80 px-2 pb-1.5 app-safe-top flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {studioTabs.map((item) => {
          const isActive = currentTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`flex items-center gap-1 px-3 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? `bg-gradient-to-r ${item.color} text-white shadow-md ring-1 ring-white/20 scale-[1.02]`
                  : 'bg-zinc-900/80 hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* Network & Connectivity Status Pill */}
        {!networkInfo.isOnline ? (
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono shrink-0 font-bold shadow-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>100% Offline Mode</span>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900/90 border border-zinc-800/80 text-[10px] font-mono shrink-0 shadow-sm">
            <span className={`w-1.5 h-1.5 rounded-full ${networkInfo.rttMs && networkInfo.rttMs > 150 ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
            <span className="text-zinc-300 font-bold">{networkInfo.effectiveType ? networkInfo.effectiveType.toUpperCase() : 'ONLINE'}</span>
            {networkInfo.rttMs !== null && (
              <span className="text-zinc-500 font-mono text-[9px]">{networkInfo.rttMs}ms</span>
            )}
          </div>
        )}
      </header>

      {/* Active Tab View (each tab gets its own crash boundary so a fault only takes down that tab) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {currentTab === 'chat' && (
          <ErrorBoundary variant="tab">
            <ChatView />
          </ErrorBoundary>
        )}
        {currentTab === 'workflows' && (
          <ErrorBoundary variant="tab">
            <TaskWorkflowsStudio />
          </ErrorBoundary>
        )}
        {currentTab === 'benchmark' && (
          <ErrorBoundary variant="tab">
            <BenchmarkStudio />
          </ErrorBoundary>
        )}
        {currentTab === 'image-studio' && (
          <ErrorBoundary variant="tab">
            <ImageStudio />
          </ErrorBoundary>
        )}
        {currentTab === 'vision-studio' && (
          <ErrorBoundary variant="tab">
            <VisionStudio />
          </ErrorBoundary>
        )}
        {currentTab === 'voice-studio' && (
          <ErrorBoundary variant="tab">
            <VoiceStudio />
          </ErrorBoundary>
        )}
        {currentTab === 'file-search' && (
          <ErrorBoundary variant="tab">
            <FileSearchStudio />
          </ErrorBoundary>
        )}
        {currentTab === 'models' && (
          <ErrorBoundary variant="tab">
            <ModelHub />
          </ErrorBoundary>
        )}
        {currentTab === 'device' && (
          <ErrorBoundary variant="tab">
            <DeviceDiagnostics />
          </ErrorBoundary>
        )}
        {currentTab === 'settings' && (
          <ErrorBoundary variant="tab">
            <SettingsView />
          </ErrorBoundary>
        )}
      </div>

      {/* Global Running Tasks Floating Banner (Shows whenever AI is thinking, speaking, or downloading) */}
      {hasRunningTasks && (
        <div className="w-full shrink-0 z-40 bg-gradient-to-r from-rose-950/95 via-zinc-900/95 to-rose-950/95 border-t border-rose-500/30 backdrop-blur-xl px-3 py-1.5 flex items-center justify-between shadow-2xl animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
            <span className="font-semibold text-zinc-200">
              {isGenerating && isDownloadingAny
                ? 'Generating reply & downloading weights...'
                : isGenerating
                ? 'Hermes AI is reasoning / generating...'
                : isSpeaking
                ? 'Voice playback in progress...'
                : 'Downloading model weights...'}
            </span>
          </div>

          <button
            onClick={stopAllRunningTasks}
            title="Immediately stop all active running tasks"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition-all cursor-pointer shadow-md shadow-rose-600/40 active:scale-95"
          >
            <Octagon className="w-3.5 h-3.5 fill-current" />
            <span>Stop All</span>
          </button>
        </div>
      )}

      {/* Mobile Fixed Bottom Navigation Bar in Flex Flow */}
      <nav className="w-full shrink-0 z-30 bg-zinc-950/98 border-t border-zinc-800/80 backdrop-blur-xl px-2 pt-2 app-safe-bottom flex items-center justify-around">
        <button
          onClick={() => setCurrentTab('chat')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all cursor-pointer ${
            currentTab === 'chat'
              ? 'text-cyan-400 font-bold scale-105'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span className="text-[10px]">Agent</span>
        </button>

        <button
          onClick={() => setCurrentTab(isStudioTab ? currentTab : 'image-studio')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all cursor-pointer ${
            isStudioTab
              ? 'text-fuchsia-400 font-bold scale-105'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Wand2 className="w-4 h-4" />
          <span className="text-[10px]">Studios</span>
        </button>

        <button
          onClick={() => setCurrentTab('models')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all cursor-pointer ${
            currentTab === 'models'
              ? 'text-cyan-400 font-bold scale-105'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span className="text-[10px]">Model Hub</span>
        </button>

        <button
          onClick={() => setCurrentTab('device')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all cursor-pointer ${
            currentTab === 'device'
              ? 'text-cyan-400 font-bold scale-105'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span className="text-[10px]">Hardware</span>
        </button>

        <button
          onClick={() => setCurrentTab('settings')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all cursor-pointer ${
            currentTab === 'settings'
              ? 'text-cyan-400 font-bold scale-105'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span className="text-[10px]">Settings</span>
        </button>
      </nav>
      <ModelGateModal />
      </main>
    </ErrorBoundary>
  );
}
