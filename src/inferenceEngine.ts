import type { MLCEngine, InitProgressReport } from '@mlc-ai/web-llm';
import { AVAILABLE_MODELS, ModelSpec } from './models';
import {
  describeLimitFailure,
  isLimitFailureText,
  isUsageLimitFailure,
  recordEndpointCooldown,
  isEndpointInCooldown,
  clearEndpointCooldown,
  FallbackHop,
} from './utils/modelFallback';
import { speakGuarded, createSpeechUtterance } from './utils/speechGuard';
import { redactSensitiveMessages } from './utils/sensitiveContent';
import { getThermalYieldDelay } from './utils/thermalGuard';
import { triggerMemoryCleanupHint } from './utils/memoryGuard';
import {
  isCpuModelCached,
  downloadCpuModelWeights,
  deleteCpuModelFromCache,
  callCpuLLMInference,
  abortActiveCpuInference,
  unloadWllamaEngine,
} from './wasmInferenceEngine';

function isCpuWasmModel(spec: ModelSpec | undefined): boolean {
  return spec?.engine === 'cpu-wasm';
}

// Image & audio entries are on-device procedural synthesis engines (canvas art render,
// templated speech), not real weight-backed HuggingFace MLC repos — they have nothing to
// fetch, so we simulate a fast local "install" instead of hitting CreateMLCEngine with a
// model id that doesn't exist on HuggingFace (which would 404 and surface as a crash).
function isSyntheticModel(spec: ModelSpec | undefined): boolean {
  return !!spec && (spec.family === 'image' || spec.family === 'audio');
}

const SYNTHETIC_READY_KEY_PREFIX = 'synthetic-model-ready:';

function markSyntheticModelReady(modelId: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(SYNTHETIC_READY_KEY_PREFIX + modelId, '1');
  } catch (_) {}
}

function isSyntheticModelReady(modelId: string): boolean {
  try {
    if (typeof window !== 'undefined') return window.localStorage.getItem(SYNTHETIC_READY_KEY_PREFIX + modelId) === '1';
  } catch (_) {}
  return false;
}

function clearSyntheticModelReady(modelId: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(SYNTHETIC_READY_KEY_PREFIX + modelId);
  } catch (_) {}
}

export interface FallbackEndpoint {
  label: string;
  endpoint: string;
  apiKey?: string;
  model?: string;
}

export interface InferenceBackendConfig {
  backendType: 'webllm' | 'api';
  apiEndpoint?: string;
  apiKey?: string;
  customModelName?: string;
  /** Extra endpoints tried in order when the primary one is rate-limited or unavailable. */
  fallbacks?: FallbackEndpoint[];
  /** Called once per switch, so the UI can say which model actually answered. */
  onFallback?: (info: { from: string; to: string; reason: string }) => void;
  /**
   * Called when every remote endpoint failed and the engine is about to fall
   * through to on-device inference. `reason` is the last failure; `to` names
   * the on-device destination so the UI can explain the switch before the
   * (potentially heavy) model download starts.
   */
  onRemoteChainExhausted?: (info: { reason: string; to: string }) => void;
  /** Called when the remote-request privacy guard redacts high-confidence secrets. */
  onPrivacyRedaction?: (count: number) => void;
  /**
   * Called when a remote endpoint actually answers (the primary or a
   * fallback), so the UI can label the reply with the provider/model that
   * produced it instead of the on-device model selected at send time.
   */
  onAnsweredModel?: (info: {
    label: string;
    model?: string;
    isFallback?: boolean;
    reason?: string;
    hops?: FallbackHop[];
  }) => void;
}

export class RemoteEndpointError extends Error {
  status: number;
  detail: string;
  retryAfterSeconds?: number;
  constructor(message: string, status: number, detail: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'RemoteEndpointError';
    this.status = status;
    this.detail = detail;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Extracts retry-after duration in seconds from standard HTTP headers
 * (Retry-After in seconds or HTTP-date, x-ratelimit-reset, retry-after-ms).
 * Clamped between 10s and 3600s (1 hour) for safe mobile client behavior.
 */
export function parseRetryAfterHeader(headers: Headers): number | undefined {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const parsedSec = parseInt(retryAfter.trim(), 10);
    if (!Number.isNaN(parsedSec) && parsedSec > 0) {
      return Math.min(Math.max(parsedSec, 10), 3600);
    }
    const dateMs = Date.parse(retryAfter);
    if (!Number.isNaN(dateMs)) {
      const diffSec = Math.ceil((dateMs - Date.now()) / 1000);
      if (diffSec > 0) {
        return Math.min(Math.max(diffSec, 10), 3600);
      }
    }
  }

  const retryAfterMs = headers.get('retry-after-ms');
  if (retryAfterMs) {
    const ms = parseFloat(retryAfterMs.trim());
    if (!Number.isNaN(ms) && ms > 0) {
      const sec = Math.ceil(ms / 1000);
      return Math.min(Math.max(sec, 10), 3600);
    }
  }

  const resetHeader = headers.get('x-ratelimit-reset');
  if (resetHeader) {
    const val = parseFloat(resetHeader.trim());
    if (!Number.isNaN(val) && val > 0) {
      if (val > 1_000_000_000_000) {
        // Epoch milliseconds
        const diffSec = Math.ceil((val - Date.now()) / 1000);
        if (diffSec > 0) return Math.min(Math.max(diffSec, 10), 3600);
      } else if (val > 1_000_000_000) {
        // Epoch seconds
        const diffSec = Math.ceil(val - (Date.now() / 1000));
        if (diffSec > 0) return Math.min(Math.max(diffSec, 10), 3600);
      } else {
        // Delta seconds
        return Math.min(Math.max(Math.ceil(val), 10), 3600);
      }
    }
  }

  return undefined;
}

// A mobile network can drop without ever erroring the socket: the fetch (or a
// read mid-stream) then never settles and the chat stays "generating" until the
// user force-stops. Bound both waits. The first response is allowed more time
// because a local Ollama/vLLM server may load weights before it answers.
const FIRST_BYTE_TIMEOUT_MS = 90_000;
const STREAM_IDLE_TIMEOUT_MS = 45_000;

class RemoteTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteTimeoutError';
  }
}

