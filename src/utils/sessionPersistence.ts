// Conversation Persistence Vault: survives Android process kills and WebView
// reloads. On a phone the OS routinely destroys backgrounded apps, and until
// now every chat and agent session lived only in memory - closing the app
// silently destroyed the whole history.
//
// Design constraints on mobile:
// - localStorage is small (~5MB) and synchronous: persist debounced (1s), and
//   degrade gracefully under quota pressure instead of ever throwing.
// - JS timers are suspended the moment the WebView is backgrounded, so a
//   pending debounced write is flushed synchronously on visibilitychange
//   (hidden) and pagehide - exactly the app-kill window this file exists for.
// - Attachments can be multi-MB base64 blobs: they are the first thing dropped
//   when the serialized payload does not fit; message text is never dropped
//   before that, and only then are histories trimmed from the oldest side.

import type { ChatMessage, ChatSession } from '@/appStore';

const STORAGE_KEY = 'hermes_sessions_v1';
const PERSIST_DEBOUNCE_MS = 1000;
const MAX_SESSIONS_PER_MODE = 12;
const TRIM_MESSAGES_STEPS = [400, 120, 40];

interface PersistedSessions {
  chatSessions: Record<string, ChatSession>;
  agentSessions: Record<string, ChatSession>;
  activeChatSessionId: string;
  activeAgentSessionId: string;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSnapshot: PersistedSessions | null = null;

function isValidMessage(m: unknown): m is ChatMessage {
  if (!m || typeof m !== 'object') return false;
  const msg = m as Partial<ChatMessage>;
  return (
    typeof msg.id === 'string' &&
    (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') &&
    typeof msg.content === 'string'
  );
}

function isValidSession(id: string, s: unknown): s is ChatSession {
  if (!s || typeof s !== 'object') return false;
  const sess = s as Partial<ChatSession>;
  // The entry key and the session's own id must agree, otherwise a corrupt or
  // tampered record could silently re-key itself and orphan active id pointers.
  return (
    sess.id === id &&
    typeof sess.title === 'string' &&
    Array.isArray(sess.messages)
  );
}

function stripAttachments(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => (m.attachments?.length ? { ...m, attachments: [] } : m));
}

// Pinned sessions always survive; so does the session the user is currently in,
// even when it is the oldest one (otherwise the snapshot could persist a
// pointer to a dropped session and silently lose the active history).
// A corrupt or older persisted record can carry a missing/non-numeric
// createdAt. Subtracting such values yields NaN, which makes Array.sort keep
// the original (insertion) order - not newest-first - so quota trimming can
// drop the wrong sessions. Coerce to a finite number with a safe fallback.
function sessionCreatedAt(s: ChatSession): number {
  const value = (s as Partial<ChatSession>).createdAt;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function limitSessions(
  sessions: Record<string, ChatSession>,
  activeId: string
): Record<string, ChatSession> {
  const entries = Object.values(sessions);
  const pinned = entries.filter((s) => s.pinned);
  const active = entries.find((s) => s.id === activeId && !pinned.includes(s));
  const rest = entries
    .filter((s) => !s.pinned && s.id !== activeId)
    .sort((a, b) => sessionCreatedAt(b) - sessionCreatedAt(a))
    .slice(0, Math.max(0, MAX_SESSIONS_PER_MODE - pinned.length - (active ? 1 : 0)));
  const kept = [...pinned, ...(active ? [active] : []), ...rest];
  return Object.fromEntries(kept.map((s) => [s.id, s]));
}

function trimTo(messages: ChatMessage[], keep: number): ChatMessage[] {
  return keep >= messages.length ? messages : messages.slice(-keep);
}

function mapTrimmed(
  sessions: Record<string, ChatSession>,
  keep: number
): Record<string, ChatSession> {
  return Object.fromEntries(
    Object.entries(sessions).map(([id, s]) => [id, { ...s, messages: trimTo(s.messages, keep) }])
  );
}

function tryWrite(payload: PersistedSessions): boolean {
  // Escalating degradation, computed lazily: full -> no attachments ->
  // progressively shorter histories. Each level keeps the most recent content
  // possible; the no-attachment trees are computed once and shared by every
  // trim level, and a successful write only ever pays for the level it used.
  const levels: Array<() => PersistedSessions> = [
    () => payload,
    () => {
      const noAttach: PersistedSessions = {
        ...payload,
        chatSessions: mapNoAttachments(payload.chatSessions),
        agentSessions: mapNoAttachments(payload.agentSessions),
      };
      strippedTrees = noAttach;
      return noAttach;
    },
    ...TRIM_MESSAGES_STEPS.map((keep) => () => ({
      chatSessions: mapTrimmed(strippedTrees.chatSessions, keep),
      agentSessions: mapTrimmed(strippedTrees.agentSessions, keep),
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

// Memoized inside tryWrite for one degradation attempt: every trim level
// reuses the same attachment-stripped trees instead of rebuilding them.
let strippedTrees: PersistedSessions = null as unknown as PersistedSessions;

/** Synchronous write of the most recent snapshot. Never throws. */
function flushPersistNow(): void {
  if (typeof window === 'undefined' || !pendingSnapshot) return;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const snapshot = pendingSnapshot;
  pendingSnapshot = null;
  try {
    tryWrite({
      chatSessions: limitSessions(snapshot.chatSessions, snapshot.activeChatSessionId),
      agentSessions: limitSessions(snapshot.agentSessions, snapshot.activeAgentSessionId),
      activeChatSessionId: snapshot.activeChatSessionId,
      activeAgentSessionId: snapshot.activeAgentSessionId,
    });
  } catch (_) {
    // Persistence is best-effort; the live in-memory app must never break.
  }
}

// The WebView suspends JS timers when backgrounded, so a debounced write that
// has not fired yet would be lost exactly when Android is about to kill the
// app. Flush synchronously at that moment.
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPersistNow();
  });
  window.addEventListener('pagehide', flushPersistNow);
}

/** Debounced save of the full chat + agent session trees. Never throws. */
export function schedulePersistSessions(state: PersistedSessions): void {
  if (typeof window === 'undefined') return;
  pendingSnapshot = state;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(flushPersistNow, PERSIST_DEBOUNCE_MS);
}

function sanitizeSessions(raw: unknown): Record<string, ChatSession> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, ChatSession> = {};
  for (const [id, sess] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidSession(id, sess)) continue;
    const messages = sess.messages.filter(isValidMessage).map((m) => ({ ...m, isStreaming: false }));
    out[id] = { ...sess, messages };
  }
  return Object.keys(out).length > 0 ? out : null;
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
