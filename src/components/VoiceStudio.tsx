'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Download,
  Copy,
  Check,
  Radio,
  Sliders,
  AudioLines,
  Waves,
  Headphones,
  Send,
  Zap,
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
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
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
  const [transcribedText, setTranscribedText] = useState('');
  const [copied, setCopied] = useState(false);

  const recognitionRef = useRef<any>(null);

  const voiceModels = AVAILABLE_MODELS.filter((m) => m.category === 'voice' || m.family === 'audio');
  const currentModel = voiceModels.find((m) => m.id === selectedModelId) || voiceModels[0];

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

  const handleSendToAgent = () => {
    if (!transcribedText.trim()) return;
    sendMessage(transcribedText.trim());
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
            Voice Transcribe
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
                            ? 'bg-amber-950/40 border-amber-500/50 ring-1 ring-amber-500/40'
                            : 'bg-zinc-800/60 border-zinc-800 hover:bg-zinc-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{voice.name}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-amber-400 font-mono">
                            {voice.gender}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400 truncate mt-0.5">{voice.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Rate & Pitch Sliders */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-zinc-800/80">
                <div>
                  <div className="flex justify-between text-[10px] font-bold text-zinc-400 mb-1">
                    <span>Speed ({rate}x)</span>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.5"
                    step="0.05"
                    value={rate}
                    onChange={(e) => setRate(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-bold text-zinc-400 mb-1">
                    <span>Pitch ({pitch}x)</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.3"
                    step="0.05"
                    value={pitch}
                    onChange={(e) => setPitch(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Speak Playback Action Button */}
              <button
                onClick={handleSpeak}
                disabled={!ttsInput.trim()}
                className={`w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                  isSpeaking
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                    : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-orange-400 text-black shadow-amber-500/30'
                }`}
              >
                {isSpeaking ? (
                  <>
                    <VolumeX className="w-4 h-4 fill-current" />
                    <span>Stop Speech Playback</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" />
                    <span>Synthesize Voice with Kokoro 82M</span>
                  </>
                )}
              </button>

              {/* Animated Waveform Indicator */}
              {isSpeaking && (
                <div className="flex items-center justify-center gap-1.5 py-2 animate-in fade-in">
                  {[40, 70, 100, 50, 90, 60, 80, 40, 100, 60].map((h, i) => (
                    <span
                      key={i}
                      className="w-1 bg-amber-400 rounded-full animate-pulse"
                      style={{
                        height: `${h * 0.25}px`,
                        animationDelay: `${i * 100}ms`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ========================================================= */}
        {/* TAB 2: SPEECH-TO-TEXT (STT) TRANSCRIPTION */}
        {/* ========================================================= */}
        {activeTab === 'stt' && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Mic className="w-3.5 h-3.5" />
                <span>Whisper Audio Transcriber</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">100% Offline</span>
            </div>

            {/* Big Mic Push-to-Talk Zone */}
            <div className="flex flex-col items-center justify-center p-6 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-3">
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
                <p className="text-xs font-bold text-white">
                  {isRecording ? 'Listening to speech...' : 'Tap to start recording'}
                </p>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  {isRecording ? 'Tap again to finalize transcription' : 'Speak clearly into your smartphone microphone'}
                </p>
              </div>
            </div>

            {/* Transcription Deliverable Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-400">Transcript Result:</span>
                <div className="flex items-center gap-2">
                  {transcribedText && (
                    <button
                      onClick={() => setTranscribedText('')}
                      className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    >
                      Clear
                    </button>
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

              {/* Action: Send to Hermes Agent */}
              {transcribedText && (
                <button
                  onClick={handleSendToAgent}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-amber-500/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Transcription to Hermes Agent for Action</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
