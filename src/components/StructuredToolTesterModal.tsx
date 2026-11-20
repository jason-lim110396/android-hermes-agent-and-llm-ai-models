'use client';

import React, { useState } from 'react';
import {
  Wrench,
  X,
  Play,
  Copy,
  Check,
  Send,
  Terminal,
  Code2,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { AGENT_TOOLS, AgentTool } from '@/agentTools';
import { useAppStore } from '@/appStore';

interface StructuredToolTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StructuredToolTesterModal({ isOpen, onClose }: StructuredToolTesterModalProps) {
  const sendMessage = useAppStore((s) => s.sendMessage);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);

  const [selectedToolIndex, setSelectedToolIndex] = useState(0);
  const [paramInputs, setParamInputs] = useState<Record<string, string>>({
    query: 'Hermes 3 on-device WebGPU benchmark',
    code: 'Math.sqrt(144) * Math.PI',
    filter: 'receipts',
    intensity: 'medium',
    title: 'Review Q4 Mobile Architecture',
    due_time: 'Tomorrow 10:00 AM',
  });

  const [execResult, setExecResult] = useState<string | null>(null);
  const [execDuration, setExecDuration] = useState<number | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);

  if (!isOpen) return null;

  const currentTool: AgentTool = AGENT_TOOLS[selectedToolIndex] || AGENT_TOOLS[0];

  // Generate OpenAI / Hermes JSON Schema
  const jsonSchema = {
    type: 'function',
    function: {
      name: currentTool.name,
      description: currentTool.description,
      parameters: {
        type: 'object',
        properties: currentTool.parameters.reduce((acc, p) => {
          acc[p.name] = {
            type: p.type,
            description: p.description,
          };
          return acc;
        }, {} as Record<string, any>),
        required: currentTool.parameters.filter((p) => p.required).map((p) => p.name),
      },
    },
  };

  const schemaString = JSON.stringify(jsonSchema, null, 2);

  const handleRunTool = async () => {
    setIsExecuting(true);
    setExecResult(null);
    setExecDuration(null);
    const startTime = performance.now();

    try {
      const args: Record<string, any> = {};
      currentTool.parameters.forEach((p) => {
        args[p.name] = paramInputs[p.name] || '';
      });

      const res = await currentTool.execute(args);
      const elapsed = Math.round(performance.now() - startTime);
      setExecResult(res);
      setExecDuration(elapsed);
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (err: any) {
      setExecResult(`Error executing tool: ${err?.message || err}`);
      setExecDuration(Math.round(performance.now() - startTime));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopySchema = () => {
    navigator.clipboard.writeText(schemaString);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  };

  const handleDispatchToHermes = () => {
    const args: Record<string, any> = {};
    currentTool.parameters.forEach((p) => {
      args[p.name] = paramInputs[p.name] || '';
    });

    const msg = `Please invoke the autonomous tool \`${currentTool.name}\` with the following validated parameters:\n\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\``;
    sendMessage(msg);
    setCurrentTab('chat');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>Structured Tool Calling & JSON Schema Studio</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                  Hermes 3
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">Inspect JSON schemas and execute local tools with zero cloud latency</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tool Selector Carousel */}
        <div className="p-3 bg-zinc-900/90 border-b border-zinc-800 overflow-x-auto scrollbar-none flex items-center gap-1.5">
          {AGENT_TOOLS.map((t, idx) => {
            const isSelected = selectedToolIndex === idx;
            return (
              <button
                key={t.name}
                onClick={() => {
                  setSelectedToolIndex(idx);
                  setExecResult(null);
                  setExecDuration(null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-md ring-1 ring-cyan-500/30'
                    : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
                }`}
              >
                {t.name}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 select-none">
          {/* Tool Description Card */}
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-1">
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span className="font-mono text-cyan-400">tool: {currentTool.name}</span>
              <span className="text-[10px] text-zinc-500 font-mono">{currentTool.parameters.length} parameter{currentTool.parameters.length !== 1 ? 's' : ''}</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">{currentTool.description}</p>
          </div>

          {/* Interactive Parameters Input Form */}
          {currentTool.parameters.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Input Arguments</span>
              <div className="space-y-2.5">
                {currentTool.parameters.map((p) => (
                  <div key={p.name} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono font-bold text-zinc-200">{p.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {p.type} {p.required && <span className="text-rose-400 font-bold">*required</span>}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={paramInputs[p.name] || ''}
                      onChange={(e) =>
                        setParamInputs((prev) => ({
                          ...prev,
                          [p.name]: e.target.value,
                        }))
                      }
                      placeholder={p.description}
                      className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Trigger Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleRunTool}
              disabled={isExecuting}
              className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>{isExecuting ? 'Executing...' : 'Run Tool Locally'}</span>
            </button>

            <button
              onClick={handleDispatchToHermes}
              className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Dispatch to Hermes</span>
            </button>
          </div>

          {/* Execution Output Console */}
          {execResult && (
            <div className="space-y-1.5 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Local Execution Output</span>
                </span>
                {execDuration !== null && (
                  <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{execDuration} ms</span>
                  </span>
                )}
              </div>
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 font-mono whitespace-pre-wrap select-text leading-relaxed max-h-48 overflow-y-auto">
                {execResult}
              </div>
            </div>
          )}

          {/* Schema Code Inspector */}
          <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <Code2 className="w-3.5 h-3.5" />
                <span>OpenAI / Hermes Function Schema</span>
              </span>
              <button
                onClick={handleCopySchema}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
              >
                {copiedSchema ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSchema ? 'Copied' : 'Copy Schema'}</span>
              </button>
            </div>
            <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-[11px] text-zinc-400 font-mono overflow-x-auto leading-relaxed select-text max-h-44">
              {schemaString}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
