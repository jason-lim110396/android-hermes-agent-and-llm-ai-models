// Battery guard helper for mobile inference.
export function isLowBattery(level: number): boolean {
  return level < 20;
}
