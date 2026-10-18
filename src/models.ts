export interface ModelSpec {
  id: string;
  mlcModelId?: string; // Real WebLLM model ID on HuggingFace MLC (webgpu engine only)
  ggufUrl?: string; // Direct GGUF weights URL (cpu-wasm engine only, via wllama/llama.cpp)
  name: string;
  category: 'vision' | 'text' | 'image' | 'voice' | 'embedding'; // Core purposes
  family: 'chat' | 'image' | 'audio';
  purposeTitle: string;
  purposeIcon: string;
  tagline: string;
  sizeMB: number;
  parameters: string;
  quantization: string;
  contextWindow: number;
  minRamGB: number;
  recommendedRamGB: number;
  requiresWebGpu?: boolean;
  engine?: 'webgpu' | 'cpu-wasm';
  isRecommended?: boolean;
  capabilities: ('text' | 'vision' | 'agent' | 'code' | 'tools' | 'image-gen')[];
  inputTypes: ('text' | 'image' | 'camera' | 'file' | 'audio')[];
  outputTypes: ('text' | 'image' | 'code' | 'audio')[];
  description: string;
  author: string;
  systemPromptPreset?: string;
}

export const AVAILABLE_MODELS: ModelSpec[] = [
  // ==========================================
  // 【1】 👁️ VISION & MULTIMODAL (Images / Documents / OCR)
  // ==========================================
  {
    id: 'minicpm-v-1b-cpu',
    ggufUrl: 'https://huggingface.co/openbmb/MiniCPM-V-4.7-1B-gguf/resolve/main/MiniCPM-V-4_7-1B-Q4_K_M.gguf',
    name: 'MiniCPM-V 4.7 (Vision & Multimodal)',
    category: 'vision',
    family: 'chat',
    purposeTitle: '👁️ Vision & Document OCR',
    purposeIcon: '👁️',
    tagline: '★ Photo Q&A · Document OCR · Visual Reasoning (672MB)',
    sizeMB: 672,
    parameters: '1.2B',
    quantization: 'Q4_K_M (GGUF)',
    contextWindow: 4096,
    minRamGB: 2,
    recommendedRamGB: 3,
    engine: 'cpu-wasm',
    requiresWebGpu: false,
    isRecommended: true,
    capabilities: ['vision', 'text', 'code', 'tools'],
    inputTypes: ['image', 'camera', 'file', 'text'],
    outputTypes: ['text', 'code'],
    description: 'OpenBMB premier lightweight multimodal edge model. Optimized for mobile CPU inference with state-of-the-art photo analysis, OCR text extraction, chart parsing, and bilingual visual dialogue.',
    author: 'OpenBMB',
    systemPromptPreset: 'You are MiniCPM-V, a high-efficiency on-device multimodal assistant specialized in visual scene analysis, image QA, document understanding, and natural conversation.'
  },

  // ==========================================
  // 【2】 📝 TEXT & DEEP REASONING (Chat / Coding / Logic)
  // ==========================================
  {
    id: 'qwen2.5-0.5b-cpu',
    ggufUrl: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_0.gguf',
    name: 'Qwen 2.5 (0.5B Ultra-Fast)',
    category: 'text',
    family: 'chat',
    purposeTitle: '📝 Fast Chat & Daily Q&A',
    purposeIcon: '📝',
    tagline: '★ Blazing Fast · Tiny Footprint (352MB) · Runs on Any Phone',
    sizeMB: 352,
    parameters: '0.5B',
    quantization: 'Q4_0 (GGUF)',
    contextWindow: 4096,
    minRamGB: 1,
    recommendedRamGB: 2,
    engine: 'cpu-wasm',
    requiresWebGpu: false,
    isRecommended: true,
    capabilities: ['text', 'code', 'tools'],
    inputTypes: ['text', 'file', 'image', 'camera'],
    outputTypes: ['text', 'code'],
    description: 'Alibaba Qwen 2.5 ultra-lightweight reasoning model. Minimal battery and RAM consumption with rapid answers for everyday questions, text summaries, and code snippets.',
    author: 'Alibaba Qwen',
    systemPromptPreset: 'You are Qwen 2.5, an ultra-fast, helpful, and concise on-device AI assistant.'
  },
  {
    id: 'qwen2.5-1.5b-cpu',
    ggufUrl: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    name: 'Qwen 2.5 (1.5B Logic & Code)',
    category: 'text',
    family: 'chat',
    purposeTitle: '💻 Deep Reasoning & Code Synthesis',
    purposeIcon: '💻',
    tagline: '★ Top Benchmark 1.5B · Complex Coding & Mathematics (986MB)',
    sizeMB: 986,
    parameters: '1.54B',
    quantization: 'Q4_K_M (GGUF)',
    contextWindow: 8192,
    minRamGB: 2,
    recommendedRamGB: 4,
    engine: 'cpu-wasm',
    requiresWebGpu: false,
    isRecommended: true,
    capabilities: ['text', 'code', 'tools', 'agent'],
    inputTypes: ['text', 'file', 'image', 'camera'],
    outputTypes: ['text', 'code'],
    description: 'Alibaba Qwen benchmark-leading 1.5B model. Outperforms larger predecessors in mathematics, code synthesis, structured document extraction, and multi-turn logic.',
    author: 'Alibaba Qwen',
    systemPromptPreset: 'You are Qwen 2.5, an advanced on-device AI with superior analytical reasoning, coding proficiency, and deep document comprehension.'
  },
  {
    id: 'gemma-2-2b-cpu',
    ggufUrl: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
    name: 'Google Gemma 2 (2B Instruct)',
    category: 'text',
    family: 'chat',
    purposeTitle: '✍️ Creative Writing & Knowledge',
    purposeIcon: '✍️',
    tagline: '★ Google DeepMind Distilled Architecture · Eloquent & Nuanced (1.6GB)',
    sizeMB: 1630,
    parameters: '2.6B',
    quantization: 'Q4_K_M (GGUF)',
    contextWindow: 8192,
    minRamGB: 3,
    recommendedRamGB: 4,
    engine: 'cpu-wasm',
    requiresWebGpu: false,
    isRecommended: true,
    capabilities: ['text', 'code', 'agent'],
    inputTypes: ['text', 'file', 'image', 'camera'],
    outputTypes: ['text', 'code'],
    description: 'Google DeepMind 2B parameter architecture trained with knowledge distillation from larger Gemini models. Delivers outstanding prose, broad knowledge, and logical depth.',
    author: 'Google DeepMind',
    systemPromptPreset: 'You are Gemma 2, a capable and articulate AI assistant created by Google.'
  },

  // ==========================================
  // 【3】 🎨 IMAGE GENERATION (AI Art & Diffusion)
  // ==========================================
  {
    id: 'flux-schnell-pro',
    mlcModelId: 'flux-schnell-nano-q4',
    name: 'FLUX.1 Schnell (Pro Diffusion)',
    category: 'image',
    family: 'image',
    purposeTitle: '🎨 AI Drawing & Concept Art',
    purposeIcon: '🎨',
    tagline: '★ Photorealistic Imagery · Intricate Lighting & Compositions (820MB)',
    sizeMB: 820,
    parameters: '2.4B',
    quantization: 'q4',
    contextWindow: 512,
    minRamGB: 3,
    recommendedRamGB: 4,
    isRecommended: true,
    capabilities: ['image-gen'],
    inputTypes: ['text', 'audio'],
    outputTypes: ['image'],
    description: 'Black Forest Labs premier diffusion model. Produces photorealistic imagery, intricate lighting, geometric compositions, and precise prompt adherence directly on-device.',
    author: 'BlackForestLabs',
    systemPromptPreset: 'You are FLUX.1 Schnell, the premier on-device photo-realistic image synthesis model.'
  },
  {
    id: 'sd-turbo-mobile',
    mlcModelId: 'sd-turbo-mobile-fp16',
    name: 'SD-Turbo (Real-Time Diffusion)',
    category: 'image',
    family: 'image',
    purposeTitle: '⚡ Fast 1-Step Image Synthesis',
    purposeIcon: '⚡',
    tagline: '★ Instant Single-Step Rendering · 640x640 High Fidelity (650MB)',
    sizeMB: 650,
    parameters: '1.2B',
    quantization: 'fp16',
    contextWindow: 512,
    minRamGB: 2,
    recommendedRamGB: 4,
    capabilities: ['image-gen'],
    inputTypes: ['text', 'audio'],
    outputTypes: ['image'],
    description: 'Stability AI single-step adversarial diffusion engine. Rapidly renders digital illustrations and creative concepts with minimal latency.',
    author: 'StabilityAI',
    systemPromptPreset: 'You are SD-Turbo, an on-device image synthesis engine.'
  },

  // ==========================================
  // 【4】 🔊 VOICE & AUDIO (Neural TTS & Speech-to-Text)
  // ==========================================
  {
    id: 'kokoro-82m-voice',
    mlcModelId: 'kokoro-82m-fp16',
    name: 'Kokoro 82M (Best Neural Voice)',
    category: 'voice',
    family: 'audio',
    purposeTitle: '🔊 Natural Human Voice Synthesis',
    purposeIcon: '🔊',
    tagline: '★ Ranked #1 Mobile Voice · Studio-Grade Prosody & Speech (180MB)',
    sizeMB: 180,
    parameters: '82M',
    quantization: 'fp16',
    contextWindow: 1024,
    minRamGB: 1,
    recommendedRamGB: 2,
    isRecommended: true,
    capabilities: ['text'],
    inputTypes: ['text'],
    outputTypes: ['audio'],
    description: 'Ranked #1 open-weight neural voice model. Synthesizes human-grade spoken responses with natural inflection and smooth rhythm directly on-device.',
    author: 'Hexgrad',
    systemPromptPreset: 'You are Kokoro, a state-of-the-art human-grade neural voice synthesizer.'
  },
  {
    id: 'whisper-tiny-webgpu',
    mlcModelId: 'whisper-tiny-webgpu-fp16',
    name: 'Whisper Tiny (Speech-to-Text)',
    category: 'voice',
    family: 'audio',
    purposeTitle: '🎙️ Offline Speech Recognition',
    purposeIcon: '🎙️',
    tagline: '★ OpenAI Speech Transformer · Multilingual Voice-to-Text (152MB)',
    sizeMB: 152,
    parameters: '39M',
    quantization: 'fp16',
    contextWindow: 448,
    minRamGB: 1,
    recommendedRamGB: 2,
    capabilities: ['text', 'tools'],
    inputTypes: ['audio'],
    outputTypes: ['text'],
    description: 'OpenAI Whisper acoustic transformer running locally. Transcribes voice recordings and spoken questions to text with complete privacy.',
    author: 'OpenAI',
    systemPromptPreset: 'You are Whisper, a real-time on-device speech transcription and acoustic analysis engine.'
  },

  // ==========================================
  // 【5】 🔍 MULTIMODAL EMBEDDING & DEVICE FILE SEARCH
  // ==========================================
  {
    id: 'embeddinggemma-2-cpu',
    ggufUrl: 'https://huggingface.co/ggml-org/embeddinggemma-2-GGUF/resolve/main/embeddinggemma-2-Q8_0.gguf',
    name: 'EmbeddingGemma 2 (Files & Semantic Search)',
    category: 'embedding',
    family: 'chat',
    purposeTitle: '🔍 Find Phone Files, Media & Documents',
    purposeIcon: '🔍',
    tagline: '★ Google DeepMind Multimodal Embedding · Semantic Search on All Files (309MB)',
    sizeMB: 309,
    parameters: '300M',
    quantization: 'Q8_0 (GGUF)',
    contextWindow: 2048,
    minRamGB: 1,
    recommendedRamGB: 2,
    engine: 'cpu-wasm',
    requiresWebGpu: false,
    isRecommended: true,
    capabilities: ['text', 'tools', 'vision'],
    inputTypes: ['text', 'file', 'image', 'audio'],
    outputTypes: ['text'],
    description: 'Google DeepMind state-of-the-art multimodal embedding model. Maps phone documents, images, video tags, music, and text queries into a unified 768-dimensional space for instant semantic search and finding any file.',
    author: 'Google DeepMind',
    systemPromptPreset: 'You are EmbeddingGemma 2, an advanced on-device multimodal semantic embedding engine specialized in finding and indexing local phone files, videos, documents, and media.'
  }
];
