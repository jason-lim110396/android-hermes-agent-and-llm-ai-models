import { AVAILABLE_MODELS } from './models';
import { loadKnowledgeDocs } from '@/utils/knowledgeBase';
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

// Mutex to prevent concurrent init/unload races.
//
// Each acquisition enqueues its OWN resolver; a single overwritten "current"
// resolver slot would release the wrong waiter and deadlock the rest (stuck
// model switch / delete). A FIFO pairs every acquire with exactly one release.
let engineInitLock: Promise<void> = Promise.resolve();
const engineInitLockQueue: Array<() => void> = [];

function acquireEngineInitLock(): Promise<void> {
  const prev = engineInitLock;
  let resolve!: () => void;
  engineInitLock = new Promise<void>((r) => { resolve = r; });
  engineInitLockQueue.push(resolve);
  return prev;
}

function releaseEngineInitLock(): void {
  const resolve = engineInitLockQueue.shift();
  if (resolve) resolve();
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
    // Create a throwaway Wllama instance just to check cache status. A Wllama
    // instance spins up a Web Worker + WASM runtime; without exit() it stays
    // alive (its message port retains it) and leaks ~tens of MB per call.
    // checkCacheStatus() calls this once per CPU model on mount and on Model Hub
    // open, so leaving them un-exited OOM-kills low-RAM WebViews. Always exit.
    const tempWllama = new Wllama({ default: wasmUrl });
    try {
      const models = await tempWllama.modelManager.getModels();
      const found = models.find((m: any) => m.url === spec.ggufUrl);
      return found ? found.validate() === 'valid' : false;
    } finally {
      try { await tempWllama.exit(); } catch (_) {}
    }
  } catch (err) {
    console.warn('CPU (WASM) cache check failed:', err);
    return false;
  }
}

let cpuDownloadAborted = false;

export function abortActiveCpuDownloads(): void {
  cpuDownloadAborted = true;
}

// Download CPU model weights only (no inference engine load)
export async function downloadCpuModelWeights(
  modelId: string,
  onProgress?: (report: WasmProgressReport) => void
): Promise<void> {
  cpuDownloadAborted = false;
  const spec = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!spec?.ggufUrl) throw new Error(`No GGUF URL configured for model "${modelId}"`);

  const { Wllama } = await import('@wllama/wllama/esm/index.js');
  const wasmUrl = getWllamaWasmUrl();
  const tempWllama = new Wllama({ default: wasmUrl });
  try {
    await tempWllama.modelManager.downloadModel(
      { url: spec.ggufUrl },
      {
        progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
          if (cpuDownloadAborted) {
            throw new Error('Download stopped by user');
          }
          if (onProgress && total > 0) {
            onProgress({ progress: loaded / total, timeElapsed: 0, text: `Downloading ${spec.name} (CPU weights)...` });
          }
        },
      }
    );
  } finally {
    // The download only needs the modelManager; release the WASM worker/runtime
    // so a completed or cancelled download does not leak a Wllama instance.
    try { await tempWllama.exit(); } catch (_) {}
  }
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
    try {
      const models = await tempWllama.modelManager.getModels();
      const found = models.find((m: any) => m.url === spec.ggufUrl);
      if (found) await found.remove();
    } finally {
      try { await tempWllama.exit(); } catch (_) {}
    }
  } catch (err) {
    console.warn('CPU (WASM) cache deletion failed:', err);
  }
}

