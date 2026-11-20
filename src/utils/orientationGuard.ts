// Orientation guard helper for mobile.
export function hasOrientationEvents(): boolean {
  if (typeof window === 'undefined') return false;
  return 'DeviceOrientationEvent' in window;
}
