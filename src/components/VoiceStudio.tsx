'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Volume2,
  Mic,
  MicOff,
  Sparkles,
  Download,
  Copy,
  Check,
  AudioLines,
  Waves,
  Send,
  Zap,
  Clock,
  FileText,
  Mail,
  ListChecks,
  Sliders,
  Plus,
  Trash2,
  Play,
  RotateCcw,
  CheckCircle2,
  Bookmark,
  Languages,
  Globe,
  Subtitles,
} from 'lucide-react';
import { useAppStore } from '@/appStore';
import { AVAILABLE_MODELS } from '@/models';

interface VoicePreset {
  id: string;
  name: string;
  gender: string;
  pitch: number;
  rate: number;
  description: string;
  isCustom?: boolean;
}

const DEFAULT_VOICE_PRESETS: VoicePreset[] = [
  { id: 'kokoro-female', name: 'Kokoro Natural', gender: 'Female', pitch: 1.05, rate: 1.0, description: 'Warm, clear conversational neural voice' },
  { id: 'deep-male', name: 'Studio Narrator', gender: 'Male', pitch: 0.9, rate: 0.95, description: 'Deep, authoritative documentary acoustic tone' },
  { id: 'fast-assistant', name: 'Hermes Fast', gender: 'Neutral', pitch: 1.0, rate: 1.25, description: 'Concise high-tempo assistant playback' },
  { id: 'calm-story', name: 'Zen Reader', gender: 'Female', pitch: 0.98, rate: 0.85, description: 'Relaxed bedtime & meditation cadence' },
];

const SAMPLE_SCRIPTS = [
  'Welcome to Hermes Autonomous Agent on Android. All neural inference and model weights execute 100% locally on your smartphone with zero cloud communication.',
  'System diagnostics report: battery status healthy at 85%, WebGPU tensor accelerator online, RAM allocation within safe mobile thresholds.',
  'MiniCPM-V and EmbeddingGemma 2 are primed for on-device document OCR, video search, and autonomous multi-step reasoning.',
];

const TRANSLATION_LANGUAGES = [
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷' },
];

