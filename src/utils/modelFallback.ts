// Free-first model fallback chain.
//
// When the primary inference endpoint answers with a usage limit (429 / 402 /
// 403 quota / 503), the runtime retries the same request on the next endpoint
// in this chain instead of failing the turn. The chain defaults to free-tier
// providers so the app keeps working after a paid quota runs out.

export interface FallbackModelEntry {
  id: string;
  label: string;
  endpoint: string;
  apiKey?: string;
  model?: string;
}

export interface FallbackSettings {
  enabled: boolean;
  chain: FallbackModelEntry[];
}

const STORAGE_KEY = 'androidllm_model_fallback_chain';

/** $0 / free-tier endpoints. An entry without a key is skipped at call time. */
export const FREE_FALLBACK_PRESETS: FallbackModelEntry[] = [
  {
    id: 'openrouter-free-router',
    label: 'OpenRouter free router',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
  },
  {
    id: 'openrouter-ernie-free',
    label: 'ERNIE 5.5 Flash Preview (free)',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'baidu/ernie-5.5-flash-preview:free',
  },
  {
    id: 'openrouter-nemotron-ultra-free',
    label: 'NVIDIA Nemotron 3 Ultra (free)',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  },
  {
    id: 'openrouter-gemma-free',
    label: 'Google Gemma 4 26B A4B (free)',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'google/gemma-4-26b-a4b-it:free',
  },
  {
    id: 'ollama-local',
    label: 'Local Ollama / vLLM',
    endpoint: 'http://192.168.1.100:11434/v1',
    model: 'qwen2.5:3b',
  },
];

export function loadFallbackSettings(): FallbackSettings {
  const fallback: FallbackSettings = { enabled: true, chain: [] };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<FallbackSettings>;
    const chain = Array.isArray(parsed.chain)
      ? parsed.chain
          .filter((e) => e && typeof e.endpoint === 'string' && e.endpoint.trim())
          .map((e, i) => ({
            id: typeof e.id === 'string' && e.id ? e.id : `entry-${i}`,
            label: typeof e.label === 'string' && e.label ? e.label : e.endpoint,
            endpoint: e.endpoint,
            apiKey: typeof e.apiKey === 'string' ? e.apiKey : undefined,
            model: typeof e.model === 'string' ? e.model : undefined,
          }))
      : [];
    return { enabled: parsed.enabled !== false, chain };
  } catch (_) {
    return fallback;
  }
}

/** Returns false when the write failed (storage full or blocked). */
export function saveFallbackSettings(settings: FallbackSettings): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        enabled: settings.enabled,
        // Keys are never written to storage: like the primary API key, a chain
        // key lives for the session only. Endpoints and models do persist.
        chain: settings.chain.map((e) => ({
          id: e.id,
          label: e.label,
          endpoint: e.endpoint,
          model: e.model,
        })),
      })
    );
    return true;
  } catch (_) {
    return false;
  }
}

const LIMIT_STATUS = new Set([402, 403, 429, 503]);
const LIMIT_HINTS = [
  'rate limit',
  'rate_limit',
  'quota',
  'usage limit',
  'limit reached',
  'exceeded',
  'insufficient',
  'credits',
  'too many requests',
];

/**
 * True when the failure means "this account/model cannot serve right now",
 * so a different endpoint is likely to succeed.
 */
export function isUsageLimitFailure(status: number, detail: string): boolean {
  if (LIMIT_STATUS.has(status)) return true;
  const body = (detail || '').toLowerCase();
  return LIMIT_HINTS.some((hint) => body.includes(hint));
}

export function describeLimitFailure(status: number, detail: string): string {
  if (status === 429) return 'rate limit';
  if (status === 402) return 'payment required';
  if (status === 403) return 'quota / tier blocked';
  if (status === 503) return 'provider unavailable';
  const body = (detail || '').toLowerCase();
  const hint = LIMIT_HINTS.find((h) => body.includes(h));
  return hint ? `limit: ${hint}` : `HTTP ${status}`;
}
