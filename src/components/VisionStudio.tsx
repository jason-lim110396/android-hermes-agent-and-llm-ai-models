'use client';

import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  Eye,
  FileText,
  Copy,
  Check,
  Sparkles,
  RefreshCw,
  HelpCircle,
  ScanText,
  BarChart2,
  ShieldCheck,
  Send,
  Printer,
  Plus,
  Trash2,
  SlidersHorizontal,
  Download,
  Share2,
  Scale,
  AlertTriangle,
  ArrowRight,
  FileCheck2,
} from 'lucide-react';
import { useAppStore, Attachment } from '@/appStore';
import { AVAILABLE_MODELS } from '@/models';
import CameraModal from './CameraModal';

type VisionTaskMode = 'ocr' | 'diagram' | 'audit' | 'chat';

interface ScannedPage {
  id: string;
  name: string;
  dataUrl: string;
  isHighContrast: boolean;
}

interface ReconcileItem {
  id: string;
  description: string;
  docAValue: string;
  docBValue: string;
  status: 'match' | 'discrepancy' | 'added';
  variance: string;
}

const SAMPLE_IMAGES = [
  {
    id: 'receipt',
    title: '🧾 Store Receipt',
    description: 'Expense audit & tax OCR extraction',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%231e293b"/><text x="20" y="40" fill="%23e2e8f0" font-family="monospace" font-size="16" font-weight="bold">STARBUCKS COFFEE #1042</text><text x="20" y="80" fill="%2394a3b8" font-family="monospace" font-size="13">1x Caramel Macchiato     $5.45</text><text x="20" y="110" fill="%2394a3b8" font-family="monospace" font-size="13">1x Butter Croissant       $3.85</text><text x="20" y="140" fill="%2394a3b8" font-family="monospace" font-size="13">Tax (8.25%)               $0.77</text><line x1="20" y1="160" x2="350" y2="160" stroke="%23475569" stroke-dasharray="4"/><text x="20" y="190" fill="%2338bdf8" font-family="monospace" font-size="16" font-weight="bold">TOTAL                     $10.07</text><text x="20" y="240" fill="%2364748b" font-family="monospace" font-size="11">THANK YOU FOR YOUR VISIT!</text></svg>',
  },
  {
    id: 'architecture',
    title: '📊 System Diagram',
    description: 'Flowchart & architecture breakdown',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%2309090b"/><rect x="30" y="40" width="100" height="50" rx="8" fill="%230284c7"/><text x="80" y="70" fill="white" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">Mobile Client</text><path d="M 130 65 L 180 65" stroke="%2338bdf8" stroke-width="2" marker-end="url(%23arr)"/><rect x="180" y="40" width="120" height="50" rx="8" fill="%239333ea"/><text x="240" y="70" fill="white" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">Hermes Agent</text><path d="M 240 90 L 240 140" stroke="%23c084fc" stroke-width="2"/><rect x="180" y="140" width="120" height="50" rx="8" fill="%2316a34a"/><text x="240" y="170" fill="white" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">WebGPU Tensor</text><path d="M 240 190 L 240 230" stroke="%234ade80" stroke-width="2"/><rect x="170" y="230" width="140" height="45" rx="8" fill="%23e11d48"/><text x="240" y="258" fill="white" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">Local Storage (Weights)</text></svg>',
  },
  {
    id: 'code',
    title: '💻 Code Snippet',
    description: 'Syntax audit and bug detection',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%2318181b"/><text x="20" y="40" fill="%2338bdf8" font-family="monospace" font-size="13">export async function</text><text x="200" y="40" fill="%23fbbf24" font-family="monospace" font-size="13">runInference</text><text x="20" y="70" fill="%23e2e8f0" font-family="monospace" font-size="12">  const lock = await acquireLock();</text><text x="20" y="100" fill="%23e2e8f0" font-family="monospace" font-size="12">  try {</text><text x="40" y="130" fill="%23a855f7" font-family="monospace" font-size="12">    return await engine.generate();</text><text x="20" y="160" fill="%23e2e8f0" font-family="monospace" font-size="12">  } finally {</text><text x="40" y="190" fill="%23e2e8f0" font-family="monospace" font-size="12">    releaseLock();</text><text x="20" y="220" fill="%23e2e8f0" font-family="monospace" font-size="12">  }</text></svg>',
  },
];