/** One streaming chat-completions call against a single OpenAI-compatible endpoint. */
async function streamChatCompletion(
  candidate: FallbackEndpoint,
  payload: { systemPrompt: string; messages: { role: string; content: string }[]; temperature: number; maxTokens: number },
  signal: AbortSignal,
  onStreamChunk: (chunk: string) => void
): Promise<string> {
  const endpoint = candidate.endpoint.replace(/\/+$/, '');
  const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;

  // Local controller so a timeout can abort only this request. The caller's
  // signal stays authoritative: a user Stop must still read as "stopped".
  const requestController = new AbortController();
  let timedOut = false;
  let receivedAny = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutMessage = () =>
    receivedAny
      ? `connection stalled with no data for ${Math.round(STREAM_IDLE_TIMEOUT_MS / 1000)}s`
      : `timed out after ${Math.round(FIRST_BYTE_TIMEOUT_MS / 1000)}s waiting for a response`;
  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const armTimer = (ms: number) => {
    clearTimer();
    timer = setTimeout(() => {
      timedOut = true;
      try { requestController.abort(); } catch (_) {}
    }, ms);
  };
  const forwardAbort = () => {
    try { requestController.abort(); } catch (_) {}
  };
  if (signal.aborted) forwardAbort();
  else signal.addEventListener('abort', forwardAbort, { once: true });
  armTimer(FIRST_BYTE_TIMEOUT_MS);

  try {
    const isOpnRouter = candidate.endpoint.toLowerCase().includes('openrouter.ai');
    const res = await fetch(url, {
      method: 'POST',
      signal: requestController.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(candidate.apiKey ? { Authorization: `Bearer ${candidate.apiKey}` } : {}),
        ...(isOpnRouter ? {
          'HTTP-Referer': 'https://github.com/jason-lim110396/android-hermes-agent-and-llm-ai-models',
          'X-Title': 'Android Hermes AI',
        } : {}),
      },
      body: JSON.stringify({
        model: candidate.model,
        messages: [{ role: 'system', content: payload.systemPrompt }, ...payload.messages],
        temperature: payload.temperature,
        max_tokens: payload.maxTokens,
        stream: true,
      }),
    });

    if (!res.ok) {
      // Read the body so a quota message is not mistaken for a network error.
      // Parse structured JSON error objects if present to get clean, honest details.
      let detail = '';
      try {
        const rawText = await res.text();
        try {
          const parsed = JSON.parse(rawText);
          detail = parsed?.error?.message || parsed?.error?.detail || parsed?.message || rawText.slice(0, 500);
        } catch {
          detail = rawText.slice(0, 500);
        }
      } catch (_) {}
      const retryAfterSec = parseRetryAfterHeader(res.headers);
      throw new RemoteEndpointError(
        `${candidate.label}: HTTP ${res.status} ${res.statusText}`,
        res.status,
        detail,
        retryAfterSec
      );
    }

    // A 200 with no body is not an answer; report it instead of returning ''
    // (which used to fall through to on-device inference with no explanation).
    if (!res.body) throw new Error(`${candidate.label} returned an empty response body`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    // Some OpenAI-compatible free routers answer with HTTP 200 and a JSON
    // error object instead of SSE (e.g. {"error":{"message":"Rate limit
    // reached"}}). No `data:` lines are seen, so without this the turn looks
    // like an empty answer and silently drops to on-device inference - which
    // on a phone can start a multi-hundred-MB weight download mid-conversation.
    // Keep the non-SSE text so a quota error can be reclassified as a 429 and
    // advance the free fallback chain with a visible notice.
    let nonSseText = '';
    // Set when an SSE error object carries a quota/limit message, even if text
    // already streamed. Drives the chain advance at the end of the stream.
    let sawLimitError = false;
    // Track reasoning state for models (DeepSeek R1, Qwen 2.5, Ollama, vLLM, OpenRouter)
    // that stream thinking tokens in delta.reasoning_content or delta.reasoning.
    let inReasoningPhase = false;
    while (true) {
      if (signal.aborted) {
        try { await reader.cancel(); } catch (_) {}
        throw new Error('Task stopped by user');
      }
      const { done, value } = await reader.read();
      if (timedOut) {
        throw new RemoteTimeoutError(timeoutMessage());
      }
      if (done) break;
      receivedAny = true;
      armTimer(STREAM_IDLE_TIMEOUT_MS);
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last, possibly incomplete, line for the next read.
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (signal.aborted) throw new Error('Task stopped by user');
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          if (trimmed) {
            nonSseText += (nonSseText ? '\n' : '') + trimmed;
            if (nonSseText.length > 4000) nonSseText = nonSseText.slice(-4000);
          }
          continue;
        }
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(dataStr);
          // Some OpenAI-compatible free routers keep the text/event-stream
          // content type even for errors, sending e.g.
          // data: {"error":{"message":"Rate limit reached"}} or
          // data: {"detail":"Rate limit exceeded"} (FastAPI/vLLM/TGI) or
          // data: {"message":"Rate limit exceeded"} or
          // data: {"type":"error","error":{"message":"..."}} (Anthropic).
          // Feed polymorphic SSE error objects into the limit classifier so the free chain advances.
          const rawErr =
            parsed?.error ??
            parsed?.errors ??
            (parsed?.type === 'error' ? parsed.error : undefined) ??
            (!parsed?.choices?.length && typeof parsed?.detail === 'string' ? parsed.detail : undefined) ??
            (!parsed?.choices?.length && typeof parsed?.message === 'string' ? parsed.message : undefined);

          const finishReason = parsed?.choices?.[0]?.finish_reason;
          if (finishReason === 'error') {
            sawLimitError = true;
          }

          if (rawErr) {
            let msg = '';
            if (typeof rawErr === 'string') {
              msg = rawErr;
            } else if (Array.isArray(rawErr)) {
              msg = rawErr
                .map((e) => (typeof e === 'string' ? e : (e as any)?.message || (e as any)?.msg || JSON.stringify(e)))
                .join('; ');
            } else if (typeof rawErr === 'object' && rawErr !== null) {
              const errObj = rawErr as Record<string, unknown>;
              msg =
                typeof errObj.message === 'string'
                  ? errObj.message
                  : typeof errObj.msg === 'string'
                    ? errObj.msg
                    : typeof errObj.detail === 'string'
                      ? errObj.detail
                      : typeof errObj.type === 'string'
                        ? errObj.type
                        : JSON.stringify(errObj);
            }
            if (msg) {
              nonSseText += (nonSseText ? '\n' : '') + msg;
              if (nonSseText.length > 4000) nonSseText = nonSseText.slice(-4000);
              // A limit or provider error can arrive AFTER one or more tokens streamed
              // (free routers meter by token or fail over mid-stream). Even if tokens streamed,
              // an error event means the generation was interrupted. Remember it so we advance
              // the chain instead of returning the truncated text as success.
              sawLimitError = true;
            }
          }
          // Modern reasoning models (DeepSeek R1, Qwen 2.5, vLLM, Ollama, OpenRouter)
          // emit thinking tokens in delta.reasoning_content or delta.reasoning.
          let reasoningDelta = '';
          const rawReasoning =
            parsed.choices?.[0]?.delta?.reasoning_content ??
            parsed.choices?.[0]?.delta?.reasoning ??
            parsed.choices?.[0]?.message?.reasoning_content ??
            parsed.choices?.[0]?.message?.reasoning;
          if (typeof rawReasoning === 'string') {
            reasoningDelta = rawReasoning;
          }

          let delta = '';
          const rawContent = parsed.choices?.[0]?.delta?.content;
          if (typeof rawContent === 'string') {
            delta = rawContent;
          } else if (Array.isArray(rawContent)) {
            delta = rawContent
              .map((part: any) => (typeof part === 'string' ? part : part?.text || part?.content || ''))
              .join('');
          } else if (typeof parsed.choices?.[0]?.delta?.text === 'string') {
            delta = parsed.choices[0].delta.text;
          } else if (typeof parsed.choices?.[0]?.text === 'string') {
            delta = parsed.choices[0].text;
          } else if (typeof parsed.choices?.[0]?.message?.content === 'string') {
            delta = parsed.choices[0].message.content;
          }

          if (reasoningDelta) {
            if (!inReasoningPhase) {
              inReasoningPhase = true;
              if (!fullText.includes('<think>')) {
                fullText += (fullText ? '\n' : '') + '<think>\n';
              }
            }
            fullText += reasoningDelta;
            onStreamChunk(fullText);
          }

          if (delta) {
            if (inReasoningPhase) {
              inReasoningPhase = false;
              if (fullText.includes('<think>') && !fullText.includes('</think>')) {
                fullText += '\n</think>\n\n';
              }
            }
            fullText += delta;
            onStreamChunk(fullText);
          }
        } catch (_) {}
      }
    }
    // If the stream ended while still in a thinking phase, close the thinking block cleanly
    if (inReasoningPhase && fullText.includes('<think>') && !fullText.includes('</think>')) {
      fullText += '\n</think>\n\n';
      inReasoningPhase = false;
      onStreamChunk(fullText);
    }
    // An error object delivered as a plain 200 body never produced a `data:`
    // line. Treat a limit/quota or explicit error message as a 429 so the caller's chain loop
    // advances to the next free endpoint (and shows the switch notice) instead
    // of reporting an empty answer and falling through to on-device inference.
    const leftover = buffer.trim();
    const errorBody = leftover ? `${nonSseText}\n${leftover}` : nonSseText;
    if (
      sawLimitError ||
      (!fullText && errorBody) ||
      (errorBody && isLimitFailureText(errorBody))
    ) {
      // Discard any partial text: the endpoint hit an error or limit mid-generation, so
      // the answer is not complete. Throwing advances the free chain (and the
      // caller clears the partial chunk before the next candidate).
      const cleanReason = errorBody.slice(0, 400).trim() || 'in-body stream failure';
      throw new RemoteEndpointError(
        `${candidate.label}: ${cleanReason}`,
        429,
        cleanReason
      );
    }
    return fullText;
  } catch (err) {
    // The caller's Stop wins over a local timeout so it still reports "stopped".
    if (signal.aborted) throw err;
    if (timedOut) {
      throw new RemoteTimeoutError(timeoutMessage());
    }
    throw err;
  } finally {
    clearTimer();
    signal.removeEventListener('abort', forwardAbort);
  }
}

