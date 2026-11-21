// Memory guard helper for mobile inference and WebView stability.
export function isLowMemory(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as any).deviceMemory;
  return typeof mem === 'number' && mem <= 4;
}

export interface HeapMemoryStats {
  usedJSHeapMB: number;
  totalJSHeapMB: number;
  jsHeapLimitMB: number;
  usageRatio: number;
}

/**
 * Returns real JS heap memory metrics when exposed by the Chromium / Android WebView.
 * Returns null in environments that restrict performance.memory.
 */
export function getHeapMemoryStats(): HeapMemoryStats | null {
  if (typeof window === 'undefined') return null;
  const perf = (window.performance as any)?.memory;
  if (!perf || typeof perf.usedJSHeapSize !== 'number' || typeof perf.jsHeapSizeLimit !== 'number') {
    return null;
  }
  const used = Math.round(perf.usedJSHeapSize / (1024 * 1024));
  const total = Math.round(perf.totalJSHeapSize / (1024 * 1024));
  const limit = Math.round(perf.jsHeapSizeLimit / (1024 * 1024));
  const ratio = limit > 0 ? perf.usedJSHeapSize / perf.jsHeapSizeLimit : 0;
  return {
    usedJSHeapMB: used,
    totalJSHeapMB: total,
    jsHeapLimitMB: limit,
    usageRatio: Math.round(ratio * 100) / 100,
  };
}

/**
 * True when device RAM is <= 4GB or when active JS heap consumption exceeds 80%
 * of the WebView heap limit. Used to trigger aggressive DOM windowing and drop
 * heavy cached preview buffers before Android LMK kills the process.
 */
export function isCriticalMemoryPressure(): boolean {
  if (isLowMemory()) return true;
  const stats = getHeapMemoryStats();
  if (stats && stats.usageRatio >= 0.8) return true;
  return false;
}
