'use client';

import React, { useState } from 'react';
import {
  X,
  Calculator,
  Download,
  Copy,
  Check,
  Send,
  Sparkles,
  BookOpen,
  RefreshCw,
  Sigma,
} from 'lucide-react';
import { useAppStore } from '@/appStore';

interface MathFormulaModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLatex?: string;
}

interface PresetEquation {
  title: string;
  category: string;
  latex: string;
  description: string;
  steps: string[];
}

const PRESET_EQUATIONS: PresetEquation[] = [
  {
    title: 'Quadratic Formula',
    category: 'Algebra',
    latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
    description: 'Closed-form roots for any second-degree polynomial equation ax² + bx + c = 0.',
    steps: [
      'Standard form: ax² + bx + c = 0 (with a ≠ 0)',
      'Compute discriminant Δ = b² - 4ac to determine nature of roots (real or complex)',
      'Evaluate square root radical: √Δ',
      'Calculate bifurcated roots: x₁ = (-b + √Δ) / 2a and x₂ = (-b - √Δ) / 2a',
    ],
  },
  {
    title: 'Softmax Activation (LLM Attention)',
    category: 'Deep Learning',
    latex: '\\text{Softmax}(z_i) = \\frac{e^{z_i}}{\\sum_{j=1}^K e^{z_j}}',
    description: 'Normalizes raw logit output vectors into valid probability distributions summing to 1.0.',
    steps: [
      'Logit vector input: z = [z₁, z₂, ..., z_K]',
      'Compute numerical stability offset: z* = z - max(z)',
      'Calculate elementwise exponentials: exp(z*_i)',
      'Sum partition normalization factor: Σ exp(z*_j)',
      'Divide individual exponentials by partition sum to produce categorical probabilities',
    ],
  },
  {
    title: 'Euler’s Identity',
    category: 'Complex Analysis',
    latex: 'e^{i\\pi} + 1 = 0',
    description: 'Profound identity linking the fundamental mathematical constants e, i, π, 1, and 0.',
    steps: [
      'Begin from Euler’s formula: e^(ix) = cos(x) + i·sin(x)',
      'Substitute angle x = π radians: e^(iπ) = cos(π) + i·sin(π)',
      'Evaluate trigonometric values: cos(π) = -1 and sin(π) = 0',
      'Simplify: e^(iπ) = -1 + 0·i = -1',
      'Add 1 to both sides: e^(iπ) + 1 = 0',
    ],
  },
  {
    title: 'Normal Distribution (Gaussian PDF)',
    category: 'Statistics',
    latex: 'f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x - \\mu}{\\sigma}\\right)^2}',
    description: 'Continuous probability density function parameterized by mean μ and standard deviation σ.',
    steps: [
      'Input variable x with mean parameter μ and variance σ²',
      'Compute normalized standard z-score deviation: (x - μ) / σ',
      'Calculate squared deviation exponential kernel: exp(-0.5 · z²)',
      'Multiply by normalization constant: 1 / (σ · √(2π))',
      'Integrates to exact area of 1.0 across the entire real domain (-∞, +∞)',
    ],
  },
  {
    title: 'Fourier Transform',
    category: 'Signal Processing',
    latex: '\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x) e^{-2\\pi i x \\xi} \\, dx',
    description: 'Deconstructs time-domain audio waveforms into continuous frequency spectral components.',
    steps: [
      'Time-domain signal function f(x) over continuous time x',
      'Apply complex rotational frequency carrier kernel: e^(-2πi · x · ξ)',
      'Compute continuous convolution integral from -∞ to +∞',
      'Yields complex frequency spectrum: magnitude represents amplitude, angle represents phase',
    ],
  },
];

