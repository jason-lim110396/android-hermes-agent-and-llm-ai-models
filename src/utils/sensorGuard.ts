// Sensor guard helper for mobile telemetry, calibration, and G-force calculation.

export interface SpatialOrientation {
  alpha: number; // Azimuth [0, 360)
  beta: number;  // Pitch [-180, 180]
  gamma: number; // Roll [-90, 90]
}

export interface SpatialCalibrationOffset {
  alpha: number;
  beta: number;
  gamma: number;
}

export interface GForceMetrics {
  magnitudeMs2: number;
  magnitudeG: number;
  status: 'microgravity' | 'normal' | 'dynamic' | 'high';
  label: string;
}

const STORAGE_KEY_CALIBRATION = 'hermes_sensor_calibration_offset';

export function hasSensors(): boolean {
  if (typeof window === 'undefined') return false;
  return 'DeviceOrientationEvent' in window;
}

/**
 * Normalizes an angle into [0, 360) degrees.
 */
function normalizeDegrees(deg: number): number {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

/**
 * Apply calibration zero-offset to raw orientation readings.
 */
export function applyCalibrationOffset(
  raw: SpatialOrientation,
  offset: SpatialCalibrationOffset | null
): SpatialOrientation {
  if (!offset) return raw;

  return {
    alpha: +(normalizeDegrees(raw.alpha - offset.alpha)).toFixed(1),
    beta: +(raw.beta - offset.beta).toFixed(1),
    gamma: +(raw.gamma - offset.gamma).toFixed(1),
  };
}

/**
 * Calculate instantaneous total acceleration magnitude in m/s² and G-forces (where 1G ≈ 9.80665 m/s²).
 */
export function calculateGForce(acc: { x: number; y: number; z: number }): GForceMetrics {
  const magnitudeMs2 = +(Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z)).toFixed(2);
  const magnitudeG = +(magnitudeMs2 / 9.80665).toFixed(2);

  let status: GForceMetrics['status'] = 'normal';
  let label = 'Normal 1.0G (Earth Gravity)';

  if (magnitudeG < 0.45) {
    status = 'microgravity';
    label = 'Microgravity / Free-Fall';
  } else if (magnitudeG <= 1.25) {
    status = 'normal';
    label = 'Stable Resting (1.0G)';
  } else if (magnitudeG <= 2.0) {
    status = 'dynamic';
    label = 'Active Hand Motion';
  } else {
    status = 'high';
    label = 'High G-Force Impact';
  }

  return { magnitudeMs2, magnitudeG, status, label };
}

export function saveCalibrationOffset(offset: SpatialCalibrationOffset): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY_CALIBRATION, JSON.stringify(offset));
  } catch (_) {}
}

export function loadCalibrationOffset(): SpatialCalibrationOffset | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CALIBRATION);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.alpha === 'number' && typeof parsed?.beta === 'number' && typeof parsed?.gamma === 'number') {
      return parsed;
    }
  } catch (_) {}
  return null;
}

export function clearCalibrationOffset(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.removeItem(STORAGE_KEY_CALIBRATION);
  } catch (_) {}
}
