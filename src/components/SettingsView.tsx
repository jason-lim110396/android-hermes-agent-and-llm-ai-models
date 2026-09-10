'use client';

import React from 'react';
import { Sliders, Shield, Terminal, RefreshCw, Cpu, Database } from 'lucide-react';
import { useAppStore } from '@/appStore';

export default function SettingsView() {
  const systemPrompt = useAppStore((s) => s.systemPrompt);
  const setSystemPrompt = useAppStore((s) => s.setSystemPrompt);
  const temperature = useAppStore((s) => s.temperature);
  const setTemperature = useAppStore((s) => s.setTemperature);
  const maxTokens = useAppStore((s) => s.maxTokens);
  const setMaxTokens = useAppStore((s) => s.setMaxTokens);
  const autoSwitchVision = useAppStore((s) => s.autoSwitchVision);
  const setAutoSwitchVision = useAppStore((s) => s.setAutoSwitchVision);
  const apiEndpoint = useAppStore((s) => s.apiEndpoint);
  const setApiEndpoint = useAppStore((s) => s.setApiEndpoint);
  const apiKey = useAppStore((s) => s.apiKey);
  const setApiKey = useAppStore((s) => s.setApiKey);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-zinc-950 px-3 py-3 max-w-2xl mx-auto w-full pb-20">
      <div className="mb-4">
        <h1 className="text-xl font-black text-white tracking-tight">Agent & LLM Engine Settings</h1>
        <p className="text-xs text-zinc-400">Configure on-device inference parameters, Hermes agent steering, and external local AI backends</p>
      </div>

      <div className="space-y-3">
        {/* Local / Remote AI Server Bridge (Ollama / OpenRouter / vLLM) */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5">
          <label className="text-xs font-bold text-white block mb-0.5">Local Server / OpenRouter Inference Bridge</label>
          <p className="text-[10px] text-zinc-400 mb-2">
            Leave empty for on-device browser inference, or enter your local Ollama / vLLM / OpenRouter endpoint (e.g. <code className="text-cyan-400">http://192.168.1.x:11434/v1</code> or <code className="text-cyan-400">https://openrouter.ai/api/v1</code>) for full unquantized weights.
          </p>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="API Endpoint (e.g. http://localhost:11434/v1)"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 font-mono"
            />
            <input
              type="password"
              placeholder="API Key (optional / for OpenRouter / OpenAI)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 font-mono"
            />
          </div>
        </div>

        {/* System Prompt */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5">
          <label className="text-xs font-bold text-zinc-200 block mb-1">Hermes Agent System Prompt</label>
          <p className="text-[10px] text-zinc-400 mb-2">Guides the persona, tool usage policy, and safety guardrails of the local model.</p>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={3}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50 font-mono"
          />
        </div>

        {/* Auto Vision Switch Toggle */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-white">Smart Multimodal Auto-Switching</div>
            <p className="text-[10px] text-zinc-400 max-w-sm mt-0.5">
              Automatically switch to the downloaded Vision VLM model when camera photos or images are attached.
            </p>
          </div>
          <button
            onClick={() => setAutoSwitchVision(!autoSwitchVision)}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              autoSwitchVision ? 'bg-cyan-500' : 'bg-zinc-800'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                autoSwitchVision ? 'left-6.5' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        {/* Temperature */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5">
          <div className="flex items-center justify-between text-xs font-bold text-zinc-200 mb-1">
            <span>Sampling Temperature</span>
            <span className="text-cyan-400 font-mono">{temperature}</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1.5"
            step="0.05"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-cyan-500"
          />
          <div className="flex justify-between text-[9px] text-zinc-500 mt-1">
            <span>Deterministic (0.1)</span>
            <span>Balanced (0.7)</span>
            <span>Creative (1.5)</span>
          </div>
        </div>

        {/* Max Tokens */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5">
          <div className="flex items-center justify-between text-xs font-bold text-zinc-200 mb-1">
            <span>Max Response Tokens</span>
            <span className="text-cyan-400 font-mono">{maxTokens} tokens</span>
          </div>
          <input
            type="range"
            min="256"
            max="4096"
            step="256"
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value))}
            className="w-full accent-cyan-500"
          />
          <div className="flex justify-between text-[9px] text-zinc-500 mt-1">
            <span>256 (Fast)</span>
            <span>2048 (Standard)</span>
            <span>4096 (Long-Form)</span>
          </div>
        </div>

        {/* Privacy Note */}
        <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-3 flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-zinc-300 leading-relaxed">
            <strong className="text-emerald-400 font-bold block mb-0.5">100% On-Device Sovereign AI</strong>
            Your weights, chat messages, photos, and document embeddings remain entirely inside your phone memory. No telemetry or server storage.
          </div>
        </div>
      </div>
    </div>
  );
}
