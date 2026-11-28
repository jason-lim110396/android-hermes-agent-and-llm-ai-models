import { triggerHaptic } from '@/utils/haptics';
import React, { useRef, useState, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Camera,
  Image as ImageIcon,
  Bot,
  User,
  Sparkles,
  Zap,
  Flame,
  CheckCircle2,
  Check,
  CornerUpLeft,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
  HelpCircle,
  FileCode,
  FileText,
  Terminal,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Radio,
  AudioLines,
  SlidersHorizontal,
  Square,
  Plus,
  Layers,
  Copy,
  RefreshCw,
  ArrowRight,
  Download,
  Cpu,
  HardDrive,
  Activity,
  Gauge,
  Headphones,
  PhoneCall,
  Disc,
  Waves,
  Octagon,
  MoreHorizontal,
  Search,
  Share2,
  Vibrate,
  Bell,
  Star,
  Bookmark,
  BookOpen,
  FileSpreadsheet,
  History,
  Calculator,
  Presentation,
  Minimize2,
  Compass,
  Clipboard,
  Globe,
  Wifi,
  WifiOff,
  RotateCcw,
  QrCode,
  ArrowRightLeft,
  ExternalLink,
} from 'lucide-react';
import { useAppStore, Attachment, ChatMessage, isErrorDisplayMessage } from '@/appStore';
import { AVAILABLE_MODELS, ModelSpec } from '@/models';
import { startVisibleInterval } from '@/utils/visibleInterval';
import { isOversizedImage, downsampleImageFile } from '@/utils/imageOptimizer';
import CameraModal from './CameraModal';
import CodeSandboxModal from './CodeSandboxModal';
import TableSpreadsheetModal from './TableSpreadsheetModal';
import ChatHistoryModal from './ChatHistoryModal';
import ExportDocumentModal from './ExportDocumentModal';
import MathFormulaModal from './MathFormulaModal';
import SlideDeckModal from './SlideDeckModal';
import ContextCompressorModal from './ContextCompressorModal';
import ClipboardVaultModal from './ClipboardVaultModal';
import OfflinePhraseBookModal from './OfflinePhraseBookModal';
import SensorSpatialModal from './SensorSpatialModal';
import NetworkSpeedModal from './NetworkSpeedModal';
import { abortAllInference } from '@/inferenceEngine';
import { isPermissionDeniedError } from '@/utils/nativeAppSettings';
import PermissionDeniedNotice from './PermissionDeniedNotice';
import {
  voiceChunkBelongsToCurrentNote,
  createSilenceDetector,
  SilenceDetector,
  evaluateNoiseGate,
  getStoredNoiseGateThreshold,
  setStoredNoiseGateThreshold,
} from '@/utils/voiceSession';
import {
  createSpeechInputSession,
  type SpeechSession,
} from '@/utils/speechRecognition';
import { useBackButtonClose } from '@/utils/backButton';
import MarkdownNotepadModal from './MarkdownNotepadModal';
import QRCodeStudioModal from './QRCodeStudioModal';
import VoiceCallModal from './VoiceCallModal';
import { isCriticalMemoryPressure, getHeapMemoryStats, type HeapMemoryStats } from '@/utils/memoryGuard';
import { flushPersistNow } from '@/utils/sessionPersistence';
import { subscribeThermalTelemetry, getThermalTelemetry, type ThermalTelemetry } from '@/utils/thermalGuard';
import { copyToClipboardSafe, formatMessageForCopy } from '@/utils/clipboardGuard';
import { canShareToApps, shareTextToApps } from '@/utils/shareTarget';
import { calculateThroughputStats, formatThroughput } from '@/utils/tpsSampler';
import { getChatFontSize, CHAT_FONT_SIZE_OPTIONS, type ChatFontSize } from '@/utils/fontSettings';
import {
  loadComposerDraft,
  loadLegacyComposerDraft,
  clearLegacyComposerDraft,
  saveComposerDraft,
  clearComposerDraft,
} from '@/utils/composerDraft';

// Isolated real-time hardware ticker: owns its 1.5s interval and the liveTps
// store subscription, so the full ChatView tree no longer re-renders on every
// tick or streamed token - only this small bar does.
const TICK_MS = 1500;

const HardwareTickerBar = React.memo(function HardwareTickerBar({
  isGenerating,
  engineLabel,
  accelLabel,
}: {
  isGenerating: boolean;
  engineLabel: string;
  accelLabel: string;
}) {
  const liveTps = useAppStore((s) => s.liveTps);
  // Real measurements only: the WebView heap from performance.memory and the
  // main-thread delay measured on this bar's own ticker. The old bar showed a
  // random number as "CPU %" and an invented "RAM" total.
  const [heapStats, setHeapStats] = useState<HeapMemoryStats | null>(null);
  const [mainThreadLagMs, setMainThreadLagMs] = useState<number | null>(null);
  const lastTickAtRef = useRef<number>(0);
  const [tpsHistory, setTpsHistory] = useState<number[]>([]);
  const [showTpsDetail, setShowTpsDetail] = useState<boolean>(false);
  const [genStartTime, setGenStartTime] = useState<number | null>(null);
  const [ttftMs, setTtftMs] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  React.useEffect(() => {
    if (isGenerating) {
      const now = performance.now();
      setGenStartTime(now);
      setTtftMs(null);
      setElapsedSec(0);
      setTpsHistory([]);
      // Wall-clock elapsed time: counting ticks drifts when the WebView
      // throttles timers while the app is in the background.
      const timer = setInterval(() => {
        setElapsedSec(Math.round(((performance.now() - now) / 1000) * 10) / 10);
      }, 500);
      return () => clearInterval(timer);
    } else {
      setGenStartTime(null);
    }
  }, [isGenerating]);

  React.useEffect(() => {
    if (isGenerating && liveTps > 0) {
      if (ttftMs === null && genStartTime !== null) {
        setTtftMs(Math.round(performance.now() - genStartTime));
      }
      setTpsHistory((prev) => {
        const next = [...prev, liveTps];
        return next.length > 10 ? next.slice(next.length - 10) : next;
      });
    }
  }, [isGenerating, liveTps, ttftMs, genStartTime]);

  React.useEffect(() => {
    // Visibility-gated ticker: skips polling work while the Android app is
    // backgrounded (WebView keeps JS timers alive there) and refreshes once
    // immediately on returning to the foreground.
    const cancelTicker = startVisibleInterval(() => {
      setHeapStats(getHeapMemoryStats());
      const now = performance.now();
      const previous = lastTickAtRef.current;
      lastTickAtRef.current = now;
      if (previous > 0) {
        const drift = now - previous - TICK_MS;
        // After a resume the first gap spans the whole background period and
        // is dropped by resetBaseline; a long stall in the foreground is real,
        // so it is clamped and shown as "3000ms+" instead of being hidden.
        if (drift >= 0) {
          setMainThreadLagMs(Math.round(Math.min(drift, 3000)));
        }
      }
    }, TICK_MS);
    // Restart the drift baseline on resume so the padded gap is not measured.
    const resetBaseline = () => {
      lastTickAtRef.current = 0;
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', resetBaseline);
    return () => {
      cancelTicker();
      document.removeEventListener('visibilitychange', resetBaseline);
    };
  }, []);

  const tpsStats = calculateThroughputStats(tpsHistory.length > 0 ? tpsHistory : liveTps > 0 ? [liveTps] : []);

  return (
    <div className="px-3 py-1.5 bg-zinc-900/95 border-b border-zinc-800/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[9px] font-mono z-10 select-none">
      {/* WebView JS heap (real, when the WebView exposes it) */}
      {heapStats && (
        <div className="flex items-center gap-1.5 text-zinc-300 whitespace-nowrap min-w-0">
          <Cpu className="w-3 h-3 text-cyan-400 shrink-0" />
          <span className="text-zinc-400">Heap:</span>
          <span className="text-cyan-300 font-bold">
            {heapStats.usedJSHeapMB} MB
          </span>
          <span className="text-[9px] text-zinc-500 hidden sm:inline">
            / limit {(heapStats.jsHeapLimitMB / 1024).toFixed(1)} GB
          </span>
        </div>
      )}

      {/* Main-thread delay measured on this bar's own ticker */}
      {mainThreadLagMs !== null && (
        <div className="flex items-center gap-1.5 text-zinc-300 whitespace-nowrap min-w-0">
          <Gauge className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-zinc-400">Lag:</span>
          <span className={`font-bold ${mainThreadLagMs > 120 ? 'text-amber-400' : 'text-emerald-300'}`}>
            {mainThreadLagMs >= 3000 ? '3000ms+' : `${mainThreadLagMs}ms`}
          </span>
        </div>
      )}

      {/* Acceleration Engine & Real Speed */}
      <div
        onClick={() => {
          if (liveTps > 0 || tpsStats.peak > 0) {
            setShowTpsDetail((prev) => !prev);
            triggerHaptic(20);
          }
        }}
        className="flex items-center gap-1.5 text-zinc-300 whitespace-nowrap min-w-0 cursor-pointer hover:text-white transition-colors"
        title="Tap to toggle peak throughput details"
      >
        <Zap className="w-3 h-3 text-amber-400 shrink-0" />
        <span className="text-zinc-400 hidden sm:inline">{engineLabel}</span>
        <span className="text-amber-300 font-bold flex items-center gap-1">
          {isGenerating ? (
            <>
              {liveTps > 0 ? (
                <span>{liveTps.toFixed(1)} t/s</span>
              ) : (
                <span className="animate-pulse">thinking...</span>
              )}
              {elapsedSec > 0 && <span className="text-zinc-500 font-normal">({elapsedSec}s)</span>}
              {ttftMs !== null && (
                <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[8px] font-bold border border-amber-500/30">
                  {ttftMs}ms TTFT
                </span>
              )}
            </>
          ) : (
            accelLabel
          )}
        </span>
        {isGenerating && liveTps > 0 && tpsHistory.length > 1 && (
          <svg className="w-7 h-2.5 shrink-0 overflow-visible" viewBox="0 0 36 14">
            <polyline
              fill="none"
              stroke="#fbbf24"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={tpsStats.sparklinePolyline}
            />
          </svg>
        )}
        {showTpsDetail && tpsStats.peak > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[8px] font-mono">
            Peak: {tpsStats.peak.toFixed(1)} | Avg: {tpsStats.avg.toFixed(1)}
          </span>
        )}
        {isGenerating && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
        )}
      </div>
    </div>
  );
});

// Stable empty-array identity: `currentSession?.messages || []` would create a
// fresh [] each render when no session exists and invalidate the memo below.
const EMPTY_MESSAGES: never[] = [];

interface FormattedCodeBlockProps {
  language: string;
  code: string;
  onRunInSandbox?: (code: string) => void;
}