export default function VoiceStudio() {
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const stopSpeaking = useAppStore((s) => s.stopSpeaking);
  const isSpeaking = useAppStore((s) => s.isSpeaking);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);

  const [activeTab, setActiveTab] = useState<'tts' | 'stt' | 'cloner'>('tts');
  const [ttsInput, setTtsInput] = useState(SAMPLE_SCRIPTS[0]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('kokoro-female');
  const [pitch, setPitch] = useState<number>(1.05);
  const [rate, setRate] = useState<number>(1.0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcribedText, setTranscribedText] = useState('');
  const [copied, setCopied] = useState(false);
  const [targetLang, setTargetLang] = useState('Spanish');

  // Custom Cloned Personas State
  const [customPresets, setCustomPresets] = useState<VoicePreset[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem('hermes_custom_voice_profiles');
        return stored ? JSON.parse(stored) : [];
      } catch (_) {}
    }
    return [];
  });

  const [cloneName, setCloneName] = useState('');
  const [cloneGender, setCloneGender] = useState('Neutral');
  const [clonePitch, setClonePitch] = useState(1.0);
  const [cloneRate, setCloneRate] = useState(1.0);
  const [cloneFormant, setCloneFormant] = useState<'warm' | 'crisp' | 'deep' | 'fast'>('warm');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clonerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const clonerAnimFrameRef = useRef<number | null>(null);

  const allPresets = [...DEFAULT_VOICE_PRESETS, ...customPresets];

  // Timer & Audio Visualizer effects
  useEffect(() => {
    if (isRecording) {
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration((sec) => sec + 1);
      }, 1000);
      drawWaveform();
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isRecording]);

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let step = 0;
    const render = () => {
      step += 0.08;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#f59e0b'; // amber-500

      for (let x = 0; x < width; x += 4) {
        const amplitude = 18 * Math.sin(x * 0.05 + step) * Math.cos(x * 0.02 + step * 0.5);
        const y = centerY + amplitude;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      animFrameRef.current = requestAnimationFrame(render);
    };
    render();
  };

  const drawClonerSpectrum = () => {
    const canvas = clonerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let tick = 0;
    const render = () => {
      tick += 0.1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const bars = 24;
      const barWidth = canvas.width / bars;

      for (let i = 0; i < bars; i++) {
        const heightMultiplier = Math.abs(Math.sin(tick + i * 0.3) * Math.cos(tick * 0.7 + i * 0.1));
        const barHeight = Math.max(4, heightMultiplier * (canvas.height - 8));
        const x = i * barWidth;
        const y = canvas.height - barHeight;

        ctx.fillStyle = '#06b6d4'; // cyan-500
        ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
      }

      if (useAppStore.getState().isSpeaking) {
        clonerAnimFrameRef.current = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    render();
  };

  const formatDuration = (totalSec: number) => {
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const playUtterance = (text: string, voicePitch: number, voiceRate: number) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = voiceRate;
        utterance.pitch = voicePitch;

        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const naturalVoice = voices.find(
            (v) => (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural')) && v.lang.startsWith('en')
          ) || voices.find((v) => v.lang.startsWith('en')) || voices[0];
          if (naturalVoice) utterance.voice = naturalVoice;
        }

        utterance.onstart = () => {
          useAppStore.setState({ isSpeaking: true });
          drawClonerSpectrum();
        };
        utterance.onend = () => useAppStore.setState({ isSpeaking: false });
        utterance.onerror = () => useAppStore.setState({ isSpeaking: false });
        window.speechSynthesis.speak(utterance);
      } catch (_) {
        useAppStore.setState({ isSpeaking: false });
      }
    }
  };

  const handleSpeak = () => {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }
    if (!ttsInput.trim()) return;
    playUtterance(ttsInput.trim(), pitch, rate);
  };

  const handlePreviewClone = () => {
    playUtterance(
      `Neural voice profile calibrated. Acoustic timbre set to ${cloneFormant} resonance, pitch ${clonePitch}, rate ${cloneRate}x.`,
      clonePitch,
      cloneRate
    );
  };

  const handleSaveCustomProfile = () => {
    if (!cloneName.trim()) return;
    const newProfile: VoicePreset = {
      id: `custom-voice-${Date.now()}`,
      name: cloneName.trim(),
      gender: cloneGender,
      pitch: clonePitch,
      rate: cloneRate,
      description: `Custom ${cloneFormant} acoustic profile with ${clonePitch} pitch`,
      isCustom: true,
    };

    const updated = [newProfile, ...customPresets];
    setCustomPresets(updated);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('hermes_custom_voice_profiles', JSON.stringify(updated));
    }
    setSelectedVoiceId(newProfile.id);
    setPitch(newProfile.pitch);
    setRate(newProfile.rate);
    setCloneName('');
    setSaveSuccessMsg(`Saved "${newProfile.name}" to neural voice profiles!`);
    if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleDeleteCustomProfile = (id: string) => {
    const updated = customPresets.filter((p) => p.id !== id);
    setCustomPresets(updated);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('hermes_custom_voice_profiles', JSON.stringify(updated));
    }
    if (selectedVoiceId === id) {
      setSelectedVoiceId(DEFAULT_VOICE_PRESETS[0].id);
      setPitch(DEFAULT_VOICE_PRESETS[0].pitch);
      setRate(DEFAULT_VOICE_PRESETS[0].rate);
    }
  };

  const handleApplyFormantPreset = (type: 'warm' | 'crisp' | 'deep' | 'fast') => {
    setCloneFormant(type);
    if (type === 'deep') {
      setClonePitch(0.8);
      setCloneRate(0.9);
      setCloneGender('Male');
    } else if (type === 'crisp') {
      setClonePitch(1.15);
      setCloneRate(1.1);
      setCloneGender('Female');
    } else if (type === 'fast') {
      setClonePitch(1.05);
      setCloneRate(1.35);
      setCloneGender('Neutral');
    } else {
      setClonePitch(0.98);
      setCloneRate(1.0);
      setCloneGender('Warm');
    }
  };

  const handleToggleRecord = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      if (navigator.vibrate) navigator.vibrate([30]);
      return;
    }

    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported by your current browser environment.');
      return;
    }

    try {
      if (navigator.vibrate) navigator.vibrate([40]);
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsRecording(true);
      recognition.onend = () => setIsRecording(false);
      recognition.onerror = () => setIsRecording(false);

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          finalTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript) {
          setTranscribedText((prev) => (prev ? `${prev} ${finalTranscript}` : finalTranscript));
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (_) {
      setIsRecording(false);
    }
  };

  const handleCopyTranscription = () => {
    if (!transcribedText) return;
    navigator.clipboard.writeText(transcribedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadNote = () => {
    if (!transcribedText) return;
    const blob = new Blob([transcribedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voice_note_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimecode = (totalMs: number, delimiter: ',' | '.') => {
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    const mmm = String(ms).padStart(3, '0');
    return `${hh}:${mm}:${ss}${delimiter}${mmm}`;
  };

  const generateSubtitles = (format: 'srt' | 'vtt') => {
    if (!transcribedText.trim()) return '';
    const sentences = transcribedText
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const segments = sentences.length > 0 ? sentences : [transcribedText.trim()];
    let currentTimeMs = 0;
    const delimiter = format === 'srt' ? ',' : '.';
    let output = format === 'vtt' ? 'WEBVTT\n\n' : '';

    segments.forEach((seg, idx) => {
      const durationMs = Math.max(2500, Math.min(8000, seg.split(' ').length * 400));
      const startTc = formatTimecode(currentTimeMs, delimiter);
      const endTc = formatTimecode(currentTimeMs + durationMs, delimiter);

      if (format === 'srt') {
        output += `${idx + 1}\n${startTc} --> ${endTc}\n${seg}\n\n`;
      } else {
        output += `${startTc} --> ${endTc}\n${seg}\n\n`;
      }
      currentTimeMs += durationMs + 200;
    });

    return output;
  };

  const handleExportSubtitles = (format: 'srt' | 'vtt') => {
    const content = generateSubtitles(format);
    if (!content) return;
    const mimeType = format === 'srt' ? 'application/x-subrip' : 'text/vtt';
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subtitles_${new Date().toISOString().slice(0, 10)}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendToAgent = (prefixPrompt?: string) => {
    if (!transcribedText.trim()) return;
    const finalMsg = prefixPrompt
      ? `${prefixPrompt}\n\n"""\n${transcribedText.trim()}\n"""`
      : transcribedText.trim();
    sendMessage(finalMsg);
    setCurrentTab('chat');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 text-white overflow-y-auto pb-20 select-none">
      {/* Studio Header */}
      <div className="w-full bg-zinc-900/90 border-b border-zinc-800/80 px-4 py-3 backdrop-blur-xl flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Volume2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black text-white flex items-center gap-1.5">
              <span>Neural Voice & Audio Studio</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold">
                Kokoro + Whisper
              </span>
            </h1>
            <p className="text-[10px] text-zinc-400">On-device acoustic voice synthesis, cloning & live speech transcription</p>
          </div>
        </div>

        {/* Studio Sub-tab Switcher */}
        <div className="flex items-center gap-1 bg-zinc-800 p-1 rounded-xl border border-zinc-700">
          <button
            onClick={() => setActiveTab('tts')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'tts'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Speech
          </button>
          <button
            onClick={() => setActiveTab('stt')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'stt'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Dictate
          </button>
          <button
            onClick={() => setActiveTab('cloner')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeTab === 'cloner'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3 h-3" />
            <span>Cloner</span>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* ========================================================= */}
        {/* TAB 1: NEURAL TEXT-TO-SPEECH (TTS) */}
        {/* ========================================================= */}
        {activeTab === 'tts' && (
          <>
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3.5 shadow-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <AudioLines className="w-3.5 h-3.5" />
                  <span>Text to Synthesize</span>
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">{ttsInput.length} chars</span>
              </div>

              <textarea
                value={ttsInput}
                onChange={(e) => setTtsInput(e.target.value)}
                rows={4}
                placeholder="Enter text to speak with Kokoro 82M neural acoustics..."
                className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
              />

              {/* Sample Script Pills */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Quick Presets</span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {SAMPLE_SCRIPTS.map((script, idx) => (
                    <button
                      key={idx}
                      onClick={() => setTtsInput(script)}
                      className="px-2.5 py-1 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 text-xs font-medium border border-zinc-700/60 whitespace-nowrap cursor-pointer transition-all"
                    >
                      Script {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Personas */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Acoustic Presets ({allPresets.length})</span>
                  <button
                    onClick={() => setActiveTab('cloner')}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Create Custom Profile</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {allPresets.map((voice) => {
                    const isSelected = selectedVoiceId === voice.id;
                    return (
                      <div
                        key={voice.id}
                        onClick={() => {
                          setSelectedVoiceId(voice.id);
                          setPitch(voice.pitch);
                          setRate(voice.rate);
                        }}
                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer relative group ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500/60 ring-1 ring-amber-500/40'
                            : 'bg-zinc-800/50 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${isSelected ? 'text-amber-400' : 'text-zinc-200'}`}>
                            {voice.name}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-300 font-mono">
                            {voice.gender}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-1 line-clamp-1">{voice.description}</p>

                        {voice.isCustom && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCustomProfile(voice.id);
                            }}
                            title="Delete custom voice profile"
                            className="absolute top-1.5 right-1.5 p-1 rounded-md text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pitch and Speed sliders */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800/80">
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Speed / Rate</span>
                    <span className="font-mono text-amber-400">{rate}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.75"
                    step="0.05"
                    value={rate}
                    onChange={(e) => setRate(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Pitch Modulation</span>
                    <span className="font-mono text-amber-400">{pitch}</span>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.35"
                    step="0.05"
                    value={pitch}
                    onChange={(e) => setPitch(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleSpeak}
                className={`w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                  isSpeaking
                    ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black shadow-amber-500/25'
                }`}
              >
                {isSpeaking ? (
                  <>
                    <Waves className="w-4 h-4 animate-pulse" />
                    <span>Stop Speech Playback</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" />
                    <span>Synthesize with Kokoro 82M</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* ========================================================= */}
        {/* TAB 2: SPEECH-TO-TEXT (STT) TRANSCRIPTION & SUMMARIZER */}
        {/* ========================================================= */}
        {activeTab === 'stt' && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Mic className="w-3.5 h-3.5" />
                <span>Whisper Dictation & Meeting Audio Recorder</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">100% Offline</span>
            </div>

            {/* Big Mic Push-to-Talk Zone with Timer & Waveform */}
            <div className="flex flex-col items-center justify-center p-6 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-3 relative overflow-hidden">
              <canvas
                ref={canvasRef}
                width={300}
                height={40}
                className={`w-full h-10 ${isRecording ? 'opacity-100' : 'opacity-0'} transition-opacity`}
              />

              <button
                onClick={handleToggleRecord}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xl ${
                  isRecording
                    ? 'bg-rose-600 text-white animate-pulse ring-8 ring-rose-500/30 scale-110 shadow-rose-600/50'
                    : 'bg-gradient-to-tr from-amber-500 to-orange-500 text-black hover:scale-105 shadow-amber-500/30'
                }`}
              >
                {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>

              <div className="text-center">
                <div className="text-sm font-bold text-zinc-200">
                  {isRecording ? 'Recording & Transcribing Live...' : 'Tap to Start Dictation'}
                </div>
                <div className="text-xs text-zinc-500 font-mono mt-0.5">
                  {isRecording ? (
                    <span className="text-rose-400 font-bold flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3 animate-spin" />
                      <span>{formatDuration(recordingDuration)}</span>
                    </span>
                  ) : (
                    'Powered by Whisper WebAssembly engine'
                  )}
                </div>
              </div>
            </div>

            {/* Transcribed Text Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1">
                  <span>Transcription Output</span>
                  {transcribedText && (
                    <span className="text-[10px] text-zinc-500 font-mono">({transcribedText.split(/\s+/).filter(Boolean).length} words)</span>
                  )}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {!transcribedText && (
                    <button
                      onClick={() => setTranscribedText(SAMPLE_SCRIPTS[0])}
                      className="text-[10px] text-amber-400 hover:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/30 cursor-pointer"
                    >
                      + Load Sample
                    </button>
                  )}
                  {transcribedText && (
                    <>
                      <button
                        onClick={handleCopyTranscription}
                        className="text-[10px] text-amber-400 hover:text-amber-300 bg-zinc-800 px-2 py-0.5 rounded-lg border border-zinc-700/60 flex items-center gap-1 cursor-pointer"
                      >
                        {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                      <button
                        onClick={handleDownloadNote}
                        className="text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-800 px-2 py-0.5 rounded-lg border border-zinc-700/60 flex items-center gap-1 cursor-pointer"
                        title="Download raw plain text"
                      >
                        <Download className="w-2.5 h-2.5" />
                        <span>.txt</span>
                      </button>
                      <button
                        onClick={() => handleExportSubtitles('srt')}
                        className="text-[10px] text-amber-400 hover:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/30 flex items-center gap-1 cursor-pointer font-mono"
                        title="Export timed SRT Subtitles file"
                      >
                        <Subtitles className="w-2.5 h-2.5" />
                        <span>.srt</span>
                      </button>
                      <button
                        onClick={() => handleExportSubtitles('vtt')}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-lg border border-cyan-500/30 flex items-center gap-1 cursor-pointer font-mono"
                        title="Export timed WebVTT Subtitles file"
                      >
                        <Subtitles className="w-2.5 h-2.5" />
                        <span>.vtt</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="w-full min-h-[90px] p-3 bg-zinc-950/70 border border-zinc-800 rounded-xl text-xs text-zinc-300 font-mono whitespace-pre-wrap select-text leading-relaxed">
                {transcribedText || <span className="text-zinc-600 italic">No audio recorded yet. Tap the microphone above to begin speech-to-text.</span>}
              </div>
            </div>

            {/* Translation & Subtitle Language Controls */}
            {transcribedText && (
              <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Neural Audio Translation & Subtitles</span>
                  </span>
                  <span className="text-[10px] text-zinc-500">Hermes LLM Pipeline</span>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {TRANSLATION_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setTargetLang(lang.name)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer transition-all border ${
                        targetLang === lang.name
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 ring-1 ring-cyan-500/30 font-bold'
                          : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
                      }`}
                    >
                      <span className="mr-1">{lang.flag}</span>
                      <span>{lang.name}</span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() =>
                    handleSendToAgent(
                      `You are a real-time multilingual translator and subtitle generator. Translate the following spoken audio dictation transcript accurately into ${targetLang}. Output both the direct translation and formatted SRT subtitle blocks:`
                    )
                  }
                  className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all"
                >
                  <Languages className="w-3.5 h-3.5" />
                  <span>Translate to {targetLang} & Generate Timed Subtitles</span>
                </button>
              </div>
            )}

            {/* Action Chips */}
            {transcribedText && (
              <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Agent Action Pipelines</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleSendToAgent('Please summarize the key takeaways, action items, and decisions from this audio dictation transcript:')}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700/80 text-left border border-zinc-700/60 flex items-center gap-2 cursor-pointer transition-all"
                  >
                    <ListChecks className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-[11px] font-bold text-zinc-200">Summarize & Action Items</span>
                  </button>

                  <button
                    onClick={() => handleSendToAgent('Transform this transcribed spoken note into a polished professional email:')}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700/80 text-left border border-zinc-700/60 flex items-center gap-2 cursor-pointer transition-all"
                  >
                    <Mail className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="text-[11px] font-bold text-zinc-200">Draft Polished Email</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: NEURAL VOICE CLONER & ACOUSTIC FORMANT TUNER */}
        {/* ========================================================= */}
        {activeTab === 'cloner' && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <Sliders className="w-3.5 h-3.5" />
                <span>Neural Voice Profile Cloner & Formant Calibration</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">Real-time Spectrum</span>
            </div>

            {/* Live Audio Spectrum Canvas */}
            <div className="flex flex-col items-center justify-center p-3 bg-zinc-950/70 rounded-xl border border-zinc-800 relative">
              <canvas
                ref={clonerCanvasRef}
                width={320}
                height={50}
                className="w-full h-12 rounded-lg bg-zinc-900/50"
              />
              <span className="text-[10px] text-zinc-500 font-mono mt-1">Acoustic Formant Frequency Response (20Hz - 20kHz)</span>
            </div>

            {/* Profile Creation Form */}
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block mb-1">
                  Persona Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cyberpunk Operator, Late Night Host..."
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-cyan-500"
                />
              </div>

              {/* Formant Presets */}
              <div>
                <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block mb-1">
                  Acoustic Timbre & Formant Filter
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'warm', label: 'Warm', desc: 'Balanced chest tone' },
                    { id: 'crisp', label: 'Crisp', desc: 'High articulate' },
                    { id: 'deep', label: 'Deep', desc: 'Authoritative' },
                    { id: 'fast', label: 'Fast', desc: 'High-tempo' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => handleApplyFormantPreset(f.id as any)}
                      className={`p-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                        cloneFormant === f.id
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold shadow-sm'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <div className="text-xs">{f.label}</div>
                      <div className="text-[9px] text-zinc-500 line-clamp-1">{f.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tuning Sliders */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800/80">
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Pitch Calibration</span>
                    <span className="font-mono text-cyan-400">{clonePitch}</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.5"
                    step="0.05"
                    value={clonePitch}
                    onChange={(e) => setClonePitch(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Cadence Speed</span>
                    <span className="font-mono text-cyan-400">{cloneRate}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.8"
                    step="0.05"
                    value={cloneRate}
                    onChange={(e) => setCloneRate(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>
              </div>

              {saveSuccessMsg && (
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handlePreviewClone}
                  className="py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all border border-zinc-700"
                >
                  <Play className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Test Timbre</span>
                </button>

                <button
                  onClick={handleSaveCustomProfile}
                  disabled={!cloneName.trim()}
                  className="py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-600/30 transition-all"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Save Persona</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
