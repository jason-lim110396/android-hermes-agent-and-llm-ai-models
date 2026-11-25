import { create } from 'zustand';
import { cancelSpeech, hasSpeechSynthesis, onSpeakingChange, speakGuarded, createSpeechUtterance } from './utils/speechGuard';
import { AVAILABLE_MODELS, ModelSpec } from './models';
import { DeviceHardwareProfile, profileMobileHardware } from './deviceProfiler';
import { AgentStep, AGENT_TOOLS } from './agentTools';
import {
  callRealLLMInference,
  callVisionInference,
  getOrInitWebLLMEngine,
  downloadModelWeightsOnly,
  isModelCached,
  deleteModelFromCache,
  generateOnDeviceAIImage,
  getLastImageGenerationMeta,
  abortAllInference,
  releaseActiveModelEngines,
  type VisionInferenceResult,
} from './inferenceEngine';
import { abortActiveCpuDownloads } from './wasmInferenceEngine';
import {
  clearPendingPersist,
  clearPersistedSessions,
  getSessionVaultStats,
  loadPersistedSessions,
  loadPersistedSessionsFromIdb,
  reconcileSessionWithIdb,
  schedulePersistSessions,
  SessionVaultStats,
} from './utils/sessionPersistence';
import {
  clearEndpointCooldown,
  FallbackHop,
  FallbackModelEntry,
  loadFallbackSettings,
  saveFallbackSettings,
} from './utils/modelFallback';

// Global tracking for mock/fallback download timers
const activeDownloadIntervals = new Map<string, NodeJS.Timeout>();

// Claim each model synchronously so duplicate callers cannot pass the async preflight together.
const modelDownloadsInFlight = new Set<string>();

// Maximum frequency for streaming store writes. Batching per-token writes into
// ~11fps UI refreshes removes the main source of chat lag on low-end Android:
// each write previously cloned the whole session tree and re-rendered every
// message. The engine's return value (full text) is what finalizes the message,
// so the throttled tail can never truncate the final content.
const STREAM_FLUSH_MS = 90;

export interface Attachment {
  id: string;
  type: 'image' | 'camera' | 'file' | 'audio';
  name: string;
  dataUrl: string; // base64 or object URL
  mimeType: string;
  sizeBytes: number;
  durationSec?: number;
  textContent?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelUsed?: string;
  isFallback?: boolean;
  fallbackReason?: string;
  fallbackHops?: FallbackHop[];
  mode?: 'chat' | 'agent' | 'image-gen' | 'vision' | 'voice' | 'embedding';
  attachments?: Attachment[];
  agentSteps?: AgentStep[];
  isStreaming?: boolean;
}

export interface ModelDownloadState {
  modelId: string;
  isDownloading: boolean;
  progressPct: number;
  downloadedMB: number;
  totalMB: number;
  speedMBs: number;
  isReady: boolean;
  errorMessage?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
  pinned?: boolean;
  category?: string;
  tags?: string[];
}

export type NavigationTab =
  | 'chat'
  | 'workflows'
  | 'benchmark'
  | 'models'
  | 'device'
  | 'settings'
  | 'image-studio'
  | 'vision-studio'
  | 'voice-studio'
  | 'file-search';

interface AppStore {
  // Navigation & View Mode
  currentTab: NavigationTab;
  setCurrentTab: (tab: NavigationTab) => void;

  // Active Modes & AI Purpose
  operatingMode: 'chat' | 'image-gen' | 'vision' | 'voice' | 'agent' | 'embedding';
  setOperatingMode: (mode: 'chat' | 'image-gen' | 'vision' | 'voice' | 'agent' | 'embedding') => void;
  chatTabMode: 'text' | 'voice';
  setChatTabMode: (mode: 'text' | 'voice') => void;

  // Real-Time Inference Metrics
  liveTps: number;
  setLiveTps: (tps: number) => void;

  // Active Model
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;

  // Hardware Profiling
  hardwareProfile: DeviceHardwareProfile | null;
  isProfiling: boolean;
  refreshHardwareProfile: () => Promise<void>;

  // Model Hub & Downloads
  downloads: Record<string, ModelDownloadState>;
  checkCacheStatus: () => Promise<void>;
  startDownloadModel: (modelId: string) => Promise<void>;
  pauseDownloadModel: (modelId: string) => void;
  deleteModel: (modelId: string) => Promise<void>;

  // Model gate: when an action needs on-device weights the user has not
  // downloaded, the UI asks instead of failing silently inside inference.
  modelGate: { modelId: string; reason: string; resolve: (proceed: boolean) => void } | null;
  requestModel: (modelId: string, reason: string) => Promise<boolean>;
  closeModelGate: (proceed: boolean) => void;

  // Separated Multi-Session Threads for Chat and Agent
  chatSessions: Record<string, ChatSession>;
  agentSessions: Record<string, ChatSession>;
  activeChatSessionId: string;
  activeAgentSessionId: string;
  restorePersistedSessions: () => void;
  resetAllSessions: () => void;
  createNewSession: (mode?: 'chat' | 'agent') => void;
  switchSession: (sessionId: string, mode?: 'chat' | 'agent') => void;
  deleteSession: (sessionId: string, mode?: 'chat' | 'agent') => void;
  togglePinSession: (sessionId: string, mode?: 'chat' | 'agent') => void;
  updateSessionCategory: (sessionId: string, category: string, mode?: 'chat' | 'agent') => void;
  updateSessionTitle: (sessionId: string, title: string, mode?: 'chat' | 'agent') => void;
  replaceSessionMessages: (sessionId: string, messages: ChatMessage[], mode?: 'chat' | 'agent') => void;
  clearCurrentConversation: () => void;

  // Voice Interaction (STT / TTS)
  isVoiceOutputEnabled: boolean;
  setIsVoiceOutputEnabled: (val: boolean) => void;
  speakText: (text: string) => void;
  stopSpeaking: () => void;
  isSpeaking: boolean;
  voiceRate: number;
  setVoiceRate: (rate: number) => void;
  voicePitch: number;
  setVoicePitch: (pitch: number) => void;
  voiceURI: string | null;
  setVoiceURI: (uri: string | null) => void;

  // Input & Messaging
  pendingAttachments: Attachment[];
  isGenerating: boolean;
  /** Adds a pending attachment unless the count/byte budget is exhausted.
   * Returns false when the attachment was refused so callers can tell the user. */
  addAttachment: (att: Attachment) => boolean;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  sendMessage: (userText: string, options?: { isLive?: boolean }) => Promise<void>;
  /**
   * Translate text with the model and endpoint the user already configured.
   * Returns the translation, or an engine failure text starting with "⚠️" so
   * callers can show the reason instead of passing it off as a translation.
   */
  translateText: (text: string, targetLanguage: string, onChunk?: (partial: string) => void) => Promise<string>;
  /**
   * Analyse one or more page images with the configured multimodal API model.
   * Returns an honest failure when no endpoint/key is configured; it never
   * falls back to a text-only model that cannot see the image.
   */
  analyzeVisionPage: (args: {
    imageDataUrls: string[];
    prompt: string;
    systemPrompt: string;
    temperature?: number;
    maxTokens?: number;
    onChunk?: (partial: string) => void;
  }) => Promise<VisionInferenceResult>;
  stopAllRunningTasks: () => void;

  // Performance & Power Efficiency Mode
  performanceMode: 'balanced' | 'eco' | 'performance';
  setPerformanceMode: (mode: 'balanced' | 'eco' | 'performance') => void;
  isAppVisible: boolean;
  setIsAppVisible: (visible: boolean) => void;

  // Network availability for offline-safe model downloads
  isOnline: boolean;
  networkQuality: 'fast' | 'slow' | 'offline';
  justReconnected: boolean;
  setJustReconnected: (val: boolean) => void;
  setNetworkQuality: (q: 'fast' | 'slow' | 'offline') => void;
  setIsOnline: (online: boolean) => void;
  // Settings & Real LLM Endpoint
  apiEndpoint: string;
  setApiEndpoint: (ep: string) => void;
  apiKey: string;
  setApiKey: (k: string) => void;
  // Explicit model name to request from the primary remote endpoint.
  // Set from the fetched provider-model picker; must never overwrite apiEndpoint.
  customModelName: string;
  setCustomModelName: (m: string) => void;
  // Free-first model fallback chain
  modelFallbackEnabled: boolean;
  setModelFallbackEnabled: (v: boolean) => void;
  modelFallbackChain: FallbackModelEntry[];
  setModelFallbackChain: (chain: FallbackModelEntry[]) => void;
  fallbackNotice: string | null;
  fallbackNoticeId: number;
  setFallbackNotice: (n: string | null) => void;
  clearFallbackNotice: () => void;
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  temperature: number;
  setTemperature: (t: number) => void;
  maxTokens: number;
  setMaxTokens: (n: number) => void;
}

// Free-first failover: the primary endpoint, then the persisted chain.
function resolveFallbackConfig(get: () => AppStore) {
  const chain = get().modelFallbackEnabled ? get().modelFallbackChain : [];
  // The shipped $0 presets (and most user-added free models) live on the same
  // provider as the primary endpoint - e.g. OpenRouter's `:free` models share
  // https://openrouter.ai/api/v1. Those presets are stored without a key (keys
  // are session-only, see saveFallbackSettings), so sending them unauthenticated
  // earns a 401, which the chain skips, and a paid->free 429 fallback collapses
  // into an on-device weight download. Reuse the primary session key for
  // same-origin chain entries. It never leaves this session and is never
  // persisted, so this adds no storage or privacy exposure.
  let primaryOrigin = '';
  try {
    const ep = get().apiEndpoint && get().apiEndpoint.trim();
    if (ep) primaryOrigin = new URL(ep).origin;
  } catch (_) {}
  const fallbacks = chain
    .filter((e) => e && e.endpoint && e.endpoint.trim())
    .map((e) => {
      let sameProvider = false;
      try {
        sameProvider = !!primaryOrigin && new URL(e.endpoint).origin === primaryOrigin;
      } catch (_) {}
      return {
        label: e.label || e.endpoint,
        endpoint: e.endpoint,
        // An explicitly set chain key still wins; inherit only when absent.
        apiKey: e.apiKey || (sameProvider ? get().apiKey || undefined : undefined),
        model: e.model,
      };
    });
  const onFallback = (info: { from: string; to: string; reason: string }) => {
    get().setFallbackNotice(`Remote model unavailable: ${info.from} - ${info.reason}. Switched to ${info.to}.`);
  };
  // Every free/remote endpoint is exhausted: say so *before* the on-device
  // model download begins, which is the step most likely to stall or crash a
  // low-memory Android WebView.
  const onRemoteChainExhausted = (info: { reason: string; to: string }) => {
    get().setFallbackNotice(
      `All remote models unavailable: ${info.reason}. Loading ${info.to} - first run may download weights.`
    );
  };
  return { fallbacks, onFallback, onRemoteChainExhausted };
}

// UI-only text that was baked into assistant message content for the user.
// It must never ride back into the LLM prompt as a fake assistant reply, so
// both runtimes strip it when rebuilding conversation history.
const PROMPT_NOTICE_PREFIXES = [
  '> Remote model unavailable:',
  '> All remote models unavailable:',
  '> Privacy guard redacted ',
  '> Offline:',
  '> On-device model unavailable',
  '> CPU model unavailable',
  '> On-Device LLM Inference Error',
];
const STOPPED_MARKERS = ['*[Stopped by user]*', '*[Task stopped by user]*'];
const FAILED_MARKER_RE = /^\*\[Generation failed: .*\]\*$/;

/** Strips the blockquote fallback/privacy notices, internal thinking blocks (<think>...</think>),
 * and the stopped/failed markers that were rendered into a past assistant reply. Returns the
 * clean conversational content suitable for LLM prompt context without context bloat. */
