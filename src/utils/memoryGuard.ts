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

export type MemoryPressureLevel = 'nominal' | 'elevated' | 'critical';

export interface MemoryTelemetry {
  pressureLevel: MemoryPressureLevel;
  heapStats: HeapMemoryStats | null;
  deviceRamGB: number | null;
  isLowMemoryDevice: boolean;
  recommendation: string;
}

/**
 * Returns comprehensive memory telemetry for the active session.
 */
export function getMemoryTelemetry(): MemoryTelemetry {
  const heap = getHeapMemoryStats();
  const lowMem = isLowMemory();
  const devRam = typeof navigator !== 'undefined' && typeof (navigator as any).deviceMemory === 'number'
    ? (navigator as any).deviceMemory
    : null;

  let pressureLevel: MemoryPressureLevel = 'nominal';
  let recommendation = 'Memory levels nominal. Safe for on-device inference.';

  if (heap && heap.usageRatio >= 0.85) {
    pressureLevel = 'critical';
    recommendation = 'Critical JS heap pressure (>85%). Unload inactive models or purge cache to prevent WebView crash.';
  } else if ((heap && heap.usageRatio >= 0.7) || (lowMem && devRam && devRam <= 3)) {
    pressureLevel = 'elevated';
    recommendation = 'Elevated memory usage. Close background tabs or heavy vision previews for optimal speed.';
  } else if (lowMem) {
    pressureLevel = 'elevated';
    recommendation = 'Device has 4GB or less RAM. Stick to models with <= 4GB minimum RAM requirements.';
  }

  return {
    pressureLevel,
    heapStats: heap,
    deviceRamGB: devRam,
    isLowMemoryDevice: lowMem,
    recommendation,
  };
}

/**
 * Evaluates whether loading or downloading a model with minRamGB requirement
 * is safe given the current device hardware and JS heap pressure.
 */
export function evaluateModelMemorySafety(
  modelMinRamGB: number,
  estimatedRamGB?: number,
  heapStats?: HeapMemoryStats | null
): {
  safe: boolean;
  warning?: string;
  critical: boolean;
} {
  const effectiveRam = estimatedRamGB ?? (typeof navigator !== 'undefined' ? (navigator as any).deviceMemory : undefined);
  const heap = heapStats ?? getHeapMemoryStats();

  if (effectiveRam && effectiveRam < modelMinRamGB) {
    const delta = modelMinRamGB - effectiveRam;
    return {
      safe: false,
      critical: delta >= 2,
      warning: `Model requires ~${modelMinRamGB}GB RAM but device reports ~${effectiveRam}GB. High risk of low-memory eviction or out-of-memory abort.`,
    };
  }

  if (heap && heap.usageRatio >= 0.8) {
    return {
      safe: false,
      critical: true,
      warning: `WebView heap usage is high (${Math.round(heap.usageRatio * 100)}%). Purge cached models before launching to avoid process kill.`,
    };
  }

  if (modelMinRamGB > 4 && isLowMemory()) {
    return {
      safe: false,
      critical: false,
      warning: `Low device memory profile detected (<=4GB). Execution may be throttled.`,
    };
  }

  return { safe: true, critical: false };
}

/**
 * Triggers a cooperative memory cleanup hint across components.
 * Notifies components to drop cached preview image buffers, canvas contexts, and call gc hint if exposed.
 */
export function triggerMemoryCleanupHint(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hermes:memory-cleanup'));
    // If running in Chromium with --expose-gc enabled:
    if (typeof (window as any).gc === 'function') {
      try {
        (window as any).gc();
      } catch {
        // Ignore restricted gc calls
      }
    }
  }
}

/**
 * Explicit notification to trigger immediate cooperative memory trimming across components.
 */
export function notifyMemoryPressureTrim(source = 'general'): void {
  console.warn(`[MemoryGuard] Memory trim requested by ${source}`);
  triggerMemoryCleanupHint();
}

let memoryWatcherTimer: ReturnType<typeof setInterval> | null = null;
let lastCleanupTriggerTime = 0;

/**
 * Proactively checks JS heap memory pressure every 15s. If usageRatio >= 0.85
 * (or device memory <= 4GB and heap ratio >= 0.75), triggers cooperative cleanup
 * to prevent Android WebView Out-Of-Memory process termination.
 * Also registers visibilitychange and pagehide listeners to shed memory on backgrounding.
 */
export function startProactiveMemoryWatcher(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (memoryWatcherTimer) return () => {};

  memoryWatcherTimer = setInterval(() => {
    const stats = getHeapMemoryStats();
    if (!stats) return;
    const now = Date.now();
    // Prevent triggering more than once every 30 seconds
    if (now - lastCleanupTriggerTime < 30_000) return;

    if (stats.usageRatio >= 0.85 || (isLowMemory() && stats.usageRatio >= 0.75)) {
      console.warn(
        `[MemoryGuard] Critical heap pressure detected (${Math.round(stats.usageRatio * 100)}% of limit). Triggering proactive memory trim.`
      );
      lastCleanupTriggerTime = now;
      triggerMemoryCleanupHint();
    }
  }, 15_000);

  const handleVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      const stats = getHeapMemoryStats();
      const lowMem = isLowMemory();
      if (lowMem || (stats && stats.usageRatio >= 0.7)) {
        triggerMemoryCleanupHint();
      }
    }
  };

  const handlePageHide = () => {
    triggerMemoryCleanupHint();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', handlePageHide);
  }

  return () => {
    if (memoryWatcherTimer) {
      clearInterval(memoryWatcherTimer);
      memoryWatcherTimer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', handlePageHide);
    }
  };
}
