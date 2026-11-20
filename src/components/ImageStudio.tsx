'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Download,
  Copy,
  Check,
  RefreshCw,
  Image as ImageIcon,
  Maximize2,
  X,
  Sliders,
  Wand2,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Clock,
  Zap,
} from 'lucide-react';
import { useAppStore } from '@/appStore';
import { AVAILABLE_MODELS } from '@/models';
import { generateOnDeviceAIImage } from '@/inferenceEngine';

interface StylePreset {
  id: string;
  name: string;
  icon: string;
  promptSuffix: string;
  negativeSuffix: string;
}

const STYLE_PRESETS: StylePreset[] = [
  { id: 'cinematic', name: 'Cinematic', icon: '🎬', promptSuffix: ', cinematic lighting, 8k resolution, dramatic shadows, photorealistic, masterpiece', negativeSuffix: ', cartoon, flat, low quality, oversaturated' },
  { id: 'anime', name: 'Anime Pro', icon: '✨', promptSuffix: ', makoto shinkai anime style, vibrant colors, detailed line art, aesthetic lighting', negativeSuffix: ', 3d, realistic photo, blurry' },
  { id: 'cyberpunk', name: 'Cyberpunk', icon: '🌆', promptSuffix: ', cyberpunk neon lighting, volumetric fog, futuristic megacity, octane render, 8k', negativeSuffix: ', vintage, pastel, dull' },
  { id: 'photo', name: 'Hyperreal', icon: '📸', promptSuffix: ', 35mm photograph, shot on Hasselblad, natural skin textures, depth of field', negativeSuffix: ', CGI, 3d render, cartoon, deformed' },
  { id: 'fantasy', name: 'Fantasy Art', icon: '🐉', promptSuffix: ', epic fantasy illustration, mythical atmosphere, highly detailed, artstation trending', negativeSuffix: ', modern, photo, plain' },
  { id: '3d-render', name: '3D Octane', icon: '🔮', promptSuffix: ', 3D render, octane render, smooth textures, subsurface scattering, isometric cute', negativeSuffix: ', 2d, flat drawing, sketch' },
  { id: 'watercolor', name: 'Watercolor', icon: '🎨', promptSuffix: ', traditional watercolor painting, paper texture, soft gradients, artistic splatter', negativeSuffix: ', sharp edges, 3d, digital' },
];

const PROMPT_SUGGESTIONS = [
  'Futuristic Android robot meditating in a tranquil bamboo garden with soft morning sunlight',
  'Cyberpunk street food vendor in Neo-Tokyo with glowing holographic signs in the rain',
  'Majestic crystal dragon perched atop a snowy mountain peak at purple dusk',
  'Tiny cute astronaut planting a glowing daisy flower on the moon surface',
  'Cozy attic library filled with floating glowing ancient spellbooks and a calico cat',
  'Sleek modern electric sports car speeding through a glowing neon tunnel',
];

interface GeneratedHistoryItem {
  id: string;
  prompt: string;
  styleName: string;
  dataUrl: string;
  timestamp: number;
  modelName: string;
  aspectRatio: string;
}

