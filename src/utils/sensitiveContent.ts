/**
 * Best-effort protection for accidental secret uploads to remote endpoints.
 * This is deliberately conservative: it only replaces high-confidence credential
 * shapes and never claims to be a complete DLP system.
 */
const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/g, replacement: '[REDACTED PRIVATE KEY]' },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/gi, replacement: 'Bearer [REDACTED TOKEN]' },
  { pattern: /\b(?:api[_-]?key|access[_-]?token|secret|password|passwd|token)\s*[:=]\s*["']?[^\s"'`,;]{12,}["']?/gi, replacement: '$1=[REDACTED SECRET]' },
  { pattern: /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, replacement: '[REDACTED API KEY]' },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g, replacement: '[REDACTED JWT]' },
  { pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"'<>]+:[^\s"'<>]+@/gi, replacement: '$&'.replace(/.*/, '[REDACTED DATABASE CREDENTIALS]@') },
];

export interface SensitiveContentResult {
  text: string;
  redactionCount: number;
}

export function redactSensitiveContent(input: string): SensitiveContentResult {
  let text = input;
  let redactionCount = 0;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    text = text.replace(pattern, (...args) => {
      const match = String(args[0]);
      if (match !== replacement) redactionCount += 1;
      return replacement;
    });
  }
  return { text, redactionCount };
}

export function redactSensitiveMessages(
  messages: { role: string; content: string }[],
  systemPrompt: string
): { messages: { role: string; content: string }[]; systemPrompt: string; redactionCount: number } {
  const system = redactSensitiveContent(systemPrompt);
  const sanitizedMessages = messages.map((message) => redactSensitiveContent(message.content));
  return {
    systemPrompt: system.text,
    messages: messages.map((message, index) => ({ ...message, content: sanitizedMessages[index].text })),
    redactionCount: system.redactionCount + sanitizedMessages.reduce((total, result) => total + result.redactionCount, 0),
  };
}
