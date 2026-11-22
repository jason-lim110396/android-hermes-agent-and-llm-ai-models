'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  Subtitles,
  RotateCcw,
  Radio,
  AudioLines,
  AlertCircle,
  X,
  Zap,
} from 'lucide-react';
import { useAppStore } from '@/appStore';
import { triggerHaptic } from '@/utils/haptics';
import { useBackButtonClose } from '@/utils/backButton';
import {
  attachGuardedRecognition,
  createSilenceDetector,
  type SilenceDetector,
  type RecognitionLike,
} from '@/utils/voiceSession';
import {
  speakGuarded,
  cancelSpeech,
  onSpeakingChange,
  hasSpeechSynthesis,
} from '@/utils/speechGuard';
import { isSpeechRecognitionPermissionDenied } from '@/utils/nativeAppSettings';

type CallState = 'connecting' | 'listening' | 'thinking' | 'speaking';

interface VoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function VoiceCallModal({ isOpen, onClose }: VoiceCallModalProps) {
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const isSpeaking = useAppStore((s) => s.isSpeaking);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const chatSessions = useAppStore((s) => s.chatSessions);
  const activeChatSessionId = useAppStore((s) => s.activeChatSessionId);

  const [callState, setCallState] = useState<CallState>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [userSpeechDraft, setUserSpeechDraft] = useState('');
  const [assistantText, setAssistantText] = useState('');
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const sessionTokenRef = useRef(0);
  const silenceDetectorRef = useRef<SilenceDetector | null>(null);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  // Android hardware back button handler
  useBackButtonClose(isOpen, () => {
    handleEndCall();
  });

  // Call duration counter
  useEffect(() => {
    if (!isOpen) {
      setCallDurationSec(0);
      return;
    }
    const timer = setInterval(() => {
      setCallDurationSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const formatDuration = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Subscribe to speech synthesis state changes
  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSpeakingChange((active) => {
      if (active) {
        setCallState('speaking');
      } else {
        // Assistant finished speaking: resume hands-free listening
        if (!isGenerating && !isMutedRef.current) {
          setCallState('listening');
          startRecognitionSafe();
        }
      }
    });
    return () => unsub();
  }, [isOpen, isGenerating]);

  // Clean text for speech synthesis (strip markdown, asterisks, code blocks)
  const cleanTextForTts = (raw: string): string => {
    return raw
      .replace(/```[\s\S]*?```/g, ' [code block omitted] ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_#~>\[\]]/g, '')
      .replace(/https?:\/\/\S+/g, 'link')
      .trim();
  };

  // Watch for assistant's generated response to speak it
  const prevGeneratingRef = useRef(isGenerating);
  useEffect(() => {
    if (!isOpen) return;

    if (prevGeneratingRef.current && !isGenerating) {
      // Generation just completed: read latest assistant message
      const activeSession = chatSessions[activeChatSessionId];
      if (activeSession && activeSession.messages && activeSession.messages.length > 0) {
        const lastMsg = activeSession.messages[activeSession.messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          const spoken = cleanTextForTts(lastMsg.content);
          setAssistantText(spoken);
          if (spoken.length > 0 && hasSpeechSynthesis()) {
            setCallState('speaking');
            const utterance = new SpeechSynthesisUtterance(spoken.slice(0, 500));
            speakGuarded(utterance);
          } else {
            setCallState('listening');
            startRecognitionSafe();
          }
        }
      }
    } else if (!prevGeneratingRef.current && isGenerating) {
      setCallState('thinking');
    }
    prevGeneratingRef.current = isGenerating;
  }, [isGenerating, isOpen, chatSessions, activeChatSessionId]);

  // Start or restart speech recognition safely
  const startRecognitionSafe = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (isMutedRef.current) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setPermissionError('Speech recognition is not supported in this WebView browser.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }

      sessionTokenRef.current += 1;
      const currentToken = sessionTokenRef.current;
      const isCurrent = () => sessionTokenRef.current === currentToken;

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      silenceDetectorRef.current = createSilenceDetector(1600, () => {
        if (!isCurrent()) return;
        try {
          recognition.stop();
        } catch (_) {}
      });

      attachGuardedRecognition(recognition as RecognitionLike, isCurrent, {
        onStart: () => {
          setPermissionError(null);
          setCallState('listening');
        },
        onResult: (event) => {
          silenceDetectorRef.current?.reset();
          let transcript = '';
          let isFinal = false;

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            if (res && res[0]) {
              transcript += res[0].transcript;
              if (res.isFinal) isFinal = true;
            }
          }

          if (transcript.trim()) {
            setUserSpeechDraft(transcript);
          }

          if (isFinal && transcript.trim().length > 0) {
            handleCommitUserSpeech(transcript.trim());
          }
        },
        onError: (err) => {
          if (err.error === 'not-allowed') {
            setPermissionError('Microphone permission denied. Please allow microphone access in Android Settings.');
          } else if (err.error !== 'no-speech' && err.error !== 'aborted') {
            // Transient error: re-arm if still listening
            if (isOpen && !isMutedRef.current && !isGenerating && !isSpeaking) {
              setTimeout(() => {
                if (isCurrent()) startRecognitionSafe();
              }, 400);
            }
          }
        },
        onEnd: () => {
          silenceDetectorRef.current?.clear();
          // If stopped without final and we still have text, commit it
          if (userSpeechDraft.trim().length > 0) {
            handleCommitUserSpeech(userSpeechDraft.trim());
          } else if (isOpen && !isMutedRef.current && !isGenerating && !isSpeaking) {
            // Auto-rearm
            setTimeout(() => {
              if (isCurrent()) startRecognitionSafe();
            }, 300);
          }
        },
      });

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      if (isSpeechRecognitionPermissionDenied(e)) {
        setPermissionError('Microphone permission is blocked in system settings.');
      }
    }
  }, [isOpen, isGenerating, isSpeaking, userSpeechDraft]);

