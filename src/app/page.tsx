'use client';

import React, { useEffect } from 'react';
import { Bot, Layers, Cpu, Settings, Sparkles, Octagon, Square } from 'lucide-react';
import { useAppStore } from '@/appStore';
import ChatView from '@/components/ChatView';
import ModelHub from '@/components/ModelHub';
import DeviceDiagnostics from '@/components/DeviceDiagnostics';
import SettingsView from '@/components/SettingsView';

export default function Home() {
  const currentTab = useAppStore((s) => s.currentTab);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const refreshHardwareProfile = useAppStore((s) => s.refreshHardwareProfile);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const isSpeaking = useAppStore((s) => s.isSpeaking);
  const downloads = useAppStore((s) => s.downloads);
  const stopAllRunningTasks = useAppStore((s) => s.stopAllRunningTasks);

  const isDownloadingAny = Object.values(downloads).some((d) => d.isDownloading);
  const hasRunningTasks = isGenerating || isSpeaking || isDownloadingAny;

  // Run hardware detection automatically on mount
  useEffect(() => {
    refreshHardwareProfile();
  }, [refreshHardwareProfile]);

  return (
    <main className="fixed inset-0 w-full h-full bg-zinc-950 text-white flex flex-col overflow-hidden font-sans select-none">
      {/* Active Tab View */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {currentTab === 'chat' && <ChatView />}
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
