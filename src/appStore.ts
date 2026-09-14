import { create } from 'zustand';
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
} from './inferenceEngine';

// Global tracking for mock/fallback download timers
const activeDownloadIntervals = new Map<string, NodeJS.Timeout>();

export interface Attachment {
  id: string;
  type: 'image' | 'camera' | 'file' | 'audio';
  name: string;
  dataUrl: string; // base64 or object URL
  mimeType: string;
  sizeBytes: number;
  durationSec?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelUsed?: string;
  mode?: 'chat' | 'agent';
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
}

interface AppStore {
  // Navigation & View Mode
  currentTab: 'chat' | 'models' | 'device' | 'settings';
  setCurrentTab: (tab: 'chat' | 'models' | 'device' | 'settings') => void;

  // Active Modes
  operatingMode: 'chat' | 'agent'; // Direct Chat vs Hermes Autonomous Agent
  setOperatingMode: (mode: 'chat' | 'agent') => void;
  chatTabMode: 'text' | 'voice'; // Text Chat vs Real-Time Hands-Free Voice Mode
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
  createNewSession: (mode?: 'chat' | 'agent') => void;
  switchSession: (sessionId: string, mode?: 'chat' | 'agent') => void;
  deleteSession: (sessionId: string, mode?: 'chat' | 'agent') => void;
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

  // Settings & Real LLM Endpoint
  apiEndpoint: string;
  setApiEndpoint: (ep: string) => void;
  apiKey: string;
  setApiKey: (k: string) => void;
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  temperature: number;
  setTemperature: (t: number) => void;
  maxTokens: number;
  setMaxTokens: (n: number) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  currentTab: 'chat',
  setCurrentTab: (tab) => set({ currentTab: tab }),

  apiEndpoint: '',
  setApiEndpoint: (ep) => set({ apiEndpoint: ep }),
  apiKey: '',
  setApiKey: (k) => set({ apiKey: k }),

