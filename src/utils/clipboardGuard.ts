// Clipboard guard & multi-format snippet formatter for mobile Hermes.
// Provides safe clipboard writing, attribution formatting, and automatic
// vault persistence for mobile users.

export interface CopyAttributionOptions {
  modelName?: string;
  timestamp?: string;
  format?: 'plain' | 'markdown' | 'attributed';
}

export function hasClipboard(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !!navigator.clipboard;
}

export function formatMessageForCopy(
  content: string,
  options?: CopyAttributionOptions
): string {
  const format = options?.format || 'plain';
  if (format === 'plain') {
    return content;
  }
  if (format === 'markdown') {
    return content.trim();
  }
  // attributed
  const model = options?.modelName || 'Hermes AI';
  const time = options?.timestamp || new Date().toLocaleString();
  return `[${model} • ${time}]\n\n${content.trim()}`;
}

export async function copyToClipboardSafe(
  text: string,
  options?: { saveToVault?: boolean; modelName?: string }
): Promise<boolean> {
  if (!hasClipboard()) return false;
  try {
    await navigator.clipboard.writeText(text);
    if (options?.saveToVault && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('hermes_clipboard_vault');
        const existing = raw ? JSON.parse(raw) : [];
        const newEntry = {
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: text.slice(0, 1000),
          type: text.includes('```') ? 'code' : 'text',
          createdAt: new Date().toISOString(),
          pinned: false,
          charCount: text.length,
          model: options.modelName,
        };
        const filtered = [newEntry, ...existing.filter((e: any) => e.text !== text)].slice(0, 50);
        window.localStorage.setItem('hermes_clipboard_vault', JSON.stringify(filtered));
      } catch (_) {}
    }
    return true;
  } catch (err) {
    console.warn('Clipboard write failed:', err);
    return false;
  }
}
