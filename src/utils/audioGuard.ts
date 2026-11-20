// Audio guard helper for mobile inference.
export function hasAudio(): boolean {
  if (typeof window === 'undefined') return false;
  return 'AudioContext' in window || 'webkitAudioContext' in window;
}
