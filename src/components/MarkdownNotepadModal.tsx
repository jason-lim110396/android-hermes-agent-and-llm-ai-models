'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  FileText,
  Plus,
  Trash2,
  Pin,
  Search,
  Sparkles,
  Download,
  Copy,
  Check,
  Eye,
  Edit3,
  Tag,
  Clock,
  Send,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import { useBackButtonClose } from '@/utils/backButton';

export interface MobileNote {
  id: string;
  title: string;
  content: string;
  category: 'General' | 'Meeting' | 'Architecture' | 'Code' | 'Prompt' | 'Idea';
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'hermes_mobile_notes_v1';

// The mobile_notes_vault agent tool writes this same key directly while the
// (always-mounted) modal is closed. A vault write is therefore debounced, not
// synchronous: pendingVault holds the latest snapshot and is flushed on modal
// close, on visibilitychange-hidden / pagehide (the WebView suspend/kill
// window - JS timers stop firing the moment the app is backgrounded), and
// before every reopen read. Mirrors sessionPersistence's flush design.
let vaultPersistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingVault: MobileNote[] | null = null;

/** Synchronous write of the most recent pending snapshot. Never throws. */
function flushVaultPersistNow(): void {
  if (typeof window === 'undefined') return;
  if (vaultPersistTimer) {
    clearTimeout(vaultPersistTimer);
    vaultPersistTimer = null;
  }
  const pending = pendingVault;
  pendingVault = null;
  if (!pending) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // storage quota or unavailable - same best-effort behavior as before.
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushVaultPersistNow();
  });
  window.addEventListener('pagehide', flushVaultPersistNow);
}

/** Debounced vault save: in-memory state updates at once, the synchronous
 * localStorage write happens once per typing pause instead of per keystroke. */
function scheduleVaultPersist(notes: MobileNote[]): void {
  if (typeof window === 'undefined') return;
  pendingVault = notes;
  if (vaultPersistTimer) clearTimeout(vaultPersistTimer);
  vaultPersistTimer = setTimeout(flushVaultPersistNow, 400);
}

// The stored vault may be corrupt JSON, a non-array, or hold junk entries
// (the #129 pattern the agent tool already guards against). One bad entry
// must not crash the whole Chat tab: this modal lives inside the tab-level
// ErrorBoundary, so an unsanitized read would brick the tab in a loop.
function coerceNote(raw: unknown): MobileNote | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;
  const category = CATEGORIES.includes(o.category as MobileNote['category'])
    ? (o.category as MobileNote['category'])
    : 'General';
  return {
    id: o.id,
    title: typeof o.title === 'string' ? o.title : 'Untitled Note',
    content: typeof o.content === 'string' ? o.content : '',
    category,
    isPinned: o.isPinned === true,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
  };
}