export default function ImageStudio() {
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('blurry, deformed, low quality, distorted, extra limbs');
  const [showNegative, setShowNegative] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>('cinematic');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16'>('1:1');
  const [qualityMode, setQualityMode] = useState<'fast' | 'quality'>('fast');
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [history, setHistory] = useState<GeneratedHistoryItem[]>([]);

  const imageModels = AVAILABLE_MODELS.filter((m) => m.category === 'image' || m.capabilities.includes('image-gen'));
  const currentModel = imageModels.find((m) => m.id === selectedModelId) || imageModels[0];

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    try {
      setProgressPct(15);
      setProgressStatus('Allocating latent diffusion tensors...');

      const activeStyle = STYLE_PRESETS.find((s) => s.id === selectedStyle);
      const fullPrompt = prompt.trim() + (activeStyle ? activeStyle.promptSuffix : '');

      setProgressPct(40);
      setProgressStatus(`Synthesizing with ${currentModel?.name || 'Diffusion Engine'}...`);

      const dataUrl = await generateOnDeviceAIImage(
        fullPrompt,
        currentModel?.name || 'FLUX.1 Schnell',
        (status, pct) => {
          setProgressStatus(status);
          setProgressPct(pct);
        }
      );

      setActiveImage(dataUrl);
      setProgressPct(100);
      setProgressStatus('Rendering complete!');

      const newItem: GeneratedHistoryItem = {
        id: Date.now().toString(),
        prompt: prompt.trim(),
        styleName: activeStyle?.name || 'Default',
        dataUrl,
        timestamp: Date.now(),
        modelName: currentModel?.name || 'Diffusion Model',
        aspectRatio,
      };

      setHistory((prev) => [newItem, ...prev.slice(0, 19)]);
    } catch (err: any) {
      setProgressStatus(err?.message || 'Generation halted');
    } finally {
      setTimeout(() => setProgressPct(0), 1200);
    }
  };

  const handleDownload = (imgUrl: string, promptText: string) => {
    try {
      const a = document.createElement('a');
      a.href = imgUrl;
      a.download = `hermes-ai-${promptText.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (_) {}
  };

  const handleCopyPrompt = () => {
    if (!prompt) return;
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleRandomPrompt = () => {
    const random = PROMPT_SUGGESTIONS[Math.floor(Math.random() * PROMPT_SUGGESTIONS.length)];
    setPrompt(random);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 text-white overflow-y-auto pb-20 select-none">
      {/* Studio Header */}
      <div className="w-full bg-zinc-900/90 border-b border-zinc-800/80 px-4 py-3 backdrop-blur-xl flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-fuchsia-600 to-pink-500 flex items-center justify-center shadow-lg shadow-fuchsia-600/30">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black text-white flex items-center gap-1.5">
              <span>Diffusion Image Studio</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 font-mono font-bold">
                PRO
              </span>
            </h1>
            <p className="text-[10px] text-zinc-400">On-device neural image synthesis with FLUX & SD-Turbo</p>
          </div>
        </div>

        {/* Model Selector Pill */}
        <select
          value={currentModel?.id || ''}
          onChange={(e) => setSelectedModelId(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-xs text-fuchsia-300 font-bold px-2.5 py-1.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-fuchsia-500 cursor-pointer"
        >
          {imageModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.parameters})
            </option>
          ))}
        </select>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Prompt Input Box */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3.5 shadow-xl space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
            <span className="flex items-center gap-1.5 text-fuchsia-400">
              <Wand2 className="w-3.5 h-3.5" />
              <span>Visual Prompt</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRandomPrompt}
                className="text-[11px] text-zinc-400 hover:text-fuchsia-300 flex items-center gap-1 transition-all cursor-pointer font-medium"
              >
                <Zap className="w-3 h-3 text-amber-400" />
                <span>Inspiration</span>
              </button>
              {prompt && (
                <button
                  onClick={() => setPrompt('')}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want to create in vivid detail (e.g. Cyberpunk samurai with glowing katana in rainy neon alley)..."
            rows={3}
            className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 resize-none transition-all"
          />

          {/* Quick Style Chips */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Style Presets</span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {STYLE_PRESETS.map((style) => {
                const isSelected = selectedStyle === style.id;
                return (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyle(style.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs whitespace-nowrap transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-fuchsia-600 text-white font-bold shadow-md shadow-fuchsia-600/30 ring-1 ring-fuchsia-400'
                        : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border border-zinc-700/60'
                    }`}
                  >
                    <span>{style.icon}</span>
                    <span>{style.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collapsible Negative Prompt */}
          <div className="pt-1">
            <button
              onClick={() => setShowNegative(!showNegative)}
              className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              <span>{showNegative ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</span>
              <span>Advanced: Negative Prompt</span>
            </button>
            {showNegative && (
              <input
                type="text"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="Elements to avoid (e.g. blurry, text, bad anatomy)"
                className="mt-1.5 w-full bg-zinc-950/70 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
            )}
          </div>

          {/* Aspect Ratio & Quality Row */}
          <div className="flex items-center justify-between pt-1 text-xs border-t border-zinc-800/80">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-zinc-400">Ratio:</span>
              {(['1:1', '16:9', '9:16'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setAspectRatio(r)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    aspectRatio === r
                      ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/50'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-zinc-400">Mode:</span>
              <button
                onClick={() => setQualityMode(qualityMode === 'fast' ? 'quality' : 'fast')}
                className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 cursor-pointer"
              >
                {qualityMode === 'fast' ? '⚡ 4-Step Fast' : '✨ 8-Step High-Def'}
              </button>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className={`w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
              !prompt.trim() || isGenerating
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 hover:from-fuchsia-500 hover:to-rose-500 text-white shadow-fuchsia-600/30 active:scale-[0.99]'
            }`}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{progressStatus || 'Synthesizing Image...'}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Synthesize Art with {currentModel?.name || 'Diffusion Engine'}</span>
              </>
            )}
          </button>

          {/* Progress Bar */}
          {progressPct > 0 && (
            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-fuchsia-500 to-rose-500 h-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>

        {/* Active Result View */}
        {activeImage && (
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3.5 shadow-2xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-zinc-300 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Generated Artwork</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFullscreenImage(activeImage)}
                  title="Fullscreen preview"
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleCopyPrompt}
                  title="Copy Prompt"
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer"
                >
                  {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleDownload(activeImage, prompt)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-fuchsia-600/30"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            <div
              onClick={() => setFullscreenImage(activeImage)}
              className="relative w-full rounded-xl overflow-hidden bg-black/60 border border-zinc-800 cursor-pointer group flex items-center justify-center"
              style={{
                aspectRatio: aspectRatio === '1:1' ? '1 / 1' : aspectRatio === '16:9' ? '16 / 9' : '9 / 16',
                maxHeight: '420px',
              }}
            >
              <img
                src={activeImage}
                alt={prompt}
                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md text-xs font-bold text-white flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Tap to expand</span>
                </span>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 italic">
              &quot;{prompt}&quot;
            </p>
          </div>
        )}

        {/* Recent Session Gallery */}
        {history.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <h2 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span>Creation History ({history.length})</span>
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setActiveImage(item.dataUrl);
                    setPrompt(item.prompt);
                  }}
                  className="group relative rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-fuchsia-500/60 aspect-square cursor-pointer transition-all shadow-md"
                >
                  <img src={item.dataUrl} alt={item.prompt} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
                    <p className="text-[10px] text-zinc-200 line-clamp-2 font-medium">{item.prompt}</p>
                    <span className="text-[9px] text-fuchsia-400 font-bold">{item.styleName}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Lightbox Modal */}
      {fullscreenImage && (
        <div
          onClick={() => setFullscreenImage(null)}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4"
        >
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(fullscreenImage, prompt || 'art');
              }}
              className="p-2 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => setFullscreenImage(null)}
              className="p-2 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <img
            src={fullscreenImage}
            alt="Fullscreen view"
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
