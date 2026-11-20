'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Table as TableIcon,
  Download,
  Copy,
  Check,
  RotateCw,
  Plus,
  Trash2,
  FileSpreadsheet,
  Share2,
  Edit2,
  Bot,
} from 'lucide-react';
import { useAppStore } from '@/appStore';

interface TableSpreadsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  markdownContent?: string;
}

const DEFAULT_SAMPLE_TABLE = `| Model Name | Parameters | Format | RAM Required | Tokens / Sec | WebGPU Support |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Hermes 3 3B | 3.2B | q4f16 | 2.1 GB | 28.4 tok/s | Full Acceleration |
| Llama 3.2 1B | 1.2B | q4f16 | 1.2 GB | 44.8 tok/s | Full Acceleration |
| Llama 3.2 3B | 3.2B | q4f16 | 2.3 GB | 26.2 tok/s | Full Acceleration |
| MiniCPM-V 4.7 | 4.1B | q4f16 | 3.4 GB | 18.5 tok/s | Full Acceleration |
| Kokoro 82M | 82M | ONNX | 340 MB | Real-time | CPU SIMD / WASM |
| Whisper Base | 74M | WASM | 280 MB | Real-time | CPU SIMD / WASM |`;

export default function TableSpreadsheetModal({
  isOpen,
  onClose,
  markdownContent,
}: TableSpreadsheetModalProps) {
  const sendMessage = useAppStore((s) => s.sendMessage);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Parse markdown table string into headers and 2D row array
  const parseMarkdownTable = (rawText: string) => {
    const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|') && l.endsWith('|'));
    if (lines.length < 2) return null;

    const parsedHeaders = lines[0]
      .slice(1, -1)
      .split('|')
      .map((h) => h.trim());

    // Skip line 1 (the separator |--|--|)
    const dataRows = lines.slice(2).map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim())
    );

    return { headers: parsedHeaders, rows: dataRows };
  };

  useEffect(() => {
    const source = markdownContent || DEFAULT_SAMPLE_TABLE;
    const result = parseMarkdownTable(source);
    if (result && result.headers.length > 0) {
      setHeaders(result.headers);
      setRows(result.rows);
    } else {
      const fallback = parseMarkdownTable(DEFAULT_SAMPLE_TABLE);
      if (fallback) {
        setHeaders(fallback.headers);
        setRows(fallback.rows);
      }
    }
  }, [markdownContent]);

  const handleCellChange = (rowIndex: number, colIndex: number, val: string) => {
    setRows((prev) => {
      const copy = prev.map((r) => [...r]);
      if (copy[rowIndex]) {
        copy[rowIndex][colIndex] = val;
      }
      return copy;
    });
  };

  const handleAddRow = () => {
    const emptyRow = new Array(headers.length).fill('');
    setRows((prev) => [...prev, emptyRow]);
    if (navigator.vibrate) navigator.vibrate(20);
  };

  const handleDeleteRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleTranspose = () => {
    if (headers.length === 0 || rows.length === 0) return;
    const allMatrix = [headers, ...rows];
    const transposed: string[][] = [];

    for (let c = 0; c < allMatrix[0].length; c++) {
      const newRow: string[] = [];
      for (let r = 0; r < allMatrix.length; r++) {
        newRow.push(allMatrix[r][c] || '');
      }
      transposed.push(newRow);
    }

    setHeaders(transposed[0]);
    setRows(transposed.slice(1));
    if (navigator.vibrate) navigator.vibrate([30, 20]);
  };

  const toCSVString = () => {
    const escapeCell = (cell: string) => {
      if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    };
    const headerLine = headers.map(escapeCell).join(',');
    const rowLines = rows.map((r) => r.map(escapeCell).join(',')).join('\n');
    return `${headerLine}\n${rowLines}`;
  };

  const toMarkdownString = () => {
    // A literal | inside a cell would silently split into phantom columns in
    // the pasted markdown table, so escape it the GFM way.
    const esc = (c: string) => (c || '').replace(/\|/g, '\\|');
    const headerLine = `| ${headers.map(esc).join(' | ')} |`;
    const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
    const rowLines = rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n');
    return `${headerLine}\n${sepLine}\n${rowLines}`;
  };

  const handleDownloadCSV = () => {
    const csv = toCSVString();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hermes-table-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = (type: 'csv' | 'markdown') => {
    const text = type === 'csv' ? toCSVString() : toMarkdownString();
    // Android WebView rejects the async clipboard API on focus races; only
    // report success when the write actually resolved.
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedType(type);
        setTimeout(() => setCopiedType(null), 2000);
      })
      .catch(() => {
        setCopiedType(null);
      });
  };

  const handleSendToChat = () => {
    const csv = toCSVString();
    sendMessage(`Here is the exported CSV spreadsheet data from the table:\n\n\`\`\`csv\n${csv}\n\`\`\`\nPlease analyze this structured data, compute summaries, and identify key trends.`);
    onClose();
    setCurrentTab('chat');
  };

  // Keep each visible row's REAL index: handlers operate on the unfiltered
  // rows array, so a filtered-list index would edit or delete the wrong row.
  const filteredRows = rows
    .map((r, realIdx) => ({ row: r, realIdx }))
    .filter(({ row }) => {
      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase();
      return row.some((c) => c.toLowerCase().includes(q));
    });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4">
      <div className="flex flex-col w-full h-[95vh] max-w-4xl bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="flex items-center justify-between px-3.5 py-3 bg-zinc-900 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <FileSpreadsheet className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>Markdown Table & CSV Spreadsheet</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  {rows.length} rows × {headers.length} cols
                </span>
              </h3>
              <p className="text-[10px] text-zinc-400">Interactive mobile tabular editor & CSV/TSV converter</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleTranspose}
              title="Transpose rows & columns"
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all cursor-pointer flex items-center gap-1 text-[11px]"
            >
              <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Transpose</span>
            </button>

            <button
              onClick={() => handleCopy('csv')}
              title="Copy CSV to clipboard"
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all cursor-pointer flex items-center gap-1 text-[11px]"
            >
              {copiedType === 'csv' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copiedType === 'csv' ? 'Copied' : 'Copy CSV'}</span>
            </button>

            <button
              onClick={handleDownloadCSV}
              title="Download CSV file"
              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all cursor-pointer flex items-center gap-1 text-[11px] shadow-md shadow-emerald-600/30"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={onClose}
              title="Close modal"
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter and Add Row Bar */}
        <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/60 border-b border-zinc-800/80 gap-2 shrink-0">
          <input
            type="text"
            placeholder="Search rows in table..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs text-white placeholder-zinc-500 outline-none focus:border-emerald-500"
          />

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleAddRow}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Add Row</span>
            </button>

            <button
              onClick={handleSendToChat}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Send to Hermes</span>
            </button>
          </div>
        </div>

        {/* Spreadsheet Table Scroll Container */}
        <div className="flex-1 overflow-auto bg-black p-2 select-text">
          <div className="inline-block min-w-full align-middle border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="min-w-full divide-y divide-zinc-800 text-xs">
              <thead className="bg-zinc-900 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-black text-zinc-400 uppercase tracking-wider w-10 text-center">
                    #
                  </th>
                  {headers.map((h, colIdx) => (
                    <th
                      key={colIdx}
                      className="px-3 py-2 text-left text-[11px] font-bold text-emerald-400 border-l border-zinc-800/80"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center text-[10px] font-black text-zinc-400 uppercase w-10">
                    ✕
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 bg-zinc-950/80">
                {filteredRows.map(({ row, realIdx }) => (
                  <tr key={realIdx} className="hover:bg-zinc-900/50 transition-colors">
                    <td className="px-2 py-1.5 text-[10px] text-zinc-500 font-mono text-center select-none">
                      {realIdx + 1}
                    </td>
                    {row.map((cell, colIdx) => (
                      <td key={colIdx} className="px-2 py-1 border-l border-zinc-800/60">
                        <input
                          type="text"
                          value={cell}
                          onChange={(e) => handleCellChange(realIdx, colIdx, e.target.value)}
                          className="w-full bg-transparent text-zinc-200 text-xs outline-none focus:bg-zinc-900 px-1.5 py-0.5 rounded border border-transparent focus:border-emerald-500/50"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 text-center">
                      <button
                        onClick={() => handleDeleteRow(realIdx)}
                        title="Delete row"
                        className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900 border-t border-zinc-800 text-[10px] text-zinc-400 shrink-0 font-mono">
          <span>Format: RFC 4180 CSV / GFM Markdown</span>
          <span>100% Client-Side In-Memory Processing</span>
        </div>
      </div>
    </div>
  );
}