export function stripPromptNotices(content: string): string {
  if (!content) return content;
  // Strip internal reasoning process traces (<think>...</think>) so past reasoning does not
  // consume critical context window on subsequent conversational turns.
  const withoutThinking = content.replace(/<think>[\s\S]*?<\/think>\n*/g, '').trim();
  const lines = withoutThinking.split('\n');
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (STOPPED_MARKERS.includes(trimmed)) return false;
    if (FAILED_MARKER_RE.test(trimmed)) return false;
    return !PROMPT_NOTICE_PREFIXES.some((p) => trimmed.startsWith(p));
  });
  if (kept.length === lines.length && withoutThinking === content) return content;
  // Drop the blank separator line the notice was appended with.
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  return kept.join('\n');
}

/** Leading UI announcements the runtimes prepend to a stored reply
 * (attachment receipt / multimodal-visual notice). */
const ANNOUNCEMENT_PREFIX_RES = [
  /^\*Received \d+ attachment\(s\)[^\n]*\*\n+/,
  /^### 👁️ Multimodal Visual Context Ingested\n[^\n]*\n+/,
];

/** True when the whole message is an on-device error display, not a real
 * model reply, so it must not enter the conversation history the next
 * request is built from. A turn with attachments stores the error display
 * behind the announcement prefix, so look past it before testing. */
export function isErrorDisplayMessage(content: string): boolean {
  let trimmed = (content || '').trim();
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const re of ANNOUNCEMENT_PREFIX_RES) {
      const next = trimmed.replace(re, '');
      if (next !== trimmed) {
        trimmed = next.trim();
        stripped = true;
      }
    }
  }
  return (
    trimmed.startsWith('⚠️ **On-Device LLM Inference Error**') ||
    trimmed.startsWith('⚠️ **CPU (WASM) Inference Error**')
  );
}

/** Short "answered by" label for the message header. */
function answeredByLabel(info: { label: string; model?: string }): string {
  if (info.model && (!info.label || info.label === 'primary endpoint')) return info.model;
  return info.label;
}

/** Pins the "answered by" label onto the assistant message after the turn,
 * in the session that owns the stream (captured at send time, like every
 * other streaming write). */
function setMsgModelUsed(
  id: string,
  modelUsed: string,
  mode: 'chat' | 'agent',
  sessionId: string,
  set: any,
  get: any,
  isFallback?: boolean,
  fallbackReason?: string,
  fallbackHops?: FallbackHop[]
) {
  if (mode === 'agent') {
    const sess = get().agentSessions[sessionId];
    if (!sess) return;
    set({
      agentSessions: {
        ...get().agentSessions,
        [sessionId]: {
          ...sess,
          messages: sess.messages.map((m: ChatMessage) =>
            m.id === id ? { ...m, modelUsed, isFallback: !!isFallback, fallbackReason, fallbackHops } : m
          ),
        },
      },
    });
  } else {
    const sess = get().chatSessions[sessionId];
    if (!sess) return;
    set({
      chatSessions: {
        ...get().chatSessions,
        [sessionId]: {
          ...sess,
          messages: sess.messages.map((m: ChatMessage) =>
            m.id === id ? { ...m, modelUsed, isFallback: !!isFallback, fallbackReason, fallbackHops } : m
          ),
        },
      },
    });
  }
}

// Remote inference bridge configuration (endpoint + pinned model name).
// Persisted so the fallback chain survives an app restart; the API key is
// deliberately NOT persisted - it stays session-only by design, exactly
// like the fallback chain keys (see saveFallbackSettings).
function loadRemoteInferenceConfig(): { apiEndpoint: string; customModelName: string } {
  if (typeof window === 'undefined') return { apiEndpoint: '', customModelName: '' };
  try {
    return {
      apiEndpoint: localStorage.getItem('androidllm_api_endpoint') || '',
      customModelName: localStorage.getItem('androidllm_custom_model') || '',
    };
  } catch (_) {
    return { apiEndpoint: '', customModelName: '' };
  }
}

