// Conversation Persistence Vault: survives Android process kills and WebView
// reloads. On a phone the OS routinely destroys backgrounded apps, and until
// now every chat and agent session lived only in memory - closing the app
// silently destroyed the whole history.
//
// Design constraints on mobile:
// - localStorage is small (~5MB) and synchronous: persist debounced (1s), and
//   degrade gracefully under quota pressure instead of ever throwing.
// - Attachments can be multi-MB base64 blobs: they are the first thing dropped
//   when the serialized payload does not fit; message text is never dropped
//   before that, and only then are histories trimmed from the oldest side.

import type { ChatMessage, ChatSession } from '@/appStore';

const STORAGE_KEY = 'hermes_sessions_v1';
const PERSIST_DEBOUNCE_MS = 1000;
const MAX_SESSIONS_PER_MODE = 12;
const TRIM_MESSAGES_STEPS = [Infinity, 400, 120, 40];

interface PersistedSessions {
  chatSessions: Record<string, ChatSession>;
  agentSessions: Record<string, ChatSession>;
  activeChatSessionId: string;
  activeAgentSessionId: string;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function stripAttachments(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => (m.attachments?.length ? { ...m, attachments: [] } : m));
}

function limitSessions(sessions: Record<string, ChatSession>): Record<string, ChatSession> {
  const entries = Object.values(sessions);
  const pinned = entries.filter((s) => s.pinned);
  const rest = entries
    .filter((s) => !s.pinned)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.max(0, MAX_SESSIONS_PER_MODE - pinned.length));
  const kept = [...pinned, ...rest];
  return Object.fromEntries(kept.map((s) => [s.id, s]));
}

function trimTo(messages: ChatMessage[], keep: number): ChatMessage[] {
  return keep >= messages.length ? messages : messages.slice(-keep);
}

function tryWrite(payload: PersistedSessions): boolean {
  // Escalating degradation: full -> no attachments -> progressively shorter
  // histories. Each level keeps the most recent content possible.
  const levels: Array<() => PersistedSessions> = [
    () => payload,
    () => ({
      ...payload,
      chatSessions: mapNoAttachments(payload.chatSessions),
      agentSessions: mapNoAttachments(payload.agentSessions),
    }),
    ...TRIM_MESSAGES_STEPS.filter((n) => n !== Infinity).map((keep) => () => ({
      chatSessions: mapTrimmed(mapNoAttachments(payload.chatSessions), keep),
      agentSessions: mapTrimmed(mapNoAttachments(payload.agentSessions), keep),
      activeChatSessionId: payload.activeChatSessionId,
      activeAgentSessionId: payload.activeAgentSessionId,
    })),
  ];

  for (const build of levels) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(build()));
      return true;
    } catch (_) {
      // Quota exceeded: fall through to the next, smaller level.
    }
  }
  return false;
}

function mapNoAttachments(sessions: Record<string, ChatSession>): Record<string, ChatSession> {
  return Object.fromEntries(
    Object.entries(sessions).map(([id, s]) => [id, { ...s, messages: stripAttachments(s.messages) }])
  );
}

function mapTrimmed(
  sessions: Record<string, ChatSession>,
  keep: number
): Record<string, ChatSession> {
  return Object.fromEntries(
    Object.entries(sessions).map(([id, s]) => [id, { ...s, messages: trimTo(s.messages, keep) }])
  );
}

function isValidSession(s: unknown): s is ChatSession {
  return (
    !!s &&
    typeof s === 'object' &&
    typeof (s as ChatSession).id === 'string' &&
    typeof (s as ChatSession).title === 'string' &&
    Array.isArray((s as ChatSession).messages)
  );
}

function sanitizeSessions(raw: unknown): Record<string, ChatSession> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, ChatSession> = {};
  for (const [id, sess] of Object.entries(raw as Record<string, unknown>)) {
    if (isValidSession(sess)) out[id] = { ...sess, messages: sess.messages.map((m) => ({ ...m, isStreaming: false })) };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Debounced save of the full chat + agent session trees. Never throws. */
export function schedulePersistSessions(state: PersistedSessions): void {
  if (typeof window === 'undefined') return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      tryWrite({
        chatSessions: limitSessions(state.chatSessions),
        agentSessions: limitSessions(state.agentSessions),
        activeChatSessionId: state.activeChatSessionId,
        activeAgentSessionId: state.activeAgentSessionId,
      });
    } catch (_) {
      // Persistence is best-effort; the live in-memory app must never break.
    }
  }, PERSIST_DEBOUNCE_MS);
}

/** Restore sessions saved by a previous app run. Returns null if none/invalid. */
export function loadPersistedSessions(): PersistedSessions | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const chatSessions = sanitizeSessions(parsed.chatSessions);
    const agentSessions = sanitizeSessions(parsed.agentSessions);
    if (!chatSessions && !agentSessions) return null;
    return {
      chatSessions: chatSessions || {},
      agentSessions: agentSessions || {},
      activeChatSessionId:
        typeof parsed.activeChatSessionId === 'string' && chatSessions?.[parsed.activeChatSessionId]
          ? parsed.activeChatSessionId
          : Object.keys(chatSessions || {})[0] || '',
      activeAgentSessionId:
        typeof parsed.activeAgentSessionId === 'string' && agentSessions?.[parsed.activeAgentSessionId]
          ? parsed.activeAgentSessionId
          : Object.keys(agentSessions || {})[0] || '',
    };
  } catch (_) {
    return null;
  }
}