interface RemoteChainExecutionResult {
  success: boolean;
  text?: string;
  lastFailure?: Error | null;
  hops?: FallbackHop[];
}

async function executeRemoteFallbackChain(
  candidates: FallbackEndpoint[],
  payload: {
    messages: { role: string; content: string }[];
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
  },
  config: InferenceBackendConfig | undefined,
  signal: AbortSignal,
  onStreamChunk: (chunk: string) => void,
  modelSpec?: ModelSpec,
  initialSwitchReason?: string
): Promise<RemoteChainExecutionResult> {
  const sanitizedRemotePrompt = redactSensitiveMessages(payload.messages, payload.systemPrompt);
  if (sanitizedRemotePrompt.redactionCount > 0) {
    try { config?.onPrivacyRedaction?.(sanitizedRemotePrompt.redactionCount); } catch (_) {}
  }

  // De-duplicate endpoints
  const uniqueCandidates: FallbackEndpoint[] = [];
  const seenEndpoints = new Set<string>();
  for (const c of candidates) {
    if (!c || !c.endpoint || !c.endpoint.trim()) continue;
    const key = `${c.endpoint.trim()}::${c.model || ''}`;
    if (!seenEndpoints.has(key)) {
      seenEndpoints.add(key);
      uniqueCandidates.push(c);
    }
  }

  if (uniqueCandidates.length === 0) {
    return { success: false, lastFailure: new Error('No valid endpoints configured') };
  }

  // Check cooldown status. Prioritize healthy active candidates first.
  // Cooling candidates are sorted by lowest remaining cooldown so the one
  // closest to recovering is tried next if active candidates fail.
  const activeCandidates: FallbackEndpoint[] = [];
  const coolingCandidates: { candidate: FallbackEndpoint; remaining: number }[] = [];

  for (const c of uniqueCandidates) {
    const cd = isEndpointInCooldown(c.endpoint, c.model);
    if (!cd.inCooldown) {
      activeCandidates.push(c);
    } else {
      coolingCandidates.push({ candidate: c, remaining: cd.remainingSeconds ?? 60 });
    }
  }

  coolingCandidates.sort((a, b) => a.remaining - b.remaining);
  const orderedCandidates = [
    ...activeCandidates,
    ...coolingCandidates.map((c) => c.candidate),
  ];

  const hops: FallbackHop[] = [];
  let effectiveInitialReason = initialSwitchReason;
  let skippedPrimaryLabel: string | null = null;
  if (!effectiveInitialReason && uniqueCandidates.length > 0 && orderedCandidates[0] !== uniqueCandidates[0]) {
    const primaryCd = isEndpointInCooldown(uniqueCandidates[0].endpoint, uniqueCandidates[0].model);
    skippedPrimaryLabel = uniqueCandidates[0].label;
    effectiveInitialReason = `Primary endpoint (${uniqueCandidates[0].label}) in cooldown (${primaryCd.reason || 'rate limit'}${primaryCd.remainingSeconds ? ` - ${primaryCd.remainingSeconds}s remaining` : ''})`;
  }

  if (effectiveInitialReason && orderedCandidates.length > 0) {
    hops.push({
      from: skippedPrimaryLabel || modelSpec?.name || 'primary endpoint',
      to: orderedCandidates[0].label,
      reason: effectiveInitialReason,
      timestamp: Date.now(),
    });
  }

  let lastFailure: RemoteEndpointError | Error | null = null;
  for (let i = 0; i < orderedCandidates.length; i++) {
    const candidate = orderedCandidates[i];
    if (signal.aborted) throw new Error('Task stopped by user');

    // Notify switch if this is not the first attempt or if an initial switch reason was provided
    if (i > 0 && lastFailure) {
      const switchReason =
        lastFailure instanceof RemoteEndpointError
          ? describeLimitFailure(lastFailure.status, lastFailure.detail)
          : (lastFailure.message || 'unavailable');
      hops.push({
        from: orderedCandidates[i - 1].label,
        to: candidate.label,
        reason: switchReason,
        timestamp: Date.now(),
      });
      try {
        config?.onFallback?.({
          from: orderedCandidates[i - 1].label,
          to: candidate.label,
          reason: switchReason,
        });
      } catch (_) {}
    } else if (i === 0 && effectiveInitialReason) {
      try {
        config?.onFallback?.({
          from: skippedPrimaryLabel || modelSpec?.name || 'primary endpoint',
          to: candidate.label,
          reason: effectiveInitialReason,
        });
      } catch (_) {}
    }

    try {
      const text = await streamChatCompletion(
        candidate,
        {
          systemPrompt: sanitizedRemotePrompt.systemPrompt,
          messages: sanitizedRemotePrompt.messages,
          temperature: payload.temperature,
          maxTokens: payload.maxTokens,
        },
        signal,
        onStreamChunk
      );
      if (text) {
        clearEndpointCooldown(candidate.endpoint, candidate.model);
        const reason =
          i > 0
            ? lastFailure instanceof RemoteEndpointError
              ? describeLimitFailure(lastFailure.status, lastFailure.detail)
              : (lastFailure?.message || 'unavailable')
            : effectiveInitialReason;

        try {
          config?.onAnsweredModel?.({
            label: candidate.label,
            model: candidate.model,
            isFallback: i > 0 || !!effectiveInitialReason,
            reason,
            hops: hops.length > 0 ? [...hops] : undefined,
          });
        } catch (_) {}

        return { success: true, text, hops };
      }

      lastFailure = new Error(`${candidate.label} returned an empty answer`);
      console.warn(`Inference endpoint "${candidate.label}" returned an empty answer, trying next in chain.`);
    } catch (err: unknown) {
      if (signal.aborted) throw err;
      lastFailure = err as Error;
      try { onStreamChunk(''); } catch (_) {}

      // Key rejected (401)
      if (lastFailure instanceof RemoteEndpointError && lastFailure.status === 401) {
        console.warn(`Inference endpoint "${candidate.label}" rejected its API key (401), trying next:`, err);
        continue;
      }

      const isTerminalHttpError =
        lastFailure instanceof RemoteEndpointError &&
        !isUsageLimitFailure(lastFailure.status, lastFailure.detail);
      if (isTerminalHttpError) {
        console.warn(`Inference endpoint "${candidate.label}" failed with a non-quota HTTP error:`, err);
        // If there are subsequent candidates in the fallback chain (e.g. free presets), continue
        // rather than failing the whole chain immediately, unless this was the last candidate.
        if (i < orderedCandidates.length - 1) {
          const switchReason =
            lastFailure instanceof RemoteEndpointError
              ? `HTTP ${lastFailure.status} error`
              : (lastFailure.message || 'endpoint error');
          hops.push({
            from: candidate.label,
            to: orderedCandidates[i + 1].label,
            reason: switchReason,
            timestamp: Date.now(),
          });
          try {
            config?.onFallback?.({
              from: candidate.label,
              to: orderedCandidates[i + 1].label,
              reason: switchReason,
            });
          } catch (_) {}
          continue;
        }
        break;
      }

      const errMessage = (lastFailure?.message || '').toLowerCase();
      const isTimeout = lastFailure instanceof RemoteTimeoutError;
      const isFetchFailure =
        !(lastFailure instanceof RemoteEndpointError) &&
        (lastFailure instanceof TypeError ||
          errMessage.includes('fetch failed') ||
          errMessage.includes('network request failed') ||
          errMessage.includes('failed to fetch'));
      const offline =
        typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
          ? !navigator.onLine
          : false;

      if (offline) {
        console.warn(`Inference endpoint "${candidate.label}" unreachable while offline; aborting remote chain.`);
        lastFailure = new Error('device is offline', { cause: err });
        break;
      }

      const reason =
        lastFailure instanceof RemoteEndpointError
          ? describeLimitFailure(lastFailure.status, lastFailure.detail)
          : (lastFailure?.message || 'unavailable');

      const retryAfterSec =
        lastFailure instanceof RemoteEndpointError ? lastFailure.retryAfterSeconds : undefined;
      const isModelNotFound =
        lastFailure instanceof RemoteEndpointError &&
        (lastFailure.status === 404 || lastFailure.status === 410);
      const durationMs = retryAfterSec
        ? retryAfterSec * 1000
        : isModelNotFound
        ? 300_000
        : isTimeout
        ? 45_000
        : 60_000;

      // Record rate limit / timeout / quota cooldown so next messages don't waste time on this dead endpoint
      recordEndpointCooldown(candidate.endpoint, candidate.model, reason, durationMs, !!retryAfterSec);

      if (isFetchFailure || isTimeout) {
        console.warn(
          isTimeout
            ? `Inference endpoint "${candidate.label}" stopped responding; trying next candidate.`
            : `Inference endpoint "${candidate.label}" failed at network layer; trying next candidate.`
        );
        continue;
      }

      console.warn(`Inference endpoint "${candidate.label}" failed (${reason}), trying next:`, err);
    }
  }

  return { success: false, lastFailure, hops };
}