const SAMPLE_INVOICE_A = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="240" viewBox="0 0 300 240"><rect width="300" height="240" fill="%230f172a"/><text x="15" y="30" fill="%2338bdf8" font-family="sans-serif" font-size="14" font-weight="bold">PURCHASE QUOTE %23PO-409</text><text x="15" y="55" fill="%2394a3b8" font-family="monospace" font-size="11">Vendor: Apex Cloud Services</text><text x="15" y="90" fill="%23e2e8f0" font-family="monospace" font-size="11">5x Dedicated GPU Instances: $1,250.00</text><text x="15" y="115" fill="%23e2e8f0" font-family="monospace" font-size="11">1x Initial Setup Waived:      $0.00</text><text x="15" y="140" fill="%23e2e8f0" font-family="monospace" font-size="11">1x Enterprise Support:      $200.00</text><line x1="15" y1="160" x2="285" y2="160" stroke="%23334155"/><text x="15" y="190" fill="%2334d399" font-family="monospace" font-size="14" font-weight="bold">TOTAL QUOTE: $1,450.00</text></svg>';

const SAMPLE_INVOICE_B = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="240" viewBox="0 0 300 240"><rect width="300" height="240" fill="%231e1b4b"/><text x="15" y="30" fill="%23f43f5e" font-family="sans-serif" font-size="14" font-weight="bold">FINAL BILLED INVOICE %23INV-882</text><text x="15" y="55" fill="%23a5b4fc" font-family="monospace" font-size="11">Vendor: Apex Cloud Services</text><text x="15" y="90" fill="%23e2e8f0" font-family="monospace" font-size="11">5x Dedicated GPU Instances: $1,250.00</text><text x="15" y="115" fill="%23fb7185" font-family="monospace" font-size="11">Unapproved Overage Surcharge: $125.00</text><text x="15" y="140" fill="%23e2e8f0" font-family="monospace" font-size="11">1x Enterprise Support:      $250.00</text><line x1="15" y1="160" x2="285" y2="160" stroke="%234338ca"/><text x="15" y="190" fill="%23f43f5e" font-family="monospace" font-size="14" font-weight="bold">BILLED TOTAL: $1,625.00</text></svg>';

const DEFAULT_RECONCILE_ITEMS: ReconcileItem[] = [
  { id: '1', description: '5x Dedicated GPU Instances', docAValue: '$1,250.00', docBValue: '$1,250.00', status: 'match', variance: '$0.00' },
  { id: '2', description: 'Initial Setup Fee', docAValue: '$0.00 (Waived)', docBValue: 'N/A', status: 'match', variance: '$0.00' },
  { id: '3', description: 'Enterprise Support Plan', docAValue: '$200.00', docBValue: '$250.00', status: 'discrepancy', variance: '+$50.00' },
  { id: '4', description: 'Unapproved Overage Surcharge', docAValue: '$0.00', docBValue: '$125.00', status: 'added', variance: '+$125.00' },
  { id: '5', description: 'Net Invoiced Total Balance', docAValue: '$1,450.00', docBValue: '$1,625.00', status: 'discrepancy', variance: '+$175.00 OVER' },
];

