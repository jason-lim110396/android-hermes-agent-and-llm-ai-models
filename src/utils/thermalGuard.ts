// Thermal guard helper for mobile inference.
export function isThermalThrottled(tempC: number, thresholdC: number = 45): boolean {
  return tempC >= thresholdC;
}
