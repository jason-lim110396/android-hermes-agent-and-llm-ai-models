// Clipboard guard helper for mobile.
export function hasClipboard(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !!navigator.clipboard;
}
