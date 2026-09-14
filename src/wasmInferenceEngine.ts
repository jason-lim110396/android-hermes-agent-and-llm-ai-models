import { AVAILABLE_MODELS } from './models';
import type { Wllama } from '@wllama/wllama/esm/index.js';

// Pure CPU (WebAssembly) inference backend via @wllama/wllama v3 (llama.cpp compiled to WASM).
// Uses the v3 API: Wllama.loadModelFromUrl() for download+load,
// and Wllama.createChatCompletion() with onData for streaming.

export interface WasmProgressReport {
  progress: number; // 0..1
  timeElapsed: number;
  text: string;
}

// In Capacitor Android WebView, window.location.origin is "http://localhost" or "capacitor://localhost".
// Using a relative path resolving against document.baseURI guarantees the wasm asset loads reliably.
function getWllamaWasmUrl(): string {
  if (typeof window !== 'undefined') {
    return new URL('/wllama/wllama.wasm', window.location.href).href;
  }
  return '/wllama/wllama.wasm';
}

let activeWllama: Wllama | null = null;
let currentLoadedGgufUrl: string | null = null;

// Mutex to prevent concurrent init/unload races
let engineInitLock: Promise<void> = Promise.resolve();
let engineInitLockResolve: (() => void) | null = null;

function acquireEngineInitLock(): Promise<void> {
  const prev = engineInitLock;
  let resolve!: () => void;
  engineInitLock = new Promise<void>((r) => { resolve = r; });
  engineInitLockResolve = resolve;
  return prev;
}

function releaseEngineInitLock(): void {
  if (engineInitLockResolve) {
    engineInitLockResolve();
    engineInitLockResolve = null;
  }
}

let cpuInferenceAborted = false;

export function abortActiveCpuInference(): void {
  cpuInferenceAborted = true;
  // Wllama v3 doesn't expose an abort method on inference — we use the flag
}

// Check if a CPU model is cached in the browser's storage (via wllama ModelManager)
export async function isCpuModelCached(modelId: string): Promise<boolean> {
  try {
    const spec = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!spec?.ggufUrl) return false;

    const { Wllama } = await import('@wllama/wllama/esm/index.js');
    const wasmUrl = getWllamaWasmUrl();
    // Create a lightweight Wllama instance just to check cache status
    const tempWllama = new Wllama({ default: wasmUrl });
    const models = await tempWllama.modelManager.getModels();
    const found = models.find((m: any) => m.url === spec.ggufUrl);
    if (!found) return false;
    return found.validate() === 'valid';
  } catch (err) {
    console.warn('CPU (WASM) cache check failed:', err);
    return false;
  }
}

// Download CPU model weights only (no inference engine load)
export async function downloadCpuModelWeights(
  modelId: string,
  onProgress?: (report: WasmProgressReport) => void
): Promise<void> {
  const spec = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!spec?.ggufUrl) throw new Error(`No GGUF URL configured for model "${modelId}"`);

  const { Wllama } = await import('@wllama/wllama/esm/index.js');
  const wasmUrl = getWllamaWasmUrl();
  const tempWllama = new Wllama({ default: wasmUrl });
  await tempWllama.modelManager.downloadModel(
    { url: spec.ggufUrl },
    {
      progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
        if (onProgress && total > 0) {
          onProgress({ progress: loaded / total, timeElapsed: 0, text: `Downloading ${spec.name} (CPU weights)...` });
        }
      },
    }
  );
}

// Delete a CPU model from the browser cache
export async function deleteCpuModelFromCache(modelId: string): Promise<void> {
  try {
    const spec = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!spec?.ggufUrl) return;

    // Unload active engine if it was this model
    if (activeWllama && currentLoadedGgufUrl === spec.ggufUrl) {
      const prev = activeWllama;
      activeWllama = null;
      currentLoadedGgufUrl = null;
      try { await prev.exit(); } catch (_) {}
    }

    const { Wllama } = await import('@wllama/wllama/esm/index.js');
    const wasmUrl = getWllamaWasmUrl();
    const tempWllama = new Wllama({ default: wasmUrl });
    const models = await tempWllama.modelManager.getModels();
    const found = models.find((m: any) => m.url === spec.ggufUrl);
    if (found) await found.remove();
  } catch (err) {
    console.warn('CPU (WASM) cache deletion failed:', err);
  }
}

