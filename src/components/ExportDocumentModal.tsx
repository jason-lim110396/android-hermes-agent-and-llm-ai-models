'use client';

import { triggerHaptic } from '@/utils/haptics';
import React, { useState } from 'react';
import {
  Download,
  Share2,
  Copy,
  Check,
  X,
  FileText,
  Code2,
  Globe,
  FileCode,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { ChatSession, ChatMessage } from '@/appStore';
import { useBackButtonClose } from '@/utils/backButton';

interface ExportDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: ChatSession | null;
  modelName?: string;
}

type ExportFormat = 'md' | 'txt' | 'html' | 'json';

export default function ExportDocumentModal({
  isOpen,
  onClose,
  session,
  modelName = 'Hermes AI',
}: ExportDocumentModalProps) {
  useBackButtonClose(isOpen, onClose);

  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('md');
  const [includeThinking, setIncludeThinking] = useState(true);
  const [includeAgentSteps, setIncludeAgentSteps] = useState(true);
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  if (!isOpen || !session) return null;

  const messages = session.messages || [];
  const title = session.title || 'Hermes Chat Session';
  const timestampStr = new Date(session.createdAt || Date.now()).toLocaleString();

  // Generate Document Content
  const generateExportContent = (): { content: string; mimeType: string; extension: string } => {
    if (selectedFormat === 'json') {
      const exportJson = {
        title,
        exportedAt: new Date().toISOString(),
        model: modelName,
        messageCount: messages.length,
        messages: messages.map((m) => {
          let content = m.content;
          if (!includeThinking) {
            content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
          }
          return {
            id: m.id,
            role: m.role,
            content,
            timestamp: m.timestamp,
            timeFormatted: new Date(m.timestamp).toLocaleTimeString(),
            ...(includeAgentSteps && m.agentSteps ? { agentSteps: m.agentSteps } : {}),
          };
        }),
      };
      return {
        content: JSON.stringify(exportJson, null, 2),
        mimeType: 'application/json',
        extension: 'json',
      };
    }

    if (selectedFormat === 'txt') {
      let txt = `${title.toUpperCase()}\n`;
      txt += `Model: ${modelName} | Exported: ${timestampStr}\n`;
      txt += `====================================================\n\n`;

      messages.forEach((m) => {
        const timeHeader = includeTimestamps ? ` [${new Date(m.timestamp).toLocaleTimeString()}]` : '';
        const roleHeader = m.role === 'user' ? 'USER' : 'ASSISTANT';
        txt += `--- ${roleHeader}${timeHeader} ---\n`;

        let content = m.content;
        if (!includeThinking) {
          content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        }
        txt += `${content}\n\n`;
      });
      return {
        content: txt,
        mimeType: 'text/plain;charset=utf-8',
        extension: 'txt',
      };
    }

    if (selectedFormat === 'html') {
      let bodyHtml = '';
      messages.forEach((m) => {
        const isUser = m.role === 'user';
        const roleLabel = isUser ? 'User' : 'Hermes Assistant';
        const timeHeader = includeTimestamps ? `<span class="time">${new Date(m.timestamp).toLocaleTimeString()}</span>` : '';

        let content = m.content;
        if (!includeThinking) {
          content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        }

        // Basic escape and formatting
        const safeContent = content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br/>');

        bodyHtml += `
        <div class="message ${isUser ? 'user' : 'assistant'}">
          <div class="msg-header">
            <strong>${roleLabel}</strong>
            ${timeHeader}
          </div>
          <div class="msg-content">${safeContent}</div>
        </div>`;
      });

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Hermes Export</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #f4f4f5; margin: 0; padding: 20px; line-height: 1.6; }
    .container { max-width: 760px; margin: 0 auto; }
    header { border-bottom: 1px solid #27272a; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { margin: 0 0 8px 0; font-size: 20px; color: #38bdf8; }
    .meta { font-size: 12px; color: #71717a; font-family: monospace; }
    .message { margin-bottom: 20px; padding: 14px 18px; border-radius: 14px; }
    .user { background: #18181b; border: 1px solid #27272a; border-left: 4px solid #38bdf8; }
    .assistant { background: #1e1b4b; border: 1px solid #312e81; border-left: 4px solid #818cf8; }
    .msg-header { font-size: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; color: #a1a1aa; }
    .time { font-family: monospace; font-size: 11px; color: #71717a; }
    .msg-content { font-size: 14px; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🤖 ${title}</h1>
      <div class="meta">Exported locally on Android via ${modelName} • ${timestampStr}</div>
    </header>
    ${bodyHtml}
  </div>
</body>
</html>`;
      return {
        content: html,
        mimeType: 'text/html;charset=utf-8',
        extension: 'html',
      };
    }

    // Default: Markdown (.md)
    const approxTokens = Math.round(messages.reduce((acc, m) => acc + (m.content?.length || 0), 0) / 4);
    let md = `---\n`;
    md += `title: "${title.replace(/"/g, '\\"')}"\n`;
    md += `model: "${modelName}"\n`;
    md += `date: "${new Date().toISOString()}"\n`;
    md += `total_messages: ${messages.length}\n`;
    md += `approx_tokens: ${approxTokens}\n`;
    md += `platform: "Android (Hermes WebGPU)"\n`;
    md += `---\n\n`;

    md += `# 🤖 ${title}\n\n`;
    md += `*Generated on-device via ${modelName}*\n`;
    md += `*Timestamp: ${timestampStr}*\n\n---\n\n`;

    messages.forEach((m) => {
      const timeHeader = includeTimestamps ? ` (${new Date(m.timestamp).toLocaleTimeString()})` : '';
      md += `### ${m.role === 'user' ? '👤 User' : '🤖 Assistant'}${timeHeader}\n\n`;

      if (includeAgentSteps && m.agentSteps && m.agentSteps.length > 0) {
        md += `> **Hermes Autonomous Agent Execution Steps:**\n`;
        m.agentSteps.forEach((s, sIdx) => {
          if (s.thought) md += `> - **Step ${sIdx + 1} Thought**: ${s.thought}\n`;
          if (s.toolCall) md += `> - **Tool Call**: \`${s.toolCall.name}\` (${JSON.stringify(s.toolCall.arguments)})\n`;
          if (s.toolResult) md += `> - **Observation**: ${s.toolResult.replace(/\n/g, ' ')}\n`;
        });
        md += `\n`;
      }

      let content = m.content;
      if (!includeThinking) {
        content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      }
      md += `${content}\n\n---\n\n`;
    });

    return {
      content: md,
      mimeType: 'text/markdown;charset=utf-8',
      extension: 'md',
    };
  };

  const { content, mimeType, extension } = generateExportContent();

  const handleDownload = () => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    triggerHaptic(30);
  };

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const fileName = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.${extension}`;
        let fileShared = false;
        if (typeof File !== 'undefined' && navigator.canShare) {
          try {
            const file = new File([content], fileName, { type: mimeType });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                title,
                files: [file],
              });
              fileShared = true;
            }
          } catch (_) {
            fileShared = false;
          }
        }
        if (!fileShared) {
          await navigator.share({
            title,
            text: content.slice(0, 4000), // Android share text limit safe guard
          });
        }
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        triggerHaptic([20, 20]);
        return;
      } catch (err) {
        // The user dismissing the sheet is not an error; other failures
        // fall through to the honest clipboard copy below.
        if ((err as { name?: string })?.name !== 'AbortError') {
          handleCopy();
        }
        return;
      }
    }
    handleCopy();
  };

  const handleCopy = () => {
    // Only report "Copied" when the clipboard write actually resolved.
    navigator.clipboard
      .writeText(content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        triggerHaptic(20);
      })
      .catch(() => setCopied(false));
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>Multi-Format Document Exporter</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                  .{extension}
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">Export formatted conversation transcripts and agent reports</p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close export dialog"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selector Pills */}
        <div className="p-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center gap-2">
          {(
            [
              { id: 'md', label: 'Markdown', ext: '.md', icon: FileText },
              { id: 'txt', label: 'Plain Text', ext: '.txt', icon: FileCode },
              { id: 'html', label: 'Web HTML', ext: '.html', icon: Globe },
              { id: 'json', label: 'JSON Data', ext: '.json', icon: Code2 },
            ] as const
          ).map((fmt) => {
            const isSel = selectedFormat === fmt.id;
            const Icon = fmt.icon;
            return (
              <button
                key={fmt.id}
                onClick={() => setSelectedFormat(fmt.id)}
                className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer border ${
                  isSel
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-md ring-1 ring-cyan-500/30'
                    : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{fmt.label}</span>
                <span className="text-[9px] font-mono opacity-60">{fmt.ext}</span>
              </button>
            );
          })}
        </div>

        {/* Export Options */}
        <div className="p-3 bg-zinc-950/40 border-b border-zinc-800 flex items-center justify-between text-xs text-zinc-300 flex-wrap gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeTimestamps}
              onChange={(e) => setIncludeTimestamps(e.target.checked)}
              className="accent-cyan-500 rounded"
            />
            <span className="text-[11px]">Timestamps</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeThinking}
              onChange={(e) => setIncludeThinking(e.target.checked)}
              className="accent-cyan-500 rounded"
            />
            <span className="text-[11px]">Reasoning Steps</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeAgentSteps}
              onChange={(e) => setIncludeAgentSteps(e.target.checked)}
              className="accent-cyan-500 rounded"
            />
            <span className="text-[11px]">Agent Tools</span>
          </label>
        </div>

        {/* Live Preview Box */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 select-none">
          <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
            <span>PREVIEW ({content.length} characters • {content.split('\n').length} lines)</span>
            <span>{Math.round(content.length / 1024 * 10) / 10} KB</span>
          </div>
          <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 font-mono overflow-x-auto leading-relaxed max-h-56 select-text whitespace-pre-wrap">
            {content.slice(0, 1500)}
            {content.length > 1500 ? '\n... (truncated for preview)' : ''}
          </pre>
        </div>

        {/* Action Buttons Footer */}
        <div className="p-3 bg-zinc-950/80 border-t border-zinc-800 grid grid-cols-3 gap-2">
          <button
            onClick={handleDownload}
            className="py-2.5 px-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>

          <button
            onClick={handleShare}
            className="py-2.5 px-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-700/60 transition-all"
          >
            {shared ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{shared ? 'Shared' : 'Android Share'}</span>
          </button>

          <button
            onClick={handleCopy}
            className="py-2.5 px-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-700/60 transition-all"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
