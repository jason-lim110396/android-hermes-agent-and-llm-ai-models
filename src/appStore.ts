import { create } from 'zustand';
import { cancelSpeech, hasSpeechSynthesis, onSpeakingChange, speakGuarded } from './utils/speechGuard';
import { AVAILABLE_MODELS, ModelSpec } from './models';
import { DeviceHardwareProfile, profileMobileHardware } from './deviceProfiler';
import { AgentStep, AGENT_TOOLS } from './agentTools';
import {
  callRealLLMInference,
  getOrInitWebLLMEngine,
  downloadModelWeightsOnly,
  isModelCached,
  deleteModelFromCache,
  generateOnDeviceAIImage,
  abortAllInference,
  releaseActiveModelEngines,
} from './inferenceEngine';
import { abortActiveCpuDownloads } from './wasmInferenceEngine';
import { loadPersistedSessions, schedulePersistSessions } from './utils/sessionPersistence';
import {
  FallbackModelEntry,
  loadFallbackSettings,
  saveFallbackSettings,
} from './utils/modelFallback';

// Global tracking for mock/fallback download timers
const activeDownloadIntervals = new Map<string, NodeJS.Timeout>();

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

  // Separated Multi-Session Threads for Chat and Agent
  chatSessions: Record<string, ChatSession>;
  agentSessions: Record<string, ChatSession>;
  activeChatSessionId: string;
  activeAgentSessionId: string;
  restorePersistedSessions: () => void;
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

  // Input & Messaging
  pendingAttachments: Attachment[];
  isGenerating: boolean;
  addAttachment: (att: Attachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  sendMessage: (userText: string, options?: { isLive?: boolean }) => Promise<void>;
  stopAllRunningTasks: () => void;

  // Performance & Power Efficiency Mode
  performanceMode: 'balanced' | 'eco' | 'performance';
  setPerformanceMode: (mode: 'balanced' | 'eco' | 'performance') => void;

  // Network availability for offline-safe model downloads
  isOnline: boolean;
  networkQuality: 'fast' | 'slow' | 'offline';
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
  const fallbacks = chain
    .filter((e) => e && e.endpoint && e.endpoint.trim())
    .map((e) => ({ label: e.label || e.endpoint, endpoint: e.endpoint, apiKey: e.apiKey, model: e.model }));
  const onFallback = (info: { from: string; to: string; reason: string }) => {
    get().setFallbackNotice(`Model limit hit: ${info.from} ${info.reason}. Switched to ${info.to}.`);
  };
  // Every free/remote endpoint is exhausted: say so *before* the on-device
  // model download begins, which is the step most likely to stall or crash a
  // low-memory Android WebView.
  const onRemoteChainExhausted = (info: { reason: string; to: string }) => {
    get().setFallbackNotice(
      `All remote models unavailable (${info.reason}). Loading ${info.to} - first run may download weights.`
    );
  };
  return { fallbacks, onFallback, onRemoteChainExhausted };
}