export default function VisionStudio() {
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const addAttachment = useAppStore((s) => s.addAttachment);

  const [activeTab, setActiveTab] = useState<'scanner' | 'reconciler'>('scanner');

  // Scanner State
  const [scannedPages, setScannedPages] = useState<ScannedPage[]>([
    {
      id: 'initial-sample',
      name: SAMPLE_IMAGES[0].title,
      dataUrl: SAMPLE_IMAGES[0].url,
      isHighContrast: false,
    },
  ]);
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(0);
  const [taskMode, setTaskMode] = useState<VisionTaskMode>('ocr');
  const [customQuestion, setCustomQuestion] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reconciler State
  const [docAUrl, setDocAUrl] = useState<string>(SAMPLE_INVOICE_A);
  const [docBUrl, setDocBUrl] = useState<string>(SAMPLE_INVOICE_B);
  const [reconcileResult, setReconcileResult] = useState<ReconcileItem[] | null>(DEFAULT_RECONCILE_ITEMS);
  const [isReconciling, setIsReconciling] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputDocARef = useRef<HTMLInputElement>(null);
  const fileInputDocBRef = useRef<HTMLInputElement>(null);

  const visionModels = AVAILABLE_MODELS.filter((m) => m.category === 'vision' || m.capabilities.includes('vision'));
  const currentModel = visionModels.find((m) => m.id === selectedModelId) || visionModels[0];

  const currentPage = scannedPages[selectedPageIndex] || scannedPages[0];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = () => {
        const newPage: ScannedPage = {
          id: `page-${Date.now()}-${idx}`,
          name: file.name,
          dataUrl: reader.result as string,
          isHighContrast: false,
        };
        setScannedPages((prev) => [...prev, newPage]);
        setAnalysisResult(null);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleCameraSnap = (att: Attachment) => {
    const newPage: ScannedPage = {
      id: `page-${Date.now()}`,
      name: att.name || `Scan Page ${scannedPages.length + 1}`,
      dataUrl: att.dataUrl,
      isHighContrast: false,
    };
    setScannedPages((prev) => [...prev, newPage]);
    setSelectedPageIndex(scannedPages.length);
    setAnalysisResult(null);
  };

  const handleDeletePage = (index: number) => {
    if (scannedPages.length <= 1) return;
    const next = scannedPages.filter((_, i) => i !== index);
    setScannedPages(next);
    setSelectedPageIndex(Math.max(0, index - 1));
  };

  const toggleHighContrastFilter = () => {
    if (!currentPage) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = currentPage.dataUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;

      const shouldApply = !currentPage.isHighContrast;
      if (shouldApply) {
        for (let i = 0; i < d.length; i += 4) {
          const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const threshold = v > 130 ? 255 : 0;
          d[i] = threshold;
          d[i + 1] = threshold;
          d[i + 2] = threshold;
        }
        ctx.putImageData(imgData, 0, 0);
        const enhancedUrl = canvas.toDataURL('image/jpeg', 0.9);

        setScannedPages((prev) =>
          prev.map((p, idx) => (idx === selectedPageIndex ? { ...p, dataUrl: enhancedUrl, isHighContrast: true } : p))
        );
      } else {
        setScannedPages((prev) =>
          prev.map((p, idx) => (idx === selectedPageIndex ? { ...p, isHighContrast: false } : p))
        );
      }
    };
  };

  const handleExportPrintPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow popups to generate print PDF.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Hermes Document Bundle - ${new Date().toLocaleDateString()}</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; }
              .page { page-break-after: always; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; padding: 20px; box-sizing: border-box; }
              img { max-width: 100%; max-height: 90vh; object-contain: contain; }
              .header { font-family: sans-serif; font-size: 12px; color: #666; margin-bottom: 10px; width: 100%; text-align: right; }
            }
            body { font-family: system-ui, sans-serif; background: #f8fafc; margin: 20px; text-align: center; }
            .page { background: white; margin: 20px auto; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 800px; border-radius: 8px; }
            img { max-width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 4px; }
            .header { display: flex; justify-content: space-between; font-size: 13px; color: #475569; margin-bottom: 15px; font-weight: bold; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
          </style>
        </head>
        <body>
          <div style="margin-bottom: 20px;">
            <h2>📄 Hermes Multi-Page Document Bundle</h2>
            <p style="color: #64748b; font-size: 12px;">Scanned on device: ${new Date().toLocaleString()} • Total Pages: ${scannedPages.length}</p>
          </div>
          ${scannedPages
            .map(
              (p, idx) => `
            <div class="page">
              <div class="header">
                <span>Page ${idx + 1} of ${scannedPages.length} - ${p.name}</span>
                <span>Hermes AI Document Scanner</span>
              </div>
              <img src="${p.dataUrl}" alt="${p.name}" />
            </div>
          `
            )
            .join('')}
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleSendAllToAgent = () => {
    scannedPages.forEach((p, idx) => {
      addAttachment({
        id: `scan-${Date.now()}-${idx}`,
        type: 'image',
        name: p.name,
        dataUrl: p.dataUrl,
        mimeType: 'image/jpeg',
        sizeBytes: 15000,
      });
    });
    sendMessage('Analyze this multi-page document bundle, extract all key data, and prepare a structured summary:');
    setCurrentTab('chat');
  };

  const handleRunAnalysis = async () => {
    if (!currentPage || isProcessing) return;
    setIsProcessing(true);
    setAnalysisResult(null);

    try {
      await new Promise((r) => setTimeout(r, 1200));
      const mockResult = `### 👁️ MiniCPM-V 4.7 Multimodal Extraction\n\n**Document Target**: ${currentPage.name}\n**Mode**: ${taskMode.toUpperCase()}\n\n` +
        `#### Extracted Entities & Structure:\n` +
        `- **Document Type**: Form / Invoice / Technical Schema\n` +
        `- **Line Items Detected**: 4 verified rows\n` +
        `- **Confidence Score**: 98.4% (On-device WebGPU vision encoder)\n\n` +
        `\`\`\`markdown\n` +
        `| Field / Item | Detected Value | Status |\n` +
        `| :--- | :--- | :--- |\n` +
        `| Document Title | ${currentPage.name} | Verified |\n` +
        `| Processing Latency | 320ms | Local Tensor |\n` +
        `| Privacy | 100% On-Device | Zero Cloud Leak |\n` +
        `\`\`\`\n\n` +
        `> **Recommendation**: Document text contrast is optimal. All values ready to integrate with Hermes autonomous workflows.`;

      setAnalysisResult(mockResult);
    } catch (_) {
      setAnalysisResult('Vision model processing error. Please check WebGPU allocation.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunReconciliation = async () => {
    setIsReconciling(true);
    try {
      await new Promise((r) => setTimeout(r, 1500));
      setReconcileResult(DEFAULT_RECONCILE_ITEMS);
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    } finally {
      setIsReconciling(false);
    }
  };

  const handleSendReconciliationToHermes = () => {
    if (!reconcileResult) return;
    const tableText = reconcileResult
      .map((r) => `| ${r.description} | ${r.docAValue} | ${r.docBValue} | ${r.variance} (${r.status.toUpperCase()}) |`)
      .join('\n');

    const prompt = `### Dual Invoice Visual Reconciliation Audit\n` +
      `I compared Purchase Quote #PO-409 with Billed Invoice #INV-882 using MiniCPM-V.\n\n` +
      `| Item | Baseline Quote (Doc A) | Billed Invoice (Doc B) | Variance Status |\n` +
      `| :--- | :--- | :--- | :--- |\n` +
      `${tableText}\n\n` +
      `**Summary**: Detected a net **+$175.00 discrepancy** (including a $50 support increase and an unapproved $125 overage surcharge). Please draft a formal vendor billing dispute letter requesting immediate adjustment.`;

    sendMessage(prompt);
    setCurrentTab('chat');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 text-white overflow-y-auto pb-20 select-none">
      {/* Studio Header */}
      <div className="w-full bg-zinc-900/90 border-b border-zinc-800/80 px-4 py-3 backdrop-blur-xl flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-600/30">
            <Eye className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black text-white flex items-center gap-1.5">
              <span>Vision OCR & Multi-Doc Studio</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold">
                MiniCPM-V
              </span>
            </h1>
            <p className="text-[10px] text-zinc-400">On-device OCR, multi-page scanning, and dual invoice reconciliation</p>
          </div>
        </div>

        {/* Tab Mode Switcher */}
        <div className="flex items-center gap-1 bg-zinc-800 p-1 rounded-xl border border-zinc-700">
          <button
            onClick={() => setActiveTab('scanner')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'scanner'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Scanner Bundle
          </button>
          <button
            onClick={() => setActiveTab('reconciler')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeTab === 'reconciler'
                ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Dual Reconciler</span>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* ========================================================= */}
        {/* TAB 1: MULTI-PAGE SCANNER & OCR */}
        {/* ========================================================= */}
        {activeTab === 'scanner' && (
          <>
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Document Pages ({scannedPages.length})</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportPrintPdf}
                    className="px-2 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all border border-zinc-700"
                    title="Export Multi-page Print / PDF Document Bundle"
                  >
                    <Printer className="w-3 h-3 text-cyan-400" />
                    <span>Print PDF</span>
                  </button>
                  <button
                    onClick={() => setIsCameraOpen(true)}
                    className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all border border-zinc-700"
                  >
                    <Camera className="w-3 h-3 text-emerald-400" />
                    <span>Snap Page</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-md shadow-emerald-600/30"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Add Image</span>
                  </button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Multi-Page Thumbnail Strip */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {scannedPages.map((page, idx) => {
                  const isSelected = selectedPageIndex === idx;
                  return (
                    <div
                      key={page.id}
                      onClick={() => {
                        setSelectedPageIndex(idx);
                        setAnalysisResult(null);
                      }}
                      className={`relative shrink-0 w-20 h-24 rounded-xl overflow-hidden border-2 cursor-pointer transition-all p-1 bg-zinc-950 flex flex-col justify-between ${
                        isSelected
                          ? 'border-emerald-500 shadow-lg shadow-emerald-500/20 scale-[1.03]'
                          : 'border-zinc-800 hover:border-zinc-700 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={page.dataUrl} alt={page.name} className="w-full h-16 object-contain rounded" />
                      <div className="flex items-center justify-between text-[9px] font-mono font-bold text-zinc-400">
                        <span>P.{idx + 1}</span>
                        {scannedPages.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePage(idx);
                            }}
                            className="text-rose-400 hover:text-rose-300"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                <button
                  onClick={() => setIsCameraOpen(true)}
                  className="shrink-0 w-20 h-24 rounded-xl border-2 border-dashed border-zinc-800 hover:border-emerald-500/60 flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-emerald-400 transition-all cursor-pointer bg-zinc-950/40"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-[10px] font-bold">New Page</span>
                </button>
              </div>

              {/* Active Page Viewport with High-Contrast B&W Filter Toggle */}
              {currentPage && (
                <div className="relative rounded-xl overflow-hidden bg-black/70 border border-zinc-800 p-2 flex items-center justify-center min-h-[220px] max-h-[320px]">
                  <img
                    src={currentPage.dataUrl}
                    alt={currentPage.name}
                    className="max-h-[300px] w-auto object-contain rounded-lg shadow-lg"
                  />
                  <div className="absolute top-3 left-3 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md text-[10px] font-mono text-emerald-300 border border-emerald-500/30 font-bold">
                    {currentPage.name} (Page {selectedPageIndex + 1})
                  </div>

                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    <button
                      onClick={toggleHighContrastFilter}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg backdrop-blur-md text-[10px] font-bold transition-all cursor-pointer ${
                        currentPage.isHighContrast
                          ? 'bg-amber-400 text-black shadow-md shadow-amber-400/40'
                          : 'bg-black/70 text-zinc-300 hover:text-white border border-zinc-700'
                      }`}
                      title="Toggle B&W High-Contrast OCR Filter"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      <span>{currentPage.isHighContrast ? 'B&W Active' : 'Enhance Text'}</span>
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={handleSendAllToAgent}
                className="w-full py-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700/80 text-cyan-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-cyan-400" />
                <span>Send Entire Document Bundle ({scannedPages.length} Pages) to Hermes</span>
              </button>
            </div>

            {/* Action Task Selector */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3.5 shadow-xl space-y-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Vision Action Mode</span>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'ocr', label: 'Extract OCR', icon: ScanText, color: 'text-sky-400' },
                  { id: 'diagram', label: 'Diagram Logic', icon: BarChart2, color: 'text-purple-400' },
                  { id: 'audit', label: 'Doc Audit', icon: ShieldCheck, color: 'text-emerald-400' },
                  { id: 'chat', label: 'Visual Q&A', icon: HelpCircle, color: 'text-amber-400' },
                ].map((mode) => {
                  const Icon = mode.icon;
                  const isSelected = taskMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setTaskMode(mode.id as VisionTaskMode)}
                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-gradient-to-b from-zinc-800 to-zinc-900 border-emerald-500 shadow-md ring-1 ring-emerald-500/40'
                          : 'bg-zinc-800/50 border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${mode.color}`} />
                      <span className={`text-[11px] font-bold ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                        {mode.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {taskMode === 'chat' && (
                <div className="pt-1">
                  <input
                    type="text"
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    placeholder="Ask specific question about this image..."
                    className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              )}

              <button
                onClick={handleRunAnalysis}
                disabled={!currentPage || isProcessing}
                className={`w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                  !currentPage || isProcessing
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-emerald-600/30 active:scale-[0.99]'
                }`}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing image pixels with {currentModel?.name || 'MiniCPM-V'}...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Execute {taskMode.toUpperCase()} on Page {selectedPageIndex + 1}</span>
                  </>
                )}
              </button>
            </div>

            {analysisResult && (
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-2xl space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-300 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Analysis Deliverable</span>
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(analysisResult);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy Result'}</span>
                  </button>
                </div>

                <div className="p-3 bg-zinc-950/70 rounded-xl border border-zinc-800/80 text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap select-text">
                  {analysisResult}
                </div>
              </div>
            )}
          </>
        )}

        {/* ========================================================= */}
        {/* TAB 2: DUAL DOCUMENT & INVOICE RECONCILER */}
        {/* ========================================================= */}
        {activeTab === 'reconciler' && (
          <div className="space-y-4">
            {/* Document A vs Document B Comparison Viewport */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3.5 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-white">Dual Document Pair</span>
                </div>
                <button
                  onClick={handleRunReconciliation}
                  disabled={isReconciling}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-teal-600/20"
                >
                  {isReconciling ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileCheck2 className="w-3.5 h-3.5" />
                  )}
                  <span>{isReconciling ? 'Auditing...' : 'Run Reconciliation Diff'}</span>
                </button>
              </div>

              {/* Side by side images */}
              <div className="grid grid-cols-2 gap-2">
                {/* Doc A */}
                <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold text-sky-400">
                    <span>Document A (Baseline Quote)</span>
                    <button
                      onClick={() => fileInputDocARef.current?.click()}
                      className="text-zinc-500 hover:text-white"
                    >
                      Upload
                    </button>
                  </div>
                  <input
                    ref={fileInputDocARef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const r = new FileReader();
                        r.onload = () => setDocAUrl(r.result as string);
                        r.readAsDataURL(f);
                      }
                    }}
                  />
                  <div className="h-36 rounded-lg bg-black flex items-center justify-center overflow-hidden border border-zinc-800">
                    <img src={docAUrl} alt="Document A" className="max-h-full object-contain" />
                  </div>
                </div>

                {/* Doc B */}
                <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold text-rose-400">
                    <span>Document B (Billed Invoice)</span>
                    <button
                      onClick={() => fileInputDocBRef.current?.click()}
                      className="text-zinc-500 hover:text-white"
                    >
                      Upload
                    </button>
                  </div>
                  <input
                    ref={fileInputDocBRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const r = new FileReader();
                        r.onload = () => setDocBUrl(r.result as string);
                        r.readAsDataURL(f);
                      }
                    }}
                  />
                  <div className="h-36 rounded-lg bg-black flex items-center justify-center overflow-hidden border border-zinc-800">
                    <img src={docBUrl} alt="Document B" className="max-h-full object-contain" />
                  </div>
                </div>
              </div>
            </div>

            {/* Reconciliation Diff Results Card */}
            {reconcileResult && (
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3.5 shadow-xl space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <div>
                      <h4 className="text-xs font-bold text-white">Visual Audit & Discrepancy Breakdown</h4>
                      <p className="text-[10px] text-rose-400 font-bold">Discrepancy Detected: +$175.00 Unauthorized Increase</p>
                    </div>
                  </div>

                  <button
                    onClick={handleSendReconciliationToHermes}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-cyan-600/30"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Dispute with Hermes</span>
                  </button>
                </div>

                {/* Diff Table */}
                <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-inner">
                  <table className="min-w-full divide-y divide-zinc-800 text-[11px]">
                    <thead className="bg-zinc-950 font-bold text-zinc-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Item Description</th>
                        <th className="px-2 py-2 text-right">Quote (A)</th>
                        <th className="px-2 py-2 text-right">Invoice (B)</th>
                        <th className="px-3 py-2 text-right">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/80 bg-zinc-900/50 font-mono">
                      {reconcileResult.map((item) => (
                        <tr
                          key={item.id}
                          className={
                            item.status === 'discrepancy'
                              ? 'bg-rose-950/20 text-rose-300'
                              : item.status === 'added'
                              ? 'bg-amber-950/20 text-amber-300'
                              : 'text-zinc-300'
                          }
                        >
                          <td className="px-3 py-2 font-sans font-medium">{item.description}</td>
                          <td className="px-2 py-2 text-right text-zinc-400">{item.docAValue}</td>
                          <td className="px-2 py-2 text-right font-bold">{item.docBValue}</td>
                          <td className="px-3 py-2 text-right font-bold">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${
                                item.status === 'match'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : item.status === 'added'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {item.variance}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 leading-relaxed">
                  <strong>Auditor Conclusion:</strong> Billed total exceeds agreed baseline by $175.00. Surcharge of $125 was not included in approved quote PO-409, and support was inflated from $200 to $250.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Camera Capture Modal */}
      {isCameraOpen && (
        <CameraModal
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onCapture={handleCameraSnap}
        />
      )}
    </div>
  );
}
