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
} from 'lucide-react';
import { useAppStore, NavigationTab } from '@/appStore';
import ChatView from '@/components/ChatView';
import ModelHub from '@/components/ModelHub';
import DeviceDiagnostics from '@/components/DeviceDiagnostics';
import SettingsView from '@/components/SettingsView';
import ImageStudio from '@/components/ImageStudio';
import VisionStudio from '@/components/VisionStudio';
import VoiceStudio from '@/components/VoiceStudio';
import FileSearchStudio from '@/components/FileSearchStudio';
import TaskWorkflowsStudio from '@/components/TaskWorkflowsStudio';

export default function Home() {
  const currentTab = useAppStore((s) => s.currentTab);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const refreshHardwareProfile = useAppStore((s) => s.refreshHardwareProfile);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const isSpeaking = useAppStore((s) => s.isSpeaking);
  const downloads = useAppStore((s) => s.downloads);
  const stopAllRunningTasks = useAppStore((s) => s.stopAllRunningTasks);

  const checkCacheStatus = useAppStore((s) => s.checkCacheStatus);

  const isDownloadingAny = Object.values(downloads).some((d) => d.isDownloading);
  const hasRunningTasks = isGenerating || isSpeaking || isDownloadingAny;

  // Run hardware detection and check cached models automatically on mount
  useEffect(() => {
    refreshHardwareProfile();
    checkCacheStatus();
  }, [refreshHardwareProfile, checkCacheStatus]);

  const studioTabs: { id: NavigationTab; label: string; icon: any; color: string }[] = [
    { id: 'chat', label: 'Hermes Agent', icon: Bot, color: 'from-cyan-500 to-blue-600' },
    { id: 'workflows', label: 'Workflows', icon: Zap, color: 'from-amber-500 to-rose-600' },
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
    <main className="fixed inset-0 w-full h-full bg-zinc-950 text-white flex flex-col overflow-hidden font-sans select-none">
      {/* Top Workspace & Studio Switcher Bar */}
      <header className="w-full shrink-0 z-30 bg-zinc-950/95 border-b border-zinc-800/80 px-2 py-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
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
      </header>

      {/* Active Tab View */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {currentTab === 'chat' && <ChatView />}
        {currentTab === 'workflows' && <TaskWorkflowsStudio />}
        {currentTab === 'image-studio' && <ImageStudio />}
        {currentTab === 'vision-studio' && <VisionStudio />}
        {currentTab === 'voice-studio' && <VoiceStudio />}
        {currentTab === 'file-search' && <FileSearchStudio />}
        {currentTab === 'models' && <ModelHub />}
        {currentTab === 'device' && <DeviceDiagnostics />}
        {currentTab === 'settings' && <SettingsView />}
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
      <nav className="w-full shrink-0 z-30 bg-zinc-950/98 border-t border-zinc-800/80 backdrop-blur-xl px-2 py-2 flex items-center justify-around">
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
    </main>
  );
}