export default function MathFormulaModal({
  isOpen,
  onClose,
  initialLatex,
}: MathFormulaModalProps) {
  const sendMessage = useAppStore((s) => s.sendMessage);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);

  const [latexInput, setLatexInput] = useState<string>(
    initialLatex || PRESET_EQUATIONS[0].latex
  );
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isSolving, setIsSolving] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentPreset = PRESET_EQUATIONS[selectedPresetIndex];

  const handleSelectPreset = (idx: number) => {
    setSelectedPresetIndex(idx);
    setLatexInput(PRESET_EQUATIONS[idx].latex);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);
  };

  const handleInsertSymbol = (sym: string) => {
    setLatexInput((prev) => prev + sym);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
  };

  const handleCopyLatex = () => {
    navigator.clipboard.writeText(latexInput);
    setIsCopied(true);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(25);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleExportTex = () => {
    const texContent = [
      '\\documentclass[12pt]{article}',
      '\\usepackage{amsmath,amssymb}',
      '\\begin{document}',
      '\\section*{Hermes AI Mathematical Derivation}',
      '\\[',
      latexInput,
      '\\]',
      '\\end{document}',
    ].join('\n');

    const blob = new Blob([texContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Hermes_Math_${Date.now()}.tex`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendToHermes = () => {
    sendMessage(
      `Solve and explain this mathematical formula step-by-step with rigorous proofs and derivations:\n\n` +
      `$$\n${latexInput}\n$$\n\n` +
      `Please provide:\n` +
      `1. Mathematical intuition & conceptual significance\n` +
      `2. Step-by-step symbolic derivation\n` +
      `3. Boundary conditions and domain constraints\n` +
      `4. Numerical example calculation with sample parameters`
    );
    onClose();
    setCurrentTab('chat');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/15 border border-violet-500/40 text-violet-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>LaTeX Math Formula & Step-by-Step Solver</span>
              </h3>
              <p className="text-[10px] text-zinc-400">On-device mathematical equation rendering and symbolic decomposition</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white cursor-pointer transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Preset Equation Pills */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Formula Presets</span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {PRESET_EQUATIONS.map((eq, idx) => (
                <button
                  key={eq.title}
                  onClick={() => handleSelectPreset(idx)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer border ${
                    selectedPresetIndex === idx
                      ? 'bg-violet-600 text-white border-violet-500 shadow-sm'
                      : 'bg-zinc-950/70 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                  }`}
                >
                  {eq.title}
                </button>
              ))}
            </div>
          </div>

          {/* Rendered Math Formula Display Viewport */}
          <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800/90 text-center space-y-2 shadow-inner">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
              <span className="flex items-center gap-1 text-violet-400">
                <Sigma className="w-3.5 h-3.5" />
                <span>{currentPreset?.category || 'Calculus & Algebra'}</span>
              </span>
              <span>Rendered LaTeX</span>
            </div>

            <div className="py-4 px-2 overflow-x-auto select-all text-violet-200 font-serif text-lg tracking-wide flex items-center justify-center min-h-[64px]">
              {/* Formatted symbolic representation */}
              <div className="inline-block p-2 rounded-xl bg-zinc-900/90 border border-violet-500/20 text-center font-mono text-sm sm:text-base text-violet-300">
                {latexInput}
              </div>
            </div>

            {currentPreset && (
              <p className="text-[11px] text-zinc-400 max-w-md mx-auto italic">
                {currentPreset.description}
              </p>
            )}
          </div>

          {/* Quick LaTeX Symbol Toolbar */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Symbol Palette</span>
            <div className="flex flex-wrap gap-1">
              {[
                { label: 'x/y', sym: '\\frac{a}{b}' },
                { label: '√x', sym: '\\sqrt{x}' },
                { label: 'Σ', sym: '\\sum_{i=1}^n ' },
                { label: '∫', sym: '\\int_{a}^{b} ' },
                { label: 'π', sym: '\\pi' },
                { label: 'θ', sym: '\\theta' },
                { label: '∞', sym: '\\infty' },
                { label: '±', sym: '\\pm' },
                { label: '·', sym: '\\cdot' },
                { label: 'Δ', sym: '\\Delta' },
                { label: 'e^x', sym: 'e^{x}' },
              ].map((s) => (
                <button
                  key={s.label}
                  onClick={() => handleInsertSymbol(s.sym)}
                  className="px-2 py-0.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-mono text-[10px] cursor-pointer transition-all"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Editable LaTeX Textarea */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span className="font-bold uppercase tracking-wider">LaTeX Source Code</span>
              <span className="font-mono text-zinc-500">{latexInput.length} chars</span>
            </div>
            <textarea
              value={latexInput}
              onChange={(e) => setLatexInput(e.target.value)}
              rows={3}
              placeholder="Enter LaTeX math formula expression..."
              className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono focus:outline-none focus:border-violet-500/50 resize-y"
            />
          </div>

          {/* Step-by-Step Derivation Breakdown */}
          {currentPreset && currentPreset.steps.length > 0 && (
            <div className="p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Step-by-Step Analytical Derivation</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-500">{currentPreset.steps.length} Steps</span>
              </div>

              <div className="space-y-1.5">
                {currentPreset.steps.map((st, i) => (
                  <div key={i} className="text-[11px] text-zinc-300 flex items-start gap-2 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/80">
                    <span className="px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-300 font-bold font-mono text-[9px] shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{st}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950/90 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLatex}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-zinc-700 transition-all"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied ? 'Copied LaTeX!' : 'Copy LaTeX'}</span>
            </button>

            <button
              onClick={handleExportTex}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-zinc-700 transition-all"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export .tex</span>
            </button>
          </div>

          <button
            onClick={handleSendToHermes}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-lg shadow-violet-600/30 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Solve with Hermes AI</span>
          </button>
        </div>
      </div>
    </div>
  );
}
