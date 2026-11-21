'use client';

import { triggerHaptic } from '@/utils/haptics';
import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Download,
  Share2,
  Copy,
  Check,
  Sparkles,
  Presentation,
  Sliders,
  Maximize2,
  Minimize2,
  Sun,
  Moon,
} from 'lucide-react';
import { useBackButtonClose } from '@/utils/backButton';

interface SlideDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent: string;
  deckTitle?: string;
}

export default function SlideDeckModal({
  isOpen,
  onClose,
  initialContent,
  deckTitle = 'Hermes Neural Slide Deck',
}: SlideDeckModalProps) {
  useBackButtonClose(isOpen, onClose);

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light' | 'amoled'>('dark');
  const [isPlayingAuto, setIsPlayingAuto] = useState(false);
  const [copied, setCopied] = useState(false);

  // Parse markdown content into distinct slides
  const slides = React.useMemo(() => {
    if (!initialContent) return ['# Welcome to Hermes Presentation\n\nNo slide content provided.'];

    let split = initialContent.split(/\n(?:---|<!-- slide -->|\*\*\*)\n/);
    if (split.length <= 1) {
      // Fallback: split by H2 headers if no slide divider tags present
      split = initialContent.split(/(?=\n## )/);
    }
    return split.map((s) => s.trim()).filter(Boolean);
  }, [initialContent]);

  useEffect(() => {
    setCurrentSlideIndex(0);
  }, [initialContent]);

  // Auto-advance slideshow timer. Guard on isOpen: this modal stays mounted
  // when closed, so without it a started slideshow keeps a hidden interval -
  // CPU/battery burn - advancing slides nobody can see or pause.
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isOpen && isPlayingAuto && slides.length > 1) {
      timer = setInterval(() => {
        setCurrentSlideIndex((prev) => (prev + 1) % slides.length);
      }, 4500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOpen, isPlayingAuto, slides.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        setCurrentSlideIndex((prev) => Math.min(slides.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, slides.length, onClose]);

  if (!isOpen) return null;

  const currentSlide = slides[currentSlideIndex] || slides[0] || '';

  const handleNext = () => {
    if (currentSlideIndex < slides.length - 1) {
      setCurrentSlideIndex((prev) => prev + 1);
      triggerHaptic(20);
    }
  };

  const handlePrev = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex((prev) => prev - 1);
      triggerHaptic(20);
    }
  };

  const handleExportHtmlDeck = () => {
    const htmlSlides = slides
      .map(
        (s, idx) => `
      <section class="slide" id="slide-${idx + 1}">
        <div class="slide-content">
          ${s
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\n\n/g, '<br><br>')}
        </div>
        <div class="slide-footer">Slide ${idx + 1} of ${slides.length} • Hermes Mobile Deck</div>
      </section>`
      )
      .join('\n');

    const htmlDocument = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${deckTitle}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #09090b;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
    }
    .slide {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 20px;
      width: 100%;
      max-width: 860px;
      min-height: 480px;
      margin-bottom: 30px;
      padding: 40px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    h1 { color: #38bdf8; font-size: 2rem; margin-bottom: 1rem; }
    h2 { color: #34d399; font-size: 1.5rem; margin-bottom: 0.8rem; }
    h3 { color: #f59e0b; font-size: 1.2rem; margin-bottom: 0.6rem; }
    p, div { font-size: 1.1rem; line-height: 1.6; color: #d4d4d8; }
    code { background: #27272a; padding: 2px 6px; border-radius: 6px; font-family: monospace; }
    .slide-footer { font-size: 0.8rem; color: #71717a; border-top: 1px solid #27272a; padding-top: 15px; margin-top: 20px; }
  </style>
</head>
<body>
  ${htmlSlides}
</body>
</html>`;

    const blob = new Blob([htmlDocument], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckTitle.replace(/\s+/g, '_')}_Deck.html`;
    a.click();
    URL.revokeObjectURL(url);
    triggerHaptic(40);
  };

  const handleCopyMarkdown = () => {
    // Only report "Copied" when the clipboard write actually resolved.
    navigator.clipboard
      .writeText(initialContent)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        triggerHaptic(25);
      })
      .catch(() => setCopied(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className={`w-full max-w-2xl rounded-3xl border shadow-2xl flex flex-col h-[85vh] max-h-[700px] overflow-hidden transition-all ${
          theme === 'amoled'
            ? 'bg-black border-zinc-900 text-white'
            : theme === 'light'
            ? 'bg-zinc-100 border-zinc-300 text-zinc-900'
            : 'bg-zinc-900 border-zinc-800 text-white'
        }`}
      >
        {/* Header Bar */}
        <div
          className={`px-4 py-3 border-b flex items-center justify-between transition-colors ${
            theme === 'light' ? 'border-zinc-300 bg-white' : 'border-zinc-800 bg-zinc-950/70'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white">
              <Presentation className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold flex items-center gap-1.5">
                <span>{deckTitle}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                  Slide {currentSlideIndex + 1}/{slides.length}
                </span>
              </h2>
              <p className="text-[10px] text-zinc-400">Offline On-Device Presentation Viewer & Deck Exporter</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Theme Toggle */}
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'amoled' : t === 'amoled' ? 'light' : 'dark'))}
              className="p-1.5 rounded-xl hover:bg-zinc-800/80 text-zinc-400 hover:text-white transition-all cursor-pointer"
              title="Toggle Slide Theme"
            >
              {theme === 'light' ? <Moon className="w-4 h-4 text-zinc-700" /> : <Sun className="w-4 h-4 text-amber-400" />}
            </button>

            {/* Export HTML */}
            <button
              onClick={handleExportHtmlDeck}
              className="p-1.5 rounded-xl hover:bg-zinc-800/80 text-cyan-400 hover:text-cyan-300 transition-all cursor-pointer"
              title="Export Standalone HTML Deck"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-zinc-800/80 text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Slide Stage Canvas */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col justify-center items-center text-center select-text">
          <div
            className={`w-full max-w-lg p-6 rounded-2xl border shadow-xl flex flex-col justify-between min-h-[320px] transition-all ${
              theme === 'light'
                ? 'bg-white border-zinc-300 text-zinc-900'
                : theme === 'amoled'
                ? 'bg-black border-zinc-800 text-white'
                : 'bg-zinc-950 border-zinc-800/80 text-zinc-100'
            }`}
          >
            <div className="flex-1 flex flex-col justify-center items-center space-y-4">
              <div className="whitespace-pre-wrap font-sans text-left w-full space-y-2 leading-relaxed">
                {currentSlide.split('\n').map((line, i) => {
                  if (line.startsWith('# ')) {
                    return <h1 key={i} className="text-xl font-black text-cyan-400 border-b border-zinc-800/80 pb-2">{line.slice(2)}</h1>;
                  }
                  if (line.startsWith('## ')) {
                    return <h2 key={i} className="text-lg font-bold text-emerald-400 pt-1">{line.slice(3)}</h2>;
                  }
                  if (line.startsWith('### ')) {
                    return <h3 key={i} className="text-sm font-bold text-amber-400">{line.slice(4)}</h3>;
                  }
                  if (line.startsWith('- ')) {
                    return (
                      <div key={i} className="flex items-start gap-2 text-xs text-zinc-300 pl-1">
                        <span className="text-cyan-400 font-bold">•</span>
                        <span>{line.slice(2)}</span>
                      </div>
                    );
                  }
                  if (!line.trim()) return <div key={i} className="h-1" />;
                  return <p key={i} className="text-xs text-zinc-300">{line}</p>;
                })}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
              <span>Hermes Autonomous Deck</span>
              <span>{currentSlideIndex + 1} / {slides.length}</span>
            </div>
          </div>
        </div>

        {/* Carousel & Playback Controls Footer */}
        <div
          className={`p-3 border-t flex items-center justify-between transition-colors ${
            theme === 'light' ? 'border-zinc-300 bg-zinc-200' : 'border-zinc-800 bg-zinc-950'
          }`}
        >
          {/* Slide dots */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-[180px] scrollbar-none">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setCurrentSlideIndex(idx);
                  triggerHaptic(15);
                }}
                className={`w-2.5 h-2.5 rounded-full transition-all cursor-pointer ${
                  currentSlideIndex === idx
                    ? 'bg-cyan-400 w-5'
                    : 'bg-zinc-700 hover:bg-zinc-500'
                }`}
                title={`Go to Slide ${idx + 1}`}
              />
            ))}
          </div>

          {/* Central Carousel Navigation Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={currentSlideIndex === 0}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-white cursor-pointer transition-all"
              title="Previous Slide"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                setIsPlayingAuto((p) => !p);
                triggerHaptic(20);
              }}
              className={`p-2 rounded-xl font-bold text-xs flex items-center gap-1 transition-all cursor-pointer ${
                isPlayingAuto ? 'bg-amber-500 text-black shadow-md' : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
              title={isPlayingAuto ? 'Pause Slideshow' : 'Autoplay Slideshow'}
            >
              {isPlayingAuto ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <button
              onClick={handleNext}
              disabled={currentSlideIndex === slides.length - 1}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-white cursor-pointer transition-all"
              title="Next Slide"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Copy Markdown */}
          <button
            onClick={handleCopyMarkdown}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-[11px] font-bold text-zinc-300 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
