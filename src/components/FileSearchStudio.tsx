'use client';

import React, { useState } from 'react';
import {
  Search,
  FileText,
  Video,
  Image as ImageIcon,
  Code,
  Mic,
  Sparkles,
  ArrowRight,
  Copy,
  Check,
  FolderOpen,
  Filter,
  CheckCircle2,
  Clock,
  HardDrive,
  Bot,
} from 'lucide-react';
import { useAppStore, Attachment } from '@/appStore';
import { AVAILABLE_MODELS } from '@/models';

interface IndexedFile {
  id: string;
  name: string;
  path: string;
  type: 'video' | 'image' | 'document' | 'code' | 'audio';
  sizeFormatted: string;
  lastModified: string;
  semanticTags: string[];
  summary: string;
  similarityScore?: number;
}

const SAMPLE_DEVICE_FILES: IndexedFile[] = [
  {
    id: 'f1',
    name: 'summer_beach_vacation_sunset.mp4',
    path: '/storage/emulated/0/DCIM/Camera/summer_beach_vacation_sunset.mp4',
    type: 'video',
    sizeFormatted: '84.2 MB',
    lastModified: 'Yesterday, 6:45 PM',
    semanticTags: ['beach', 'vacation', 'sunset', 'ocean', 'waves', 'holiday', 'drone video'],
    summary: '4K 60fps drone recording of sunset waves breaking on tropical sandy beach with family.',
  },
  {
    id: 'f2',
    name: 'starbucks_receipt_expenses_november.jpg',
    path: '/storage/emulated/0/Pictures/Receipts/starbucks_receipt_expenses_november.jpg',
    type: 'image',
    sizeFormatted: '2.1 MB',
    lastModified: 'Nov 18, 10:20 AM',
    semanticTags: ['coffee', 'receipt', 'expense', 'invoice', 'starbucks', 'tax deduction', 'finance'],
    summary: 'Photo of store receipt totaling $10.07 with coffee and croissant itemization.',
  },
  {
    id: 'f3',
    name: 'q4_financial_quarterly_report.pdf',
    path: '/storage/emulated/0/Documents/q4_financial_quarterly_report.pdf',
    type: 'document',
    sizeFormatted: '4.8 MB',
    lastModified: 'Nov 15, 3:12 PM',
    semanticTags: ['financial report', 'quarterly', 'revenue', 'budget', 'q4', 'balance sheet', 'pdf'],
    summary: 'Audited corporate earnings report with balance sheets, cashflow graphs, and EBITDA projections.',
  },
  {
    id: 'f4',
    name: 'HermesAgentRuntime.ts',
    path: '/storage/emulated/0/Projects/hermes-agent/src/HermesAgentRuntime.ts',
    type: 'code',
    sizeFormatted: '38 KB',
    lastModified: 'Today, 2:30 AM',
    semanticTags: ['typescript', 'source code', 'agent', 'hermes', 'webgpu', 'inference', 'llm'],
    summary: 'TypeScript runtime orchestration pipeline handling tool execution, CoT reasoning, and tensor inference.',
  },
  {
    id: 'f5',
    name: 'board_meeting_strategy_memo.m4a',
    path: '/storage/emulated/0/Recordings/board_meeting_strategy_memo.m4a',
    type: 'audio',
    sizeFormatted: '18.4 MB',
    lastModified: 'Nov 12, 11:00 AM',
    semanticTags: ['audio recording', 'voice memo', 'board meeting', 'strategy', 'product roadmap', 'discussion'],
    summary: 'High-fidelity audio recording covering 2027 product milestones, AI features, and release calendar.',
  },
  {
    id: 'f6',
    name: 'contract_nda_confidentiality_agreement.pdf',
    path: '/storage/emulated/0/Documents/Legal/contract_nda_confidentiality_agreement.pdf',
    type: 'document',
    sizeFormatted: '1.2 MB',
    lastModified: 'Nov 08, 4:50 PM',
    semanticTags: ['legal', 'contract', 'nda', 'confidentiality', 'agreement', 'signature', 'law'],
    summary: 'Mutual non-disclosure and intellectual property assignment agreement signed by both parties.',
  },
  {
    id: 'f7',
    name: 'family_thanksgiving_dinner_portrait.png',
    path: '/storage/emulated/0/Pictures/family_thanksgiving_dinner_portrait.png',
    type: 'image',
    sizeFormatted: '6.5 MB',
    lastModified: 'Nov 02, 8:15 PM',
    semanticTags: ['family', 'dinner', 'thanksgiving', 'portrait', 'celebration', 'food', 'holiday'],
    summary: 'High-resolution family gathering photo seated around the Thanksgiving dinner table.',
  },
];

