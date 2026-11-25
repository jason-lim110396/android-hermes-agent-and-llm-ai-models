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
import { consumePendingSharedText, consumePendingShareNotice, consumePendingSharedImage, startShareNoticeListener, startShareTargetListener, startShareImageListener, type SharedImagePayload } from '@/utils/shareTarget';
import { startProactiveMemoryWatcher } from '@/utils/memoryGuard';
import { notifyWebViewReady } from '@/utils/bootSplash';
import { disarmBootWatchdog } from '@/utils/bootWatchdog';
import {
  DEFAULT_NETWORK_TELEMETRY,
  getNetworkTelemetry,
  subscribeNetworkChanges,
  type NetworkTelemetry,
} from '@/utils/networkGuard';
import dynamic from 'next/dynamic';
import ErrorBoundary from '@/components/ErrorBoundary';
import ChatView from '@/components/ChatView';
import ModelGateModal from '@/components/ModelGateModal';

/**
 * Tab-level code splitting.
 *
 * The app used to import every studio statically, so the first screen had to
 * download, parse and compile one ~5.9 MB script before the WebView could
 * paint the chat — the slowest part of a cold start on a mid-range phone.
 * Only the default Chat tab stays in the entry chunk; the other screens load
 * on first visit and stay cached afterwards.
 */
const tabLoading = () => (
  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-500">
    <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-cyan-400 animate-spin" />
    <span className="text-[11px] font-mono tracking-wide">Loading studio...</span>
  </div>
);

const ModelHub = dynamic(() => import('@/components/ModelHub'), { ssr: false, loading: tabLoading });
const DeviceDiagnostics = dynamic(() => import('@/components/DeviceDiagnostics'), { ssr: false, loading: tabLoading });
const SettingsView = dynamic(() => import('@/components/SettingsView'), { ssr: false, loading: tabLoading });
const ImageStudio = dynamic(() => import('@/components/ImageStudio'), { ssr: false, loading: tabLoading });
const VisionStudio = dynamic(() => import('@/components/VisionStudio'), { ssr: false, loading: tabLoading });
const VoiceStudio = dynamic(() => import('@/components/VoiceStudio'), { ssr: false, loading: tabLoading });
const FileSearchStudio = dynamic(() => import('@/components/FileSearchStudio'), { ssr: false, loading: tabLoading });
const TaskWorkflowsStudio = dynamic(() => import('@/components/TaskWorkflowsStudio'), { ssr: false, loading: tabLoading });
const BenchmarkStudio = dynamic(() => import('@/components/BenchmarkStudio'), { ssr: false, loading: tabLoading });

export default function Home() {
  const currentTab = useAppStore((s) => s.currentTab);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const setPendingComposerText = useAppStore((s) => s.setPendingComposerText);
  const setPendingShareNotice = useAppStore((s) => s.setPendingShareNotice);
  const setPendingSharedImage = useAppStore((s) => s.setPendingSharedImage);
  const refreshHardwareProfile = useAppStore((s) => s.refreshHardwareProfile);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const isSpeaking = useAppStore((s) => s.isSpeaking);
  const downloads = useAppStore((s) => s.downloads);
  const stopAllRunningTasks = useAppStore((s) => s.stopAllRunningTasks);

  const checkCacheStatus = useAppStore((s) => s.checkCacheStatus);
  const restorePersistedSessions = useAppStore((s) => s.restorePersistedSessions);
  const hydratePersistedPreferences = useAppStore((s) => s.hydratePersistedPreferences);
  const setIsOnline = useAppStore((s) => s.setIsOnline);
  const setNetworkQuality = useAppStore((s) => s.setNetworkQuality);

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
  // First paint must match the prerendered HTML exactly. The real connection
  // details (4G, 50 ms) are client-only, so they are applied after mount.
  const [networkInfo, setNetworkInfo] = React.useState<NetworkTelemetry>(DEFAULT_NETWORK_TELEMETRY);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applyTelemetry = (telemetry: NetworkTelemetry) => {
      setNetworkInfo(telemetry);
      // The store starts optimistic so server and client markup match; the
      // real state is applied here, after hydration.
      setIsOnline(telemetry.isOnline);
      setNetworkQuality(telemetry.quality);
    };
    applyTelemetry(getNetworkTelemetry());
    const unsub = subscribeNetworkChanges((telemetry) => {
      applyTelemetry(telemetry);
    });
    const cancelInterval = startVisibleInterval(() => {
      applyTelemetry(getNetworkTelemetry());
    }, 5000);
    return () => {
      unsub();
      cancelInterval();
    };
  }, [setIsOnline, setNetworkQuality]);

  useEffect(() => {
    // First, before any startup call that could throw: the app mounted, so the
    // dead-bundle watchdog is not needed. bootWatchdog already disarmed it when
    // this bundle started executing; this repeats it for safety.
    disarmBootWatchdog();
    refreshHardwareProfile();
    checkCacheStatus();
    restorePersistedSessions();
    // Saved model/mode are applied only now, so the first client paint matches
    // the prerendered HTML. Reading them during render caused React #418.
    hydratePersistedPreferences();
    const stopWatcher = startProactiveMemoryWatcher();
    // Android hardware back: close the top-most modal first (wired per
    // modal via useBackButtonClose), exit only when nothing is open.
    initAndroidBackButton();

    return () => {
      stopWatcher();
    };
  }, [refreshHardwareProfile, checkCacheStatus, restorePersistedSessions, hydratePersistedPreferences]);

  // Tell the native boot screen that React has committed. This is a fallback
  // signal for the case where the WebView's own draw callback is delayed; a
  // short timeout is used because requestAnimationFrame is paused while the
  // page has not been presented, which was exactly the broken state.
  useEffect(() => {
    const timer = setTimeout(() => notifyWebViewReady(), 400);
    return () => clearTimeout(timer);
  }, []);

  // Android share sheet: a text/link shared from another app becomes an
  // unsent draft in the Chat composer. Consume whatever launched the app, then
  // stay subscribed for shares that arrive while it is already open.
  useEffect(() => {
    let cancelled = false;
    const stageSharedText = (text: string) => {
      if (cancelled) return;
      setCurrentTab('chat');
      setPendingShareNotice(null);
      setPendingComposerText(text);
    };
    const stageShareNotice = (notice: string) => {
      if (cancelled) return;
      setCurrentTab('chat');
      setPendingShareNotice(notice);
    };
    // A photo shared from the Gallery becomes an unsent attachment on the
    // composer: the Chat tab turns it into an attachment and never sends it.
    const stageSharedImage = (image: SharedImagePayload) => {
      if (cancelled) return;
      setCurrentTab('chat');
      setPendingShareNotice(null);
      setPendingSharedImage(image);
    };
    consumePendingSharedText().then((text) => {
      if (text) stageSharedText(text);
    });
    consumePendingShareNotice().then((notice) => {
      if (notice) stageShareNotice(notice);
    });
    consumePendingSharedImage().then((image) => {
      if (image) stageSharedImage(image);
    });
    const stopListening = startShareTargetListener(stageSharedText);
    const stopNotices = startShareNoticeListener(stageShareNotice);
    const stopImages = startShareImageListener(stageSharedImage);
    return () => {
      cancelled = true;
      stopListening();
      stopNotices();
      stopImages();
    };
  }, [setCurrentTab, setPendingComposerText, setPendingShareNotice, setPendingSharedImage]);

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
