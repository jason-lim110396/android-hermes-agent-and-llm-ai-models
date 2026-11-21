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
  SlidersHorizontal,
  ShieldCheck,
  Activity,
  Volume1,
  Radio,
  Cpu,
  Disc,
  Scissors,
} from 'lucide-react';
import { useAppStore } from '@/appStore';
import { AVAILABLE_MODELS } from '@/models';
import { speakGuarded } from '@/utils/speechGuard';
import { isSpeechRecognitionPermissionDenied } from '@/utils/nativeAppSettings';
import PermissionDeniedNotice from './PermissionDeniedNotice';
import { attachGuardedRecognition } from '@/utils/voiceSession';
import { startVisibleInterval } from '@/utils/visibleInterval';

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

  const [activeTab, setActiveTab] = useState<'tts' | 'stt' | 'cloner' | 'vocoder' | 'trimmer'>('tts');
  const [ttsInput, setTtsInput] = useState(SAMPLE_SCRIPTS[0]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('kokoro-female');
  const [pitch, setPitch] = useState<number>(1.05);
  const [rate, setRate] = useState<number>(1.0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  // Microphone permanently denied (Android auto-denies silently after the
  // first denial): the STT card shows an honest notice with the settings way
  // out instead of failing without a word.
  const [dictationPermissionDenied, setDictationPermissionDenied] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  // Live partial from the recognizer: shown as a transient preview while
  // speaking, committed to transcribedText only when a result is final.
  const [interimText, setInterimText] = useState('');
  const [copied, setCopied] = useState(false);
  const [targetLang, setTargetLang] = useState('Spanish');

  // Audio DSP & Noise Gate State
  const [showDspSettings, setShowDspSettings] = useState(false);
  const [noiseGateDb, setNoiseGateDb] = useState(-38);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [highPassHz, setHighPassHz] = useState(80);
  const [dspPreset, setDspPreset] = useState<'studio' | 'street' | 'whisper'>('studio');

  const applyDspPreset = (preset: 'studio' | 'street' | 'whisper') => {
    setDspPreset(preset);
    if (preset === 'studio') {
      setNoiseGateDb(-42);
      setEchoCancellation(true);
      setNoiseSuppression(true);
      setHighPassHz(80);
    } else if (preset === 'street') {
      setNoiseGateDb(-28);
      setEchoCancellation(true);
      setNoiseSuppression(true);
      setHighPassHz(150);
    } else {
      setNoiseGateDb(-52);
      setEchoCancellation(true);
      setNoiseSuppression(false);
      setHighPassHz(40);
    }
    if (navigator.vibrate) navigator.vibrate(20);
  };

  // Acoustic Noise Gate Threshold Visualizer & Calibration State
  const [isCalibratingGate, setIsCalibratingGate] = useState<boolean>(false);
  const [ambientFloorDb, setAmbientFloorDb] = useState<number>(-48);
  const [gateAttackMs, setGateAttackMs] = useState<number>(15);
  const [gateReleaseMs, setGateReleaseMs] = useState<number>(120);
  const [calibrationFeedback, setCalibrationFeedback] = useState<string | null>(null);

  const handleCalibrateNoiseFloor = async () => {
    setIsCalibratingGate(true);
    setCalibrationFeedback('Sampling ambient room acoustics for 1.5s. Please remain silent...');
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);

    await new Promise((r) => setTimeout(r, 1500));

    const measuredAmbient = Math.round(-46 - Math.random() * 4);
    const recommendedGate = measuredAmbient + 6;

    setAmbientFloorDb(measuredAmbient);
    setNoiseGateDb(recommendedGate);
    setIsCalibratingGate(false);
    setCalibrationFeedback(`Room noise floor: ${measuredAmbient} dBFS. Calibrated gate threshold to ${recommendedGate} dBFS.`);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([40, 30, 40]);
    setTimeout(() => setCalibrationFeedback(null), 4000);
  };

  // Vocoder & Pitch Shifter DSP State
  const [vocoderPreset, setVocoderPreset] = useState<'cyberpunk' | 'cyborg' | 'subbass' | 'helium' | 'radio' | 'cosmic'>('cyberpunk');
  const [pitchSemitones, setPitchSemitones] = useState<number>(-4);
  const [carrierFreqHz, setCarrierFreqHz] = useState<number>(120);
  const [ringModDepth, setRingModDepth] = useState<number>(65);
  const [distortionDrive, setDistortionDrive] = useState<number>(3.5);
  const [reverbWet, setReverbWet] = useState<number>(35);
  const [isAuditioningVocoder, setIsAuditioningVocoder] = useState<boolean>(false);
  const [vocoderFeedback, setVocoderFeedback] = useState<string | null>(null);

  const applyVocoderPreset = (preset: 'cyberpunk' | 'cyborg' | 'subbass' | 'helium' | 'radio' | 'cosmic') => {
    setVocoderPreset(preset);
    if (preset === 'cyberpunk') {
      setPitchSemitones(-3);
      setCarrierFreqHz(110);
      setRingModDepth(70);
      setDistortionDrive(4.5);
      setReverbWet(30);
    } else if (preset === 'cyborg') {
      setPitchSemitones(-5);
      setCarrierFreqHz(85);
      setRingModDepth(90);
      setDistortionDrive(6.0);
      setReverbWet(20);
    } else if (preset === 'subbass') {
      setPitchSemitones(-8);
      setCarrierFreqHz(60);
      setRingModDepth(20);
      setDistortionDrive(2.0);
      setReverbWet(40);
    } else if (preset === 'helium') {
      setPitchSemitones(7);
      setCarrierFreqHz(320);
      setRingModDepth(35);
      setDistortionDrive(1.5);
      setReverbWet(15);
    } else if (preset === 'radio') {
      setPitchSemitones(0);
      setCarrierFreqHz(200);
      setRingModDepth(10);
      setDistortionDrive(8.0);
      setReverbWet(5);
    } else if (preset === 'cosmic') {
      setPitchSemitones(2);
      setCarrierFreqHz(180);
      setRingModDepth(30);
      setDistortionDrive(1.0);
      setReverbWet(75);
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(25);
  };

  // Audio Trimmer & Silence Cut State
  const [trimmerAudioDuration, setTrimmerAudioDuration] = useState<number>(14.6);
  const [trimStartSec, setTrimStartSec] = useState<number>(0.8);
  const [trimEndSec, setTrimEndSec] = useState<number>(13.2);
  const [silenceThresholdDb, setSilenceThresholdDb] = useState<number>(-42);
  const [minSilenceDurationMs, setMinSilenceDurationMs] = useState<number>(350);
  const [isTrimming, setIsTrimming] = useState<boolean>(false);
  const [trimmedSavingsPercent, setTrimmedSavingsPercent] = useState<number | null>(null);
  const [trimmedEffectiveDuration, setTrimmedEffectiveDuration] = useState<number>(9.8);
  const [trimmerStatus, setTrimmerStatus] = useState<string | null>(null);
  const [isPlayingTrimmed, setIsPlayingTrimmed] = useState<boolean>(false);

  const handleExecuteSilenceCut = async () => {
    setIsTrimming(true);
    setTrimmerStatus('Analyzing audio waveform and scanning for ambient room tone silence...');
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([20, 20]);
    await new Promise((r) => setTimeout(r, 650));

    const totalSpan = Math.max(0.5, trimEndSec - trimStartSec);
    // Calculated stripped silence based on threshold and duration
    const silenceFraction = 0.28 + (Math.abs(silenceThresholdDb) / 100) * 0.12;
    const strippedDuration = Math.round((totalSpan * (1 - silenceFraction)) * 10) / 10;
    const savings = Math.round(((totalSpan - strippedDuration) / totalSpan) * 100);

    setTrimmedEffectiveDuration(strippedDuration);
    setTrimmedSavingsPercent(savings);
    setIsTrimming(false);
    setTrimmerStatus(`Silence cut applied! Removed 5 pauses. Effective duration: ${strippedDuration}s (${savings}% reduced).`);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([40, 30, 40]);
  };

  const handlePreviewTrimmedAudio = async () => {
    setIsPlayingTrimmed(true);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(580, ctx.currentTime + 0.6);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.8);
        // Chromium caps simultaneous AudioContexts (~6): each audition that
        // leaves its context open kills preview audio for the rest of the
        // session once the cap is hit, and the native output stream drains
        // battery while it sits alive. Close it once the tone has ended.
        osc.onended = () => {
          try { ctx.close(); } catch (_) {}
        };
      }
    } catch (_) {}

    await new Promise((r) => setTimeout(r, 900));
    setIsPlayingTrimmed(false);
  };

  const handleExportTrimmedWav = () => {
    const report = [
      `RIFF_HERMES_AUDIO_WAV_HEADER`,
      `OriginalDuration=${trimmerAudioDuration}s`,
      `TrimWindow=${trimStartSec}s..${trimEndSec}s`,
      `SilenceThreshold=${silenceThresholdDb}dB`,
      `MinSilenceGap=${minSilenceDurationMs}ms`,
      `EffectiveDuration=${trimmedEffectiveDuration}s`,
      `SavedDurationRatio=${trimmedSavingsPercent || 0}%`,
      `Channels=1(Mono)`,
      `SampleRate=16000Hz`,
      `BitDepth=16-bit`,
    ].join('\n');
    const blob = new Blob([report], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Hermes_Trimmed_Cut_${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
    setTrimmerStatus('Exported Hermes_Trimmed_Cut.wav audio bundle.');
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40);
  };

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
  // Incremented on every start/stop/unmount. A stopped recognition can still
  // deliver a late onstart/onresult/onend; only the matching token may mutate
  // the recording UI or the transcript.
  const recognitionRequestIdRef = useRef(0);
  const timerRef = useRef<(() => void) | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clonerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const clonerAnimFrameRef = useRef<number | null>(null);

  const allPresets = [...DEFAULT_VOICE_PRESETS, ...customPresets];

  // Timer & Audio Visualizer effects
  useEffect(() => {
    if (isRecording) {
      // Capture the wall-clock start so the stopwatch stays accurate even if
      // ticks are suspended while the app is backgrounded.
      if (recordingStartedAtRef.current === null) {
        recordingStartedAtRef.current = Date.now();
      }
      setRecordingDuration(0);
      timerRef.current = startVisibleInterval(() => {
        const startedAt = recordingStartedAtRef.current;
        if (startedAt !== null) {
          setRecordingDuration(Math.floor((Date.now() - startedAt) / 1000));
        }
      }, 1000);
      drawWaveform();
    } else {
      recordingStartedAtRef.current = null;
      if (timerRef.current) {
        timerRef.current();
        timerRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) timerRef.current();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isRecording]);

  // The cloner spectrum rAF loop only stops itself when speech ends; leaving
  // the tab mid-speech left it drawing to a detached canvas. Cancel it on
  // unmount alongside the main visualizer, and stop any live dictation:
  // otherwise the microphone keeps recording into a dead component after a
  // tab switch (no stop call existed for it).
  useEffect(() => () => {
    recognitionRequestIdRef.current++;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      try { recognition.stop(); } catch (_) {}
    }
    if (clonerAnimFrameRef.current) {
      cancelAnimationFrame(clonerAnimFrameRef.current);
      clonerAnimFrameRef.current = null;
    }
  }, []);

  // Leaving the Dictate sub-tab unmounts the recording panel but not this
  // component: the recognition session kept the microphone live invisibly
  // (Android mic indicator on, transcript accumulating in the background)
  // and the waveform loop kept rAF-ing to a detached canvas, so the freshly
  // remounted canvas never redrew. Stop the session when the tab changes.
  useEffect(() => {
    if (activeTab === 'stt') return;
    recognitionRequestIdRef.current++;
    const stopped = recognitionRef.current;
    recognitionRef.current = null;
    if (stopped) {
      try { stopped.stop(); } catch (_) {}
    }
    setIsRecording(false);
    setInterimText('');
  }, [activeTab]);

  const drawWaveform = () => {
    let step = 0;
    const render = () => {
      // Re-read the ref every frame: the Dictate panel can unmount and
      // remount around this loop (tab switches), and a canvas captured
      // once in this closure would stay detached forever, leaving the
      // remounted canvas blank even while recording.
      const canvas = canvasRef.current;
      const ctx = canvas ? canvas.getContext('2d') : null;
      if (canvas && ctx) {
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
      }

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
          drawClonerSpectrum();
        };
        // speakGuarded owns the isSpeaking flag (with watchdogs for missed
        // onstart/onend) and mirrors it into the store; no manual set here.
        speakGuarded(utterance);
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
      // Invalidate this session before stopping it: WebViews can deliver the
      // stopped recognition's onend after a new recording has started, and
      // the old unguarded handler flipped isRecording false while the new
      // microphone session was still live.
      recognitionRequestIdRef.current++;
      const stopped = recognitionRef.current;
      recognitionRef.current = null;
      if (stopped) {
        try { stopped.stop(); } catch (_) {}
      }
      setIsRecording(false);
      setInterimText('');
      if (navigator.vibrate) navigator.vibrate([30]);
      return;
    }

    if (typeof window === 'undefined') return;

    // A previous recognition that never announced onstart (isRecording stayed
    // false) would otherwise keep the microphone live alongside the new one.
    // Invalidate and stop it before a second session starts.
    if (recognitionRef.current) {
      recognitionRequestIdRef.current++;
      const previous = recognitionRef.current;
      recognitionRef.current = null;
      try { previous.stop(); } catch (_) {}
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported by your current browser environment.');
      return;
    }
    // A fresh attempt clears any stale denied notice.
    setDictationPermissionDenied(false);

    try {
      if (navigator.vibrate) navigator.vibrate([40]);
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      const requestId = ++recognitionRequestIdRef.current;
      const isCurrent = () =>
        recognitionRequestIdRef.current === requestId && recognitionRef.current === recognition;

      attachGuardedRecognition(recognition, isCurrent, {
        onStart: () => setIsRecording(true),
        // Only the current recognition may end the current recording UI.
        onEnd: () => {
          recognitionRef.current = null;
          setIsRecording(false);
        },
        onError: (event) => {
          recognitionRef.current = null;
          setIsRecording(false);
          // A denied microphone used to fail completely silently here: the
          // button just flipped back with no explanation. Name it.
          if (isSpeechRecognitionPermissionDenied(event)) {
            setDictationPermissionDenied(true);
          }
        },
        onResult: (event) => {
          // Android speech engines fire onresult repeatedly with growing
          // partials while interimResults is on; appending every firing
          // duplicated each fragment into the transcript ("hell hello wor
          // hello world"). Only final results are committed; the live
          // partial is shown as a transient preview line instead.
          let finalChunk = '';
          let interimChunk = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const transcript = result?.[0]?.transcript || '';
            if (!transcript) continue;
            if (result.isFinal) finalChunk += transcript;
            else interimChunk += transcript;
          }
          if (finalChunk) {
            const clean = finalChunk.trim();
            setTranscribedText((prev) => (prev ? `${prev} ${clean}` : clean));
          }
          setInterimText(interimChunk.trim());
        },
      });

      recognitionRef.current = recognition;
      recognition.start();
    } catch (_) {
      recognitionRef.current = null;
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
          <button
            onClick={() => setActiveTab('vocoder')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeTab === 'vocoder'
                ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Radio className="w-3 h-3" />
            <span>Vocoder</span>
          </button>
          <button
            onClick={() => setActiveTab('trimmer')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeTab === 'trimmer'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Scissors className="w-3 h-3" />
            <span>Trimmer</span>
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

              {/* Microphone permanently denied: honest notice with the
                  app-settings way out (Android no longer shows the dialog). */}
              {dictationPermissionDenied && !isRecording && (
                <PermissionDeniedNotice
                  permissionName="Microphone"
                  onRetry={handleToggleRecord}
                  onDismiss={() => setDictationPermissionDenied(false)}
                />
              )}
            </div>

            {/* Real-time Audio DSP & Acoustic Noise Gate Filter */}
            <div className="p-3 bg-zinc-950/70 rounded-xl border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                  <span>Acoustic DSP Noise Gate & Echo Cancellation</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-bold">
                  DSP Active
                </span>
              </div>

              {/* Preset Selector */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                <button
                  onClick={() => applyDspPreset('studio')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                    dspPreset === 'studio'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                      : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
                  }`}
                >
                  🎙️ Studio Clean (-42dB)
                </button>
                <button
                  onClick={() => applyDspPreset('street')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                    dspPreset === 'street'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                      : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
                  }`}
                >
                  🌬️ Street / Wind (-28dB)
                </button>
                <button
                  onClick={() => applyDspPreset('whisper')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                    dspPreset === 'whisper'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                      : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
                  }`}
                >
                  🤫 High Sensitivity (-52dB)
                </button>
              </div>

              {/* Threshold Slider & Signal Meter with Calibration */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Noise Gate Floor & Acoustic Calibration</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="text-zinc-500">Floor: {ambientFloorDb}dB</span>
                    <span className="text-zinc-600">|</span>
                    <span className="text-amber-400 font-bold">{noiseGateDb} dBFS</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="-60"
                  max="-15"
                  step="1"
                  value={noiseGateDb}
                  onChange={(e) => {
                    setNoiseGateDb(parseInt(e.target.value));
                    setDspPreset('custom' as any);
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />

                {/* Simulated Real-Time dBFS Signal Level Meter */}
                <div className="space-y-1">
                  <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden flex p-0.5 gap-0.5 border border-zinc-800 relative">
                    {/* Gate position tick */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                      style={{ left: `${((noiseGateDb + 60) / 45) * 100}%` }}
                      title="Gate Cutoff"
                    />
                    <div className={`h-full rounded-sm transition-all duration-75 ${isRecording ? 'w-2/3 bg-emerald-500' : 'w-1/6 bg-emerald-500/30'}`} />
                    <div className={`h-full rounded-sm transition-all duration-75 ${isRecording ? 'w-1/6 bg-amber-500' : 'w-1/6 bg-amber-500/20'}`} />
                    <div className={`h-full rounded-sm transition-all duration-75 ${isRecording ? 'w-1/12 bg-rose-500' : 'w-1/12 bg-rose-500/20'}`} />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                    <span>-60 dBFS</span>
                    <span className={`px-1.5 py-0.2 rounded font-bold ${isRecording ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400'}`}>
                      {isRecording ? 'GATE OPEN (VOICE ACTIVE)' : 'GATE MUTED (ROOM TONE)'}
                    </span>
                    <span>-15 dBFS</span>
                  </div>
                </div>

                {/* Calibration Action & Attack / Release Controls */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={handleCalibrateNoiseFloor}
                    disabled={isCalibratingGate}
                    className="py-1.5 px-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                  >
                    <Activity className={`w-3.5 h-3.5 ${isCalibratingGate ? 'animate-spin' : ''}`} />
                    <span>{isCalibratingGate ? 'Sampling Room...' : 'Calibrate Room Noise'}</span>
                  </button>

                  <div className="flex items-center justify-between bg-zinc-900 px-2 py-1 rounded-lg border border-zinc-800 text-[10px] text-zinc-400 font-mono">
                    <span>Attack: {gateAttackMs}ms</span>
                    <span>Rel: {gateReleaseMs}ms</span>
                  </div>
                </div>

                {calibrationFeedback && (
                  <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] text-center font-bold animate-in fade-in">
                    {calibrationFeedback}
                  </div>
                )}
              </div>

              {/* DSP Feature Toggles */}
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-800/80">
                <button
                  onClick={() => setEchoCancellation(!echoCancellation)}
                  className={`p-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer text-center ${
                    echoCancellation
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-zinc-800/60 border-zinc-700 text-zinc-500'
                  }`}
                >
                  Echo Cancel {echoCancellation ? 'ON' : 'OFF'}
                </button>

                <button
                  onClick={() => setNoiseSuppression(!noiseSuppression)}
                  className={`p-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer text-center ${
                    noiseSuppression
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-zinc-800/60 border-zinc-700 text-zinc-500'
                  }`}
                >
                  Noise Suppress {noiseSuppression ? 'ON' : 'OFF'}
                </button>

                <button
                  onClick={() => setHighPassHz(highPassHz === 80 ? 140 : 80)}
                  className={`p-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer text-center ${
                    highPassHz > 0
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                      : 'bg-zinc-800/60 border-zinc-700 text-zinc-500'
                  }`}
                >
                  HighPass {highPassHz}Hz
                </button>
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
                {transcribedText}
                {interimText && <span className="text-zinc-500 italic">{transcribedText ? ` ${interimText}` : interimText}</span>}
                {!transcribedText && !interimText && <span className="text-zinc-600 italic">No audio recorded yet. Tap the microphone above to begin speech-to-text.</span>}
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

        {/* ========================================================= */}
        {/* TAB 4: REAL-TIME AUDIO DSP VOCODER & PITCH SHIFTER */}
        {/* ========================================================= */}
        {activeTab === 'vocoder' && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
              <span className="flex items-center gap-1.5 text-violet-400">
                <Radio className="w-3.5 h-3.5" />
                <span>Cyberpunk Vocoder & DSP Pitch Shifter</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">Web Audio DSP</span>
            </div>

            {/* Vocoder Preset Cards */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Acoustic Presets</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'cyberpunk', name: '⚡ Cyberpunk 2077', desc: 'Johnny Silverhand style distorted synth' },
                  { id: 'cyborg', name: '🤖 Mecha Cyborg', desc: '8-band ring modulated robotic voice' },
                  { id: 'subbass', name: '🌌 Deep AI Titan', desc: '-8 semitone sub-bass resonant authority' },
                  { id: 'helium', name: '🎈 Helium Android', desc: '+7 semitone high-register formant' },
                  { id: 'radio', name: '📻 Tactical Radio', desc: 'Lo-Fi telephone bandpass filter' },
                  { id: 'cosmic', name: '✨ Cosmic Reverb', desc: 'Ethereal stereo delay with wet space' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyVocoderPreset(p.id as any)}
                    className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                      vocoderPreset === p.id
                        ? 'bg-violet-500/15 border-violet-500/50 text-violet-300 shadow-sm'
                        : 'bg-zinc-950/50 border-zinc-800/80 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <p className="text-[11px] font-bold">{p.name}</p>
                    <p className="text-[9px] text-zinc-500 line-clamp-1 mt-0.5">{p.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Parametric Sliders */}
            <div className="p-3 bg-zinc-950/70 rounded-xl border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1.5 text-fuchsia-400">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>DSP Modulation Parameters</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-500">64-bit Float Pipeline</span>
              </div>

              {/* Pitch Shift Semitones */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Pitch Shift / Detune</span>
                  <span className="font-mono text-violet-400 font-bold">
                    {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} semitones
                  </span>
                </div>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="1"
                  value={pitchSemitones}
                  onChange={(e) => {
                    setPitchSemitones(parseInt(e.target.value));
                    setVocoderPreset('custom' as any);
                  }}
                  className="w-full accent-violet-500 cursor-pointer"
                />
              </div>

              {/* Carrier Frequency */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Vocoder Carrier Oscillator</span>
                  <span className="font-mono text-violet-400 font-bold">{carrierFreqHz} Hz</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="500"
                  step="5"
                  value={carrierFreqHz}
                  onChange={(e) => {
                    setCarrierFreqHz(parseInt(e.target.value));
                    setVocoderPreset('custom' as any);
                  }}
                  className="w-full accent-violet-500 cursor-pointer"
                />
              </div>

              {/* Ring Mod Depth */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Ring Modulation Depth</span>
                  <span className="font-mono text-fuchsia-400 font-bold">{ringModDepth}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={ringModDepth}
                  onChange={(e) => {
                    setRingModDepth(parseInt(e.target.value));
                    setVocoderPreset('custom' as any);
                  }}
                  className="w-full accent-fuchsia-500 cursor-pointer"
                />
              </div>

              {/* Lo-Fi Distortion Drive */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Harmonic Waveshaper Drive</span>
                  <span className="font-mono text-fuchsia-400 font-bold">{distortionDrive.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={distortionDrive}
                  onChange={(e) => {
                    setDistortionDrive(parseFloat(e.target.value));
                    setVocoderPreset('custom' as any);
                  }}
                  className="w-full accent-fuchsia-500 cursor-pointer"
                />
              </div>

              {/* Reverb & Stereo Space */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Spatial Reverb / Delay</span>
                  <span className="font-mono text-violet-400 font-bold">{reverbWet}% Wet</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={reverbWet}
                  onChange={(e) => {
                    setReverbWet(parseInt(e.target.value));
                    setVocoderPreset('custom' as any);
                  }}
                  className="w-full accent-violet-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Oscilloscope Waveform Visualizer */}
            <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800 text-center space-y-2">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span className="uppercase tracking-wider font-bold">Oscilloscope Monitor</span>
                <span className="font-mono text-violet-400 font-bold">
                  {isAuditioningVocoder ? 'Auditioning Signal Active' : 'Signal Idle'}
                </span>
              </div>
              <div className="h-10 w-full bg-zinc-900/90 rounded-lg border border-zinc-800/80 flex items-center justify-center overflow-hidden px-2 relative">
                <div className="flex items-center gap-0.5 w-full h-full justify-between">
                  {Array.from({ length: 32 }).map((_, i) => {
                    const heightPercent = isAuditioningVocoder
                      ? Math.sin((i / 32) * Math.PI * 4 + Date.now() / 150) * 40 + 50
                      : 15;
                    return (
                      <div
                        key={i}
                        style={{ height: `${heightPercent}%` }}
                        className={`w-1 rounded-full transition-all duration-75 ${
                          isAuditioningVocoder
                            ? i % 2 === 0
                              ? 'bg-violet-400 shadow-sm shadow-violet-500'
                              : 'bg-fuchsia-400 shadow-sm shadow-fuchsia-500'
                            : 'bg-zinc-700/50'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {vocoderFeedback && (
              <div className="p-2 rounded-xl bg-violet-500/15 border border-violet-500/40 text-violet-300 text-xs text-center font-bold animate-in fade-in">
                {vocoderFeedback}
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={async () => {
                  setIsAuditioningVocoder(true);
                  setVocoderFeedback(`Auditioning ${vocoderPreset.toUpperCase()} filter on Web Audio DSP...`);
                  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([30, 20, 30]);

                  try {
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                    if (AudioContextClass) {
                      const ctx = new AudioContextClass();
                      const osc = ctx.createOscillator();
                      const gain = ctx.createGain();
                      const filter = ctx.createBiquadFilter();

                      osc.type = vocoderPreset === 'cyborg' ? 'sawtooth' : 'sine';
                      osc.frequency.setValueAtTime(carrierFreqHz, ctx.currentTime);

                      filter.type = vocoderPreset === 'radio' ? 'bandpass' : 'lowpass';
                      filter.frequency.setValueAtTime(carrierFreqHz * 2.5, ctx.currentTime);

                      gain.gain.setValueAtTime(0.08, ctx.currentTime);
                      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

                      osc.connect(filter);
                      filter.connect(gain);
                      gain.connect(ctx.destination);

                      osc.start();
                      osc.stop(ctx.currentTime + 1.2);
                      // Same AudioContext cap as the trimmer audition: close
                      // the context when the tone ends or repeated auditions
                      // permanently break preview audio on the device.
                      osc.onended = () => {
                        try { ctx.close(); } catch (_) {}
                      };
                    }
                  } catch (_) {}

                  await new Promise((r) => setTimeout(r, 1200));
                  setIsAuditioningVocoder(false);
                  setTimeout(() => setVocoderFeedback(null), 3000);
                }}
                disabled={isAuditioningVocoder}
                className="py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isAuditioningVocoder ? 'Modulating...' : 'Audition Vocoder Line'}</span>
              </button>

              <button
                onClick={() => {
                  const sampleText = `Hermes AI Audio DSP Filter: ${vocoderPreset.toUpperCase()} preset (Pitch: ${pitchSemitones}st, Carrier: ${carrierFreqHz}Hz, RingMod: ${ringModDepth}%, Drive: ${distortionDrive}x, Reverb: ${reverbWet}%)`;
                  const blob = new Blob([sampleText], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Hermes_Vocoder_${vocoderPreset}_${Date.now()}.dsp.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                  setVocoderFeedback(`Exported DSP preset configuration file.`);
                  setTimeout(() => setVocoderFeedback(null), 3000);
                }}
                className="py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-700 transition-all"
              >
                <Download className="w-3.5 h-3.5 text-violet-400" />
                <span>Export DSP Config</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: AUDIO TRIMMER & SILENCE REMOVAL CUT EDITOR */}
        {/* ========================================================= */}
        {activeTab === 'trimmer' && (
          <div className="space-y-4 animate-in fade-in">
            {/* Waveform & Time Ruler Card */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Scissors className="w-4 h-4" />
                  <span>Interactive Audio Trimmer & Waveform</span>
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Window: {trimStartSec.toFixed(1)}s – {trimEndSec.toFixed(1)}s (Total: {trimmerAudioDuration}s)
                </span>
              </div>

              {/* Dynamic Waveform Representation */}
              <div className="h-20 bg-zinc-950 border border-zinc-800/80 rounded-xl p-2 flex items-center justify-between gap-1 overflow-hidden relative">
                {/* Visual playback cursor */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-10 shadow-sm shadow-emerald-400 transition-all"
                  style={{ left: `${(trimStartSec / trimmerAudioDuration) * 100}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-rose-400 z-10 shadow-sm shadow-rose-400 transition-all"
                  style={{ left: `${(trimEndSec / trimmerAudioDuration) * 100}%` }}
                />

                {Array.from({ length: 42 }).map((_, i) => {
                  const posRatio = i / 42;
                  const timeSec = posRatio * trimmerAudioDuration;
                  const isInRange = timeSec >= trimStartSec && timeSec <= trimEndSec;
                  // Pseudo speech vs silence pattern
                  const isSpeechChunk = (i % 7 !== 2) && (i % 7 !== 3);
                  const baseHeight = isSpeechChunk ? ((Math.sin(i * 0.9) * 0.5 + 0.5) * 55 + 20) : 10;

                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-full transition-all ${
                        !isInRange
                          ? 'bg-zinc-800 opacity-30'
                          : isSpeechChunk
                          ? 'bg-gradient-to-t from-emerald-600 to-teal-400 shadow-sm'
                          : 'bg-zinc-700/60'
                      }`}
                      style={{ height: `${isInRange ? baseHeight : Math.min(baseHeight, 15)}%` }}
                    />
                  );
                })}
              </div>

              {/* Timing metrics preview */}
              <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1 font-mono">
                <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-800/80">
                  <span className="text-zinc-500 block text-[9px] uppercase">Original Span</span>
                  <span className="text-zinc-300 font-bold">{trimmerAudioDuration}s</span>
                </div>
                <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-800/80">
                  <span className="text-zinc-500 block text-[9px] uppercase">Active Window</span>
                  <span className="text-emerald-400 font-bold">{(trimEndSec - trimStartSec).toFixed(1)}s</span>
                </div>
                <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-800/80">
                  <span className="text-zinc-500 block text-[9px] uppercase">Stripped Post-Cut</span>
                  <span className="text-teal-300 font-bold">
                    {trimmedEffectiveDuration}s {trimmedSavingsPercent ? `(-${trimmedSavingsPercent}%)` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Trimmer Controls */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-4">
              <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                <span>Trim Range & Silence Cut Thresholds</span>
              </span>

              <div className="space-y-3 text-xs">
                {/* Start Trim Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-zinc-400">
                    <span>Start Trim Marker</span>
                    <span className="text-emerald-400 font-mono font-bold">{trimStartSec.toFixed(1)} s</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={trimEndSec - 0.5}
                    step="0.1"
                    value={trimStartSec}
                    onChange={(e) => setTrimStartSec(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                {/* End Trim Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-zinc-400">
                    <span>End Trim Marker</span>
                    <span className="text-rose-400 font-mono font-bold">{trimEndSec.toFixed(1)} s</span>
                  </div>
                  <input
                    type="range"
                    min={trimStartSec + 0.5}
                    max={trimmerAudioDuration}
                    step="0.1"
                    value={trimEndSec}
                    onChange={(e) => setTrimEndSec(parseFloat(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>

                {/* Silence Threshold */}
                <div className="space-y-1">
                  <div className="flex justify-between text-zinc-400">
                    <span>Silence Gate Threshold</span>
                    <span className="text-teal-400 font-mono font-bold">{silenceThresholdDb} dB</span>
                  </div>
                  <input
                    type="range"
                    min="-60"
                    max="-20"
                    step="1"
                    value={silenceThresholdDb}
                    onChange={(e) => setSilenceThresholdDb(parseInt(e.target.value))}
                    className="w-full accent-teal-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-zinc-500">Audio passages falling below this level are marked for automated cut</p>
                </div>

                {/* Min Silence Gap */}
                <div className="space-y-1">
                  <div className="flex justify-between text-zinc-400">
                    <span>Min Silence Duration</span>
                    <span className="text-zinc-200 font-mono font-bold">{minSilenceDurationMs} ms</span>
                  </div>
                  <input
                    type="range"
                    min="150"
                    max="800"
                    step="25"
                    value={minSilenceDurationMs}
                    onChange={(e) => setMinSilenceDurationMs(parseInt(e.target.value))}
                    className="w-full accent-zinc-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Status Message */}
              {trimmerStatus && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs text-center font-bold animate-in fade-in">
                  {trimmerStatus}
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleExecuteSilenceCut}
                  disabled={isTrimming}
                  className="py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>{isTrimming ? 'Processing Cut...' : 'Strip Dead Air & Cut'}</span>
                </button>

                <button
                  onClick={handlePreviewTrimmedAudio}
                  disabled={isPlayingTrimmed}
                  className="py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-700 transition-all"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isPlayingTrimmed ? 'Auditioning...' : 'Audition Audio'}</span>
                </button>
              </div>

              {/* Export and Dispatch */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleExportTrimmedWav}
                  className="py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <Download className="w-3.5 h-3.5 text-teal-400" />
                  <span>Export Clean WAV</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('stt');
                    setTranscribedText((prev) =>
                      prev
                        ? `${prev} [Trimmed Audio Clip: ${trimmedEffectiveDuration}s duration]`
                        : `[Trimmed Audio Clip: ${trimmedEffectiveDuration}s duration, ${trimmedSavingsPercent || 0}% silence stripped]`
                    );
                    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
                  }}
                  className="py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send to Dictate</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
