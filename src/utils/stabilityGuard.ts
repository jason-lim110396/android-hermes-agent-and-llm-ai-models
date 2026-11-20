// Lightweight stability guard for mobile runtime.
export function isLowMemoryDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as any).deviceMemory;
  return typeof mem === 'number' && mem <= 4;
}

export function shouldThrottleInference(): boolean {
  return isLowMemoryDevice();
}
