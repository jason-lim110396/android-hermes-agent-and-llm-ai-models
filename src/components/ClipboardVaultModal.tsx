'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Clipboard,
  Copy,
  Check,
  Trash2,
  Search,
  Link2,
  Phone,
  Mail,
  Code,
  FileText,
  Hash,
  Star,
  StarOff,
  Share2,
  Send,
  Sparkles,
  RefreshCw,
  Clock,
  Filter,
} from 'lucide-react';

interface ClipEntry {
  id: string;
  text: string;
  type: 'url' | 'phone' | 'email' | 'code' | 'text' | 'number';
  createdAt: string;
  pinned: boolean;
  charCount: number;
}

function detectType(text: string): ClipEntry['type'] {
  const t = text.trim();
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return 'url';
  if (/^\+?[\d\s\-().]{7,20}$/.test(t)) return 'phone';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return 'email';
  if (/^\d+(\.\d+)?$/.test(t)) return 'number';
  if (
    t.includes('function ') ||
    t.includes('const ') ||
    t.includes('import ') ||
    t.includes('=>') ||
    t.includes('def ') ||
    t.includes('class ')
  )
    return 'code';
  return 'text';
}

const SEED_ENTRIES: ClipEntry[] = [
  {
    id: 'clip-1',
    text: 'https://github.com/jason-lim110396/android-hermes-agent-and-llm-ai-models',
    type: 'url',
    createdAt: '2026-11-20T12:30:00',
    pinned: true,
    charCount: 72,
  },
  {
    id: 'clip-2',
    text: '+65 9123 4567',
    type: 'phone',
    createdAt: '2026-11-20T11:15:00',
    pinned: false,
    charCount: 13,
  },
  {
    id: 'clip-3',
    text: 'alex.johnson@hermes-ai.internal',
    type: 'email',
    createdAt: '2026-11-20T10:45:00',
    pinned: false,
    charCount: 31,
  },
  {
    id: 'clip-4',
    text: "const runInference = async (prompt: string) => {\n  const engine = await webllm.CreateMLCEngine('Hermes-3-Llama-3.2-3B');\n  return engine.chat.completions.create({ messages: [{ role: 'user', content: prompt }] });\n};",
    type: 'code',
    createdAt: '2026-11-20T09:20:00',
    pinned: true,
    charCount: 198,
  },
  {
    id: 'clip-5',
    text: 'Meeting tomorrow at 2 PM – bring the Q4 benchmark report and prepare slides on WebGPU token speed.',
    type: 'text',
    createdAt: '2026-11-20T08:55:00',
    pinned: false,
    charCount: 97,
  },
];

const TYPE_META: Record<
  ClipEntry['type'],
  { icon: React.ElementType; label: string; color: string; bg: string }
