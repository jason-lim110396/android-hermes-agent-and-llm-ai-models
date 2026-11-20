// Sensor guard helper for mobile telemetry.
export function hasSensors(): boolean {
  if (typeof window === 'undefined') return false;
  return 'DeviceOrientationEvent' in window;
}
