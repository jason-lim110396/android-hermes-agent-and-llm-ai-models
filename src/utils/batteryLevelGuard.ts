// Battery level guard helper for mobile.
export function isBatteryCritical(level: number): boolean {
  return level <= 10;
}
