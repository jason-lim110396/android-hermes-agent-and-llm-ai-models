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
  | 'error';

export const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  selection: 15,
  light: 20,
  medium: 35,
  heavy: 60,
  success: [30, 40, 30],
  warning: [40, 60, 40],
  error: [60, 40, 60, 40],
};

/**
 * Triggers safe haptic vibration on mobile devices.
 * Always guards with typeof navigator !== 'undefined' and try/catch.
 * Returns true if the vibration was successfully dispatched.
 */
export function triggerHaptic(pattern: HapticPattern | number | number[] = 'light'): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  try {
    const vib = typeof pattern === 'string' ? (HAPTIC_PATTERNS[pattern] ?? 20) : pattern;
    return navigator.vibrate(vib);
  } catch (_) {
    return false;
  }
}

/** Check if the current device/browser supports vibration */
export function hasVibration(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}
