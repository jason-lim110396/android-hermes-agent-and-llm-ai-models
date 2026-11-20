// Web Share guard helper for mobile.
export function hasNativeShare(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'share' in navigator;
}
