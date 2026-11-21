'use client';

import { triggerHaptic } from '@/utils/haptics';
import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Layers,
  Sparkles,
  Pin,
  Trash2,
  Plus,
  Zap,
  HardDrive,
  Cpu,
  Download,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  ShieldCheck,
  Minimize2,
} from 'lucide-react';
import { useAppStore, ChatMessage } from '@/appStore';
import { useBackButtonClose } from '@/utils/backButton';

interface ContextCompressorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSessionId: string;
}

// Seeded only when a session has no saved facts of its own.
const DEFAULT_FACTS = [
  'Target Platform: Android Mobile (Capacitor + Next.js 16)',
  'Primary Local Model: Hermes 3 (3B) / Qwen 2.5 (0.5B-3B)',
  'Privacy Policy: Zero external cloud egress (100% on-device)',
];

function loadPinnedFacts(sessionId: string): string[] {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(`hermes_scratchpad_facts_${sessionId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter((f) => typeof f === 'string');
      }
    } catch (_) {}
  }
  return DEFAULT_FACTS;
}

export default function ContextCompressorModal({
  isOpen,
  onClose,
  activeSessionId,
}: ContextCompressorModalProps) {
  useBackButtonClose(isOpen, onClose);

  const operatingMode = useAppStore((s) => s.operatingMode);
  const chatSessions = useAppStore((s) => s.chatSessions);
  const agentSessions = useAppStore((s) => s.agentSessions);
  const replaceSessionMessages = useAppStore((s) => s.replaceSessionMessages);

  const currentSession = operatingMode === 'agent'
    ? agentSessions[activeSessionId]
    : chatSessions[activeSessionId];

  const messages: ChatMessage[] = currentSession?.messages || [];

  // Configuration settings
  const [maxContextTokens, setMaxContextTokens] = useState<number>(2048);
  const [retentionRatio, setRetentionRatio] = useState<number>(60); // % of recent turns to retain
  const [compressionMode, setCompressionMode] = useState<'semantic-summary' | 'fifo-sliding'>('semantic-summary');
  const [copied, setCopied] = useState(false);
  const [newPinnedFact, setNewPinnedFact] = useState('');

  // Persistent scratchpad facts (immune to eviction), scoped to the session
  // the modal is opened on. This component stays mounted for the whole app
  // lifetime with a changing activeSessionId prop, so a one-shot useState
  // initializer would forever show (and, worse, save and compress) the
  // session that happened to be active at app start into every other
  // session's fact store and chat context. Reload per open instead.
  const [pinnedFacts, setPinnedFacts] = useState<string[]>(DEFAULT_FACTS);

  useEffect(() => {
    if (!isOpen) return;
    setPinnedFacts(loadPinnedFacts(activeSessionId));
  }, [isOpen, activeSessionId]);

  const savePinnedFacts = (facts: string[]) => {
    setPinnedFacts(facts);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`hermes_scratchpad_facts_${activeSessionId}`, JSON.stringify(facts));
      } catch (_) {}
    }
  };

  const handleAddFact = () => {
    if (!newPinnedFact.trim()) return;
    const updated = [...pinnedFacts, newPinnedFact.trim()];
    savePinnedFacts(updated);
    setNewPinnedFact('');
    triggerHaptic(15);
  };

  const handleRemoveFact = (index: number) => {
    const updated = pinnedFacts.filter((_, i) => i !== index);
    savePinnedFacts(updated);
    triggerHaptic(15);
  };

  // Estimate tokens: ~4 characters per token
  const stats = useMemo(() => {
    let totalChars = 0;
    messages.forEach((m) => {
      totalChars += (m.content || '').length;
    });

    let pinnedChars = pinnedFacts.reduce((acc, f) => acc + f.length, 0);
    const estimatedTokens = Math.ceil(totalChars / 4);
    const pinnedTokens = Math.ceil(pinnedChars / 4);

    // KV Cache estimation: ~0.5MB per 1,000 tokens for 3B FP16/INT4
    const kvCacheMB = ((estimatedTokens * 0.5) / 1000).toFixed(2);
    const percentUsed = Math.min(100, Math.round((estimatedTokens / maxContextTokens) * 100));

    return {
      messageCount: messages.length,
      estimatedTokens,
      pinnedTokens,
      kvCacheMB,
      percentUsed,
    };
  }, [messages, pinnedFacts, maxContextTokens]);

  const handleExecuteCompression = () => {
    if (messages.length <= 2) return;

    const turnsToKeep = Math.max(2, Math.floor((messages.length * retentionRatio) / 100));
    const evicted = messages.slice(0, messages.length - turnsToKeep);
    const retained = messages.slice(messages.length - turnsToKeep);

    let summaryText = '';
    if (compressionMode === 'semantic-summary') {
      const evictedHighlights = evicted
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Hermes'}: ${m.content.slice(0, 100)}...`)
        .join('\n');

      const factsList = pinnedFacts.length > 0
        ? `\n\n📌 **Scratchpad Pinned Facts (Immune to Eviction)**:\n` + pinnedFacts.map((f) => `- ${f}`).join('\n')
        : '';

      summaryText =
        `🗜️ **[System Context Compression Snapshot]**\n` +
        `*Sliding memory window compressed ${evicted.length} older conversation turns to optimize on-device RAM/KV cache.*\n\n` +
        `**Key Discussion Continuity Summary**:\n` +
        (evictedHighlights || 'Earlier general inquiries and setup prompts.') +
        factsList;
    } else {
      summaryText =
        `🗜️ **[Sliding Context Evicted]**\n` +
        `*Purged oldest ${evicted.length} turns to maintain context headroom below ${maxContextTokens} tokens.*`;
    }

    const compressedMessage: ChatMessage = {
      id: `compressed-${Date.now()}`,
      role: 'system',
      content: summaryText,
      timestamp: Date.now(),
      mode: operatingMode,
    };

    const newMessages = [compressedMessage, ...retained];
    replaceSessionMessages(activeSessionId, newMessages, operatingMode === 'agent' ? 'agent' : 'chat');

    triggerHaptic([40, 30, 40]);
  };

  const handleExportCompactedSnapshot = () => {
    const data = {
      sessionId: activeSessionId,
      timestamp: new Date().toISOString(),
      stats,
      pinnedFacts,
      messages: messages.map((m) => ({
        role: m.role,
        timestamp: m.timestamp,
        content: m.content,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Hermes_Context_Compacted_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="relative w-full max-w-lg max-h-[92vh] flex flex-col rounded-3xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg">
              <Minimize2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight flex items-center gap-2">
                Context Window Compressor
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                  KV-Cache Opt
                </span>
              </h2>
              <p className="text-xs text-neutral-400">Sliding memory eviction & scratchpad pinning</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {/* KV-Cache Telemetry Cards */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-2xl bg-neutral-800/60 border border-neutral-700/50 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>Estimated Tokens</span>
              </div>
              <div className="mt-2 text-lg font-bold text-neutral-100 font-mono">
                {stats.estimatedTokens.toLocaleString()}
                <span className="text-[11px] font-normal text-neutral-400 ml-1">/ {maxContextTokens}</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-neutral-800/60 border border-neutral-700/50 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                <span>KV VRAM</span>
              </div>
              <div className="mt-2 text-lg font-bold text-emerald-400 font-mono">
                ~{stats.kvCacheMB} <span className="text-xs font-normal text-neutral-400">MB</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-neutral-800/60 border border-neutral-700/50 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Capacity</span>
              </div>
              <div className="mt-2 text-lg font-bold text-amber-400 font-mono">
                {stats.percentUsed}%
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-neutral-400 mb-1">
              <span>Context Headroom Buffer</span>
              <span className={stats.percentUsed > 80 ? 'text-rose-400 font-medium' : 'text-neutral-400'}>
                {stats.percentUsed > 80 ? '⚠️ High Context Pressure' : 'Healthy Headroom'}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  stats.percentUsed > 85
                    ? 'bg-rose-500'
                    : stats.percentUsed > 60
                    ? 'bg-amber-500'
                    : 'bg-cyan-500'
                }`}
                style={{ width: `${stats.percentUsed}%` }}
              />
            </div>
          </div>

          {/* Configuration Settings */}
          <div className="p-4 rounded-2xl bg-neutral-950/40 border border-neutral-800 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              Compressor Parameters
            </h3>

            {/* Max Context Window Slider */}
            <div>
              <div className="flex justify-between text-xs text-neutral-300 mb-1">
                <span>Target Context Ceiling</span>
                <span className="font-mono text-cyan-400 font-bold">{maxContextTokens} tokens</span>
              </div>
              <input
                type="range"
                min="1024"
                max="8192"
                step="512"
                value={maxContextTokens}
                onChange={(e) => setMaxContextTokens(Number(e.target.value))}
                className="w-full accent-cyan-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-neutral-500 mt-0.5">
                <span>1K (Low RAM)</span>
                <span>2K (Standard)</span>
                <span>4K (Balanced)</span>
                <span>8K (Extended)</span>
              </div>
            </div>

            {/* Retention Ratio Slider */}
            <div>
              <div className="flex justify-between text-xs text-neutral-300 mb-1">
                <span>Recent Turns Retention</span>
                <span className="font-mono text-cyan-400 font-bold">{retentionRatio}% recent</span>
              </div>
              <input
                type="range"
                min="20"
                max="80"
                step="5"
                value={retentionRatio}
                onChange={(e) => setRetentionRatio(Number(e.target.value))}
                className="w-full accent-cyan-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
              />
            </div>

            {/* Compression Mode Selector */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCompressionMode('semantic-summary')}
                className={`px-3 py-2.5 rounded-xl border text-xs font-medium text-left transition-all ${
                  compressionMode === 'semantic-summary'
                    ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                    : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5 mb-0.5">
                  <Sparkles className="w-3 h-3 text-cyan-400" /> Semantic Summary
                </div>
                <div className="text-[10px] text-neutral-400 leading-tight">
                  Synthesize pruned turns into dense context recap
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCompressionMode('fifo-sliding')}
                className={`px-3 py-2.5 rounded-xl border text-xs font-medium text-left transition-all ${
                  compressionMode === 'fifo-sliding'
                    ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                    : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5 mb-0.5">
                  <RotateCcw className="w-3 h-3 text-cyan-400" /> Sliding FIFO Window
                </div>
                <div className="text-[10px] text-neutral-400 leading-tight">
                  Hard truncate oldest messages without recap
                </div>
              </button>
            </div>
          </div>

          {/* Pinned Scratchpad Facts (Immune from eviction) */}
          <div className="p-4 rounded-2xl bg-neutral-950/40 border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Pin className="w-3.5 h-3.5 text-amber-400" />
                Immune Scratchpad Facts ({pinnedFacts.length})
              </h3>
              <span className="text-[10px] text-amber-400/80 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-800/40">
                Never Evicted
              </span>
            </div>

            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Pinned facts remain in the system prompt across all pruning and sliding compression passes.
            </p>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {pinnedFacts.map((fact, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-neutral-800/50 border border-neutral-700/40 text-xs text-neutral-200"
                >
                  <span className="truncate">{fact}</span>
                  <button
                    onClick={() => handleRemoveFact(idx)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Fact Input */}
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="Pin a critical fact or key user constraint..."
                value={newPinnedFact}
                onChange={(e) => setNewPinnedFact(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddFact();
                }}
                className="flex-1 px-3 py-2 rounded-xl bg-neutral-800/80 border border-neutral-700/60 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={handleAddFact}
                className="px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleExportCompactedSnapshot}
            className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export JSON
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={messages.length <= 2}
              onClick={() => {
                handleExecuteCompression();
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 shadow-md transition-all"
            >
              <Minimize2 className="w-3.5 h-3.5" /> Compress Context Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