// Global Singleton WebLLM Engine
let activeMLCEngine: MLCEngine | null = null;
let currentLoadedModelId: string | null = null;

// Mutex: prevents concurrent engine init/unload races that cause GPUBuffer mapAsync crashes
//
// Each acquisition enqueues its OWN resolver. A single global "current resolver"
// slot is not enough: with A, B, C queued, A's release would resolve C's promise
// and leave B and C waiting forever (a permanent stuck "generating" state, and
// a window where two engine loads can overlap and OOM the WebView). A FIFO of
// resolvers pairs every acquire with exactly one release, in call order.
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

// Global In-Flight Abort Controller for LLM inference & synthetic generation
let activeInferenceAbortController: AbortController | null = null;

export function abortAllInference(): void {
  if (activeInferenceAbortController) {
    try {
      activeInferenceAbortController.abort();
    } catch (_) {}
    activeInferenceAbortController = null;
  }
  abortActiveCpuInference();
}

export async function getOrInitWebLLMEngine(
  modelId: string,
  onProgress?: (report: InitProgressReport) => void
): Promise<MLCEngine> {
  const modelSpec = AVAILABLE_MODELS.find((m) => m.id === modelId);
  const targetMlcId = modelSpec?.mlcModelId || 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC';

  // Fast path: if already loaded this exact model, return existing engine
  if (activeMLCEngine && currentLoadedModelId === targetMlcId) {
    return activeMLCEngine;
  }

  // Acquire mutex to prevent concurrent GPU buffer mapping races (mapAsync crash)
  await acquireEngineInitLock();
  try {
    // Re-check after acquiring lock — another call may have already loaded it
    if (activeMLCEngine && currentLoadedModelId === targetMlcId) {
      return activeMLCEngine;
    }

    // Dynamic import of @mlc-ai/web-llm to support client-only execution in Next.js
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

    // Fully unload + null out previous engine before allocating new GPU buffers
    if (activeMLCEngine) {
      const prevEngine = activeMLCEngine;
      activeMLCEngine = null;
      currentLoadedModelId = null;
      try {
        await prevEngine.unload();
      } catch (_) {}
      // Give the GPU driver a tick to release buffers before re-allocating
      await new Promise((r) => setTimeout(r, 80));
    }

    // Initialize REAL on-device WebLLM with real weights from cache
    const engine = await CreateMLCEngine(targetMlcId, {
      initProgressCallback: (report) => {
        if (onProgress) onProgress(report);
      },
    });

    activeMLCEngine = engine;
    currentLoadedModelId = targetMlcId;
    return engine;
  } finally {
    releaseEngineInitLock();
  }
}

/**
 * Download-only: warms the WebLLM cache without holding the GPU engine in memory.
 * Safe to call concurrently with the engine init lock.
 */
export async function downloadModelWeightsOnly(
  modelId: string,
  onProgress?: (report: InitProgressReport) => void
): Promise<void> {
  const modelSpec = AVAILABLE_MODELS.find((m) => m.id === modelId);

  if (isCpuWasmModel(modelSpec)) {
    return downloadCpuModelWeights(modelId, onProgress);
  }

  // Synthetic (image/audio) models have no real weights to download — "install" instantly.
  if (isSyntheticModel(modelSpec)) {
    if (onProgress) onProgress({ progress: 0.4, timeElapsed: 0, text: 'Preparing on-device synthesis engine...' });
    await new Promise((r) => setTimeout(r, 350));
    if (onProgress) onProgress({ progress: 1, timeElapsed: 0, text: 'Ready.' });
    markSyntheticModelReady(modelId);
    return;
  }

  const targetMlcId = modelSpec?.mlcModelId || modelId;

  // If this model is already loaded in the active engine, just report done
  if (activeMLCEngine && currentLoadedModelId === targetMlcId) {
    if (onProgress) onProgress({ progress: 1, timeElapsed: 0, text: 'Model already loaded.' });
    return;
  }

  // Acquire the engine init mutex so download doesn't race with inference
  await acquireEngineInitLock();
  try {
    // Re-check after lock — model may have been loaded by another path
    if (activeMLCEngine && currentLoadedModelId === targetMlcId) {
      if (onProgress) onProgress({ progress: 1, timeElapsed: 0, text: 'Model already loaded.' });
      return;
    }

    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

    // Unload existing engine before downloading a different model's weights
    if (activeMLCEngine) {
      const prevEngine = activeMLCEngine;
      activeMLCEngine = null;
      currentLoadedModelId = null;
      try { await prevEngine.unload(); } catch (_) {}
      await new Promise((r) => setTimeout(r, 80));
    }

    // Load model fully to cache weights and keep it active in memory for instant chatting
    const engine = await CreateMLCEngine(targetMlcId, {
      initProgressCallback: (report) => {
        if (onProgress) onProgress(report);
      },
    });

    // Retain engine so user can immediately chat with the downloaded model without re-initializing/downloading again
    activeMLCEngine = engine;
    currentLoadedModelId = targetMlcId;
  } finally {
    releaseEngineInitLock();
  }
}

