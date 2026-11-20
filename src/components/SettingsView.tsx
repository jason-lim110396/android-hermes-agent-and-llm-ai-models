'use client';

import React, { useState } from 'react';
import {
  Sliders,
  Shield,
  Terminal,
  RefreshCw,
  Cpu,
  Database,
  BatteryCharging,
  Gauge,
  Zap,
  Flame,
  Check,
  AlertCircle,
  Trash2,
  Wifi,
  Wand2,
  Sparkles,
  Download,
  Upload,
  FileJson,
  Radio,
  Sun,
  Moon,
  Palette,
} from 'lucide-react';
import { useAppStore } from '@/appStore';

const PROMPT_PRESETS = [
  {
    name: 'Hermes Agent',
    icon: '🤖',
    prompt: 'You are Hermes AI Agent, a sovereign on-device intelligence. You reason thoroughly, plan autonomously, and utilize local tools with extreme precision.',
  },
  {
    name: 'Code Architect',
    icon: '💻',
    prompt: 'You are an expert full-stack engineer and software architect. Write clean, idiomatic, robust code with zero unclosed tags, strict type safety, and production-ready error handling.',
  },
  {
    name: 'Research Analyst',
    icon: '🔬',
    prompt: 'You are a meticulous fact-checking and research assistant. Analyze documents with critical objectivity, cite source context, and deliver concise structured bullet points.',
  },
  {
    name: 'Creative Writer',
    icon: '✍️',
    prompt: 'You are an imaginative creative writer. Craft evocative narratives, compelling copy, and vivid prose.',
  },
];

