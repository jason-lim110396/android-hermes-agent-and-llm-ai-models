// Utility for chat text sizing and accessibility scaling across mobile viewports.

export type ChatFontSize = 'small' | 'normal' | 'large' | 'xlarge';

export interface ChatFontSizeOption {
  id: ChatFontSize;
  label: string;
  px: number;
  description: string;
  bubbleClass: string;
}

export const CHAT_FONT_SIZE_OPTIONS: ChatFontSizeOption[] = [
  { id: 'small', label: 'Compact', px: 11, description: 'High information density, fits more lines on screen', bubbleClass: 'text-[11px] leading-snug' },
  { id: 'normal', label: 'Balanced', px: 12, description: 'Default standard typography, optimal for most devices', bubbleClass: 'text-xs leading-relaxed' },
  { id: 'large', label: 'Comfortable', px: 14, description: 'Larger text, reduces eye strain on mobile displays', bubbleClass: 'text-sm leading-relaxed' },
  { id: 'xlarge', label: 'Large', px: 16, description: 'High accessibility sizing, maximum reading clarity', bubbleClass: 'text-base leading-normal' },
];

const STORAGE_KEY = 'hermes_chat_font_size';

export function getChatFontSize(): ChatFontSize {
  if (typeof window === 'undefined') return 'normal';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved === 'small' || saved === 'normal' || saved === 'large' || saved === 'xlarge')) {
      return saved as ChatFontSize;
    }
  } catch (_) {}
  return 'normal';
}

export function setChatFontSize(size: ChatFontSize): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, size);
    document.documentElement.setAttribute('data-chat-size', size);
  } catch (_) {}
}