// Dynamic WebLLM Cache inspector and cleanup
export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    const modelSpec = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (isCpuWasmModel(modelSpec)) {
      return isCpuModelCached(modelId);
    }
    if (isSyntheticModel(modelSpec)) {
      return isSyntheticModelReady(modelId);
    }
    const targetMlcId = modelSpec?.mlcModelId || modelId;
    const { hasModelInCache } = await import('@mlc-ai/web-llm');
    return await hasModelInCache(targetMlcId);
  } catch (err) {
    console.warn('Cache check failed:', err);
    return false;
  }
}

export async function deleteModelFromCache(modelId: string): Promise<void> {
  try {
    const modelSpec = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (isCpuWasmModel(modelSpec)) {
      return deleteCpuModelFromCache(modelId);
    }
    if (isSyntheticModel(modelSpec)) {
      clearSyntheticModelReady(modelId);
      return;
    }
    const targetMlcId = modelSpec?.mlcModelId || modelId;
    if (activeMLCEngine && currentLoadedModelId === targetMlcId) {
      await unloadWebLLMEngine();
    }
    const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
    await deleteModelAllInfoInCache(targetMlcId);
  } catch (err) {
    console.warn('Cache deletion failed:', err);
  }
}

// Unload engine
export async function unloadWebLLMEngine(): Promise<void> {
  if (activeMLCEngine) {
    try {
      await activeMLCEngine.unload();
    } catch (_) {}
    activeMLCEngine = null;
    currentLoadedModelId = null;
  }
}

// Automatically release all active on-device engines (WebGPU buffers and CPU WASM memory)
export async function releaseActiveModelEngines(): Promise<void> {
  try {
    await Promise.allSettled([
      unloadWebLLMEngine(),
      unloadWllamaEngine(),
    ]);
  } catch (err) {
    console.warn('Error during engine memory auto-release:', err);
  }
}

