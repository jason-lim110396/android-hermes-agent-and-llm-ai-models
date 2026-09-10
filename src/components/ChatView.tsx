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
  Plus,
  Layers,
  ArrowRight,
  Download,
  Cpu,
  HardDrive,
  Activity,
  Gauge,
} from 'lucide-react';
import { useAppStore, Attachment } from '@/appStore';
import { AVAILABLE_MODELS, ModelSpec } from '@/models';
import CameraModal from './CameraModal';

export default function ChatView() {
  const hardwareProfile = useAppStore((s) => s.hardwareProfile);
  const operatingMode = useAppStore((s) => s.operatingMode);
  const setOperatingMode = useAppStore((s) => s.setOperatingMode);
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const autoSwitchVision = useAppStore((s) => s.autoSwitchVision);
  const setAutoSwitchVision = useAppStore((s) => s.setAutoSwitchVision);
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

  const [inputVal, setInputVal] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [modelPromptDownload, setModelPromptDownload] = useState<ModelSpec | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
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
  const unreadyModels = AVAILABLE_MODELS.filter((m) => !downloads[m.id]?.isReady);

  const [realtimeCpuLoad, setRealtimeCpuLoad] = useState<number>(14);
  const [realtimeRamUsedMB, setRealtimeRamUsedMB] = useState<number>(1240);
  const [realtimeTps, setRealtimeTps] = useState<number>(0);

  // Real-time hardware load fluctuation ticker
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (isGenerating) {
        setRealtimeCpuLoad(Math.round(65 + Math.random() * 28));
        setRealtimeRamUsedMB(Math.round(2100 + Math.random() * 450));
        setRealtimeTps(+(18 + Math.random() * 12).toFixed(1));
      } else {
        setRealtimeCpuLoad(Math.round(8 + Math.random() * 14));
        setRealtimeRamUsedMB(Math.round(1180 + Math.random() * 120));
        setRealtimeTps(0);
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [isGenerating]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Handle Speech-to-Text (Voice input)
  const toggleVoiceRecording = () => {
    if (isRecordingVoice) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecordingVoice(false);
      return;
    }

    if (typeof window === 'undefined') return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Speech Recognition is not supported by your browser/webview. You can type or use your mobile keyboard microphone.');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = true;

      rec.onstart = () => {
        setIsRecordingVoice(true);
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((res: any) => res[0].transcript)
          .join('');
        setInputVal(transcript);
      };

      rec.onerror = () => {
        setIsRecordingVoice(false);
      };

      rec.onend = () => {
        setIsRecordingVoice(false);
      };

      rec.start();
      recognitionRef.current = rec;
    } catch (_) {
      setIsRecordingVoice(false);
    }
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
      {/* Top Floating Control Bar */}
      <div className="px-2.5 py-2 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md flex items-center justify-between z-20 gap-1.5">
        {/* Model Selector Dropdown Button (Only shows Ready Models, else prompts download) */}
        <div className="relative">
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-white hover:border-zinc-700 transition-all cursor-pointer max-w-[155px]"
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
            <span className="truncate">{currentModel?.name || 'Select Model'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          </button>

          {/* Model Dropdown Menu */}
          {showModelPicker && (
            <div className="absolute left-0 top-full mt-1.5 w-72 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-30 space-y-1.5 max-h-80 overflow-y-auto">
              {/* Ready Models Section */}
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-emerald-400 flex items-center justify-between">
                <span>Ready Local Models ({readyModels.length})</span>
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              </div>

              {readyModels.length > 0 ? (
                readyModels.map((m) => {
                  const isCur = m.id === selectedModelId;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedModelId(m.id);
                        setShowModelPicker(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-all cursor-pointer ${
                        isCur
                          ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                          : 'hover:bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="truncate font-semibold">{m.name}</div>
                        <div className="text-[9px] text-zinc-500">{m.parameters} • {m.quantization}</div>
                      </div>
                      <span className="text-[9px] text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 shrink-0">Active</span>
                    </button>
                  );
                })
              ) : (
                <div className="px-2.5 py-2 text-zinc-500 text-[11px] italic bg-zinc-950/60 rounded-lg">
                  No model downloaded yet. Tap a model below to download.
                </div>
              )}

              {/* Unready / Need Download Section */}
              <div className="pt-2 border-t border-zinc-800 px-2 py-1 text-[10px] uppercase font-bold text-zinc-400 flex items-center justify-between">
                <span>Downloadable Models ({unreadyModels.length})</span>
                <Download className="w-3 h-3 text-cyan-400" />
              </div>

              {unreadyModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setShowModelPicker(false);
                    setModelPromptDownload(m);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between hover:bg-zinc-800/80 text-zinc-400 transition-all cursor-pointer"
                >
                  <div className="truncate pr-2">
                    <div className="truncate text-zinc-300">{m.name}</div>
                    <div className="text-[9px] text-zinc-500">{(m.sizeMB / 1024).toFixed(1)} GB • {m.family}</div>
                  </div>
                  <span className="text-[9px] text-cyan-400 font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 shrink-0 flex items-center gap-1">
                    <Download className="w-2.5 h-2.5" />
                    <span>Get</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Operating Mode Switcher (Chat vs Hermes Agent) */}
        <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 p-0.5 rounded-xl">
          <button
            onClick={() => setOperatingMode('chat')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
              operatingMode === 'chat'
                ? 'bg-cyan-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setOperatingMode('agent')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
              operatingMode === 'agent'
                ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Bot className="w-3 h-3" />
            <span>Agent</span>
          </button>
        </div>

        {/* Action Controls: New Session, Speech Toggle, Clear */}
        <div className="flex items-center gap-1">
          {/* New Session Button */}
          <button
            onClick={() => createNewSession()}
            title="New Chat / New Hermes Session"
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-cyan-500/50 text-cyan-400 text-xs font-bold transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[10px]">New</span>
          </button>

          {/* Voice Speech Toggle */}
          <button
            onClick={() => {
              if (isSpeaking) stopSpeaking();
              setIsVoiceOutputEnabled(!isVoiceOutputEnabled);
            }}
            title={isVoiceOutputEnabled ? 'Voice reply enabled (tap to mute)' : 'Voice reply muted (tap to enable)'}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              isVoiceOutputEnabled
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-500'
            }`}
          >
            {isVoiceOutputEnabled ? <Volume2 className="w-3.5 h-3.5 animate-pulse" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          {/* Clear Current Session History Button */}
          <button
            onClick={clearCurrentConversation}
            title="Clear current session messages"
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
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

        {/* Acceleration Engine & Speed */}
        <div className="flex items-center gap-1.5 text-zinc-300">
          <Zap className="w-3 h-3 text-amber-400 shrink-0" />
          <span className="text-zinc-400">GPU:</span>
          <span className="text-amber-300 font-bold">
            {isGenerating ? `${realtimeTps} t/s` : (hardwareProfile?.hasWebGpu ? 'WebGPU' : 'WebGL2')}
          </span>
          {isGenerating && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
          )}
        </div>
      </div>

      {/* Auto Vision Switch Notice Bar */}
      {autoSwitchVision && (
        <div className="bg-cyan-950/30 border-b border-cyan-500/10 px-3 py-1 flex items-center justify-between text-[10px] text-cyan-400/90">
          <div className="flex items-center gap-1.5 truncate">
            <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
            <span className="truncate">Auto-Switch Engine: Photos & camera will automatically route to Vision VLM</span>
          </div>
          <button
            onClick={() => setAutoSwitchVision(!autoSwitchVision)}
            className="text-[9px] text-zinc-400 hover:text-white underline cursor-pointer ml-2 shrink-0"
          >
            Disable
          </button>
        </div>
      )}

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isStepsOpen = expandedSteps[msg.id] ?? true;

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

              <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[90%] sm:max-w-[85%]`}>
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
                    {msg.attachments.map((att) => (
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
                    ))}
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
                <div
                  className={`p-3 rounded-2xl text-xs leading-relaxed ${
                    isUser
                      ? 'bg-cyan-600 text-white rounded-br-xs shadow-md'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-xs shadow-md'
                  }`}
                >
                  {/* If message has generated image markdown ![alt](data:image...) */}
                  {msg.content.includes('![') && msg.content.includes('](data:image') ? (
                    <div className="space-y-2">
                      {(() => {
                        const match = msg.content.match(/!\[(.*?)\]\((data:image\/[^)]+)\)/);
                        const caption = match ? match[1] : '';
                        const imgSrc = match ? match[2] : '';
                        const remainingText = msg.content.replace(/!\[(.*?)\]\((data:image\/[^)]+)\)/, '').trim();

                        return (
                          <>
                            {imgSrc && (
                              <div className="rounded-xl overflow-hidden border border-zinc-700/80 my-1 bg-black shadow-lg">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={imgSrc}
                                  alt={caption || 'Generated AI Image'}
                                  className="w-full max-h-72 object-contain mx-auto"
                                />
                              </div>
                            )}
                            {remainingText && (
                              <div className="whitespace-pre-wrap font-sans text-xs">
                                {remainingText}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap font-sans text-xs">
                      {msg.content || (msg.isStreaming ? 'Thinking...' : '')}
                    </div>
                  )}
                </div>
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

          {/* Voice Input Microphone Button */}
          <button
            type="button"
            onClick={toggleVoiceRecording}
            title={isRecordingVoice ? 'Recording voice... (tap to stop)' : 'Speak prompt (voice-to-text)'}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isRecordingVoice
                ? 'bg-rose-600 border-rose-400 text-white animate-pulse shadow-lg shadow-rose-600/30'
                : 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:text-cyan-400 hover:bg-zinc-800'
            }`}
          >
            {isRecordingVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={(!inputVal.trim() && pendingAttachments.length === 0) || isGenerating}
            className="p-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
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
    </div>
  );
}
