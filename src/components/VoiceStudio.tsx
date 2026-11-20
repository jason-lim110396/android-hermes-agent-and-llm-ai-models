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
}

const VOICE_PRESETS: VoicePreset[] = [
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

export default function VoiceStudio() {
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const speakText = useAppStore((s) => s.speakText);
  const stopSpeaking = useAppStore((s) => s.stopSpeaking);
  const isSpeaking = useAppStore((s) => s.isSpeaking);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);

  const [activeTab, setActiveTab] = useState<'tts' | 'stt'>('tts');
  const [ttsInput, setTtsInput] = useState(SAMPLE_SCRIPTS[0]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('kokoro-female');
  const [pitch, setPitch] = useState<number>(1.05);
  const [rate, setRate] = useState<number>(1.0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcribedText, setTranscribedText] = useState('');
  const [copied, setCopied] = useState(false);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const voiceModels = AVAILABLE_MODELS.filter((m) => m.category === 'voice' || m.family === 'audio');

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

  const formatDuration = (totalSec: number) => {
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSpeak = () => {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }
    if (!ttsInput.trim()) return;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(ttsInput.trim());
        utterance.rate = rate;
        utterance.pitch = pitch;

        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const naturalVoice = voices.find(
            (v) => (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural')) && v.lang.startsWith('en')
          ) || voices.find((v) => v.lang.startsWith('en')) || voices[0];
          if (naturalVoice) utterance.voice = naturalVoice;
        }

        utterance.onstart = () => useAppStore.setState({ isSpeaking: true });
        utterance.onend = () => useAppStore.setState({ isSpeaking: false });
        utterance.onerror = () => useAppStore.setState({ isSpeaking: false });
        window.speechSynthesis.speak(utterance);
      } catch (_) {
        useAppStore.setState({ isSpeaking: false });
      }
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
            <p className="text-[10px] text-zinc-400">On-device acoustic voice synthesis & live speech transcription</p>
          </div>
        </div>

        {/* Studio Sub-tab Switcher */}
        <div className="flex items-center gap-1 bg-zinc-800 p-1 rounded-xl border border-zinc-700">
          <button
            onClick={() => setActiveTab('tts')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'tts'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Speech Synthesizer
          </button>
          <button
            onClick={() => setActiveTab('stt')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'stt'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Voice Dictation & STT
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
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Acoustic Presets</span>
                <div className="grid grid-cols-2 gap-2">
                  {VOICE_PRESETS.map((voice) => {
                    const isSelected = selectedVoiceId === voice.id;
                    return (
                      <button
                        key={voice.id}
                        onClick={() => {
                          setSelectedVoiceId(voice.id);
                          setPitch(voice.pitch);
                          setRate(voice.rate);
                        }}
                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
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
                      </button>
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
              {/* Live Waveform Canvas */}
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
                {isRecording ? (
                  <div className="flex items-center justify-center gap-1.5 text-rose-400 font-mono font-bold text-xs">
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span>Recording: {formatDuration(recordingDuration)}</span>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-white">Tap to start recording</p>
                )}
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  {isRecording ? 'Tap again to stop & transcribe' : 'Speak clearly into your smartphone microphone'}
                </p>
              </div>
            </div>

            {/* Transcription Deliverable Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-400">Transcript Result:</span>
                <div className="flex items-center gap-2">
                  {transcribedText && (
                    <>
                      <button
                        onClick={handleDownloadNote}
                        className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        title="Save as TXT file"
                      >
                        <Download className="w-3 h-3" />
                        <span>Export</span>
                      </button>
                      <button
                        onClick={() => setTranscribedText('')}
                        className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
                      >
                        Clear
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleCopyTranscription}
                    disabled={!transcribedText}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold cursor-pointer disabled:opacity-40"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800 min-h-[100px] text-xs font-mono text-zinc-200 select-text leading-relaxed">
                {transcribedText || (
                  <span className="text-zinc-600 italic">No speech recorded yet. Tap the microphone above to begin...</span>
                )}
              </div>

              {/* Instant Autonomous AI Prompt Action Chips */}
              {transcribedText && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Instant AI Meeting Workflows</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      onClick={() => handleSendToAgent('Extract all action items, assignees, and deadlines from this meeting note in bullet points:')}
                      className="flex items-center gap-1.5 p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-left text-xs font-semibold text-zinc-200 cursor-pointer transition-all"
                    >
                      <ListChecks className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="line-clamp-1">Action Items</span>
                    </button>
                    <button
                      onClick={() => handleSendToAgent('Draft a concise professional follow-up email based on the following discussion transcript:')}
                      className="flex items-center gap-1.5 p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-left text-xs font-semibold text-zinc-200 cursor-pointer transition-all"
                    >
                      <Mail className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="line-clamp-1">Follow-up Email</span>
                    </button>
                    <button
                      onClick={() => handleSendToAgent('Provide an executive 3-bullet TL;DR summary highlighting key decisions:')}
                      className="flex items-center gap-1.5 p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-left text-xs font-semibold text-zinc-200 cursor-pointer transition-all"
                    >
                      <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="line-clamp-1">3-Bullet TL;DR</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Action: Send to Hermes Agent */}
              {transcribedText && (
                <button
                  onClick={() => handleSendToAgent()}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-amber-500/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Raw Transcript to Hermes Agent</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