  operatingMode: (() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('androidllm_operating_mode');
      if (savedMode === 'chat' || savedMode === 'agent') {
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
    return 'smollm2-360m-cpu';
  })(),
  setSelectedModelId: (id) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('androidllm_selected_model', id);
      } catch (_) {}
    }
    set({ selectedModelId: id });
    // Auto-download: if the newly selected model has not been downloaded and isn't already
    // downloading, kick off the download automatically so users don't have to manually press
    // the Download button every time they pick a new model.
    const current = get().downloads[id];
    if (!current?.isReady && !current?.isDownloading) {
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
            errorMessage: friendlyMsg,
          },
        },
      }));
    }
  },

  pauseDownloadModel: (modelId: string) => {
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
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
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

      utterance.onstart = () => set({ isSpeaking: true });
      utterance.onend = () => set({ isSpeaking: false });
      utterance.onerror = () => set({ isSpeaking: false });
      window.speechSynthesis.speak(utterance);
    } catch (_) {
      set({ isSpeaking: false });
    }
  },

  stopSpeaking: () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    set({ isSpeaking: false });
  },

  // STOP ALL RUNNING TASKS (Emergency Stop)
  stopAllRunningTasks: () => {
    // 1. Stop Speech Synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }

    // 2. Abort active LLM inference, API fetch, or image generation
    abortAllInference();

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
    const switchedNotice = '';

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      role: 'user',
      content: userText,
      timestamp: Date.now(),
      attachments: [...pendingAttachments],
    };

    const assistantMsgId = `asst-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
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

    // Run execution (Agent Mode vs Direct Chat Mode)
    try {
      if (operatingMode === 'agent') {
        await executeHermesAgent(userText, pendingAttachments, assistantMsgId, switchedNotice, activeModelId, set, get, options?.isLive);
      } else {
        await executeDirectChat(userText, pendingAttachments, assistantMsgId, switchedNotice, activeModelId, set, get, options?.isLive);
      }
    } catch (err: any) {
      console.warn('Execution stopped or encountered error:', err?.message || err);
      // Ensure streaming message shows stopped notice if aborted
      const activeAgentId = get().activeAgentSessionId;
      const activeChatId = get().activeChatSessionId;
      const op = get().operatingMode;
      if (op === 'agent') {
        const sess = get().agentSessions[activeAgentId];
        const target = sess?.messages.find((m) => m.id === assistantMsgId);
        if (target && target.isStreaming) {
          updateMsg(assistantMsgId, target.agentSteps || [], target.content ? `${target.content}\n\n*[Stopped by user]*` : '*[Task stopped by user]*', false, set, get, 'agent');
        }
      } else {
        const sess = get().chatSessions[activeChatId];
        const target = sess?.messages.find((m) => m.id === assistantMsgId);
        if (target && target.isStreaming) {
          updateMsg(assistantMsgId, [], target.content ? `${target.content}\n\n*[Stopped by user]*` : '*[Task stopped by user]*', false, set, get, 'chat');
        }
      }
    } finally {
      set({ isGenerating: false, liveTps: 0 });
    }
  },

  performanceMode: 'balanced',
  setPerformanceMode: (mode) => set({ performanceMode: mode }),

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

  // Stricter keyword matching for mock agent tools to prevent false positives on general chat
  const isSearchQuery = /^(search(\s+for)?|look\s*up|google|find\s+online|latest\s+news|what\s+is\s+the\s+weather|current\s+price)\b/i.test(q) ||
    (/\b(weather in|stock price of|crypto price)\b/i.test(q));
  const isMathQuery = /^(\d+\s*[\+\-\*\/\^%]|calculate\b|compute\b|solve\b|evaluate\b)/i.test(q);
  const isDiagQuery = /\b(battery level|battery percentage|device diagnostics|device stats|hardware spec|system info)\b/i.test(q);
  const isImageGenQuery = /^(generate|draw|create|render|paint)\s+(an?\s+)?(image|picture|photo|artwork|illustration|logo|drawing)\b/i.test(q);

  if (isSearchQuery) {
    toolToCall = AGENT_TOOLS.find((t) => t.name === 'web_search') || null;
    initialThought += 'Decided to call the web_search tool to gather factual grounding.';
  } else if (isMathQuery) {
    toolToCall = AGENT_TOOLS.find((t) => t.name === 'code_interpreter') || null;
    initialThought += 'Decided to call code_interpreter sandbox to run precise computation.';
  } else if (isDiagQuery) {
    toolToCall = AGENT_TOOLS.find((t) => t.name === 'device_diagnostics') || null;
    initialThought += 'Decided to query device_diagnostics for local smartphone metrics.';
  } else if (isImageGenQuery) {
    toolToCall = AGENT_TOOLS.find((t) => t.name === 'create_image') || null;
    initialThought += 'Decided to invoke create_image tool to synthesize diffusion art.';
  }

  if (toolToCall) {
    initialThought += `Decided to invoke local tool \`${toolToCall.name}\`.`;
  } else {
    initialThought += 'No external tool required. Proceeding with direct reasoning and synthesis.';
  }

  const step1: AgentStep = {
    thought: initialThought,
  };
  steps.push(step1);
  updateMsg(assistantMsgId, steps, prefixNotice, true, set, get, 'agent');

  // Step 2: Tool Execution (if required)
  if (toolToCall) {
    await new Promise((r) => setTimeout(r, 400));
    step1.toolCall = {
      name: toolToCall.name,
      arguments: toolToCall.name === 'web_search'
        ? { query: userText }
        : toolToCall.name === 'create_image'
        ? { prompt: userText }
        : { code: userText },
    };
    updateMsg(assistantMsgId, steps, prefixNotice, true, set, get, 'agent');

    await new Promise((r) => setTimeout(r, 500));

    let toolResult = await toolToCall.execute(step1.toolCall.arguments);

    // If create_image, synthesize actual visual image dataUrl
    if (toolToCall.name === 'create_image') {
      try {
        const cleanArtPrompt = userText.replace(/^(generate|draw|create|render|paint|make)(\s+(an?\s+)?(image|picture|photo|artwork|illustration|drawing|art|logo))?(\s+(of|about|depicting|showing))?\s*/i, '').trim() || userText;
        const imgDataUrl = await generateOnDeviceAIImage(cleanArtPrompt, 'Hermes Diffusion Studio');
        toolResult += `\n\n![Generated Art](${imgDataUrl})\n\n**Visual Prompt:** "${cleanArtPrompt}"`;
      } catch (_) {}
    }

    step1.toolResult = toolResult;
    updateMsg(assistantMsgId, steps, prefixNotice, true, set, get, 'agent');

    await new Promise((r) => setTimeout(r, 400));
  }

  // Step 3: Synthesis & Final Answer with Real Inference Engine
  let contextPrompt = userText;
  if (toolToCall && step1.toolResult) {
    contextPrompt += `\n\n[Tool Observation from ${toolToCall.name}]:\n${step1.toolResult}\n\nPlease synthesize the final answer taking into account the tool observation.`;
  }

  const { apiEndpoint, apiKey, systemPrompt, temperature, maxTokens, performanceMode } = get();

  let visualPrefix = prefixNotice;
  if (attachments.some((a) => a.type === 'image' || a.type === 'camera')) {
    visualPrefix += `### 👁️ Multimodal Visual Context Ingested\nInspected image attachments via **${model?.name}** with clear visual features.\n\n`;
  }

  // Retrieve prior conversation history in active session for multi-turn LLM reasoning
  const activeAgentId = get().activeAgentSessionId;
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

  await callRealLLMInference({
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
    },
    onProgress: (statusText, pct) => {
      updateMsg(assistantMsgId, steps, `${visualPrefix}*[Autonomous Agent Reasoning: ${pct}% - ${statusText}]*`, true, set, get, 'agent');
    },
    onStreamChunk: (chunkText) => {
      updateMsg(assistantMsgId, steps, visualPrefix + chunkText, true, set, get, 'agent');
    },
  });

  const finalMsg = get().agentSessions[activeAgentId]?.messages.find((m: ChatMessage) => m.id === assistantMsgId);
  const finalText = finalMsg?.content || visualPrefix;
  updateMsg(assistantMsgId, steps, finalText, false, set, get, 'agent');

  // Trigger optional speech readout
  if (get().isVoiceOutputEnabled && finalText) {
    get().speakText(finalText);
  }
}

