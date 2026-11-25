/**
 * Best-effort protection for accidental secret uploads to remote endpoints.
 * This is deliberately conservative: it only replaces high-confidence credential
 * shapes and never claims to be a complete DLP system.
 */
const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string | ((...args: unknown[]) => string) }> = [
  { pattern: /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/g, replacement: '[REDACTED PRIVATE KEY]' },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/gi, replacement: 'Bearer [REDACTED TOKEN]' },
  // Keep the credential KEY NAME in the redacted output (password=[REDACTED
  // SECRET]). The old '$1=[REDACTED SECRET]' string was returned by the
  // function replacer verbatim - String.replace never expands $1 for
  // function replacements - so a message like "password: mysecret12345"
  // reached the remote model as the literal garbage "$1=[REDACTED SECRET]"
  // with the key name destroyed.
  {
    pattern: /\b(api[_-]?key|access[_-]?token|secret|password|passwd|token)\s*[:=]\s*["']?[^\s"'`,;]{12,}["']?/gi,
    replacement: (_match: unknown, keyName: unknown) => `${String(keyName)}=[REDACTED SECRET]`,
  },
  { pattern: /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, replacement: '[REDACTED API KEY]' },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g, replacement: '[REDACTED JWT]' },
  { pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"'<>]+:[^\s"'<>]+@/gi, replacement: '[REDACTED DATABASE CREDENTIALS]@' },
];

export interface SensitiveContentResult {
  text: string;
  redactionCount: number;
}

/** One part of an OpenAI-compatible multimodal user message. */
export interface RedactableContentPart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export type RedactableMessage = {
  role: string;
  content: string | RedactableContentPart[];
};

export function redactSensitiveContent(input: string): SensitiveContentResult {
  let text = input;
  let redactionCount = 0;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    text = text.replace(pattern, (...args: any[]) => {
      const match = String(args[0]);
      const out = typeof replacement === 'function' ? replacement(...args) : replacement;
      if (match !== out) redactionCount += 1;
      return out;
    });
  }
  return { text, redactionCount };
}

export function redactSensitiveMessages(
  messages: RedactableMessage[],
  systemPrompt: string
): { messages: RedactableMessage[]; systemPrompt: string; redactionCount: number } {
  const system = redactSensitiveContent(systemPrompt);
  let redactionCount = system.redactionCount;
  const sanitizedMessages = messages.map((message) => {
    if (typeof message.content === 'string') {
      const result = redactSensitiveContent(message.content);
      redactionCount += result.redactionCount;
      return { ...message, content: result.text };
    }
    // Multimodal content: redact the text parts, leave image parts untouched.
    const content = message.content.map((part) => {
      if (part.type === 'text' && typeof part.text === 'string') {
        const result = redactSensitiveContent(part.text);
        redactionCount += result.redactionCount;
        return { ...part, text: result.text };
      }
      return part;
    });
    return { ...message, content };
  });
  return {
    systemPrompt: system.text,
    messages: sanitizedMessages,
    redactionCount,
  };
}
