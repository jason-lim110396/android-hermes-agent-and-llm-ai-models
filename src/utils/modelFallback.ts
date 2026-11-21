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

/** $0 / free-tier endpoints. An entry without a key is sent unauthenticated;
 * add a key for providers that require one. */
export const FREE_FALLBACK_PRESETS: FallbackModelEntry[] = [
  {
    id: 'openrouter-free-router',
    label: 'OpenRouter free router',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
  },
  {
    id: 'openrouter-gemini-flash-free',
    label: 'Google Gemini Flash (free)',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-2.0-flash-exp:free',
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
  const fallback: FallbackSettings = {
    enabled: true,
    chain: FREE_FALLBACK_PRESETS.slice(0, 2),
  };
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
    // Duplicate ids would produce duplicate React keys in Settings.
    const seen = new Set<string>();
    const unique = chain.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    return { enabled: parsed.enabled == null ? true : !!parsed.enabled, chain: unique };
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
  'overloaded',
  'capacity',
  'unavailable',
  'model_not_found',
  'not found',
  'does not exist',
  'unknown model',
  'unsupported model',
  'degraded',
  'resource_exhausted',
  'billing',
  'tpm',
  'rpm',
  'tokens per minute',
  'requests per minute',
  'daily quota',
  'monthly limit',
  'free tier',
  'tier limit',
  'bad gateway',
  'gateway timeout',
  'origin down',
  'upstream',
  'cloudflare',
];

/**
 * True when the failure means "this account/model cannot serve right now",
 * so a different endpoint is likely to succeed.
 */
export function isUsageLimitFailure(status: number, detail: string): boolean {
  // 429 (rate limit), 402 (payment required), and 408 (request timeout) are unambiguous.
  if (status === 429 || status === 402 || status === 408) return true;
  // 502/503/504 are transient gateway/server failures - by definition a
  // different provider can often serve the same prompt. Free routers return
  // these constantly ("Model overloaded", "Server capacity reached",
  // "Service Unavailable") with text that does not match any quota keyword.
  if (status === 502 || status === 503 || status === 504) return true;
  // 520-526 are Cloudflare edge proxy / origin timeouts common on public free routers.
  if (status >= 520 && status <= 526) return true;
  // 401 is a bad key; 500 is an unrecoverable server fault. Neither means "try a different
  // provider" - sending the same prompt elsewhere would hide the real error.
  if (status === 401 || status < 400 || status >= 600) return false;
  // 403 / other 4xx only count when the provider actually says quota or limit.
  return isLimitFailureText(detail);
}

/**
 * True when a provider's error text says the request was refused for a
 * usage/quota reason. Used both for non-200 statuses (isUsageLimitFailure) and
 * for the in-body error objects some OpenAI-compatible routers return with an
 * HTTP 200 status - on a phone those must advance the free fallback chain, not
 * be mistaken for an empty answer that drops the turn to on-device inference.
 */
export function isLimitFailureText(detail: string): boolean {
  const body = (detail || '').toLowerCase();
  return LIMIT_HINTS.some((hint) => body.includes(hint));
}

export function describeLimitFailure(status: number, detail: string): string {
  // A rejected key is not a quota problem, but it is the one remote failure the
  // user can act on. Say so instead of a bare status code.
  if (status === 401) return 'API key rejected (401)';
  const body = (detail || '').toLowerCase();
  const hint = LIMIT_HINTS.find((h) => body.includes(h));
  if (hint) return `limit: ${hint}`;
  if (status === 429) return 'rate limit';
  if (status === 402) return 'payment required';
  if (status === 408) return 'request timeout (408)';
  if (status === 403) return 'quota / tier blocked';
  if (status === 502) return 'bad gateway (502)';
  if (status === 503) return 'provider unavailable (503)';
  if (status === 504) return 'gateway timeout (504)';
  if (status >= 520 && status <= 526) return `edge proxy error (${status})`;
  return `HTTP ${status}`;
}

export interface EndpointCooldown {
  endpoint: string;
  model?: string;
  until: number;
  reason: string;
}

const endpointCooldowns = new Map<string, EndpointCooldown>();

function getCooldownKey(endpoint: string, model?: string): string {
  return `${endpoint.trim().toLowerCase()}::${(model || '').trim().toLowerCase()}`;
}

/**
 * Record a temporary cooldown for an endpoint that experienced 429, quota exhaustion, or gateway timeouts.
 * Default cooldown is 60 seconds (or customized via durationMs).
 */
export function recordEndpointCooldown(
  endpoint: string,
  model: string | undefined,
  reason: string,
  durationMs = 60_000
): void {
  const key = getCooldownKey(endpoint, model);
  endpointCooldowns.set(key, {
    endpoint,
    model,
    until: Date.now() + durationMs,
    reason,
  });
}

/**
 * Checks whether an endpoint is currently cooling down from a recent rate limit or quota failure.
 */
export function isEndpointInCooldown(
  endpoint: string,
  model?: string
): { inCooldown: boolean; reason?: string; remainingSeconds?: number } {
  const key = getCooldownKey(endpoint, model);
  const entry = endpointCooldowns.get(key);
  if (!entry) return { inCooldown: false };
  const remainingMs = entry.until - Date.now();
  if (remainingMs <= 0) {
    endpointCooldowns.delete(key);
    return { inCooldown: false };
  }
  return {
    inCooldown: true,
    reason: entry.reason,
    remainingSeconds: Math.ceil(remainingMs / 1000),
  };
}

export function clearEndpointCooldown(endpoint: string, model?: string): void {
  endpointCooldowns.delete(getCooldownKey(endpoint, model));
}

export function clearAllEndpointCooldowns(): void {
  endpointCooldowns.clear();
}

/**
 * Returns all endpoints currently in an active cooldown window.
 * Prunes expired entries automatically.
 */
export function getAllActiveCooldowns(): EndpointCooldown[] {
  const now = Date.now();
  const active: EndpointCooldown[] = [];
  for (const [key, entry] of Array.from(endpointCooldowns.entries())) {
    if (entry.until > now) {
      active.push(entry);
    } else {
      endpointCooldowns.delete(key);
    }
  }
  return active;
}

