import React, { useRef, useState } from 'react';
import {
  Send,
  Paperclip,
  Camera,
  Image as ImageIcon,
  Bot,
  User,
  Sparkles,
  Zap,
  CheckCircle2,
  Check,
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
  Square,
  Plus,
  Layers,
  Copy,
  ArrowRight,
  Download,
  Cpu,
  HardDrive,
  Activity,
  Gauge,
  MessageSquare,
  Headphones,
  PhoneCall,
  Disc,
  Waves,
  Octagon,
  Menu,
  Eye,
  Search,
  Share2,
  Vibrate,
  Bell,
  Star,
  Bookmark,
  BookOpen,
} from 'lucide-react';
import { useAppStore, Attachment } from '@/appStore';
import { AVAILABLE_MODELS, ModelSpec } from '@/models';
import CameraModal from './CameraModal';
import CodeSandboxModal from './CodeSandboxModal';

export default function ChatView() {
  const hardwareProfile = useAppStore((s) => s.hardwareProfile);
  const operatingMode = useAppStore((s) => s.operatingMode);
  const setOperatingMode = useAppStore((s) => s.setOperatingMode);
  const chatTabMode = useAppStore((s) => s.chatTabMode);
  const setChatTabMode = useAppStore((s) => s.setChatTabMode);
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const liveTps = useAppStore((s) => s.liveTps);
  const downloads = useAppStore((s) => s.downloads);
  const startDownloadModel = useAppStore((s) => s.startDownloadModel);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);

  // Separated Sessions
  const chatSessions = useAppStore((s) => s.chatSessions);
  const agentSessions = useAppStore((s) => s.agentSessions);
  const activeChatSessionId = useAppStore((s) => s.activeChatSessionId);
  const activeAgentSessionId = useAppStore((s) => s.activeAgentSessionId);
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

  const [inputVal, setInputVal] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [modelPromptDownload, setModelPromptDownload] = useState<ModelSpec | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  // Search & Message Actions
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // Starred Bookmarks State
  const [starredMessageIds, setStarredMessageIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        return JSON.parse(window.localStorage.getItem('hermes_starred_msgs') || '[]');
      } catch (_) {}
    }
    return [];
  });
  const [showBookmarksDrawer, setShowBookmarksDrawer] = useState(false);

  // AI Code Playground & Sandbox State
  const [isCodeSandboxOpen, setIsCodeSandboxOpen] = useState(false);
  const [sandboxInitialCode, setSandboxInitialCode] = useState<string>('');

  const handleRunInSandbox = (text: string) => {
    const match = text.match(/```(?:html|javascript|js|css|svg)?\s*([\s\S]*?)```/);
    if (match && match[1]) {
      setSandboxInitialCode(match[1].trim());
    } else {
      setSandboxInitialCode(text.trim());
    }
    setIsCodeSandboxOpen(true);
    if (navigator.vibrate) navigator.vibrate(20);
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
  const [customSnippets, setCustomSnippets] = useState<PromptSnippet[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        return JSON.parse(window.localStorage.getItem('hermes_custom_snippets') || '[]');
      } catch (_) {}
    }
    return [];
  });
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
      window.localStorage.setItem('hermes_custom_snippets', JSON.stringify(next));
    }
    setNewSnippetTitle('');
    setNewSnippetDirective('');
    setIsAddingSnippet(false);
  };

  const handleDeleteCustomSnippet = (id: string) => {
    const next = customSnippets.filter((s) => s.id !== id);
    setCustomSnippets(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('hermes_custom_snippets', JSON.stringify(next));
    }
  };

  const handleInsertSnippet = (directive: string) => {
    setInputVal((prev) => (prev ? `${prev}\n\n${directive}` : directive));
    setShowSnippetsDrawer(false);
    if (navigator.vibrate) navigator.vibrate(20);
  };

  const handleExecuteSnippetNow = (directive: string) => {
    setShowSnippetsDrawer(false);
    if (navigator.vibrate) navigator.vibrate(30);
    sendMessage(directive);
  };

  const toggleStarMessage = (msgId: string) => {
    setStarredMessageIds((prev) => {
      const next = prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId];
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('hermes_starred_msgs', JSON.stringify(next));
      }
      return next;
    });
  };

  const QUICK_PROMPTS = [
    { label: '🚀 Hardware Diagnostic', prompt: 'Audit all device hardware, RAM usage, and WebGPU tensor acceleration.' },
    { label: '🎨 Cyberpunk Art', prompt: 'Generate an ultra-detailed FLUX digital illustration of a futuristic android operating a quantum terminal in neo-Tokyo.' },
    { label: '🔍 Extract & Summarize', prompt: 'Find recent document files on device, analyze their contents, and generate an executive summary.' },
    { label: '🎙️ Kokoro Voice Brief', prompt: 'Summarize today\'s offline device status and prepare a voice briefing script.' },
  ];

  const handleCopyMessage = (msgId: string, content: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(content);
      setCopiedMessageId(msgId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    }
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
  const recognitionRef = useRef<any>(null);

  // Current session & messages depending on operating mode
  const currentSession = operatingMode === 'agent'
    ? agentSessions[activeAgentSessionId] || Object.values(agentSessions)[0]
    : chatSessions[activeChatSessionId] || Object.values(chatSessions)[0];

  const messages = currentSession?.messages || [];
  const currentModel = AVAILABLE_MODELS.find((m) => m.id === selectedModelId);

  const visibleMessages = searchQuery.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()) || m.role.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  // Filter models based on the currently selected operatingMode
  // e.g. In image-gen mode, only display image models. In vision mode, vision models. In voice mode, voice models. In agent or chat mode, text/reasoning models.
  const modeCategory = operatingMode === 'image-gen'
    ? 'image'
    : operatingMode === 'vision'
    ? 'vision'
    : operatingMode === 'voice'
    ? 'voice'
    : operatingMode === 'embedding'
    ? 'embedding'
    : 'text';

  // Ready models list filtered by active purpose mode
  const readyModels = AVAILABLE_MODELS.filter((m) => downloads[m.id]?.isReady);
  const unreadyModels = AVAILABLE_MODELS.filter((m) => {
    if (downloads[m.id]?.isReady) return false;
    const fitsRam = !hardwareProfile || hardwareProfile.estimatedRamGB >= m.minRamGB;
    const fitsGpu = m.engine === 'cpu-wasm' || !hardwareProfile || hardwareProfile.hasWebGpu;
    return fitsRam && fitsGpu;
  });

  const filteredReadyModels = readyModels.filter((m) => {
    if (operatingMode === 'agent') return m.capabilities.includes('tools') || m.capabilities.includes('agent') || m.category === 'text';
    return m.category === modeCategory;
  });

  const filteredUnreadyModels = unreadyModels.filter((m) => {
    if (operatingMode === 'agent') return m.capabilities.includes('tools') || m.capabilities.includes('agent') || m.category === 'text';
    return m.category === modeCategory;
  });

  const [realtimeCpuLoad, setRealtimeCpuLoad] = useState<number>(14);
  const [realtimeRamUsedMB, setRealtimeRamUsedMB] = useState<number>(1240);

  // Real-time hardware load & memory ticker
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (isGenerating) {
        setRealtimeCpuLoad(Math.round(45 + Math.random() * 25));
        setRealtimeRamUsedMB(Math.round(1800 + Math.random() * 250));
      } else {
        setRealtimeCpuLoad(Math.round(8 + Math.random() * 12));
        setRealtimeRamUsedMB(Math.round(1180 + Math.random() * 80));
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [isGenerating]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // WhatsApp-Style Voice Note State
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordDurationSec, setRecordDurationSec] = useState(0);
  const [activeAudioPlayingId, setActiveAudioPlayingId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const currentTranscriptRef = useRef<string>('');



  // Start WhatsApp-Style Voice Recording
  const startWhatsAppVoiceRecording = async () => {
    if (typeof window === 'undefined') return;

    audioChunksRef.current = [];
    currentTranscriptRef.current = '';
    setRecordDurationSec(0);

    // Explicitly check / prompt for microphone permission if supported
    try {
      if (navigator.permissions && navigator.permissions.query) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const permStatus = await navigator.permissions.query({ name: 'microphone' as any });
        if (permStatus.state === 'denied') {
          alert('Microphone permission is blocked. Please grant microphone access in Android App Settings.');
          return;
        }
      }
    } catch (_) {}

    // 1. Initialize Real Speech-to-Text in parallel with safe error handlers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.lang = 'en-US';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((res: any) => res[0].transcript)
            .join(' ');
          currentTranscriptRef.current = transcript;
          setInputVal(transcript);
        };
        rec.onerror = (event: any) => {
          console.warn('SpeechRecognition notice:', event?.error);
        };
        rec.start();
        recognitionRef.current = rec;
      } catch (e) {
        console.warn('SpeechRecognition initialization notice:', e);
      }
    }

    // 2. Initialize MediaStream & MediaRecorder with safety timeout to prevent WebView thread ANR
    let hasAudioStream = false;
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Use Promise.race with a 4-second timeout to prevent any native audio driver deadlocks / ANR
        const mediaStreamPromise = navigator.mediaDevices.getUserMedia({ audio: true });
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Audio permission/hardware timeout')), 4000)
        );

        const stream = await Promise.race([mediaStreamPromise, timeoutPromise]) as MediaStream | null;
        if (stream) {
          hasAudioStream = true;
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };

          mediaRecorder.start(100);
        }
      }
    } catch (err: any) {
      console.warn('Microphone access prompt notice:', err?.message || err);
      // If mic is denied or timed out, stop speech rec and inform user gracefully without freezing
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        alert('Microphone permission was denied. Please allow microphone access to record voice messages.');
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch (_) {}
          recognitionRef.current = null;
        }
        return;
      }
    }

    setIsRecordingVoice(true);

    // Recording seconds ticker
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    voiceTimerRef.current = setInterval(() => {
      setRecordDurationSec((prev) => prev + 1);
    }, 1000);
  };

  // Cancel recording without sending (WhatsApp trash / slide to cancel)
  const cancelVoiceRecording = () => {
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    currentTranscriptRef.current = '';
    setInputVal('');
    setIsRecordingVoice(false);
    setRecordDurationSec(0);
  };

  // Finish recording and send directly to LLM with audio voice note attachment!
  const finishVoiceRecordingAndSend = async () => {
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    const duration = recordDurationSec;

    // Stop Speech Recognition
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }

    let audioDataUrl = '';
    const audioBlob = audioChunksRef.current.length > 0
      ? new Blob(audioChunksRef.current, { type: 'audio/webm' })
      : null;

    if (audioBlob) {
      try {
        audioDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(audioBlob);
        });
      } catch (_) {}
    }

    // Stop media tracks
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      mediaRecorderRef.current = null;
    }

    const transcribedPrompt = currentTranscriptRef.current.trim() || inputVal.trim() || 'Voice message';

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

    setIsRecordingVoice(false);
    setRecordDurationSec(0);
    setInputVal('');

    // Trigger instant message dispatch to LLM!
    setTimeout(() => {
      sendMessage(transcribedPrompt);
    }, 50);
  };

  // Audio Playback handler for voice notes
  const togglePlayAudio = (dataUrl: string, id: string) => {
    if (activeAudioPlayingId === id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setActiveAudioPlayingId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    const audio = new Audio(dataUrl);
    audioPlayerRef.current = audio;
    audio.onended = () => setActiveAudioPlayingId(null);
    audio.onerror = () => setActiveAudioPlayingId(null);
    audio.play();
    setActiveAudioPlayingId(id);
  };

  const handleSend = () => {
    if ((!inputVal.trim() && pendingAttachments.length === 0) || isGenerating) return;
    const text = inputVal;
    setInputVal('');
    sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const att: Attachment = {
          id: `img-${Date.now()}-${Math.random()}`,
          type: 'image',
          name: file.name,
          dataUrl: reader.result as string,
          mimeType: file.type,
          sizeBytes: file.size,
        };
        addAttachment(att);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
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
          addAttachment(att);
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
          addAttachment(att);
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

  const renderFormattedContent = (content: string) => {
    if (!content.includes('```')) {
      return <div className="whitespace-pre-wrap leading-relaxed">{content}</div>;
    }
    const parts = content.split(/(```[\s\S]*?```)/g);
    return (
      <div className="space-y-2">
        {parts.map((part, idx) => {
          if (part.startsWith('```') && part.endsWith('```')) {
            const lines = part.slice(3, -3).trim().split('\n');
            const firstLine = lines[0] || '';
            const lang = /^[a-zA-Z0-9_-]+$/.test(firstLine.trim()) ? firstLine.trim() : '';
            const codeText = lang ? lines.slice(1).join('\n') : lines.join('\n');
            return (
              <div key={idx} className="my-2 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 font-mono text-[11px] shadow-lg">
                <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-zinc-400">
                  <span className="uppercase font-bold text-[10px] text-cyan-400">{lang || 'Code'}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(codeText);
                    }}
                    className="flex items-center gap-1 hover:text-white transition-all cursor-pointer text-[10px] px-1.5 py-0.5 rounded bg-zinc-800"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                </div>
                <pre className="p-3 overflow-x-auto text-zinc-200 leading-relaxed select-text">
                  <code>{codeText}</code>
                </pre>
              </div>
            );
          }
          return <div key={idx} className="whitespace-pre-wrap leading-relaxed">{part}</div>;
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950 relative">
      {/* ── TOP CONTROL BAR  (2 compact rows) ── */}
      <div className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md z-20">
        {/* Row 1: Model Selector  |  Text/Voice Tab  |  Chat/Agent Mode */}
        <div className="px-2 pt-2 pb-1.5 flex items-center gap-1.5">
          {/* Model Selector */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowModelPicker((prev) => !prev)}
              aria-label="Select AI Model"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 active:border-cyan-500 text-[11px] font-bold text-white transition-all cursor-pointer max-w-[190px] shadow-sm select-none"
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
              <span className="truncate">{currentModel?.name || 'Select Model'}</span>
              {currentModel && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ${
                  currentModel.category === 'vision'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : currentModel.category === 'image'
                    ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30'
                    : currentModel.category === 'voice'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}>
                  {currentModel.category === 'vision' ? 'Vision' : currentModel.category === 'image' ? 'Image' : currentModel.category === 'voice' ? 'Voice' : 'Text'}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 text-zinc-400 shrink-0 transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
            </button>

            {/* Model Picker Overlay Backdrop & Menu */}
            {showModelPicker && (
              <>
                {/* Backdrop to easily dismiss when tapping outside on mobile */}
                <div
                  className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                  onClick={() => setShowModelPicker(false)}
                />

                {/* Dropdown Menu */}
                <div className="absolute left-0 top-full mt-1.5 w-84 max-w-[92vw] bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl p-2.5 z-50 space-y-2 max-h-[28rem] overflow-y-auto">
                  {/* Purpose Category Mode Header */}
                  <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800 text-xs font-bold text-zinc-300">
                    <span className="capitalize text-cyan-400">
                      {operatingMode === 'image-gen'
                        ? '🎨 Image Generation Models'
                        : operatingMode === 'vision'
                        ? '👁️ Multimodal & Vision Models'
                        : operatingMode === 'voice'
                        ? '🔊 Neural Voice Models'
                        : operatingMode === 'embedding'
                        ? '🔍 Semantic File Search Models'
                        : operatingMode === 'agent'
                        ? '🤖 Agent Compatible Models'
                        : '💬 Chat & Reasoning Models'}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Filtered for Mode
                    </span>
                  </div>

                  {/* Ready Models Section */}
                  <div className="px-1 py-0.5 text-[10px] uppercase font-bold text-emerald-400 flex items-center justify-between">
                    <span>Ready Local Models ({filteredReadyModels.length})</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>

                  {filteredReadyModels.length > 0 ? (
                    filteredReadyModels.map((m) => {
                      const isCur = m.id === selectedModelId;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedModelId(m.id);
                            setShowModelPicker(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer select-none ${
                            isCur
                              ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/50 shadow-sm'
                              : 'bg-zinc-800/60 hover:bg-zinc-800 active:bg-zinc-750 text-zinc-200 border border-zinc-800'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="truncate font-semibold text-white flex items-center gap-1.5">
                              <span>{m.name}</span>
                              <span className={`text-[8px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                m.category === 'vision'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : m.category === 'image'
                                  ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30'
                                  : m.category === 'voice'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              }`}>
                                {m.category === 'vision' ? '👁️ Vision' : m.category === 'image' ? '🎨 Art' : m.category === 'voice' ? '🔊 Voice' : '📝 Text'}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-400 mt-0.5">{m.parameters} • {m.quantization} • {m.tagline}</div>
                          </div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            isCur ? 'bg-cyan-500 text-black' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}>
                            {isCur ? 'Selected' : 'Active'}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-3 py-2 text-zinc-400 text-[11px] italic bg-zinc-950/80 border border-zinc-800 rounded-xl">
                      No ready models in this category. Tap below to install.
                    </div>
                  )}

                  {/* Available Models (To Download) */}
                  {filteredUnreadyModels.length > 0 && (
                    <>
                      <div className="pt-2 border-t border-zinc-800 px-1 py-0.5 text-[10px] uppercase font-bold text-zinc-400 flex items-center justify-between">
                        <span>Available To Download ({filteredUnreadyModels.length})</span>
                        <Download className="w-3.5 h-3.5 text-cyan-400" />
                      </div>

                      {filteredUnreadyModels.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setShowModelPicker(false);
                            setModelPromptDownload(m);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between bg-zinc-950/40 hover:bg-zinc-800/80 active:bg-zinc-800 border border-zinc-800/60 text-zinc-400 transition-all cursor-pointer select-none"
                        >
                          <div className="truncate pr-2">
                            <div className="truncate text-zinc-200 font-medium flex items-center gap-1.5">
                              <span>{m.name}</span>
                              <span className={`text-[8px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                m.category === 'vision'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : m.category === 'image'
                                  ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30'
                                  : m.category === 'voice'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              }`}>
                                {m.category === 'vision' ? '👁️ Vision' : m.category === 'image' ? '🎨 Art' : m.category === 'voice' ? '🔊 Voice' : '📝 Text'}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">{(m.sizeMB / 1024).toFixed(1)} GB • {m.tagline}</div>
                          </div>
                          <span className="text-[10px] text-cyan-400 font-bold px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 shrink-0 flex items-center gap-1 hover:bg-cyan-500/20">
                            <Download className="w-3 h-3" />
                            <span>Get</span>
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Burger Menu Button & Purpose Selector */}
          <div className="relative shrink-0 ml-auto">
            <button
              onClick={() => setShowModeMenu((prev) => !prev)}
              aria-label="Select Mode Purpose"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer shadow-sm ${
                operatingMode === 'image-gen'
                  ? 'bg-fuchsia-950/80 border-fuchsia-500/50 text-fuchsia-300'
                  : operatingMode === 'vision'
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                  : operatingMode === 'voice'
                  ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                  : operatingMode === 'embedding'
                  ? 'bg-blue-950/80 border-blue-500/50 text-blue-300'
                  : operatingMode === 'agent'
                  ? 'bg-indigo-950/80 border-indigo-500/50 text-indigo-300'
                  : 'bg-zinc-900 border-zinc-700/80 text-zinc-200 hover:text-white'
              }`}
            >
              <Menu className="w-3.5 h-3.5" />
              <span className="capitalize font-extrabold">
                {operatingMode === 'image-gen'
                  ? '🎨 Image Studio'
                  : operatingMode === 'vision'
                  ? '👁️ Vision AI'
                  : operatingMode === 'voice'
                  ? '🔊 Voice Synthesis'
                  : operatingMode === 'embedding'
                  ? '🔍 File Search'
                  : operatingMode === 'agent'
                  ? '🤖 Hermes Agent'
                  : '💬 Chat Mode'}
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showModeMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* Burger Dropdown Modal / Popover */}
            {showModeMenu && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                  onClick={() => setShowModeMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-zinc-900 border border-zinc-700/90 rounded-2xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2 py-1 text-[10px] uppercase font-bold text-zinc-400 tracking-wider border-b border-zinc-800">
                    Select Mode Purpose
                  </div>

                  {/* 1. Chat */}
                  <button
                    onClick={() => {
                      setOperatingMode('chat');
                      setShowModeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                      operatingMode === 'chat'
                        ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                        : 'hover:bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-bold">💬 General Chat</div>
                      <div className="text-[10px] text-zinc-400">Conversational Q&A & Writing</div>
                    </div>
                  </button>

                  {/* 2. Image Generate */}
                  <button
                    onClick={() => {
                      setOperatingMode('image-gen');
                      const imgModel = AVAILABLE_MODELS.find((m) => m.category === 'image');
                      if (imgModel) setSelectedModelId(imgModel.id);
                      setShowModeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                      operatingMode === 'image-gen'
                        ? 'bg-fuchsia-500/20 text-fuchsia-300 font-bold border border-fuchsia-500/40'
                        : 'hover:bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    <ImageIcon className="w-4 h-4 text-fuchsia-400 shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-bold">🎨 Image Generate</div>
                      <div className="text-[10px] text-zinc-400">Diffusion Art & Concept Drawing</div>
                    </div>
                  </button>

                  {/* 3. Vision */}
                  <button
                    onClick={() => {
                      setOperatingMode('vision');
                      const visModel = AVAILABLE_MODELS.find((m) => m.category === 'vision');
                      if (visModel) setSelectedModelId(visModel.id);
                      setShowModeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                      operatingMode === 'vision'
                        ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                        : 'hover:bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    <Eye className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-bold">👁️ Vision & Photo QA</div>
                      <div className="text-[10px] text-zinc-400">Camera OCR & Visual Reasoning</div>
                    </div>
                  </button>

                  {/* 4. Voice */}
                  <button
                    onClick={() => {
                      setOperatingMode('voice');
                      setIsVoiceOutputEnabled(true);
                      const voiceModel = AVAILABLE_MODELS.find((m) => m.category === 'voice');
                      if (voiceModel) setSelectedModelId(voiceModel.id);
                      setShowModeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                      operatingMode === 'voice'
                        ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                        : 'hover:bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    <Volume2 className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-bold">🔊 Voice Synthesis</div>
                      <div className="text-[10px] text-zinc-400">Spoken Readout & Neural TTS</div>
                    </div>
                  </button>

                  {/* 5. Autonomous Agent */}
                  <button
                    onClick={() => {
                      setOperatingMode('agent');
                      setShowModeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                      operatingMode === 'agent'
                        ? 'bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/40'
                        : 'hover:bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    <Bot className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-bold">🤖 Hermes Agent</div>
                      <div className="text-[10px] text-zinc-400">Autonomous Tools & Multi-Step Logic</div>
                    </div>
                  </button>

                  {/* 6. Embedding & Device Files */}
                  <button
                    onClick={() => {
                      setOperatingMode('embedding');
                      const embModel = AVAILABLE_MODELS.find((m) => m.category === 'embedding');
                      if (embModel) setSelectedModelId(embModel.id);
                      setShowModeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                      operatingMode === 'embedding'
                        ? 'bg-blue-500/20 text-blue-300 font-bold border border-blue-500/40'
                        : 'hover:bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    <Search className="w-4 h-4 text-blue-400 shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-bold">🔍 Embedding & File Search</div>
                      <div className="text-[10px] text-zinc-400">Find Videos, Photos, Code & Docs</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Action buttons */}
        <div className="px-2 pb-2 flex items-center gap-1.5">
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
            title={isVoiceOutputEnabled ? 'Voice reply ON – tap to mute' : 'Voice reply muted – tap to enable'}
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

          {/* Starred Bookmarks */}
          <button
            onClick={() => setShowBookmarksDrawer(true)}
            title="View saved bookmarks"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${
              starredMessageIds.length > 0 ? 'bg-amber-950/70 border-amber-500/50 text-amber-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Saved ({starredMessageIds.length})</span>
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

          {/* Clear Session */}
          <button
            onClick={clearCurrentConversation}
            title="Clear current session messages"
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:border-rose-500/30 text-[10px] font-bold transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>

          {/* Export Session */}
          <button
            onClick={handleExportSession}
            title="Export session to Markdown file"
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/40 text-[10px] font-bold transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Row 2: Real-time Hardware Usage Ticker Bar */}
      <div className="px-3 py-1.5 bg-zinc-900/95 border-b border-zinc-800/80 backdrop-blur-md flex items-center justify-between text-[10px] font-mono z-10 select-none">
        {/* RAM Usage */}
        <div className="flex items-center gap-1.5 text-zinc-300">
          <Cpu className="w-3 h-3 text-cyan-400 shrink-0" />
          <span className="text-zinc-400">RAM:</span>
          <span className="text-cyan-300 font-bold">
            {(realtimeRamUsedMB / 1024).toFixed(2)} GB
          </span>
          <span className="text-[9px] text-zinc-500">
            / {hardwareProfile?.estimatedRamGB || 4} GB
          </span>
        </div>

        {/* CPU Load */}
        <div className="flex items-center gap-1.5 text-zinc-300">
          <Gauge className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-zinc-400">CPU:</span>
          <span className={`font-bold ${realtimeCpuLoad > 50 ? 'text-amber-400' : 'text-emerald-300'}`}>
            {realtimeCpuLoad}%
          </span>
          <span className="text-[9px] text-zinc-500">
            ({hardwareProfile?.cpuCores || 8}C)
          </span>
        </div>

        {/* Acceleration Engine & Real Speed */}
        <div className="flex items-center gap-1.5 text-zinc-300">
          <Zap className="w-3 h-3 text-amber-400 shrink-0" />
          <span className="text-zinc-400">{currentModel?.engine === 'cpu-wasm' ? 'CPU:' : 'GPU:'}</span>
          <span className="text-amber-300 font-bold">
            {isGenerating
              ? (liveTps > 0 ? `${liveTps.toFixed(1)} t/s` : 'generating...')
              : (currentModel?.engine === 'cpu-wasm' ? 'WASM CPU' : (hardwareProfile?.hasWebGpu ? 'WebGPU' : 'WebGL2'))}
          </span>
          {isGenerating && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
          )}
        </div>
      </div>

      {/* Row 2.5: Search bar if active */}
      {showSearch && (
        <div className="px-3 py-2 bg-zinc-900/95 border-b border-zinc-800 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages in this session..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-zinc-400 hover:text-white text-xs px-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-[10px] text-zinc-400 font-mono">
            {visibleMessages.length} match{visibleMessages.length === 1 ? '' : 'es'}
          </span>
        </div>
      )}



      {/* MAIN VIEW: MESSAGES TIMELINE */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
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
                          setInputVal(qp.prompt);
                          sendMessage(qp.prompt);
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

            {visibleMessages.map((msg) => {
              const isUser = msg.role === 'user';
              const isStepsOpen = expandedSteps[msg.id] ?? true;
              const lastAssistantId = messages.filter(m => m.role === 'assistant' && !m.isStreaming).at(-1)?.id;
              return (
                <div
                  key={msg.id}
              className={`flex gap-2.5 max-w-3xl ${isUser ? 'ml-auto justify-end' : 'mr-auto justify-start'}`}
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

                {/* Message Bubble */}
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
                        if (navigator.vibrate) navigator.vibrate([30, 30]);
                      }
                    }}
                    title={!isUser ? 'Double-tap to save/bookmark this message' : undefined}
                    className={`p-3 rounded-2xl text-xs leading-relaxed transition-all ${
                      isUser
                        ? 'bg-cyan-600 text-white rounded-br-xs shadow-md'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-xs shadow-md select-text'
                    }`}
                  >
                    <div className="space-y-2 font-sans text-xs">
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

                          return (
                            <>
                              {beforeThink && renderFormattedContent(beforeThink)}
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
                              {afterThink && renderFormattedContent(afterThink)}
                            </>
                          );
                        }
                        return renderFormattedContent(content);
                      })()}
                    </div>
                  </div>
                )}

                {/* Assistant Message Actions Toolbar */}
                {!isUser && !msg.isStreaming && (
                  <div className="flex items-center gap-1.5 mt-1.5 px-1">
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

                    {/* Copy Message Button */}
                    <button
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      title="Copy full response"
                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800/80 transition-all cursor-pointer"
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
                  if (navigator.vibrate) navigator.vibrate(20);
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
                  if (navigator.vibrate) navigator.vibrate(20);
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
                  if (navigator.vibrate) navigator.vibrate(20);
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
                  if (navigator.vibrate) navigator.vibrate(20);
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
                  if (navigator.vibrate) navigator.vibrate(20);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl text-xs font-bold transition-all cursor-pointer"
              >
                <span>Code Sandbox</span>
                <FileCode className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={() => {
              setIsFabOpen(!isFabOpen);
              if (navigator.vibrate) navigator.vibrate(25);
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
      <div className="p-2 bg-zinc-950 border-t border-zinc-800 z-20 shrink-0">
        {/* Mobile Quick Hardware & Intent Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 mb-1 no-scrollbar">
          <button
            onClick={() => {
              const lastAssistantMsg = messages.filter((m) => m.role === 'assistant').at(-1);
              const textToShare = lastAssistantMsg?.content || 'Hermes Autonomous AI on Android: 100% on-device neural inference with zero cloud dependency.';
              if (typeof navigator !== 'undefined' && navigator.share) {
                navigator.share({ title: 'Hermes AI Share', text: textToShare }).catch(() => {});
              } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
                navigator.clipboard.writeText(textToShare);
              }
            }}
            title="Share last response to WhatsApp / Telegram / Android apps"
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-cyan-500/40 text-zinc-300 hover:text-white text-[10px] font-bold shrink-0 transition-all cursor-pointer shadow-sm"
          >
            <Share2 className="w-3 h-3 text-cyan-400" />
            <span>Share to Apps</span>
          </button>

          <button
            onClick={() => {
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate([100, 50, 100]);
              }
            }}
            title="Test phone tactile vibration motor"
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-amber-500/40 text-zinc-300 hover:text-white text-[10px] font-bold shrink-0 transition-all cursor-pointer shadow-sm"
          >
            <Vibrate className="w-3 h-3 text-amber-400" />
            <span>Haptic Buzz</span>
          </button>

          <button
            onClick={() => {
              const prompt = 'Remind me in 30 minutes to review on-device AI logs and battery status';
              setInputVal(prompt);
              sendMessage(prompt);
            }}
            title="Create phone task reminder"
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-emerald-500/40 text-zinc-300 hover:text-white text-[10px] font-bold shrink-0 transition-all cursor-pointer shadow-sm"
          >
            <Bell className="w-3 h-3 text-emerald-400" />
            <span>Set Reminder</span>
          </button>

          <button
            onClick={() => {
              const prompt = 'Audit phone battery, thermal load, and WebGPU tensor speeds';
              setInputVal(prompt);
              sendMessage(prompt);
            }}
            title="Audit phone system diagnostics"
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-indigo-500/40 text-zinc-300 hover:text-white text-[10px] font-bold shrink-0 transition-all cursor-pointer shadow-sm"
          >
            <Activity className="w-3 h-3 text-indigo-400" />
            <span>Device Audit</span>
          </button>
        </div>

        {isRecordingVoice ? (
          /* WhatsApp-Style Voice Recording Bar */
          <div className="relative flex items-center justify-between gap-2 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-emerald-500/40 rounded-2xl px-3 py-2 shadow-2xl animate-in fade-in duration-200">
            {/* Pulsing Recording Indicator & Timer */}
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
              <span className="font-mono text-xs font-bold text-rose-400 tracking-wider">
                {Math.floor(recordDurationSec / 60)}:{(recordDurationSec % 60).toString().padStart(2, '0')}
              </span>
            </div>

            {/* Live Audio Waves Simulation */}
            <div className="flex-1 flex items-center justify-center gap-1 max-w-[180px] px-2">
              {[40, 75, 100, 60, 85, 45, 95, 70, 50, 90, 65, 80, 40].map((h, i) => (
                <div
                  key={i}
                  className="w-1 bg-emerald-400 rounded-full animate-pulse"
                  style={{
                    height: `${Math.max(15, (h * ((i + (recordDurationSec % 5)) % 4 + 1) / 4))}%`,
                    animationDuration: `${400 + (i % 3) * 150}ms`
                  }}
                />
              ))}
            </div>

            {/* Actions: Cancel (Trash) & Send (WhatsApp Paper Airplane) */}
            <div className="flex items-center gap-2">
              <button
                onClick={cancelVoiceRecording}
                title="Slide / Tap to cancel recording"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-rose-950/60 border border-zinc-700/60 hover:border-rose-500/50 text-zinc-400 hover:text-rose-400 text-xs font-medium transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="text-[10px]">Cancel</span>
              </button>
              <button
                onClick={finishVoiceRecordingAndSend}
                title="Send voice note to LLM"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 fill-current" />
                <span>Send</span>
              </button>
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
                  className="p-2 rounded-xl text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                </button>
              )}

              {/* Gallery Image: Visible in vision, agent, chat, and embedding search modes */}
              {(operatingMode === 'vision' || operatingMode === 'agent' || operatingMode === 'chat' || operatingMode === 'embedding') && (
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  title="Image or Video upload to index/search"
                  className="p-2 rounded-xl text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-cyan-400" />
                </button>
              )}

              {/* File / Document: Visible in chat, agent, vision, and embedding search modes */}
              {(operatingMode === 'chat' || operatingMode === 'agent' || operatingMode === 'vision' || operatingMode === 'embedding') && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Document, video, or file attachment to search/index"
                  className="p-2 rounded-xl text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  <Paperclip className="w-4 h-4 text-cyan-400" />
                </button>
              )}

              {/* Smart Prompt Snippets & System Directives Trigger */}
              <button
                type="button"
                onClick={() => setShowSnippetsDrawer(true)}
                title="Smart Prompt Snippets & Custom Directives"
                className="p-2 rounded-xl text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition-all cursor-pointer"
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

            {/* Mode & Category Context Pill inside Chatbox */}
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-1.5 px-1 pt-0.5 pb-0.5 text-[9px] font-mono text-zinc-400">
                <span className={`px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
                  operatingMode === 'vision' || currentModel?.category === 'vision'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : operatingMode === 'image-gen' || currentModel?.category === 'image'
                    ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30'
                    : operatingMode === 'voice' || currentModel?.category === 'voice'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : operatingMode === 'embedding' || currentModel?.category === 'embedding'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : operatingMode === 'agent'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                }`}>
                  {operatingMode === 'vision' || currentModel?.category === 'vision'
                    ? '👁️ Vision Mode'
                    : operatingMode === 'image-gen' || currentModel?.category === 'image'
                    ? '🎨 Image Studio'
                    : operatingMode === 'voice' || currentModel?.category === 'voice'
                    ? '🔊 Neural Voice'
                    : operatingMode === 'embedding' || currentModel?.category === 'embedding'
                    ? '🔍 Embedding Search'
                    : operatingMode === 'agent'
                    ? '🤖 Hermes Agent'
                    : '💬 Chat & Text'}
                </span>
                <span className="truncate text-zinc-500">
                  {operatingMode === 'vision' || currentModel?.category === 'vision'
                    ? 'Attach photos or tap Camera for scene QA'
                    : operatingMode === 'image-gen' || currentModel?.category === 'image'
                    ? 'Describe an image to draw locally'
                    : operatingMode === 'voice' || currentModel?.category === 'voice'
                    ? 'Type text to synthesize speech or record mic'
                    : operatingMode === 'embedding' || currentModel?.category === 'embedding'
                    ? 'Search phone videos, photos, code, documents by meaning'
                    : operatingMode === 'agent'
                    ? 'Autonomous multi-step tools & code execution'
                    : 'Fast reasoning, conversation, and document review'}
                </span>
              </div>

              {/* Prompt Textarea */}
              <textarea
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
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
            </div>

            {/* WhatsApp-Style Push-to-Talk Microphone Button */}
            <button
              type="button"
              onClick={startWhatsAppVoiceRecording}
              title="Record voice note (WhatsApp style)"
              className="p-2 rounded-xl bg-zinc-800/80 border border-zinc-700/80 text-zinc-300 hover:text-emerald-400 hover:bg-zinc-800 transition-all cursor-pointer group"
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
        onCapture={(att) => addAttachment(att)}
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

            {/* Bookmarks List */}
            <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
              {starredMessageIds.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-2">
                  <Star className="w-8 h-8 opacity-40 text-amber-400" />
                  <p className="text-xs">No saved messages yet.</p>
                  <p className="text-[10px] text-zinc-600">Tap the &quot;Save&quot; star icon on any response to bookmark key insights.</p>
                </div>
              ) : (
                messages
                  .filter((m) => starredMessageIds.includes(m.id))
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
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white px-2 py-1 rounded bg-zinc-900 border border-zinc-800 cursor-pointer"
                        >
                          {copiedMessageId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedMessageId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                          onClick={() => {
                            if (typeof navigator !== 'undefined' && navigator.share) {
                              navigator.share({ title: 'Saved Insight', text: msg.content }).catch(() => {});
                            }
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
    </div>
  );
}
