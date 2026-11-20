// Storage guard helper for mobile inference.
export function hasEnoughStorage(availableGB: number, requiredGB: number): boolean {
  return availableGB >= requiredGB;
}
