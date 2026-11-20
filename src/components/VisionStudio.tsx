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
  QrCode,
  ScanLine,
  ExternalLink,
  Wifi,
  ShoppingCart,
  Globe,
  Columns,
  Layers,
  SplitSquareVertical,
  Languages,
  Volume2,
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

  const [activeTab, setActiveTab] = useState<'scanner' | 'reconciler' | 'barcode' | 'diff' | 'translate'>('scanner');

  // Multi-Lingual OCR Translation & Speech Readout State
  const [ocrTranslateLang, setOcrTranslateLang] = useState<string>('Spanish');
  const [ocrSourceText, setOcrSourceText] = useState<string>(
    'Hermes Neural Engine v3.0: High-performance on-device AI for mobile devices. Zero cloud latency and 100% data sovereignty.'
  );
  const [ocrTranslatedResult, setOcrTranslatedResult] = useState<string>(
    'Motor Neuronal Hermes v3.0: IA integrada de alto rendimiento para dispositivos móviles. Cero latencia en la nube y 100% de soberanía de datos.'
  );
  const [isTranslatingOcr, setIsTranslatingOcr] = useState<boolean>(false);
  const [isSpeakingOcrTranslation, setIsSpeakingOcrTranslation] = useState<boolean>(false);
  const [ocrTranslateFeedback, setOcrTranslateFeedback] = useState<string | null>(null);

  const OCR_LANGUAGES = [
    { name: 'Spanish', flag: '🇪🇸', code: 'es' },
    { name: 'French', flag: '🇫🇷', code: 'fr' },
    { name: 'German', flag: '🇩🇪', code: 'de' },
    { name: 'Japanese', flag: '🇯🇵', code: 'ja' },
    { name: 'Chinese', flag: '🇨🇳', code: 'zh' },
    { name: 'Korean', flag: '🇰🇷', code: 'ko' },
    { name: 'Italian', flag: '🇮🇹', code: 'it' },
    { name: 'Portuguese', flag: '🇧🇷', code: 'pt' },
  ];

  const handleTranslateOcr = async (target: string) => {
    setOcrTranslateLang(target);
    setIsTranslatingOcr(true);
    setOcrTranslateFeedback(`Translating OCR text into ${target} via on-device MiniCPM-V...`);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);

    await new Promise((r) => setTimeout(r, 600));

    let translated = '';
    switch (target) {
      case 'French':
        translated = 'Moteur Neuronal Hermes v3.0 : IA embarquée haute performance pour appareils mobiles. Zéro latence cloud et 100% de souveraineté des données.';
        break;
      case 'German':
        translated = 'Hermes Neuronale Engine v3.0: Leistungsstarke On-Device-KI für Mobilgeräte. Keine Cloud-Latenz und 100% Datensouveränität.';
        break;
      case 'Japanese':
        translated = 'Hermesニューラルエンジン v3.0：モバイル端末向け高性能オンデバイスAI。クラウド遅延ゼロ、100%のデータ主権を実現。';
        break;
      case 'Chinese':
        translated = 'Hermes 神经网络引擎 v3.0：专为移动设备打造的高性能端侧 AI。零云端延迟，100% 数据主权。';
        break;
      case 'Korean':
        translated = 'Hermes 뉴럴 엔진 v3.0: 모바일 장치를 위한 고성능 온디바이스 AI. 클라우드 지연 제로 및 100% 데이터 주권 보장.';
        break;
      case 'Italian':
        translated = 'Motore Neurale Hermes v3.0: IA on-device ad alte prestazioni per dispositivi mobili. Zero latenza cloud e sovranità dei dati al 100%.';
        break;
      case 'Portuguese':
        translated = 'Motor Neural Hermes v3.0: IA no dispositivo de alto desempenho para dispositivos móveis. Zero latência na nuvem e 100% de soberania dos dados.';
        break;
      default:
        translated = 'Motor Neuronal Hermes v3.0: IA integrada de alto rendimiento para dispositivos móviles. Cero latencia en la nube y 100% de soberanía de datos.';
    }

    setOcrTranslatedResult(translated);
    setIsTranslatingOcr(false);
    setOcrTranslateFeedback(`Translation into ${target} complete!`);
    setTimeout(() => setOcrTranslateFeedback(null), 3000);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([30, 20, 30]);
  };

  const handleSpeakOcrTranslation = async () => {
    if (!ocrTranslatedResult) return;
    setIsSpeakingOcrTranslation(true);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(ocrTranslatedResult);
      const targetObj = OCR_LANGUAGES.find((l) => l.name === ocrTranslateLang);
      if (targetObj) utterance.lang = targetObj.code;
      utterance.rate = 1.0;
      utterance.onend = () => setIsSpeakingOcrTranslation(false);
      utterance.onerror = () => setIsSpeakingOcrTranslation(false);
      window.speechSynthesis.speak(utterance);
    } else {
      await new Promise((r) => setTimeout(r, 1500));
      setIsSpeakingOcrTranslation(false);
    }
  };

  // Visual Diff & Comparison State
  const [diffMode, setDiffMode] = useState<'slider' | 'side-by-side' | 'difference' | 'onion'>('slider');
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [onionOpacity, setOnionOpacity] = useState<number>(50);
  const [diffImageA, setDiffImageA] = useState<string>('https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&auto=format&fit=crop&q=80');
  const [diffImageB, setDiffImageB] = useState<string>('https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80');
  const [isDiffAnalyzing, setIsDiffAnalyzing] = useState<boolean>(false);
  const [diffResult, setDiffResult] = useState<{
    similarityScore: number;
    discrepancyPercent: number;
    findings: string[];
    regionsCount: number;
  } | null>({
    similarityScore: 94.6,
    discrepancyPercent: 5.4,
    findings: [
      'Accent button hue shifted from emerald-500 (#10b981) to indigo-500 (#6366f1).',
      'Container padding increased along vertical axis by 8px.',
      'Header text weight updated from medium (500) to bold (700).',
    ],
    regionsCount: 3,
  });

  // Barcode & QR Scanner State
  const [barcodePayload, setBarcodePayload] = useState('https://github.com/jason-lim110396/android-hermes-agent-and-llm-ai-models');
  const [barcodeFormat, setBarcodeFormat] = useState<'QR_CODE' | 'UPC_A' | 'EAN_13' | 'CODE_128'>('QR_CODE');
  const [barcodeActionFeedback, setBarcodeActionFeedback] = useState<string | null>(null);

  const BARCODE_SAMPLES = [
    {
      format: 'QR_CODE' as const,
      label: '🌐 Hermes Repository URL',
      payload: 'https://github.com/jason-lim110396/android-hermes-agent-and-llm-ai-models',
      category: 'url',
    },
    {
      format: 'QR_CODE' as const,
      label: '📶 Wi-Fi Hotspot Config',
      payload: 'WIFI:S:HermesLocalStation;T:WPA;P:offlineai2026;;',
      category: 'wifi',
    },
    {
      format: 'UPC_A' as const,
      label: '🏷️ Grocery UPC Barcode',
      payload: '011110038364',
      category: 'product',
    },
    {
      format: 'QR_CODE' as const,
      label: '₿ Bitcoin Address',
      payload: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      category: 'crypto',
    },
  ];

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
          <button
            onClick={() => setActiveTab('barcode')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeTab === 'barcode'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Barcode & QR</span>
          </button>
          <button
            onClick={() => setActiveTab('diff')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeTab === 'diff'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            <span>Visual Diff</span>
          </button>
          <button
            onClick={() => setActiveTab('translate')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeTab === 'translate'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Languages className="w-3.5 h-3.5" />
            <span>OCR Translate</span>
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

        {/* ========================================================= */}
        {/* TAB 3: VISUAL BARCODE & QR CODE SCANNER */}
        {/* ========================================================= */}
        {activeTab === 'barcode' && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
              <span className="flex items-center gap-1.5 text-amber-400">
                <QrCode className="w-3.5 h-3.5" />
                <span>Visual Barcode & QR Code Neural Decoder</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">100% Offline</span>
            </div>

            {/* Quick Sample Presets */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Test Sample Payloads</span>
              <div className="grid grid-cols-2 gap-2">
                {BARCODE_SAMPLES.map((sample, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setBarcodePayload(sample.payload);
                      setBarcodeFormat(sample.format);
                      setBarcodeActionFeedback(`Loaded ${sample.label}`);
                      if (navigator.vibrate) navigator.vibrate(25);
                      setTimeout(() => setBarcodeActionFeedback(null), 2500);
                    }}
                    className={`p-2 rounded-xl text-left border text-xs font-medium cursor-pointer transition-all ${
                      barcodePayload === sample.payload
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                        : 'bg-zinc-800/60 hover:bg-zinc-800 border-zinc-700/60 text-zinc-300'
                    }`}
                  >
                    <div className="font-bold truncate">{sample.label}</div>
                    <div className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">{sample.payload}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Visual Barcode / QR Target Frame */}
            <div className="p-4 bg-zinc-950/80 rounded-2xl border border-zinc-800 flex flex-col items-center justify-center space-y-3 relative overflow-hidden">
              <div className="w-36 h-36 rounded-2xl bg-zinc-900 border-2 border-dashed border-amber-500/50 flex flex-col items-center justify-center relative p-3">
                {barcodeFormat === 'QR_CODE' ? (
                  <QrCode className="w-20 h-20 text-amber-400" />
                ) : (
                  <ScanLine className="w-20 h-20 text-cyan-400" />
                )}
                <span className="text-[9px] font-mono font-bold text-zinc-400 mt-1 uppercase tracking-wider">
                  {barcodeFormat}
                </span>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-500/10 to-transparent animate-pulse pointer-events-none" />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsCameraOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/20"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Scan with Camera</span>
                </button>
                <button
                  onClick={() => {
                    const curIdx = BARCODE_SAMPLES.findIndex((s) => s.payload === barcodePayload);
                    const nextSample = BARCODE_SAMPLES[(curIdx + 1) % BARCODE_SAMPLES.length];
                    setBarcodePayload(nextSample.payload);
                    setBarcodeFormat(nextSample.format);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer border border-zinc-700/60"
                >
                  Cycle Sample
                </button>
              </div>
            </div>

            {/* Decoded Content & Intent Matrix */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <ScanLine className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Decoded Data Payload</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-amber-400 font-mono">
                  {barcodeFormat}
                </span>
              </div>

              <div className="p-3 bg-zinc-950/70 border border-zinc-800 rounded-xl font-mono text-xs text-zinc-200 select-text break-all leading-relaxed">
                {barcodePayload}
              </div>
            </div>

            {/* Protocol Action Triggers */}
            <div className="space-y-2 pt-2 border-t border-zinc-800/80">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Contextual Protocol Actions</span>

              <div className="grid grid-cols-2 gap-2">
                {barcodePayload.startsWith('WIFI:') && (
                  <button
                    onClick={() => {
                      setBarcodeActionFeedback('Simulating Wi-Fi handshake: Connected to network!');
                      if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
                      setTimeout(() => setBarcodeActionFeedback(null), 3000);
                    }}
                    className="p-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center gap-2 cursor-pointer shadow-md text-xs font-bold"
                  >
                    <Wifi className="w-4 h-4 shrink-0" />
                    <span>Connect to Wi-Fi</span>
                  </button>
                )}

                {barcodePayload.startsWith('http') && (
                  <a
                    href={barcodePayload}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white flex items-center gap-2 cursor-pointer shadow-md text-xs font-bold justify-center"
                  >
                    <Globe className="w-4 h-4 shrink-0" />
                    <span>Open URL in Browser</span>
                  </a>
                )}

                {/^\d+$/.test(barcodePayload) && (
                  <button
                    onClick={() => {
                      sendMessage(`Lookup product specifications, retail price, and ingredients for UPC/EAN code: ${barcodePayload}`);
                      setCurrentTab('chat');
                    }}
                    className="p-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white flex items-center gap-2 cursor-pointer shadow-md text-xs font-bold"
                  >
                    <ShoppingCart className="w-4 h-4 shrink-0" />
                    <span>Lookup Product Info</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(barcodePayload);
                    setBarcodeActionFeedback('Copied barcode payload to clipboard!');
                    if (navigator.vibrate) navigator.vibrate(20);
                    setTimeout(() => setBarcodeActionFeedback(null), 2500);
                  }}
                  className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700/80 text-zinc-200 border border-zinc-700/60 flex items-center gap-2 cursor-pointer text-xs font-bold"
                >
                  <Copy className="w-4 h-4 shrink-0" />
                  <span>Copy Payload</span>
                </button>

                <button
                  onClick={() => {
                    sendMessage(`Audit and interpret this scanned barcode/QR code payload:\n\nFormat: ${barcodeFormat}\nPayload: ${barcodePayload}`);
                    setCurrentTab('chat');
                  }}
                  className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700/80 text-amber-300 border border-amber-500/40 flex items-center gap-2 cursor-pointer text-xs font-bold"
                >
                  <Send className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Send to Hermes Agent</span>
                </button>
              </div>

              {barcodeActionFeedback && (
                <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs text-center font-bold animate-in fade-in">
                  {barcodeActionFeedback}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: MULTI-IMAGE SIDE-BY-SIDE & VISUAL DIFF SLIDER */}
        {/* ========================================================= */}
        {activeTab === 'diff' && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
              <span className="flex items-center gap-1.5 text-violet-400">
                <Columns className="w-3.5 h-3.5" />
                <span>Visual Diff Slider & Comparison View</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">MiniCPM-V Neural Diff</span>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-1.5 bg-zinc-950/70 p-1 rounded-xl border border-zinc-800 overflow-x-auto pb-0.5 scrollbar-none">
              {[
                { id: 'slider', label: '↔ Split Slider' },
                { id: 'side-by-side', label: '⫿ Side-by-Side' },
                { id: 'difference', label: '🪞 Difference Mask' },
                { id: 'onion', label: '🧅 Onion Skin' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setDiffMode(m.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap border ${
                    diffMode === m.id
                      ? 'bg-violet-600 text-white border-violet-500 shadow-sm'
                      : 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Preset Test Pairs */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Preset Comparison Pairs</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    label: 'UI Design vs Production',
                    imgA: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&auto=format&fit=crop&q=80',
                    imgB: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80',
                    score: 94.6,
                    delta: 5.4,
                    findings: [
                      'Accent button hue shifted from emerald-500 to indigo-500.',
                      'Header padding increased along vertical axis by 8px.',
                      'Subtext font weight updated from regular to medium.',
                    ],
                  },
                  {
                    label: 'PCB Circuit Inspection',
                    imgA: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80',
                    imgB: 'https://images.unsplash.com/photo-1597733336794-12d05021d510?w=600&auto=format&fit=crop&q=80',
                    score: 88.2,
                    delta: 11.8,
                    findings: [
                      'Solder bridge anomaly detected between Pin 14 and Pin 15.',
                      'Capacitor C204 offset by 0.3mm.',
                      'Trace continuity verified across GND ground plane.',
                    ],
                  },
                  {
                    label: 'Document Redaction Check',
                    imgA: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?w=600&auto=format&fit=crop&q=80',
                    imgB: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&auto=format&fit=crop&q=80',
                    score: 91.5,
                    delta: 8.5,
                    findings: [
                      'Social Security and Bank Account numbers completely blacked out.',
                      'Authorized notary seal verified intact in lower right margin.',
                      'Zero confidential metadata remaining in visible viewport.',
                    ],
                  },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setDiffImageA(preset.imgA);
                      setDiffImageB(preset.imgB);
                      setDiffResult({
                        similarityScore: preset.score,
                        discrepancyPercent: preset.delta,
                        findings: preset.findings,
                        regionsCount: preset.findings.length,
                      });
                      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);
                    }}
                    className="px-2 py-1 rounded-lg bg-zinc-950/70 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[10px] font-medium cursor-pointer transition-all"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Image Viewport */}
            <div className="relative w-full h-64 bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden select-none flex items-center justify-center">
              {diffMode === 'slider' && (
                <div className="relative w-full h-full overflow-hidden">
                  {/* Base Image A */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={diffImageA}
                    alt="Image A Baseline"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Overlay Image B with Clip-Path */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={diffImageB}
                    alt="Image B Modified"
                    style={{ clipPath: `inset(0 calc(100% - ${sliderPosition}%) 0 0)` }}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Glowing Vertical Divider Line */}
                  <div
                    style={{ left: `${sliderPosition}%` }}
                    className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-violet-400 via-white to-indigo-400 shadow-[0_0_10px_rgba(167,139,250,0.8)] z-10 pointer-events-none"
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-violet-600 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-lg shadow-violet-600/50">
                      ↔
                    </div>
                  </div>

                  {/* Badges */}
                  <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 text-violet-300 text-[9px] font-mono border border-violet-500/40 z-20">
                    A: Baseline
                  </span>
                  <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-indigo-300 text-[9px] font-mono border border-indigo-500/40 z-20">
                    B: Modified
                  </span>
                </div>
              )}

              {diffMode === 'side-by-side' && (
                <div className="grid grid-cols-2 w-full h-full gap-1 p-1">
                  <div className="relative w-full h-full rounded-xl overflow-hidden border border-zinc-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={diffImageA} alt="A" className="w-full h-full object-cover" />
                    <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-violet-300 text-[8px] font-mono">
                      Image A
                    </span>
                  </div>
                  <div className="relative w-full h-full rounded-xl overflow-hidden border border-zinc-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={diffImageB} alt="B" className="w-full h-full object-cover" />
                    <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-indigo-300 text-[8px] font-mono">
                      Image B
                    </span>
                  </div>
                </div>
              )}

              {diffMode === 'difference' && (
                <div className="relative w-full h-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={diffImageA} alt="A" className="absolute inset-0 w-full h-full object-cover" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={diffImageB}
                    alt="B"
                    style={{ mixBlendMode: 'difference' }}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 text-emerald-400 text-[9px] font-mono border border-emerald-500/40 z-10">
                    Difference Inversion Mask Active
                  </span>
                </div>
              )}

              {diffMode === 'onion' && (
                <div className="relative w-full h-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={diffImageA} alt="A" className="absolute inset-0 w-full h-full object-cover" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={diffImageB}
                    alt="B"
                    style={{ opacity: onionOpacity / 100 }}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 text-cyan-300 text-[9px] font-mono border border-cyan-500/40 z-10">
                    Crossfade Opacity: {onionOpacity}%
                  </span>
                </div>
              )}
            </div>

            {/* Slider Drag / Position Controls */}
            {diffMode === 'slider' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Wipe Position</span>
                  <span className="font-mono text-violet-400 font-bold">{sliderPosition}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPosition}
                  onChange={(e) => setSliderPosition(parseInt(e.target.value))}
                  className="w-full accent-violet-500 cursor-pointer"
                />
                <div className="flex items-center justify-between text-[9px] text-zinc-500">
                  <button onClick={() => setSliderPosition(25)} className="hover:text-zinc-300">25%</button>
                  <button onClick={() => setSliderPosition(50)} className="hover:text-zinc-300">50% (Center)</button>
                  <button onClick={() => setSliderPosition(75)} className="hover:text-zinc-300">75%</button>
                </div>
              </div>
            )}

            {diffMode === 'onion' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Crossfade Transparency</span>
                  <span className="font-mono text-cyan-400 font-bold">{onionOpacity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={onionOpacity}
                  onChange={(e) => setOnionOpacity(parseInt(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>
            )}

            {/* MiniCPM-V Neural Diff Analysis Report */}
            {diffResult && (
              <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800 space-y-2.5 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>MiniCPM-V Vision Inspection Verdict</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-mono font-bold">
                    {diffResult.similarityScore}% Match
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
                  <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                    <span className="text-zinc-500 block uppercase">Pixel Discrepancy</span>
                    <span className="text-xs font-black text-rose-400 font-mono">
                      {diffResult.discrepancyPercent}%
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                    <span className="text-zinc-500 block uppercase">Modified Regions</span>
                    <span className="text-xs font-black text-amber-400 font-mono">
                      {diffResult.regionsCount} Found
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Identified Variations</span>
                  <ul className="space-y-1">
                    {diffResult.findings.map((f, i) => (
                      <li key={i} className="text-[11px] text-zinc-300 flex items-start gap-1.5">
                        <span className="text-violet-400 font-bold shrink-0">•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={async () => {
                  setIsDiffAnalyzing(true);
                  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([25, 25]);
                  await new Promise((r) => setTimeout(r, 900));
                  setIsDiffAnalyzing(false);
                }}
                disabled={isDiffAnalyzing}
                className="py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isDiffAnalyzing ? 'animate-spin' : ''}`} />
                <span>{isDiffAnalyzing ? 'Analyzing Pixels...' : 'Re-Run Neural Diff'}</span>
              </button>

              <button
                onClick={() => {
                  if (diffResult) {
                    const findingsText = diffResult.findings.map((f, i) => `${i + 1}. ${f}`).join('\n');
                    sendMessage(
                      `Analyze the visual difference between the baseline image and modified image:\n\n` +
                      `- Similarity Score: ${diffResult.similarityScore}%\n` +
                      `- Discrepancy Delta: ${diffResult.discrepancyPercent}%\n` +
                      `- Key Findings:\n${findingsText}\n\n` +
                      `Please evaluate if these visual changes meet product quality standards.`
                    );
                    setCurrentTab('chat');
                  }
                }}
                className="py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-violet-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-violet-500/40 transition-all"
              >
                <Send className="w-3.5 h-3.5 text-violet-400" />
                <span>Send to Hermes Agent</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: MULTI-LINGUAL OCR TRANSLATE & SPEECH READOUT */}
        {/* ========================================================= */}
        {activeTab === 'translate' && (
          <div className="space-y-4 animate-in fade-in">
            {/* Header & Source OCR Text Card */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1.5 text-blue-400">
                  <ScanText className="w-4 h-4" />
                  <span>Source OCR Extracted Text</span>
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {ocrSourceText.length} characters
                </span>
              </div>

              <textarea
                value={ocrSourceText}
                onChange={(e) => setOcrSourceText(e.target.value)}
                placeholder="Scan or paste source OCR document text here..."
                rows={3}
                className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans leading-relaxed"
              />

              {/* Target Language Selection Pills */}
              <div className="space-y-1.5 pt-1 border-t border-zinc-800/80">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Target Language (MiniCPM-V + Kokoro TTS)
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {OCR_LANGUAGES.map((lang) => {
                    const isSelected = ocrTranslateLang === lang.name;
                    return (
                      <button
                        key={lang.name}
                        onClick={() => handleTranslateOcr(lang.name)}
                        className={`p-1.5 rounded-xl text-center border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/50 shadow-sm ring-1 ring-blue-500/30'
                            : 'bg-zinc-950/60 hover:bg-zinc-800/80 text-zinc-400 border-zinc-800'
                        }`}
                      >
                        <span className="text-sm">{lang.flag}</span>
                        <span className="text-xs font-bold">{lang.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Translation Output Card */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <Languages className="w-4 h-4" />
                  <span>Translated Document ({ocrTranslateLang})</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono">
                  100% On-Device
                </span>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800/80 rounded-xl text-xs text-zinc-200 font-sans leading-relaxed min-h-[90px] select-text">
                {isTranslatingOcr ? (
                  <div className="flex items-center justify-center gap-2 text-zinc-400 h-20">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                    <span>Translating document text...</span>
                  </div>
                ) : (
                  ocrTranslatedResult
                )}
              </div>

              {ocrTranslateFeedback && (
                <div className="p-2 rounded-xl bg-blue-500/15 border border-blue-500/40 text-blue-300 text-xs text-center font-bold animate-in fade-in">
                  {ocrTranslateFeedback}
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleSpeakOcrTranslation}
                  disabled={isSpeakingOcrTranslation || isTranslatingOcr}
                  className="py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{isSpeakingOcrTranslation ? 'Speaking...' : 'Read Aloud (TTS)'}</span>
                </button>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(ocrTranslatedResult);
                    setOcrTranslateFeedback('Translation copied to clipboard!');
                    setTimeout(() => setOcrTranslateFeedback(null), 2500);
                    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
                  }}
                  className="py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-700 transition-all"
                >
                  <Copy className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Copy Translation</span>
                </button>
              </div>

              {/* Dispatch & Export */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    sendMessage(
                      `Here is an OCR translation generated on-device:\n\n` +
                      `**Source Text**:\n"""\n${ocrSourceText}\n"""\n\n` +
                      `**Target Language**: ${ocrTranslateLang}\n` +
                      `**Translated Text**:\n"""\n${ocrTranslatedResult}\n"""\n\n` +
                      `Please analyze this text and summarize key action items.`
                    );
                    setCurrentTab('chat');
                  }}
                  className="py-2 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-blue-400 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send to Chat</span>
                </button>

                <button
                  onClick={() => {
                    const content = `Hermes OCR Translation Report\nTarget Language: ${ocrTranslateLang}\nDate: ${new Date().toISOString()}\n\n--- Source ---\n${ocrSourceText}\n\n--- Translated ---\n${ocrTranslatedResult}\n`;
                    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `OCR_Translation_${ocrTranslateLang}_${Date.now()}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setOcrTranslateFeedback('Exported translation file.');
                    setTimeout(() => setOcrTranslateFeedback(null), 2500);
                  }}
                  className="py-2 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Export TXT</span>
                </button>
              </div>
            </div>
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
