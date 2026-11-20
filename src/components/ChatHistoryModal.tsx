'use client';

import React, { useState } from 'react';
import {
  History,
  X,
  Search,
  Pin,
  Trash2,
  Plus,
  MessageSquare,
  Bot,
  Calendar,
  Check,
  Edit2,
  Tag,
  Sparkles,
} from 'lucide-react';
import { useAppStore, ChatSession } from '@/appStore';

interface ChatHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES = ['All', 'General', 'Work', 'Coding', 'Research', 'Creative'];

export default function ChatHistoryModal({ isOpen, onClose }: ChatHistoryModalProps) {
  const operatingMode = useAppStore((s) => s.operatingMode);
  const chatSessions = useAppStore((s) => s.chatSessions);
  const agentSessions = useAppStore((s) => s.agentSessions);
  const activeChatSessionId = useAppStore((s) => s.activeChatSessionId);
  const activeAgentSessionId = useAppStore((s) => s.activeAgentSessionId);
  const switchSession = useAppStore((s) => s.switchSession);
  const createNewSession = useAppStore((s) => s.createNewSession);
  const deleteSession = useAppStore((s) => s.deleteSession);
  const togglePinSession = useAppStore((s) => s.togglePinSession);
  const updateSessionCategory = useAppStore((s) => s.updateSessionCategory);
  const updateSessionTitle = useAppStore((s) => s.updateSessionTitle);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  if (!isOpen) return null;

  const isAgent = operatingMode === 'agent';
  const sessionsDict = isAgent ? agentSessions : chatSessions;
  const activeSessionId = isAgent ? activeAgentSessionId : activeChatSessionId;
  const sessionsList = Object.values(sessionsDict);

  // Filter sessions
  const filteredSessions = sessionsList
    .filter((session) => {
      // Category filter
      if (selectedCategory !== 'All') {
        const cat = session.category || 'General';
        if (cat.toLowerCase() !== selectedCategory.toLowerCase()) return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = session.title.toLowerCase().includes(q);
        const matchesMsg = session.messages.some((m) => m.content.toLowerCase().includes(q));
        return matchesTitle || matchesMsg;
      }
      return true;
    })
    .sort((a, b) => {
      // Pinned first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.createdAt - a.createdAt;
    });

  const handleStartRename = (e: React.MouseEvent, s: ChatSession) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditingTitle(s.title);
  };

  const handleSaveRename = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (editingTitle.trim()) {
      updateSessionTitle(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-md ${
              isAgent ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/30' : 'bg-cyan-600/30 text-cyan-400 border border-cyan-500/30'
            }`}>
              {isAgent ? <Bot className="w-4 h-4" /> : <History className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>{isAgent ? 'Hermes Agent Tasks' : 'Chat Conversations Archive'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
                  {sessionsList.length} total
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">Search, filter, pin, or switch mobile conversation threads</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                createNewSession();
                onClose();
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold transition-all cursor-pointer shadow-md shadow-cyan-500/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Category Filter */}
        <div className="p-3 bg-zinc-900/90 border-b border-zinc-800 space-y-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search session title or message content..."
              className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer border ${
                  selectedCategory === cat
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                    : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 select-none">
          {filteredSessions.length > 0 ? (
            filteredSessions.map((s) => {
              const isActive = s.id === activeSessionId;
              const lastMsg = s.messages[s.messages.length - 1];
              const isEditing = editingId === s.id;

              return (
                <div
                  key={s.id}
                  onClick={() => {
                    switchSession(s.id);
                    onClose();
                  }}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer relative group ${
                    isActive
                      ? 'bg-cyan-500/10 border-cyan-500/50 shadow-md ring-1 ring-cyan-500/30'
                      : 'bg-zinc-950/60 hover:bg-zinc-800/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Title & Edit */}
                      {isEditing ? (
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            className="bg-zinc-900 border border-cyan-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none flex-1"
                            autoFocus
                          />
                          <button
                            onClick={(e) => handleSaveRename(e, s.id)}
                            className="p-1 rounded bg-cyan-500 text-black hover:bg-cyan-400"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {s.pinned && (
                            <span className="text-amber-400 text-[10px] flex items-center gap-0.5 font-bold">
                              <Pin className="w-3 h-3 fill-amber-400" />
                              <span>Pinned</span>
                            </span>
                          )}
                          <span className={`text-xs font-bold truncate ${isActive ? 'text-cyan-300' : 'text-white'}`}>
                            {s.title}
                          </span>
                          <button
                            onClick={(e) => handleStartRename(e, s)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-500 hover:text-zinc-300 transition-opacity"
                            title="Rename session"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}

                      {/* Last Message Snippet */}
                      {lastMsg && (
                        <p className="text-[11px] text-zinc-400 line-clamp-1 mt-1 font-mono">
                          {lastMsg.role === 'user' ? 'You: ' : 'Hermes: '}
                          {lastMsg.content.slice(0, 80)}
                        </p>
                      )}

                      {/* Meta Footer */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(s.createdAt)}</span>
                        </span>

                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono">
                          {s.messages.length} msg{s.messages.length !== 1 ? 's' : ''}
                        </span>

                        {/* Category badge */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextCat =
                              s.category === 'Work'
                                ? 'Coding'
                                : s.category === 'Coding'
                                ? 'Research'
                                : s.category === 'Research'
                                ? 'Creative'
                                : s.category === 'Creative'
                                ? 'General'
                                : 'Work';
                            updateSessionCategory(s.id, nextCat);
                          }}
                          className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800/80 hover:bg-zinc-700 text-cyan-400 border border-zinc-700/60 flex items-center gap-0.5 cursor-pointer"
                          title="Click to cycle category"
                        >
                          <Tag className="w-2.5 h-2.5" />
                          <span>{s.category || 'General'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Actions: Pin & Delete */}
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => togglePinSession(s.id)}
                        title={s.pinned ? 'Unpin session' : 'Pin to top'}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          s.pinned
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-amber-400'
                        }`}
                      >
                        <Pin className={`w-3.5 h-3.5 ${s.pinned ? 'fill-amber-400' : ''}`} />
                      </button>

                      {sessionsList.length > 1 && (
                        <button
                          onClick={() => deleteSession(s.id)}
                          title="Delete session"
                          className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-rose-400 hover:border-rose-500/30 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-zinc-500 space-y-2">
              <History className="w-8 h-8 mx-auto opacity-40" />
              <div className="text-xs font-bold text-zinc-400">No sessions match your filter</div>
              <p className="text-[11px] text-zinc-600">Try changing the category or clearing the search query.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
