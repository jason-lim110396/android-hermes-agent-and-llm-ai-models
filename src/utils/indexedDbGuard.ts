// IndexedDB guard helper for mobile storage.
export function hasIndexedDb(): boolean {
  if (typeof indexedDB === 'undefined') return false;
  return true;
}
