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

export interface FallbackHop {
  from: string;
  to: string;
  reason: string;
  timestamp?: number;
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
    id: 'openrouter-llama33-70b-free',
    label: 'Meta Llama 3.3 70B (free)',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
  },
  {
    id: 'openrouter-deepseek-r1-free',
    label: 'DeepSeek R1 (free)',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-r1:free',
  },
  {
    id: 'openrouter-mistral-small-free',
    label: 'Mistral Small 3.1 24B (free)',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'mistralai/mistral-small-3.1-24b-instruct:free',
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
    id: 'openrouter-qwen-coder-free',
    label: 'Qwen 2.5 Coder 32B (free)',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'qwen/qwen-2.5-coder-32b-instruct:free',
  },
  {
    id: 'openrouter-deepseek-chat-free',
    label: 'DeepSeek V3 Chat (free)',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-chat:free',
  },
  {
    id: 'ollama-local',
    label: 'Local Ollama / vLLM',
    endpoint: 'http://192.168.1.100:11434/v1',
    model: 'qwen2.5:3b',
  },
];

/** Default recommended free fallback chain presets for resilient $0 failover. */
export function getDefaultFallbackChain(): FallbackModelEntry[] {
  return FREE_FALLBACK_PRESETS.slice(0, 3);
}

export function loadFallbackSettings(): FallbackSettings {
  const fallback: FallbackSettings = {
    enabled: true,
    chain: getDefaultFallbackChain(),
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

/**
 * Updates an entry in the fallback chain by id and returns a new updated chain array.
 */
export function updateFallbackChainEntry(
  chain: FallbackModelEntry[],
  id: string,
  updates: Partial<FallbackModelEntry>
): FallbackModelEntry[] {
  return chain.map((entry) => {
    if (entry.id !== id) return entry;
    return {
      ...entry,
      ...updates,
      id: entry.id,
    };
  });
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
  'resource has been exhausted',
  'quota exceeded',
  'quota_exceeded',
  'exceeded your current quota',
  'credit balance is too low',
  'insufficient balance',
  'insufficient_balance',
  'rate_limit_exceeded',
  'rate-limit',
  'rate_limited',
  'tokens per minute',
  'requests per minute',
  'tpm limit',
  'rpm limit',
  'model is overloaded',
  'overloaded with other requests',
  'upstream request timeout',
  'free tier limit',
  'free_tier',
  'free-tier',
  'account has been suspended',
  'server_error',
  'service unavailable',
  'service_unavailable',
  'connection reset',
  'socket hang up',
  'network connection lost',
  'billing',
  'tpm',
  'rpm',
  'daily quota',
  'monthly limit',
  'free tier',
  'tier limit',
  'bad gateway',
  'gateway timeout',
  'origin down',
  'upstream',
  'cloudflare',
  'slow_down',
  'temporarily exhausted',
  'engine is currently busy',
  'busy',
  'out of balance',
  'insufficient_quota',
  'no endpoints available',
  'no available endpoints',
  'no healthy upstream',
  'capacity exceeded',
  'traffic exceeded',
  'daily limit',
  'temporarily unavailable',
  'upstream connect error',
  'context length',
  'context_length',
  'max_tokens',
  'maximum context length',
  'prompt is too long',
  'too many tokens',
  'token limit',
  'tokens limit',
  'payload too large',
  'request entity too large',
  'string_above_max_length',
  'reduce the length',
  'max_completion_tokens',
  'thinking_budget',
  'thinking_budget_exceeded',
  'reasoning_tokens_limit',
  'reasoning budget exceeded',
  'model is currently loading',
  'model is loading',
  'loading model',
  'is loading',
  'model not ready',
  'model is not ready',
  'queue is full',
  'request queued too long',
  'queue timeout',
  'context length exceeded',
  'token limit exceeded',
  'max_tokens reached',
  'temporarily disabled',
  'endpoint disabled',
  'no available provider',
  'no available model',
  'bandwidth limit exceeded',
];

/**
 * True when the failure means "this account/model cannot serve right now",
 * so a different endpoint is likely to succeed.
 */
export function isUsageLimitFailure(status: number, detail: string): boolean {
  // 429 (rate limit), 402 (payment required), 408 (request timeout), 413 (payload too large),
  // 499 (client/edge timeout), 507 (insufficient storage), and 509 (bandwidth limit exceeded).
  if (
    status === 429 ||
    status === 402 ||
    status === 408 ||
    status === 413 ||
    status === 499 ||
    status === 507 ||
    status === 509
  ) return true;
  // 529 (Site is overloaded) is returned by Anthropic, OpenRouter, and other LLM gateways.
  if (status === 529) return true;
  // 500/502/503/504 are server/gateway failures: an internal server crash or gateway outage on one
  // provider should fail over to another healthy provider in the fallback chain.
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  // 520-526 are Cloudflare edge proxy / origin timeouts common on public free routers.
  if (status >= 520 && status <= 526) return true;
  // 404 (model / route not found or deprecated) and 410 (gone) indicate that the specific model
  // or route is unavailable on this provider; other presets in the chain can serve the prompt.
  if (status === 404 || status === 410) return true;
  // 401 is an invalid API key; status outside 400-599 is unexpected.
  if (status === 401 || status < 400 || status >= 600) return false;
  // 403 / 400 / 422 / other 4xx count when the provider actually says quota, context length, or model availability.
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
  if (status === 413) return 'payload too large (413)';
  if (status === 529) return 'provider overloaded (529)';
  if (status === 402) return 'payment required';
  if (status === 408) return 'request timeout (408)';
  if (status === 499) return 'client/edge request cancelled (499)';
  if (status === 507) return 'insufficient server storage (507)';
  if (status === 509) return 'bandwidth limit exceeded (509)';
  if (status === 403) return 'quota / tier blocked (403)';
  if (status === 500) return 'internal server error (500)';
  if (status === 502) return 'bad gateway (502)';
  if (status === 503) return 'provider unavailable (503)';
  if (status === 504) return 'gateway timeout (504)';
  if (status === 404) return 'model / route not found (404)';
  if (status === 410) return 'model decommissioned (410)';
  if (status === 400) return 'bad request / format error (400)';
  if (status === 422) return 'unprocessable entity / prompt limit (422)';
  if (status >= 520 && status <= 526) return `edge proxy error (${status})`;
  return `HTTP ${status}`;
}

export interface EndpointCooldown {
  endpoint: string;
  model?: string;
  until: number;
  reason: string;
  isRetryAfterHeader?: boolean;
}

const COOLDOWN_STORAGE_KEY = 'hermes_endpoint_cooldowns_v1';

function getCooldownKey(endpoint: string, model?: string): string {
  return `${endpoint.trim().toLowerCase()}::${(model || '').trim().toLowerCase()}`;
}

function loadPersistedCooldowns(): Map<string, EndpointCooldown> {
  const map = new Map<string, EndpointCooldown>();
  if (typeof window === 'undefined') return map;
  try {
    const raw = sessionStorage.getItem(COOLDOWN_STORAGE_KEY);
    if (!raw) return map;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return map;
    const now = Date.now();
    for (const item of parsed) {
      if (item && typeof item.endpoint === 'string' && typeof item.until === 'number' && item.until > now) {
        map.set(getCooldownKey(item.endpoint, item.model), {
          endpoint: item.endpoint,
          model: typeof item.model === 'string' ? item.model : undefined,
          until: item.until,
          reason: typeof item.reason === 'string' ? item.reason : 'rate limit',
          isRetryAfterHeader: !!item.isRetryAfterHeader,
        });
      }
    }
  } catch (_) {}
  return map;
}

const endpointCooldowns = loadPersistedCooldowns();

function persistCooldowns(): void {
  if (typeof window === 'undefined') return;
  try {
    const active = getAllActiveCooldowns();
    if (active.length === 0) {
      sessionStorage.removeItem(COOLDOWN_STORAGE_KEY);
    } else {
      sessionStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(active));
    }
  } catch (_) {}
}

/**
 * Record a temporary cooldown for an endpoint that experienced 429, quota exhaustion, or gateway timeouts.
 * Default cooldown is 60 seconds (or customized via durationMs).
 */
export function recordEndpointCooldown(
  endpoint: string,
  model: string | undefined,
  reason: string,
  durationMs = 60_000,
  isRetryAfterHeader = false
): void {
  const key = getCooldownKey(endpoint, model);
  endpointCooldowns.set(key, {
    endpoint,
    model,
    until: Date.now() + durationMs,
    reason,
    isRetryAfterHeader,
  });
  persistCooldowns();
}

/**
 * Checks whether an endpoint is currently cooling down from a recent rate limit or quota failure.
 */
export function isEndpointInCooldown(
  endpoint: string,
  model?: string
): { inCooldown: boolean; reason?: string; remainingSeconds?: number; isRetryAfterHeader?: boolean } {
  const key = getCooldownKey(endpoint, model);
  const entry = endpointCooldowns.get(key);
  if (!entry) return { inCooldown: false };
  const remainingMs = entry.until - Date.now();
  if (remainingMs <= 0) {
    endpointCooldowns.delete(key);
    persistCooldowns();
    return { inCooldown: false };
  }
  return {
    inCooldown: true,
    reason: entry.reason,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    isRetryAfterHeader: entry.isRetryAfterHeader,
  };
}

export function clearEndpointCooldown(endpoint: string, model?: string): void {
  endpointCooldowns.delete(getCooldownKey(endpoint, model));
  persistCooldowns();
}

export function clearAllEndpointCooldowns(): void {
  endpointCooldowns.clear();
  persistCooldowns();
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

