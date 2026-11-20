// GPU guard helper for mobile inference.
export function hasWebGpu(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'gpu' in navigator;
}