// Unload active CPU WASM engine and free RAM immediately
export async function unloadWllamaEngine(): Promise<void> {
  await acquireEngineInitLock();
  try {
    if (activeWllama) {
      const prev = activeWllama;
      activeWllama = null;
      currentLoadedGgufUrl = null;
      try {
        await prev.exit();
      } catch (_) {}
    }
  } finally {
    releaseEngineInitLock();
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
    if (onProgress) onProgress({ progress: 1.0, timeElapsed: 0, text: `${spec.name} ready!` });
    return activeWllama;
  }

  await acquireEngineInitLock();
  try {
    // Re-check after acquiring lock
    if (activeWllama && currentLoadedGgufUrl === spec.ggufUrl) {
      if (onProgress) onProgress({ progress: 1.0, timeElapsed: 0, text: `${spec.name} ready!` });
      return activeWllama;
    }

    const { Wllama } = await import('@wllama/wllama/esm/index.js');

    // Fully exit and release previous engine and memory first
    if (activeWllama) {
      const prev = activeWllama;
      activeWllama = null;
      currentLoadedGgufUrl = null;
      try { await prev.exit(); } catch (_) {}
      await new Promise((r) => setTimeout(r, 60));
    }

    const wasmUrl = getWllamaWasmUrl();

    // Dynamically optimize threads for phone CPU cores (cap at 4 for battery/thermal stability)
    const mobileThreads = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? Math.max(2, Math.min(4, Math.floor(navigator.hardwareConcurrency * 0.75)))
      : 2;

    if (onProgress) onProgress({ progress: 0.1, timeElapsed: 0, text: `Initializing CPU runtime for ${spec.name}...` });

    // Create the wllama instance with allowOffline to prefer cached weights
    const wllama = new Wllama(
      { default: wasmUrl },
      {
        allowOffline: true,
      }
    );

    // Fast check if model weights already exist in local browser cache
    let isCached = false;
    try {
      const cachedModels = await wllama.modelManager.getModels();
      const existing = cachedModels.find((m: any) => m.url === spec.ggufUrl);
      isCached = Boolean(existing && existing.validate() === 'valid');
    } catch (_) {}

    if (onProgress) {
      onProgress({
        progress: isCached ? 0.35 : 0.15,
        timeElapsed: 0,
        text: isCached ? `Loading ${spec.name} from fast local cache...` : `Fetching ${spec.name} weights...`,
      });
    }

    // Use loadModelFromUrl with useCache: true so cached models load instantly from disk/IndexedDB
    await wllama.loadModelFromUrl(
      { url: spec.ggufUrl },
      {
        n_ctx: Math.min(spec.contextWindow || 2048, 2048),
        n_threads: mobileThreads,
        n_gpu_layers: 0, // pure CPU
        useCache: true,
        progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
          if (onProgress && total > 0) {
            const pct = loaded / total;
            onProgress({
              progress: 0.15 + pct * 0.8,
              timeElapsed: 0,
              text: pct < 1
                ? `Downloading ${spec.name} (${Math.round(pct * 100)}%)...`
                : `Parsing & mounting ${spec.name} weights...`,
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

// Honest on-device knowledge search for embedding-model queries.
//
// The old version of this path fabricated a phone file index (hardcoded
// VID_/IMG_/PDF names that were never on the device), invented 768-d
// "cosine similarity" scores, and streamed them as if a model had scanned
// the user's storage - while never running the embedding model at all.
//
// This version searches the one real corpus the app actually has: the
// documents the user ingested in the File Search studio's knowledge base
// (persisted locally, shared via utils/knowledgeBase). Ranking is a
// deterministic term-overlap score, and the response says exactly that:
// nothing pretends to be an embedding computation or a storage scan.
function searchKnowledgeBaseResponse(userQuery: string, modelName: string): string {
  const docs = loadKnowledgeDocs();
  const header =
    `📚 **Local Knowledge Base Search**\n\n` +
    `Searched **${docs.length}** document${docs.length === 1 ? '' : 's'} ingested in your File Search knowledge base` +
    (userQuery.trim() ? ` for: *"${userQuery}"*.\n` : '.\n');

  if (!userQuery.trim()) {
    return (
      header +
      `\nAsk a question with some keywords and I will rank your ingested documents against it. ` +
      `(Deterministic keyword ranking - ${modelName} weights are not run for this search.)`
    );
  }

  const terms = Array.from(new Set(userQuery.toLowerCase().split(/\s+/).filter((t) => t.length > 2)));

  const scored = docs
    .map((doc) => {
      const titleLower = doc.title.toLowerCase();
      const contentLower = doc.content.toLowerCase();
      const matched: string[] = [];
      let score = 0;
      for (const term of terms) {
        const inTitle = titleLower.includes(term);
        const inContent = contentLower.includes(term);
        if (!inTitle && !inContent) continue;
        matched.push(term);
        score += (inTitle ? 2 : 0) + (inContent ? 1 : 0);
        if (inContent) {
          // A doc that mentions a term several times outranks one that
          // mentions it once; cap the bonus so one spammy doc cannot dominate.
          const occurrences = contentLower.split(term).length - 1;
          if (occurrences > 1) score += Math.min(occurrences - 1, 3);
        }
      }
      return { doc, matched, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return (
      header +
      `\nNo ingested document matched any keyword of the query. Ingest more text in the ` +
      `**File Search → Knowledge Base** tab and ask again.`
    );
  }

  let body = '';
  scored.slice(0, 3).forEach(({ doc, matched, score }, idx) => {
    // Best excerpt: the first content line containing a matched term.
    const excerptLine =
      doc.content.split('\n').find((line) => matched.some((t) => line.toLowerCase().includes(t))) ||
      doc.content.split('\n')[0] ||
      '';
    const trimmed = excerptLine.length > 240 ? excerptLine.slice(0, 240) + '…' : excerptLine;
    body +=
      `\n### ${idx + 1}. ${doc.title}\n` +
      `- **Category**: ${doc.category} • **Updated**: ${doc.lastUpdated}\n` +
      `- **Matched keywords**: ${matched.map((t) => `\`${t}\``).join(', ')} (match score ${score})\n` +
      `> ${trimmed}\n`;
  });

  return (
    header +
    body +
    `\n*(Deterministic keyword ranking over your locally stored documents - ${modelName} weights are not run for this search; no phone storage scan and no vector embeddings are involved.)*`
  );
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
    // Knowledge-search requests (embedding models) never touch the LLM
    // weights: answer them from the real, locally ingested knowledge base
    // before any engine load. The old path downloaded and mounted the GGUF
    // weights first - hundreds of MB and long startup - and then never used
    // them, because its "search" was a hardcoded fake file list.
    if (spec?.category === 'embedding' || modelId.includes('embeddinggemma')) {
      if (onProgress) onProgress('Searching the local knowledge base...', 30);
      const userQuery = messages[messages.length - 1]?.content || '';
      const resultText = searchKnowledgeBaseResponse(userQuery, spec?.name || modelId);
      if (cpuInferenceAborted) throw new Error('Task stopped by user');
      onStreamChunk(resultText);
      return resultText;
    }

    if (onProgress) onProgress('Loading model weights into memory...', 10);

    const wllama = await getOrInitWllamaEngine(modelId, (report) => {
      if (cpuInferenceAborted) return;
      if (onProgress) onProgress(report.text, Math.max(10, Math.round(report.progress * 100)));
    });

    if (cpuInferenceAborted) throw new Error('Task stopped by user');

    // Customize system prompt with each model's primary specialty
    let effectiveSystemPrompt = systemPrompt;
    if (spec?.id === 'minicpm-v-1b-cpu') {
      effectiveSystemPrompt = `${systemPrompt}\n[Role Specialization]: You are MiniCPM-V 4.7, an edge vision & multimodal intelligence. Excel at parsing visual details, OCR text extraction, photos, and camera scenes.`;
    } else if (spec?.id === 'qwen2.5-1.5b-cpu') {
      effectiveSystemPrompt = `${systemPrompt}\n[Role Specialization]: You are Qwen 2.5 1.5B, specialized in complex algorithms, code generation, mathematical analysis, and structured outputs.`;
    } else if (spec?.id === 'qwen2.5-0.5b-cpu') {
      effectiveSystemPrompt = `${systemPrompt}\n[Role Specialization]: You are Qwen 2.5 0.5B, ultra-fast concise mobile assistant. Deliver rapid, accurate, high-efficiency answers.`;
    } else if (spec?.id === 'gemma-2-2b-cpu') {
      effectiveSystemPrompt = `${systemPrompt}\n[Role Specialization]: You are Google Gemma 2, specialized in articulate writing, nuanced logic, factual synthesis, and creative explanations.`;
    }

    // Build messages in the format wllama expects
    const formattedMessages = [
      { role: 'system' as const, content: effectiveSystemPrompt },
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

    // wllama can resolve normally after a user stop (the onData handler just
    // stops emitting). Without this check the caller would treat the aborted
    // generation as a completed one and overwrite the stopped notice.
    if (cpuInferenceAborted) throw new Error('Task stopped by user');

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
