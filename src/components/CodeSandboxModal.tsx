'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  RotateCcw,
  Copy,
  Check,
  Download,
  Terminal,
  Eye,
  FileCode,
  Sparkles,
  Maximize2,
  Trash2,
} from 'lucide-react';
import { useBackButtonClose } from '@/utils/backButton';

interface CodeSandboxModalProps {
  initialCode?: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ConsoleEntry {
  type: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: string;
}

const TEMPLATES: { id: string; name: string; category: string; code: string }[] = [
  {
    id: 'particles',
    name: '✨ Particle Constellation',
    category: 'Canvas 2D',
    code: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; background: #09090b; overflow: hidden; font-family: sans-serif; color: #38bdf8; }
    canvas { display: block; width: 100vw; height: 100vh; }
    #info { position: absolute; top: 12px; left: 16px; font-size: 11px; opacity: 0.8; pointer-events: none; }
  </style>
</head>
<body>
  <div id="info">Touch or move finger to attract glowing particles</div>
  <canvas id="c"></canvas>
  <script>
    console.log("Initializing On-Device Particle Sandbox...");
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    if (typeof window !== 'undefined') window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    const particles = [];
    const count = 45;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        radius: Math.random() * 2 + 1.5
      });
    }

    let pointer = { x: width / 2, y: height / 2 };
    if (typeof window !== 'undefined') window.addEventListener('pointermove', (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    });

    function draw() {
      ctx.fillStyle = 'rgba(9, 9, 11, 0.25)';
      ctx.fillRect(0, 0, width, height);

      particles.forEach((p, idx) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        // Attract to pointer
        const dx = pointer.x - p.x;
        const dy = pointer.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          p.x += dx * 0.015;
          p.y += dy * 0.015;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#06b6d4';
        ctx.fill();

        for (let j = idx + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const d = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (d < 90) {
            ctx.beginPath();
            ctx.strokeStyle = \`rgba(6, 182, 212, \${1 - d / 90})\`;
            ctx.lineWidth = 0.6;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      });

      requestAnimationFrame(draw);
    }
    draw();
    console.log("Particle constellation running smoothly!");
  </script>
</body>
</html>`,
  },
  {
    id: 'calculator',
    name: '🧮 Neumorphic Calculator',
    category: 'UI Component',
    code: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #0f172a; font-family: system-ui, -apple-system, sans-serif;
    }
    .calc {
      background: #1e293b; border-radius: 20px; padding: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);
      width: 280px; border: 1px solid #334155;
    }
    .display {
      background: #090d16; border-radius: 12px; padding: 16px; font-size: 28px; font-family: monospace;
      text-align: right; color: #38bdf8; margin-bottom: 16px; overflow-x: auto;
    }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    button {
      padding: 14px; border: none; border-radius: 12px; background: #334155; color: #f8fafc;
      font-size: 16px; font-weight: bold; cursor: pointer; transition: active 0.1s;
    }
    button:active { transform: scale(0.94); }
    button.op { background: #0284c7; color: white; }
    button.eq { background: #10b981; grid-column: span 2; }
    button.clr { background: #ef4444; }
  </style>
</head>
<body>
  <div class="calc">
    <div class="display" id="disp">0</div>
    <div class="grid">
      <button class="clr" onclick="clearD()">C</button>
      <button onclick="press('/')" class="op">÷</button>
      <button onclick="press('*')" class="op">×</button>
      <button onclick="press('-')" class="op">−</button>
      <button onclick="press('7')">7</button>
      <button onclick="press('8')">8</button>
      <button onclick="press('9')">9</button>
      <button onclick="press('+')" class="op">+</button>
      <button onclick="press('4')">4</button>
      <button onclick="press('5')">5</button>
      <button onclick="press('6')">6</button>
      <button onclick="press('.')">.</button>
      <button onclick="press('1')">1</button>
      <button onclick="press('2')">2</button>
      <button onclick="press('3')">3</button>
      <button onclick="press('0')">0</button>
      <button class="eq" onclick="calc()">=</button>
    </div>
  </div>
  <script>
    let expr = '';
    const disp = document.getElementById('disp');
    function press(ch) {
      if (expr === '0' && ch !== '.') expr = '';
      expr += ch;
      disp.innerText = expr;
      console.log('Key pressed:', ch);
    }
    function clearD() {
      expr = '0';
      disp.innerText = expr;
      console.log('Display reset');
    }
    function calc() {
      try {
        const res = Function('"use strict"; return (' + expr + ')')();
        disp.innerText = res;
        console.log('Result calculated:', expr, '=', res);
        expr = String(res);
      } catch(err) {
        disp.innerText = 'Err';
        console.error('Calculation error:', err.message);
      }
    }
  </script>
</body>
</html>`,
  },
  {
    id: 'radar',
    name: '📡 Cyberpunk Telemetry Radar',
    category: 'SVG Animation',
    code: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; background: #000; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: monospace; color: #10b981; }
    svg { max-width: 300px; width: 80vw; filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.4)); }
    .label { font-size: 12px; margin-top: 15px; letter-spacing: 2px; }
  </style>
</head>
<body>
  <svg viewBox="0 0 200 200">
    <circle cx="100" cy="100" r="90" fill="none" stroke="#064e3b" stroke-width="2"/>
    <circle cx="100" cy="100" r="60" fill="none" stroke="#064e3b" stroke-width="1.5" stroke-dasharray="4,4"/>
    <circle cx="100" cy="100" r="30" fill="none" stroke="#064e3b" stroke-width="1"/>
    <line x1="100" y1="10" x2="100" y2="190" stroke="#064e3b" stroke-width="1"/>
    <line x1="10" y1="100" x2="190" y2="100" stroke="#064e3b" stroke-width="1"/>
    <!-- Sweeper Beam -->
    <path d="M100 100 L190 100 A90 90 0 0 0 163 36 Z" fill="url(#sweepGrad)">
      <animateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="3s" repeatCount="indefinite"/>
    </path>
    <!-- Blip -->
    <circle cx="140" cy="70" r="4" fill="#34d399">
      <animate attributeName="opacity" values="1;0.2;1" dur="1.5s" repeatCount="indefinite"/>
    </circle>
    <defs>
      <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#10b981" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
      </linearGradient>
    </defs>
  </svg>
  <div class="label">ON-DEVICE SENSOR ACTIVE</div>
  <script>
    console.log("Telemetry Radar stream initialized. Blip locked at bearing 042°.");
  </script>
</body>
</html>`,
  },
];

export default function CodeSandboxModal({
  initialCode,
  isOpen,
  onClose,
}: CodeSandboxModalProps) {
  useBackButtonClose(isOpen, onClose);

  const [code, setCode] = useState<string>(initialCode || TEMPLATES[0].code);
  // Only the committed code reaches the iframe. Binding the editor state
  // directly to srcDoc tore down and re-executed the whole sandbox document
  // (scripts, rAF loops, console spew) on every single keystroke.
  const [previewCode, setPreviewCode] = useState<string>(initialCode || TEMPLATES[0].code);
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'console'>('preview');
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [copied, setCopied] = useState(false);

  // Fresh session on every open. The FAB opens the sandbox with an empty
  // initialCode on purpose, but a falsy value used to be skipped by the old
  // sync effect, so the previous session's edited code, console logs and
  // active tab reappeared instead of a fresh template.
  useEffect(() => {
    if (!isOpen) return;
    const start = initialCode && initialCode.trim() ? initialCode : TEMPLATES[0].code;
    setCode(start);
    setPreviewCode(start);
    setLogs([]);
    setCopied(false);
    setActiveTab('preview');
  }, [isOpen, initialCode]);

  // Console message listener from iframe sandbox
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'HERMES_SANDBOX_LOG') {
        setLogs((prev) => [
          ...prev,
          {
            type: e.data.level || 'log',
            message: e.data.args ? e.data.args.join(' ') : String(e.data.message || ''),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          },
        ].slice(-200));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const getExecutableHTML = (rawCode: string) => {
    const injectionScript = `
      <script>
        (function() {
          const wrapConsole = (level) => {
            const original = console[level];
            console[level] = function(...args) {
              try {
                window.parent.postMessage({
                  type: 'HERMES_SANDBOX_LOG',
                  level: level,
                  args: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a))
                }, '*');
              } catch (_) {}
              if (original) original.apply(console, args);
            };
          };
          wrapConsole('log');
          wrapConsole('warn');
          wrapConsole('error');
          wrapConsole('info');
          window.addEventListener('error', function(e) {
            console.error(e.message + ' (' + e.filename + ':' + e.lineno + ')');
          });
        })();
      </script>
    `;

    if (rawCode.includes('<head>')) {
      return rawCode.replace('<head>', '<head>' + injectionScript);
    } else if (rawCode.includes('<html>')) {
      return rawCode.replace('<html>', '<html><head>' + injectionScript + '</head>');
    }
    return `<!DOCTYPE html><html><head>${injectionScript}</head><body style="margin:0;background:#09090b;color:#e4e4e7;font-family:sans-serif;padding:12px;">${rawCode}</body></html>`;
  };

  const handleRefresh = () => {
    setLogs([]);
    setPreviewCode(code);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch (_) {
      return; // Android WebView clipboard writes can reject; no false feedback.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hermes-sandbox-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col w-full h-[95vh] max-w-4xl bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Top Control Bar */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-900 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-bold text-white tracking-wide flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-cyan-400" />
              <span>AI Code Sandbox</span>
            </span>

            {/* Template Selector */}
            <select
              aria-label="Preset code templates"
              onChange={(e) => {
                const tpl = TEMPLATES.find((t) => t.id === e.target.value);
                if (tpl) {
                  setCode(tpl.code);
                  setPreviewCode(tpl.code);
                  setLogs([]);
                  setActiveTab('preview');
                }
              }}
              className="ml-2 bg-zinc-800 text-[10px] text-zinc-300 border border-zinc-700 rounded-lg px-2 py-1 outline-none cursor-pointer"
            >
              <option value="">Preset Templates...</option>
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            {code !== previewCode && (
              <button
                onClick={handleRefresh}
                aria-label="Run edited code"
                title="Run edited code"
                className="flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Run</span>
              </button>
            )}
            <button
              onClick={handleRefresh}
              aria-label="Re-run code in sandbox"
              title="Re-run code"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCopyCode}
              aria-label="Copy code to clipboard"
              title="Copy code"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleDownload}
              aria-label="Download HTML code"
              title="Download HTML"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close code sandbox"
              title="Close Sandbox"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigator */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/60 border-b border-zinc-800/80 text-xs">
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setActiveTab('preview');
                // Tapping Live Preview with uncommitted edits runs them, the
                // same as the Run button - but never mid-keystroke.
                if (code !== previewCode) setPreviewCode(code);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Live Preview</span>
            </button>

            <button
              onClick={() => setActiveTab('code')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'code'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Source Editor</span>
            </button>

            <button
              onClick={() => setActiveTab('console')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer relative ${
                activeTab === 'console'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Console</span>
              {logs.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-cyan-500 text-zinc-950 text-[9px] font-black">
                  {logs.length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'console' && (
            <button
              onClick={() => setLogs([])}
              className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-rose-400 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Workspace Body */}
        <div className="flex-1 relative overflow-hidden bg-black">
          {/* 1. Live Preview */}
          <div className={`w-full h-full ${activeTab === 'preview' ? 'block' : 'hidden'}`}>
            <iframe
              title="AI Code Runner Sandbox"
              sandbox="allow-scripts allow-modals"
              srcDoc={getExecutableHTML(previewCode)}
              className="w-full h-full border-none bg-[#09090b]"
            />
          </div>

          {/* 2. Source Editor */}
          <div className={`w-full h-full p-2 flex flex-col ${activeTab === 'code' ? 'block' : 'hidden'}`}>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter HTML, CSS, JavaScript or SVG code..."
              spellCheck={false}
              className="w-full h-full p-3 bg-zinc-950 text-cyan-300 font-mono text-xs leading-relaxed border border-zinc-800 rounded-xl resize-none outline-none focus:border-cyan-500/50"
            />
          </div>

          {/* 3. Console Logs */}
          <div className={`w-full h-full p-3 font-mono text-xs overflow-y-auto space-y-1.5 ${activeTab === 'console' ? 'block' : 'hidden'}`}>
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs">
                <Terminal className="w-8 h-8 text-zinc-700 mb-2" />
                <span>No console output recorded yet.</span>
                <span className="text-[10px] text-zinc-600 mt-1">Logs from console.log/warn/error will appear here.</span>
              </div>
            ) : (
              logs.map((l, i) => (
                <div
                  key={i}
                  className={`p-2 rounded-lg flex items-start gap-2 border text-[11px] ${
                    l.type === 'error'
                      ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                      : l.type === 'warn'
                      ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                  }`}
                >
                  <span className="text-zinc-500 shrink-0 select-none">[{l.timestamp}]</span>
                  <span className="flex-1 whitespace-pre-wrap break-all">{l.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