const FormattedCodeBlock = React.memo(function FormattedCodeBlock({
  language,
  code,
  onRunInSandbox,
}: FormattedCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lineCount = code ? code.split('\n').length : 0;
  const cleanLang = (language || 'code').toLowerCase().trim();
  const isRunnable = ['html', 'javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx', 'css', 'svg'].includes(
    cleanLang
  );

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        triggerHaptic(20);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (_) {}
  };

  return (
    <div className="my-2.5 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 font-mono text-[11px] shadow-lg">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/90 border-b border-zinc-800/80 text-zinc-400 select-none">
        <div className="flex items-center gap-2">
          <span className="uppercase font-bold text-[10px] tracking-wider text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-1.5 py-0.5 rounded">
            {language || 'code'}
          </span>
          <span className="text-[10px] text-zinc-500 font-sans">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isRunnable && onRunInSandbox && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRunInSandbox(code);
              }}
              title="Run in Code Playground Sandbox"
              className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-800/40 hover:bg-emerald-900/50 transition-all cursor-pointer font-sans font-medium"
            >
              <Play className="w-2.5 h-2.5 fill-current" />
              <span>Run</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            title="Copy code to clipboard"
            className={`flex items-center gap-1 transition-all cursor-pointer text-[10px] px-2 py-0.5 rounded border font-sans font-medium ${
              copied
                ? 'bg-emerald-950/80 border-emerald-600/60 text-emerald-400'
                : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-300 hover:text-white hover:bg-zinc-700'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
      <pre className="p-3 overflow-x-auto text-zinc-200 leading-relaxed select-text font-mono text-[11px] max-h-[420px] scrollbar-thin">
        <code>{code}</code>
      </pre>
    </div>
  );
});

export default function ChatView() {
  const hardwareProfile = useAppStore((s) => s.hardwareProfile);
  const operatingMode = useAppStore((s) => s.operatingMode);
  const setOperatingMode = useAppStore((s) => s.setOperatingMode);
  const chatTabMode = useAppStore((s) => s.chatTabMode);
  const setChatTabMode = useAppStore((s) => s.setChatTabMode);
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const isOnline = useAppStore((s) => s.isOnline);
  const justReconnected = useAppStore((s) => s.justReconnected);
  const setJustReconnected = useAppStore((s) => s.setJustReconnected);
  const fallbackNotice = useAppStore((s) => s.fallbackNotice);
  const setFallbackNotice = useAppStore((s) => s.setFallbackNotice);
  const clearFallbackNotice = useAppStore((s) => s.clearFallbackNotice);
  const downloads = useAppStore((s) => s.downloads);
  const startDownloadModel = useAppStore((s) => s.startDownloadModel);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);

  // Separated Sessions
  const chatSessions = useAppStore((s) => s.chatSessions);
  const agentSessions = useAppStore((s) => s.agentSessions);
  const activeChatSessionId = useAppStore((s) => s.activeChatSessionId);
  const activeAgentSessionId = useAppStore((s) => s.activeAgentSessionId);
  const sessionsHydrated = useAppStore((s) => s.sessionsHydrated);
  const createNewSession = useAppStore((s) => s.createNewSession);
  const switchSession = useAppStore((s) => s.switchSession);
  const clearCurrentConversation = useAppStore((s) => s.clearCurrentConversation);

  // Voice Interaction
  const isVoiceOutputEnabled = useAppStore((s) => s.isVoiceOutputEnabled);
  const setIsVoiceOutputEnabled = useAppStore((s) => s.setIsVoiceOutputEnabled);
  const speakText = useAppStore((s) => s.speakText);
  const stopSpeaking = useAppStore((s) => s.stopSpeaking);
  const isSpeaking = useAppStore((s) => s.isSpeaking);

  // Messaging & Attachments
  const pendingAttachments = useAppStore((s) => s.pendingAttachments);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const addAttachment = useAppStore((s) => s.addAttachment);
  const removeAttachment = useAppStore((s) => s.removeAttachment);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const stopAllRunningTasks = useAppStore((s) => s.stopAllRunningTasks);

  // Android share sheet draft (see shareTarget.ts). The text is staged by the
  // store and moved into the composer below - it is never sent automatically.
  const pendingComposerText = useAppStore((s) => s.pendingComposerText);
  const setPendingComposerText = useAppStore((s) => s.setPendingComposerText);
  const pendingShareNotice = useAppStore((s) => s.pendingShareNotice);
  const setPendingShareNotice = useAppStore((s) => s.setPendingShareNotice);
  const pendingSharedImage = useAppStore((s) => s.pendingSharedImage);
  const setPendingSharedImage = useAppStore((s) => s.setPendingSharedImage);

  const [inputVal, setInputVal] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Latest composer text for the flush paths below. Null until the restore (or
  // the first edit) has run, so a flush in the render->effect gap can never
  // erase a stored draft or write an empty value over it.
  const draftRef = useRef<string | null>(null);

  // The conversation the composer currently belongs to. Drafts are stored per
  // session, so this is also the key every save/flush below writes to.
  const composerSessionId = operatingMode === 'agent' ? activeAgentSessionId : activeChatSessionId;
  const draftSessionRef = useRef(composerSessionId);

  // Clears the stored draft and the ref together: a flush that lands between a
  // send and the next debounced save must not write the sent prompt back.
  const discardComposerDraft = () => {
    draftRef.current = '';
    clearComposerDraft(draftSessionRef.current);
  };

  // Restore an unsent draft left behind by a killed WebView, after mount and
  // never in the initializer: reading localStorage during the first render
  // would make the client HTML differ from the prerendered export (the
  // hydration mismatch already fixed for bookmarks). The composer simply
  // starts empty and fills one tick later, as if the user had typed it.
  useEffect(() => {
    const sessionId = draftSessionRef.current;
    const storedDraft = loadComposerDraft(sessionId);
    if (!storedDraft) return;
    // Only fill an empty composer, and keep the ref in step with it so a
    // hide/reload before the save effect runs still flushes the real text.
    draftRef.current = storedDraft;
    setInputVal((prev) => (prev.trim() ? prev : storedDraft));
  }, []);

  // Switching conversation swaps the composer text with it: a prompt started
  // in one chat must never follow the user into another, and coming back
  // restores what was typed there. The outgoing text is parked under its own
  // session before the ref moves, so the save effect below cannot write it
  // over the incoming draft.
  useEffect(() => {
    const previousSession = draftSessionRef.current;
    if (previousSession === composerSessionId) return;
    if (draftRef.current !== null) saveComposerDraft(previousSession, draftRef.current);
    draftSessionRef.current = composerSessionId;
    const nextDraft = loadComposerDraft(composerSessionId);
    draftRef.current = nextDraft;
    setInputVal(nextDraft);
    setSharedDraftHint(false);
  }, [composerSessionId]);

  // A draft written by the previous build sits under one global key. Wait
  // until session persistence has hydrated so the restored active conversation
  // adopts it instead of migrating into the pre-hydration default session.
  useEffect(() => {
    if (!sessionsHydrated) return;
    const legacyDraft = loadLegacyComposerDraft();
    if (!legacyDraft) return;
    const existing = loadComposerDraft(composerSessionId);
    if (!existing) {
      saveComposerDraft(composerSessionId, legacyDraft);
      draftRef.current = legacyDraft;
      setInputVal((prev) => (prev.trim() ? prev : legacyDraft));
    }
    clearLegacyComposerDraft();
  }, [sessionsHydrated, composerSessionId]);

  // Keep the stored draft in sync with the composer, one write per typing
  // pause instead of one per keystroke (localStorage is synchronous on the
  // WebView thread). The ref holds the latest text so the flush below can
  // write it without a pending timer. Skip the mount commit so the initial
  // empty inputVal cannot overwrite a draft just restored above.
  const didMountInputEffectRef = useRef(false);
  useEffect(() => {
    if (!didMountInputEffectRef.current) {
      didMountInputEffectRef.current = true;
      return;
    }
    draftRef.current = inputVal;
    const sessionId = draftSessionRef.current;
    const timer = setTimeout(() => saveComposerDraft(sessionId, inputVal), 500);
    return () => clearTimeout(timer);
  }, [inputVal]);

  // Android can stop JS timers the moment the app is hidden and then kill the
  // process, which would drop the last keys typed before the user switched
  // away. Flush whenever the app leaves the foreground, and on unmount (the
  // Chat tab unmounts when another tab is opened), so the last <500 ms of
  // typing is not rolled back on return.
  useEffect(() => {
    const flushDraft = () => {
      if (draftRef.current === null) return;
      saveComposerDraft(draftSessionRef.current, draftRef.current);
    };
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flushDraft();
    };
    if (typeof window !== 'undefined') window.addEventListener('pagehide', flushDraft);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushDraft);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flushDraft();
    };
  }, []);

  // True after a share landed in the composer, until the user dismisses the
  // "review and send" hint above it.
  const [sharedDraftHint, setSharedDraftHint] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  // "More tools" dropdown for the Row-2 secondary actions (decluttering PR:
  // one overflow menu instead of ten always-visible buttons).
  const [showMoreTools, setShowMoreTools] = useState(false);
  // "Quick Actions" dropdown for the former scroller chips above the composer.
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  // Close model picker dropdown on outside click
  useEffect(() => {
    if (!showModelPicker) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    if (typeof document !== 'undefined') document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showModelPicker]);

  // Share-sheet draft: text shared from another app is inserted as an unsent
  // draft and focused, so the user can read and edit it first. Nothing is
  // sent here on purpose - pressing Send stays the user's decision.
  useEffect(() => {
    const shared = pendingComposerText;
    if (!shared) return;
    // One frame later, so the composer is laid out (and focusable) and this
    // effect's own store write cannot race the text it is inserting.
    const frame = requestAnimationFrame(() => {
      // Append instead of replace: a draft the user was already typing
      // survives the share (same rule as the Insert-into-chat actions below).
      // Skip an exact repeat: after the process is killed the persisted draft
      // can already hold this share, and appending it again would duplicate it.
      setInputVal((prev) => {
        const current = prev.trim();
        if (!current) return shared;
        if (current === shared.trim()) return prev;
        return `${prev}\n\n${shared}`;
      });
      // Delivered once: clearing the store copy keeps a re-render or a tab
      // switch from pasting the same share a second time.
      setPendingComposerText(null);
      setSharedDraftHint(true);
      const el = composerRef.current;
      if (!el) return;
      try {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      } catch (_) {
        // Focusing a not-yet-visible textarea is not worth an error boundary.
      }
    });
    // An unmount before that frame must not leave the insert half-done: the
    // store copy stays, so the next mount still gets the draft.
    return () => cancelAnimationFrame(frame);
  }, [pendingComposerText, setPendingComposerText]);

  // Share-sheet photo: a Gallery share becomes an unsent attachment on the
  // composer, right next to the text draft path above. Nothing is sent here -
  // the user still chooses the photo's prompt and presses send. The store copy
  // is cleared first so a re-render, a tab switch or a second mount cannot
  // attach the same photo twice.
  useEffect(() => {
    const image = pendingSharedImage;
    if (!image) return;
    setPendingSharedImage(null);
    // base64 is 4 characters per 3 bytes; the header is negligible but the
    // padding is not, so an approximate byte count is honest enough for the tray.
    const sizeBytes = Math.max(0, Math.round(((image.dataUrl.length - image.dataUrl.indexOf(',') - 1) * 3) / 4));
    const added = addAttachment({
      id: `share-image-${image.receivedAt || Date.now()}`,
      type: 'image',
      name: image.name || 'shared-photo.jpg',
      dataUrl: image.dataUrl,
      mimeType: image.mimeType || 'image/jpeg',
      sizeBytes,
    });
    if (!added) {
      // The tray already holds the maximum count or payload: say so instead of
      // dropping the photo silently.
      setUploadError('That photo could not be attached: the attachment tray is full. Remove an item and share the photo again.');
      return;
    }
    setSharedDraftHint(true);
    triggerHaptic('selection');
  }, [pendingSharedImage, setPendingSharedImage, addAttachment]);

  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [modelCategoryFilter, setModelCategoryFilter] = useState<'all' | 'ready' | 'vision' | 'agent' | 'text' | 'code'>('all');
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [modelPromptDownload, setModelPromptDownload] = useState<ModelSpec | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  // Search & Message Actions
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [isScrolledDown, setIsScrolledDown] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  // navigator.share exists on Android but not in the server renderer. Reading
  // it during render made the client message bar differ from the server HTML.
  const [canShareReply, setCanShareReply] = useState(false);
  const [activeFallbackTooltipId, setActiveFallbackTooltipId] = useState<string | null>(null);
  // Honest feedback when a picked file cannot be read (e.g. the file was moved
  // by another app, a virtual document URI, or a low-memory read failure).
  // Without this the picker clears and the file is silently skipped, so the
  // user thinks it is attached and sends a prompt with no document.
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [thermalTelemetry, setThermalTelemetry] = useState<ThermalTelemetry>(() => getThermalTelemetry());

  // Persisted bookmark ids are applied after mount. Reading localStorage in
  // the initializer made the first client render differ from the prerendered
  // HTML whenever the user had bookmarks.
  const [starredMessageIds, setStarredMessageIds] = useState<string[]>([]);
  const [showBookmarksDrawer, setShowBookmarksDrawer] = useState(false);
  const [bookmarkSearchQuery, setBookmarkSearchQuery] = useState('');

  const handleJumpToBookmarkedMessage = (msgId: string) => {
    setShowBookmarksDrawer(false);
    triggerHaptic(20);
    setTimeout(() => {
      const el = document.getElementById(`msg-${msgId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-amber-400');
        setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400'), 2000);
      }
    }, 150);
  };
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isCompressorModalOpen, setIsCompressorModalOpen] = useState(false);
  const [isSensorModalOpen, setIsSensorModalOpen] = useState(false);
  const [isClipboardVaultOpen, setIsClipboardVaultOpen] = useState(false);
  const [isPhraseBookOpen, setIsPhraseBookOpen] = useState(false);
  const [isNetworkSpeedOpen, setIsNetworkSpeedOpen] = useState(false);
  const [isNotepadOpen, setIsNotepadOpen] = useState(false);
  const [isQRCodeStudioOpen, setIsQRCodeStudioOpen] = useState(false);
  const [isVoiceCallOpen, setIsVoiceCallOpen] = useState(false);
  const [chatFontSize, setChatFontSizeState] = useState<ChatFontSize>('normal');
  const activeFontSizeOption = CHAT_FONT_SIZE_OPTIONS.find((o) => o.id === chatFontSize) || CHAT_FONT_SIZE_OPTIONS[1];

  // AI Code Playground & Sandbox State
  const [isCodeSandboxOpen, setIsCodeSandboxOpen] = useState(false);
  const [sandboxInitialCode, setSandboxInitialCode] = useState<string>('');

  // Quote-Reply Interaction State
  const [quotedMessage, setQuotedMessage] = useState<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    senderName: string;
    snippet: string;
  } | null>(null);

  const handleQuoteMessage = (msg: ChatMessage) => {
    triggerHaptic(20);
    const snippet = msg.content.length > 140 ? msg.content.slice(0, 140) + '...' : msg.content;
    setQuotedMessage({
      id: msg.id,
      role: msg.role,
      senderName: msg.role === 'user' ? 'You' : msg.modelUsed || 'Hermes AI',
      snippet,
    });
  };

  // Swipe-to-quote & Mobile Touch Gesture State
  const [swipingMsgId, setSwipingMsgId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number; msgId: string } | null>(null);
  const lastTapRef = useRef<{ msgId: string; time: number }>({ msgId: '', time: 0 });

  const handleTouchStart = (msgId: string, e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) {
      touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now(), msgId };
    }
  };

  const handleTouchMove = (msgId: string, e: React.TouchEvent) => {
    if (!touchStartRef.current || touchStartRef.current.msgId !== msgId) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    // Only capture horizontal swipes when predominantly horizontal and moved > 12px
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) {
      setSwipingMsgId(msgId);
      // Soft-resistance clamp between -75 and 75
      const clamped = Math.max(-75, Math.min(75, dx));
      setSwipeOffset(clamped);
    }
  };

  const handleTouchEnd = (msg: ChatMessage) => {
    const start = touchStartRef.current;
    const currentOffset = swipeOffset;
    touchStartRef.current = null;
    setSwipingMsgId(null);
    setSwipeOffset(0);

    if (start && start.msgId === msg.id) {
      // Threshold >= 42px triggers Quote-reply
      if (Math.abs(currentOffset) >= 42) {
        handleQuoteMessage(msg);
        triggerHaptic(25);
        return;
      }

      // Check double-tap
      const now = Date.now();
      if (
        lastTapRef.current.msgId === msg.id &&
        now - lastTapRef.current.time < 320 &&
        Math.abs(currentOffset) < 10
      ) {
        toggleStarMessage(msg.id);
        triggerHaptic('bookmark');
        lastTapRef.current = { msgId: '', time: 0 };
        return;
      }
      lastTapRef.current = { msgId: msg.id, time: now };
    }
  };

  const handleRunInSandbox = (text: string) => {
    const match = text.match(/```(?:html|javascript|js|css|svg)?\s*([\s\S]*?)```/);
    if (match && match[1]) {
      setSandboxInitialCode(match[1].trim());
    } else {
      setSandboxInitialCode(text.trim());
    }
    setIsCodeSandboxOpen(true);
    triggerHaptic('code_exec');
  };

  // Markdown Table & Spreadsheet Modal State
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [tableModalMarkdown, setTableModalMarkdown] = useState<string>('');

  const handleOpenTableModal = (content: string) => {
    setTableModalMarkdown(content);
    setIsTableModalOpen(true);
    triggerHaptic(20);
  };

  // LaTeX Math Formula & Step-by-Step Solver Modal State
  const [isMathModalOpen, setIsMathModalOpen] = useState(false);
  const [mathModalLatex, setMathModalLatex] = useState<string>('');

  const handleOpenMathModal = (content: string) => {
    const match = content.match(/\$\$([\s\S]*?)\$\$/) || content.match(/\\\[([\s\S]*?)\\\]/);
    if (match && match[1]) {
      setMathModalLatex(match[1].trim());
    } else {
      setMathModalLatex(content.trim());
    }
    setIsMathModalOpen(true);
    triggerHaptic(20);
  };

  // Offline Presentation Slide Deck State
  const [isSlideDeckOpen, setIsSlideDeckOpen] = useState(false);
  const [slideDeckContent, setSlideDeckContent] = useState('');
  const [slideDeckTitle, setSlideDeckTitle] = useState('Hermes Neural Presentation');

  const handleOpenSlideDeck = (content: string) => {
    setSlideDeckContent(content);
    setSlideDeckTitle('Hermes AI Presentation');
    setIsSlideDeckOpen(true);
    triggerHaptic(20);
  };

  // Smart Prompt Snippets & System Directives State
  interface PromptSnippet {
    id: string;
    category: 'all' | 'reasoning' | 'code' | 'productivity' | 'mobile' | 'custom';
    title: string;
    directive: string;
  }

  const BUILTIN_SNIPPETS: PromptSnippet[] = [
    {
      id: 'deep-reasoning',
      category: 'reasoning',
      title: '🧠 Deep Step-by-Step Reasoner',
      directive: 'Analyze this problem deeply using first-principles reasoning. Show comprehensive chain-of-thought analysis before providing the final concise conclusion.',
    },
    {
      id: 'code-review',
      category: 'code',
      title: '🛡️ Rigorous Bug & Edge-Case Review',
      directive: 'Review the following code with extreme scrutiny. Identify race conditions, memory leaks, null pointer dereferences, security vulnerabilities, and propose optimized fixes.',
    },
    {
      id: 'strict-json',
      category: 'code',
      title: '📦 Strict JSON Data Extractor',
      directive: 'Parse the input and output strictly as a single valid JSON object with typed fields and zero markdown conversational filler.',
    },
    {
      id: 'exec-summary',
      category: 'productivity',
      title: '📊 Executive 3-Bullet Briefing',
      directive: 'Distill the key points into a high-level executive summary: 1) Core Challenge, 2) Strategic Action, 3) Measurable Outcome.',
    },
    {
      id: 'meeting-minutes',
      category: 'productivity',
      title: '📝 Meeting Action Items & Owners',
      directive: 'Format the following notes into a structured Markdown table with columns: Action Item, Owner, Deadline, and Priority.',
    },
    {
      id: 'device-audit',
      category: 'mobile',
      title: '📱 Mobile Diagnostics & WebGPU Check',
      directive: 'Perform a full system audit checking battery thermal levels, WebGPU tensor engine status, and local model memory footprint.',
    },
    {
      id: 'refactor-clean',
      category: 'code',
      title: '⚡ Code Optimizer & Modern Refactor',
      directive: 'Refactor this code to follow modern idiomatic design patterns, eliminate redundancy, and improve computational performance.',
    },
    {
      id: 'eli5-concept',
      category: 'reasoning',
      title: '💡 Explain Like I\'m 5 (ELI5)',
      directive: 'Explain this complex technical concept using simple, intuitive everyday real-world analogies suitable for a beginner.',
    },
  ];

  const [showSnippetsDrawer, setShowSnippetsDrawer] = useState(false);
  const [snippetCategory, setSnippetCategory] = useState<string>('all');

  // Android hardware back closes the top-most inline overlay (download
  // prompt, bookmarks drawer, snippets drawer) before exiting the app.
  useBackButtonClose(modelPromptDownload !== null, () => setModelPromptDownload(null));
  useBackButtonClose(showBookmarksDrawer, () => setShowBookmarksDrawer(false));
  useBackButtonClose(showSnippetsDrawer, () => setShowSnippetsDrawer(false));
  // The full-screen dropdown backdrops count
  // as overlays too: back dismisses them instead of exiting the app.
  useBackButtonClose(showModelPicker, () => setShowModelPicker(false));
  useBackButtonClose(showMoreTools, () => setShowMoreTools(false));
  useBackButtonClose(showQuickActions, () => setShowQuickActions(false));

  const [customSnippets, setCustomSnippets] = useState<PromptSnippet[]>([]);
  const [isAddingSnippet, setIsAddingSnippet] = useState(false);
  const [newSnippetTitle, setNewSnippetTitle] = useState('');
  const [newSnippetDirective, setNewSnippetDirective] = useState('');

  const handleSaveCustomSnippet = () => {
    if (!newSnippetTitle.trim() || !newSnippetDirective.trim()) return;
    const snippet: PromptSnippet = {
      id: `custom-${Date.now()}`,
      category: 'custom',
      title: newSnippetTitle.trim(),
      directive: newSnippetDirective.trim(),
    };
    const next = [snippet, ...customSnippets];
    setCustomSnippets(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('hermes_custom_snippets', JSON.stringify(next));
      } catch (_) {}
    }
    setNewSnippetTitle('');
    setNewSnippetDirective('');
    setIsAddingSnippet(false);
  };

  const handleDeleteCustomSnippet = (id: string) => {
    const next = customSnippets.filter((s) => s.id !== id);
    setCustomSnippets(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('hermes_custom_snippets', JSON.stringify(next));
      } catch (_) {}
    }
  };

  const handleInsertSnippet = (directive: string) => {
    setInputVal((prev) => (prev ? `${prev}\n\n${directive}` : directive));
    setShowSnippetsDrawer(false);
    triggerHaptic(20);
  };

  const handleExecuteSnippetNow = (directive: string) => {
    setShowSnippetsDrawer(false);
    triggerHaptic(30);
    dispatchPromptSafely(directive);
  };

  const toggleStarMessage = (msgId: string) => {
    const next = starredMessageIds.includes(msgId)
      ? starredMessageIds.filter((id) => id !== msgId)
      : [...starredMessageIds, msgId];
    setStarredMessageIds(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('hermes_starred_msgs', JSON.stringify(next));
      } catch (_) {}
    }
  };

  const QUICK_PROMPTS = [
    { label: '🚀 Hardware Diagnostic', prompt: 'Audit all device hardware, RAM usage, and WebGPU tensor acceleration.' },
    { label: '🎨 Cyberpunk Art', prompt: 'Generate an ultra-detailed FLUX digital illustration of a futuristic android operating a quantum terminal in neo-Tokyo.' },
    { label: '🔍 Extract & Summarize', prompt: 'Find recent document files on device, analyze their contents, and generate an executive summary.' },
    { label: '🎙️ Kokoro Voice Brief', prompt: 'Summarize today\'s offline device status and prepare a voice briefing script.' },
  ];

  const [copyMenuMsgId, setCopyMenuMsgId] = useState<string | null>(null);

  const handleCopyMessage = async (
    msgId: string,
    content: string,
    format: 'plain' | 'markdown' | 'attributed' = 'plain',
    modelName?: string
  ) => {
    const formatted = formatMessageForCopy(content, {
      format,
      modelName,
      timestamp: new Date().toLocaleString(),
    });
    const success = await copyToClipboardSafe(formatted, {
      saveToVault: true,
      modelName,
    });
    if (success) {
      setCopiedMessageId(msgId);
      triggerHaptic('success');
      setTimeout(() => setCopiedMessageId((cur) => (cur === msgId ? null : cur)), 2000);
    }
    setCopyMenuMsgId(null);
  };

  const handleShareMessage = async (msgId: string, content: string) => {
    const outcome = await shareTextToApps(content, 'Shared from Hermes');
    // The chooser itself is the confirmation: it opens on top of the app, so
    // there is no honest "sent" state to show afterwards. A cancelled sheet
    // needs no follow-up, and no target at all falls back to the copy button.
    if (outcome === 'shared') {
      triggerHaptic('success');
      return;
    }
    if (outcome === 'unavailable') await handleCopyMessage(msgId, content);
  };

  const handleSpeakMessage = (msgId: string, content: string) => {
    if (isSpeaking && speakingMessageId === msgId) {
      stopSpeaking();
      setSpeakingMessageId(null);
    } else {
      setSpeakingMessageId(msgId);
      const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      speakText(cleaned);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechSession | null>(null);

  // Mobile UX: soft keyboard awareness (Capacitor Android WebView) + jump-to-latest tracking
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
  const [unreadStreamingTokens, setUnreadStreamingTokens] = useState(0);
  const lastContentLengthRef = useRef(0);
  const lastKeyboardHeightRef = useRef(0);

  // Keyboard-aware composer: when the visual viewport is shorter than the layout
  // viewport by more than ~120px, treat the gap as the soft keyboard height so the
  // composer can pad itself up and stay visible above the keyboard. The gap is
  // quantized in >=16px steps (vs a ref of the last applied value) so the per-frame
  // resize/scroll events during the keyboard open/close animation do not re-render
  // the whole view each frame, and pinch-zoom (scale > 1) is ignored because it
  // also shrinks the visual viewport without a keyboard.
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const updateKeyboardHeight = () => {
      const keyboardGap = viewport.scale <= 1 ? window.innerHeight - viewport.height : 0;
      const next = keyboardGap > 120 ? keyboardGap : 0;
      if (Math.abs(next - lastKeyboardHeightRef.current) >= 16) {
        lastKeyboardHeightRef.current = next;
        setKeyboardHeight(next);
      }
    };
    updateKeyboardHeight();
    if (typeof viewport !== 'undefined') viewport.addEventListener('resize', updateKeyboardHeight);
    if (typeof viewport !== 'undefined') viewport.addEventListener('scroll', updateKeyboardHeight);
    return () => {
      viewport.removeEventListener('resize', updateKeyboardHeight);
      viewport.removeEventListener('scroll', updateKeyboardHeight);
    };
  }, []);

  // Current session & messages depending on operating mode
  const currentSession = operatingMode === 'agent'
    ? agentSessions[activeAgentSessionId] || Object.values(agentSessions)[0]
    : chatSessions[activeChatSessionId] || Object.values(chatSessions)[0];

  const messages = currentSession?.messages || EMPTY_MESSAGES;
  const currentModel = AVAILABLE_MODELS.find((m) => m.id === selectedModelId);

  // The starred-ids list is global across all chat and agent sessions, but the
  // bookmarks drawer used to filter only the CURRENT session's messages: stars
  // saved in another session (or in a since-cleared one) produced a non-zero
  // badge over an empty list, and could never be viewed or removed again.
  // Resolve every starred id across both session trees instead.
  const allStarredMessages = React.useMemo(
    () =>
      [...Object.values(chatSessions), ...Object.values(agentSessions)]
        .flatMap((s) => s.messages)
        .filter((m) => starredMessageIds.includes(m.id)),
    [chatSessions, agentSessions, starredMessageIds]
  );

  // Hoisted last-assistant lookup: previously an O(n) messages.filter ran inside
  // the per-message render map, making every streaming re-render O(n^2).
  const lastAssistantId = React.useMemo(
    () => messages.filter((m) => m.role === 'assistant' && !m.isStreaming).at(-1)?.id,
    [messages]
  );

  const activeSessionKey = operatingMode === 'agent' ? activeAgentSessionId : activeChatSessionId;
  const initialWindowSize = React.useMemo(() => (isCriticalMemoryPressure() ? 25 : 40), []);
  const [messagesWindowLimit, setMessagesWindowLimit] = useState<number>(initialWindowSize);

  // Reset window limit when switching conversations so large historical chats don't cause DOM spike
  React.useEffect(() => {
    setMessagesWindowLimit(initialWindowSize);
  }, [activeSessionKey, initialWindowSize]);

  const isSearching = searchQuery.trim().length > 0;
  const filteredMessages = isSearching
    ? messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()) || m.role.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const matchingMessageIds = React.useMemo(() => {
    if (!isSearching) return [];
    return filteredMessages.map((m) => m.id);
  }, [isSearching, filteredMessages]);

  const handleNavigateSearchMatch = (direction: 'next' | 'prev') => {
    if (matchingMessageIds.length === 0) return;
    triggerHaptic(15);
    const nextIdx =
      direction === 'next'
        ? (searchMatchIndex + 1) % matchingMessageIds.length
        : (searchMatchIndex - 1 + matchingMessageIds.length) % matchingMessageIds.length;
    setSearchMatchIndex(nextIdx);
    const targetId = matchingMessageIds[nextIdx];
    const msgEl = document.getElementById(`msg-${targetId}`);
    if (msgEl) {
      msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const hasEarlierMessages = !isSearching && messages.length > messagesWindowLimit;
  const hiddenCount = hasEarlierMessages ? messages.length - messagesWindowLimit : 0;
  const visibleMessages = hasEarlierMessages ? messages.slice(-messagesWindowLimit) : filteredMessages;

  // Models available for direct selection (category browsing consolidated in ModelHub)
  const readyModels = AVAILABLE_MODELS.filter((m) => downloads[m.id]?.isReady);
  const unreadyModels = AVAILABLE_MODELS.filter((m) => {
    if (downloads[m.id]?.isReady) return false;
    const fitsRam = !hardwareProfile || hardwareProfile.estimatedRamGB >= m.minRamGB;
    const fitsGpu = m.engine === 'cpu-wasm' || !hardwareProfile || hardwareProfile.hasWebGpu;
    return fitsRam && fitsGpu;
  });

  const contextWindow = currentModel?.contextWindow || 4096;
  const approxContextTokens = React.useMemo(() => {
    let charCount = 0;
    for (const m of messages) {
      charCount += m.content ? m.content.length : 0;
    }
    return Math.round(charCount / 4);
  }, [messages]);

  const contextPercent = Math.min(100, Math.round((approxContextTokens / contextWindow) * 100));
  const isContextNearCapacity = contextPercent >= 75 && messages.length > 6;
  const [contextTrimToast, setContextTrimToast] = useState<string | null>(null);

  const handleTrimContext = () => {
    if (!currentSession || messages.length <= 6) return;
    triggerHaptic([30, 40]);
    const firstMsg = messages[0];
    const tailMsgs = messages.slice(-6);
    const trimmed = [firstMsg, ...tailMsgs.filter((m) => m.id !== firstMsg.id)];
    const targetSessionId = currentSession.id;
    useAppStore.getState().replaceSessionMessages(
      targetSessionId,
      trimmed,
      operatingMode === 'agent' ? 'agent' : 'chat'
    );
    setContextTrimToast(`Context trimmed: freed ${messages.length - trimmed.length} older messages from KV cache!`);
    setTimeout(() => setContextTrimToast(null), 3500);
  };

  const [isCheckingConnection, setIsCheckingConnection] = useState(false);

  const handleRetryConnection = async () => {
    setIsCheckingConnection(true);
    triggerHaptic(15);
    try {
      let isUp = typeof navigator !== 'undefined' ? navigator.onLine : false;
      if (isUp) {
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 2500);
          await fetch('https://clients3.google.com/generate_204', {
            mode: 'no-cors',
            signal: ctrl.signal,
          });
          clearTimeout(tid);
          isUp = true;
        } catch (_) {
          isUp = typeof navigator !== 'undefined' ? navigator.onLine : false;
        }
      }
      if (isUp) {
        useAppStore.setState({ isOnline: true, justReconnected: true, networkQuality: 'fast' });
        triggerHaptic([30, 50]);
        setTimeout(() => {
          useAppStore.setState({ justReconnected: false });
        }, 4000);
      } else {
        triggerHaptic(60);
      }
    } finally {
      setIsCheckingConnection(false);
    }
  };

  const handleSwitchToOfflineModel = () => {
    const firstReady = readyModels[0];
    if (firstReady) {
      triggerHaptic(20);
      setSelectedModelId(firstReady.id);
      if (firstReady.category === 'image') {
        setOperatingMode('image-gen');
      } else if (firstReady.category === 'vision') {
        setOperatingMode('vision');
      } else if (firstReady.category === 'voice') {
        setOperatingMode('voice');
      } else if (firstReady.category === 'embedding') {
        setOperatingMode('embedding');
      } else if (firstReady.capabilities.includes('agent')) {
        setOperatingMode('agent');
      } else {
        setOperatingMode('chat');
      }
    } else {
      setShowModelPicker(true);
      triggerHaptic(20);
    }
  };

  // Filtered models for Quick Model Switcher Sheet
  const filteredModels = AVAILABLE_MODELS.filter((m) => {
    const q = modelSearchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.tagline.toLowerCase().includes(q) ||
      m.parameters.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (modelCategoryFilter === 'ready') return downloads[m.id]?.isReady;
    if (modelCategoryFilter === 'vision') return m.category === 'vision' || m.capabilities.includes('vision');
    if (modelCategoryFilter === 'agent') return m.capabilities.includes('agent');
    if (modelCategoryFilter === 'text') return m.category === 'text';
    if (modelCategoryFilter === 'code') return m.capabilities.includes('code');
    return true;
  });

  // Auto-dismiss the floating fallback notification after 9 seconds so it doesn't linger indefinitely
  React.useEffect(() => {
    if (fallbackNotice) {
      const timer = setTimeout(() => {
        clearFallbackNotice();
      }, 9000);
      return () => clearTimeout(timer);
    }
  }, [fallbackNotice, clearFallbackNotice]);

  React.useEffect(() => {
    return subscribeThermalTelemetry(setThermalTelemetry);
  }, []);

  // Re-check distance-from-bottom when messages grow without a scroll event
  // (e.g. streaming chunks extend the timeline) so isAwayFromBottom stays accurate.
  React.useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    setIsAwayFromBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
  }, [messages.length, currentSession?.id]);

  // Auto-scroll to the newest message, but only when the user is near the bottom:
  // never yank the timeline down mid-read while streaming.
  // Use instant scroll (el.scrollTop = el.scrollHeight) during streaming to eliminate
  // animation frame backlogs that lag mobile WebViews, and smooth scroll for normal arrivals.
  const prevSessionIdRef = useRef<string | null>(null);
  React.useEffect(() => {
    if (prevSessionIdRef.current !== currentSession?.id) {
      prevSessionIdRef.current = currentSession?.id ?? null;
      setIsAwayFromBottom(false);
    }
    if (isAwayFromBottom) return;
    const el = messagesContainerRef.current;
    if (el) {
      if (isGenerating) {
        el.scrollTop = el.scrollHeight;
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages, isGenerating, isAwayFromBottom, currentSession?.id]);

  // Track tokens streamed while scrolled away from the bottom
  React.useEffect(() => {
    if (!isGenerating) {
      setUnreadStreamingTokens(0);
      lastContentLengthRef.current = 0;
      return;
    }
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
      const curLen = lastMsg.content.length;
      if (isAwayFromBottom) {
        const diff = Math.max(0, curLen - lastContentLengthRef.current);
        const approxTokens = Math.round(diff / 4);
        if (approxTokens > 0) {
          setUnreadStreamingTokens((prev) => prev + approxTokens);
        }
      }
      lastContentLengthRef.current = curLen;
    }
  }, [messages, isGenerating, isAwayFromBottom]);

  // Contextual Haptic Feedback on Generation Completion
  const prevIsGeneratingRef = useRef(false);
  React.useEffect(() => {
    if (prevIsGeneratingRef.current && !isGenerating) {
      triggerHaptic('complete');
    }
    prevIsGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // WhatsApp-Style Voice Note State
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordDurationSec, setRecordDurationSec] = useState(0);
  // Microphone permanently denied (Android auto-denies silently after that):
  // the composer shows an honest notice with the app-settings way out.
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  // Real recognizer failure text (no service, network, audio). Shown above the
  // recording bar instead of silently sending an untranscribed note.
  const [speechInputError, setSpeechInputError] = useState<string | null>(null);
  // True only after the recognizer announced it is really listening.
  const [speechListening, setSpeechListening] = useState(false);
  const [activeAudioPlayingId, setActiveAudioPlayingId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Incremented on every cancel/send/unmount. A getUserMedia promise that
  // resolves after any of those must release its stream instead of recording.
  const voiceRequestIdRef = useRef(0);
  const isVoiceMountedRef = useRef(true);
  const isFinalizingVoiceRef = useRef(false);
  const voiceTimerRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const currentTranscriptRef = useRef<string>('');

  // Audio Analyser & Real-Time Waveform State
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceDetectorRef = useRef<SilenceDetector | null>(null);
  const [waveformBars, setWaveformBars] = useState<number[]>([25, 45, 60, 35, 70, 50, 85, 60, 45, 75, 50, 65, 35]);
  const [isAutoSendOnSilence, setIsAutoSendOnSilence] = useState(true);
  const [currentAudioDb, setCurrentAudioDb] = useState<number>(0);
  const [noiseGateThreshold, setNoiseGateThreshold] = useState<number>(18);

  // Apply persisted preferences after hydration so the first paint matches the
  // server HTML. These values only feed controls/drawers, never the boot UI.
  useEffect(() => {
    try {
      const savedStarred = JSON.parse(window.localStorage.getItem('hermes_starred_msgs') || '[]');
      if (Array.isArray(savedStarred)) setStarredMessageIds(savedStarred);
    } catch (_) {}
    setChatFontSizeState(getChatFontSize());
    try {
      const savedSnippets = JSON.parse(window.localStorage.getItem('hermes_custom_snippets') || '[]');
      if (Array.isArray(savedSnippets)) setCustomSnippets(savedSnippets);
    } catch (_) {}
    setNoiseGateThreshold(getStoredNoiseGateThreshold(18));
    setCanShareReply(canShareToApps());
  }, []);
  const [showNoiseGateSettings, setShowNoiseGateSettings] = useState(false);

  const cleanupAudioVisualizer = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      } catch (_) {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    silenceDetectorRef.current?.clear();
  };

  // Release every voice-capture resource when this view goes away, including a
  // getUserMedia request that is still pending at unmount time.
  React.useEffect(() => {
    isVoiceMountedRef.current = true;
    return () => {
      isVoiceMountedRef.current = false;
      cleanupAudioVisualizer();
      const store = useAppStore.getState();
      // A generation still running must be REALLY stopped, not cosmetically
      // marked: the old hand-rolled surgery left the inference loop alive in
      // the background (CPU/GPU/battery burn), the next throttled store flush
      // overwrote the "*[Stopped: view unmounted]*" marker and resurrected
      // isStreaming, and isGenerating was force-false so a second generation
      // could be started on return with no Stop button. Aborting inference
      // makes sendMessage's own catch/finally finalize the streaming message
      // coherently and reset flags - without the emergency-stop's side effect
      // of killing an unrelated background model download in progress.
      if (store.isGenerating) {
        try { abortAllInference(); } catch (_) {}
      }
      voiceRequestIdRef.current++;
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
        recognitionRef.current = null;
      }
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        // A send already waiting for onstop owns the recorder; stopping it here
        // would discard the final chunk. Its own finish() releases the tracks.
        if (!isFinalizingVoiceRef.current) {
          try { if (recorder.state !== 'inactive') recorder.stop(); } catch (_) {}
          try { recorder.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
          mediaRecorderRef.current = null;
        }
      }
      if (!isFinalizingVoiceRef.current) audioChunksRef.current = [];
      // A playing voice note must not survive a tab switch: pause it, detach
      // its handlers and drop the data URL from memory.
      const audio = audioPlayerRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        try { audio.pause(); } catch (_) {}
        try { audio.src = ''; } catch (_) {}
        audioPlayerRef.current = null;
      }
    };
  }, []);

  // Cooperative memory cleanup listener: on backgrounding or memory pressure spikes,
  // shed historical DOM elements back to compact window, clean visualizers, and flush persistence.
  React.useEffect(() => {
    const handleMemoryCleanup = () => {
      setMessagesWindowLimit(20);
      cleanupAudioVisualizer();
      flushPersistNow();
    };
    if (typeof window !== 'undefined') window.addEventListener('hermes:memory-cleanup', handleMemoryCleanup);
    return () => {
      window.removeEventListener('hermes:memory-cleanup', handleMemoryCleanup);
    };
  }, []);

  // Start WhatsApp-Style Voice Recording
  const startWhatsAppVoiceRecording = async () => {
    if (typeof window === 'undefined') return;
    // Re-entry guard: once the recording bar is up a second tap must not
    // start a second request while the first is live.
    if (isRecordingVoice) return;

    const requestId = ++voiceRequestIdRef.current;
    const isCurrent = () => isVoiceMountedRef.current && voiceRequestIdRef.current === requestId;
    const releaseStream = (stream: MediaStream) => {
      try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    };

    audioChunksRef.current = [];
    currentTranscriptRef.current = '';
    setRecordDurationSec(0);
    setMicPermissionDenied(false);

    // Explicitly check / prompt for microphone permission if supported
    try {
      if (navigator.permissions && navigator.permissions.query) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const permStatus = await navigator.permissions.query({ name: 'microphone' as any });
        if (permStatus.state === 'denied') {
          // Already permanently denied: the native dialog will not reappear.
          // Say so with the settings way out instead of a bare alert.
          setMicPermissionDenied(true);
          return;
        }
      }
    } catch (_) {}

    // 1. Real speech-to-text through the native recognizer, or the browser's
    // Web Speech API on desktop. Android System WebView has no
    // `SpeechRecognition` at all; `HermesSTT` drives
    // android.speech.SpeechRecognizer instead, so dictation finally produces
    // text inside the installed app.
    setSpeechInputError(null);
    setSpeechListening(false);
    const speechSession = createSpeechInputSession(
      {
        onStart: () => {
          if (!isCurrent()) return;
          setSpeechListening(true);
          setSpeechInputError(null);
        },
        onUpdate: ({ finalText, interimText }) => {
          if (!isCurrent()) return;
          const live = `${finalText}${interimText ? (finalText ? ' ' : '') + interimText : ''}`.trim();
          currentTranscriptRef.current = finalText;
          if (live) setInputVal(live);
          if (isAutoSendOnSilence) silenceDetectorRef.current?.reset();
        },
        onFinal: (text) => {
          if (!isCurrent()) return;
          const clean = text.trim();
          if (!clean) return;
          currentTranscriptRef.current = currentTranscriptRef.current
            ? `${currentTranscriptRef.current} ${clean}`
            : clean;
          setInputVal(currentTranscriptRef.current);
        },
        onError: (failure) => {
          if (!isCurrent()) return;
          setSpeechListening(false);
          if (failure.reason === 'permission_denied') {
            setMicPermissionDenied(true);
            return;
          }
          // The audio note keeps recording: it is still real. Be explicit that
          // no transcript was produced and why, instead of sending placeholder
          // text as if it were the user's words.
          if (failure.reason !== 'no_speech' && failure.reason !== 'no_match') {
            setSpeechInputError(failure.message);
          }
          console.warn('Speech input notice:', failure.message);
        },
        onEnd: () => {
          if (!isCurrent()) return;
          setSpeechListening(false);
          recognitionRef.current = null;
        },
      },
      { lang: 'en-US', continuous: true }
    );
    // Recognition deliberately starts only after getUserMedia succeeds (below).
    // Starting it here opened a second permission request alongside the media
    // one; when the media request failed, the abort could not cancel a start
    // that was still waiting on the system dialog, and the recognizer switched
    // the microphone on after the note had already been abandoned.

    // 2. Initialize MediaStream & MediaRecorder with safety timeout to prevent WebView thread ANR
    let hasAudioStream = false;
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Use Promise.race with a 20-second timeout to allow the user to read and grant the Android permission prompt.
        // The race settling (timeout) does NOT cancel getUserMedia: a late permission grant must still
        // have its track stopped. Attach a release handler to the raw promise before racing it.
        const mediaStreamPromise = navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamPromise.then((lateStream) => {
          if (isCurrent()) return; // normal path owns this stream; it handles its own release
          try { lateStream.getTracks().forEach((t) => t.stop()); } catch (_) {}
        }).catch(() => {});
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<null>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Audio permission/hardware timeout')), 20000);
        });

        let stream: MediaStream | null;
        try {
          stream = await Promise.race([mediaStreamPromise, timeoutPromise]) as MediaStream | null;
        } catch (timeoutErr) {
          // The race rejected (4s hardware timeout). This request is over, so a
          // stream granted later must be released by the .then handler above.
          voiceRequestIdRef.current++;
          throw timeoutErr;
        } finally {
          // The success path must not leave a stray timer armed.
          if (timeoutId !== undefined) clearTimeout(timeoutId);
        }
        if (stream) {
          // The user may have cancelled, sent, or navigated away while the
          // permission prompt was open. Never start a recorder with that stale
          // stream: the microphone track would stay live in the background.
          if (!isCurrent()) {
            releaseStream(stream);
            speechSession.abort();
            return;
          }
          hasAudioStream = true;
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            // A cancelled/finished recorder can deliver one last chunk after
            // the buffer was cleared. Accept only chunks that still belong to
            // this note (or its in-flight finalize), otherwise the next
            // recording would gain the old note's audio.
            const belongs = voiceChunkBelongsToCurrentNote({
              chunkRequestId: requestId,
              currentRequestId: voiceRequestIdRef.current,
              finalizing: isFinalizingVoiceRef.current,
              isActiveRecorder: mediaRecorderRef.current === mediaRecorder,
            });
            if (!belongs) return;
            if (event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };

          mediaRecorder.start(100);

          // 3. Connect Web Audio API Analyser for real-time waveform visualization
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtxClass) {
              const ctx = new AudioCtxClass();
              const source = ctx.createMediaStreamSource(stream);
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 64;
              analyser.smoothingTimeConstant = 0.8;
              source.connect(analyser);

              audioContextRef.current = ctx;
              analyserRef.current = analyser;

              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              const updateVisualizer = () => {
                if (!isVoiceMountedRef.current || !analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(dataArray);

                const bars: number[] = [];
                let total = 0;
                const step = Math.max(1, Math.floor(dataArray.length / 13));
                for (let i = 0; i < 13; i++) {
                  const val = dataArray[i * step] || 0;
                  total += val;
                  const pct = Math.min(100, Math.max(12, Math.round((val / 255) * 100)));
                  bars.push(pct);
                }
                setWaveformBars(bars);

                const avg = total / 13;
                const db = avg > 0 ? Math.round(20 * Math.log10(avg / 255) + 60) : 0;
                setCurrentAudioDb(Math.max(0, db));

                animFrameRef.current = requestAnimationFrame(updateVisualizer);
              };
              animFrameRef.current = requestAnimationFrame(updateVisualizer);
            }
          } catch (e) {
            console.warn('AudioContext visualizer notice:', e);
          }

          // 4. Set up auto-silence detector (2.8s of speech silence triggers auto-send if enabled)
          if (silenceDetectorRef.current) silenceDetectorRef.current.clear();
          silenceDetectorRef.current = createSilenceDetector(2800, () => {
            if (isVoiceMountedRef.current && currentTranscriptRef.current.trim().length > 0) {
              triggerHaptic([20, 30]);
              finishVoiceRecordingAndSend();
            }
          });
        }
      }
    } catch (err: any) {
      console.warn('Microphone access prompt notice:', err?.message || err);
      // Whatever failed, this request owns no recorder: stop its recognition
      // and get out. Falling through would show the recording bar with a null
      // MediaRecorder, and the user's entire note would be silently discarded
      // on Send. The token bump ignores this attempt's late callbacks as well.
      speechSession.abort();
      voiceRequestIdRef.current++;
      if (isPermissionDeniedError(err)) {
        // The native dialog fired at this moment of use; a denial here means
        // Android auto-denies silently from now on. Show the settings way out.
        setMicPermissionDenied(true);
      } else {
        alert('Microphone unavailable or timed out. Voice note was not started - please try again.');
      }
      return;
    }

    // Never enter the recording UI without a live recorder (getUserMedia
    // missing entirely also lands here).
    if (!hasAudioStream) {
      speechSession.abort();
      voiceRequestIdRef.current++;
      alert('Microphone unavailable. Voice note was not started.');
      return;
    }

    // Commit: this request now owns the live recognition session.
    recognitionRef.current = speechSession;
    setIsRecordingVoice(true);
    setMicPermissionDenied(false);

    // The recorder has the microphone now, so the recognizer can start with
    // no competing permission dialog. A failure here still leaves the audio
    // note recording and is shown as an honest transcription error.
    speechSession.start().then((result) => {
      if (!isCurrent()) {
        speechSession.abort();
        return;
      }
      if (!result.started) {
        if (result.reason === 'permission_denied') {
          setMicPermissionDenied(true);
        } else {
          setSpeechInputError(result.message || 'Voice input is unavailable.');
        }
      }
    });

    // Recording seconds ticker
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    voiceTimerRef.current = setInterval(() => {
      setRecordDurationSec((prev) => prev + 1);
    }, 1000);
  };

  // Cancel recording without sending (WhatsApp trash / slide to cancel)
  const cancelVoiceRecording = () => {
    cleanupAudioVisualizer();
    voiceRequestIdRef.current++;
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const recorder = mediaRecorderRef.current;
      try {
        recorder.stop();
      } catch (_) {}
      // Track release must be independent: if stop() threw (e.g. the
      // recorder already died mid-recording), the mic must still be freed.
      try {
        recorder.stream.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    currentTranscriptRef.current = '';
    setInputVal('');
    // Cancelling a note throws the composer text away on purpose; the stored
    // draft must go with it or a restart would resurrect the discarded words.
    discardComposerDraft();
    setIsRecordingVoice(false);
    setRecordDurationSec(0);
    setSpeechListening(false);
    setSpeechInputError(null);
  };

  // Finish recording and send directly to LLM with audio voice note attachment!
  const finishVoiceRecordingAndSend = async () => {
    // Ignore overlapping Send taps: a second call would clear isFinalizingVoiceRef
    // while the first call is still awaiting its final audio chunk.
    if (isFinalizingVoiceRef.current) return;
    cleanupAudioVisualizer();
    voiceRequestIdRef.current++;
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    const duration = recordDurationSec;

    // Stop Speech Recognition
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }

    let audioDataUrl = '';
    let audioBlob: Blob | null = null;

    // Stop the recorder and wait for its final ondataavailable + stop event
    // before building the blob; building it earlier truncates the recording.
    isFinalizingVoiceRef.current = true;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      audioBlob = await new Promise<Blob | null>((resolve) => {
        let settled = false;
        let stopTimeout: ReturnType<typeof setTimeout> | undefined;
        let finished = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(stopTimeout);
          // Always release the hardware here, even if unmount happened mid-send:
          // the blob has been baked from the chunks collected so far.
          if (!finished) {
            finished = true;
            try {
              recorder.stream.getTracks().forEach((t) => t.stop());
            } catch (_) {}
          }
          resolve(audioChunksRef.current.length > 0
            ? new Blob(audioChunksRef.current, { type: 'audio/webm' })
            : null);
        };
        // Safety net if the WebView never fires the stop event
        stopTimeout = setTimeout(finish, 2000);
        recorder.onstop = finish;
        try {
          recorder.stop();
        } catch (_) {
          finish();
        }
      });
    } else if (audioChunksRef.current.length > 0) {
      audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    }
    mediaRecorderRef.current = null;
    isFinalizingVoiceRef.current = false;

    // Chunks are baked into the blob now; clear them so the next voice note
    // never mixes in fragments of this recording.
    audioChunksRef.current = [];

    if (audioBlob) {
      const blob = audioBlob;
      try {
        audioDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (_) {}
    }

    const transcribedPrompt = currentTranscriptRef.current.trim() || inputVal.trim() || (
      audioDataUrl ? '[Voice note attached - the speech recognizer produced no transcript]' : ''
    );

    // If audio blob was recorded, attach as voice note
    if (audioDataUrl) {
      const voiceAttachment: Attachment = {
        id: `voice-${Date.now()}`,
        type: 'audio',
        name: `Voice Note (${Math.max(1, duration)}s)`,
        dataUrl: audioDataUrl,
        mimeType: 'audio/webm',
        sizeBytes: audioBlob?.size || 12000,
        durationSec: Math.max(1, duration),
      };
      addAttachment(voiceAttachment);
    }

    // While a reply is still generating, sendMessage silently no-ops. The
    // recording bar replaces the composer, so the normal Send/Stop swap
    // never blocks this path: dispatching anyway wiped the transcript and
    // left the voice note silently attached to whatever gets sent next.
    // Stage the note and transcript in the composer instead - nothing is
    // lost, and the user sends it once generation finishes.
    if (useAppStore.getState().isGenerating) {
      setIsRecordingVoice(false);
      setRecordDurationSec(0);
      setInputVal(transcribedPrompt === 'Voice message' ? '' : transcribedPrompt);
      return;
    }

    setIsRecordingVoice(false);
    setRecordDurationSec(0);
    setSpeechListening(false);
    setInputVal('');
    // The voice note and its transcript are on their way to the model now.
    discardComposerDraft();

    // Trigger instant message dispatch to LLM!
    setTimeout(() => {
      dispatchPromptSafely(transcribedPrompt);
    }, 50);
  };

  // Audio Playback handler for voice notes
  const togglePlayAudio = (dataUrl: string, id: string) => {
    if (activeAudioPlayingId === id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.onended = null;
        audioPlayerRef.current.onerror = null;
        try { audioPlayerRef.current.pause(); } catch (_) {}
        try { audioPlayerRef.current.src = ''; } catch (_) {}
        audioPlayerRef.current = null;
      }
      setActiveAudioPlayingId(null);
      return;
    }

    if (audioPlayerRef.current) {
      const previous = audioPlayerRef.current;
      previous.onended = null;
      previous.onerror = null;
      try { previous.pause(); } catch (_) {}
      try { previous.src = ''; } catch (_) {}
      audioPlayerRef.current = null;
      setActiveAudioPlayingId(null);
    }

    const audio = new Audio(dataUrl);
    audioPlayerRef.current = audio;
    audio.onended = () => setActiveAudioPlayingId(null);
    audio.onerror = () => setActiveAudioPlayingId(null);
    setActiveAudioPlayingId(id);
    // A rejected play() promise (autoplay policy after a tab switch, audio
    // focus loss, truncated webm data URL) fires neither onended nor
    // onerror: without this catch the bubble showed a pulsing "playing"
    // waveform with no audio forever, and the retry tap only tore the
    // player down.
    audio.play().catch(() => {
      if (audioPlayerRef.current === audio) audioPlayerRef.current = null;
      setActiveAudioPlayingId((cur) => (cur === id ? null : cur));
    });
  };

  const dispatchPromptSafely = (promptText: string): boolean => {
    if ((!promptText.trim() && pendingAttachments.length === 0) || isGenerating) return false;
    if (!isOnline && !downloads[selectedModelId]?.isReady) {
      if (readyModels.length > 0) {
        const targetModel =
          readyModels.find(
            (m) => m.category !== 'image' && m.category !== 'voice' && !m.capabilities.includes('image-gen')
          ) || readyModels[0];
        triggerHaptic(20);
        setSelectedModelId(targetModel.id);
        if (targetModel.category === 'image') {
          setOperatingMode('image-gen');
        } else if (targetModel.category === 'voice') {
          setOperatingMode('voice');
        } else {
          setOperatingMode(operatingMode === 'agent' ? 'agent' : 'chat');
        }
        setFallbackNotice(`Offline: automatically switched to on-device ${targetModel.name.split(' ')[0]} model.`);
        setUploadError(null);
        sendMessage(promptText);
        return true;
      }
      setUploadError('You are currently offline with no local models downloaded. Download an on-device model to chat offline.');
      return false;
    }
    setUploadError(null);
    sendMessage(promptText);
    return true;
  };

  const handleRetryMessage = (failedMsgId: string) => {
    const session = operatingMode === 'agent'
      ? agentSessions[activeAgentSessionId]
      : chatSessions[activeChatSessionId];
    if (!session || isGenerating) return;
    const msgs = session.messages || [];
    const failedIdx = msgs.findIndex((m) => m.id === failedMsgId);
    if (failedIdx <= 0) return;
    let userMsgToRetry: ChatMessage | null = null;
    for (let i = failedIdx - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        userMsgToRetry = msgs[i];
        break;
      }
    }
    if (!userMsgToRetry) return;

    // Check offline readiness before destructive message removal
    if (!isOnline && !downloads[selectedModelId]?.isReady) {
      if (readyModels.length > 0) {
        const targetModel =
          readyModels.find(
            (m) => m.category !== 'image' && m.category !== 'voice' && !m.capabilities.includes('image-gen')
          ) || readyModels[0];
        triggerHaptic(20);
        setSelectedModelId(targetModel.id);
        if (targetModel.category === 'image') {
          setOperatingMode('image-gen');
        } else if (targetModel.category === 'voice') {
          setOperatingMode('voice');
        } else {
          setOperatingMode(operatingMode === 'agent' ? 'agent' : 'chat');
        }
        setFallbackNotice(`Offline retry: automatically switched to on-device ${targetModel.name.split(' ')[0]} model.`);
        setUploadError(null);
      } else {
        setUploadError('You are currently offline with no local models downloaded. Download an on-device model to retry offline.');
        return;
      }
    }

    // Strip both the failed/target assistant response and the prior user prompt
    // so retry/regenerate never duplicates user messages in chat history or LLM context.
    const updatedMessages = msgs.filter((m) => m.id !== failedMsgId && m.id !== userMsgToRetry!.id);
    if (operatingMode === 'agent') {
      useAppStore.setState((s) => ({
        agentSessions: {
          ...s.agentSessions,
          [activeAgentSessionId]: { ...session, messages: updatedMessages },
        },
      }));
    } else {
      useAppStore.setState((s) => ({
        chatSessions: {
          ...s.chatSessions,
          [activeChatSessionId]: { ...session, messages: updatedMessages },
        },
      }));
    }
    // Restore attachments if any were attached to the original user message
    if (userMsgToRetry.attachments && userMsgToRetry.attachments.length > 0) {
      useAppStore.setState({ pendingAttachments: [...userMsgToRetry.attachments] });
    }
    triggerHaptic(20);
    sendMessage(userMsgToRetry.content);
  };

  const handleSend = () => {
    if ((!inputVal.trim() && pendingAttachments.length === 0) || isGenerating) return;
    let textToSend = inputVal;
    if (quotedMessage) {
      const cleanSnippet = quotedMessage.snippet.replace(/\n+/g, ' ');
      textToSend = `> **${quotedMessage.senderName}**: "${cleanSnippet}"\n\n${textToSend}`;
      setQuotedMessage(null);
    }
    if (dispatchPromptSafely(textToSend)) {
      setInputVal('');
      // The prompt was consumed by the send: a killed WebView must not bring
      // it back as if it had never gone out.
      discardComposerDraft();
      // The shared draft is on its way to the model now; its hint is stale.
      setSharedDraftHint(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = '';
    setUploadError(null);
    for (const file of Array.from(files)) {
      // Downsample oversized camera photos to a mobile-safe bound before they
      // hit the attachment store (memory + persistence quota + render lag).
      // Every failure falls back to the original file - an attachment is
      // never blocked by the optimizer.
      try {
        let dataUrl: string;
        let mimeType: string;
        let sizeBytes: number;
        if (isOversizedImage(file)) {
          const optimized = await downsampleImageFile(file);
          dataUrl = optimized.dataUrl;
          mimeType = optimized.mimeType;
          sizeBytes = optimized.sizeBytes;
        } else {
          dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
          });
          mimeType = file.type;
          sizeBytes = file.size;
        }
        if (!dataUrl) {
          // A photo that cannot be decoded is worse than a text file that
          // cannot be read: Vision OCR and "summarize this screenshot" flows
          // depend entirely on the attachment. Mirror the text-file notice in
          // handleFileUpload so the user never sends an imageless prompt.
          setUploadError(
            `Could not attach "${file.name}" \u2014 the photo could not be read or decoded. Try a smaller image or re-select it.`
          );
          continue;
        }
        const att: Attachment = {
          id: `img-${Date.now()}-${Math.random()}`,
          type: 'image',
          name: file.name,
          dataUrl,
          mimeType,
          sizeBytes,
        };
        if (!addAttachment(att)) {
          setUploadError('Attachment limit reached (10 files or 12 MB). Send this batch or remove some before adding more.');
        }
      } catch (_) {
        // Skip only this file, keep processing the rest - but say why, so a
        // dropped photo is never silently mistaken for an attached one.
        setUploadError(
          `Could not attach "${file.name}" \u2014 the photo could not be read or decoded. Try a smaller image or re-select it.`
        );
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError(null);
    Array.from(files).forEach((file) => {
      const isTextFile =
        file.type.startsWith('text/') ||
        /\.(txt|md|json|js|ts|tsx|jsx|py|java|c|cpp|rs|go|html|css|csv|xml|yaml|yml|log|sh|bat)$/i.test(file.name);

      if (isTextFile) {
        const textReader = new FileReader();
        textReader.onload = () => {
          const content = (textReader.result as string) || '';
          const att: Attachment = {
            id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            type: 'file',
            name: file.name,
            dataUrl: '',
            mimeType: file.type || 'text/plain',
            sizeBytes: file.size,
            textContent: content,
          };
          setUploadError(null);
          if (!addAttachment(att)) {
            setUploadError('Attachment limit reached (10 files or 12 MB). Send this batch or remove some before adding more.');
          }
        };
        textReader.onerror = () => {
          console.warn('Failed to read text file:', file.name, textReader.error);
          setUploadError(`Could not attach "${file.name}" — the file could not be read. Please try again.`);
        };
        textReader.readAsText(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const att: Attachment = {
            id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            type: 'file',
            name: file.name,
            dataUrl: reader.result as string,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
          };
          setUploadError(null);
          if (!addAttachment(att)) {
            setUploadError('Attachment limit reached (10 files or 12 MB). Send this batch or remove some before adding more.');
          }
        };
        reader.onerror = () => {
          console.warn('Failed to read file:', file.name, reader.error);
          setUploadError(`Could not attach "${file.name}" — the file could not be read. Please try again.`);
        };
        reader.readAsDataURL(file);
      }
    });
    e.target.value = '';
  };

  const toggleStepExpand = (msgId: string) => {
    setExpandedSteps((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const handleExportSession = () => {
    if (!messages || messages.length === 0) return;
    const title = currentSession?.title || 'Hermes Session Report';
    let md = `# 🤖 ${title}\n\n`;
    md += `*Generated on-device via ${currentModel?.name || 'Hermes AI'}*\n`;
    md += `*Timestamp: ${new Date().toLocaleString()}*\n\n---\n\n`;

    messages.forEach((m) => {
      md += `### ${m.role === 'user' ? '👤 User' : '🤖 Assistant'} (${new Date(m.timestamp).toLocaleTimeString()})\n\n`;
      if (m.agentSteps && m.agentSteps.length > 0) {
        md += `> **Hermes Autonomous Agent Execution Steps:**\n`;
        m.agentSteps.forEach((s, sIdx) => {
          if (s.thought) md += `> - **Step ${sIdx + 1} Thought**: ${s.thought}\n`;
          if (s.toolCall) md += `> - **Tool Call**: \`${s.toolCall.name}\` (${JSON.stringify(s.toolCall.arguments)})\n`;
          if (s.toolResult) md += `> - **Observation**: ${s.toolResult.replace(/\n/g, ' ')}\n`;
        });
        md += `\n`;
      }
      md += `${m.content}\n\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderHighlightedText = (text: string, query?: string) => {
    if (!query || !query.trim()) return text;
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);
    if (parts.length <= 1) return text;
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-amber-400/40 text-amber-200 px-0.5 rounded font-bold">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const renderFormattedContent = (content: string, highlightQuery?: string) => {
    if (!content.includes('```')) {
      return (
        <div className="whitespace-pre-wrap leading-relaxed">
          {renderHighlightedText(content, highlightQuery)}
        </div>
      );
    }
    const parts = content.split(/(```[\s\S]*?(?:```|$))/g);
    return (
      <div className="space-y-2">
        {parts.map((part, idx) => {
          if (part.startsWith('```')) {
            const raw = part.endsWith('```') && part.length >= 6 ? part.slice(3, -3) : part.slice(3);
            const lines = raw.replace(/^\r?\n/, '').split('\n');
            const firstLine = lines[0] || '';
            const isLangHeader = /^[a-zA-Z0-9_-]+$/.test(firstLine.trim());
            const lang = isLangHeader ? firstLine.trim() : '';
            const codeText = lang ? lines.slice(1).join('\n') : lines.join('\n');
            return (
              <FormattedCodeBlock
                key={idx}
                language={lang}
                code={codeText}
                onRunInSandbox={handleRunInSandbox}
              />
            );
          }
          if (!part) return null;
          return (
            <div key={idx} className="whitespace-pre-wrap leading-relaxed">
              {renderHighlightedText(part, highlightQuery)}
            </div>
          );
        })}
      </div>
    );
  };

  // Scroll Position Memory across Tab Switches & Mounts
  const hasRestoredScrollRef = useRef(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = sessionStorage.getItem('hermes_chat_scroll_pos');
      if (saved && messagesContainerRef.current) {
        const parsed = parseInt(saved, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          requestAnimationFrame(() => {
            if (messagesContainerRef.current && !hasRestoredScrollRef.current) {
              messagesContainerRef.current.scrollTop = parsed;
              hasRestoredScrollRef.current = true;
            }
          });
        }
      }
    } catch (_) {}
  }, []);

  const handleContainerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setIsAwayFromBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
    setIsScrolledDown(el.scrollTop > 350);
    try {
      sessionStorage.setItem('hermes_chat_scroll_pos', String(el.scrollTop));
    } catch (_) {}
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950 relative">
      {/* ── TOP CONTROL BAR  (2 compact rows) ── */}
      <div className="border-b border-zinc-800/80 bg-zinc-950/95 z-20">
        {/* Row 1: Model Selector (category browsing consolidated into Model Hub) */}
        <div className="px-2 pt-2 pb-1.5 flex items-center justify-between gap-1.5">
          {/* Model Selector */}
          <div ref={modelPickerRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowModelPicker((prev) => !prev)}
              aria-label="Select AI Model"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 active:border-cyan-500 text-[11px] font-bold text-white transition-all cursor-pointer max-w-[135px] xs:max-w-[190px] sm:max-w-[260px] shadow-sm select-none shrink min-w-0"
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
              <span className="truncate">{currentModel?.name || 'Select Model'}</span>
              <ChevronDown className={`w-3 h-3 text-zinc-400 shrink-0 transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
            </button>

            {/* Model Picker Overlay Backdrop & Menu */}
            {showModelPicker && (
              <>
                {/* Backdrop to easily dismiss when tapping outside on mobile */}
                <div
                  className="fixed inset-0 z-40 bg-black/60"
                  onClick={() => setShowModelPicker(false)}
                />

                {/* Dropdown Popover */}
                <div className="absolute left-0 top-full mt-2 w-[calc(100vw-20px)] xs:w-[380px] sm:w-[440px] max-w-[96vw] bg-zinc-900 border border-zinc-700/90 rounded-2xl shadow-2xl p-3 z-50 space-y-2.5 max-h-[75vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800 shrink-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-cyan-400">Quick Model Switcher</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                          {readyModels.length} Ready
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5 flex items-center gap-1.5 font-mono">
                        <Cpu className="w-3 h-3 text-zinc-500" />
                        <span>{hardwareProfile?.cpuCores || 8}C • {hardwareProfile?.estimatedRamGB || 8}GB RAM • {hardwareProfile?.hasWebGpu ? 'WebGPU' : 'WASM'}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowModelPicker(false)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                      aria-label="Close Model Switcher"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Search Input */}
                  <div className="relative shrink-0">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={modelSearchQuery}
                      onChange={(e) => setModelSearchQuery(e.target.value)}
                      placeholder="Search model, size, vision, agent..."
                      className="w-full bg-zinc-950/80 border border-zinc-800 focus:border-cyan-500 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                    />
                    {modelSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setModelSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] font-bold shrink-0 scrollbar-none">
                    {(['all', 'ready', 'text', 'code', 'agent', 'vision'] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          triggerHaptic(10);
                          setModelCategoryFilter(cat);
                        }}
                        className={`px-2.5 py-1 rounded-lg transition-colors capitalize shrink-0 cursor-pointer ${
                          modelCategoryFilter === cat
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                            : 'bg-zinc-950/60 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        {cat === 'all' ? 'All Models' : cat}
                      </button>
                    ))}
                  </div>

                  {/* Model Cards List */}
                  <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-0.5 overscroll-contain">
                    {filteredModels.length > 0 ? (
                      filteredModels.map((m) => {
                        const isCur = m.id === selectedModelId;
                        const isReady = downloads[m.id]?.isReady;
                        const deviceRam = hardwareProfile?.estimatedRamGB || 8;
                        const ramMargin = deviceRam - m.minRamGB;
                        const ramTight = ramMargin < 0;
                        const ramOptimal = ramMargin >= 3;

                        return (
                          <div
                            key={m.id}
                            className={`p-2.5 rounded-xl border transition-all text-xs select-none ${
                              isCur
                                ? 'bg-cyan-500/15 border-cyan-500/60 shadow-sm'
                                : 'bg-zinc-950/60 hover:bg-zinc-800/60 border-zinc-800'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="truncate flex-1">
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="text-sm shrink-0">{m.purposeIcon || '🤖'}</span>
                                  <span className="font-bold text-white truncate">{m.name}</span>
                                </div>
                                <div className="text-[10px] text-zinc-400 mt-0.5 truncate">{m.tagline}</div>
                              </div>

                              {/* Status / Switch Button */}
                              {isCur ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-500 text-black shrink-0">
                                  Active
                                </span>
                              ) : isReady ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    triggerHaptic(20);
                                    setSelectedModelId(m.id);
                                    if (m.category === 'image') {
                                      setOperatingMode('image-gen');
                                    } else if (m.category === 'vision') {
                                      setOperatingMode('vision');
                                    } else if (m.category === 'voice') {
                                      setOperatingMode('voice');
                                    } else if (m.category === 'embedding') {
                                      setOperatingMode('embedding');
                                    } else if (m.capabilities.includes('agent')) {
                                      setOperatingMode('agent');
                                    } else {
                                      setOperatingMode('chat');
                                    }
                                    setShowModelPicker(false);
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 shrink-0 cursor-pointer transition-colors"
                                >
                                  Load
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowModelPicker(false);
                                    setModelPromptDownload(m);
                                  }}
                                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shrink-0 flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Get</span>
                                </button>
                              )}
                            </div>

                            {/* Technical & Hardware Specs Badges */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1.5 border-t border-zinc-800/80 text-[9px] font-mono">
                              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                                {m.parameters} • {m.quantization}
                              </span>
                              {m.contextWindow && (
                                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-cyan-300">
                                  {Math.round(m.contextWindow / 1024)}k ctx
                                </span>
                              )}
                              <span className={`px-1.5 py-0.5 rounded ${
                                m.engine === 'webgpu' ? 'bg-purple-900/40 text-purple-300 border border-purple-700/40' : 'bg-amber-900/30 text-amber-300 border border-amber-700/40'
                              }`}>
                                {m.engine === 'webgpu' ? 'WebGPU' : 'CPU-WASM'}
                              </span>

                              {/* Memory Footprint Indicator */}
                              {ramTight ? (
                                <span className="px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/60 flex items-center gap-0.5">
                                  <span>⚠️ Needs {m.minRamGB}GB RAM</span>
                                </span>
                              ) : ramOptimal ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                                  ⚡ +{ramMargin.toFixed(0)}GB Headroom
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-800/60">
                                  ✓ Fits {m.minRamGB}GB RAM
                                </span>
                              )}

                              <span className="text-zinc-500 ml-auto">
                                {(m.sizeMB / 1024).toFixed(1)} GB
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center text-zinc-500 text-xs bg-zinc-950/50 rounded-xl border border-zinc-800">
                        No models match your search or filter.
                      </div>
                    )}
                  </div>

                  {/* Link to ModelHub where all categories/use-cases live */}
                  <div className="pt-2 border-t border-zinc-800">
                    <button
                      type="button"
                      onClick={() => {
                        setShowModelPicker(false);
                        setCurrentTab('models');
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/60 text-cyan-400 hover:text-cyan-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Browse Categories in Model Hub →</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ChatGPT-style Hands-Free Voice Call Button */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('success');
                setIsVoiceCallOpen(true);
              }}
              aria-label="Start Real-time Voice Call"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-[11px] font-bold shadow-md shadow-emerald-950/40 border border-emerald-400/40 active:scale-95 transition-all cursor-pointer"
              title="Real-time Hands-Free Voice Call (ChatGPT Voice Mode)"
            >
              <PhoneCall className="w-3.5 h-3.5 animate-pulse" />
              <span className="hidden xs:inline sm:inline">Voice Call</span>
            </button>

            {/* Thermal Indicator */}
            {thermalTelemetry.state !== 'nominal' && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setCurrentTab('device');
              }}
              aria-label={`Thermal state: ${thermalTelemetry.state}, ${thermalTelemetry.temperatureC} degrees Celsius`}
              className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-mono font-bold border transition-all cursor-pointer select-none shrink-0 ${
                thermalTelemetry.state === 'throttled'
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                  : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              }`}
              title={`Thermal Governor: ${thermalTelemetry.state.toUpperCase()} (${thermalTelemetry.temperatureC}°C, +${thermalTelemetry.yieldDelayMs}ms delay)`}
            >
              <Flame className="w-3 h-3 shrink-0" />
              <span>{thermalTelemetry.temperatureC}°C</span>
            </button>
          )}
          </div>
        </div>

        {/* Row 2: Action buttons - the five primary actions stay visible;
            everything else lives in the "More" dropdown so the main screen
            shows one compact row instead of fifteen always-visible buttons.
            No action was removed: each menu entry below is the exact former
            button with its original onClick and title. */}
        <div className="px-2 pb-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-nowrap shrink-0">
          {/* New Session */}
          <button
            onClick={() => createNewSession()}
            title="New Chat / New Hermes Session"
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-cyan-500/50 text-cyan-400 text-[10px] font-bold transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>

          {/* Voice Output Toggle */}
          <button
            onClick={() => {
              if (isSpeaking) stopSpeaking();
              setIsVoiceOutputEnabled(!isVoiceOutputEnabled);
            }}
            title={isVoiceOutputEnabled ? 'Voice reply ON - tap to mute' : 'Voice reply muted - tap to enable'}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${
              isVoiceOutputEnabled
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-500'
            }`}
          >
            {isVoiceOutputEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{isVoiceOutputEnabled ? 'Voice On' : 'Muted'}</span>
          </button>

          {/* Emergency Stop All */}
          <button
            onClick={() => {
              stopAllRunningTasks();
            }}
            title="Stop all running tasks, speech, downloads and generations"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${
              isGenerating || isSpeaking || Object.values(downloads).some((d) => d.isDownloading)
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 hover:bg-rose-500/30 animate-pulse shadow-md shadow-rose-500/20'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-rose-400 hover:border-rose-500/30'
            }`}
          >
            <Octagon className="w-3.5 h-3.5 fill-rose-500/20" />
            <span>Stop All</span>
          </button>

          {/* Sessions Archive Drawer */}
          <button
            onClick={() => setShowHistoryModal(true)}
            title="Browse all past chat sessions and agent tasks"
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-cyan-500/50 text-zinc-300 hover:text-white text-[10px] font-bold transition-all cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            <span>Threads ({Object.keys(operatingMode === 'agent' ? agentSessions : chatSessions).length})</span>
          </button>

          {/* Search Session */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            title="Search session messages"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${
              showSearch ? 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search</span>
          </button>

          {/* More Tools & Session Actions: same dropdown pattern as the mode
              menu - backdrop to dismiss, absolute panel, ghost rows. */}
          <div className="relative shrink-0 ml-auto">
            <button
              onClick={() => setShowMoreTools((prev) => !prev)}
              aria-label="More tools and session actions"
              title="Saved, Clear, Export, Compress, Sensors, Clipboard, Phrases, SpeedTest, Notes, QR Studio"
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${
                showMoreTools ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              <span>More</span>
            </button>

            {showMoreTools && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                  onClick={() => setShowMoreTools(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 w-64 max-w-[92vw] max-h-[60vh] overflow-y-auto bg-zinc-900 border border-zinc-700/90 rounded-2xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2 py-1 text-[10px] uppercase font-bold text-zinc-400 tracking-wider border-b border-zinc-800">
                    Tools &amp; Session Actions
                  </div>

                  {/* Starred Bookmarks (was a Row-2 button) */}
                  <button
                    onClick={() => {
                      setShowMoreTools(false);
                      setShowBookmarksDrawer(true);
                    }}
                    title="View saved bookmarks"
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                      starredMessageIds.length > 0 ? 'text-amber-300 bg-amber-950/40' : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <Bookmark className="w-4 h-4 shrink-0" />
                    <span className="flex-1">Saved Messages</span>
                    <span className="text-[10px] font-mono text-zinc-400">{starredMessageIds.length}</span>
                  </button>

                  {/* Clear Session (was a Row-2 button) */}
                  <button
                    onClick={() => {
                      setShowMoreTools(false);
                      clearCurrentConversation();
                      // Clearing a session wipes messages, not the composer, so
                      // an unsent draft the user can still see has to survive a
                      // restart - dropping it here would be the very data loss
                      // this draft storage fixes. Only a leftover key behind an
                      // already-empty composer is stale and worth removing.
                      if (!inputVal.trim()) clearComposerDraft(draftSessionRef.current);
                    }}
                    title="Clear current session messages"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-rose-300 hover:bg-rose-950/40 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <span className="flex-1">Clear This Session</span>
                  </button>

                  {/* Export Session (was a Row-2 button) */}
                  <button
                    onClick={() => {
                      setShowMoreTools(false);
                      setIsExportModalOpen(true);
                    }}
                    title="Export session to Markdown, Text, HTML or JSON"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="flex-1">Export Session (Modal)</span>
                  </button>

                  {/* One-Tap Markdown Direct Download */}
                  <button
                    onClick={() => {
                      setShowMoreTools(false);
                      handleExportSession();
                    }}
                    title="One-tap direct download of current conversation as formatted Markdown (.md) with YAML frontmatter"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-emerald-300 hover:bg-emerald-950/40 border border-emerald-500/20 transition-all cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="flex-1">
                      <div>Quick Export (.md)</div>
                      <div className="text-[9px] font-normal text-emerald-400/80">One-tap direct file download</div>
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">.MD</span>
                  </button>

                  {/* Context Compressor (was a Row-2 button) */}
                  <button
                    onClick={() => {
                      setShowMoreTools(false);
                      setIsCompressorModalOpen(true);
                    }}
                    title="Context Window Compressor & KV-Cache Optimizer"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
                  >
                    <Minimize2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="flex-1">Compress Context</span>
                  </button>

                  {/* Sensor Telemetry (was a Row-2 button) */}
                  <button
                    onClick={() => {
                      setShowMoreTools(false);
                      setIsSensorModalOpen(true);
                    }}
                    title="Spatial & Hardware Sensor Telemetry (Compass, Battery, GPS, Lux)"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
                  >
                    <Compass className="w-4 h-4 text-teal-400 shrink-0" />
                    <span className="flex-1">Sensor Telemetry</span>
                  </button>

                  {/* Smart Clipboard Vault (was a Row-2 button) */}
                  <button
                    onClick={() => {
                      setShowMoreTools(false);
                      setIsClipboardVaultOpen(true);
                    }}
                    title="Smart Clipboard Vault - type-aware history with AI analysis"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
                  >
                    <Clipboard className="w-4 h-4 text-violet-400 shrink-0" />
                    <span className="flex-1">Clipboard Vault</span>
                  </button>

                  {/* Offline Phrase Book (was a Row-2 button) */}
                  <button
                    onClick={() => {
                      setShowMoreTools(false);
                      setIsPhraseBookOpen(true);
                    }}
                    title="Offline Travel Phrase Book - 8 languages, TTS pronunciation"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
                  >
                    <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="flex-1">Phrase Book</span>
                  </button>

                  {/* Network Speed Analyzer (was a Row-2 button) */}
                  <button
                    onClick={() => {
                      setShowMoreTools(false);
                      setIsNetworkSpeedOpen(true);
                    }}
                    title="Network Speed Analyzer - Ping, Download, Upload & Jitter"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
                  >
                    <Wifi className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="flex-1">Network Speed Test</span>
                  </button>

                  {/* Markdown Notepad (was a Row-2 button) */}
                  <button
                    onClick={() => {
                      setShowMoreTools(false);
                      setIsNotepadOpen(true);
                    }}
                    title="Markdown Notepad & Offline Document Vault"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="flex-1">Markdown Notes</span>
                  </button>

                  {/* QR Code & Barcode Studio (was a Row-2 button) */}
                  <button
                    onClick={() => {
                      setShowMoreTools(false);
                      setIsQRCodeStudioOpen(true);
                    }}
                    title="QR Code & Barcode Studio - Wi-Fi, Contacts, Crypto & URLs"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
                  >
                    <QrCode className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="flex-1">QR &amp; Barcode Studio</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Real-time Hardware Usage Ticker Bar (isolated component: its
          1.5s interval and liveTps subscription no longer re-render ChatView) */}
      <HardwareTickerBar
        isGenerating={isGenerating}
        engineLabel={currentModel?.engine === 'cpu-wasm' ? 'CPU:' : 'GPU:'}
        accelLabel={currentModel?.engine === 'cpu-wasm' ? 'WASM CPU' : (hardwareProfile?.hasWebGpu ? 'WebGPU' : 'WebGL2')}
      />

      {/* Row 2.5: Search bar if active */}
      {showSearch && (
        <div className="px-3 py-2 bg-zinc-900/95 border-b border-zinc-800 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchMatchIndex(0);
            }}
            placeholder="Search messages in this session..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchMatchIndex(0);
              }}
              className="text-zinc-400 hover:text-white text-xs px-1 cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isSearching && matchingMessageIds.length > 0 ? (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-zinc-400 font-mono">
                {searchMatchIndex + 1}/{matchingMessageIds.length}
              </span>
              <button
                onClick={() => handleNavigateSearchMatch('prev')}
                className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white cursor-pointer"
                title="Previous match"
                aria-label="Previous match"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleNavigateSearchMatch('next')}
                className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white cursor-pointer"
                title="Next match"
                aria-label="Next match"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-zinc-400 font-mono">
              {visibleMessages.length} match{visibleMessages.length === 1 ? '' : 'es'}
            </span>
          )}
        </div>
      )}



      {/* MAIN VIEW: MESSAGES TIMELINE */}
      <div
        ref={messagesContainerRef}
        onScroll={handleContainerScroll}
        className="flex-1 overflow-y-auto p-3 space-y-3"
      >
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 max-w-md mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 via-indigo-500/20 to-purple-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-xl shadow-cyan-500/10">
                  <Bot className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight">
                    {currentModel?.name || 'Local Neural Assistant'}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    {currentModel?.tagline || '100% on-device sovereign AI. Your data never leaves your device.'}
                  </p>
                </div>

                {hardwareProfile && !hardwareProfile.hasWebGpu && currentModel?.engine !== 'cpu-wasm' && (
                  <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-3 text-left text-[11px] text-rose-300 leading-relaxed w-full">
                    <strong>WebGPU not detected.</strong> This model needs WebGPU and won't run on this device. Switch to a <strong>CPU Universal</strong> model
                    (e.g. SmolLM2/Qwen/Llama "CPU") in the model picker above instead — those run on pure CPU and work regardless of WebGPU support.
                  </div>
                )}

                {!downloads[selectedModelId]?.isReady && (
                  <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 text-left space-y-2 w-full">
                    <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                      <Download className="w-4 h-4 text-amber-400" />
                      <span>Model Weights Not Downloaded</span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                      To run genuine on-device LLM inference, download **{currentModel?.name}** ({( (currentModel?.sizeMB || 944) / 1024 ).toFixed(1)} GB) to your phone storage.
                    </p>
                    <button
                      onClick={() => {
                        if (currentModel) {
                          startDownloadModel(currentModel.id);
                          setCurrentTab('models');
                        }
                      }}
                      className="w-full py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download {currentModel?.name}</span>
                    </button>
                  </div>
                )}

                {/* Quick Action Prompt Chips */}
                <div className="w-full space-y-2 pt-2">
                  <div className="text-[11px] font-bold text-zinc-400 text-left">Suggested Autonomous Workflows:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {QUICK_PROMPTS.map((qp, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          // Send straight from the chip: the prompt is already
                          // visible in the sent bubble, and leaving it in the
                          // composer invited a one-tap double-send.
                          if (dispatchPromptSafely(qp.prompt)) {
                            setInputVal('');
                            discardComposerDraft();
                          }
                        }}
                        className="text-left p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-cyan-500/50 text-xs transition-all group cursor-pointer"
                      >
                        <div className="font-bold text-zinc-200 group-hover:text-cyan-300 mb-0.5">{qp.label}</div>
                        <div className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">{qp.prompt}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {hasEarlierMessages && (
              <div className="flex items-center justify-center gap-2 py-3 px-2 my-1">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(10);
                    setMessagesWindowLimit((prev) => prev + 35);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-[11px] font-medium shadow-sm transition-all active:scale-95 cursor-pointer"
                  aria-label={`Load 35 earlier messages, ${hiddenCount} hidden`}
                >
                  <History className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Load earlier messages ({hiddenCount} hidden)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(15);
                    setMessagesWindowLimit(messages.length);
                  }}
                  className="px-2.5 py-1.5 rounded-full bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-[10px] font-medium transition-all active:scale-95 cursor-pointer"
                  aria-label="Show all messages"
                >
                  Show all
                </button>
              </div>
            )}

            {visibleMessages.map((msg) => {
              const isUser = msg.role === 'user';
              const isStepsOpen = expandedSteps[msg.id] ?? true;
              return (
                <div
                  key={msg.id}
                  id={`msg-${msg.id}`}
                  className={`flex gap-2.5 max-w-3xl transition-all ${
                    isUser ? 'ml-auto justify-end' : 'mr-auto justify-start'
                  } ${
                    isSearching && matchingMessageIds[searchMatchIndex] === msg.id
                      ? 'ring-2 ring-cyan-400/80 rounded-2xl p-1 bg-cyan-950/20'
                      : ''
                  }`}
                >
              {!isUser && (
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md shadow-cyan-500/20">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[90%] sm:max-w-[85%]`}
                data-last-assistant={(!isUser && msg.id === lastAssistantId) ? 'true' : undefined}
              >
                {/* Message Meta */}
                <div className="flex items-center gap-2 mb-1 text-[10px] text-zinc-400 px-1">
                  <span>{isUser ? 'You' : msg.modelUsed || 'Hermes AI'}</span>
                  {!isUser && msg.isFallback && (
                    <div className="relative inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic(10);
                          setActiveFallbackTooltipId((prev) => (prev === msg.id ? null : msg.id));
                        }}
                        className="px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[8px] font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition-transform"
                        aria-label="Toggle fallback details"
                        title={msg.fallbackReason ? `Fallback trigger: ${msg.fallbackReason}` : 'Answered via free fallback model'}
                      >
                        <ArrowRightLeft className="w-2.5 h-2.5 text-amber-400" />
                        FALLBACK
                      </button>
                      {activeFallbackTooltipId === msg.id && (
                        <>
                          <div
                            className="fixed inset-0 z-20 cursor-default"
                            onClick={() => setActiveFallbackTooltipId(null)}
                          />
                          <div className="absolute left-0 top-full mt-1 z-30 min-w-[210px] max-w-[280px] p-2 rounded-lg bg-zinc-900 border border-amber-500/50 shadow-xl text-[10px] text-zinc-200 leading-snug animate-in fade-in duration-150">
                          <div className="flex items-center justify-between gap-1 mb-1 font-bold text-amber-300">
                            <span className="flex items-center gap-1">
                              <ArrowRightLeft className="w-3 h-3" />
                              Fallback Active
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveFallbackTooltipId(null)}
                              className="text-zinc-400 hover:text-zinc-200 p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="text-zinc-300">
                            {msg.fallbackReason ? `Trigger: ${msg.fallbackReason}` : 'Primary provider rate-limited or unavailable; served via free fallback preset.'}
                          </p>
                          {msg.fallbackHops && msg.fallbackHops.length > 0 && (
                            <div className="mt-2 pt-1.5 border-t border-zinc-800 space-y-1.5">
                              <div className="text-[9px] font-semibold text-amber-300/90 flex items-center gap-1">
                                <span>Transition Chain ({msg.fallbackHops.length} hop{msg.fallbackHops.length === 1 ? '' : 's'}):</span>
                              </div>
                              {msg.fallbackHops.map((hop, idx) => (
                                <div key={idx} className="bg-zinc-950/60 p-1.5 rounded border border-zinc-800/80 text-[9px]">
                                  <div className="flex items-center gap-1.5 text-zinc-300">
                                    <span className="text-amber-400 font-mono text-[8px] font-bold shrink-0">#{idx + 1}</span>
                                    <span className="text-zinc-200 font-medium truncate max-w-[120px]" title={hop.from}>{hop.from}</span>
                                    <ArrowRightLeft className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                                    <span className="text-amber-300 font-medium truncate max-w-[120px]" title={hop.to}>{hop.to}</span>
                                  </div>
                                  <div className="text-[8px] text-zinc-400 mt-0.5 italic">
                                    Reason: {hop.reason}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        </>
                      )}
                    </div>
                  )}
                  {msg.mode === 'agent' && (
                    <span className="px-1.5 py-0.2 rounded bg-indigo-950/80 border border-indigo-500/30 text-indigo-300 text-[8px] font-bold">
                      HERMES AGENT
                    </span>
                  )}
                </div>

                {/* Attachments Display */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {msg.attachments.map((att) => {
                      if (att.type === 'audio') {
                        const isPlaying = activeAudioPlayingId === att.id;
                        return (
                          <div
                            key={att.id}
                            className="w-full max-w-xs rounded-2xl bg-zinc-900/90 border border-emerald-500/40 p-2.5 flex items-center gap-3 shadow-lg"
                          >
                            <button
                              onClick={() => togglePlayAudio(att.dataUrl, att.id)}
                              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                isPlaying
                                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30 animate-pulse'
                                  : 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20 hover:scale-105'
                              }`}
                            >
                              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[11px] font-bold text-emerald-400 truncate">
                                  {att.name}
                                </span>
                                <span className="text-[9px] text-zinc-400 font-mono">
                                  {att.durationSec ? `${att.durationSec}s` : 'Voice'}
                                </span>
                              </div>
                              {/* WhatsApp Waveform visualization simulation */}
                              <div className="flex items-center gap-0.5 h-3">
                                {[35, 65, 45, 90, 75, 40, 85, 95, 60, 50, 70, 40, 80, 55, 30].map((h, i) => (
                                  <div
                                    key={i}
                                    className={`w-1 rounded-full transition-all duration-300 ${
                                      isPlaying
                                        ? 'bg-emerald-400 animate-pulse'
                                        : 'bg-zinc-600'
                                    }`}
                                    style={{
                                      height: isPlaying ? `${Math.max(25, Math.round(h * Math.random()))}%` : `${h}%`
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={att.id}
                          className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900/90 flex items-center gap-2 p-1 text-xs"
                        >
                          {att.type === 'image' || att.type === 'camera' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={att.dataUrl} alt={att.name} className="w-16 h-16 object-cover rounded-lg" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300">
                              <FileCode className="w-5 h-5 text-cyan-400" />
                            </div>
                          )}
                          <div className="pr-2 max-w-[120px] truncate">
                            <p className="text-[10px] font-bold text-zinc-200 truncate">{att.name}</p>
                            <p className="text-[8px] text-zinc-400 font-mono">{(att.sizeBytes / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Hermes Autonomous Agent Steps (Collapsible) */}
                {msg.agentSteps && msg.agentSteps.length > 0 && (
                  <div className="w-full mb-2 bg-zinc-900/80 border border-indigo-500/30 rounded-xl overflow-hidden text-xs">
                    <button
                      onClick={() => toggleStepExpand(msg.id)}
                      className="w-full px-3 py-1.5 bg-indigo-950/30 flex items-center justify-between text-indigo-300 font-semibold cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 text-[11px]">
                        <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Hermes Agent Thought & Tools ({msg.agentSteps.length} Steps)</span>
                      </span>
                      {isStepsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {isStepsOpen && (
                      <div className="p-2.5 space-y-2 border-t border-indigo-500/20 font-mono text-[11px]">
                        {msg.agentSteps.map((step, idx) => (
                          <div key={idx} className="space-y-1.5">
                            {step.thought && (
                              <div className="text-zinc-400 bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/80 leading-relaxed">
                                <span className="text-indigo-400 font-bold block mb-0.5">🧠 Agent Reasoning:</span>
                                {step.thought}
                              </div>
                            )}

                            {step.toolCall && (
                              <div className="bg-zinc-950 p-2 rounded-lg border border-cyan-500/30 text-cyan-300">
                                <div className="text-[10px] text-zinc-500 font-bold uppercase">⚡ Tool Action Triggered</div>
                                <div className="font-bold">{step.toolCall.name}</div>
                                <div className="text-[10px] text-zinc-400">{JSON.stringify(step.toolCall.arguments)}</div>
                              </div>
                            )}

                            {step.toolResult && (
                              <div className="bg-emerald-950/30 p-2 rounded-lg border border-emerald-500/30 text-emerald-300 text-[10px] whitespace-pre-wrap">
                                <div className="font-bold text-emerald-400 mb-0.5">✅ Tool Observation:</div>
                                {step.toolResult}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Message Bubble with Mobile Touch Gestures */}
                <div
                  className="relative w-full touch-pan-y"
                  style={{
                    transform: swipingMsgId === msg.id ? `translateX(${swipeOffset}px)` : undefined,
                    transition: swipingMsgId === msg.id ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0.9, 0.4, 1)',
                  }}
                  onTouchStart={(e) => handleTouchStart(msg.id, e)}
                  onTouchMove={(e) => handleTouchMove(msg.id, e)}
                  onTouchEnd={() => handleTouchEnd(msg)}
                  onTouchCancel={() => {
                    touchStartRef.current = null;
                    setSwipingMsgId(null);
                    setSwipeOffset(0);
                  }}
                >
                  {/* Swipe reply indicator */}
                  {swipingMsgId === msg.id && Math.abs(swipeOffset) > 18 && (
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 pointer-events-none z-10 transition-transform ${
                        swipeOffset > 0 ? '-left-8' : '-right-8'
                      }`}
                      style={{
                        transform: `translateY(-50%) scale(${Math.min(1.2, Math.abs(swipeOffset) / 36)})`,
                      }}
                    >
                      <CornerUpLeft className="w-3.5 h-3.5" />
                    </div>
                  )}

                  {/* For image-gen messages, make the bubble wider (up to full column width) with no padding */}
                  {msg.content.includes('![') && msg.content.includes('](data:image') ? (
                    <div className="w-full rounded-2xl overflow-hidden border border-zinc-700/80 bg-zinc-950 shadow-xl">
                      {(() => {
                        // Manual parsing to avoid regexp literals that trigger Turbopack issues
                        const content = msg.content;
                        const imgStart = content.indexOf('](data:image');
                        const altStart = imgStart > 0 ? content.lastIndexOf('![', imgStart) : -1;
                        const imgUrlEnd = imgStart > 0 ? content.indexOf(')', imgStart) : -1;
                        const caption = altStart >= 0 && imgStart > altStart ? content.slice(altStart + 2, imgStart) : '';
                        const imgSrc = imgStart >= 0 && imgUrlEnd > imgStart ? content.slice(imgStart + 2, imgUrlEnd) : '';
                        const remainingText = (altStart >= 0 && imgUrlEnd >= 0)
                          ? (content.slice(0, altStart) + content.slice(imgUrlEnd + 1)).trim()
                          : content.trim();

                        return (
                          <>
                            {imgSrc && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={imgSrc}
                                alt={caption || 'Generated AI Image'}
                                className="w-full object-cover block"
                              />
                            )}
                            {remainingText && (
                              <div className="p-2.5 text-xs text-zinc-300 whitespace-pre-wrap font-sans border-t border-zinc-800/80 bg-zinc-900">
                                {remainingText}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div
                      onDoubleClick={() => {
                        if (!isUser) {
                          toggleStarMessage(msg.id);
                          triggerHaptic([30, 30]);
                        }
                      }}
                      title={!isUser ? 'Double-tap to save/bookmark this message' : undefined}
                      className={`p-3 rounded-2xl ${activeFontSizeOption.bubbleClass} transition-all ${
                        isUser
                          ? 'bg-cyan-600 text-white rounded-br-xs shadow-md'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-xs shadow-md select-text'
                      }`}
                    >
                      <div className={`space-y-2 font-sans ${activeFontSizeOption.bubbleClass}`}>
                        {(() => {
                          const content = msg.content || (msg.isStreaming ? 'Thinking...' : '');
                          // If content has <think> ... </think> or unclosed <think>
                          if (content.includes('<think>')) {
                            const thinkStart = content.indexOf('<think>');
                            const thinkEnd = content.indexOf('</think>');
                            const beforeThink = content.slice(0, thinkStart);
                            let thinkContent = '';
                            let afterThink = '';
                            if (thinkEnd !== -1) {
                              thinkContent = content.slice(thinkStart + 7, thinkEnd).trim();
                              afterThink = content.slice(thinkEnd + 8).trim();
                            } else {
                              thinkContent = content.slice(thinkStart + 7).trim();
                            }

                            const activeHighlight = showSearch && searchQuery.trim() ? searchQuery.trim() : undefined;

                            return (
                              <>
                                {beforeThink && renderFormattedContent(beforeThink, activeHighlight)}
                                {thinkContent && (
                                  <details className="rounded-xl bg-zinc-950/70 border border-zinc-800 p-2 text-zinc-400 text-[11px] font-mono select-text" open={msg.isStreaming && !afterThink}>
                                    <summary className="cursor-pointer text-amber-400 font-bold flex items-center gap-1.5 py-0.5 select-none hover:text-amber-300">
                                      <span>🧠 Deep Thinking Process</span>
                                      {msg.isStreaming && !afterThink && <span className="animate-pulse text-[10px] text-amber-500">• reasoning...</span>}
                                    </summary>
                                    <div className="mt-1.5 pt-1.5 border-t border-zinc-800/80 whitespace-pre-wrap leading-relaxed text-zinc-300">
                                      {thinkContent}
                                    </div>
                                  </details>
                                )}
                                {afterThink && renderFormattedContent(afterThink, activeHighlight)}
                              </>
                            );
                          }
                          const activeHighlight = showSearch && searchQuery.trim() ? searchQuery.trim() : undefined;
                          return renderFormattedContent(content, activeHighlight);
                        })()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Assistant Message Actions Toolbar */}
                {!isUser && !msg.isStreaming && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5 px-1">
                    {/* Speak Button */}
                    <button
                      onClick={() => handleSpeakMessage(msg.id, msg.content)}
                      title={isSpeaking && speakingMessageId === msg.id ? "Stop voice playback" : "Read message aloud with Kokoro TTS"}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all cursor-pointer ${
                        isSpeaking && speakingMessageId === msg.id
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                          : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800/80'
                      }`}
                    >
                      {isSpeaking && speakingMessageId === msg.id ? (
                        <>
                          <VolumeX className="w-3 h-3 text-rose-400" />
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3 h-3 text-cyan-400" />
                          <span>Speak</span>
                        </>
                      )}
                    </button>

                    {/* Retry Button on failed generation or on-device error */}
                    {(msg.content.includes('*[Generation failed:') || isErrorDisplayMessage(msg.content)) && !msg.isStreaming && (
                      <button
                        onClick={() => handleRetryMessage(msg.id)}
                        title="Retry generating response"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-950/70 hover:bg-rose-900/80 text-rose-300 hover:text-white border border-rose-700/80 transition-all cursor-pointer shadow-sm"
                      >
                        <RotateCcw className="w-3 h-3 text-rose-400" />
                        <span>Retry</span>
                      </button>
                    )}

                    {/* Regenerate Button on the latest completed assistant message */}
                    {!isGenerating && !msg.isStreaming && msg.id === lastAssistantId && !msg.content.includes('*[Generation failed:') && !isErrorDisplayMessage(msg.content) && (
                      <button
                        onClick={() => handleRetryMessage(msg.id)}
                        title="Regenerate this response"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800/80 transition-all cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3 text-amber-400" />
                        <span>Regenerate</span>
                      </button>
                    )}

                    {/* Share Message via Native Android Sheet */}
                    {canShareReply && (
                      <button
                        onClick={() => handleShareMessage(msg.id, msg.content)}
                        title="Share this reply with another app"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800/80 transition-all cursor-pointer"
                        aria-label="Share response to other apps"
                      >
                        <Share2 className="w-3 h-3 text-cyan-400" />
                        <span>Share</span>
                      </button>
                    )}

                    {/* Quote / Reply Message */}
                    <button
                      type="button"
                      onClick={() => handleQuoteMessage(msg)}
                      title="Quote and reply to this insight"
                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800/80 transition-all cursor-pointer"
                    >
                      <CornerUpLeft className="w-3 h-3 text-cyan-400" />
                      <span>Reply</span>
                    </button>

                    {/* Copy Message with Multi-Format Options */}
                    <div className="relative inline-flex items-center">
                      <button
                        onClick={() => handleCopyMessage(msg.id, msg.content, 'plain', msg.modelUsed)}
                        title="Copy message text"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-l-lg text-[10px] font-medium bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800/80 transition-all cursor-pointer"
                      >
                        {copiedMessageId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          triggerHaptic('selection');
                          setCopyMenuMsgId((cur) => (cur === msg.id ? null : msg.id));
                        }}
                        title="Copy options"
                        aria-label="Copy formatting options"
                        className="px-1 py-0.5 rounded-r-lg text-[10px] bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border-y border-r border-zinc-800/80 transition-all cursor-pointer"
                      >
                        <ChevronDown className={`w-3 h-3 transition-transform ${copyMenuMsgId === msg.id ? 'rotate-180' : ''}`} />
                      </button>

                      {copyMenuMsgId === msg.id && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setCopyMenuMsgId(null)} />
                          <div className="absolute left-0 bottom-full mb-1 z-40 w-44 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-xl p-1.5 space-y-1 text-xs">
                            <button
                              onClick={() => handleCopyMessage(msg.id, msg.content, 'plain', msg.modelUsed)}
                              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white text-[11px] flex items-center justify-between cursor-pointer"
                            >
                              <span>Plain Text</span>
                              <FileText className="w-3 h-3 text-zinc-500" />
                            </button>
                            <button
                              onClick={() => handleCopyMessage(msg.id, msg.content, 'attributed', msg.modelUsed)}
                              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white text-[11px] flex items-center justify-between cursor-pointer"
                            >
                              <span>With Model Info</span>
                              <Bot className="w-3 h-3 text-cyan-400" />
                            </button>
                            <button
                              onClick={() => handleCopyMessage(msg.id, msg.content, 'markdown', msg.modelUsed)}
                              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white text-[11px] flex items-center justify-between cursor-pointer"
                            >
                              <span>Markdown</span>
                              <FileCode className="w-3 h-3 text-purple-400" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Run in Code Sandbox (for code blocks) */}
                    {(msg.content.includes('```') || msg.content.includes('<html') || msg.content.includes('<svg')) && (
                      <button
                        onClick={() => handleRunInSandbox(msg.content)}
                        title="Run code in interactive mobile sandbox"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-300 hover:text-white border border-cyan-700/80 transition-all cursor-pointer shadow-sm"
                      >
                        <Play className="w-3 h-3 text-cyan-400" />
                        <span>Run Sandbox</span>
                      </button>
                    )}

                    {/* View / Convert Markdown Table to Spreadsheet CSV */}
                    {msg.content.includes('|') && msg.content.includes('---') && (
                      <button
                        onClick={() => handleOpenTableModal(msg.content)}
                        title="View interactive spreadsheet table and export CSV"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 hover:text-white border border-emerald-700/80 transition-all cursor-pointer shadow-sm"
                      >
                        <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                        <span>Spreadsheet CSV</span>
                      </button>
                    )}

                    {/* View / Solve LaTeX Math Formula */}
                    {(msg.content.includes('$$') || msg.content.includes('\\frac') || msg.content.includes('\\sqrt') || msg.content.includes('\\sum') || msg.content.includes('\\int')) && (
                      <button
                        onClick={() => handleOpenMathModal(msg.content)}
                        title="View rendered mathematical LaTeX formula and step-by-step solver"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-violet-950/70 hover:bg-violet-900/80 text-violet-300 hover:text-white border border-violet-700/80 transition-all cursor-pointer shadow-sm"
                      >
                        <Calculator className="w-3 h-3 text-violet-400" />
                        <span>Math Solver</span>
                      </button>
                    )}

                    {/* View / Present as Offline Slide Deck */}
                    {(msg.content.includes('# ') || msg.content.includes('## ') || msg.content.includes('---')) && (
                      <button
                        onClick={() => handleOpenSlideDeck(msg.content)}
                        title="Present message as interactive slide deck carousel"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-950/70 hover:bg-blue-900/80 text-blue-300 hover:text-white border border-blue-700/80 transition-all cursor-pointer shadow-sm"
                      >
                        <Presentation className="w-3 h-3 text-blue-400" />
                        <span>Present Deck</span>
                      </button>
                    )}

                    {/* Star / Bookmark Button */}
                    <button
                      onClick={() => toggleStarMessage(msg.id)}
                      title={starredMessageIds.includes(msg.id) ? "Remove from bookmarks" : "Save / Bookmark this insight"}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all cursor-pointer ${
                        starredMessageIds.includes(msg.id)
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800/80'
                      }`}
                    >
                      <Star className={`w-3 h-3 ${starredMessageIds.includes(msg.id) ? 'fill-current text-amber-400' : ''}`} />
                      <span>{starredMessageIds.includes(msg.id) ? 'Saved' : 'Save'}</span>
                    </button>
                  </div>
                )}

                {/* User Message Quick Actions */}
                {isUser && (
                  <div className="flex flex-wrap items-center justify-end gap-1.5 mt-1 px-1">
                    <button
                      type="button"
                      onClick={() => handleQuoteMessage(msg)}
                      title="Quote your message"
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-cyan-300 px-2 py-0.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60 hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <CornerUpLeft className="w-3 h-3 text-cyan-400" />
                      <span>Quote</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      title="Copy message"
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white px-2 py-0.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60 hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      {copiedMessageId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />

        {/* Speed-Dial Floating Action Button (FAB) */}
        <div className="absolute bottom-20 right-4 z-30 flex flex-col items-end gap-2">
          {isFabOpen && (
            <div className="flex flex-col items-end gap-2 animate-in slide-in-from-bottom duration-200">
              <button
                onClick={() => {
                  setIsFabOpen(false);
                  setIsCameraOpen(true);
                  triggerHaptic(20);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white shadow-xl text-xs font-bold transition-all cursor-pointer"
              >
                <span>Camera HUD Scan</span>
                <Camera className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setIsFabOpen(false);
                  setCurrentTab('voice-studio');
                  triggerHaptic(20);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-600 hover:bg-amber-500 text-white shadow-xl text-xs font-bold transition-all cursor-pointer"
              >
                <span>Audio Dictation</span>
                <Mic className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setIsFabOpen(false);
                  setCurrentTab('workflows');
                  triggerHaptic(20);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-xl text-xs font-bold transition-all cursor-pointer"
              >
                <span>Autonomous Workflows</span>
                <Zap className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setIsFabOpen(false);
                  setCurrentTab('benchmark');
                  triggerHaptic(20);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white shadow-xl text-xs font-bold transition-all cursor-pointer"
              >
                <span>WebGPU Benchmark</span>
                <Gauge className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setIsFabOpen(false);
                  setSandboxInitialCode('');
                  setIsCodeSandboxOpen(true);
                  triggerHaptic(20);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl text-xs font-bold transition-all cursor-pointer"
              >
                <span>Code Sandbox</span>
                <FileCode className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setIsFabOpen(false);
                  setTableModalMarkdown('');
                  setIsTableModalOpen(true);
                  triggerHaptic(20);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-600 hover:bg-teal-500 text-white shadow-xl text-xs font-bold transition-all cursor-pointer"
              >
                <span>Table Spreadsheet</span>
                <FileSpreadsheet className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setIsFabOpen(false);
                  setMathModalLatex('');
                  setIsMathModalOpen(true);
                  triggerHaptic(20);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white shadow-xl text-xs font-bold transition-all cursor-pointer"
              >
                <span>Math & LaTeX Solver</span>
                <Calculator className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={() => {
              setIsFabOpen(!isFabOpen);
              triggerHaptic(25);
            }}
            className={`w-11 h-11 rounded-full flex items-center justify-center shadow-2xl transition-all cursor-pointer ${
              isFabOpen
                ? 'bg-zinc-800 text-white rotate-45 border border-zinc-700'
                : 'bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-cyan-500/30 hover:scale-105 active:scale-95'
            }`}
            title="Speed Dial Mobile Quick Actions"
          >
            <Plus className="w-5 h-5 transition-transform" />
          </button>
        </div>
      </div>

      {/* Jump-to-Top: floating pill shown when scrolled far down */}
      {isScrolledDown && (
        <button
          onClick={() => {
            const el = messagesContainerRef.current;
            if (el) {
              el.scrollTo({ top: 0, behavior: 'smooth' });
            }
            triggerHaptic(10);
          }}
          aria-label="Jump to top of chat"
          title="Jump to top"
          className="absolute right-4 z-30 w-9 h-9 rounded-full border border-zinc-700/80 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 hover:text-white shadow-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 animate-in fade-in"
          style={{ bottom: `${(isFabOpen ? 420 : 196) + keyboardHeight + (isAwayFromBottom ? 50 : 0)}px` }}
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      )}

      {/* Jump-to-Latest: floating pill shown when scrolled away from bottom;
          offset includes keyboardHeight so it rides above the open keyboard */}
      {isAwayFromBottom && (
        <button
          onClick={() => {
            setIsAwayFromBottom(false);
            setUnreadStreamingTokens(0);
            const el = messagesContainerRef.current;
            if (el) {
              el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            }
            triggerHaptic(10);
          }}
          aria-label={isGenerating ? "Jump to streaming response" : "Jump to latest message"}
          title={isGenerating ? "Streaming active — click to view latest" : "Jump to latest message"}
          className={`absolute right-4 z-30 rounded-full border shadow-xl flex items-center transition-all cursor-pointer active:scale-95 animate-in fade-in slide-in-from-bottom duration-200 ${
            isGenerating
              ? 'px-3.5 py-2 bg-cyan-950/90 border-cyan-500/60 text-cyan-300 shadow-cyan-500/20 gap-1.5 text-xs font-bold'
              : 'w-11 h-11 justify-center bg-zinc-900 border-zinc-700 hover:border-cyan-500/40 text-cyan-400 shadow-cyan-500/10'
          }`}
          style={{ bottom: `${(isFabOpen ? 420 : 196) + keyboardHeight}px` }}
        >
          {isGenerating ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span>Streaming</span>
              {unreadStreamingTokens > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-cyan-400 text-black font-mono text-[9px] font-bold">
                  +{unreadStreamingTokens}
                </span>
              )}
              <ChevronDown className="w-4 h-4 ml-0.5 animate-bounce" />
            </>
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </button>
      )}

      {/* File-read failure: say out loud that a picked file was not attached. */}
      {uploadError && (
        <div role="alert" className="px-3 py-1.5 text-[11px] text-rose-300 bg-rose-950/40 border-t border-rose-900/50 flex items-center justify-between gap-2">
          <span className="truncate">{uploadError}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isOnline && readyModels.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(10);
                  setUploadError(null);
                  setCurrentTab('models');
                }}
                className="px-2 py-0.5 rounded bg-cyan-900/50 hover:bg-cyan-800/60 text-cyan-200 border border-cyan-500/40 text-[10px] font-bold transition-all cursor-pointer"
              >
                Open Model Hub
              </button>
            )}
            <button onClick={() => setUploadError(null)} className="text-rose-400 hover:text-rose-200 p-0.5" aria-label="Dismiss">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Pending Attachments Tray */}
      {pendingAttachments.length > 0 && (
        <div className="px-3 py-1.5 bg-zinc-900 border-t border-zinc-800 flex items-center gap-2 overflow-x-auto">
          {pendingAttachments.map((att) => (
            <div
              key={att.id}
              className="relative flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs shrink-0"
            >
              {att.type === 'image' || att.type === 'camera' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={att.dataUrl} alt={att.name} className="w-6 h-6 object-cover rounded" />
              ) : att.type === 'audio' ? (
                <AudioLines className="w-4 h-4 text-emerald-400" />
              ) : (
                <FileCode className="w-4 h-4 text-cyan-400" />
              )}
              <span className="text-[10px] text-zinc-300 max-w-[100px] truncate">{att.name}</span>
              <button
                onClick={() => removeAttachment(att.id)}
                className="text-zinc-500 hover:text-rose-400 p-0.5 ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Input Area */}
      <div
        className="p-2 bg-zinc-950 border-t border-zinc-800 z-20 shrink-0"
        style={{ paddingBottom: keyboardHeight > 0 ? `${keyboardHeight}px` : undefined }}
      >
        {justReconnected && isOnline && (
          <div className="mb-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-[11px] font-semibold flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Back Online — Connection restored</span>
            </div>
            <button
              onClick={() => setJustReconnected(false)}
              aria-label="Dismiss reconnect notification"
              className="p-1 -mr-1 text-emerald-400 hover:text-emerald-100 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {!isOnline && (
          <div className="mb-1.5 px-2.5 py-1.5 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-200 text-[11px] font-medium flex items-center justify-between shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-1.5 min-w-0">
              <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div className="truncate">
                {downloads[selectedModelId]?.isReady ? (
                  <span>
                    Offline mode — running on-device with {currentModel?.engine === 'cpu-wasm' ? 'CPU (WASM)' : 'WebGPU'}
                  </span>
                ) : (
                  <span className="text-amber-300 font-semibold">Active model requires internet</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {!downloads[selectedModelId]?.isReady && (
                <button
                  type="button"
                  onClick={handleSwitchToOfflineModel}
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold transition-all cursor-pointer"
                >
                  {readyModels[0] ? `Switch to ${readyModels[0].name.split(' ')[0]}` : 'Download Offline Model'}
                </button>
              )}
              <button
                type="button"
                onClick={handleRetryConnection}
                disabled={isCheckingConnection}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[10px] font-medium transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isCheckingConnection ? 'animate-spin text-amber-400' : ''}`} />
                <span>{isCheckingConnection ? 'Checking...' : 'Retry'}</span>
              </button>
            </div>
          </div>
        )}
        {fallbackNotice && (
          <div className="mb-1.5 px-2.5 py-1.5 rounded-lg bg-amber-950/70 border border-amber-500/50 text-amber-200 text-[11px] font-semibold flex items-center justify-between shadow-md animate-in fade-in slide-in-from-bottom duration-200">
            <div className="flex items-center gap-2 min-w-0 pr-1">
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">{fallbackNotice}</span>
            </div>
            <button
              onClick={clearFallbackNotice}
              aria-label="Dismiss fallback notification"
              className="p-1 -mr-1 text-amber-400 hover:text-amber-100 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {contextTrimToast && (
          <div className="mb-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-[11px] font-semibold flex items-center justify-between shadow-md animate-in fade-in duration-150">
            <span className="truncate">{contextTrimToast}</span>
            <button
              onClick={() => setContextTrimToast(null)}
              className="p-1 -mr-1 text-emerald-400 hover:text-emerald-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {isContextNearCapacity && !contextTrimToast && (
          <div className="mb-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-950/70 border border-indigo-500/50 text-indigo-200 text-[11px] font-medium flex items-center justify-between shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-1.5 min-w-0">
              <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">
                Context window {contextPercent}% full ({approxContextTokens} / {contextWindow} tokens)
              </span>
            </div>
            <button
              type="button"
              onClick={handleTrimContext}
              className="px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 hover:text-white border border-indigo-500/40 text-[10px] font-bold transition-all cursor-pointer shrink-0 ml-2"
              title="Trim earlier chat history to prevent on-device WebGPU memory throttling"
            >
              Trim History
            </button>
          </div>
        )}
        {/* Quick Actions (hidden only while the soft keyboard is open): the
            four former scroller chips now live behind one button + the same
            dropdown pattern as the mode menu - one visible control instead of
            a horizontal scrolling row. Every original onClick is preserved
            verbatim inside the menu. */}
        {!(keyboardHeight > 0 && isComposerFocused) && (
        <div className="relative flex items-center justify-end pb-1.5 pt-0.5 mb-1">
          <button
            onClick={() => setShowQuickActions((prev) => !prev)}
            aria-label="Quick actions"
            title="Share to Apps, Haptic Buzz, Set Reminder, Device Audit"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[10px] font-bold shrink-0 transition-all cursor-pointer shadow-sm ${
              showQuickActions
                ? 'bg-zinc-800 border-zinc-600 text-white'
                : 'bg-zinc-900 border-zinc-800 hover:border-cyan-500/40 text-zinc-300 hover:text-white'
            }`}
          >
            <Zap className="w-3 h-3 text-cyan-400" />
            <span>Quick Actions</span>
            <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${showQuickActions ? 'rotate-180' : ''}`} />
          </button>

          {showQuickActions && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                onClick={() => setShowQuickActions(false)}
              />
              <div className="absolute right-0 bottom-full mb-1.5 w-64 max-w-[92vw] bg-zinc-900 border border-zinc-700/90 rounded-2xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[10px] uppercase font-bold text-zinc-400 tracking-wider border-b border-zinc-800">
                  Quick Actions
                </div>

                <button
                  onClick={() => {
                    setShowQuickActions(false);
                    const lastAssistantMsg = messages.filter((m) => m.role === 'assistant').at(-1);
                    const textToShare = lastAssistantMsg?.content || 'Hermes Autonomous AI on Android: 100% on-device neural inference with zero cloud dependency.';
                    // One share path for the whole app: navigator.share does
                    // not exist in the Android WebView, so this used to fall
                    // straight to a silent clipboard write on the phone.
                    void shareTextToApps(textToShare, 'Hermes AI Share').then((outcome) => {
                      if (outcome !== 'unavailable') return;
                      void copyToClipboardSafe(textToShare, { saveToVault: true });
                    });
                  }}
                  title="Share last response to WhatsApp / Telegram / Android apps"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="flex-1">Share Last Reply</span>
                </button>

                <button
                  onClick={() => {
                    setShowQuickActions(false);
                    triggerHaptic([100, 50, 100]);
                  }}
                  title="Test phone tactile vibration motor"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  <Vibrate className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="flex-1">Haptic Buzz</span>
                </button>

                <button
                  onClick={() => {
                    const prompt = 'Remind me in 30 minutes to review on-device AI logs and battery status';
                    if (dispatchPromptSafely(prompt)) {
                      setInputVal('');
                      discardComposerDraft();
                    }
                    setShowQuickActions(false);
                  }}
                  title="Create phone task reminder"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  <Bell className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="flex-1">Set Reminder</span>
                </button>

                <button
                  onClick={() => {
                    const prompt = 'Audit phone battery, thermal load, and WebGPU tensor speeds';
                    if (dispatchPromptSafely(prompt)) {
                      setInputVal('');
                      discardComposerDraft();
                    }
                    setShowQuickActions(false);
                  }}
                  title="Audit phone system diagnostics"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  <Activity className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="flex-1">Device Audit</span>
                </button>
              </div>
            </>
          )}
        </div>
        )}

        {/* Microphone permission permanently denied: honest notice with the
            app-settings way out, instead of a bare alert. */}
        {micPermissionDenied && !isRecordingVoice && (
          <PermissionDeniedNotice
            permissionName="Microphone"
            onRetry={startWhatsAppVoiceRecording}
            onDismiss={() => setMicPermissionDenied(false)}
          />
        )}

        {/* Quote-Reply Preview Card */}
        {quotedMessage && !isRecordingVoice && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-900 border border-cyan-500/40 rounded-xl mb-1 text-xs shadow-lg animate-in fade-in duration-150">
            <div className="flex items-center gap-2 overflow-hidden flex-1">
              <div className="w-1 h-7 bg-cyan-400 rounded-full shrink-0" />
              <div className="overflow-hidden flex-1 leading-tight">
                <span className="text-[10px] font-bold text-cyan-300 flex items-center gap-1">
                  <CornerUpLeft className="w-3 h-3 text-cyan-400" />
                  <span>Replying to {quotedMessage.senderName}</span>
                </span>
                <span className="text-[11px] text-zinc-300 truncate block mt-0.5">
                  {quotedMessage.snippet}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(10);
                setQuotedMessage(null);
              }}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              aria-label="Dismiss reply quote"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Unsupported share: say why no draft was created instead of
            silently dropping the intent. */}
        {pendingShareNotice && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-950/60 border border-amber-500/40 rounded-xl mb-1 text-xs shadow-lg animate-in fade-in duration-150">
            <div className="flex items-center gap-2 overflow-hidden flex-1">
              <Share2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[11px] text-amber-200">{pendingShareNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(10);
                setPendingShareNotice(null);
              }}
              className="p-1 rounded-lg text-amber-300 hover:text-white hover:bg-amber-900/40 transition-colors cursor-pointer shrink-0"
              aria-label="Dismiss share notice"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Shared from another app: a one-line, dismissible note so the user
            knows where the draft came from and that it was not sent. */}
        {sharedDraftHint && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-900 border border-cyan-500/40 rounded-xl mb-1 text-xs shadow-lg animate-in fade-in duration-150">
            <div className="flex items-center gap-2 overflow-hidden flex-1">
              <Share2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-[11px] text-zinc-300 truncate">
                Shared from another app - review and send
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(10);
                setSharedDraftHint(false);
              }}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              aria-label="Dismiss shared draft hint"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {isRecordingVoice ? (
          <div className="flex flex-col gap-1.5 w-full animate-in fade-in duration-200">
            {/* Optional Noise Gate Settings Drawer */}
            {showNoiseGateSettings && (
              <div className="p-3 bg-zinc-950/95 border border-cyan-500/30 rounded-2xl shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-xs font-bold text-zinc-200">Microphone Noise Gate</span>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-cyan-300 font-semibold">
                    Cutoff: {noiseGateThreshold} dB
                  </span>
                </div>

                {/* Live Level Meter with Gate Marker */}
                <div className="space-y-1 mb-2.5">
                  <div className="flex items-center justify-between text-[9px] text-zinc-400 font-mono">
                    <span>0 dB (Silence)</span>
                    <span className={currentAudioDb >= noiseGateThreshold ? 'text-emerald-400 font-bold' : 'text-amber-400 font-semibold'}>
                      {currentAudioDb >= noiseGateThreshold ? '● Speech Active' : '○ Ambient Gated'} ({currentAudioDb} dB)
                    </span>
                    <span>60 dB (Loud)</span>
                  </div>
                  <div className="relative h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-75 rounded-full ${
                        currentAudioDb >= noiseGateThreshold
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                          : 'bg-gradient-to-r from-zinc-600 to-amber-500/60'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, (currentAudioDb / 60) * 100))}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_4px_#22d3ee] z-10"
                      style={{ left: `${Math.min(100, Math.max(0, (noiseGateThreshold / 60) * 100))}%` }}
                      title={`Gate Threshold: ${noiseGateThreshold} dB`}
                    />
                  </div>
                </div>

                {/* Slider */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] text-zinc-400 shrink-0">Threshold:</span>
                  <input
                    type="range"
                    min={0}
                    max={45}
                    step={1}
                    value={noiseGateThreshold}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setNoiseGateThreshold(val);
                      setStoredNoiseGateThreshold(val);
                    }}
                    className="w-full accent-cyan-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] text-zinc-500 mr-0.5">Presets:</span>
                  {[
                    { label: 'Quiet Room (10 dB)', val: 10 },
                    { label: 'Normal (18 dB)', val: 18 },
                    { label: 'Street/Cafe (28 dB)', val: 28 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => {
                        triggerHaptic(10);
                        setNoiseGateThreshold(preset.val);
                        setStoredNoiseGateThreshold(preset.val);
                      }}
                      className={`px-2 py-0.5 rounded text-[9px] font-medium border transition-colors ${
                        noiseGateThreshold === preset.val
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Live recognizer state: listening / partial / error reason.
                The transcript is otherwise hidden because the composer is
                replaced by this recording bar. */}
            <div className="px-1.5 text-[11px] leading-tight min-h-[1.1rem] truncate">
              {speechInputError ? (
                <span className="text-amber-300">{speechInputError}</span>
              ) : inputVal.trim() ? (
                <span className="text-cyan-200">&ldquo;{inputVal.trim()}&rdquo;</span>
              ) : speechListening ? (
                <span className="text-zinc-500 italic">Listening... speak now</span>
              ) : (
                <span className="text-zinc-500 italic">Microphone recording; waiting for the speech recognizer.</span>
              )}
            </div>

            {/* WhatsApp-Style Voice Recording Bar */}
            <div className="relative flex items-center justify-between gap-2 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-emerald-500/40 rounded-2xl px-3 py-2 shadow-2xl">
              {/* Pulsing Recording Indicator & Timer & dB Meter */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
                <div className="flex flex-col">
                  <span className="font-mono text-xs font-bold text-rose-400 tracking-wider">
                    {Math.floor(recordDurationSec / 60)}:{(recordDurationSec % 60).toString().padStart(2, '0')}
                  </span>
                  {currentAudioDb > 0 && (
                    <span className="font-mono text-[8px] text-zinc-400 leading-none">
                      {currentAudioDb} dB{' '}
                      <span className={currentAudioDb >= noiseGateThreshold ? 'text-emerald-400' : 'text-amber-400'}>
                        {currentAudioDb >= noiseGateThreshold ? 'ACT' : 'GATE'}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Real-time Dynamic Waveform Bars */}
              <div className="flex-1 flex items-center justify-center gap-1 max-w-[140px] sm:max-w-[180px] px-1 h-7">
                {waveformBars.map((heightPct, idx) => {
                  const isGated = currentAudioDb < noiseGateThreshold;
                  return (
                    <div
                      key={idx}
                      className="w-1 rounded-full transition-all duration-75"
                      style={{
                        height: `${heightPct}%`,
                        opacity: isGated ? 0.4 : 1,
                        backgroundColor: heightPct > 65 ? '#34d399' : heightPct > 35 ? '#10b981' : '#059669',
                      }}
                    />
                  );
                })}
              </div>

              {/* Actions & Noise Gate Trigger */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(10);
                    setShowNoiseGateSettings((prev) => !prev);
                  }}
                  title={`Noise Gate: ${noiseGateThreshold} dB`}
                  className={`px-1.5 py-1.5 rounded-xl text-[9px] font-bold border transition-colors cursor-pointer select-none flex items-center gap-1 ${
                    showNoiseGateSettings
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                      : currentAudioDb >= noiseGateThreshold
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-zinc-800/80 text-zinc-400 border-zinc-700'
                  }`}
                >
                  <SlidersHorizontal className="w-2.5 h-2.5" />
                  <span>{noiseGateThreshold}dB</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(10);
                    setIsAutoSendOnSilence((prev) => !prev);
                  }}
                  title={isAutoSendOnSilence ? 'Auto-send enabled (sends 2.8s after pause)' : 'Manual send mode'}
                  className={`px-2 py-1.5 rounded-xl text-[9px] font-bold border transition-colors cursor-pointer select-none ${
                    isAutoSendOnSilence
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-zinc-800/80 text-zinc-400 border-zinc-700'
                  }`}
                >
                  {isAutoSendOnSilence ? 'Auto' : 'Manual'}
                </button>

                <button
                  onClick={cancelVoiceRecording}
                  title="Cancel recording"
                  className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-rose-950/60 border border-zinc-700/60 hover:border-rose-500/50 text-zinc-400 hover:text-rose-400 text-xs font-medium transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={finishVoiceRecordingAndSend}
                  title="Send voice note to LLM"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative flex items-end gap-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl p-1.5 focus-within:border-cyan-500/50 transition-all shadow-xl">
            {/* Action Buttons: Camera, Gallery, Files (Filtered based on current operating purpose mode) */}
            <div className="flex items-center gap-0.5 pb-0.5 pl-1">
              {/* Camera: Visible in vision and agent modes */}
              {(operatingMode === 'vision' || operatingMode === 'agent') && (
                <button
                  onClick={() => setIsCameraOpen(true)}
                  title="Camera snapshot"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                </button>
              )}

              {/* Gallery Image: Visible in vision, agent, chat, and embedding search modes */}
              {(operatingMode === 'vision' || operatingMode === 'agent' || operatingMode === 'chat' || operatingMode === 'embedding') && (
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  title="Image or Video upload to index/search"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-cyan-400" />
                </button>
              )}

              {/* File / Document: Visible in chat, agent, vision, and embedding search modes */}
              {(operatingMode === 'chat' || operatingMode === 'agent' || operatingMode === 'vision' || operatingMode === 'embedding') && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Document, video, or file attachment to search/index"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  <Paperclip className="w-4 h-4 text-cyan-400" />
                </button>
              )}

              {/* Smart Prompt Snippets & System Directives Trigger */}
              <button
                type="button"
                onClick={() => setShowSnippetsDrawer(true)}
                title="Smart Prompt Snippets & Custom Directives"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-amber-400" />
              </button>
            </div>

            {/* Hidden File Inputs */}
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleGalleryUpload}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.java,.cpp,.c,.rs,.go,.html,.css,.csv,.xml,.yaml,.yml,.log,.pdf"
              multiple
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* Clean Prompt Input Area */}
            <div className="flex flex-col flex-1 min-w-0">
              {/* Prompt Textarea */}
              <textarea
                ref={composerRef}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                autoCorrect="off"
                onFocus={() => setIsComposerFocused(true)}
                onBlur={() => setIsComposerFocused(false)}
                onKeyDown={handleKeyDown}
                placeholder={
                  operatingMode === 'vision' || currentModel?.category === 'vision'
                    ? 'Ask about an image, take a camera snapshot, or analyze a photo...'
                    : operatingMode === 'image-gen' || currentModel?.category === 'image'
                    ? 'Describe what you want to draw (e.g. Cyberpunk city in neon rain)...'
                    : operatingMode === 'voice' || currentModel?.category === 'voice'
                    ? 'Enter text for neural voice reading or hold Mic button...'
                    : operatingMode === 'embedding' || currentModel?.category === 'embedding'
                    ? 'Find files (e.g. "beach vacation video", "receipt store image", "quarterly pdf")...'
                    : operatingMode === 'agent'
                    ? 'Ask Hermes to solve, search, code, analyze docs...'
                    : 'Chat with local model...'
                }
                rows={1}
                className="w-full bg-transparent text-xs text-white placeholder-zinc-500 resize-none py-1.5 px-1 focus:outline-none max-h-28"
              />
              {inputVal.trim().length > 15 && (
                <div className="flex items-center justify-between px-1 pb-0.5 text-[9px] font-mono text-zinc-500 select-none">
                  <span>{inputVal.length} chars • ~{Math.ceil(inputVal.length / 4)} tokens</span>
                  {inputVal.length > 800 && (
                    <span className="text-amber-400 font-sans">Long input</span>
                  )}
                </div>
              )}
            </div>

            {/* WhatsApp-Style Push-to-Talk Microphone Button */}
            <button
              type="button"
              onClick={startWhatsAppVoiceRecording}
              title="Record voice note (WhatsApp style)"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800/80 border border-zinc-700/80 text-zinc-300 hover:text-emerald-400 hover:bg-zinc-800 transition-all cursor-pointer group"
            >
              <Mic className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </button>

            {/* Send or Stop Generation Button */}
            {isGenerating ? (
              <button
                type="button"
                onClick={stopAllRunningTasks}
                title="Stop generation"
                className="p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30 transition-all cursor-pointer animate-pulse"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={(!inputVal.trim() && pendingAttachments.length === 0)}
                className="p-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Unready Model Download Prompt Modal */}
      {modelPromptDownload && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 max-w-sm w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                <Download className="w-4 h-4" />
                <span>Download Model Weights</span>
              </div>
              <button
                onClick={() => setModelPromptDownload(null)}
                className="text-zinc-500 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-white font-bold text-base mb-1">{modelPromptDownload.name}</h3>
              <p className="text-xs text-zinc-400">{modelPromptDownload.tagline}</p>
            </div>

            <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/80 space-y-1 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Weight Size:</span>
                <span className="font-mono text-zinc-200">{(modelPromptDownload.sizeMB / 1024).toFixed(2)} GB</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Parameters:</span>
                <span className="font-mono text-zinc-200">{modelPromptDownload.parameters}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Quantization:</span>
                <span className="font-mono text-zinc-200">{modelPromptDownload.quantization}</span>
              </div>
            </div>

            <p className="text-[11px] text-amber-400/90 leading-relaxed">
              This model is not downloaded locally yet. Would you like to download its weights to your device now?
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setModelPromptDownload(null)}
                className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const m = modelPromptDownload;
                  setModelPromptDownload(null);
                  startDownloadModel(m.id);
                  setSelectedModelId(m.id);
                  if (m.category === 'image') {
                    setOperatingMode('image-gen');
                  } else if (m.category === 'vision') {
                    setOperatingMode('vision');
                  } else if (m.category === 'voice') {
                    setOperatingMode('voice');
                  } else if (m.category === 'embedding') {
                    setOperatingMode('embedding');
                  } else if (m.capabilities.includes('agent')) {
                    setOperatingMode('agent');
                  } else {
                    setOperatingMode('chat');
                  }
                  setCurrentTab('models');
                }}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold shadow-md shadow-cyan-500/20 flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Modal */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(att) => {
          if (!addAttachment(att)) {
            alert('Attachment limit reached (10 files or 12 MB). Send or clear the current batch first.');
          }
        }}
      />

      {/* Starred Bookmarks Drawer */}
      {showBookmarksDrawer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-end animate-in fade-in">
          <div className="bg-zinc-900 border-l border-zinc-800 w-full max-w-md h-full flex flex-col shadow-2xl p-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Saved Insights & Bookmarks</h3>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-mono font-bold">
                  {starredMessageIds.length}
                </span>
              </div>
              <button
                onClick={() => setShowBookmarksDrawer(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bookmark Filter Search */}
            {allStarredMessages.length > 1 && (
              <div className="relative my-2">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter saved bookmarks..."
                  value={bookmarkSearchQuery}
                  onChange={(e) => setBookmarkSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
                {bookmarkSearchQuery && (
                  <button
                    onClick={() => setBookmarkSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Bookmarks List */}
            <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
              {allStarredMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-2">
                  <Star className="w-8 h-8 opacity-40 text-amber-400" />
                  <p className="text-xs">No saved messages yet.</p>
                  <p className="text-[10px] text-zinc-600">Tap the &quot;Save&quot; star icon on any response to bookmark key insights.</p>
                  {starredMessageIds.length > 0 && (
                    <p className="text-[10px] text-zinc-600">
                      {starredMessageIds.length} starred message{starredMessageIds.length === 1 ? '' : 's'} no longer exist{starredMessageIds.length === 1 ? 's' : ''} (the session was cleared or deleted).
                    </p>
                  )}
                </div>
              ) : (
                allStarredMessages
                  .filter((msg) =>
                    bookmarkSearchQuery.trim()
                      ? msg.content.toLowerCase().includes(bookmarkSearchQuery.toLowerCase()) ||
                        (msg.modelUsed || '').toLowerCase().includes(bookmarkSearchQuery.toLowerCase())
                      : true
                  )
                  .map((msg) => (
                    <div key={msg.id} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
                      <div className="flex items-center justify-between text-[10px] text-zinc-400">
                        <span className="font-bold text-cyan-400">{msg.modelUsed || 'Hermes AI'}</span>
                        <button
                          onClick={() => toggleStarMessage(msg.id)}
                          className="text-rose-400 hover:text-rose-300 text-[10px] flex items-center gap-0.5 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Remove</span>
                        </button>
                      </div>
                      <p className="text-xs text-zinc-200 line-clamp-4 font-mono whitespace-pre-wrap leading-relaxed">
                        {msg.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()}
                      </p>
                      <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
                        <button
                          onClick={() => handleJumpToBookmarkedMessage(msg.id)}
                          className="flex items-center gap-1 text-[10px] text-amber-300 hover:text-white px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all cursor-pointer"
                          title="Jump directly to this message in chat"
                        >
                          <ExternalLink className="w-3 h-3 text-amber-400" />
                          <span>Jump to Chat</span>
                        </button>
                        <button
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white px-2 py-1 rounded bg-zinc-900 border border-zinc-800 cursor-pointer"
                        >
                          {copiedMessageId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedMessageId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                          onClick={() => {
                            void shareTextToApps(msg.content, 'Saved Insight').then((outcome) => {
                              if (outcome === 'unavailable') void handleCopyMessage(msg.id, msg.content);
                            });
                          }}
                          className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white px-2 py-1 rounded bg-zinc-900 border border-zinc-800 cursor-pointer"
                        >
                          <Share2 className="w-3 h-3 text-cyan-400" />
                          <span>Share</span>
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-mono">Persisted on device</span>
              <button
                onClick={() => setShowBookmarksDrawer(false)}
                className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Smart Prompt Snippets & System Directives Drawer */}
      {showSnippetsDrawer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-end animate-in fade-in">
          <div className="bg-zinc-900 border-l border-zinc-800 w-full max-w-md h-full flex flex-col shadow-2xl p-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Prompt Snippets & Directives</h3>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-mono font-bold">
                  {BUILTIN_SNIPPETS.length + customSnippets.length}
                </span>
              </div>
              <button
                onClick={() => {
                  setShowSnippetsDrawer(false);
                  setIsAddingSnippet(false);
                }}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 py-2.5 overflow-x-auto scrollbar-none border-b border-zinc-800/80">
              {[
                { id: 'all', label: 'All' },
                { id: 'reasoning', label: '🧠 Reasoning' },
                { id: 'code', label: '🛡️ Code' },
                { id: 'productivity', label: '📊 Productivity' },
                { id: 'mobile', label: '📱 Mobile' },
                { id: 'custom', label: `⭐ Custom (${customSnippets.length})` },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSnippetCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    snippetCategory === cat.id
                      ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Create Custom Snippet Expandable Form */}
            <div className="py-2">
              {!isAddingSnippet ? (
                <button
                  onClick={() => setIsAddingSnippet(true)}
                  className="w-full py-1.5 px-3 rounded-xl border border-dashed border-zinc-700 hover:border-amber-500/60 text-xs font-semibold text-zinc-400 hover:text-amber-400 flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-zinc-950/40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Custom Snippet</span>
                </button>
              ) : (
                <div className="p-3 bg-zinc-950 rounded-xl border border-amber-500/40 space-y-2.5 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400">New Custom Prompt</span>
                    <button
                      onClick={() => setIsAddingSnippet(false)}
                      className="text-zinc-500 hover:text-zinc-300 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Snippet Title (e.g. SQL Query Generator)"
                    value={newSnippetTitle}
                    onChange={(e) => setNewSnippetTitle(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <textarea
                    rows={3}
                    placeholder="Enter system prompt directive or reusable instructions..."
                    value={newSnippetDirective}
                    onChange={(e) => setNewSnippetDirective(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                  />
                  <button
                    onClick={handleSaveCustomSnippet}
                    disabled={!newSnippetTitle.trim() || !newSnippetDirective.trim()}
                    className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs disabled:opacity-40 transition-all cursor-pointer"
                  >
                    Save Snippet
                  </button>
                </div>
              )}
            </div>

            {/* Snippets Scrollable List */}
            <div className="flex-1 overflow-y-auto py-1 space-y-2.5">
              {[...customSnippets, ...BUILTIN_SNIPPETS]
                .filter((s) => snippetCategory === 'all' || s.category === snippetCategory)
                .map((snippet) => (
                  <div key={snippet.id} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2 group hover:border-zinc-700 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        {snippet.title}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                          {snippet.category}
                        </span>
                        {snippet.category === 'custom' && (
                          <button
                            onClick={() => handleDeleteCustomSnippet(snippet.id)}
                            className="p-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                            title="Delete custom snippet"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-zinc-400 line-clamp-3 font-mono leading-relaxed bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/60">
                      {snippet.directive}
                    </p>

                    <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/80">
                      <button
                        onClick={() => handleInsertSnippet(snippet.directive)}
                        className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Insert in Prompt</span>
                      </button>
                      <button
                        onClick={() => handleExecuteSnippetNow(snippet.directive)}
                        className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-md shadow-amber-500/20"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Run Now</span>
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-mono">100% On-Device Macros</span>
              <button
                onClick={() => {
                  setShowSnippetsDrawer(false);
                  setIsAddingSnippet(false);
                }}
                className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Code Sandbox Modal */}
      <CodeSandboxModal
        isOpen={isCodeSandboxOpen}
        initialCode={sandboxInitialCode}
        onClose={() => setIsCodeSandboxOpen(false)}
      />

      {/* Markdown Table & CSV Spreadsheet Modal */}
      <TableSpreadsheetModal
        isOpen={isTableModalOpen}
        markdownContent={tableModalMarkdown}
        onClose={() => setIsTableModalOpen(false)}
      />

      {/* Chat & Agent History Drawer Modal */}
      <ChatHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
      />

      {/* Multi-Format Offline Document Exporter Modal */}
      <ExportDocumentModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        session={currentSession}
        modelName={currentModel?.name}
      />

      {/* LaTeX Math Formula & Step-by-Step Solver Modal */}
      <MathFormulaModal
        isOpen={isMathModalOpen}
        initialLatex={mathModalLatex}
        onClose={() => setIsMathModalOpen(false)}
      />

      {/* Offline Markdown Presentation Slide Deck Modal */}
      <SlideDeckModal
        isOpen={isSlideDeckOpen}
        initialContent={slideDeckContent}
        deckTitle={slideDeckTitle}
        onClose={() => setIsSlideDeckOpen(false)}
      />

      {/* Context Window Compressor & Scratchpad Pinning Modal */}
      <ContextCompressorModal
        isOpen={isCompressorModalOpen}
        onClose={() => setIsCompressorModalOpen(false)}
        activeSessionId={operatingMode === 'agent' ? activeAgentSessionId : activeChatSessionId}
      />

      {/* Spatial & Hardware Sensor Telemetry Modal */}
      <SensorSpatialModal
        isOpen={isSensorModalOpen}
        onClose={() => setIsSensorModalOpen(false)}
        onInsertTelemetry={(telemetryText) => setInputVal((prev) => (prev ? prev + '\n\n' + telemetryText : telemetryText))}
        onAuditWithAgent={(prompt) => dispatchPromptSafely(prompt)}
      />

      {/* Smart Clipboard Vault Modal */}
      <ClipboardVaultModal
        isOpen={isClipboardVaultOpen}
        onClose={() => setIsClipboardVaultOpen(false)}
        onInsert={(text) => setInputVal((prev) => (prev ? prev + '\n\n' + text : text))}
        onAuditWithAgent={(prompt) => dispatchPromptSafely(prompt)}
      />

      {/* Offline Travel Phrase Book Modal */}
      <OfflinePhraseBookModal
        isOpen={isPhraseBookOpen}
        onClose={() => setIsPhraseBookOpen(false)}
      />

      {/* Network Speed Analyzer Modal */}
      <NetworkSpeedModal
        isOpen={isNetworkSpeedOpen}
        onClose={() => setIsNetworkSpeedOpen(false)}
        onAuditWithAgent={(prompt) => dispatchPromptSafely(prompt)}
      />

      {/* Markdown Notepad & Document Vault Modal */}
      <MarkdownNotepadModal
        isOpen={isNotepadOpen}
        onClose={() => setIsNotepadOpen(false)}
        onInsertIntoChat={(text) => setInputVal((prev) => (prev ? prev + '\n\n' + text : text))}
        onAuditWithAgent={(prompt) => dispatchPromptSafely(prompt)}
      />

      {/* QR Code & Barcode Studio Modal */}
      <QRCodeStudioModal
        isOpen={isQRCodeStudioOpen}
        onClose={() => setIsQRCodeStudioOpen(false)}
        onInsertIntoChat={(text) => setInputVal((prev) => (prev ? prev + '\n\n' + text : text))}
        onAuditWithAgent={(prompt) => dispatchPromptSafely(prompt)}
      />

      {/* Real-time Hands-Free ChatGPT Voice Call Modal */}
      <VoiceCallModal
        isOpen={isVoiceCallOpen}
        onClose={() => setIsVoiceCallOpen(false)}
      />
    </div>
  );
}