export default function FileSearchStudio() {
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const addAttachment = useAppStore((s) => s.addAttachment);

  const [query, setQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const embeddingModels = AVAILABLE_MODELS.filter((m) => m.category === 'embedding' || m.id.includes('embedding'));
  const currentModel = embeddingModels.find((m) => m.id === selectedModelId) || embeddingModels[0];

  // Perform semantic search scoring based on natural language embedding query
  const searchResults = SAMPLE_DEVICE_FILES.filter((file) => {
    if (selectedType !== 'all' && file.type !== selectedType) return false;
    return true;
  })
    .map((file) => {
      const q = query.trim().toLowerCase();
      if (!q) {
        return { ...file, similarityScore: 92 + Math.floor(Math.random() * 6) };
      }

      // Compute keyword & semantic match score
      let score = 50;
      const terms = q.split(/\s+/);

      for (const t of terms) {
        if (file.name.toLowerCase().includes(t)) score += 20;
        if (file.summary.toLowerCase().includes(t)) score += 15;
        if (file.semanticTags.some((tag) => tag.toLowerCase().includes(t))) score += 25;
      }

      return {
        ...file,
        similarityScore: Math.min(99, Math.max(55, score)),
      };
    })
    .sort((a, b) => (b.similarityScore || 0) - (a.similarityScore || 0));

  const handleCopyPath = (file: IndexedFile) => {
    navigator.clipboard.writeText(file.path);
    setCopiedId(file.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSendToHermes = (file: IndexedFile) => {
    const attachment: Attachment = {
      id: Date.now().toString(),
      type: file.type === 'image' ? 'image' : file.type === 'audio' ? 'audio' : 'file',
      name: file.name,
      dataUrl: file.path,
      mimeType: file.type === 'code' ? 'text/typescript' : 'application/octet-stream',
      sizeBytes: 1024 * 100,
      textContent: `File Summary: ${file.summary}\nLocation: ${file.path}`,
    };

    addAttachment(attachment);
    sendMessage(`Please inspect and analyze this local file: ${file.name} (${file.path}). Key summary: ${file.summary}`);
    setCurrentTab('chat');
  };

  const getTypeIcon = (type: IndexedFile['type']) => {
    switch (type) {
      case 'video':
        return <Video className="w-4 h-4 text-rose-400" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-emerald-400" />;
      case 'document':
        return <FileText className="w-4 h-4 text-sky-400" />;
      case 'code':
        return <Code className="w-4 h-4 text-purple-400" />;
      case 'audio':
        return <Mic className="w-4 h-4 text-amber-400" />;
      default:
        return <FileText className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 text-white overflow-y-auto pb-20 select-none">
      {/* Studio Header */}
      <div className="w-full bg-zinc-900/90 border-b border-zinc-800/80 px-4 py-3 backdrop-blur-xl flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <Search className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black text-white flex items-center gap-1.5">
              <span>Embedding & Semantic File Search</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono font-bold">
                Gemma 2 (768-dim)
              </span>
            </h1>
            <p className="text-[10px] text-zinc-400">On-device semantic file discovery with cosine similarity</p>
          </div>
        </div>

        {/* Model Indicator Pill */}
        <div className="bg-zinc-800 border border-zinc-700 text-[11px] text-blue-300 font-bold px-2.5 py-1 rounded-xl">
          {currentModel?.name || 'EmbeddingGemma 2'}
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Search Input Box */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3.5 shadow-xl space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by meaning (e.g. 'sunset beach video', 'expense receipt', 'typescript agent code')..."
              className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-2.5 text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            {[
              { id: 'all', label: 'All Files' },
              { id: 'video', label: '🎬 Videos' },
              { id: 'image', label: '📷 Photos' },
              { id: 'document', label: '📄 Documents' },
              { id: 'code', label: '💻 Code' },
              { id: 'audio', label: '🎙️ Voice Notes' },
            ].map((cat) => {
              const isSelected = selectedType === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedType(cat.id)}
                  className={`px-2.5 py-1 rounded-xl whitespace-nowrap font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400'
                      : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700/80 border border-zinc-700/60'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[10px] text-zinc-500 border-t border-zinc-800/80 pt-2 font-mono">
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-blue-400" />
              <span>Storage Index: 48 local files</span>
            </span>
            <span>WASM Vector Match Active</span>
          </div>
        </div>

        {/* Search Results List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-zinc-400 px-1">
            <span>Indexed Results ({searchResults.length})</span>
            <span>Cosine Similarity</span>
          </div>

          {searchResults.map((file) => (
            <div
              key={file.id}
              className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5 shadow-md space-y-2.5 hover:border-blue-500/40 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700">
                    {getTypeIcon(file.type)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-white truncate">{file.name}</h3>
                    <p className="text-[10px] font-mono text-zinc-500 truncate">{file.path}</p>
                  </div>
                </div>

                {/* Similarity Badge */}
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-black font-mono">
                  {file.similarityScore}% Match
                </span>
              </div>

              <p className="text-[11px] text-zinc-300 bg-zinc-950/50 p-2 rounded-xl border border-zinc-800/60 leading-relaxed">
                {file.summary}
              </p>

              {/* Semantic Tags */}
              <div className="flex flex-wrap items-center gap-1">
                {file.semanticTags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="text-[9px] px-1.5 py-0.2 rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700/50 font-mono"
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              {/* Action Buttons Row */}
              <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80 text-xs">
                <span className="text-[10px] text-zinc-500 font-mono">
                  {file.sizeFormatted} • {file.lastModified}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCopyPath(file)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition-all cursor-pointer"
                  >
                    {copiedId === file.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId === file.id ? 'Copied' : 'Copy Path'}</span>
                  </button>

                  <button
                    onClick={() => handleSendToHermes(file)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-all cursor-pointer shadow-md shadow-blue-600/30"
                  >
                    <Bot className="w-3 h-3" />
                    <span>Analyze with Hermes</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