  // Initial connect when modal opens
  useEffect(() => {
    if (!isOpen) return;

    triggerHaptic('success');
    setCallState('connecting');
    setPermissionError(null);
    setUserSpeechDraft('');
    setAssistantText('Hello! I am listening. How can I help you today?');

    // Slight connection delay for pleasant haptic / audio greeting
    const startTimeout = setTimeout(() => {
      setCallState('listening');
      startRecognitionSafe();
    }, 600);

    return () => {
      clearTimeout(startTimeout);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
      silenceDetectorRef.current?.clear();
      cancelSpeech();
    };
  }, [isOpen, startRecognitionSafe]);

  const handleCommitUserSpeech = async (text: string) => {
    if (!text.trim() || isGenerating) return;
    triggerHaptic('selection');
    setUserSpeechDraft('');
    setCallState('thinking');

    // Cancel any remaining recognizer before sending
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }

    try {
      await sendMessage(text, { isLive: true });
    } catch (e) {
      setCallState('listening');
      startRecognitionSafe();
    }
  };

  const handleInterrupt = () => {
    triggerHaptic('medium');
    cancelSpeech();
    setAssistantText('');
    setCallState('listening');
    startRecognitionSafe();
  };

  const handleToggleMute = () => {
    triggerHaptic('selection');
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;

    if (nextMuted) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
      silenceDetectorRef.current?.clear();
    } else {
      startRecognitionSafe();
    }
  };

  const handleEndCall = () => {
    triggerHaptic('warning');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (_) {}
    }
    silenceDetectorRef.current?.clear();
    cancelSpeech();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between bg-zinc-950 text-white select-none overflow-hidden animate-in fade-in duration-300">
      {/* Top Header Bar */}
      <header className="w-full flex items-center justify-between px-4 py-3 app-safe-top border-b border-zinc-900/80 bg-zinc-950/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono font-bold tracking-wide text-zinc-300">
            HERMES VOICE CALL
          </span>
          <span className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-cyan-400">
            {formatDuration(callDurationSec)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCaptions(!showCaptions)}
            className={`p-2 rounded-full border transition-colors ${
              showCaptions
                ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
            }`}
            title="Toggle Live Subtitles"
            aria-label="Toggle Live Subtitles"
          >
            <Subtitles className="w-4 h-4" />
          </button>

          <button
            onClick={handleEndCall}
            className="p-2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
            title="Close call"
            aria-label="Close call"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Center Interactive Animated Voice Orb */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 relative min-h-0">
        {/* Ambient Glow Backdrop */}
        <div
          className={`absolute w-72 h-72 sm:w-96 sm:h-96 rounded-full blur-3xl opacity-30 transition-all duration-700 pointer-events-none ${
            callState === 'listening'
              ? 'bg-cyan-500 scale-110'
              : callState === 'thinking'
              ? 'bg-violet-600 scale-95 animate-pulse'
              : callState === 'speaking'
              ? 'bg-amber-500 scale-125'
              : 'bg-zinc-700 scale-90'
          }`}
        />

        {/* Interactive Orb Sphere */}
        <div
          onClick={callState === 'speaking' ? handleInterrupt : undefined}
          className={`relative w-48 h-48 sm:w-56 sm:h-56 rounded-full flex items-center justify-center cursor-pointer transition-all duration-500 shadow-2xl ${
            callState === 'listening'
              ? 'ring-4 ring-cyan-500/40 bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-400 scale-100 hover:scale-105'
              : callState === 'thinking'
              ? 'ring-4 ring-violet-500/40 bg-gradient-to-tr from-purple-700 via-indigo-600 to-violet-500 animate-spin-slow'
              : callState === 'speaking'
              ? 'ring-4 ring-amber-500/40 bg-gradient-to-tr from-amber-600 via-orange-500 to-rose-500 scale-105 animate-pulse'
              : 'ring-2 ring-zinc-800 bg-zinc-900 scale-95'
          }`}
        >
          {/* Inner pulsating core */}
          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-zinc-950/70 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
            {callState === 'listening' && (
              <>
                <AudioLines className="w-12 h-12 text-cyan-400 animate-pulse" />
                <span className="text-xs font-bold text-cyan-300 mt-2">Listening...</span>
                <span className="text-[10px] text-zinc-400">Speak naturally</span>
              </>
            )}

            {callState === 'thinking' && (
              <>
                <Sparkles className="w-12 h-12 text-violet-300 animate-spin" />
                <span className="text-xs font-bold text-violet-300 mt-2">Thinking...</span>
                <span className="text-[10px] text-zinc-400">Generating reply</span>
              </>
            )}

            {callState === 'speaking' && (
              <>
                <Volume2 className="w-12 h-12 text-amber-300 animate-bounce" />
                <span className="text-xs font-bold text-amber-300 mt-2">Speaking...</span>
                <span className="text-[10px] text-zinc-400">Tap orb to interrupt</span>
              </>
            )}

            {callState === 'connecting' && (
              <>
                <Radio className="w-10 h-10 text-zinc-400 animate-pulse" />
                <span className="text-xs font-bold text-zinc-300 mt-2">Connecting...</span>
              </>
            )}
          </div>
        </div>

        {/* Permission / Status Alert */}
        {permissionError && (
          <div className="mt-6 max-w-sm px-4 py-2.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{permissionError}</span>
          </div>
        )}

        {/* Live Subtitles / Captions Pill */}
        {showCaptions && (
          <div className="mt-8 max-w-md w-full px-4 text-center min-h-[4rem] flex flex-col items-center justify-center">
            {userSpeechDraft ? (
              <p className="text-sm sm:text-base font-medium text-cyan-200 bg-cyan-950/40 border border-cyan-800/40 px-4 py-2 rounded-2xl animate-in fade-in">
                &ldquo;{userSpeechDraft}&rdquo;
              </p>
            ) : assistantText ? (
              <p className="text-xs sm:text-sm text-zinc-300 bg-zinc-900/60 border border-zinc-800/60 px-4 py-2 rounded-2xl line-clamp-3">
                {assistantText}
              </p>
            ) : (
              <p className="text-xs text-zinc-500 italic">
                Hands-free voice mode active · Speak whenever ready
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bottom Floating Control Strip */}
      <footer className="w-full px-6 py-6 app-safe-bottom bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent flex items-center justify-center gap-6 z-10">
        {/* Mute Button */}
        <button
          onClick={handleToggleMute}
          className={`flex flex-col items-center gap-1.5 p-3.5 rounded-full transition-all ${
            isMuted
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
          }`}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          <span className="text-[10px] font-mono">{isMuted ? 'Muted' : 'Mute'}</span>
        </button>

        {/* End Call Hang Up Button (Prominent Red) */}
        <button
          onClick={handleEndCall}
          className="flex flex-col items-center gap-1.5 p-5 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-900/30 scale-105 active:scale-95 transition-all"
          title="End voice call"
          aria-label="End voice call"
        >
          <PhoneOff className="w-7 h-7" />
          <span className="text-[10px] font-bold">End</span>
        </button>

        {/* Interrupt / Barge-in Button */}
        <button
          onClick={handleInterrupt}
          disabled={callState !== 'speaking'}
          className={`flex flex-col items-center gap-1.5 p-3.5 rounded-full transition-all ${
            callState === 'speaking'
              ? 'bg-zinc-800 text-amber-300 border border-amber-500/40 active:scale-95'
              : 'bg-zinc-900/50 text-zinc-600 border border-zinc-900 opacity-60'
          }`}
          title="Interrupt assistant speaking"
          aria-label="Interrupt assistant speaking"
        >
          <RotateCcw className="w-6 h-6" />
          <span className="text-[10px] font-mono">Barge-in</span>
        </button>
      </footer>
    </div>
  );
}
