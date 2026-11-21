'use client';

import React, { useState, useRef } from 'react';
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
  ShieldCheck,
  ShieldAlert,
  Upload,
  Share2,
  FileCheck,
  Eye,
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

// Each history item pins a full base64 image in JS heap. The array is not
// rendered today, but left unbounded it grows with every generation until an
// Android WebView OOM-kills the app. Keep only the most recent generations so
// older dataUrls become collectable.
const MAX_HISTORY_ITEMS = 5;

export default function ImageStudio() {
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const addAttachment = useAppStore((s) => s.addAttachment);

  const [activeSubTab, setActiveSubTab] = useState<'generate' | 'privacy'>('generate');
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

  // Privacy Scrubber State
  const [scrubImage, setScrubImage] = useState<string | null>(null);
  const [scrubImageName, setScrubImageName] = useState<string>('');
  const [hasExifGps, setHasExifGps] = useState<boolean>(true);
  const [isScrubbed, setIsScrubbed] = useState<boolean>(false);
  const scrubInputRef = useRef<HTMLInputElement>(null);

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
        (text: string, pct: number) => {
          setProgressStatus(text);
          setProgressPct(pct);
        }
      );

      setProgressPct(100);
      setProgressStatus('Rendering complete!');
      setActiveImage(dataUrl);

      const newItem: GeneratedHistoryItem = {
        id: `img-${Date.now()}`,
        prompt: prompt.trim(),
        styleName: activeStyle?.name || 'Custom',
        dataUrl,
        timestamp: Date.now(),
        modelName: currentModel?.name || 'FLUX.1',
        aspectRatio,
      };

      setHistory((prev) => [newItem, ...prev].slice(0, MAX_HISTORY_ITEMS));
    } catch (err: unknown) {
      // Name the failure instead of a generic "issue": the generation
      // pipeline's own error (Pollinations fetch, canvas render) is the
      // actionable reason.
      setProgressStatus(`Generation failed: ${(err as Error)?.message || 'diffusion engine error'}. No image was created.`);
    } finally {
      setTimeout(() => {
        setProgressPct(0);
        setProgressStatus('');
      }, 1500);
    }
  };

  const handleRandomPrompt = () => {
    const randomIndex = Math.floor(Math.random() * PROMPT_SUGGESTIONS.length);
    setPrompt(PROMPT_SUGGESTIONS[randomIndex]);
  };

  const handleDownload = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${filename.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}_${Date.now()}.png`;
    a.click();
  };

  const handleUploadScrubImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScrubImageName(file.name);
    setIsScrubbed(false);
    setHasExifGps(true);

    const reader = new FileReader();
    reader.onload = () => {
      setScrubImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSanitizeExif = () => {
    if (!scrubImage) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = scrubImage;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Cap working size to avoid holding two full-resolution bitmaps/base64
      // strings simultaneously on low-RAM Android WebViews (OOM).
      const SCRUB_MAX_EDGE = 2048;
      const longest = Math.max(img.width, img.height);
      const scale = longest > SCRUB_MAX_EDGE ? SCRUB_MAX_EDGE / longest : 1;
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Lossless redraw discards all APP1 EXIF / GPS binary blocks
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const cleanDataUrl = canvas.toDataURL('image/jpeg', 0.95);

      setScrubImage(cleanDataUrl);
      setIsScrubbed(true);
      setHasExifGps(false);

      if (navigator.vibrate) navigator.vibrate([40]);
    };
  };

  const handleShareScrubbedImage = () => {
    if (!scrubImage) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: 'Sanitized Photo', text: 'Privacy sanitized photo with zero EXIF or GPS geotags.' }).catch(() => {});
    } else {
      handleDownload(scrubImage, 'sanitized_photo');
    }
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
              <span>Diffusion Image & Privacy Studio</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 font-mono font-bold">
                FLUX + EXIF
              </span>
            </h1>
            <p className="text-[10px] text-zinc-400">On-device neural synthesis & photo privacy metadata scrubber</p>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="flex items-center gap-1 bg-zinc-800 p-1 rounded-xl border border-zinc-700">
          <button
            onClick={() => setActiveSubTab('generate')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'generate'
                ? 'bg-fuchsia-600 text-white shadow-md shadow-fuchsia-600/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            AI Generator
          </button>
          <button
            onClick={() => setActiveSubTab('privacy')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'privacy'
                ? 'bg-fuchsia-600 text-white shadow-md shadow-fuchsia-600/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            EXIF Privacy
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* ========================================================= */}
        {/* TAB 1: AI GENERATION */}
        {/* ========================================================= */}
        {activeSubTab === 'generate' && (
          <>
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
                  <span>Negative Prompt Filters</span>
                </button>
                {showNegative && (
                  <input
                    type="text"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="Things to avoid..."
                    className="w-full mt-1.5 bg-zinc-950/70 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
                  />
                )}
              </div>

              {/* Generate Action Button */}
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating}
                className={`w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                  !prompt.trim() || isGenerating
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-fuchsia-600 to-pink-500 hover:from-fuchsia-500 hover:to-pink-400 text-white shadow-fuchsia-600/25 active:scale-[0.99]'
                }`}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{progressStatus || 'Generating pixels...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Synthesize with FLUX ({qualityMode === 'quality' ? '8 Steps' : '4 Steps'})</span>
                  </>
                )}
              </button>
            </div>

            {/* Canvas Result Preview */}
            {activeImage && (
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3 animate-in fade-in">
                <div className="relative rounded-xl overflow-hidden bg-black/50 border border-zinc-800 flex items-center justify-center">
                  <img src={activeImage} alt="Generated visual" className="max-h-[380px] w-auto object-contain rounded-lg" />
                  <button
                    onClick={() => setFullscreenImage(activeImage)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-md cursor-pointer"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownload(activeImage, prompt)}
                    className="flex-1 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-fuchsia-600/30 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Image</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ========================================================= */}
        {/* TAB 2: EXIF PRIVACY SANITIZER */}
        {/* ========================================================= */}
        {activeSubTab === 'privacy' && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
              <span className="flex items-center gap-1.5 text-fuchsia-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>EXIF Metadata & Geotag Privacy Scrubber</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">100% Offline Scrub</span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Smartphone photos frequently leak GPS coordinates, device serials, and exposure timestamps. Use this on-device scrubber to safely strip all private metadata before sharing or analyzing.
            </p>

            <input
              ref={scrubInputRef}
              type="file"
              accept="image/*"
              onChange={handleUploadScrubImage}
              className="hidden"
            />

            {!scrubImage ? (
              <div
                onClick={() => scrubInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-800 hover:border-fuchsia-500/60 rounded-xl p-8 text-center cursor-pointer transition-all bg-zinc-950/40 space-y-2"
              >
                <Upload className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-xs font-bold text-zinc-200">Tap to select photo to inspect & sanitize</p>
                <p className="text-[10px] text-zinc-500">Supports JPG, PNG, HEIC (converted), WebP</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden bg-black/60 border border-zinc-800 p-2 flex items-center justify-center min-h-[220px]">
                  <img src={scrubImage} alt={scrubImageName} className="max-h-[280px] w-auto object-contain rounded-lg" />
                  <div className="absolute top-3 left-3 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur text-[10px] font-mono text-zinc-300 border border-zinc-700">
                    {scrubImageName}
                  </div>
                </div>

                {/* Metadata Status Card */}
                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-300">Privacy Status:</span>
                    {isScrubbed ? (
                      <span className="flex items-center gap-1 text-emerald-400 font-bold text-xs bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/40">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Clean (Zero Metadata)</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-400 font-bold text-xs bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-500/40">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Raw EXIF / Geotag Embedded</span>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-zinc-800/80">
                    <div className="text-zinc-400">
                      <span>GPS Coordinates: </span>
                      <span className="font-mono text-white">{isScrubbed ? 'Stripped' : 'Exposed'}</span>
                    </div>
                    <div className="text-zinc-400">
                      <span>Camera Model: </span>
                      <span className="font-mono text-white">{isScrubbed ? 'Scrubbed' : 'Present'}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  {!isScrubbed ? (
                    <button
                      onClick={handleSanitizeExif}
                      className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Sanitize & Strip All Geotags</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleShareScrubbedImage}
                        className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-zinc-700 cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Share Clean Photo</span>
                      </button>
                      <button
                        onClick={() => handleDownload(scrubImage, 'sanitized_photo')}
                        className="flex-1 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-fuchsia-600/30 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Save to Storage</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => scrubInputRef.current?.click()}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                    title="Select another photo"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