export default function SettingsView() {
  const systemPrompt = useAppStore((s) => s.systemPrompt);
  const setSystemPrompt = useAppStore((s) => s.setSystemPrompt);
  const temperature = useAppStore((s) => s.temperature);
  const setTemperature = useAppStore((s) => s.setTemperature);
  const maxTokens = useAppStore((s) => s.maxTokens);
  const setMaxTokens = useAppStore((s) => s.setMaxTokens);
  const apiEndpoint = useAppStore((s) => s.apiEndpoint);
  const setApiEndpoint = useAppStore((s) => s.setApiEndpoint);
  const apiKey = useAppStore((s) => s.apiKey);
  const setApiKey = useAppStore((s) => s.setApiKey);
  const performanceMode = useAppStore((s) => s.performanceMode);
  const setPerformanceMode = useAppStore((s) => s.setPerformanceMode);
  const hardwareProfile = useAppStore((s) => s.hardwareProfile);
  const chatSessions = useAppStore((s) => s.chatSessions);
  const agentSessions = useAppStore((s) => s.agentSessions);

  const [isTestingEndpoint, setIsTestingEndpoint] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [clearCacheSuccess, setClearCacheSuccess] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  // Mobile Theme & Battery Saver State
  const [activeTheme, setActiveTheme] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('hermes_app_theme') || 'cyber-dark';
    }
    return 'cyber-dark';
  });

  const handleSelectTheme = (themeId: string) => {
    setActiveTheme(themeId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('hermes_app_theme', themeId);
      document.documentElement.setAttribute('data-theme', themeId);
    }
    if (navigator.vibrate) navigator.vibrate(25);
  };

  const handleExportBackup = () => {
    const backupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      systemPrompt,
      temperature,
      maxTokens,
      performanceMode,
      chatSessions,
      agentSessions,
    };
    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hermes_ai_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupStatus('Exported successfully!');
    setTimeout(() => setBackupStatus(null), 3000);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.chatSessions) {
          useAppStore.setState({
            chatSessions: parsed.chatSessions,
            agentSessions: parsed.agentSessions || {},
            systemPrompt: parsed.systemPrompt || systemPrompt,
          });
          setBackupStatus('Backup restored successfully!');
          setTimeout(() => setBackupStatus(null), 3000);
        } else {
          setBackupStatus('Invalid backup format.');
        }
      } catch (_) {
        setBackupStatus('Failed to parse JSON backup.');
      }
    };
    reader.readAsText(file);
  };

  const handleTestConnection = async () => {
    if (!apiEndpoint.trim()) return;
    setIsTestingEndpoint(true);
    setTestResult(null);

    const start = performance.now();
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 4000);

      // Attempt ping to models endpoint
      const targetUrl = apiEndpoint.trim().replace(/\/+$/, '') + '/models';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }

      const res = await fetch(targetUrl, { signal: ctrl.signal, headers });
      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - start);

      if (res.ok) {
        setTestResult({ ok: true, message: `Connected! HTTP 200 • Latency: ${latency}ms • Endpoint ready` });
      } else {
        setTestResult({ ok: false, message: `Server replied with HTTP ${res.status} (${latency}ms)` });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: `Connection failed: ${err?.message || 'Host unreachable or CORS blocked'}` });
    } finally {
      setIsTestingEndpoint(false);
    }
  };

  const handleClearCache = () => {
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove = Object.keys(localStorage).filter(
          (k) => k.startsWith('hermes-') || k.startsWith('synthetic-')
        );
        keysToRemove.forEach((k) => localStorage.removeItem(k));
        setClearCacheSuccess(true);
        setTimeout(() => setClearCacheSuccess(false), 2500);
      } catch (_) {}
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-zinc-950 px-3 py-3 max-w-2xl mx-auto w-full pb-20 select-none">
      <div className="mb-4">
        <h1 className="text-xl font-black text-white tracking-tight">Agent & LLM Engine Settings</h1>
        <p className="text-xs text-zinc-400">Configure performance & thermal profiles, on-device parameters, and external AI backends</p>
      </div>

      <div className="space-y-3">
        {/* EASY MODE: PERFORMANCE & THERMAL POWER PROFILE SELECTOR */}
        <div className="bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-2xl p-3.5 shadow-xl">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <label className="text-xs font-bold text-white">Easy Mode: Power & Thermal Profile</label>
            </div>
            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
              {performanceMode}
            </span>
          </div>
          <p className="text-[10px] text-zinc-400 mb-3">
            Select an operating profile tailored to your device battery level and thermal performance. Prevents phone overheating and excessive battery consumption.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* 1. Power Saver / Cool */}
            <button
              onClick={() => {
                setPerformanceMode('eco');
                setMaxTokens(1024);
              }}
              className={`text-left p-3 rounded-xl border transition-all cursor-pointer relative ${
                performanceMode === 'eco'
                  ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/20'
                  : 'bg-zinc-950/70 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <BatteryCharging className="w-4 h-4 text-emerald-400" />
                  <span>Power Saver</span>
                </div>
                {performanceMode === 'eco' && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>
              <p className="text-[10px] text-zinc-400 leading-tight">
                Slow output pacing, lowest battery drain, zero overheating. Perfect for prolonged sessions.
              </p>
            </button>

            {/* 2. Balanced (Recommended) */}
            <button
              onClick={() => {
                setPerformanceMode('balanced');
                setMaxTokens(2048);
              }}
              className={`text-left p-3 rounded-xl border transition-all cursor-pointer relative ${
                performanceMode === 'balanced'
                  ? 'bg-cyan-950/40 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-500/20'
                  : 'bg-zinc-950/70 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>Balanced</span>
                </div>
                {performanceMode === 'balanced' && (
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                )}
              </div>
              <p className="text-[10px] text-zinc-400 leading-tight">
                Calibrated to phone RAM ({hardwareProfile?.estimatedRamGB || 4}GB) & {hardwareProfile?.cpuCores || 8} CPU cores with thermal limits.
              </p>
            </button>

            {/* 3. High Performance / Turbo */}
            <button
              onClick={() => {
                setPerformanceMode('performance');
                setMaxTokens(4096);
              }}
              className={`text-left p-3 rounded-xl border transition-all cursor-pointer relative ${
                performanceMode === 'performance'
                  ? 'bg-amber-950/40 border-amber-500 text-amber-300 shadow-md shadow-amber-500/20'
                  : 'bg-zinc-950/70 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>High Speed</span>
                </div>
                {performanceMode === 'performance' && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                )}
              </div>
              <p className="text-[10px] text-zinc-400 leading-tight">
                Max tokens/sec, unthrottled WebGPU hardware compute for flagship smartphones.
              </p>
            </button>
          </div>
        </div>

        {/* AMOLED & DISPLAY THEME BATTERY SAVER */}
        <div className="bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-2xl p-3.5 shadow-xl">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-fuchsia-400" />
              <label className="text-xs font-bold text-white">Display Theme & OLED Battery Saver</label>
            </div>
            {activeTheme === 'amoled-black' && (
              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>+35% OLED Battery Saver</span>
              </span>
            )}
          </div>
          <p className="text-[10px] text-zinc-400 mb-3">
            Pure Black turns off individual OLED pixels to drastically reduce battery drain and thermal heat on smartphones during heavy LLM generation.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'cyber-dark', name: 'Cyber Dark', desc: 'Default Slate', icon: Moon, color: 'text-cyan-400' },
              { id: 'amoled-black', name: 'AMOLED Black', desc: 'Pixels Off / Max Saver', icon: Zap, color: 'text-emerald-400' },
              { id: 'solar-amber', name: 'Solar Amber', desc: 'High Sunlight Contrast', icon: Sun, color: 'text-amber-400' },
              { id: 'matrix-emerald', name: 'Matrix Green', desc: 'Terminal Aesthetic', icon: Terminal, color: 'text-emerald-400' },
            ].map((theme) => {
              const isSelected = activeTheme === theme.id;
              const Icon = theme.icon;
              return (
                <button
                  key={theme.id}
                  onClick={() => handleSelectTheme(theme.id)}
                  className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-800/90 border-fuchsia-500 text-white shadow-md ring-1 ring-fuchsia-500/40'
                      : 'bg-zinc-950/70 border-zinc-800/80 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Icon className={`w-3.5 h-3.5 ${theme.color}`} />
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400" />}
                  </div>
                  <span className="text-xs font-bold block text-zinc-200">{theme.name}</span>
                  <span className="text-[9px] text-zinc-500 block leading-tight mt-0.5">{theme.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Local / Remote AI Server Bridge (Ollama / OpenRouter / vLLM) */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5 space-y-2.5">
          <label className="text-xs font-bold text-white block">Local Server / OpenRouter Inference Bridge</label>
          <p className="text-[10px] text-zinc-400">
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

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={handleTestConnection}
                disabled={!apiEndpoint.trim() || isTestingEndpoint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all cursor-pointer disabled:opacity-40"
              >
                <Wifi className={`w-3.5 h-3.5 text-cyan-400 ${isTestingEndpoint ? 'animate-pulse' : ''}`} />
                <span>{isTestingEndpoint ? 'Testing...' : 'Test Connection'}</span>
              </button>

              {testResult && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border ${
                    testResult.ok
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                  }`}
                >
                  {testResult.message}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* System Prompt & Quick Presets */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-zinc-200">Hermes Agent System Prompt</label>
            <span className="text-[10px] text-zinc-500 font-mono">Persona & Guardrails</span>
          </div>

          {/* Quick Presets Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {PROMPT_PRESETS.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => setSystemPrompt(preset.prompt)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 text-[11px] font-medium border border-zinc-700/60 whitespace-nowrap cursor-pointer transition-all"
              >
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
              </button>
            ))}
          </div>

          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={3}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50 font-mono resize-none"
          />
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
            className="w-full accent-cyan-500 cursor-pointer"
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
            className="w-full accent-cyan-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-zinc-500 mt-1">
            <span>256 (Fast)</span>
            <span>2048 (Standard)</span>
            <span>4096 (Long-Form)</span>
          </div>
        </div>

        {/* Cache & Local Storage Management */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-zinc-200">Session & Scratchpad Cache</h4>
            <p className="text-[10px] text-zinc-400">Clear temporary scratchpad notes and cached conversation sessions.</p>
          </div>
          <button
            onClick={handleClearCache}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-rose-950/60 text-zinc-300 hover:text-rose-300 border border-zinc-700/80 hover:border-rose-500/40 text-xs font-bold transition-all cursor-pointer"
          >
            {clearCacheSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Trash2 className="w-3.5 h-3.5" />}
            <span>{clearCacheSuccess ? 'Cleared!' : 'Clear Cache'}</span>
          </button>
        </div>

        {/* Full Session Backup & Restore (.json) */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                <FileJson className="w-3.5 h-3.5 text-cyan-400" />
                <span>Full System Backup & Restore</span>
              </h4>
              <p className="text-[10px] text-zinc-400">Export or restore all on-device conversation histories, personas, and scratchpads in JSON format.</p>
            </div>
            {backupStatus && (
              <span className="text-[10px] text-emerald-400 font-bold font-mono">{backupStatus}</span>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleExportBackup}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Backup (.json)</span>
            </button>

            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all cursor-pointer border border-zinc-700/80">
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>Restore Backup</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportBackup}
              />
            </label>
          </div>
        </div>

        {/* Privacy Note */}
        <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-3 flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-zinc-300 leading-relaxed">
            <strong>100% Sovereign & Offline by Design:</strong> In on-device mode, all model weights execute entirely inside your smartphone&apos;s WebGPU & WebAssembly runtime. No telemetry or conversation transcripts are ever sent to external cloud servers.
          </div>
        </div>
      </div>
    </div>
  );
}
