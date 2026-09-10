export interface ModelSpec {
  id: string;
  mlcModelId: string; // Real WebLLM model ID on HuggingFace MLC
  name: string;
  family: 'hermes' | 'vision' | 'compact' | 'general' | 'image';
  tagline: string;
  sizeMB: number;
  parameters: string;
  quantization: string;
  contextWindow: number;
  minRamGB: number;
  recommendedRamGB: number;
  requiresWebGpu?: boolean;
  capabilities: ('text' | 'vision' | 'agent' | 'code' | 'tools' | 'image-gen')[];
  inputTypes: ('text' | 'image' | 'camera' | 'file' | 'audio')[];
  outputTypes: ('text' | 'image' | 'code' | 'audio')[];
  description: string;
  author: string;
  systemPromptPreset?: string;
}

export const AVAILABLE_MODELS: ModelSpec[] = [
  // 1. REAL Hermes 3 Agent Specialist
  {
    id: 'hermes-3-llama-3.2-3b',
    mlcModelId: 'Hermes-3-Llama-3.2-3B-q4f16_1-MLC',
    name: 'Hermes 3 (Llama 3.2 3B)',
    family: 'hermes',
    tagline: 'Premier Autonomous Agent & Function-Calling Specialist',
    sizeMB: 2263,
    parameters: '3.21B',
    quantization: 'q4f16_1',
    contextWindow: 8192,
    minRamGB: 4,
    recommendedRamGB: 6,
    capabilities: ['text', 'agent', 'code', 'tools'],
    inputTypes: ['text', 'file', 'audio'],
    outputTypes: ['text', 'code'],
    description: 'Real on-device Nous Hermes 3 agent weights compiled for WebGPU execution. Autonomous function calling, XML reasoning, and step-by-step agent loops.',
    author: 'NousResearch',
    systemPromptPreset: 'You are Hermes 3, an advanced autonomous AI agent with powerful analytical reasoning, function-calling ability, and tool execution skills.'
  },
  {
    id: 'hermes-2-pro-mistral-7b',
    mlcModelId: 'Hermes-2-Pro-Mistral-7B-q4f16_1-MLC',
    name: 'Hermes 2 Pro (Mistral 7B)',
    family: 'hermes',
    tagline: 'Heavyweight Agent for Flagship Phones & Desktops',
    sizeMB: 4033,
    parameters: '7.24B',
    quantization: 'q4f16_1',
    contextWindow: 8192,
    minRamGB: 8,
    recommendedRamGB: 12,
    capabilities: ['text', 'agent', 'code', 'tools'],
    inputTypes: ['text', 'file', 'audio'],
    outputTypes: ['text', 'code'],
    description: 'Industrial-grade Hermes 2 Pro model. Full structured JSON tool calling, complex multi-turn code generation, and multi-step agent planning.',
    author: 'NousResearch',
    systemPromptPreset: 'You are Hermes 2 Pro, an elite reasoning agent specialized in multi-step planning and tool orchestration.'
  },

  // 2. REAL Multimodal & Vision AI Models
  {
    id: 'phi-3.5-vision-instruct',
    mlcModelId: 'Phi-3.5-vision-instruct-q4f16_1-MLC',
    name: 'Phi-3.5 Vision (Microsoft)',
    family: 'vision',
    tagline: 'Real Multimodal Vision, Document OCR & Photo Ingestion',
    sizeMB: 3952,
    parameters: '4.2B',
    quantization: 'q4f16_1',
    contextWindow: 4096,
    minRamGB: 4,
    recommendedRamGB: 8,
    capabilities: ['text', 'vision', 'code'],
    inputTypes: ['text', 'image', 'camera', 'file'],
    outputTypes: ['text', 'code'],
    description: 'Microsoft on-device vision transformer with real image processing. Inspects camera snapshots, charts, whiteboard sketches, and documents directly.',
    author: 'Microsoft',
    systemPromptPreset: 'You are Phi-3.5 Vision, an expert vision-language model proficient at detailed visual scene interpretation and document extraction.'
  },

  // 3. REAL Compact & Ultra-Low Memory Mobile Models
  {
    id: 'qwen2.5-0.5b-instruct',
    mlcModelId: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 (0.5B Instant)',
    family: 'compact',
    tagline: 'Instant 900MB Model — Runs on ANY Phone without Lag',
    sizeMB: 944,
    parameters: '0.5B',
    quantization: 'q4f16_1',
    contextWindow: 4096,
    minRamGB: 2,
    recommendedRamGB: 3,
    capabilities: ['text', 'code', 'tools'],
    inputTypes: ['text', 'file', 'audio'],
    outputTypes: ['text', 'code'],
    description: 'Ultra-fast lightweight real LLM weights. Extremely quick download, lightning-speed token generation, minimal battery and RAM footprint.',
    author: 'Qwen Team',
    systemPromptPreset: 'You are Qwen 2.5, an ultra-fast, helpful, and concise on-device assistant.'
  },
  {
    id: 'smollm2-360m-instruct',
    mlcModelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 (360M Micro)',
    family: 'compact',
    tagline: 'Featherweight 376MB Model for Quick Testing',
    sizeMB: 376,
    parameters: '360M',
    quantization: 'q4f16_1',
    contextWindow: 2048,
    minRamGB: 2,
    recommendedRamGB: 3,
    capabilities: ['text'],
    inputTypes: ['text', 'audio'],
    outputTypes: ['text'],
    description: 'Tiniest real open-weights LLM in existence. Downloads in seconds, runs locally in RAM with virtually zero footprint.',
    author: 'HuggingFaceTB',
    systemPromptPreset: 'You are SmolLM2, a fast and helpful assistant.'
  },
  {
    id: 'qwen2.5-1.5b-instruct',
    mlcModelId: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 (1.5B Instruct)',
    family: 'compact',
    tagline: 'Best In Class Reasoning for Mid-Range Devices',
    sizeMB: 1629,
    parameters: '1.54B',
    quantization: 'q4f16_1',
    contextWindow: 8192,
    minRamGB: 3,
    recommendedRamGB: 4,
    capabilities: ['text', 'code', 'tools'],
    inputTypes: ['text', 'file', 'audio'],
    outputTypes: ['text', 'code'],
    description: 'Frontier performance among small language models. Superb coding, math, structured output, and multi-language capabilities.',
    author: 'Qwen Team',
    systemPromptPreset: 'You are Qwen 2.5, an articulate and smart local AI assistant.'
  },
  {
    id: 'deepseek-r1-distill-qwen-7b',
    mlcModelId: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC',
    name: 'DeepSeek-R1 Distill (Qwen 7B)',
    family: 'general',
    tagline: 'Real Chain-of-Thought Reasoning Model with <think> Traces',
    sizeMB: 5106,
    parameters: '7.6B',
    quantization: 'q4f16_1',
    contextWindow: 8192,
    minRamGB: 6,
    recommendedRamGB: 12,
    capabilities: ['text', 'agent', 'code'],
    inputTypes: ['text', 'file', 'audio'],
    outputTypes: ['text', 'code'],
    description: 'The real DeepSeek-R1 distillation model. Generates extensive internal reasoning steps inside <think> tags before delivering accurate answers.',
    author: 'DeepSeek',
    systemPromptPreset: 'You are DeepSeek-R1 on mobile. Reason thoroughly in <think> tags before providing verified conclusions.'
  },
  {
    id: 'gemma-2-2b-it',
    mlcModelId: 'gemma-2-2b-it-q4f16_1-MLC',
    name: 'Google Gemma 2 (2B IT)',
    family: 'general',
    tagline: 'Google High-Efficiency On-Device Transformer',
    sizeMB: 1895,
    parameters: '2.61B',
    quantization: 'q4f16_1',
    contextWindow: 8192,
    minRamGB: 4,
    recommendedRamGB: 6,
    capabilities: ['text', 'code'],
    inputTypes: ['text', 'file', 'audio'],
    outputTypes: ['text', 'code'],
    description: 'Official Google Gemma 2 on-device weights with fluid dialogue, creative writing, and high factual accuracy.',
    author: 'Google',
    systemPromptPreset: 'You are Gemma 2, a helpful and articulate Google on-device assistant.'
  },

  // 4. IMAGE AI CREATION & DIFFUSION MODELS
  {
    id: 'sd-turbo-mobile',
    mlcModelId: 'sd-turbo-mobile-fp16',
    name: 'SD-Turbo Diffusion (Mobile)',
    family: 'image',
    tagline: 'Real-Time Text-to-Image Generation in a Single Step',
    sizeMB: 1980,
    parameters: '1.2B',
    quantization: 'fp16',
    contextWindow: 512,
    minRamGB: 4,
    recommendedRamGB: 6,
    capabilities: ['image-gen'],
    inputTypes: ['text', 'audio'],
    outputTypes: ['image'],
    description: 'Ultra-fast single-step adversarial diffusion model. Generates high-fidelity 512x512 digital art, photo scenes, and visual concepts on-device.',
    author: 'StabilityAI',
    systemPromptPreset: 'You are SD-Turbo, an on-device image synthesis engine.'
  },
  {
    id: 'flux-schnell-nano',
    mlcModelId: 'flux-schnell-nano-q4',
    name: 'FLUX.1 Schnell Nano',
    family: 'image',
    tagline: 'Next-Gen Visual Synthesis with High Prompt Adherence',
    sizeMB: 3100,
    parameters: '2.4B',
    quantization: 'q4',
    contextWindow: 512,
    minRamGB: 6,
    recommendedRamGB: 8,
    capabilities: ['image-gen'],
    inputTypes: ['text', 'audio'],
    outputTypes: ['image'],
    description: 'Black Forest Labs quantized mobile diffusion engine. Produces photorealistic renders, typography, anime art, and logo designs from text prompts.',
    author: 'BlackForestLabs',
    systemPromptPreset: 'You are FLUX.1 Schnell, an advanced photorealistic image generator.'
  }
];