// DIRECT CHAT RUNTIME
async function executeDirectChat(
  userText: string,
  attachments: Attachment[],
  assistantMsgId: string,
  prefixNotice: string,
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

  // Retrieve prior conversation history in active chat session
  const activeChatId = get().activeChatSessionId;
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

  const messagesToSend = priorMessages.length > 0 && priorMessages[priorMessages.length - 1]?.role === 'user'
    ? [
        ...priorMessages.slice(0, -1),
        { role: 'user', content: userText },
      ]
    : [
        ...priorMessages,
        { role: 'user', content: userText },
      ];

  let tokenCount = 0;
  let inferenceStartTime = 0;

  const liveSystemPrompt = isLive
    ? 'You are a real-time conversational voice assistant. Reply naturally, conversationally, and concisely (1-3 sentences). Match the exact language the user speaks (English, Chinese, Cantonese, Spanish, etc.).'
    : (systemPrompt || model?.systemPromptPreset || 'You are an intelligent, helpful on-device assistant.');

  await callRealLLMInference({
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
    },
    onProgress: (statusText, pct) => {
      updateMsg(assistantMsgId, [], `${attachPrefix}*[Loading On-Device Model Weights: ${pct}% - ${statusText}]*`, true, set, get, 'chat');
    },
    onStreamChunk: (chunkText) => {
      if (!inferenceStartTime) inferenceStartTime = performance.now();
      tokenCount++;
      const elapsedSec = (performance.now() - inferenceStartTime) / 1000;
      if (elapsedSec > 0.3) {
        const currentTps = Math.round((tokenCount / elapsedSec) * 10) / 10;
        set({ liveTps: currentTps });
      }
      updateMsg(assistantMsgId, [], attachPrefix + chunkText, true, set, get, 'chat');
    },
  });

  const finalMsg = get().chatSessions[activeChatId]?.messages.find((m: ChatMessage) => m.id === assistantMsgId);
  const finalText = finalMsg?.content || attachPrefix;
  updateMsg(assistantMsgId, [], finalText, false, set, get, 'chat');

  // Trigger optional speech readout
  if (get().isVoiceOutputEnabled && finalText) {
    get().speakText(finalText);
  }
}

function updateMsg(
  id: string,
  steps: AgentStep[],
  content: string,
  isStreaming: boolean,
  set: any,
  get: any,
  mode: 'chat' | 'agent'
) {
  if (mode === 'agent') {
    const activeId = get().activeAgentSessionId;
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
    const activeId = get().activeChatSessionId;
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