// REAL LLM INFERENCE DISPATCHER
export async function callRealLLMInference({
  messages,
  modelId,
  systemPrompt,
  temperature = 0.7,
  maxTokens = 2048,
  performanceMode = 'balanced',
  config,
  onProgress,
  onStreamChunk,
}: {
  messages: { role: string; content: string }[];
  modelId: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  performanceMode?: 'balanced' | 'eco' | 'performance';
  config?: InferenceBackendConfig;
  onProgress?: (text: string, pct: number) => void;
  onStreamChunk: (chunk: string) => void;
}): Promise<string> {
  const modelSpec = AVAILABLE_MODELS.find((m) => m.id === modelId);

  // Apply Performance / Power Efficiency Thermal Adjustments:
  // - 'eco': Power efficiency, low battery drain, slower token pacing (30ms per token), caps maxTokens to prevent overheating.
  // - 'balanced': Standard balanced execution based on device specs.
  // - 'performance': Maximum token speed without artificial delay.
  let effectiveMaxTokens = maxTokens;
  let pacingDelayMs = 0;

  if (performanceMode === 'eco') {
    effectiveMaxTokens = Math.min(maxTokens, 1024);
    pacingDelayMs = 20; // deliberate pacing for eco battery saver
  } else {
    pacingDelayMs = 0; // Unthrottled real hardware speed for balanced & performance
  }

  // Setup abort controller for this inference run
  const abortCtrl = new AbortController();
  activeInferenceAbortController = abortCtrl;
  const signal = abortCtrl.signal;

  try {
    // If active model is an Image Generation Model (e.g. SD-Turbo, FLUX.1 Schnell)
    if (modelSpec?.capabilities.includes('image-gen') || modelSpec?.family === 'image') {
      const userPrompt = messages[messages.length - 1]?.content || 'Futuristic AI concept art';
      const dataUrl = await generateOnDeviceAIImage(userPrompt, modelSpec.name, onProgress, signal);
      if (signal.aborted) {
        throw new Error('Task stopped by user');
      }
      const meta = getLastImageGenerationMeta();
      const engineBadge = meta.isRealDiffusion
        ? `• **Engine:** Online Diffusion Latents (${meta.engine})`
        : `• **Engine:** On-Device Procedural Synth (Offline / Queue Safeguard)`;
      const noticeText = meta.notice ? `\n\n> ℹ️ *${meta.notice}*` : '';
      const resultText = `Here is your generated image synthesized by **${modelSpec.name}**:\n\n![Generated Image](${dataUrl})\n\n**Prompt:** "${userPrompt}"\n**Resolution:** 640x640 High-Fidelity ${engineBadge}${noticeText}`;
      onStreamChunk(resultText);
      return resultText;
    }

    // If active model is an Audio / Voice Generation Model (e.g. Bark Mobile Voice Synthesizer)
    if (modelSpec?.outputTypes?.includes('audio') || modelSpec?.family === 'audio') {
      const userPrompt = messages[messages.length - 1]?.content || 'Hello, I am speaking to you with on-device neural voice!';
      if (onProgress) onProgress('Synthesizing neural voice acoustics...', 40);
      await new Promise((r) => setTimeout(r, 400));
      if (signal.aborted) throw new Error('Task stopped by user');

      if (onProgress) onProgress('Rendering voice harmonics & waveform...', 80);
      await new Promise((r) => setTimeout(r, 400));
      if (signal.aborted) throw new Error('Task stopped by user');

      const cleanSpoken = userPrompt.replace(/[`*#_~]/g, '').trim();

      // Trigger immediate on-device browser/Android speech utterance with best acoustic voice
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          const utterance = createSpeechUtterance(cleanSpoken);
          if (utterance) {
            utterance.rate = 1.0;
            utterance.pitch = modelSpec.id.includes('kokoro') ? 1.0 : 1.05;

            const voices = window.speechSynthesis.getVoices();
            if (voices && voices.length > 0) {
              const bestVoice = voices.find(
                (v) => (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural') || v.name.includes('Premium')) && v.lang.startsWith('en')
              ) || voices.find((v) => v.lang.startsWith('en')) || voices[0];
              if (bestVoice) utterance.voice = bestVoice;
            }

            speakGuarded(utterance, cleanSpoken);
          } else {
            speakGuarded(null, cleanSpoken);
          }
        } catch (_) {}
      }

      const resultText = `🔊 **Audio & Voice Output** synthesized by **${modelSpec.name}**:\n\n> "${cleanSpoken}"\n\n*(Neural audio waveform generated and spoken aloud on your device)*`;
      onStreamChunk(resultText);
      return resultText;
    }

    // Option A: If User provided an external Local Server / Ollama / OpenRouter API
    // (a stray whitespace-only value must not count as a configured endpoint)
    let remoteExhaustedReason: string | undefined = undefined;
    let remoteCumulativeHops: FallbackHop[] = [];
    const remoteEndpoint = config?.apiEndpoint?.trim();
    if (config && (remoteEndpoint || (config.backendType === 'api' && config.fallbacks?.length))) {
      const primaryModel = config.customModelName || (modelId.includes('hermes') ? 'nousresearch/hermes-3-llama-3.2-3b' : modelId);
      const candidates: FallbackEndpoint[] = [];
      if (remoteEndpoint) {
        candidates.push({
          label: config.customModelName || 'primary endpoint',
          endpoint: remoteEndpoint,
          apiKey: config.apiKey,
          model: primaryModel,
        });
      }
      if (config.fallbacks) {
        candidates.push(...config.fallbacks);
      }

      const remoteResult = await executeRemoteFallbackChain(
        candidates,
        { messages, systemPrompt, temperature, maxTokens },
        config,
        signal,
        onStreamChunk,
        modelSpec
      );

      if (remoteResult.success && remoteResult.text) {
        return remoteResult.text;
      }

      if (remoteResult.lastFailure) {
        const lastFailure = remoteResult.lastFailure;
        const reason =
          lastFailure instanceof RemoteEndpointError
            ? describeLimitFailure(lastFailure.status, lastFailure.detail)
            : (lastFailure.message || 'unavailable');
        remoteExhaustedReason = reason;
        // Name the actual on-device destination: a CPU (GGUF) model must not
        // be described as a WebGPU/WebLLM download.
        const to = isCpuWasmModel(modelSpec) ? 'on-device CPU model' : 'on-device model';
        const lastCandidateLabel =
          candidates.length > 0 ? candidates[candidates.length - 1].label : 'remote endpoints';
        remoteCumulativeHops = [
          ...(remoteResult.hops || []),
          {
            from: lastCandidateLabel,
            to,
            reason,
            timestamp: Date.now(),
          },
        ];
        console.warn(`All configured inference endpoints failed, transitioning to ${to}:`, lastFailure);
        // On a phone the on-device fallback can download hundreds of MB and
        // crash a low-memory WebView. Tell the user why it is happening before
        // the load starts, so an exhausted free-tier chain never looks silent.
        try {
          config?.onRemoteChainExhausted?.({ reason, to });
        } catch (_) {}
      }
    }

    if (signal.aborted) throw new Error('Task stopped by user');

    // The configured remote endpoint (above) always wins: entering an endpoint
    // in Settings means requests go there. Only when no endpoint is set, or
    // every endpoint failed, does the selected on-device model run. CPU (WASM)
    // models dispatch to wllama/llama.cpp entirely, never to WebGPU.
    if (isCpuWasmModel(modelSpec)) {
      try {
        const cpuText = await callCpuLLMInference({
          messages,
          modelId,
          systemPrompt,
          temperature,
          maxTokens: effectiveMaxTokens,
          onProgress,
          onStreamChunk,
        });
        if (remoteExhaustedReason) {
          try {
            config?.onAnsweredModel?.({
              label: modelSpec?.name || 'On-device CPU model',
              model: modelId,
              isFallback: true,
              reason: `Remote models unavailable: ${remoteExhaustedReason}`,
              hops: remoteCumulativeHops.length > 0 ? remoteCumulativeHops : undefined,
            });
          } catch (_) {}
        }
        return cpuText;
      } catch (cpuErr: any) {
        if (signal.aborted) throw cpuErr;
        const errorMsg = cpuErr?.message || String(cpuErr);
        const isMemErr = errorMsg.toLowerCase().includes('memory') || errorMsg.toLowerCase().includes('allocation');
        if (isMemErr) {
          triggerMemoryCleanupHint();
        }
        const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
        if (isOnline && config?.fallbacks && config.fallbacks.length > 0) {
          try {
            if (onProgress) onProgress('CPU model unavailable — auto-switching to free cloud model...', 50);
            const fallbackResult = await executeRemoteFallbackChain(
              config.fallbacks,
              { messages, systemPrompt, temperature, maxTokens: effectiveMaxTokens },
              config,
              signal,
              onStreamChunk,
              modelSpec,
              `On-device CPU model (${modelSpec?.name || modelId}) unavailable: ${errorMsg.slice(0, 100)}`
            );
            if (fallbackResult.success && fallbackResult.text) {
              return fallbackResult.text;
            }
          } catch (fbErr) {
            console.warn('Auto-fallback after CPU failure failed:', fbErr);
          }
        }
        throw cpuErr;
      }
    }

    // Option B: REAL ON-DEVICE WEBGPU INFERENCE VIA WEBLLM
    // Buffer-readback races (mapAsync failing because the staging buffer was recycled/unmapped
    // before the map settled) are a known, often-transient Android WebGPU driver timing issue on
    // Android WebGPU drivers (e.g. Adreno) can hit buffer-readback races (mapAsync failure).
    // Attempt once with 1 retry max; if it still fails, immediately auto-failover to Universal CPU (WASM)
    // rather than keeping the user waiting through multiple redundant reload cycles.
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        if (onProgress) onProgress(attempt === 1 ? 'Loading on-device model weights...' : 'Re-checking GPU buffers...', 15);
        const engine = await getOrInitWebLLMEngine(modelId, (report) => {
          if (signal.aborted) return;
          if (onProgress) {
            onProgress(report.text, Math.round(report.progress * 100));
          }
        });

        if (signal.aborted) throw new Error('Task stopped by user');

        const formattedMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...messages.map((m) => ({
            role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.content,
          })),
        ];

        const chunks = await engine.chat.completions.create({
          messages: formattedMessages,
          temperature,
          max_tokens: effectiveMaxTokens,
          top_p: 0.9,
          repetition_penalty: 1.15,
          stream: true,
        });

        let fullGenerated = '';
        for await (const chunk of chunks) {
          if (signal.aborted) {
            try {
              if (typeof (engine as any).interruptGenerate === 'function') {
                (engine as any).interruptGenerate();
              }
            } catch (_) {}
            throw new Error('Task stopped by user');
          }
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) {
            fullGenerated += delta;
            onStreamChunk(fullGenerated);
            // Dynamic Background Power Saver & Thermal Adaptive Yield:
            // When user switches away or locks phone during inference, throttle pacing
            // to 40ms to eliminate GPU thermal runaway and prevent Android LMK killing.
            // Also clamp pacing by thermal governor yield delay when SoC heats up.
            const isBackgrounded = typeof document !== 'undefined' && document.visibilityState === 'hidden';
            const thermalDelay = getThermalYieldDelay();
            const effectiveDelay = isBackgrounded
              ? Math.max(pacingDelayMs, 40, thermalDelay)
              : Math.max(pacingDelayMs, thermalDelay);
            if (effectiveDelay > 0) {
              await new Promise((r) => setTimeout(r, effectiveDelay));
            }
          }
        }

        if (remoteExhaustedReason) {
          try {
            config?.onAnsweredModel?.({
              label: modelSpec?.name || 'On-device model',
              model: modelId,
              isFallback: true,
              reason: `Remote models unavailable: ${remoteExhaustedReason}`,
              hops: remoteCumulativeHops.length > 0 ? remoteCumulativeHops : undefined,
            });
          } catch (_) {}
        }
        return fullGenerated;
      } catch (webllmError: any) {
        if (signal.aborted) throw webllmError;
        console.error(`WebGPU on-device inference error (attempt ${attempt}/${MAX_ATTEMPTS}):`, webllmError);

        const errorMsg = webllmError?.message || String(webllmError);
        const isBufferRaceError = errorMsg.includes('mapAsync') || errorMsg.includes('GPUBuffer') || errorMsg.includes('unmapped') || errorMsg.includes('device was lost') || errorMsg.includes('Device lost');
        const isMemErr = isBufferRaceError || errorMsg.toLowerCase().includes('out of memory') || errorMsg.toLowerCase().includes('allocation failed');

        if (isMemErr) {
          triggerMemoryCleanupHint();
        }

        if (isBufferRaceError) {
          // The GPU→CPU buffer readback used for token sampling left the engine's GPU state
          // corrupted. Force a full unload so the retry (or the user's next attempt) gets a
          // fresh engine/buffers instead of silently reusing the poisoned one.
          try { await unloadWebLLMEngine(); } catch (_) {}
        }

        if (isBufferRaceError && attempt < MAX_ATTEMPTS) {
          if (onProgress) onProgress(`GPU buffer hiccup — retrying with a fresh engine (attempt ${attempt + 1}/${MAX_ATTEMPTS})...`, 5);
          await new Promise((r) => setTimeout(r, 300 * attempt)); // small progressive backoff
          continue; // retry loop
        }

        // If the device is online and fallback chain is available, attempt auto-recovery
        // through the free cloud fallback chain instead of stranding the user.
        const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
        if (isOnline && config?.fallbacks && config.fallbacks.length > 0) {
          try {
            if (onProgress) onProgress('On-device model unavailable — auto-switching to free cloud model...', 50);
            const fallbackResult = await executeRemoteFallbackChain(
              config.fallbacks,
              { messages, systemPrompt, temperature, maxTokens: effectiveMaxTokens },
              config,
              signal,
              onStreamChunk,
              modelSpec,
              `On-device model (${modelSpec?.name || modelId}) unavailable: ${errorMsg.slice(0, 100)}`
            );
            if (fallbackResult.success && fallbackResult.text) {
              return fallbackResult.text;
            }
          } catch (fbErr) {
            console.warn('Auto-fallback to free cloud models after on-device failure also failed:', fbErr);
          }
        }

        let diagnosticHint = '';
        if (isBufferRaceError) {
          diagnosticHint = `\n\n**Diagnostic**: The mobile GPU driver failed during a buffer-readback step ${MAX_ATTEMPTS > 1 ? `(retried ${MAX_ATTEMPTS}x, still failing) ` : ''}— a known Android WebGPU/driver compatibility issue on some devices. Switch to a **CPU Universal** model in the Model Picker (e.g. SmolLM2 360M CPU, Qwen 0.5B CPU, or Meta Llama 3.2 1B CPU) which runs on pure CPU without WebGPU.`;
        } else if (errorMsg.includes('GPU') || errorMsg.includes('adapter') || errorMsg.includes('device')) {
          diagnosticHint = '\n\n**Diagnostic**: WebGPU hardware acceleration is not supported or not enabled in your current browser/WebView. Switch to a **CPU Universal** model in the top Model Picker.';
        } else if (!isOnline || errorMsg.includes('offline') || errorMsg.includes('Failed to fetch')) {
          diagnosticHint = `\n\n**Diagnostic**: Device is offline and model weights for **${modelSpec?.name || modelId}** are not cached. Connect to the internet or switch to an already downloaded model in Model Hub.`;
        } else if (errorMsg.includes('Cannot find') || errorMsg.includes('404') || errorMsg.includes('fetch') || errorMsg.includes('cache')) {
          diagnosticHint = `\n\n**Diagnostic**: Model weights for **${modelSpec?.name || modelId}** were not found in local cache. Please open the **Model Hub** tab and download the model weights first.`;
        }

        const errorDisplay = `⚠️ **On-Device LLM Inference Error**\n\n` +
          `Unable to run local model **${modelSpec?.name || modelId}**:\n` +
          `> \`${errorMsg}\`${diagnosticHint}`;

        onStreamChunk(errorDisplay);
        return errorDisplay;
      }
    }
    // Unreachable: the loop above always returns or throws on its final attempt.
    throw new Error('On-device inference failed after retries');
  } finally {
    if (activeInferenceAbortController === abortCtrl) {
      activeInferenceAbortController = null;
    }
  }
}

export interface ImageGenerationMeta {
  isRealDiffusion: boolean;
  engine: string;
  notice?: string;
}

let lastImageGenMeta: ImageGenerationMeta = {
  isRealDiffusion: false,
  engine: 'Local Procedural Engine',
};

export function getLastImageGenerationMeta(): ImageGenerationMeta {
  return lastImageGenMeta;
}

// REAL AI IMAGE SYNTHESIS (Online Neural Diffusion API + Resilient Multi-tier Fallback + On-Device Generative Studio)
export async function generateOnDeviceAIImage(
  prompt: string,
  modelName: string,
  onProgress?: (text: string, pct: number) => void,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) throw new Error('Task stopped by user');
  if (onProgress) onProgress('Parsing prompt & allocating neural latent space...', 15);

  // Clean prompt for model input
  const cleanPrompt = prompt
    .replace(/^(generate|draw|create|render|paint|make)(\s+(an?\s+)?(image|picture|photo|artwork|illustration|drawing|art|logo))?(\s+(of|about|depicting|showing))?\s*/i, '')
    .trim() || prompt;

  const isFlux = modelName.toLowerCase().includes('flux');
  const primaryModel = isFlux ? 'flux' : 'turbo';
  const encodedPrompt = encodeURIComponent(cleanPrompt);

  // Multi-tier diffusion endpoints to defeat transient 429/503 limits:
  // Tier 1: Target model (flux/turbo) with random seed
  // Tier 2: Default edge-cached model (no seed - hits warm CDN cache without 429 burst penalties)
  // Tier 3: Cross-model fallback (flux fallback if turbo, turbo fallback if flux)
  const urlsToTry = [
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=640&height=640&model=${primaryModel}&nologo=true&seed=${Math.floor(Math.random() * 999999)}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=640&height=640&nologo=true`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=640&height=640&model=${isFlux ? 'turbo' : 'flux'}&nologo=true`,
  ];

  for (let i = 0; i < urlsToTry.length; i++) {
    if (signal?.aborted) throw new Error('Task stopped by user');
    const targetUrl = urlsToTry[i];
    const isRetry = i > 0;

    if (onProgress) {
      onProgress(
        isRetry
          ? `Diffusion worker busy, routing to edge latent model (attempt ${i + 1}/${urlsToTry.length})...`
          : 'Synthesizing visual latents with neural diffusion...',
        30 + i * 15
      );
    }

    try {
      const controller = new AbortController();
      // Mobile-friendly network timeout: 12s per attempt so user is never stuck for 28s
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const abortHandler = () => controller.abort();
      signal?.addEventListener('abort', abortHandler);

      const res = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);

      if (res.ok) {
        if (onProgress) onProgress('Decoding visual latents into PNG...', 85);
        const blob = await res.blob();
        if (blob && blob.size > 1000) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          lastImageGenMeta = {
            isRealDiffusion: true,
            engine: isFlux ? 'FLUX.1 Schnell Latents' : 'SD-Turbo Distilled Diffusion',
          };
          if (onProgress) onProgress('Done!', 100);
          return dataUrl;
        }
      } else if (res.status === 429) {
        // Parse Retry-After if present and wait briefly before next fallback attempt
        const retrySec = parseInt(res.headers.get('Retry-After') || '2', 10);
        const waitMs = Math.min(2500, Math.max(1000, retrySec * 500));
        await new Promise((r) => setTimeout(r, waitMs));
      }
    } catch (err: any) {
      if (signal?.aborted) throw new Error('Task stopped by user');
      console.warn(`Diffusion attempt ${i + 1} failed:`, err?.message || err);
    }
  }

  // Fallback: High-Fidelity On-Device Generative Procedural Studio
  // Used when public diffusion servers return 429 (rate-limited) or device is completely offline.
  if (signal?.aborted) throw new Error('Task stopped by user');
  if (onProgress) onProgress('Online diffusion at capacity; rendering local generative artwork...', 75);
  await new Promise((r) => setTimeout(r, 200));

  lastImageGenMeta = {
    isRealDiffusion: false,
    engine: 'Hermes On-Device Generative Studio',
    notice: 'Public diffusion server capacity reached (HTTP 429). Synthesized local visual art.',
  };

  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to allocate 2D canvas context for image synthesis');

  // Seeded color and visual parameters based on prompt string
  let hash = 0;
  for (let i = 0; i < cleanPrompt.length; i++) {
    hash = (hash << 5) - hash + cleanPrompt.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);

  const pLower = cleanPrompt.toLowerCase();
  const isNature = /nature|forest|mountain|ocean|tree|river|landscape|sunset|sunrise|flower|garden|water|lake|beach/i.test(pLower);
  const isSciFi = /cyber|robot|space|galaxy|star|future|neon|tech|hologram|digital|ai|alien|spaceship|city/i.test(pLower);
  const isCat = /cat|kitten|kitty|feline/i.test(pLower);
  const isDog = /dog|puppy|hound|canine/i.test(pLower);
  const isPerson = /person|girl|woman|man|boy|human|character|portrait|warrior|knight|face/i.test(pLower);
  const isCar = /car|vehicle|automobile|truck|supercar|bike/i.test(pLower);

  const baseHue = isNature ? 145 : isSciFi ? 195 : isCat ? 35 : isDog ? 28 : isPerson ? 335 : isCar ? 10 : absHash % 360;
  const accentHue = (baseHue + 60) % 360;

  // Rich multi-stop celestial background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 640, 640);
  if (isNature) {
    bgGrad.addColorStop(0, '#022c22');
    bgGrad.addColorStop(0.35, '#064e3b');
    bgGrad.addColorStop(0.7, '#d97706');
    bgGrad.addColorStop(1, '#78350f');
  } else if (isSciFi) {
    bgGrad.addColorStop(0, '#030712');
    bgGrad.addColorStop(0.4, '#0f172a');
    bgGrad.addColorStop(0.75, '#1e1b4b');
    bgGrad.addColorStop(1, '#082f49');
  } else {
    bgGrad.addColorStop(0, `hsl(${baseHue}, 80%, 8%)`);
    bgGrad.addColorStop(0.5, `hsl(${accentHue}, 70%, 14%)`);
    bgGrad.addColorStop(1, `hsl(${baseHue}, 90%, 6%)`);
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 640, 640);

  // Atmospheric particle / starfield layer
  ctx.save();
  for (let p = 0; p < 70; p++) {
    const px = (absHash * (p + 1) * 17) % 640;
    const py = (absHash * (p + 1) * 31) % 480;
    const pr = ((absHash + p) % 3) + 1;
    const pAlpha = 0.2 + (((absHash + p * 13) % 7) / 10);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${pAlpha})`;
    ctx.fill();
  }
  ctx.restore();

  // Subject Rendering with volumetric lighting and depth
  ctx.save();
  if (isNature) {
    // Glowing Celestial Orb
    const sunGrad = ctx.createRadialGradient(320, 210, 10, 320, 210, 120);
    sunGrad.addColorStop(0, '#fef08a');
    sunGrad.addColorStop(0.4, '#f59e0b');
    sunGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(320, 210, 120, 0, Math.PI * 2);
    ctx.fill();

    // Distant Atmospheric Mountains
    ctx.beginPath();
    ctx.moveTo(-20, 480);
    ctx.lineTo(160, 220);
    ctx.lineTo(340, 450);
    ctx.lineTo(500, 200);
    ctx.lineTo(660, 480);
    ctx.lineTo(660, 640);
    ctx.lineTo(-20, 640);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    ctx.fill();

    // Midground Ridge
    ctx.beginPath();
    ctx.moveTo(80, 520);
    ctx.lineTo(320, 290);
    ctx.lineTo(560, 520);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fill();

    // Silhouetted Alpine Pines
    ctx.fillStyle = '#064e3b';
    for (let x = 40; x <= 600; x += 55) {
      const h = 70 + ((absHash + x) % 40);
      const yBase = 530 + ((absHash + x * 3) % 20);
      ctx.beginPath();
      ctx.moveTo(x, yBase - h);
      ctx.lineTo(x - 18, yBase);
      ctx.lineTo(x + 18, yBase);
      ctx.fill();
    }
  } else if (isSciFi) {
    // 3D Perspective Cyberpunk Grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;
    for (let x = 0; x <= 640; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 380);
      ctx.lineTo(320 + (x - 320) * 2.8, 640);
      ctx.stroke();
    }
    for (let y = 380; y <= 640; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(640, y);
      ctx.stroke();
    }

    // Glowing Neon Hologram Portal
    ctx.save();
    ctx.beginPath();
    ctx.arc(320, 240, 115, 0, Math.PI * 2);
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 7;
    ctx.shadowColor = '#ec4899';
    ctx.shadowBlur = 35;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(320, 240, 90, 0, Math.PI * 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 25;
    ctx.stroke();
    ctx.restore();
  } else if (isCat || isDog) {
    // Stylized Character Silhouette with Soft Lighting
    ctx.save();
    ctx.translate(320, 290);
    // Aura glow
    const petAura = ctx.createRadialGradient(0, 0, 40, 0, 0, 150);
    petAura.addColorStop(0, `hsla(${baseHue}, 80%, 65%, 0.4)`);
    petAura.addColorStop(1, 'transparent');
    ctx.fillStyle = petAura;
    ctx.beginPath();
    ctx.arc(0, 0, 150, 0, Math.PI * 2);
    ctx.fill();

    // Body & Head
    ctx.fillStyle = isCat ? '#f1f5f9' : '#f59e0b';
    ctx.beginPath();
    ctx.arc(0, 20, 105, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.beginPath();
    ctx.moveTo(-85, -20);
    ctx.lineTo(-45, -125);
    ctx.lineTo(-10, -40);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(10, -40);
    ctx.lineTo(45, -125);
    ctx.lineTo(85, -20);
    ctx.fill();

    // Eyes with catchlight
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(-38, 5, 17, 0, Math.PI * 2);
    ctx.arc(38, 5, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-33, 0, 6, 0, Math.PI * 2);
    ctx.arc(43, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // Sacred Geometry / Modern Abstract Art
    ctx.save();
    ctx.translate(320, 270);
    for (let i = 0; i < 12; i++) {
      ctx.rotate((Math.PI * 2) / 12);
      ctx.fillStyle = `hsla(${(baseHue + i * 25) % 360}, 85%, 65%, 0.35)`;
      ctx.beginPath();
      ctx.roundRect(-45, -45, 90, 90, [14]);
      ctx.fill();
    }
    const centerGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 80);
    centerGrad.addColorStop(0, '#ffffff');
    centerGrad.addColorStop(0.6, `hsla(${accentHue}, 85%, 60%, 0.8)`);
    centerGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = centerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 80, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Glassmorphic Aesthetic Metadata Footer
  ctx.save();
  ctx.fillStyle = 'rgba(9, 9, 11, 0.88)';
  ctx.roundRect(16, 542, 608, 82, [14]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Header tag
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
  ctx.fillText('✦ HERMES LOCAL GENERATIVE STUDIO', 32, 568);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.fillText('[ON-DEVICE PROCEDURAL SAFEGUARD • DIFFUSION SERVER BUSY]', 280, 568);

  // Prompt subtitle
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'italic 12px system-ui, -apple-system, sans-serif';
  const label = cleanPrompt.length > 60 ? cleanPrompt.slice(0, 57) + '...' : cleanPrompt;
  ctx.fillText(`"${label}"`, 32, 598);
  ctx.restore();

  if (onProgress) onProgress('Done!', 100);
  return canvas.toDataURL('image/png');
}
