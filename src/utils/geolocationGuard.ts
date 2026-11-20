// Geolocation guard helper for mobile.
export function hasGeolocation(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'geolocation' in navigator;
}
