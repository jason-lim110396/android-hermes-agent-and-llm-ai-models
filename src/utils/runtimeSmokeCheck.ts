// Lightweight runtime smoke checks for production readiness on mobile.
export interface SmokeCheckResult {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
}

export async function runRuntimeSmokeChecks(): Promise<SmokeCheckResult> {
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  checks.push({ name: 'WebGPU', ok: hasWebGpu, detail: hasWebGpu ? 'Available' : 'Missing (CPU fallback)' });

  const hasIndexedDb = typeof indexedDB !== 'undefined';
  checks.push({ name: 'IndexedDB', ok: hasIndexedDb, detail: hasIndexedDb ? 'Available' : 'Missing' });

  let fetchOk = false;
  try {
    const res = await fetch('https://1.1.1.1/cdn-cgi/trace', { mode: 'no-cors', cache: 'no-store' });
    fetchOk = true;
  } catch (_) {
    fetchOk = false;
  }
  checks.push({ name: 'Network Fetch', ok: fetchOk, detail: fetchOk ? 'OK' : 'Offline or blocked' });

  const ok = checks.every((c) => c.ok);
  return { ok, checks };
}
