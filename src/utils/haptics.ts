/**
 * Safe mobile haptic feedback utility for Android / Web environments.
 * Eliminates unguarded navigator.vibrate calls and prevents ReferenceErrors
 * in SSR, worker, or unsupported WebView contexts.
 */

export type HapticPattern =
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error'
  | 'complete'
  | 'code_exec'
  | 'bookmark'
  | 'copy'
  | 'alert';

export type HapticIntensity = 'off' | 'subtle' | 'crisp' | 'normal' | 'heavy';

const STORAGE_KEY_HAPTIC_INTENSITY = 'hermes_haptic_intensity';

export const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  selection: 15,
  light: 20,
  medium: 35,
  heavy: 60,
  success: [30, 40, 30],
  warning: [40, 60, 40],
  error: [60, 40, 60, 40],
  complete: [20, 35, 20],
  code_exec: [15, 25, 45],
  bookmark: [10, 40, 15],
  copy: [15, 25],
  alert: [50, 60, 50, 60],
};

const INTENSITY_MULTIPLIERS: Record<HapticIntensity, number> = {
  off: 0,
  subtle: 0.6,
  crisp: 0.8,
  normal: 1.0,
  heavy: 1.5,
};

export function getHapticIntensity(): HapticIntensity {
  if (typeof window === 'undefined' || !window.localStorage) return 'normal';
  try {
    const saved = localStorage.getItem(STORAGE_KEY_HAPTIC_INTENSITY);
    if (saved && (saved === 'off' || saved === 'subtle' || saved === 'crisp' || saved === 'normal' || saved === 'heavy')) {
      return saved as HapticIntensity;
    }
  } catch (_) {}
  return 'normal';
}

export function setHapticIntensity(intensity: HapticIntensity): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY_HAPTIC_INTENSITY, intensity);
  } catch (_) {}
}

/**
 * Scales a duration or pattern array by the active intensity factor.
 */
function scalePattern(pattern: number | number[], multiplier: number): number | number[] {
  if (Array.isArray(pattern)) {
    return pattern.map((ms, idx) => (idx % 2 === 0 ? Math.max(5, Math.round(ms * multiplier)) : ms));
  }
  return Math.max(5, Math.round(pattern * multiplier));
}

/**
 * Triggers safe haptic vibration on mobile devices.
 * Always guards with typeof navigator !== 'undefined' and try/catch.
 * Respects user's haptic intensity preference (returns false immediately if intensity is 'off').
 * Returns true if the vibration was successfully dispatched.
 */
export function triggerHaptic(pattern: HapticPattern | number | number[] = 'light'): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  const intensity = getHapticIntensity();
  if (intensity === 'off') {
    return false;
  }

  const multiplier = INTENSITY_MULTIPLIERS[intensity] ?? 1.0;

  try {
    const raw = typeof pattern === 'string' ? (HAPTIC_PATTERNS[pattern] ?? 20) : pattern;
    const scaled = scalePattern(raw, multiplier);
    return navigator.vibrate(scaled);
  } catch (_) {
    return false;
  }
}

/** Check if the current device/browser supports vibration */
export function hasVibration(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}