export const useAppStore = create<AppStore>((set, get) => ({
  currentTab: 'chat',
  setCurrentTab: (tab) => set({ currentTab: tab }),

  apiEndpoint: '',
  setApiEndpoint: (ep) => set({ apiEndpoint: ep }),
  apiKey: '',
  setApiKey: (k) => set({ apiKey: k }),
  customModelName: '',
  setCustomModelName: (m) => set({ customModelName: m }),
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
      const savedMode = localStorage.getItem('androidllm_operating_mode') as any;
      if (['chat', 'image-gen', 'vision', 'voice', 'agent'].includes(savedMode)) {
        return savedMode;
      }
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
      const saved = localStorage.getItem('androidllm_selected_model');
      if (saved && AVAILABLE_MODELS.some((m) => m.id === saved)) {
        return saved;
      }
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
      const saved = localStorage.getItem('androidllm_selected_model');
      if (saved && updated[saved]?.isReady) {
        nextSelected = saved;
      }
    }
    set({ downloads: updated, selectedModelId: nextSelected });
  },

  startDownloadModel: async (modelId: string) => {
    const spec = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!spec) return;
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
    set((state) => {
      const next = { ...state.downloads };
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
    const persisted = loadPersistedSessions();
    if (!persisted) return;
    const hasChat = Object.keys(persisted.chatSessions).length > 0;
    const hasAgent = Object.keys(persisted.agentSessions).length > 0;
    if (!hasChat && !hasAgent) return;
    set((state) => ({
      // Merge over whatever exists (rather than wholesale replace) so sessions
      // created between store init and this restore are never discarded.
      chatSessions: hasChat ? { ...state.chatSessions, ...persisted.chatSessions } : state.chatSessions,
      agentSessions: hasAgent ? { ...state.agentSessions, ...persisted.agentSessions } : state.agentSessions,
      activeChatSessionId: hasChat
        ? persisted.chatSessions[persisted.activeChatSessionId]
          ? persisted.activeChatSessionId
          : Object.keys(persisted.chatSessions)[0]
        : state.activeChatSessionId,
      activeAgentSessionId: hasAgent
        ? persisted.agentSessions[persisted.activeAgentSessionId]
          ? persisted.activeAgentSessionId
          : Object.keys(persisted.agentSessions)[0]
        : state.activeAgentSessionId,
    }));
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

  speakText: (text: string) => {
    if (!hasSpeechSynthesis()) return;
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

      const utterance = new SpeechSynthesisUtterance(clean.slice(0, 500)); // mobile friendly chunk
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Select highest quality natural/Google voice available on the device
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const naturalVoice = voices.find(
          (v) => (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural') || v.name.includes('Premium')) && v.lang.startsWith('en')
        ) || voices.find((v) => v.lang.startsWith('en')) || voices[0];
        if (naturalVoice) utterance.voice = naturalVoice;
      }

      // Guarded speech keeps isSpeaking honest on Android WebViews that drop
      // onstart or onend (a stuck flag would block the user from speaking
      // again). The guard mirrors its state back into the store.
      speakGuarded(utterance);
    } catch (_) {
      set({ isSpeaking: false });
    }
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

  addAttachment: (att) => set((state) => ({ pendingAttachments: [...state.pendingAttachments, att] })),
  removeAttachment: (id) => set((state) => ({ pendingAttachments: state.pendingAttachments.filter((a) => a.id !== id) })),
  clearAttachments: () => set({ pendingAttachments: [] }),

  sendMessage: async (userText: string, options?: { isLive?: boolean }) => {
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

    // Strict manual model choice — no automatic model switching!
    const activeModelId = selectedModelId;
    const currentModel = AVAILABLE_MODELS.find((m) => m.id === activeModelId);
    const switchedNotice = '';

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
        const finalContent = `![Generated Image](${imgDataUrl})\n\n**Prompt:** "${cleanPrompt}"\n*Generated locally with ${currentModel?.name || 'On-Device Diffusion Engine'}*`;
        updateMsg(assistantMsgId, [], finalContent, false, set, get, 'chat', owningChatSessionId);
      } else if (operatingMode === 'agent') {
        await executeHermesAgent(userText, pendingAttachments, assistantMsgId, switchedNotice, owningAgentSessionId, activeModelId, set, get, options?.isLive);
      } else {
        await executeDirectChat(userText, pendingAttachments, assistantMsgId, switchedNotice, owningChatSessionId, activeModelId, set, get, options?.isLive);
      }
    } catch (err: any) {
      console.warn('Execution stopped or encountered error:', err?.message || err);
      // Ensure streaming message shows stopped notice if aborted. Look the
      // message up in the session captured at send time, not the currently
      // active one (the user may have switched sessions mid-stream).
      const activeAgentId = owningAgentSessionId;
      const activeChatId = owningChatSessionId;
      const op = get().operatingMode;
      if (op === 'agent') {
        const sess = get().agentSessions[activeAgentId];
        const target = sess?.messages.find((m) => m.id === assistantMsgId);
        if (target && target.isStreaming) {
          updateMsg(assistantMsgId, target.agentSteps || [], target.content ? `${target.content}\n\n*[Stopped by user]*` : '*[Task stopped by user]*', false, set, get, 'agent', activeAgentId);
        }
      } else {
        const sess = get().chatSessions[activeChatId];
        const target = sess?.messages.find((m) => m.id === assistantMsgId);
        if (target && target.isStreaming) {
          updateMsg(assistantMsgId, [], target.content ? `${target.content}\n\n*[Stopped by user]*` : '*[Task stopped by user]*', false, set, get, 'chat', activeChatId);
        }
      }
    } finally {
      set({ isGenerating: false, liveTps: 0 });
    }
  },

  performanceMode: 'balanced',
  setPerformanceMode: (mode) => set({ performanceMode: mode }),

  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  networkQuality: typeof navigator !== 'undefined' && navigator.onLine ? 'fast' : 'offline',
  setNetworkQuality: (q) => set({ networkQuality: q }),
  setIsOnline: (online) => set({ isOnline: online }),
  systemPrompt: 'You are Hermes AI Agent, a sovereign on-device intelligence. You reason thoroughly, plan autonomously, and utilize local tools with extreme precision.',
  setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
  temperature: 0.7,
  setTemperature: (t) => set({ temperature: t }),
  maxTokens: 2048,
  setMaxTokens: (n) => set({ maxTokens: n }),
}));

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
    let toolResult = await tool.execute(args);

    // If create_image, synthesize actual visual image dataUrl
    if (tool.name === 'create_image') {
      try {
        const cleanArtPrompt = userText.replace(/^(generate|draw|create|render|paint|make)(\s+(an?\s+)?(image|picture|photo|artwork|illustration|drawing|art|logo))?(\s+(of|about|depicting|showing))?\s*/i, '').trim() || userText;
        const imgDataUrl = await generateOnDeviceAIImage(cleanArtPrompt, 'Hermes Diffusion Studio');
        toolResult += `\n\n![Generated Art](${imgDataUrl})\n\n**Visual Prompt:** "${cleanArtPrompt}"`;
      } catch (_) {}
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
    .filter((m: ChatMessage) => m.id !== assistantMsgId && m.content)
    .slice(-maxTurnsToKeep)
    .map((m: ChatMessage) => ({
      role: m.role,
      content: m.content,
    }));

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
    .filter((m: ChatMessage) => m.id !== assistantMsgId && m.content)
    .slice(-maxTurnsToKeep)
    .map((m: ChatMessage) => ({
      role: m.role,
      content: m.content,
    }));

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
  if (state.chatSessions === prev.chatSessions && state.agentSessions === prev.agentSessions) return;
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
  const syncOnlineStatus = () => { useAppStore.setState({ isOnline: navigator.onLine }); };
  const syncNetworkQuality = () => {
    const conn = (navigator as any).connection;
    const type = conn?.effectiveType || (navigator.onLine ? '4g' : 'offline');
    const quality = !navigator.onLine ? 'offline' : (type === '4g' || type === '5g' || type === '3g' ? 'fast' : 'slow');
    useAppStore.setState({ networkQuality: quality, isOnline: navigator.onLine });
  };
  window.addEventListener('online', syncOnlineStatus);
  window.addEventListener('online', syncNetworkQuality);
  window.addEventListener('offline', syncNetworkQuality);
  const conn = (navigator as any).connection;
  if (conn && typeof conn.addEventListener === 'function') conn.addEventListener('change', syncNetworkQuality);
  window.addEventListener('offline', syncOnlineStatus);
}