// Get or initialize a Wllama engine with the given model loaded for inference
async function getOrInitWllamaEngine(
  modelId: string,
  onProgress?: (report: WasmProgressReport) => void
): Promise<Wllama> {
  const spec = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!spec?.ggufUrl) throw new Error(`No GGUF URL configured for model "${modelId}"`);

  // Fast path: same model already loaded
  if (activeWllama && currentLoadedGgufUrl === spec.ggufUrl) {
    return activeWllama;
  }

  await acquireEngineInitLock();
  try {
    // Re-check after acquiring lock
    if (activeWllama && currentLoadedGgufUrl === spec.ggufUrl) {
      return activeWllama;
    }

    const { Wllama } = await import('@wllama/wllama/esm/index.js');

    // Fully exit the previous engine first
    if (activeWllama) {
      const prev = activeWllama;
      activeWllama = null;
      currentLoadedGgufUrl = null;
      try { await prev.exit(); } catch (_) {}
    }

    const wasmUrl = getWllamaWasmUrl();

    // Dynamically optimize threads for phone CPU cores
    const mobileThreads = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? Math.max(2, Math.min(4, Math.floor(navigator.hardwareConcurrency * 0.75)))
      : 2;

    // Create the wllama instance with multi-thread support if available
    const wllama = new Wllama(
      { default: wasmUrl },
      {
        // wllama will auto-detect if multi-thread is available
        allowOffline: true,
      }
    );

    if (onProgress) onProgress({ progress: 0.1, timeElapsed: 0, text: `Preparing CPU runtime for ${spec.name}...` });

    // Use loadModelFromUrl — this downloads (if not cached) AND loads the model into the WASM engine
    await wllama.loadModelFromUrl(
      { url: spec.ggufUrl },
      {
        // Context and performance settings
        n_ctx: Math.min(spec.contextWindow || 2048, 2048),
        n_threads: mobileThreads,
        n_gpu_layers: 0, // pure CPU
        useCache: true,  // use browser cache if available
        progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
          if (onProgress && total > 0) {
            const pct = loaded / total;
            onProgress({
              progress: 0.1 + pct * 0.85,
              timeElapsed: 0,
              text: pct < 1
                ? `Downloading ${spec.name} (${Math.round(pct * 100)}%)...`
                : `Loading ${spec.name} into CPU runtime...`,
            });
          }
        },
      }
    );

    if (onProgress) onProgress({ progress: 1.0, timeElapsed: 0, text: `${spec.name} ready!` });

    activeWllama = wllama;
    currentLoadedGgufUrl = spec.ggufUrl;
    return wllama;
  } finally {
    releaseEngineInitLock();
  }
}

export async function callCpuLLMInference({
  messages,
  modelId,
  systemPrompt,
  temperature = 0.7,
  maxTokens = 512,
  onProgress,
  onStreamChunk,
}: {
  messages: { role: string; content: string }[];
  modelId: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  onProgress?: (text: string, pct: number) => void;
  onStreamChunk: (chunk: string) => void;
}): Promise<string> {
  const spec = AVAILABLE_MODELS.find((m) => m.id === modelId);
  cpuInferenceAborted = false;

  try {
    if (onProgress) onProgress('Initializing Universal CPU inference engine...', 5);

    const wllama = await getOrInitWllamaEngine(modelId, (report) => {
      if (cpuInferenceAborted) return;
      if (onProgress) onProgress(report.text, Math.round(report.progress * 100));
    });

    if (cpuInferenceAborted) throw new Error('Task stopped by user');

    // Build messages in the format wllama expects
    const formattedMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map((m) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    let fullGenerated = '';

    // Use createChatCompletion with stream:true and onData callback for true streaming
    await wllama.createChatCompletion({
      messages: formattedMessages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      onData: (chunk: any) => {
        if (cpuInferenceAborted) return;
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullGenerated += delta;
          onStreamChunk(fullGenerated);
        }
      },
    });

    return fullGenerated;
  } catch (err: any) {
    if (cpuInferenceAborted || err?.name === 'AbortError' || err?.name === 'WllamaAbortError') {
      throw new Error('Task stopped by user');
    }
    console.error('CPU (WASM) inference error:', err);
    const errorMsg = err?.message || String(err);
    const errorDisplay = `⚠️ **CPU (WASM) Inference Error**\n\n` +
      `Unable to run local CPU model **${spec?.name || modelId}**:\n` +
      `> \`${errorMsg}\`\n\n` +
      `**Diagnostic**: This model runs on pure CPU via WebAssembly and never touches WebGPU. ` +
      `If the model failed to load, it may need to be re-downloaded — try deleting and re-downloading it in the Model Hub.`;
    onStreamChunk(errorDisplay);
    return errorDisplay;
  }
}
