// CPU guard helper for mobile inference.
export function isLowCpu(cores: number): boolean {
  return cores <= 4;
}
