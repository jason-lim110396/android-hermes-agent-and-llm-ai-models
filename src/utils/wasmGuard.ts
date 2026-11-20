// WASM guard helper for mobile inference.
export function hasWasm(): boolean {
  if (typeof WebAssembly === 'undefined') return false;
  return true;
}
