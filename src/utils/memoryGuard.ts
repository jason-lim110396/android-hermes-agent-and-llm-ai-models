// Memory guard helper for mobile inference.
export function isLowMemory(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as any).deviceMemory;
  return typeof mem === 'number' && mem <= 4;
}