const DEFAULT_NOTES: MobileNote[] = [
  {
    id: 'note-welcome',
    title: '🚀 Welcome to Hermes Mobile Notes',
    content: `# Hermes On-Device Notepad\n\nThis is your secure, high-performance offline document & note vault.\n\n### Key Features:\n- **Instant Markdown Preview**: Toggle between live editor and rendered formatting.\n- **Agent Integration**: Polish, summarize, or extract action items with Hermes AI.\n- **Zero Cloud Leak**: Stored 100% locally on your Android device.\n- **Export Anywhere**: Download as \`.md\` or inject directly into your active chat session.`,
    category: 'General',
    isPinned: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'note-arch',
    title: '📐 Edge AI Architecture Checklist',
    content: `## Mobile Model Optimization\n\n1. Quantization: INT4 / INT8 AWQ for low VRAM\n2. Context Compression: Sliding window attention\n3. Tool Execution: Safe sandboxed background workers\n4. Latency Target: < 45ms time-to-first-token`,
    category: 'Architecture',
    isPinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const CATEGORIES: MobileNote['category'][] = [
  'General',
  'Meeting',
  'Architecture',
  'Code',
  'Prompt',
  'Idea',
];

export default function MarkdownNotepadModal({
  isOpen,
  onClose,
  onInsertIntoChat,
  onAuditWithAgent,
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsertIntoChat?: (text: string) => void;
  onAuditWithAgent?: (prompt: string) => void;
}) {
  useBackButtonClose(isOpen, onClose);

  const [notes, setNotes] = useState<MobileNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);
  const seededVaultRef = useRef(false);

  // Reload the vault from localStorage on every open. The modal stays mounted
  // while closed, and the mobile_notes_vault agent tool writes this key
  // directly in the meantime - a stale in-memory snapshot that is written
  // back on the first edit would silently delete agent-created notes (lost
  // update). Flush any still-pending edit on close first, so the read below
  // never races a debounced write.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isOpen) {
      flushVaultPersistNow();
      return;
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const restored = parsed
            .map(coerceNote)
            .filter((n): n is MobileNote => n !== null);
          // An intentionally empty vault ("[]") is authoritative: seeding
          // DEFAULT_NOTES here would resurrect every note the user deleted.
          setNotes(restored);
          setActiveNoteId(restored[0]?.id || '');
          seededVaultRef.current = true;
          return;
        }
      }
    } catch {
      // Corrupt vault: fall through and start from the starter notes
      // instead of throwing (the first edit then overwrites the bad blob).
    }
    if (!seededVaultRef.current) {
      seededVaultRef.current = true;
      setNotes(DEFAULT_NOTES);
      setActiveNoteId(DEFAULT_NOTES[0].id);
    }
  }, [isOpen]);

  // If this component ever unmounts with an edit still in the debounce
  // window, commit it before the refs holding it disappear.
  useEffect(() => () => flushVaultPersistNow(), []);

  // Update in-memory state at once; the synchronous localStorage write is
  // debounced (see scheduleVaultPersist) so typing does not stringify and
  // persist the whole vault on every keystroke.
  const saveNotes = (updated: MobileNote[]) => {
    setNotes(updated);
    scheduleVaultPersist(updated);
  };

  const activeNote = useMemo(() => {
    return notes.find((n) => n.id === activeNoteId) || notes[0] || null;
  }, [notes, activeNoteId]);

  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => {
        const matchesCat = selectedCategory === 'All' || n.category === selectedCategory;
        const matchesQuery =
          !searchQuery.trim() ||
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.content.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCat && matchesQuery;
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [notes, selectedCategory, searchQuery]);

  const handleCreateNote = () => {
    const newNote: MobileNote = {
      id: `note-${Date.now()}`,
      title: 'Untitled Note',
      content: '',
      category: selectedCategory === 'All' ? 'General' : (selectedCategory as MobileNote['category']),
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [newNote, ...notes];
    saveNotes(updated);
    setActiveNoteId(newNote.id);
    setViewMode('edit');
  };

  const handleUpdateActiveNote = (fields: Partial<MobileNote>) => {
    if (!activeNote) return;
    const updated = notes.map((n) =>
      n.id === activeNote.id
        ? { ...n, ...fields, updatedAt: new Date().toISOString() }
        : n
    );
    saveNotes(updated);
  };

  const handleDeleteNote = (id: string) => {
    const updated = notes.filter((n) => n.id !== id);
    saveNotes(updated);
    if (activeNoteId === id) {
      setActiveNoteId(updated[0]?.id || '');
    }
  };

  const handleTogglePin = (id: string) => {
    const updated = notes.map((n) =>
      n.id === id ? { ...n, isPinned: !n.isPinned } : n
    );
    saveNotes(updated);
  };

  const handleCopyContent = () => {
    if (!activeNote) return;
    // Only report "Copied" when the clipboard write actually resolved.
    navigator.clipboard
      .writeText(activeNote.content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  };

  const handleExportFile = () => {
    if (!activeNote) return;
    const blob = new Blob([activeNote.content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeNote.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'note'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleInsertChat = () => {
    if (!activeNote || !onInsertIntoChat) return;
    onInsertIntoChat(`### ${activeNote.title}\n\n${activeNote.content}`);
    setInserted(true);
    setTimeout(() => setInserted(false), 2000);
  };

  // Metrics
  const wordCount = useMemo(() => {
    if (!activeNote?.content) return 0;
    return activeNote.content.trim().split(/\s+/).filter(Boolean).length;
  }, [activeNote]);

  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="px-4 py-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                Markdown Notepad & Document Vault
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Offline
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                On-device encrypted notes, instant preview & agent actions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateNote}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Note</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {/* Left Sidebar: Notes list */}
          <div className="w-full md:w-72 bg-zinc-900/50 border-r border-zinc-800/80 flex flex-col shrink-0">
            {/* Search & Category Filter */}
            <div className="p-3 border-b border-zinc-800/80 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {/* Categories Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-[10px]">
                <button
                  onClick={() => setSelectedCategory('All')}
                  className={`px-2 py-0.5 rounded-lg border font-medium shrink-0 transition-all ${
                    selectedCategory === 'All'
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  All ({notes.length})
                </button>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-0.5 rounded-lg border font-medium shrink-0 transition-all ${
                      selectedCategory === cat
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes List Scroll */}
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
              {filteredNotes.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">
                  No notes match your filter.
                </div>
              ) : (
                filteredNotes.map((note) => {
                  const isActive = note.id === activeNote?.id;
                  return (
                    <div
                      key={note.id}
                      onClick={() => setActiveNoteId(note.id)}
                      className={`p-3 cursor-pointer transition-all flex flex-col gap-1 select-none ${
                        isActive
                          ? 'bg-emerald-500/10 border-l-2 border-emerald-500'
                          : 'hover:bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-semibold text-zinc-200 truncate flex items-center gap-1">
                          {note.isPinned && (
                            <Pin className="w-2.5 h-2.5 text-amber-400 shrink-0 fill-amber-400" />
                          )}
                          {note.title || 'Untitled Note'}
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                          {note.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 line-clamp-1">
                        {note.content.replace(/[#*`_]/g, '') || 'Empty note...'}
                      </p>
                      <div className="flex items-center justify-between text-[9px] text-zinc-500 mt-0.5">
                        <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                        <span>{note.content.length} chars</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Area: Active Note Editor / Preview */}
          {activeNote ? (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-zinc-950">
              {/* Note Header / Meta Bar */}
              <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/30 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={activeNote.title}
                    onChange={(e) => handleUpdateActiveNote({ title: e.target.value })}
                    placeholder="Note Title"
                    className="bg-transparent text-sm font-bold text-zinc-100 focus:outline-none flex-1 placeholder-zinc-600"
                  />
                  <select
                    value={activeNote.category}
                    onChange={(e) =>
                      handleUpdateActiveNote({
                        category: e.target.value as MobileNote['category'],
                      })
                    }
                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-zinc-300 focus:outline-none"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mode Toggles & Action Buttons */}
                <div className="flex items-center gap-1.5 text-xs">
                  {/* Edit / Preview toggle */}
                  <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5">
                    <button
                      onClick={() => setViewMode('edit')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        viewMode === 'edit'
                          ? 'bg-zinc-800 text-emerald-400 font-semibold shadow'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => setViewMode('preview')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        viewMode === 'preview'
                          ? 'bg-zinc-800 text-cyan-400 font-semibold shadow'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>Preview</span>
                    </button>
                  </div>

                  {/* Pin toggle */}
                  <button
                    onClick={() => handleTogglePin(activeNote.id)}
                    title={activeNote.isPinned ? 'Unpin Note' : 'Pin Note'}
                    className={`p-1.5 rounded-xl border transition-all ${
                      activeNote.isPinned
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Pin className={`w-3.5 h-3.5 ${activeNote.isPinned ? 'fill-amber-400' : ''}`} />
                  </button>

                  {/* Copy */}
                  <button
                    onClick={handleCopyContent}
                    title="Copy Markdown"
                    className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Export .md */}
                  <button
                    onClick={handleExportFile}
                    title="Export as .md"
                    className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  {/* Insert to Chat */}
                  {onInsertIntoChat && (
                    <button
                      onClick={handleInsertChat}
                      title="Insert note into active chat"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
                    >
                      {inserted ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                      <span className="text-[10px] font-semibold">To Chat</span>
                    </button>
                  )}

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteNote(activeNote.id)}
                    title="Delete Note"
                    className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Editor / Preview Content Body */}
              <div className="flex-1 overflow-y-auto p-4">
                {viewMode === 'edit' ? (
                  <textarea
                    value={activeNote.content}
                    onChange={(e) => handleUpdateActiveNote({ content: e.target.value })}
                    placeholder="Write Markdown here... Use # for headings, - for lists, ``` for code."
                    className="w-full h-full min-h-[350px] bg-transparent text-zinc-200 text-sm font-mono leading-relaxed resize-none focus:outline-none placeholder-zinc-700"
                  />
                ) : (
                  <div className="prose prose-invert max-w-none text-zinc-200 text-sm space-y-3 font-sans">
                    {activeNote.content.split('\n\n').map((block, idx) => {
                      if (block.startsWith('# ')) {
                        return (
                          <h1 key={idx} className="text-xl font-bold text-emerald-300 border-b border-zinc-800 pb-1">
                            {block.replace('# ', '')}
                          </h1>
                        );
                      }
                      if (block.startsWith('## ')) {
                        return (
                          <h2 key={idx} className="text-lg font-semibold text-zinc-100">
                            {block.replace('## ', '')}
                          </h2>
                        );
                      }
                      if (block.startsWith('### ')) {
                        return (
                          <h3 key={idx} className="text-base font-medium text-zinc-200">
                            {block.replace('### ', '')}
                          </h3>
                        );
                      }
                      if (block.startsWith('```')) {
                        const code = block.replace(/```[a-z]*\n?/g, '').trim();
                        return (
                          <pre
                            key={idx}
                            className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs font-mono overflow-x-auto text-emerald-400"
                          >
                            <code>{code}</code>
                          </pre>
                        );
                      }
                      return (
                        <p key={idx} className="text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap">
                          {block}
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* AI Agent Actions Bar & Footnote */}
              <div className="px-4 py-2.5 bg-zinc-900/80 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
                {/* Word count & reading time */}
                <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-mono">
                  <span>{wordCount} words</span>
                  <span>•</span>
                  <span>~{readingTimeMin} min read</span>
                  <span>•</span>
                  <span className="text-emerald-500/80">Auto-saved</span>
                </div>

                {/* Quick AI Action Pills */}
                {onAuditWithAgent && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      AI Assist:
                    </span>
                    <button
                      onClick={() => {
                        onAuditWithAgent(
                          `Please summarize the key points of this note and suggest 3 action items:\n\nTitle: ${activeNote.title}\n\nContent:\n${activeNote.content}`
                        );
                        onClose();
                      }}
                      className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-medium transition-colors"
                    >
                      Summarize
                    </button>
                    <button
                      onClick={() => {
                        onAuditWithAgent(
                          `Please review this note for clarity, grammar, and professional polish:\n\nTitle: ${activeNote.title}\n\nContent:\n${activeNote.content}`
                        );
                        onClose();
                      }}
                      className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-medium transition-colors"
                    >
                      Polish
                    </button>
                    <button
                      onClick={() => {
                        onAuditWithAgent(
                          `Please analyze this note and extract all tasks, deliverables, and owners into a structured markdown checklist:\n\nTitle: ${activeNote.title}\n\nContent:\n${activeNote.content}`
                        );
                        onClose();
                      }}
                      className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-medium transition-colors"
                    >
                      Action Items
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500">
              <FileText className="w-10 h-10 text-zinc-600 mb-2" />
              <p className="text-sm font-medium">No note selected</p>
              <button
                onClick={handleCreateNote}
                className="mt-3 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                Create your first note
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