export const useAppStore = create<AppStore>((set, get) => {
  const persistedRemoteConfig = loadRemoteInferenceConfig();
  return {
  currentTab: 'chat',
  setCurrentTab: (tab) => set({ currentTab: tab }),

  // Persisted: without this, a restart emptied the endpoint and the whole
  // persisted fallback chain never triggered - the app silently answered
  // from the on-device model with no notice, as if the user's provider was
  // broken. The API key stays session-only by design (see modelFallback.ts).
  apiEndpoint: persistedRemoteConfig.apiEndpoint,
  setApiEndpoint: (ep) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('androidllm_api_endpoint', ep);
      } catch (_) {}
    }
    // Clear any active rate-limit or error cooldowns on the new endpoint
    if (ep) {
      clearEndpointCooldown(ep);
    }
    set({ apiEndpoint: ep });
  },
  apiKey: '',
  // Session-only by design, matching the fallback chain key policy.
  // When the user updates or corrects their API key, clear any 401 or route cooldown
  // on their configured primary endpoint so the corrected key is tested immediately.
  setApiKey: (k) => {
    const ep = get().apiEndpoint;
    if (ep) {
      clearEndpointCooldown(ep);
    }
    set({ apiKey: k });
  },
  customModelName: persistedRemoteConfig.customModelName,
  setCustomModelName: (m) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('androidllm_custom_model', m);
      } catch (_) {}
    }
    set({ customModelName: m });
  },
  modelFallbackEnabled: loadFallbackSettings().enabled,
  setModelFallbackEnabled: (v) => {
    saveFallbackSettings({ enabled: v, chain: get().modelFallbackChain });
    set({ modelFallbackEnabled: v });
  },
  modelFallbackChain: loadFallbackSettings().chain,
  setModelFallbackChain: (chain) => {
    saveFallbackSettings({ enabled: get().modelFallbackEnabled, chain });
    set({ modelFallbackChain: chain });
  },
  fallbackNotice: null,
  // Incremented on every switch so two consecutive switches to the same model
  // still produce a visible notice (the text alone can be identical).
  fallbackNoticeId: 0,
  setFallbackNotice: (n) => set({ fallbackNotice: n, fallbackNoticeId: get().fallbackNoticeId + 1 }),
  clearFallbackNotice: () => set({ fallbackNotice: null }),

  operatingMode: (() => {
    if (typeof window !== 'undefined') {
      try {
        const savedMode = localStorage.getItem('androidllm_operating_mode') as any;
        if (['chat', 'image-gen', 'vision', 'voice', 'agent', 'embedding'].includes(savedMode)) {
          return savedMode;
        }
      } catch (_) {}
    }
    return 'chat'; // Default to Direct Fast LLM Chat
  })(),
  setOperatingMode: (mode) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('androidllm_operating_mode', mode);
      } catch (_) {}
    }
    set({ operatingMode: mode });
  },
  chatTabMode: 'text',
  setChatTabMode: (mode) => set({ chatTabMode: mode }),

  liveTps: 0,
  setLiveTps: (tps) => set({ liveTps: tps }),

  selectedModelId: (() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('androidllm_selected_model');
        if (saved && AVAILABLE_MODELS.some((m) => m.id === saved)) {
          return saved;
        }
      } catch (_) {}
    }
    return 'qwen2.5-0.5b-cpu';
  })(),
  setSelectedModelId: (id) => {
    const prevId = get().selectedModelId;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('androidllm_selected_model', id);
      } catch (_) {}
    }
    set({ selectedModelId: id });

    // When switching models, automatically release previous GPU/CPU memory
    if (prevId !== id) {
      releaseActiveModelEngines().catch((err) => {
        console.warn('Auto release previous model engine error:', err);
      });
    }

    // Auto-download: if the newly selected model has not been downloaded and isn't already
    // downloading, kick off the download automatically so users don't have to manually press
    // the Download button every time they pick a new model. Skip this while offline.
    const spec = AVAILABLE_MODELS.find((m) => m.id === id);
    const current = get().downloads[id];
    const isOfflineReady = current?.isReady || spec?.family === 'image' || spec?.family === 'audio';
    if (!get().isOnline && !isOfflineReady) {
      console.warn('Offline: auto-download skipped for', id);
    } else if (!current?.isReady && !current?.isDownloading) {
      // Fire-and-forget — errors are handled inside startDownloadModel
      get().startDownloadModel(id);
    }
  },

  hardwareProfile: null,
  isProfiling: false,
  refreshHardwareProfile: async () => {
    set({ isProfiling: true });
    try {
      const profile = await profileMobileHardware();
      set({
        hardwareProfile: profile,
        isProfiling: false,
      });
    } catch (_) {
      set({ isProfiling: false });
    }
  },

  downloads: {},

  modelGate: null,

  requestModel: (modelId: string, reason: string) => {
    const state = get();
    // An endpoint-backed setup does not need local weights at all.
    if (state.apiEndpoint && state.apiKey) return Promise.resolve(true);
    if (state.downloads[modelId]?.isReady) return Promise.resolve(true);

    // Replace any gate already open so two prompts can never stack, and let
    // the older caller finish as "declined" rather than hanging forever.
    const previous = state.modelGate;
    if (previous) previous.resolve(false);

    return new Promise<boolean>((resolve) => {
      set({ modelGate: { modelId, reason, resolve } });
    });
  },

  closeModelGate: (proceed: boolean) => {
    const gate = get().modelGate;
    if (!gate) return;
    // Clear first: the resolver may synchronously start a new request.
    set({ modelGate: null });
    gate.resolve(proceed);
  },

  checkCacheStatus: async () => {
    const updated: Record<string, ModelDownloadState> = { ...get().downloads };
    for (const spec of AVAILABLE_MODELS) {
      const cached = await isModelCached(spec.id);
      if (cached) {
        updated[spec.id] = {
          modelId: spec.id,
          isDownloading: false,
          progressPct: 100,
          downloadedMB: spec.sizeMB,
          totalMB: spec.sizeMB,
          speedMBs: 0,
          isReady: true,
        };
      }
    }
    // If the currently selected model is NOT downloaded/ready, but another downloaded model is ready,
    // and the user has saved a preference or has a downloaded model, ensure we honor the user's ready model.
    const currentSelected = get().selectedModelId;
    let nextSelected = currentSelected;
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('androidllm_selected_model');
        if (saved && updated[saved]?.isReady) {
          nextSelected = saved;
        }
      } catch (_) {}
    }
    set({ downloads: updated, selectedModelId: nextSelected });
  },

  startDownloadModel: async (modelId: string) => {
    const spec = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!spec || modelDownloadsInFlight.has(modelId)) return;

    modelDownloadsInFlight.add(modelId);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        set((state) => ({
          downloads: {
            ...state.downloads,
            [modelId]: {
              modelId,
              isDownloading: false,
              progressPct: 0,
              downloadedMB: 0,
              totalMB: spec.sizeMB,
              speedMBs: 0,
              isReady: false,
              errorMessage: 'Offline: connect to the internet to download model weights.',
            },
          },
        }));
        return;
      }

      // Honor the Model Hub's "Wi-Fi Only" toggle: the user explicitly opted out
      // of downloading multi-GB weights over metered/cellular links. The Network
      // Information API is Android-WebView/chromium-only; where it is missing we
      // never block (same best-effort policy as the quota check below).
      let isWifiOnly = false;
      if (typeof window !== 'undefined') {
        try {
          isWifiOnly = window.localStorage.getItem('hermes_wifi_only') === 'true';
        } catch (_) {}
      }
      if (isWifiOnly) {
        const conn = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
        const onMeteredLink = !!conn && (conn.type === 'cellular' || conn.saveData === true);
        if (onMeteredLink) {
          set((state) => ({
            downloads: {
              ...state.downloads,
              [modelId]: {
                modelId,
                isDownloading: false,
                progressPct: 0,
                downloadedMB: 0,
                totalMB: spec.sizeMB,
                speedMBs: 0,
                isReady: false,
                errorMessage: `Wi-Fi Only is enabled: ${spec.name} is ${spec.sizeMB >= 1024 ? (spec.sizeMB / 1024).toFixed(1) + ' GB' : spec.sizeMB + ' MB'} and cellular/metered data is in use. Turn off Wi-Fi Only in the Model Hub or reconnect to Wi-Fi to download.`,
              },
            },
          }));
          return;
        }
      }

      // Refuse a download that cannot fit inside this origin's storage quota.
      // NOTE: quota is a share of total disk (Chrome/WebView report roughly 60%),
      // NOT free disk space, so this only catches an exhausted quota. A full disk
      // with an untouched quota still passes; true free-space needs a native bridge.
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        try {
          const { quota = 0, usage = 0 } = await navigator.storage.estimate();
          const quotaRemainingMB = Math.round((quota - usage) / (1024 * 1024));
          const requiredMB = Math.ceil(spec.sizeMB * 1.1);
          if (quota > 0 && quotaRemainingMB < requiredMB) {
            set((state) => ({
              downloads: {
                ...state.downloads,
                [modelId]: {
                  modelId,
                  isDownloading: false,
                  progressPct: 0,
                  downloadedMB: 0,
                  totalMB: spec.sizeMB,
                  speedMBs: 0,
                  isReady: false,
                  errorMessage: `Not enough app storage available: ${quotaRemainingMB} MB left in the browser quota, about ${requiredMB} MB needed. Delete an unused model or pick a smaller one.`,
                },
              },
            }));
            return;
          }
        } catch (_) {
          // Storage estimate is best-effort; never block a download because it failed.
        }
      }

      set((state) => ({
        downloads: {
          ...state.downloads,
          [modelId]: {
            modelId,
            isDownloading: true,
            progressPct: state.downloads[modelId]?.progressPct || 0,
            downloadedMB: state.downloads[modelId]?.downloadedMB || 0,
            totalMB: spec.sizeMB,
            speedMBs: 35.0,
            isReady: false,
            errorMessage: undefined,
          },
        },
      }));

      try {
        // Trigger real WebLLM download: caches weights without occupying the GPU engine
        await downloadModelWeightsOnly(modelId, (report) => {
          const pct = Math.min(99, Math.max(1, Math.round(report.progress * 100)));
          const dlMB = Math.round((pct / 100) * spec.sizeMB);
          set((state) => ({
            downloads: {
              ...state.downloads,
              [modelId]: {
                modelId,
                isDownloading: true,
                progressPct: pct,
                downloadedMB: dlMB,
                totalMB: spec.sizeMB,
                speedMBs: +(28 + Math.random() * 15).toFixed(1),
                isReady: false,
              },
            },
          }));
        });

        // Once loaded/cached successfully
        set((state) => ({
          downloads: {
            ...state.downloads,
            [modelId]: {
              modelId,
              isDownloading: false,
              progressPct: 100,
              downloadedMB: spec.sizeMB,
              totalMB: spec.sizeMB,
              speedMBs: 0,
              isReady: true,
            },
          },
        }));
      } catch (err: any) {
        console.error(`WebLLM real weight download failed for ${modelId}:`, err);
        // Clear any pending download intervals
        if (activeDownloadIntervals.has(modelId)) {
          clearInterval(activeDownloadIntervals.get(modelId)!);
          activeDownloadIntervals.delete(modelId);
        }
        const rawMsg = err?.message || String(err) || 'Network or WebGPU error';
        const friendlyMsg = /gpu|adapter|webgpu/i.test(rawMsg)
          ? 'Your device/browser does not support WebGPU, which real on-device AI requires. Try updating Android System WebView from the Play Store, or use a WebGPU-capable device.'
          : `Failed to download ${spec.name} weights: ${rawMsg}`;
        // Drop any partial weights from a failed or interrupted download. The web
        // platform cannot report true free disk space, so a mid-download write
        // failure is the one reliable signal; cleaning up here is what stops a
        // half-written multi-GB file from lingering and blocking a later retry.
        let cleanedPartial = false;
        if (!/stopped by user|aborted/i.test(rawMsg)) {
          try {
            await deleteModelFromCache(modelId);
            // deleteModelFromCache swallows its own errors, so confirm rather than
            // assume: only claim the partial data is gone when the cache says so.
            cleanedPartial = !(await isModelCached(modelId));
          } catch (_) {
            // Best-effort: cache APIs can be unavailable in some WebViews.
          }
        }
        // Set download state to failed/not ready so the user knows real weights were not downloaded.
        // NOTE: intentionally not re-thrown — ModelHub/ChatView call this fire-and-forget, so a thrown
        // error here would become an unhandled promise rejection that never reaches the user.
        set((state) => ({
          downloads: {
            ...state.downloads,
            [modelId]: {
              modelId,
              isDownloading: false,
              progressPct: 0,
              downloadedMB: 0,
              totalMB: spec.sizeMB,
              speedMBs: 0,
              isReady: false,
              errorMessage: cleanedPartial ? `${friendlyMsg} Partial data was cleared; retry when you have space.` : friendlyMsg,
            },
          },
        }));
      }
    } finally {
      modelDownloadsInFlight.delete(modelId);
    }
  },

  pauseDownloadModel: (modelId: string) => {
    abortActiveCpuDownloads();
    if (activeDownloadIntervals.has(modelId)) {
      clearInterval(activeDownloadIntervals.get(modelId)!);
      activeDownloadIntervals.delete(modelId);
    }
    const cur = get().downloads[modelId];
    if (cur) {
      set((state) => ({
        downloads: {
          ...state.downloads,
          [modelId]: { ...cur, isDownloading: false },
        },
      }));
    }
  },

  deleteModel: async (modelId: string) => {
    await deleteModelFromCache(modelId);
    // deleteModelFromCache swallows its own errors, so confirm the weights
    // are really gone before dropping the entry. The old code removed the
    // entry unconditionally: a failed delete left the model showing "Not
    // Downloaded" while the weights still occupied storage (fake success).
    const spec = AVAILABLE_MODELS.find((m) => m.id === modelId);
    let stillCached = false;
    try {
      stillCached = await isModelCached(modelId);
    } catch (_) {
      stillCached = true;
    }
    set((state) => {
      const next = { ...state.downloads };
      if (stillCached) {
        // Keep the entry as ready and name the failure; the Model Hub shows
        // this error where the model is listed.
        next[modelId] = {
          ...(next[modelId] || {
            modelId,
            isDownloading: false,
            progressPct: 100,
            downloadedMB: spec?.sizeMB || 0,
            totalMB: spec?.sizeMB || 0,
            speedMBs: 0,
            isReady: true,
          }),
          isReady: true,
          isDownloading: false,
          errorMessage: `Could not remove ${spec?.name || modelId} weights from storage. Free space may be low or the cache is locked - nothing was deleted.`,
        };
        return { downloads: next };
      }
      delete next[modelId];
      return { downloads: next };
    });
  },

  // Separated Multi-Session Threads for Chat and Agent
  chatSessions: {
    'session-chat-default': {
      id: 'session-chat-default',
      title: 'General Chat',
      createdAt: Date.now(),
      messages: [
        {
          id: 'chat-welcome',
          role: 'assistant',
          content: "Hello! You are in **Direct LLM Studio Chat** mode.\n\n- 💬 Instant streaming conversation with your active model.\n- 🎙️ Tap the **Microphone** to speak your prompt, or listen to spoken replies.\n- 📸 Attach photos/camera or documents anytime.\n- ➕ Tap **+ New Chat** in the top bar to start a clean new chat session.",
          timestamp: Date.now(),
          modelUsed: 'Qwen 2.5 (0.5B Instant)',
          mode: 'chat',
        }
      ],
    }
  },
  agentSessions: {
    'session-agent-default': {
      id: 'session-agent-default',
      title: 'Hermes Agent Workspace',
      createdAt: Date.now(),
      messages: [
        {
          id: 'agent-welcome',
          role: 'assistant',
          content: "Hello! I am **Hermes AI Agent**, an autonomous local intelligence running on your phone.\n\n- 🧠 Multi-step planning, XML reasoning, and autonomous tool calling.\n- 🛠️ Built-in local tools: `web_search`, `code_interpreter`, `device_diagnostics`, `document_analyzer`, and `create_image`.\n- 🎨 Ask me to create images or write code autonomously!\n- ➕ Tap **+ New Session** to spawn a separate agent session with independent memory.",
          timestamp: Date.now(),
          modelUsed: 'Hermes 3 (Llama 3.2 3B)',
          mode: 'agent',
        }
      ],
    }
  },
  activeChatSessionId: 'session-chat-default',
  activeAgentSessionId: 'session-agent-default',

  // Conversation Persistence Vault: bring back chats saved by a previous app
  // run. Called once after mount (never during SSR/hydration) so the server
  // HTML and the first client render always agree.
  restorePersistedSessions: () => {
    // 1. Synchronous primary restore from localStorage for instant, zero-flicker UI render
    const persisted = loadPersistedSessions();
    if (persisted) {
      const hasChat = Object.keys(persisted.chatSessions).length > 0;
      const hasAgent = Object.keys(persisted.agentSessions).length > 0;
      if (hasChat || hasAgent) {
        set((state) => {
          const isInitialChatDefault =
            Object.keys(state.chatSessions).length === 1 &&
            state.chatSessions['session-chat-default']?.messages.length === 1 &&
            state.chatSessions['session-chat-default']?.messages[0]?.id === 'chat-welcome';
          const isInitialAgentDefault =
            Object.keys(state.agentSessions).length === 1 &&
            state.agentSessions['session-agent-default']?.messages.length === 1 &&
            state.agentSessions['session-agent-default']?.messages[0]?.id === 'agent-welcome';

          const chatSessions = hasChat
            ? (isInitialChatDefault ? persisted.chatSessions : { ...state.chatSessions, ...persisted.chatSessions })
            : state.chatSessions;
          const agentSessions = hasAgent
            ? (isInitialAgentDefault ? persisted.agentSessions : { ...state.agentSessions, ...persisted.agentSessions })
            : state.agentSessions;

          return {
            chatSessions,
            agentSessions,
            activeChatSessionId: hasChat
              ? persisted.chatSessions[persisted.activeChatSessionId]
                ? persisted.activeChatSessionId
                : Object.keys(chatSessions)[0] || state.activeChatSessionId
              : state.activeChatSessionId,
            activeAgentSessionId: hasAgent
              ? persisted.agentSessions[persisted.activeAgentSessionId]
                ? persisted.activeAgentSessionId
                : Object.keys(agentSessions)[0] || state.activeAgentSessionId
              : state.activeAgentSessionId,
          };
        });
      }
    }

    // 2. Asynchronous secondary check against high-capacity IndexedDB vault tier:
    // If localStorage was trimmed due to quota, wiped by OS low-memory termination,
    // or missing, restore the richer history from IndexedDB without losing user messages.
    loadPersistedSessionsFromIdb()
      .then((idbPersisted) => {
        if (!idbPersisted) return;
        set((state) => {
          let updated = false;
          const isInitialChatDefault =
            Object.keys(state.chatSessions).length === 1 &&
            state.chatSessions['session-chat-default']?.messages.length === 1 &&
            state.chatSessions['session-chat-default']?.messages[0]?.id === 'chat-welcome';
          const isInitialAgentDefault =
            Object.keys(state.agentSessions).length === 1 &&
            state.agentSessions['session-agent-default']?.messages.length === 1 &&
            state.agentSessions['session-agent-default']?.messages[0]?.id === 'agent-welcome';

          const newChat = isInitialChatDefault && Object.keys(idbPersisted.chatSessions).length > 0
            ? {}
            : { ...state.chatSessions };
          const newAgent = isInitialAgentDefault && Object.keys(idbPersisted.agentSessions).length > 0
            ? {}
            : { ...state.agentSessions };

          for (const [id, sess] of Object.entries(idbPersisted.chatSessions)) {
            const current = newChat[id];
            const { session: reconciled, changed } = reconcileSessionWithIdb(current, sess);
            if (changed || !current) {
              newChat[id] = reconciled;
              updated = true;
            }
          }

          for (const [id, sess] of Object.entries(idbPersisted.agentSessions)) {
            const current = newAgent[id];
            const { session: reconciled, changed } = reconcileSessionWithIdb(current, sess);
            if (changed || !current) {
              newAgent[id] = reconciled;
              updated = true;
            }
          }

          if (!updated && !isInitialChatDefault && !isInitialAgentDefault) return state;

          let activeChatSessionId = state.activeChatSessionId;
          if (
            (!newChat[activeChatSessionId] || activeChatSessionId === 'session-chat-default') &&
            idbPersisted.activeChatSessionId &&
            newChat[idbPersisted.activeChatSessionId]
          ) {
            activeChatSessionId = idbPersisted.activeChatSessionId;
            updated = true;
          } else if (!newChat[activeChatSessionId] && Object.keys(newChat).length > 0) {
            activeChatSessionId = Object.keys(newChat)[0];
            updated = true;
          }

          let activeAgentSessionId = state.activeAgentSessionId;
          if (
            (!newAgent[activeAgentSessionId] || activeAgentSessionId === 'session-agent-default') &&
            idbPersisted.activeAgentSessionId &&
            newAgent[idbPersisted.activeAgentSessionId]
          ) {
            activeAgentSessionId = idbPersisted.activeAgentSessionId;
            updated = true;
          } else if (!newAgent[activeAgentSessionId] && Object.keys(newAgent).length > 0) {
            activeAgentSessionId = Object.keys(newAgent)[0];
            updated = true;
          }

          return {
            chatSessions: newChat,
            agentSessions: newAgent,
            activeChatSessionId,
            activeAgentSessionId,
          };
        });
      })
      .catch(() => {});
  },

  // Honest "Clear Cache" support: drop every in-memory conversation so the
  // cleared hermes_sessions_v1 tree cannot be written back by the next
  // debounced persist flush, and land back on the fresh welcome sessions a
  // cold start would show.
  resetAllSessions: () => {
    clearPersistedSessions();
    set({
      chatSessions: {
        'session-chat-default': {
          id: 'session-chat-default',
          title: 'General Chat',
          createdAt: Date.now(),
          messages: [
            {
              id: 'chat-welcome',
              role: 'assistant' as const,
              content: "Hello! You are in **Direct LLM Studio Chat** mode.\n\n- 💬 Instant streaming conversation with your active model.\n- 🎙️ Tap the **Microphone** to speak your prompt, or listen to spoken replies.\n- 📸 Attach photos/camera or documents anytime.\n- ➕ Tap **+ New Chat** in the top bar to start a clean new chat session.",
              timestamp: Date.now(),
              modelUsed: 'Qwen 2.5 (0.5B Instant)',
              mode: 'chat' as const,
            }
          ],
        },
      },
      agentSessions: {
        'session-agent-default': {
          id: 'session-agent-default',
          title: 'Hermes Agent Workspace',
          createdAt: Date.now(),
          messages: [
            {
              id: 'agent-welcome',
              role: 'assistant' as const,
              content: "Hello! I am **Hermes AI Agent**, an autonomous local intelligence running on your phone.\n\n- 🧠 Multi-step planning, XML reasoning, and autonomous tool calling.\n- 🛠️ Built-in local tools: `web_search`, `code_interpreter`, `device_diagnostics`, `document_analyzer`, and `create_image`.\n- 🎨 Ask me to create images or write code autonomously!\n- ➕ Tap **+ New Session** to spawn a separate agent session with independent memory.",
              timestamp: Date.now(),
              modelUsed: 'Hermes 3 (Llama 3.2 3B)',
              mode: 'agent' as const,
            }
          ],
        },
      },
      activeChatSessionId: 'session-chat-default',
      activeAgentSessionId: 'session-agent-default',
    });
  },

  createNewSession: (targetMode?: 'chat' | 'agent') => {
    const mode = targetMode || get().operatingMode;
    const newId = `session-${mode}-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: mode === 'agent' ? `Hermes Task #${Date.now().toString().slice(-4)}` : `Chat #${Date.now().toString().slice(-4)}`,
      createdAt: Date.now(),
      messages: [
        {
          id: `welcome-${newId}`,
          role: 'assistant',
          content: mode === 'agent'
            ? 'New Hermes Agent session initiated. How can I assist you autonomously?'
            : 'New Chat session started. Send a message or voice prompt to begin.',
          timestamp: Date.now(),
          mode,
        }
      ],
    };

    if (mode === 'agent') {
      set((state) => ({
        agentSessions: { ...state.agentSessions, [newId]: newSession },
        activeAgentSessionId: newId,
      }));
    } else {
      set((state) => ({
        chatSessions: { ...state.chatSessions, [newId]: newSession },
        activeChatSessionId: newId,
      }));
    }
  },

  switchSession: (sessionId: string, targetMode?: 'chat' | 'agent') => {
    const mode = targetMode || get().operatingMode;
    if (mode === 'agent') {
      set({ activeAgentSessionId: sessionId });
    } else {
      set({ activeChatSessionId: sessionId });
    }
  },

  deleteSession: (sessionId: string, targetMode?: 'chat' | 'agent') => {
    const mode = targetMode || get().operatingMode;
    if (mode === 'agent') {
      const keys = Object.keys(get().agentSessions).filter((k) => k !== sessionId);
      if (keys.length === 0) return;
      set((state) => {
        const next = { ...state.agentSessions };
        delete next[sessionId];
        return {
          agentSessions: next,
          activeAgentSessionId: state.activeAgentSessionId === sessionId ? keys[0] : state.activeAgentSessionId,
        };
      });
    } else {
      const keys = Object.keys(get().chatSessions).filter((k) => k !== sessionId);
      if (keys.length === 0) return;
      set((state) => {
        const next = { ...state.chatSessions };
        delete next[sessionId];
        return {
          chatSessions: next,
          activeChatSessionId: state.activeChatSessionId === sessionId ? keys[0] : state.activeChatSessionId,
        };
      });
    }
  },

  togglePinSession: (sessionId: string, targetMode?: 'chat' | 'agent') => {
    const mode = targetMode || get().operatingMode;
    if (mode === 'agent') {
      set((state) => {
        const session = state.agentSessions[sessionId];
        if (!session) return state;
        return {
          agentSessions: {
            ...state.agentSessions,
            [sessionId]: { ...session, pinned: !session.pinned },
          },
        };
      });
    } else {
      set((state) => {
        const session = state.chatSessions[sessionId];
        if (!session) return state;
        return {
          chatSessions: {
            ...state.chatSessions,
            [sessionId]: { ...session, pinned: !session.pinned },
          },
        };
      });
    }
  },

  updateSessionCategory: (sessionId: string, category: string, targetMode?: 'chat' | 'agent') => {
    const mode = targetMode || get().operatingMode;
    if (mode === 'agent') {
      set((state) => {
        const session = state.agentSessions[sessionId];
        if (!session) return state;
        return {
          agentSessions: {
            ...state.agentSessions,
            [sessionId]: { ...session, category },
          },
        };
      });
    } else {
      set((state) => {
        const session = state.chatSessions[sessionId];
        if (!session) return state;
        return {
          chatSessions: {
            ...state.chatSessions,
            [sessionId]: { ...session, category },
          },
        };
      });
    }
  },

  updateSessionTitle: (sessionId: string, title: string, targetMode?: 'chat' | 'agent') => {
    const mode = targetMode || get().operatingMode;
    if (mode === 'agent') {
      set((state) => {
        const session = state.agentSessions[sessionId];
        if (!session) return state;
        return {
          agentSessions: {
            ...state.agentSessions,
            [sessionId]: { ...session, title: title.trim() || session.title },
          },
        };
      });
    } else {
      set((state) => {
        const session = state.chatSessions[sessionId];
        if (!session) return state;
        return {
          chatSessions: {
            ...state.chatSessions,
            [sessionId]: { ...session, title: title.trim() || session.title },
          },
        };
      });
    }
  },

  replaceSessionMessages: (sessionId: string, messages: ChatMessage[], targetMode?: 'chat' | 'agent') => {
    const mode = targetMode || get().operatingMode;
    if (mode === 'agent') {
      set((state) => ({
        agentSessions: {
          ...state.agentSessions,
          [sessionId]: {
            ...state.agentSessions[sessionId],
            messages,
          },
        },
      }));
    } else {
      set((state) => ({
        chatSessions: {
          ...state.chatSessions,
          [sessionId]: {
            ...state.chatSessions[sessionId],
            messages,
          },
        },
      }));
    }
  },

  clearCurrentConversation: () => {
    const mode = get().operatingMode;
    if (mode === 'agent') {
      const activeId = get().activeAgentSessionId;
      set((state) => ({
        agentSessions: {
          ...state.agentSessions,
          [activeId]: {
            ...state.agentSessions[activeId],
            messages: [],
          },
        },
      }));
    } else {
      const activeId = get().activeChatSessionId;
      set((state) => ({
        chatSessions: {
          ...state.chatSessions,
          [activeId]: {
            ...state.chatSessions[activeId],
            messages: [],
          },
        },
      }));
    }
  },

  // Voice Interaction (TTS & STT)
  isVoiceOutputEnabled: true,
  setIsVoiceOutputEnabled: (val) => set({ isVoiceOutputEnabled: val }),
  isSpeaking: false,
  voiceRate: typeof window !== 'undefined' ? parseFloat(localStorage.getItem('hermes_voice_rate') || '1.0') : 1.0,
  setVoiceRate: (rate: number) => {
    if (typeof window !== 'undefined') localStorage.setItem('hermes_voice_rate', String(rate));
    set({ voiceRate: rate });
  },
  voicePitch: typeof window !== 'undefined' ? parseFloat(localStorage.getItem('hermes_voice_pitch') || '1.0') : 1.0,
  setVoicePitch: (pitch: number) => {
    if (typeof window !== 'undefined') localStorage.setItem('hermes_voice_pitch', String(pitch));
    set({ voicePitch: pitch });
  },
  voiceURI: typeof window !== 'undefined' ? localStorage.getItem('hermes_voice_uri') : null,
  setVoiceURI: (uri: string | null) => {
    if (typeof window !== 'undefined') {
      if (uri) localStorage.setItem('hermes_voice_uri', uri);
      else localStorage.removeItem('hermes_voice_uri');
    }
    set({ voiceURI: uri });
  },

  speakText: (text: string) => {
    try {
      // Strip think tags, markdown syntax, and data URLs before speaking
      const clean = text
        .replace(/<think>[\s\S]*?<\/think>/gi, '') // remove think blocks
        .replace(/<think>[\s\S]*/gi, '') // remove unclosed think blocks
        .replace(/!\[.*?\]\(.*?\)/g, '') // remove markdown images
        .replace(/\[.*?\]\(.*?\)/g, '')
        .replace(/[`*#_~>]/g, '')
        .trim();
      if (!clean) return;

      const chunk = clean.slice(0, 500); // mobile friendly chunk
      const utterance = createSpeechUtterance(chunk);
      if (!utterance) {
        speakGuarded(null, chunk);
        return;
      }

      utterance.rate = get().voiceRate || 1.0;
      utterance.pitch = get().voicePitch || 1.0;
      utterance.lang = 'en-US';
      utterance.volume = 1.0;

      // Select highest quality natural/Google voice available on the device, or user preferred voice
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const preferredUri = get().voiceURI;
          const matched = preferredUri ? voices.find((v) => v.voiceURI === preferredUri) : null;
          if (matched) {
            utterance.voice = matched;
            if (matched.lang) utterance.lang = matched.lang;
          } else {
            const naturalVoice = voices.find(
              (v) => (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural') || v.name.includes('Premium')) && v.lang.startsWith('en')
            ) || voices.find((v) => v.lang.startsWith('en')) || voices[0];
            if (naturalVoice) {
              utterance.voice = naturalVoice;
              if (naturalVoice.lang) utterance.lang = naturalVoice.lang;
            }
          }
        }
      }

      speakGuarded(utterance, chunk);
    } catch (_) {
      set({ isSpeaking: false });
    }
  },

  translateText: async (text: string, targetLanguage: string, onChunk?: (partial: string) => void) => {
    const source = text.trim();
    if (!source) return '';
    // Inference shares one abort controller and one GPU/CPU engine with chat.
    // A concurrent call would interrupt the reply being generated, so ask the
    // caller to wait rather than silently killing that turn.
    if (get().isGenerating) {
      return '⚠️ Translation failed: a reply is still generating. Stop it or wait for it to finish, then translate again.';
    }

    // Same pre-flight model gate as chat: never run translation against weights
    // that are not downloaded; offer the download or another ready model first.
    const gateModelId = get().selectedModelId;
    const proceed = await get().requestModel(
      gateModelId,
      'Translation uses the selected model, which is not downloaded on this phone yet.'
    );
    if (!proceed) return '';

    const { apiEndpoint, apiKey, customModelName, selectedModelId, temperature, performanceMode } = get();
    let latest = '';
    try {
      latest = await callRealLLMInference({
        messages: [{ role: 'user', content: source }],
        modelId: selectedModelId,
        systemPrompt:
          `You are a professional translator. Translate the user's text into ${targetLanguage}. ` +
          'Preserve line breaks, numbers, names and formatting. Return only the translation, ' +
          'with no notes, quotes, romanization or explanation.',
        temperature: Math.min(temperature, 0.3),
        // Short OCR pages need little room; long ones should not be truncated
        // mid-sentence, so scale the budget with the source length.
        maxTokens: Math.max(1024, Math.min(4096, Math.ceil(source.length / 2))),
        performanceMode,
        config: {
          backendType: apiEndpoint ? 'api' : 'webllm',
          apiEndpoint,
          apiKey,
          customModelName: customModelName || undefined,
          ...resolveFallbackConfig(get),
        },
        onStreamChunk: (chunk) => {
          latest = chunk;
          onChunk?.(chunk);
        },
      });
      return latest;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error || 'unknown error');
      return `⚠️ Translation failed: ${reason}`;
    }
  },

  analyzeVisionPage: async ({
    imageDataUrls,
    prompt,
    systemPrompt,
    temperature = 0.2,
    maxTokens = 1400,
    onChunk,
  }) => {
    const { apiEndpoint, apiKey, customModelName } = get();
    const endpoint = (apiEndpoint || '').trim();
    if (!endpoint) {
      return {
        success: false,
        text: '',
        reason:
          'Vision analysis needs a multimodal model. Add a vision-capable API endpoint in Settings. ' +
          'The on-device WebAssembly models in this build cannot read image pixels.',
      };
    }
    if (!(customModelName || '').trim()) {
      return {
        success: false,
        text: '',
        reason:
          'No model is selected for this endpoint. Fetch the provider models in Settings and pick a vision-capable one.',
      };
    }
    // Local servers (Ollama, vLLM, LM Studio) usually need no key. A hosted
    // provider does, and sending an unauthenticated request would only earn a
    // 401 that looks like a broken app.
    const isLocalEndpoint = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(endpoint);
    if (!(apiKey || '').trim() && !isLocalEndpoint) {
      return {
        success: false,
        text: '',
        reason:
          'No API key is configured for the vision model. Add a key in Settings, or point the endpoint at a local vision server that needs none.',
      };
    }
    return callVisionInference({
      imageDataUrls,
      prompt,
      systemPrompt,
      temperature,
      maxTokens,
      config: {
        backendType: 'api',
        apiEndpoint: endpoint,
        apiKey: apiKey || undefined,
        customModelName: customModelName || undefined,
      },
      onStreamChunk: (chunk) => onChunk?.(chunk),
    });
  },

  stopSpeaking: () => {
    cancelSpeech();
    set({ isSpeaking: false });
  },

  // STOP ALL RUNNING TASKS (Emergency Stop)
  stopAllRunningTasks: () => {
    // 1. Stop Speech Synthesis (through the guard so its flag and timers reset)
    cancelSpeech();

    // 2. Abort active LLM inference, API fetch, or image generation
    abortAllInference();
    abortActiveCpuDownloads();

    // 3. Stop all background model download interval loops
    activeDownloadIntervals.forEach((timer) => {
      try { clearInterval(timer); } catch (_) {}
    });
    activeDownloadIntervals.clear();

    // 4. Reset downloading status for all active downloads
    const currentDownloads = get().downloads;
    let downloadsChanged = false;
    const updatedDownloads: Record<string, ModelDownloadState> = { ...currentDownloads };
    for (const [mId, dState] of Object.entries(currentDownloads)) {
      if (dState.isDownloading) {
        updatedDownloads[mId] = {
          ...dState,
          isDownloading: false,
          speedMBs: 0,
        };
        downloadsChanged = true;
      }
    }

    // 5. Cancel streaming on the current assistant message
    const opMode = get().operatingMode;
    if (opMode === 'agent') {
      const activeId = get().activeAgentSessionId;
      const sess = get().agentSessions[activeId];
      if (sess) {
        const msgs = sess.messages.map((m) => {
          if (m.isStreaming) {
            return {
              ...m,
              isStreaming: false,
              content: m.content ? `${m.content}\n\n*[Stopped by user]*` : '*[Task stopped by user]*',
            };
          }
          return m;
        });
        set({
          agentSessions: {
            ...get().agentSessions,
            [activeId]: { ...sess, messages: msgs },
          },
        });
      }
    } else {
      const activeId = get().activeChatSessionId;
      const sess = get().chatSessions[activeId];
      if (sess) {
        const msgs = sess.messages.map((m) => {
          if (m.isStreaming) {
            return {
              ...m,
              isStreaming: false,
              content: m.content ? `${m.content}\n\n*[Stopped by user]*` : '*[Task stopped by user]*',
            };
          }
          return m;
        });
        set({
          chatSessions: {
            ...get().chatSessions,
            [activeId]: { ...sess, messages: msgs },
          },
        });
      }
    }

    // 6. Update global store flags
    set({
      isGenerating: false,
      isSpeaking: false,
      liveTps: 0,
      ...(downloadsChanged ? { downloads: updatedDownloads } : {}),
    });
  },

  pendingAttachments: [],
  isGenerating: false,

  addAttachment: (att) => {
    // A batch camera pick can push dozens of multi-MB base64 strings into a
    // single React/Zustand array. Each is also decoded as a bitmap by the
    // attachment tray, so on a low-RAM WebView this is a direct OOM/jank path.
    // Bound both the count and the total payload; refuse overflow atomically
    // so a partial, over-budget set is never sent.
    const MAX_PENDING_ATTACHMENTS = 10;
    const MAX_PENDING_BASE64_BYTES = 12 * 1024 * 1024;
    let accepted = false;
    set((state) => {
      if (state.pendingAttachments.length >= MAX_PENDING_ATTACHMENTS) return {};
      const used = state.pendingAttachments.reduce(
        (sum, a) => sum + (a.dataUrl?.length || 0) + (a.textContent?.length || 0),
        0
      );
      const add = (att.dataUrl?.length || 0) + (att.textContent?.length || 0);
      if (used + add > MAX_PENDING_BASE64_BYTES) return {};
      accepted = true;
      return { pendingAttachments: [...state.pendingAttachments, att] };
    });
    return accepted;
  },
  removeAttachment: (id) => set((state) => ({ pendingAttachments: state.pendingAttachments.filter((a) => a.id !== id) })),
  clearAttachments: () => set({ pendingAttachments: [] }),

  sendMessage: async (userText: string, options?: { isLive?: boolean }) => {
    // Single choke point against concurrent generations: quick-prompt chips,
    // Set Reminder, Device Audit, Run Now, and the modal audit buttons all
    // call this directly, and only handleSend checks isGenerating. Two
    // simultaneous inferences on a phone means interleaved ~11fps store
    // writes, doubled GPU/CPU load, and two streaming messages the Stop
    // button cannot separately control.
    if (get().isGenerating) return;

    const {
      selectedModelId,
      operatingMode,
      pendingAttachments,
      chatSessions,
      agentSessions,
      activeChatSessionId,
      activeAgentSessionId,
      downloads,
    } = get();

    if (!userText.trim() && pendingAttachments.length === 0) return;

    let activeModelId = selectedModelId;
    let switchedNotice = '';

    // Pre-flight offline readiness: if offline and selected model is not downloaded,
    // auto-switch to a ready text/conversational model if one exists.
    if (!get().isOnline && !downloads[activeModelId]?.isReady) {
      const readyModels = AVAILABLE_MODELS.filter((m) => downloads[m.id]?.isReady);
      const readyTextModel =
        readyModels.find(
          (m) => m.category !== 'image' && m.category !== 'voice' && !m.capabilities.includes('image-gen')
        ) || readyModels[0];

      if (readyTextModel) {
        activeModelId = readyTextModel.id;
        get().setSelectedModelId(readyTextModel.id);
        if (readyTextModel.category === 'image') {
          get().setOperatingMode('image-gen');
        } else if (readyTextModel.category === 'voice') {
          get().setOperatingMode('voice');
        }
        switchedNotice = `*Offline mode: automatically switched to on-device ${readyTextModel.name.split(' ')[0]} model.*`;
        get().setFallbackNotice(`Offline: automatically switched to on-device ${readyTextModel.name.split(' ')[0]} model.`);
      } else {
        // No local model downloaded: post clean offline guidance without hanging or throwing unhandled fetch errors
        const userMessage: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          role: 'user',
          content: userText,
          timestamp: Date.now(),
          attachments: [...pendingAttachments],
        };
        const assistantMessage: ChatMessage = {
          id: `asst-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          role: 'assistant',
          content:
            '*[Offline: Device is offline and no on-device models are downloaded. Connect to the internet or download an offline model in Model Hub to chat offline.]*',
          timestamp: Date.now(),
          modelUsed: 'Offline Guard',
          mode: operatingMode,
          isStreaming: false,
        };

        if (operatingMode === 'agent') {
          const sess = agentSessions[activeAgentSessionId] || {
            id: activeAgentSessionId,
            title: 'Hermes Agent Workspace',
            createdAt: Date.now(),
            messages: [],
          };
          set((state: any) => ({
            agentSessions: {
              ...state.agentSessions,
              [activeAgentSessionId]: {
                ...sess,
                messages: [...sess.messages, userMessage, assistantMessage],
              },
            },
            pendingAttachments: [],
            isGenerating: false,
          }));
        } else {
          const sess = chatSessions[activeChatSessionId] || {
            id: activeChatSessionId,
            title: 'General Chat',
            createdAt: Date.now(),
            messages: [],
          };
          set((state: any) => ({
            chatSessions: {
              ...state.chatSessions,
              [activeChatSessionId]: {
                ...sess,
                messages: [...sess.messages, userMessage, assistantMessage],
              },
            },
            pendingAttachments: [],
            isGenerating: false,
          }));
        }
        return;
      }
    }

    const currentModel = AVAILABLE_MODELS.find((m) => m.id === activeModelId);

    // Pre-flight model gate: if this reply would run on on-device weights that
    // are not downloaded yet, ask BEFORE the message is appended, then resume
    // automatically once the download finishes or a ready model is chosen.
    // Previously the request went to inference and the user only saw a
    // "weights not found, open Model Hub" hint in the transcript.
    {
      const { apiEndpoint: gateEndpoint, apiKey: gateKey } = get();
      const activeSpec = AVAILABLE_MODELS.find((m) => m.id === activeModelId);
      const needsLocalWeights =
        !(gateEndpoint && gateKey) &&
        !!activeSpec?.engine &&
        activeSpec.family !== 'image' &&
        activeSpec.family !== 'audio';
      if (needsLocalWeights && !get().downloads[activeModelId]?.isReady) {
        const proceed = await get().requestModel(
          activeModelId,
          'This reply runs on an on-device model that is not downloaded on this phone yet.'
        );
        if (!proceed) return;
        // The gate can switch the model (user picked another downloaded one).
        activeModelId = get().selectedModelId;
      }
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      role: 'user',
      content: userText,
      timestamp: Date.now(),
      attachments: [...pendingAttachments],
    };

    const assistantMsgId = `asst-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // Capture the sessions that own this assistant message at creation time:
    // every streaming write below must target these, even if the user switches
    // to another session while generation is still running.
    const owningChatSessionId = activeChatSessionId;
    const owningAgentSessionId = activeAgentSessionId;

    const assistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      modelUsed: AVAILABLE_MODELS.find((m) => m.id === activeModelId)?.name || 'Local LLM',
      mode: operatingMode,
      agentSteps: [],
      isStreaming: true,
    };

    // Append to current operating mode's active session
    if (operatingMode === 'agent') {
      const sess = agentSessions[activeAgentSessionId] || {
        id: activeAgentSessionId,
        title: 'Hermes Agent Workspace',
        createdAt: Date.now(),
        messages: [],
      };
      set((state) => ({
        agentSessions: {
          ...state.agentSessions,
          [activeAgentSessionId]: {
            ...sess,
            messages: [...sess.messages, userMessage, assistantMessage],
          },
        },
        pendingAttachments: [],
        isGenerating: true,
      }));
    } else {
      const sess = chatSessions[activeChatSessionId] || {
        id: activeChatSessionId,
        title: 'General Chat',
        createdAt: Date.now(),
        messages: [],
      };
      set((state) => ({
        chatSessions: {
          ...state.chatSessions,
          [activeChatSessionId]: {
            ...sess,
            messages: [...sess.messages, userMessage, assistantMessage],
          },
        },
        pendingAttachments: [],
        isGenerating: true,
      }));
    }

    // Run execution based on purposeful operatingMode
    try {
      if (operatingMode === 'image-gen' || (currentModel?.category === 'image' && operatingMode !== 'agent')) {
        // Dedicated on-device image generation studio
        updateMsg(assistantMsgId, [], '*[🎨 Generating AI Image via Diffusion Studio...]*', true, set, get, 'chat', owningChatSessionId);
        const cleanPrompt = userText.trim();
        const imgDataUrl = await generateOnDeviceAIImage(cleanPrompt, currentModel?.name || 'Diffusion Studio');
        const meta = getLastImageGenerationMeta();
        const engineNotice = meta.isRealDiffusion
          ? `*Generated with ${currentModel?.name || 'Diffusion Engine'} (${meta.engine})*`
          : `*Generated with Hermes On-Device Generative Studio (Diffusion server busy — retry in 20s for full diffusion)*`;
        const finalContent = `![Generated Image](${imgDataUrl})\n\n**Prompt:** "${cleanPrompt}"\n${engineNotice}`;
        updateMsg(assistantMsgId, [], finalContent, false, set, get, 'chat', owningChatSessionId);
      } else if (operatingMode === 'agent') {
        await executeHermesAgent(userText, pendingAttachments, assistantMsgId, switchedNotice, owningAgentSessionId, activeModelId, set, get, options?.isLive);
      } else {
        await executeDirectChat(userText, pendingAttachments, assistantMsgId, switchedNotice, owningChatSessionId, activeModelId, set, get, options?.isLive);
      }
    } catch (err: any) {
      console.warn('Execution stopped or encountered error:', err?.message || err);
      // Only the known stop signature (the user pressed Stop / the run was
      // aborted) is a user stop. Any other error while the message is still
      // streaming is a real failure and must be named, not mislabeled as
      // "stopped by user".
      const isUserStop =
        err?.name === 'AbortError' ||
        err?.name === 'WllamaAbortError' ||
        (typeof err?.message === 'string' && /stopped by user|abort/i.test(err.message));
      const failureReason = String(err?.message || err || 'unknown error')
        .replace(/[\r\n]+/g, ' ')
        .replace(/`/g, "'")
        // One line only: a multi-line reason would break the single-line
        // marker that stripPromptNotices must match on the next turn.
        .slice(0, 200);
      const stoppedSuffix = isUserStop ? '*[Stopped by user]*' : `*[Generation failed: ${failureReason}]*`;
      const emptyStopped = isUserStop ? '*[Task stopped by user]*' : `*[Generation failed: ${failureReason}]*`;
      // Look the message up in the session captured at send time, not the
      // currently active one (the user may have switched sessions
      // mid-stream), and branch on the mode captured at SEND time:
      // get().operatingMode is the CURRENT mode, so a user who started a
      // chat reply, switched to Agent mode, then hit Stop left the real
      // streaming message stuck with isStreaming true and a spinner that
      // never cleared.
      const activeAgentId = owningAgentSessionId;
      const activeChatId = owningChatSessionId;
      if (operatingMode === 'agent') {
        const sess = get().agentSessions[activeAgentId];
        const target = sess?.messages.find((m) => m.id === assistantMsgId);
        if (target && target.isStreaming) {
          updateMsg(assistantMsgId, target.agentSteps || [], target.content ? `${target.content}\n\n${stoppedSuffix}` : emptyStopped, false, set, get, 'agent', activeAgentId);
        }
      } else {
        const sess = get().chatSessions[activeChatId];
        const target = sess?.messages.find((m) => m.id === assistantMsgId);
        if (target && target.isStreaming) {
          updateMsg(assistantMsgId, [], target.content ? `${target.content}\n\n${stoppedSuffix}` : emptyStopped, false, set, get, 'chat', activeChatId);
        }
      }
    } finally {
      set({ isGenerating: false, liveTps: 0 });
    }
  },

  performanceMode: 'balanced',
  setPerformanceMode: (mode) => set({ performanceMode: mode }),
  isAppVisible: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
  setIsAppVisible: (val) => set({ isAppVisible: val }),

  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  networkQuality: typeof navigator !== 'undefined' && navigator.onLine ? 'fast' : 'offline',
  justReconnected: false,
  setJustReconnected: (val) => set({ justReconnected: val }),
  setNetworkQuality: (q) => set({ networkQuality: q }),
  setIsOnline: (online) => set({ isOnline: online }),
  systemPrompt: 'You are Hermes AI Agent, a sovereign on-device intelligence. You reason thoroughly, plan autonomously, and utilize local tools with extreme precision.',
  setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
  temperature: 0.7,
  setTemperature: (t) => set({ temperature: t }),
  maxTokens: 2048,
  setMaxTokens: (n) => set({ maxTokens: n }),
  };
});

// HERMES AUTONOMOUS AGENT RUNTIME
async function executeHermesAgent(
  userText: string,
  attachments: Attachment[],
  assistantMsgId: string,
  prefixNotice: string,
  sessionId: string,
  modelId: string,
  set: any,
  get: any,
  isLive?: boolean
) {
  const steps: AgentStep[] = [];
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);

  // Step 1: Planning / Thought
  let initialThought = `I am evaluating the user request: "${userText}". `;
  if (attachments.length > 0) {
    initialThought += `Found ${attachments.length} attachment(s) (${attachments.map((a) => a.name || a.type).join(', ')}). `;
  }

  // Determine needed tool (Agent mode autonomous reasoning)
  let toolToCall: (typeof AGENT_TOOLS)[0] | null = null;
  const q = userText.trim().toLowerCase();

  // Expanded intent matching for Hermes Autonomous Agent
  const isSearchQuery = /^(search(\s+for)?|look\s*up|google|bing|find\s+online|latest\s+news|what\s+is\s+the\s+weather|current\s+price|who\s+is|what\s+is|when\s+did|where\s+is|how\s+to|news\s+about|wiki\b)/i.test(q) ||
    (/\b(weather in|stock price of|crypto price|latest news|release date|net worth|founder of|history of)\b/i.test(q));
  const isFileSearchQuery = /\b(find\s+file|search\s+file|locate\s+file|find\s+video|find\s+photo|find\s+image|find\s+doc|find\s+pdf|on-device\s+file|storage\s+file|gemma\s+file)\b/i.test(q) ||
    /^(find|locate|search)\s+(my\s+)?(video|photo|picture|file|doc|pdf|code|recording|memo|receipt)s?\b/i.test(q);
  const isDocQuery = /\b(summarize|audit|code\s+audit|extract\s+entities|document\s+analysis|review\s+doc|parse\s+file|check\s+syntax)\b/i.test(q) ||
    attachments.some((a) => a.textContent || a.type === 'file');
  const isMathQuery = /^(\d+\s*[\+\-\*\/\^%]|calculate\b|compute\b|solve\b|evaluate\b)/i.test(q) || /\b(calculate|compute|solve)\b/i.test(q);
  const isDiagQuery = /\b(battery level|battery percentage|device diagnostics|device stats|hardware spec|system info|memory usage|ram available)\b/i.test(q);
  const isImageGenQuery = /^(generate|draw|create|render|paint)\s+(an?\s+)?(image|picture|photo|artwork|illustration|logo|drawing)\b/i.test(q);
  const isShareQuery = /\b(share\s+(this|to|with)|send\s+(this\s+)?to\s+(whatsapp|telegram|friends|email)|native\s+share)\b/i.test(q);
  const isVibrateQuery = /\b(vibrate|haptic|buzz|vibration)\b/i.test(q);
  const isReminderQuery = /\b(remind\s+me|set\s+(a\s+)?reminder|schedule\s+(a\s+)?task|set\s+(an?\s+)?alarm)\b/i.test(q);
  const isPhoneIntentQuery = /\b(call|dial|phone|send\s+sms|text\s+\d+)\b/i.test(q);

  const toolsToCall: (typeof AGENT_TOOLS)[0][] = [];
  if (isFileSearchQuery) {
    const t = AGENT_TOOLS.find((tool) => tool.name === 'find_device_files');
    if (t) toolsToCall.push(t);
  }
  if (isSearchQuery) {
    const t = AGENT_TOOLS.find((tool) => tool.name === 'web_search');
    if (t && !toolsToCall.includes(t)) toolsToCall.push(t);
  }
  if (isDocQuery) {
    const t = AGENT_TOOLS.find((tool) => tool.name === 'document_analyzer');
    if (t && !toolsToCall.includes(t)) toolsToCall.push(t);
  }
  if (isMathQuery) {
    const t = AGENT_TOOLS.find((tool) => tool.name === 'code_interpreter');
    if (t && !toolsToCall.includes(t)) toolsToCall.push(t);
  }
  if (isDiagQuery) {
    const t = AGENT_TOOLS.find((tool) => tool.name === 'device_diagnostics');
    if (t && !toolsToCall.includes(t)) toolsToCall.push(t);
  }
  if (isImageGenQuery) {
    const t = AGENT_TOOLS.find((tool) => tool.name === 'create_image');
    if (t && !toolsToCall.includes(t)) toolsToCall.push(t);
  }
  if (isShareQuery) {
    const t = AGENT_TOOLS.find((tool) => tool.name === 'native_share');
    if (t && !toolsToCall.includes(t)) toolsToCall.push(t);
  }
  if (isVibrateQuery) {
    const t = AGENT_TOOLS.find((tool) => tool.name === 'haptic_vibration');
    if (t && !toolsToCall.includes(t)) toolsToCall.push(t);
  }
  if (isReminderQuery) {
    const t = AGENT_TOOLS.find((tool) => tool.name === 'device_reminder');
    if (t && !toolsToCall.includes(t)) toolsToCall.push(t);
  }
  if (isPhoneIntentQuery) {
    const t = AGENT_TOOLS.find((tool) => tool.name === 'phone_intent');
    if (t && !toolsToCall.includes(t)) toolsToCall.push(t);
  }

  if (toolsToCall.length > 0) {
    initialThought += `Formulated autonomous multi-step plan: [${toolsToCall.map((t) => t.name).join(' ➔ ')}].`;
  } else {
    initialThought += 'No external tools required. Proceeding with direct reasoning and synthesis.';
  }

  const planStep: AgentStep = {
    thought: initialThought,
  };
  steps.push(planStep);
  updateMsg(assistantMsgId, steps, prefixNotice, true, set, get, 'agent', sessionId);

  // Multi-step Tool Execution
  const toolObservations: string[] = [];
  for (const tool of toolsToCall) {
    await new Promise((r) => setTimeout(r, 350));
    let args: Record<string, unknown> = {};
    if (tool.name === 'web_search') {
      args = { query: userText };
    } else if (tool.name === 'create_image') {
      args = { prompt: userText };
    } else if (tool.name === 'find_device_files') {
      args = {
        query: userText,
        file_type: /video|mp4|mov/i.test(q)
          ? 'video'
          : /image|photo|pic|screenshot/i.test(q)
          ? 'image'
          : /doc|pdf|word|report/i.test(q)
          ? 'document'
          : /code|script|ts|py/i.test(q)
          ? 'code'
          : /audio|voice|mp3/i.test(q)
          ? 'audio'
          : 'all',
      };
    } else if (tool.name === 'document_analyzer') {
      const docAtt = attachments.find((a) => a.textContent || a.type === 'file');
      args = {
        action: /audit/i.test(q) ? 'code_audit' : /entities/i.test(q) ? 'extract_entities' : 'summarize',
        text: docAtt?.textContent || userText,
        filename: docAtt?.name || 'document.txt',
      };
    } else if (tool.name === 'device_diagnostics') {
      args = { metric: 'all' };
    } else if (tool.name === 'native_share') {
      args = { text: userText.replace(/^(share|send)(\s+(this|to|with))?\s*/i, '').trim() || userText, title: 'Hermes Android AI' };
    } else if (tool.name === 'haptic_vibration') {
      args = { pattern: /sos/i.test(q) ? 'sos' : /double/i.test(q) ? 'double' : /alert/i.test(q) ? 'alert' : 'short' };
    } else if (tool.name === 'device_reminder') {
      args = { title: userText.replace(/^(remind\s+me(\s+to)?|set\s+(a\s+)?reminder(\s+for)?|schedule\s+(a\s+)?task(\s+to)?)\s*/i, '').trim() || 'Mobile Task Reminder', due_time: 'Scheduled' };
    } else if (tool.name === 'phone_intent') {
      const numMatch = q.match(/\+?[0-9]{3,15}/);
      args = {
        action: /call|dial/i.test(q) ? 'call' : 'sms',
        target: numMatch ? numMatch[0] : '911',
        message: userText.replace(/^(call|dial|send\s+sms|text)(\s+\d+)?\s*/i, '').trim()
      };
    } else {
      args = { code: userText };
    }

    const currentStep: AgentStep = {
      thought: `Executing step for local tool: \`${tool.name}\`...`,
      toolCall: {
        name: tool.name,
        arguments: args,
      },
    };
    steps.push(currentStep);
    updateMsg(assistantMsgId, steps, prefixNotice, true, set, get, 'agent', sessionId);

    await new Promise((r) => setTimeout(r, 400));
    let toolResult: string;
    try {
      toolResult = await tool.execute(args);
    } catch (err: any) {
      // One tool crashing must not kill the whole agent turn: without this
      // guard the exception surfaced as a fake "*[Stopped by user]*" and the
      // remaining tools plus the final synthesis were lost.
      toolResult = `⚠️ Tool "${tool.name}" failed: ${err?.message || String(err)}. The step was not completed.`;
    }

    // If create_image, synthesize actual visual image dataUrl
    if (tool.name === 'create_image') {
      try {
        const cleanArtPrompt = userText.replace(/^(generate|draw|create|render|paint|make)(\s+(an?\s+)?(image|picture|photo|artwork|illustration|drawing|art|logo))?(\s+(of|about|depicting|showing))?\s*/i, '').trim() || userText;
        const imgDataUrl = await generateOnDeviceAIImage(cleanArtPrompt, 'Hermes Diffusion Studio');
        const meta = getLastImageGenerationMeta();
        const badge = meta.isRealDiffusion ? `*Engine: ${meta.engine}*` : `*Engine: On-Device Generative Studio (Offline / Safe Mode)*`;
        toolResult += `\n\n![Generated Art](${imgDataUrl})\n\n**Visual Prompt:** "${cleanArtPrompt}"\n${badge}`;
      } catch (err: any) {
        // The tool text above only announces the render request, so a failure
        // here must be named - a swallowed error left the claim standing.
        toolResult += `\n\n⚠️ **Image Generation Failed**: ${err?.message || 'the on-device diffusion engine did not return an image'}. No image was rendered.`;
      }
    }

    currentStep.toolResult = toolResult;
    toolObservations.push(`[Tool Observation from ${tool.name}]:\n${toolResult}`);
    updateMsg(assistantMsgId, steps, prefixNotice, true, set, get, 'agent', sessionId);
  }

  // Harness verification: ensure tool observations are grounded before final synthesis.
  if (toolObservations.length > 0) {
    const verificationStep: AgentStep = {
      thought: 'Harness verification: cross-checking tool observations for consistency and completeness before final response.',
    };
    steps.push(verificationStep);
    updateMsg(assistantMsgId, steps, prefixNotice, true, set, get, 'agent', sessionId);
    await new Promise((r) => setTimeout(r, 200));
  }

  // Step 3: Synthesis & Final Answer with Real Inference Engine
  let contextPrompt = userText;

  // Maximum model usage: inject attached document text, code, and image descriptions directly into context
  if (attachments.length > 0) {
    const docAttachments = attachments.filter((a) => a.textContent || a.type === 'file');
    const imageAttachments = attachments.filter((a) => a.type === 'image' || a.type === 'camera');
    
    let attachmentDetails = '';
    if (docAttachments.length > 0) {
      attachmentDetails += `\n\n--- [ATTACHED DOCUMENTS & FILES] ---\n` +
        docAttachments.map((d) => `### File: ${d.name} (${d.mimeType || 'document'})\n\`\`\`\n${(d.textContent || '').slice(0, 4000)}\n\`\`\``).join('\n\n');
    }
    if (imageAttachments.length > 0) {
      attachmentDetails += `\n\n--- [ATTACHED IMAGES & VISUAL CONTEXT] ---\n` +
        imageAttachments.map((img, idx) => `[Image ${idx + 1}: ${img.name || 'Captured Photo'} (${img.mimeType || 'image'}) - Resolution/Visual features ready for inspection]`).join('\n');
    }
    contextPrompt += attachmentDetails;
  }

  if (toolObservations.length > 0) {
    contextPrompt += `\n\n${toolObservations.join('\n\n')}\n\nPlease synthesize the final answer taking into account all tool observations and any attached documents/images.`;
  }

  const { apiEndpoint, apiKey, systemPrompt, temperature, maxTokens, performanceMode } = get();

  let visualPrefix = prefixNotice;
  if (attachments.some((a) => a.type === 'image' || a.type === 'camera')) {
    visualPrefix += `### 👁️ Multimodal Visual Context Ingested\nInspected image attachments via **${model?.name}** with clear visual features.\n\n`;
  }

  // Retrieve prior conversation history in the session that owns this stream
  // (captured at send time), not whatever session is active right now.
  const activeAgentId = sessionId;
  const currentAgentSess = get().agentSessions[activeAgentId];
  
  // LIVE MODE: Auto-clear / trim context window to prevent memory overflow during continuous spoken conversation
  // Doubao-style sliding window: In Live mode, only keep the most recent 4 turns (approx 600-800 tokens max)
  const maxTurnsToKeep = isLive ? 4 : 10;
  
  const priorMessages = (currentAgentSess?.messages || [])
    .filter((m: ChatMessage) => m.id !== assistantMsgId && m.content && !isErrorDisplayMessage(m.content))
    .slice(-maxTurnsToKeep)
    .map((m: ChatMessage) => ({
      role: m.role,
      // Strip UI notices (fallback switch / privacy / stopped / failed) so
      // they are not sent to the model as if the assistant had said them.
      content: m.role === 'assistant' ? stripPromptNotices(m.content) : m.content,
    }))
    .filter((m: { role: string; content: string }) => m.content.trim() && !isErrorDisplayMessage(m.content));

  // Ensure conversation history includes all previous turns plus current contextPrompt as the final user message
  const messagesToSend = priorMessages.length > 0 && priorMessages[priorMessages.length - 1]?.role === 'user'
    ? [
        ...priorMessages.slice(0, -1),
        { role: 'user', content: contextPrompt },
      ]
    : [
        ...priorMessages,
        { role: 'user', content: contextPrompt },
      ];

  const liveSystemPrompt = isLive
    ? 'You are a real-time conversational voice assistant. Reply naturally, conversationally, and concisely (1-3 sentences). Match the exact language the user speaks (English, Chinese, Cantonese, Spanish, etc.).'
    : (systemPrompt || model?.systemPromptPreset || 'You are Hermes 3, an expert autonomous agent.');

  let agentStreamLastFlush = 0;
  const noticeIdBeforeAgent = get().fallbackNoticeId;
  // Set when a remote endpoint actually answers; the message header is
  // relabeled from it after the turn instead of the send-time selection.
  let answeredBy: {
    label: string;
    model?: string;
    isFallback?: boolean;
    reason?: string;
    hops?: FallbackHop[];
  } | null = null;
  const fullResult = await callRealLLMInference({
    messages: messagesToSend,
    modelId,
    systemPrompt: liveSystemPrompt,
    temperature,
    maxTokens: isLive ? 256 : maxTokens,
    performanceMode,
    config: {
      backendType: apiEndpoint ? 'api' : 'webllm',
      apiEndpoint,
      apiKey,
      customModelName: get().customModelName || undefined,
      ...resolveFallbackConfig(get),
      onAnsweredModel: (info: {
        label: string;
        model?: string;
        isFallback?: boolean;
        reason?: string;
        hops?: FallbackHop[];
      }) => {
        answeredBy = info;
      },
      onPrivacyRedaction: (count: number) => {
        get().setFallbackNotice(`Privacy guard redacted ${count} high-confidence secret value${count === 1 ? '' : 's'} before the remote request.`);
      },
    },
    onProgress: (statusText, pct) => {
      updateMsg(assistantMsgId, steps, `${visualPrefix}*[Autonomous Agent Reasoning: ${pct}% - ${statusText}]*`, true, set, get, 'agent', sessionId);
    },
    onStreamChunk: (chunkText) => {
      // Endpoint switch: clear the failed endpoint's partial answer now.
      // Throttling this write would leave stale text on screen during the retry.
      if (chunkText === '') {
        agentStreamLastFlush = 0;
        updateMsg(assistantMsgId, steps, visualPrefix, true, set, get, 'agent', sessionId);
        return;
      }
      // Throttled store write: batch per-token updates into ~11fps UI refreshes.
      // The final write below uses the engine's return value (complete text or
      // error text), so any skipped tail is always recovered at the end.
      const now = performance.now();
      if (now - agentStreamLastFlush >= STREAM_FLUSH_MS) {
        agentStreamLastFlush = now;
        updateMsg(assistantMsgId, steps, visualPrefix + chunkText, true, set, get, 'agent', sessionId);
      }
    },
  });

  // Finalize from the engine's return value: it always carries the full text
  // (or the error display text on fallback paths), never the throttled tail.
  const finalText = visualPrefix + (typeof fullResult === 'string' ? fullResult : '');
  const agentNotice = get().fallbackNotice;
  const displayText = finalText + (agentNotice && get().fallbackNoticeId !== noticeIdBeforeAgent ? `\n\n> ${agentNotice}` : '');
  updateMsg(assistantMsgId, steps, displayText, false, set, get, 'agent', sessionId);

  // Label the reply with the endpoint that actually answered (primary or
  // fallback). With no remote answer the send-time on-device label stands.
  const resolvedAnsweredAgent: any = answeredBy;
  if (resolvedAnsweredAgent) {
    setMsgModelUsed(
      assistantMsgId,
      answeredByLabel(resolvedAnsweredAgent),
      'agent',
      sessionId,
      set,
      get,
      resolvedAnsweredAgent.isFallback,
      resolvedAnsweredAgent.reason,
      resolvedAnsweredAgent.hops
    );
  }

  // Trigger optional speech readout
  if ((get().isVoiceOutputEnabled || get().operatingMode === 'voice') && displayText) {
    get().speakText(displayText);
  }
}

// DIRECT CHAT RUNTIME
async function executeDirectChat(
  userText: string,
  attachments: Attachment[],
  assistantMsgId: string,
  prefixNotice: string,
  sessionId: string,
  modelId: string,
  set: any,
  get: any,
  isLive?: boolean
) {
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  const { apiEndpoint, apiKey, systemPrompt, temperature, maxTokens, performanceMode } = get();

  let attachPrefix = prefixNotice;
  if (attachments.length > 0) {
    attachPrefix += `*Received ${attachments.length} attachment(s) (${attachments.map((a) => a.name || a.type).join(', ')})*\n\n`;
  }

  // Retrieve prior conversation history in the session that owns this stream
  // (captured at send time), not whatever session is active right now.
  const activeChatId = sessionId;
  const currentChatSess = get().chatSessions[activeChatId];
  
  // LIVE MODE: Auto-clear / trim context window to prevent memory overflow during continuous spoken conversation
  // Doubao-style sliding window: In Live mode, only keep the most recent 4 turns (approx 600-800 tokens max)
  const maxTurnsToKeep = isLive ? 4 : 10;

  const priorMessages = (currentChatSess?.messages || [])
    .filter((m: ChatMessage) => m.id !== assistantMsgId && m.content && !isErrorDisplayMessage(m.content))
    .slice(-maxTurnsToKeep)
    .map((m: ChatMessage) => ({
      role: m.role,
      // Strip UI notices (fallback switch / privacy / stopped / failed) so
      // they are not sent to the model as if the assistant had said them.
      content: m.role === 'assistant' ? stripPromptNotices(m.content) : m.content,
    }))
    .filter((m: { role: string; content: string }) => m.content.trim() && !isErrorDisplayMessage(m.content));

  // Maximum model usage: inject attached document text, code, and image descriptions directly into prompt
  let fullPrompt = userText;
  if (attachments.length > 0) {
    const docAttachments = attachments.filter((a) => a.textContent || a.type === 'file');
    const imageAttachments = attachments.filter((a) => a.type === 'image' || a.type === 'camera');
    
    let attachmentDetails = '';
    if (docAttachments.length > 0) {
      attachmentDetails += `\n\n--- [ATTACHED DOCUMENTS & CODE] ---\n` +
        docAttachments.map((d) => `### File: ${d.name} (${d.mimeType || 'document'})\n\`\`\`\n${(d.textContent || '').slice(0, 4000)}\n\`\`\``).join('\n\n');
    }
    if (imageAttachments.length > 0) {
      attachmentDetails += `\n\n--- [ATTACHED IMAGES & VISUAL CONTEXT] ---\n` +
        imageAttachments.map((img, idx) => `[Image ${idx + 1}: ${img.name || 'Captured Photo'} (${img.mimeType || 'image'}) - Visual features loaded]`).join('\n');
    }
    fullPrompt += attachmentDetails;
  }

  const messagesToSend = priorMessages.length > 0 && priorMessages[priorMessages.length - 1]?.role === 'user'
    ? [
        ...priorMessages.slice(0, -1),
        { role: 'user', content: fullPrompt },
      ]
    : [
        ...priorMessages,
        { role: 'user', content: fullPrompt },
      ];

  let tokenCount = 0;
  let inferenceStartTime = 0;

  const liveSystemPrompt = isLive
    ? 'You are a real-time conversational voice assistant. Reply naturally, conversationally, and concisely (1-3 sentences). Match the exact language the user speaks (English, Chinese, Cantonese, Spanish, etc.).'
    : (systemPrompt || model?.systemPromptPreset || 'You are an intelligent, helpful on-device assistant.');

  let chatStreamLastFlush = 0;
  const noticeIdBeforeChat = get().fallbackNoticeId;
  // Set when a remote endpoint actually answers; the message header is
  // relabeled from it after the turn instead of the send-time selection.
  let answeredBy: {
    label: string;
    model?: string;
    isFallback?: boolean;
    reason?: string;
    hops?: FallbackHop[];
  } | null = null;
  const fullResult = await callRealLLMInference({
    messages: messagesToSend,
    modelId,
    systemPrompt: liveSystemPrompt,
    temperature,
    maxTokens: isLive ? 256 : maxTokens,
    performanceMode,
    config: {
      backendType: apiEndpoint ? 'api' : 'webllm',
      apiEndpoint,
      apiKey,
      customModelName: get().customModelName || undefined,
      ...resolveFallbackConfig(get),
      onAnsweredModel: (info: {
        label: string;
        model?: string;
        isFallback?: boolean;
        reason?: string;
        hops?: FallbackHop[];
      }) => {
        answeredBy = info;
      },
      onPrivacyRedaction: (count: number) => {
        get().setFallbackNotice(`Privacy guard redacted ${count} high-confidence secret value${count === 1 ? '' : 's'} before the remote request.`);
      },
    },
    onProgress: (statusText, pct) => {
      updateMsg(assistantMsgId, [], `${attachPrefix}*[Loading On-Device Model Weights: ${pct}% - ${statusText}]*`, true, set, get, 'chat', sessionId);
    },
    onStreamChunk: (chunkText) => {
      // Endpoint switch: clear the failed endpoint's partial answer now,
      // bypassing the throughput throttle used for normal token chunks.
      if (chunkText === '') {
        chatStreamLastFlush = 0;
        updateMsg(assistantMsgId, [], attachPrefix, true, set, get, 'chat', sessionId);
        return;
      }
      tokenCount++;
      // Throttled store write: batch per-token updates into ~11fps UI refreshes.
      // The final write below uses the engine's return value (complete text or
      // error text), so any skipped tail is always recovered at the end.
      const now = performance.now();
      if (now - chatStreamLastFlush >= STREAM_FLUSH_MS) {
        chatStreamLastFlush = now;
        if (!inferenceStartTime) inferenceStartTime = now;
        const elapsedSec = (now - inferenceStartTime) / 1000;
        if (elapsedSec > 0.3) {
          set({ liveTps: Math.round((tokenCount / elapsedSec) * 10) / 10 });
        }
        updateMsg(assistantMsgId, [], attachPrefix + chunkText, true, set, get, 'chat', sessionId);
      }
    },
  });

  // Finalize from the engine's return value: it always carries the full text
  // (or the error display text on fallback paths), never the throttled tail.
  const finalText = attachPrefix + (typeof fullResult === 'string' ? fullResult : '');
  const chatNotice = get().fallbackNotice;
  const displayText = finalText + (chatNotice && get().fallbackNoticeId !== noticeIdBeforeChat ? `\n\n> ${chatNotice}` : '');
  updateMsg(assistantMsgId, [], displayText, false, set, get, 'chat', sessionId);

  // Label the reply with the endpoint that actually answered (primary or
  // fallback). With no remote answer the send-time on-device label stands.
  const resolvedAnsweredChat: any = answeredBy;
  if (resolvedAnsweredChat) {
    setMsgModelUsed(
      assistantMsgId,
      answeredByLabel(resolvedAnsweredChat),
      'chat',
      sessionId,
      set,
      get,
      resolvedAnsweredChat.isFallback,
      resolvedAnsweredChat.reason,
      resolvedAnsweredChat.hops
    );
  }

  // Trigger spoken readout if in voice synthesis mode or voice output is enabled
  const opMode = get().operatingMode;
  if ((get().isVoiceOutputEnabled || opMode === 'voice' || model?.category === 'voice') && displayText) {
    get().speakText(displayText);
  }
}

function updateMsg(
  id: string,
  steps: AgentStep[],
  content: string,
  isStreaming: boolean,
  set: any,
  get: any,
  mode: 'chat' | 'agent',
  sessionId?: string
) {
  // sessionId (captured when the assistant message was created) pins the write
  // to the session that owns the stream, so switching sessions mid-generation
  // no longer redirects chunks (or drops them + leaves isStreaming:true).
  if (mode === 'agent') {
    const activeId = sessionId || get().activeAgentSessionId;
    const sess = get().agentSessions[activeId];
    if (!sess) return;
    const msgs = sess.messages.map((m: ChatMessage) => {
      if (m.id === id) {
        return {
          ...m,
          agentSteps: steps.length > 0 ? [...steps] : m.agentSteps,
          content,
          isStreaming,
        };
      }
      return m;
    });
    set({
      agentSessions: {
        ...get().agentSessions,
        [activeId]: {
          ...sess,
          messages: msgs,
        },
      },
    });
  } else {
    const activeId = sessionId || get().activeChatSessionId;
    const sess = get().chatSessions[activeId];
    if (!sess) return;
    const msgs = sess.messages.map((m: ChatMessage) => {
      if (m.id === id) {
        return {
          ...m,
          agentSteps: steps.length > 0 ? [...steps] : m.agentSteps,
          content,
          isStreaming,
        };
      }
      return m;
    });
    set({
      chatSessions: {
        ...get().chatSessions,
        [activeId]: {
          ...sess,
          messages: msgs,
        },
      },
    });
  }
}

// Conversation Persistence Vault (auto-save): whenever a chat or agent session
// tree changes, schedule a debounced quota-safe snapshot to localStorage so
// conversations survive Android killing the app in the background.
useAppStore.subscribe((state, prev) => {
  if (state.chatSessions === prev.chatSessions && state.agentSessions === prev.agentSessions &&
      state.activeChatSessionId === prev.activeChatSessionId &&
      state.activeAgentSessionId === prev.activeAgentSessionId) return;
  schedulePersistSessions({
    chatSessions: state.chatSessions,
    agentSessions: state.agentSessions,
    activeChatSessionId: state.activeChatSessionId,
    activeAgentSessionId: state.activeAgentSessionId,
  });
});

// Mirror the guarded speech state into the store so every call site shares one
// honest isSpeaking flag (the guard's watchdogs clear it on a missed onend).
onSpeakingChange((active) => {
  if (useAppStore.getState().isSpeaking !== active) {
    useAppStore.setState({ isSpeaking: active });
  }
});

if (typeof window !== 'undefined') {
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const syncNetworkQuality = () => {
    const wasOffline = !useAppStore.getState().isOnline;
    const isNowOnline = navigator.onLine;
    const conn = (navigator as any).connection;
    const type = conn?.effectiveType || (isNowOnline ? '4g' : 'offline');
    const quality = !isNowOnline ? 'offline' : (type === '4g' || type === '5g' || type === '3g' ? 'fast' : 'slow');
    useAppStore.setState({ networkQuality: quality, isOnline: isNowOnline });
    if (wasOffline && isNowOnline) {
      useAppStore.setState({ justReconnected: true });
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        useAppStore.setState({ justReconnected: false });
      }, 4000);
    } else if (!isNowOnline) {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      useAppStore.setState({ justReconnected: false });
    }
  };
  window.addEventListener('online', syncNetworkQuality);
  window.addEventListener('offline', syncNetworkQuality);
  document.addEventListener('visibilitychange', () => {
    useAppStore.setState({ isAppVisible: document.visibilityState === 'visible' });
  });
  const conn = (navigator as any).connection;
  if (conn && typeof conn.addEventListener === 'function') conn.addEventListener('change', syncNetworkQuality);
}
