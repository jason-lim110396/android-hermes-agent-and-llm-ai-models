'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  Subtitles,
  RotateCcw,
  Radio,
  AudioLines,
  AlertCircle,
  X,
  Send,
  MessageSquare,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAppStore } from '@/appStore';
import { triggerHaptic } from '@/utils/haptics';
import { useBackButtonClose } from '@/utils/backButton';
import {
  createSilenceDetector,
  type SilenceDetector,
} from '@/utils/voiceSession';
import {
  speakGuarded,
  cancelSpeech,
  onSpeakingChange,
  playWebAudioSpeechChime,
  createSpeechUtterance,
} from '@/utils/speechGuard';
import {
  createSpeechInputSession,
  hasSpeechInput,
  type SpeechSession,
} from '@/utils/speechRecognition';

type CallState = 'connecting' | 'listening' | 'thinking' | 'speaking';

interface VoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_CALL_PROMPTS = [
  'Hello Hermes, what can you do?',
  'Summarize today’s priority tasks',
  'What is the current system status?',
  'Give me an interesting science fact',
];

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
  const [showQuickInput, setShowQuickInput] = useState(false);
  const [manualInputText, setManualInputText] = useState('');

  const recognitionRef = useRef<SpeechSession | null>(null);
  const sessionTokenRef = useRef(0);
  const silenceDetectorRef = useRef<SilenceDetector | null>(null);
  const isOpenRef = useRef(isOpen);
  const isGeneratingRef = useRef(isGenerating);
  const isSpeakingRef = useRef(isSpeaking);
  const userSpeechDraftRef = useRef(userSpeechDraft);
  const handleCommitUserSpeechRef = useRef<(text: string) => Promise<void>>(async () => {});
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  useEffect(() => {
    isOpenRef.current = isOpen;
    isGeneratingRef.current = isGenerating;
    isSpeakingRef.current = isSpeaking;
    userSpeechDraftRef.current = userSpeechDraft;
  }, [isOpen, isGenerating, isSpeaking, userSpeechDraft]);

  // Native recognizer on the installed app, Web Speech API on desktop.
  const hasSpeechRecognition = hasSpeechInput();

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
          if (hasSpeechRecognition) {
            startRecognitionSafe();
          }
        }
      }
    });
    return () => unsub();
  }, [isOpen, isGenerating, hasSpeechRecognition]);

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
          if (spoken.length > 0) {
            setCallState('speaking');
            const chunk = spoken.slice(0, 500);
            const utterance = createSpeechUtterance(chunk);
            if (utterance) {
              utterance.lang = 'en-US';
              utterance.volume = 1.0;
            }
            speakGuarded(utterance, chunk);
          } else {
            setCallState('listening');
            if (hasSpeechRecognition) {
              startRecognitionSafe();
            }
          }
        }
      }
    } else if (!prevGeneratingRef.current && isGenerating) {
      setCallState('thinking');
    }
    prevGeneratingRef.current = isGenerating;
  }, [isGenerating, isOpen, chatSessions, activeChatSessionId, hasSpeechRecognition]);

  // Start or restart speech recognition safely
  const startRecognitionSafe = useCallback(() => {
    if (typeof window === 'undefined' || !isOpenRef.current) return;
    if (isMutedRef.current) return;

    // Stop any previous session before starting the next one.
    const previous = recognitionRef.current;
    recognitionRef.current = null;
    previous?.abort();

    sessionTokenRef.current += 1;
    const currentToken = sessionTokenRef.current;
    const isCurrent = () => sessionTokenRef.current === currentToken;

    const canRearm = () =>
      isOpenRef.current && !isMutedRef.current && !isGeneratingRef.current && !isSpeakingRef.current;

    const session = createSpeechInputSession(
      {
        onStart: () => {
          if (!isCurrent()) return;
          setPermissionError(null);
          setCallState('listening');
        },
        onUpdate: ({ finalText, interimText }) => {
          if (!isCurrent()) return;
          silenceDetectorRef.current?.reset();
          const live = `${finalText}${interimText ? (finalText ? ' ' : '') + interimText : ''}`.trim();
          if (live) {
            userSpeechDraftRef.current = live;
            setUserSpeechDraft(live);
          }
        },
        onFinal: (text) => {
          if (!isCurrent()) return;
          const clean = text.trim();
          if (!clean) return;
          userSpeechDraftRef.current = clean;
          setUserSpeechDraft(clean);
          handleCommitUserSpeechRef.current(clean);
        },
        onError: (failure) => {
          if (!isCurrent()) return;
          silenceDetectorRef.current?.clear();
          if (failure.reason === 'permission_denied') {
            setPermissionError('Microphone permission denied. Tap orb or use quick input to chat.');
            return;
          }
          if (failure.recoverable) {
            // Silence/no-match is normal in a call. The session's onEnd event
            // re-arms it; re-arming here too would start two sessions and the
            // second would fail as busy.
            return;
          }
          // No recognizer, network or audio failure: say what happened and
          // offer the text input instead of pretending to listen.
          setPermissionError(failure.message);
          setShowQuickInput(true);
        },
        onEnd: () => {
          if (!isCurrent()) return;
          silenceDetectorRef.current?.clear();
          recognitionRef.current = null;
          // If stopped without a final result and we still have text, commit it.
          if (userSpeechDraftRef.current.trim().length > 0) {
            handleCommitUserSpeechRef.current(userSpeechDraftRef.current.trim());
          } else if (canRearm()) {
            setTimeout(() => {
              if (isCurrent() && canRearm()) startRecognitionSafe();
            }, 300);
          }
        },
      },
      { lang: 'en-US', continuous: false }
    );

    recognitionRef.current = session;
    // The native recognizer stops itself at end-of-speech and reports onEnd;
    // the silence timer is only needed by the browser engine, which can stay
    // in a live-but-silent state. Timer-stopping the native session made it
    // stop and restart every couple of seconds on a quiet microphone.
    if (session.engine === 'web') {
      silenceDetectorRef.current = createSilenceDetector(1600, () => {
        if (isCurrent()) session.stop();
      });
    } else {
      silenceDetectorRef.current = null;
    }

    session.start().then((result) => {
      if (!isCurrent()) {
        session.abort();
        return;
      }
      if (!result.started) {
        recognitionRef.current = null;
        silenceDetectorRef.current?.clear();
        setCallState('listening');
        if (result.reason === 'permission_denied') {
          setPermissionError('Microphone permission blocked. Tap orb or use quick input to chat.');
        } else {
          setPermissionError(result.message || 'Voice input is unavailable.');
          setShowQuickInput(true);
        }
      }
    });
  }, []);

  // Initial connect when modal opens
  useEffect(() => {
    if (!isOpen) return;

    triggerHaptic('success');
    setCallState('connecting');
    setPermissionError(null);
    userSpeechDraftRef.current = '';
    setUserSpeechDraft('');
    const greeting = 'Hello! I am listening. How can I help you today?';
    setAssistantText(greeting);

    // Audible spoken greeting on connect. The Android WebView has no
    // `speechSynthesis`, so do not gate the native engine on it.
    const greetingUtterance = createSpeechUtterance(greeting);
    if (greetingUtterance) {
      greetingUtterance.lang = 'en-US';
      greetingUtterance.volume = 1.0;
      greetingUtterance.rate = 1.0;
      greetingUtterance.pitch = 1.05;
    }
    try {
      speakGuarded(greetingUtterance, greeting, { lang: 'en-US' });
    } catch (_) {
      playWebAudioSpeechChime(greeting);
    }

    const startTimeout = setTimeout(() => {
      setCallState('listening');
      if (hasSpeechRecognition) {
        startRecognitionSafe();
      }
    }, 800);

    return () => {
      clearTimeout(startTimeout);
      sessionTokenRef.current += 1;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
      silenceDetectorRef.current?.clear();
      cancelSpeech();
    };
  }, [isOpen, startRecognitionSafe, hasSpeechRecognition]);

  const handleCommitUserSpeech = async (text: string) => {
    if (!text.trim() || isGenerating) return;
    triggerHaptic('selection');
    userSpeechDraftRef.current = '';
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
      if (hasSpeechRecognition) {
        startRecognitionSafe();
      }
    }
  };

  useEffect(() => {
    handleCommitUserSpeechRef.current = handleCommitUserSpeech;
  });

  const handleInterrupt = () => {
    triggerHaptic('medium');
    cancelSpeech();
    setAssistantText('');
    setCallState('listening');
    if (hasSpeechRecognition) {
      startRecognitionSafe();
    }
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
      if (hasSpeechRecognition) {
        startRecognitionSafe();
      }
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

  // Orb tap: re-arm the recognizer, or offer text input when voice is
  // unavailable. It never records audio that can never become text.
  const handleOrbClick = () => {
    if (callState === 'speaking') {
      handleInterrupt();
      return;
    }
    if (callState !== 'listening') return;

    triggerHaptic('selection');
    if (hasSpeechRecognition) {
      startRecognitionSafe();
      return;
    }
    setPermissionError(
      'Voice input needs the installed Android app. Type below to chat on this device.'
    );
    setShowQuickInput(true);
  };

  const handleSendManualInput = () => {
    if (!manualInputText.trim() || isGenerating) return;
    const text = manualInputText.trim();
    setManualInputText('');
    setShowQuickInput(false);
    handleCommitUserSpeech(text);
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
          {!hasSpeechRecognition && (
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[9px] font-mono text-amber-300">
              Text input only
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQuickInput(!showQuickInput)}
            className={`p-2 rounded-full border transition-colors ${
              showQuickInput
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
            }`}
            title="Toggle Quick Input"
            aria-label="Toggle Quick Input"
          >
            <MessageSquare className="w-4 h-4" />
          </button>

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
          onClick={handleOrbClick}
          className={`relative w-48 h-48 sm:w-56 sm:h-56 rounded-full flex items-center justify-center cursor-pointer transition-all duration-500 shadow-2xl ${
            callState === 'listening'
              ? 'ring-4 ring-cyan-500/40 bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-400 scale-100 hover:scale-105 active:scale-95'
              : callState === 'thinking'
              ? 'ring-4 ring-violet-500/40 bg-gradient-to-tr from-purple-700 via-indigo-600 to-violet-500 animate-spin-slow'
              : callState === 'speaking'
              ? 'ring-4 ring-amber-500/40 bg-gradient-to-tr from-amber-600 via-orange-500 to-rose-500 scale-105 animate-pulse active:scale-95'
              : 'ring-2 ring-zinc-800 bg-zinc-900 scale-95'
          }`}
        >
          {/* Inner pulsating core */}
          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-zinc-950/70 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
            {callState === 'listening' && (
              <>
                <AudioLines className="w-12 h-12 text-cyan-400 animate-pulse" />
                <span className="text-xs font-bold text-cyan-300 mt-2">
                  Listening...
                </span>
                <span className="text-[10px] text-zinc-400">
                  {hasSpeechRecognition ? 'Speak naturally' : 'Voice input unavailable'}
                </span>
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
          <div className="mt-4 max-w-sm px-3.5 py-2 rounded-xl bg-amber-950/80 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{permissionError}</span>
          </div>
        )}

        {/* Live Subtitles / Captions Pill */}
        {showCaptions && (
          <div className="mt-6 max-w-md w-full px-4 text-center min-h-[3.5rem] flex flex-col items-center justify-center">
            {userSpeechDraft ? (
              <p className="text-xs sm:text-sm font-medium text-cyan-200 bg-cyan-950/40 border border-cyan-800/40 px-3.5 py-2 rounded-2xl animate-in fade-in">
                &ldquo;{userSpeechDraft}&rdquo;
              </p>
            ) : assistantText ? (
              <p className="text-xs sm:text-sm text-zinc-300 bg-zinc-900/60 border border-zinc-800/60 px-3.5 py-2 rounded-2xl line-clamp-3">
                {assistantText}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-500 italic">
                {hasSpeechRecognition
                  ? 'Hands-free voice mode active · Speak whenever ready'
                  : 'Voice input unavailable here · tap orb or use quick input'}
              </p>
            )}
          </div>
        )}

        {/* Expandable Quick Input & Suggestion Drawer */}
        {showQuickInput && (
          <div className="mt-4 max-w-md w-full px-3 py-2.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 backdrop-blur-md space-y-2 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={manualInputText}
                onChange={(e) => setManualInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendManualInput();
                }}
                placeholder="Type or speak a message to Hermes..."
                className="flex-1 bg-zinc-950/80 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                onClick={handleSendManualInput}
                disabled={!manualInputText.trim() || isGenerating}
                className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-all cursor-pointer"
                title="Send to Hermes"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {QUICK_CALL_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleCommitUserSpeech(prompt)}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-300 font-medium transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Floating Control Strip */}
      <footer className="w-full px-6 py-5 app-safe-bottom bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent flex items-center justify-center gap-5 z-10">
        {/* Mute / Push-to-Talk Button */}
        <button
          onClick={hasSpeechRecognition ? handleToggleMute : handleOrbClick}
          className={`flex flex-col items-center gap-1 p-3 rounded-full transition-all ${
            isMuted
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
          }`}
          title={hasSpeechRecognition ? (isMuted ? 'Unmute microphone' : 'Mute microphone') : 'Tap to Speak'}
          aria-label={hasSpeechRecognition ? (isMuted ? 'Unmute microphone' : 'Mute microphone') : 'Tap to Speak'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          <span className="text-[9px] font-mono">
            {hasSpeechRecognition ? (isMuted ? 'Muted' : 'Mute') : 'Talk'}
          </span>
        </button>

        {/* End Call Hang Up Button (Prominent Red) */}
        <button
          onClick={handleEndCall}
          className="flex flex-col items-center gap-1 p-4 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-900/30 scale-105 active:scale-95 transition-all"
          title="End voice call"
          aria-label="End voice call"
        >
          <PhoneOff className="w-6 h-6" />
          <span className="text-[10px] font-bold">End</span>
        </button>

        {/* Interrupt / Barge-in Button */}
        <button
          onClick={handleInterrupt}
          disabled={callState !== 'speaking'}
          className={`flex flex-col items-center gap-1 p-3 rounded-full transition-all ${
            callState === 'speaking'
              ? 'bg-zinc-800 text-amber-300 border border-amber-500/40 active:scale-95'
              : 'bg-zinc-900/50 text-zinc-600 border border-zinc-900 opacity-60'
          }`}
          title="Interrupt assistant speaking"
          aria-label="Interrupt assistant speaking"
        >
          <RotateCcw className="w-5 h-5" />
          <span className="text-[9px] font-mono">Barge-in</span>
        </button>
      </footer>
    </div>
  );
}