> = {
  url: { icon: Link2, label: 'URL', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  phone: { icon: Phone, label: 'Phone', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  email: { icon: Mail, label: 'Email', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  code: { icon: Code, label: 'Code', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
  text: { icon: FileText, label: 'Text', color: 'text-zinc-400', bg: 'bg-zinc-800/60 border-zinc-700/50' },
  number: { icon: Hash, label: 'Number', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30' },
};

interface ClipboardVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert?: (text: string) => void;
  onAuditWithAgent?: (prompt: string) => void;
}

export default function ClipboardVaultModal({
  isOpen,
  onClose,
  onInsert,
  onAuditWithAgent,
}: ClipboardVaultModalProps) {
  const [entries, setEntries] = useState<ClipEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<ClipEntry['type'] | 'all'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Load from localStorage + seed
  useEffect(() => {
    if (!isOpen) return;
    try {
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem('hermes_clipboard_vault');
        if (stored) {
          setEntries(JSON.parse(stored));
          return;
        }
      }
    } catch (_) {}
    setEntries(SEED_ENTRIES);
  }, [isOpen]);

  const persist = useCallback((updated: ClipEntry[]) => {
    setEntries(updated);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('hermes_clipboard_vault', JSON.stringify(updated));
      } catch (_) {}
    }
  }, []);

  // Read live clipboard on open
  useEffect(() => {
    if (!isOpen) return;
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      'readText' in navigator.clipboard
    ) {
      navigator.clipboard
        .readText()
        .then((text) => {
          const trimmed = text?.trim();
          if (trimmed && trimmed.length > 0 && trimmed.length < 4000) {
            setEntries((prev) => {
              if (prev.some((e) => e.text === trimmed)) return prev;
              const newEntry: ClipEntry = {
                id: 'clip-live-' + Date.now(),
                text: trimmed,
                type: detectType(trimmed),
                createdAt: new Date().toISOString(),
                pinned: false,
                charCount: trimmed.length,
              };
              const updated = [newEntry, ...prev];
              if (typeof window !== 'undefined') {
                try {
                  window.localStorage.setItem('hermes_clipboard_vault', JSON.stringify(updated));
                } catch (_) {}
              }
              return updated;
            });
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const handleAdd = () => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    const entry: ClipEntry = {
      id: 'clip-' + Date.now(),
      text: trimmed,
      type: detectType(trimmed),
      createdAt: new Date().toISOString(),
      pinned: false,
      charCount: trimmed.length,
    };
    persist([entry, ...entries]);
    setNewText('');
    setIsAdding(false);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
  };

  const handleCopy = async (entry: ClipEntry) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(entry.text);
      }
    } catch (_) {}
    setCopiedId(entry.id);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(25);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (id: string) => {
    persist(entries.filter((e) => e.id !== id));
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([20, 10]);
  };

  const handlePin = (id: string) => {
    persist(entries.map((e) => (e.id === id ? { ...e, pinned: !e.pinned } : e)));
  };

  const handleShare = async (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (_) {}
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  };

  const handleAudit = (text: string) => {
    if (onAuditWithAgent) {
      onAuditWithAgent(
        `Please analyse the following clipboard content and extract any actionable insights, contacts, tasks, links, or code review points:\n\n${text}`
      );
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([30, 20, 50]);
      onClose();
    }
  };

  const filtered = entries
    .filter((e) => (filterType === 'all' ? true : e.type === filterType))
    .filter(
      (e) =>
        searchQuery === '' ||
        e.text.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[92vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden font-sans text-white">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Clipboard className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-100">Smart Clipboard Vault</h2>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  {entries.length} entries
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Type-aware history · Pin, copy, share, audit with AI
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/40 flex flex-col gap-2 shrink-0">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clipboard entries..."
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {(['all', 'url', 'phone', 'email', 'number', 'code', 'text'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  filterType === type
                    ? 'bg-violet-500/30 text-violet-300 border-violet-500/40'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                }`}
              >
                {type === 'all' ? 'All' : TYPE_META[type].label}
              </button>
            ))}
            <button
              onClick={() => setIsAdding((v) => !v)}
              className="ml-auto px-2.5 py-1 rounded-full text-[10px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-all cursor-pointer whitespace-nowrap"
            >
              + Add
            </button>
          </div>
          {isAdding && (
            <div className="flex gap-2 mt-1">
              <input
                autoFocus
                type="text"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="Paste or type to save..."
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-violet-500/60"
              />
              <button
                onClick={handleAdd}
                className="px-3 py-2 rounded-xl bg-violet-500/30 text-violet-300 border border-violet-500/40 text-xs font-bold cursor-pointer hover:bg-violet-500/40"
              >
                Save
              </button>
            </div>
          )}
        </div>

        {/* Entry List */}
        <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-2">
          {filtered.length === 0 && (
            <div className="text-center text-zinc-500 text-xs py-8">
              No clipboard entries match your filter.
            </div>
          )}
          {filtered.map((entry) => {
            const meta = TYPE_META[entry.type];
            const Icon = meta.icon;
            const isCopied = copiedId === entry.id;
            const preview =
              entry.text.length > 120 ? entry.text.slice(0, 120) + '…' : entry.text;
            const timeLabel = new Date(entry.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <div
                key={entry.id}
                className={`p-3 rounded-2xl border ${meta.bg} flex flex-col gap-2 group transition-all`}
              >
                {/* Top Row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
                    <span className={`text-[9px] font-bold uppercase tracking-wide ${meta.color}`}>
                      {meta.label}
                    </span>
                    {entry.pinned && (
                      <span className="text-[9px] text-amber-400 font-bold">📌 Pinned</span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 text-zinc-500 text-[9px] font-mono">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{timeLabel}</span>
                    <span className="ml-1">{entry.charCount} chars</span>
                  </div>
                </div>

                {/* Content */}
                <p
                  className={`text-[11px] leading-relaxed font-mono break-all ${
                    entry.type === 'code' ? 'text-purple-200' : 'text-zinc-200'
                  }`}
                >
                  {preview}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => handleCopy(entry)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 text-[10px] font-semibold transition-all cursor-pointer"
                  >
                    {isCopied ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {isCopied ? 'Copied' : 'Copy'}
                  </button>

                  {onInsert && (
                    <button
                      onClick={() => { onInsert(entry.text); onClose(); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 text-[10px] font-semibold transition-all cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      Insert
                    </button>
                  )}

                  <button
                    onClick={() => handleShare(entry.text)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 text-[10px] font-semibold transition-all cursor-pointer"
                  >
                    <Share2 className="w-3 h-3" />
                    Share
                  </button>

                  {onAuditWithAgent && (
                    <button
                      onClick={() => handleAudit(entry.text)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 text-[10px] font-semibold transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      Analyse
                    </button>
                  )}

                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => handlePin(entry.id)}
                      className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-amber-400 transition-colors cursor-pointer"
                      title={entry.pinned ? 'Unpin' : 'Pin'}
                    >
                      {entry.pinned ? (
                        <StarOff className="w-3.5 h-3.5" />
                      ) : (
                        <Star className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="p-1 rounded-lg hover:bg-rose-500/10 text-zinc-600 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[10px] text-zinc-500">
            {filtered.length} of {entries.length} entries shown
          </span>
          <button
            onClick={() => {
              persist(SEED_ENTRIES);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-semibold transition-all cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
