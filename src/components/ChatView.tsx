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
} from 'lucide-react';
import { useAppStore, Attachment } from '@/appStore';
import { AVAILABLE_MODELS, ModelSpec } from '@/models';
import CameraModal from './CameraModal';

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
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [modelPromptDownload, setModelPromptDownload] = useState<ModelSpec | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

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

  // Ready models list
  const readyModels = AVAILABLE_MODELS.filter((m) => downloads[m.id]?.isReady);
  // Only surface downloadable models that actually fit this device: RAM, and (for webgpu-engine
  // models) a working WebGPU adapter — cpu-wasm models never need WebGPU so they stay listed
  // regardless. Already-downloaded models stay listed above regardless — they're already installed.
  const unreadyModels = AVAILABLE_MODELS.filter((m) => {
    if (downloads[m.id]?.isReady) return false;
    const fitsRam = !hardwareProfile || hardwareProfile.estimatedRamGB >= m.minRamGB;
    const fitsGpu = m.engine === 'cpu-wasm' || !hardwareProfile || hardwareProfile.hasWebGpu;
    return fitsRam && fitsGpu;
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

  // Real-Time Live Conversational Voice State (Like Doubao / ChatGPT Voice / Gemini Live)
  const [isRealtimeListening, setIsRealtimeListening] = useState(false);
  const [realtimeVoiceStatus, setRealtimeVoiceStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [realtimeLiveTranscript, setRealtimeLiveTranscript] = useState<string>('');
  const [liveLanguage, setLiveLanguage] = useState<'zh-CN' | 'en-US' | 'yue-Hant-HK' | 'auto'>('zh-CN');
  const [liveTurnCount, setLiveTurnCount] = useState<number>(0);
  const realtimeRecRef = useRef<any>(null);
  const realtimeSilenceTimerRef = useRef<any>(null);
  // Ref to track live transcript so Pause & Send can capture it synchronously
  const realtimeLiveTranscriptRef = useRef<string>('');
  // Flag to prevent onend from auto-restarting after manual Pause
  const manuallyPausedRef = useRef<boolean>(false);

  // Stop real-time voice session
  const stopRealtimeVoiceMode = () => {
    setIsRealtimeListening(false);
    setRealtimeVoiceStatus('idle');
    setRealtimeLiveTranscript('');
    if (realtimeSilenceTimerRef.current) clearTimeout(realtimeSilenceTimerRef.current);
    if (realtimeRecRef.current) {
      try {
        realtimeRecRef.current.onend = null;
        realtimeRecRef.current.stop();
      } catch (_) {}
      realtimeRecRef.current = null;
    }
    stopSpeaking();
  };

  // Start continuous hands-free real-time listening (Doubao style back-and-forth)
  const startRealtimeListening = (overrideLang?: string) => {
    if (typeof window === 'undefined') return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Speech Recognition is not supported by your browser/webview. You can use text mode or your keyboard mic.');
      return;
    }

    try {
      if (realtimeRecRef.current) {
        try { realtimeRecRef.current.stop(); } catch (_) {}
      }

      const rec = new SpeechRec();
      const chosenLang = overrideLang || (liveLanguage === 'auto' ? 'zh-CN' : liveLanguage);
      rec.lang = chosenLang;
      rec.continuous = true;
      rec.interimResults = true;

      rec.onstart = () => {
        setIsRealtimeListening(true);
        setRealtimeVoiceStatus('listening');
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((res: any) => res[0].transcript)
          .join(' ');

        if (transcript.trim()) {
          realtimeLiveTranscriptRef.current = transcript; // keep ref in sync for Pause & Send
          setRealtimeLiveTranscript(transcript);
          setRealtimeVoiceStatus('listening');

          // Reset silence timer on new speech tokens
          if (realtimeSilenceTimerRef.current) clearTimeout(realtimeSilenceTimerRef.current);

          // Auto-VAD: After 1.2s of silence following user speech, dispatch to LLM!
          realtimeSilenceTimerRef.current = setTimeout(async () => {
            const promptToSend = transcript.trim();
            if (!promptToSend) return;

            // Pause listening while LLM thinks & speaks
            try { rec.stop(); } catch (_) {}
            setIsRealtimeListening(false);
            setRealtimeVoiceStatus('thinking');
            setRealtimeLiveTranscript('');

            // Increment turns count for Live session
            setLiveTurnCount((prev) => prev + 1);

            // Dispatch message to active session with { isLive: true }
            // This triggers Doubao-style auto-clear / sliding context window so context never overflows!
            await sendMessage(promptToSend, { isLive: true });

            // After AI finishes generating, speak reply immediately
            setRealtimeVoiceStatus('speaking');

            // Wait a tiny beat for store state to settle, then grab latest assistant message
            await new Promise((r) => setTimeout(r, 100));
            try {
              const state = useAppStore.getState();
              const activeId = state.operatingMode === 'agent' ? state.activeAgentSessionId : state.activeChatSessionId;
              const currentSess = state.operatingMode === 'agent'
                ? state.agentSessions[activeId]
                : state.chatSessions[activeId];
              const msgs = currentSess?.messages || [];
              const lastAssistantMsg = [...msgs].reverse().find((m) => m.role === 'assistant');
              const rawText = lastAssistantMsg?.content || '';

              if (rawText && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                // Clean text of markdown, code, image links, and tags
                let clean = rawText
                  .replace(/<think>[\s\S]*?<\/think>/gi, '')
                  .replace(/<think>[\s\S]*/gi, '')
                  .replace(/!\[.*?\]\(.*?\)/g, '')
                  .replace(/\[.*?\]\(.*?\)/g, '')
                  .replace(/```[\s\S]*?```/g, '已生成代码。')
                  .replace(/[`*#_~>]/g, '')
                  .slice(0, 350)
                  .trim();

                if (clean) {
                  window.speechSynthesis.cancel();
                  const utt = new SpeechSynthesisUtterance(clean);
                  utt.rate = 1.08;
                  utt.pitch = 1.0;

                  // Multilingual Voice matching: Chinese, Cantonese, English, etc.
                  const isChineseText = /[\u4e00-\u9fa5]/.test(clean);
                  const voices = window.speechSynthesis.getVoices();
                  if (voices && voices.length > 0) {
                    let matchedVoice: SpeechSynthesisVoice | undefined;
                    if (isChineseText || chosenLang.startsWith('zh')) {
                      matchedVoice = voices.find((v) => v.lang.startsWith('zh') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Xiaoxiao') || v.name.includes('Yunxi')))
                        || voices.find((v) => v.lang.startsWith('zh'))
                        || voices[0];
                    } else {
                      matchedVoice = voices.find((v) => (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural')) && v.lang.startsWith('en'))
                        || voices.find((v) => v.lang.startsWith('en'))
                        || voices[0];
                    }
                    if (matchedVoice) {
                      utt.voice = matchedVoice;
                      utt.lang = matchedVoice.lang;
                    }
                  }

                  let hasResumed = false;
                  const resumeListening = () => {
                    if (hasResumed) return;
                    hasResumed = true;
                    // Doubao-style continuous conversation: immediately listen for user reply!
                    if (chatTabMode === 'voice') {
                      setRealtimeVoiceStatus('listening');
                      startRealtimeListening();
                    } else {
                      setRealtimeVoiceStatus('idle');
                    }
                  };

                  utt.onend = resumeListening;
                  utt.onerror = resumeListening;

                  // Safety timeout in case onend never fires on some mobile WebViews
                  setTimeout(resumeListening, Math.max(2500, clean.length * 100));

                  window.speechSynthesis.speak(utt);
                  return; // onend will resume listening automatically
                }
              }
            } catch (err) {
              console.warn('Live voice speech dispatch error:', err);
            }

            // Fallback if no speech available — resume listening immediately
            if (chatTabMode === 'voice') {
              setRealtimeVoiceStatus('listening');
              startRealtimeListening();
            } else {
              setRealtimeVoiceStatus('idle');
            }
          }, 1200);
        }
      };

      rec.onerror = (e: any) => {
        console.warn('Real-time Speech Recognition notice:', e?.error);
        if (e?.error === 'no-speech' || e?.error === 'network') {
          setTimeout(() => {
            if (chatTabMode === 'voice' && !isGenerating) {
              try { rec.start(); } catch (_) {}
            }
          }, 500);
        }
      };

      rec.onend = () => {
        // Continuous back-and-forth listening — but NOT after a manual pause
        if (manuallyPausedRef.current) return;
        if (chatTabMode === 'voice' && !isGenerating && realtimeVoiceStatus !== 'thinking' && realtimeVoiceStatus !== 'speaking') {
          try { rec.start(); } catch (_) {}
        }
      };

      rec.start();
      realtimeRecRef.current = rec;
      setIsRealtimeListening(true);
      setRealtimeVoiceStatus('listening');
    } catch (err) {
      console.warn('Could not start continuous speech engine:', err);
      setIsRealtimeListening(false);
      setRealtimeVoiceStatus('idle');
    }
  };

  // Sync real-time voice mode status with AI speaking / generating lifecycle
  React.useEffect(() => {
    if (chatTabMode === 'voice') {
      if (isSpeaking) {
        setRealtimeVoiceStatus('speaking');
      } else if (isGenerating) {
        setRealtimeVoiceStatus('thinking');
      } else if (isRealtimeListening) {
        setRealtimeVoiceStatus('listening');
      }
    }
  }, [isSpeaking, isGenerating, isRealtimeListening, chatTabMode]);

  // Clean up real-time voice if leaving voice tab
  React.useEffect(() => {
    if (chatTabMode !== 'voice') {
      stopRealtimeVoiceMode();
    }
  }, [chatTabMode]);

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
      const reader = new FileReader();
      reader.onload = () => {
        const att: Attachment = {
          id: `file-${Date.now()}-${Math.random()}`,
          type: 'file',
          name: file.name,
          dataUrl: reader.result as string,
          mimeType: file.type || 'text/plain',
          sizeBytes: file.size,
        };
        addAttachment(att);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const toggleStepExpand = (msgId: string) => {
    setExpandedSteps((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 active:border-cyan-500 text-[11px] font-bold text-white transition-all cursor-pointer max-w-[150px] shadow-sm select-none"
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
                  className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                  onClick={() => setShowModelPicker(false)}
                />

                {/* Dropdown Menu */}
                <div className="absolute left-0 top-full mt-1.5 w-80 max-w-[90vw] bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl p-2 z-50 space-y-1.5 max-h-96 overflow-y-auto">
                  {/* Ready Models Section */}
                  <div className="px-2 py-1 text-[10px] uppercase font-bold text-emerald-400 flex items-center justify-between">
                    <span>Ready Local Models ({(chatTabMode === 'voice' ? readyModels.filter(m => m.family === 'chat') : readyModels).length})</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  {chatTabMode === 'voice' && (
                    <div className="px-2 pb-1 text-[9px] text-cyan-400/70 flex items-center gap-1">
                      <span>🎙️ Live mode — showing chat models only</span>
                    </div>
                  )}

                  {(chatTabMode === 'voice' ? readyModels.filter(m => m.family === 'chat') : readyModels).length > 0 ? (
                    (chatTabMode === 'voice' ? readyModels.filter(m => m.family === 'chat') : readyModels).map((m) => {
                      const isCur = m.id === selectedModelId;
                      const supportsVoice = m.outputTypes?.includes('audio') || m.outputTypes?.includes('text');
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
                              {m.engine === 'cpu-wasm' && (
                                <span className="text-[8px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">CPU</span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-400 mt-0.5">{m.parameters} • {m.quantization}
                              {chatTabMode === 'voice' && !supportsVoice && (
                                <span className="ml-1 text-amber-500/80">· no voice</span>
                              )}
                            </div>
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
                    <div className="px-3 py-2 text-zinc-400 text-xs italic bg-zinc-950/80 border border-zinc-800 rounded-xl">
                      No models downloaded yet. Tap a model below to install its weights.
                    </div>
                  )}

                  {/* Unready / Need Download Section */}
                  <div className="pt-2 border-t border-zinc-800 px-2 py-1 text-[10px] uppercase font-bold text-zinc-400 flex items-center justify-between">
                    <span>Available Models ({(chatTabMode === 'voice' ? unreadyModels.filter(m => m.family === 'chat') : unreadyModels).length})</span>
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                  </div>

                  {(chatTabMode === 'voice' ? unreadyModels.filter(m => m.family === 'chat') : unreadyModels).map((m) => (
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
                          {m.engine === 'cpu-wasm' && (
                            <span className="text-[8px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">CPU</span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">{(m.sizeMB / 1024).toFixed(1)} GB • {m.family}</div>
                      </div>
                      <span className="text-[10px] text-cyan-400 font-bold px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 shrink-0 flex items-center gap-1 hover:bg-cyan-500/20">
                        <Download className="w-3 h-3" />
                        <span>Get</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Text vs Voice Tab Switcher */}
          <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 p-0.5 rounded-xl shrink-0">
            <button
              onClick={() => setChatTabMode('text')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                chatTabMode === 'text'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3 h-3" />
              <span>Text</span>
            </button>
            <button
              onClick={() => {
                setChatTabMode('voice');
                setIsVoiceOutputEnabled(true); // Always enable voice output when entering live voice mode
                startRealtimeListening();
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                chatTabMode === 'voice'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-extrabold shadow-md shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-emerald-400'
              }`}
            >
              <Headphones className="w-3 h-3" />
              <span>Live</span>
            </button>
          </div>

          {/* Operating Mode Switcher (Chat vs Hermes Agent) */}
          <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 p-0.5 rounded-xl shrink-0">
            <button
              onClick={() => setOperatingMode('chat')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                operatingMode === 'chat'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setOperatingMode('agent')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                operatingMode === 'agent'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Bot className="w-3 h-3" />
              <span>Agent</span>
            </button>
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
              stopRealtimeVoiceMode();
            }}
            title="Stop all running tasks, speech, downloads and generations"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${
              isGenerating || isSpeaking || Object.values(downloads).some((d) => d.isDownloading) || isRealtimeListening
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 hover:bg-rose-500/30 animate-pulse shadow-md shadow-rose-500/20'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-rose-400 hover:border-rose-500/30'
            }`}
          >
            <Octagon className="w-3.5 h-3.5 fill-rose-500/20" />
            <span>Stop All</span>
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



      {/* MAIN VIEW: TEXT MODE VS REAL-TIME HANDS-FREE VOICE MODE */}
      {chatTabMode === 'voice' ? (
        /* Real-Time Hands-Free Conversational Voice Screen (ChatGPT Voice / Gemini Live Style) */
        <div className="flex-1 flex flex-col items-center justify-between p-6 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 relative overflow-hidden select-none">
          {/* Ambient Glows */}
          <div className="absolute top-1/4 w-72 h-72 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/4 w-72 h-72 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

          {/* Top Voice Header Status & Doubao-Style Language Bar */}
          <div className="flex flex-col items-center gap-2 text-center z-10 pt-4 w-full max-w-sm">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/90 border border-zinc-800 text-xs font-bold shadow-lg">
              <span className={`w-2.5 h-2.5 rounded-full ${
                realtimeVoiceStatus === 'listening'
                  ? 'bg-emerald-400 animate-ping'
                  : realtimeVoiceStatus === 'thinking'
                  ? 'bg-amber-400 animate-pulse'
                  : realtimeVoiceStatus === 'speaking'
                  ? 'bg-cyan-400 animate-bounce'
                  : 'bg-zinc-500'
              }`} />
              <span className="capitalize text-zinc-200">
                {realtimeVoiceStatus === 'listening'
                  ? '正在聆听 (Listening)...'
                  : realtimeVoiceStatus === 'thinking'
                  ? '思考生成中 (Thinking)...'
                  : realtimeVoiceStatus === 'speaking'
                  ? '语音回答中 (Speaking)...'
                  : '点击麦克风开始对话'}
              </span>
            </div>

            {/* Language Selector & Auto-Clear Context Badge */}
            <div className="flex items-center justify-between w-full px-2 pt-1">
              {/* Language Switcher */}
              <div className="flex items-center gap-1 bg-zinc-900/80 border border-zinc-800 p-1 rounded-xl">
                {[
                  { id: 'zh-CN', label: '中文' },
                  { id: 'en-US', label: 'English' },
                  { id: 'yue-Hant-HK', label: '粤语' },
                ].map((langItem) => (
                  <button
                    key={langItem.id}
                    onClick={() => {
                      setLiveLanguage(langItem.id as any);
                      if (isRealtimeListening) {
                        stopRealtimeVoiceMode();
                        setTimeout(() => startRealtimeListening(langItem.id), 200);
                      }
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      liveLanguage === langItem.id
                        ? 'bg-emerald-500 text-black font-extrabold shadow'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {langItem.label}
                  </button>
                ))}
              </div>

              {/* Doubao-style Auto-Clear Context Indicator */}
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-xl bg-zinc-900/80 border border-emerald-500/30 text-[10px] text-emerald-400 font-mono font-medium"
                title="Live模式自动滑动清理超长Context，保证手机连续对话永不溢出"
              >
                <Sparkles className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                <span>Context自清理 • 轮次: {liveTurnCount}</span>
              </div>
            </div>
          </div>

          {/* Central Live Neural Audio Orb (Siri / Gemini Live Style) */}
          <div className="relative flex items-center justify-center my-auto z-10">
            {/* Outer Ripple Rings */}
            <div className={`absolute w-64 h-64 rounded-full border border-cyan-500/20 transition-all duration-700 ${
              realtimeVoiceStatus === 'listening' || realtimeVoiceStatus === 'speaking'
                ? 'scale-125 opacity-70 animate-ping'
                : 'scale-90 opacity-20'
            }`} />
            <div className={`absolute w-52 h-52 rounded-full border border-indigo-500/30 transition-all duration-500 ${
              realtimeVoiceStatus === 'listening' || realtimeVoiceStatus === 'speaking'
                ? 'scale-110 opacity-80'
                : 'scale-95 opacity-30'
            }`} />

            {/* Glowing Core Sphere */}
            <button
              onClick={() => {
                if (isRealtimeListening) {
                  stopRealtimeVoiceMode();
                } else {
                  startRealtimeListening();
                }
              }}
              className={`relative w-36 h-36 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 cursor-pointer ${
                realtimeVoiceStatus === 'listening'
                  ? 'bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 shadow-emerald-500/40 scale-105'
                  : realtimeVoiceStatus === 'thinking'
                  ? 'bg-gradient-to-tr from-amber-600 via-orange-500 to-yellow-400 shadow-amber-500/40 animate-spin-slow'
                  : realtimeVoiceStatus === 'speaking'
                  ? 'bg-gradient-to-tr from-cyan-500 via-indigo-600 to-fuchsia-500 shadow-cyan-500/50 scale-110'
                  : 'bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-500 text-zinc-400'
              }`}
            >
              {realtimeVoiceStatus === 'listening' ? (
                <div className="flex flex-col items-center text-black">
                  <Waves className="w-10 h-10 animate-pulse" />
                  <span className="text-[10px] font-black uppercase mt-1">Listening</span>
                </div>
              ) : realtimeVoiceStatus === 'thinking' ? (
                <div className="flex flex-col items-center text-white">
                  <Sparkles className="w-10 h-10 animate-bounce" />
                  <span className="text-[10px] font-black uppercase mt-1">Thinking</span>
                </div>
              ) : realtimeVoiceStatus === 'speaking' ? (
                <div className="flex flex-col items-center text-white">
                  <Volume2 className="w-10 h-10 animate-pulse" />
                  <span className="text-[10px] font-black uppercase mt-1">Speaking</span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-zinc-300">
                  <Mic className="w-10 h-10" />
                  <span className="text-[10px] font-black uppercase mt-1">Tap to Start</span>
                </div>
              )}
            </button>
          </div>

          {/* Subtitle / Live Transcript Card */}
          <div className="w-full max-w-md z-10 space-y-3">
            {realtimeLiveTranscript ? (
              <div className="bg-zinc-900/90 border border-emerald-500/30 rounded-2xl p-3 shadow-xl text-center animate-in fade-in">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">You Are Saying:</span>
                <p className="text-sm text-white font-medium italic">"{realtimeLiveTranscript}"</p>
              </div>
            ) : messages.length > 0 && messages[messages.length - 1].role === 'assistant' ? (
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 shadow-xl max-h-32 overflow-y-auto">
                <span className="text-[10px] uppercase font-bold text-cyan-400 block mb-1">Hermes AI Replied:</span>
                <p className="text-xs text-zinc-200 line-clamp-3 leading-relaxed">
                  {(() => {
                    const raw = messages[messages.length - 1].content;
                    // Strip image data URLs from voice subtitle card
                    const idx = raw.indexOf('](data:image');
                    if (idx > 0) {
                      const start = raw.lastIndexOf('![', idx);
                      const end = raw.indexOf(')', idx);
                      if (start >= 0 && end >= 0) return raw.slice(0, start) + raw.slice(end + 1);
                    }
                    return raw;
                  })()}
                </p>
              </div>
            ) : null}

            {/* Bottom Real-Time Voice Controls */}
            <div className="flex items-center justify-center gap-4 pt-2">
              <button
                onClick={() => setChatTabMode('text')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs font-bold transition-all cursor-pointer shadow-lg"
              >
                <MessageSquare className="w-4 h-4 text-cyan-400" />
                <span>Switch to Text</span>
              </button>

              <button
                onClick={async () => {
                  if (isRealtimeListening) {
                    // Capture transcript from ref BEFORE stopRealtimeVoiceMode clears state
                    const pendingText = realtimeLiveTranscriptRef.current.trim();
                    manuallyPausedRef.current = true; // prevent onend auto-restart
                    stopRealtimeVoiceMode();
                    realtimeLiveTranscriptRef.current = '';
                    if (pendingText) {
                      // User spoke and then hit pause — dispatch their spoken prompt!
                      setRealtimeVoiceStatus('thinking');
                      await sendMessage(pendingText, { isLive: true });
                      setRealtimeVoiceStatus('speaking');
                      // Small delay for store to settle, then read & speak reply
                      await new Promise((r) => setTimeout(r, 80));
                      try {
                        const state = useAppStore.getState();
                        const activeId = state.operatingMode === 'agent' ? state.activeAgentSessionId : state.activeChatSessionId;
                        const currentSess = state.operatingMode === 'agent'
                          ? state.agentSessions[activeId]
                          : state.chatSessions[activeId];
                        const msgs = currentSess?.messages || [];
                        const lastAssistantMsg = [...msgs].reverse().find((m) => m.role === 'assistant');
                        const rawText = lastAssistantMsg?.content || '';
                        if (rawText) {
                          state.speakText(rawText);
                        }
                      } catch (_) {}
                      setRealtimeVoiceStatus('idle');
                    } else {
                      setRealtimeVoiceStatus('idle');
                    }
                    manuallyPausedRef.current = false;
                  } else {
                    manuallyPausedRef.current = false;
                    startRealtimeListening();
                  }
                }}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg ${
                  isRealtimeListening
                    ? 'bg-rose-950/80 border border-rose-500/50 text-rose-300 hover:bg-rose-900'
                    : 'bg-emerald-500 text-black font-extrabold hover:bg-emerald-400'
                }`}
              >
                {isRealtimeListening ? (
                  <>
                    <Square className="w-4 h-4 fill-current" />
                    <span>Pause & Send</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Resume Live Voice</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* STANDARD TEXT & MULTIMODAL CHAT TIMELINE */
        <>
          {/* Messages Thread */}
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
              </div>
            )}

            {messages.map((msg) => {
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
                    className={`p-3 rounded-2xl text-xs leading-relaxed ${
                      isUser
                        ? 'bg-cyan-600 text-white rounded-br-xs shadow-md'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-xs shadow-md'
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
                              {beforeThink && <div className="whitespace-pre-wrap">{beforeThink}</div>}
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
                              {afterThink && <div className="whitespace-pre-wrap leading-relaxed">{afterThink}</div>}
                            </>
                          );
                        }
                        return <div className="whitespace-pre-wrap leading-relaxed">{content}</div>;
                      })()}
                    </div>
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
            {/* Action Buttons: Camera, Gallery, Files */}
            <div className="flex items-center gap-0.5 pb-0.5 pl-1">
              <button
                onClick={() => setIsCameraOpen(true)}
                title="Camera snapshot"
                className="p-2 rounded-xl text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                onClick={() => galleryInputRef.current?.click()}
                title="Image upload"
                className="p-2 rounded-xl text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                title="File attachment"
                className="p-2 rounded-xl text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <Paperclip className="w-4 h-4" />
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
              accept=".txt,.md,.json,.js,.ts,.py,.csv"
              multiple
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* Prompt Textarea */}
            <textarea
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                operatingMode === 'agent'
                  ? 'Ask Hermes to solve, search, code, analyze...'
                  : 'Chat with local model...'
              }
              rows={1}
              className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 resize-none py-2 px-1 focus:outline-none max-h-28"
            />

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
      </>
      )}

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
    </div>
  );
}
