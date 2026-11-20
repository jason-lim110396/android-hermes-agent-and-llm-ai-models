// Vibration guard helper for mobile haptics.
export function hasVibration(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'vibrate' in navigator;
}
