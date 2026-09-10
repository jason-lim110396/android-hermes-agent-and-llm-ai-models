'use client';

import React, { useEffect } from 'react';
import { Bot, Layers, Cpu, Settings, Sparkles } from 'lucide-react';
import { useAppStore } from '@/appStore';
import ChatView from '@/components/ChatView';
import ModelHub from '@/components/ModelHub';
import DeviceDiagnostics from '@/components/DeviceDiagnostics';
import SettingsView from '@/components/SettingsView';

export default function Home() {
  const currentTab = useAppStore((s) => s.currentTab);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const refreshHardwareProfile = useAppStore((s) => s.refreshHardwareProfile);

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
