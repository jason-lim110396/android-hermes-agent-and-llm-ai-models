// Thermal guard & adaptive frame-yield governor for mobile LLM inference.
// Protects mobile SoC / battery lifespan by monitoring junction temperature
// and dynamically pacing token emission to prevent aggressive hardware throttling.

export type ThermalState = 'nominal' | 'warm' | 'throttled';
export type ThermalGovernorMode = 'adaptive' | 'performance' | 'cool';

export interface ThermalTelemetry {
  temperatureC: number;
  state: ThermalState;
  governorMode: ThermalGovernorMode;
  warnThresholdC: number;
  criticalThresholdC: number;
  autoThrottleEnabled: boolean;
  yieldDelayMs: number;
}

type ThermalListener = (telemetry: ThermalTelemetry) => void;

let currentTempC = 37.0;
let governorMode: ThermalGovernorMode = 'adaptive';
let warnThresholdC = 41.5;
let criticalThresholdC = 45.0;
let autoThrottleEnabled = true;
const listeners = new Set<ThermalListener>();

export function getThermalTelemetry(): ThermalTelemetry {
  const state: ThermalState = currentTempC >= criticalThresholdC
    ? 'throttled'
    : currentTempC >= warnThresholdC
    ? 'warm'
    : 'nominal';

  let yieldDelayMs = 0;
  if (governorMode === 'performance') {
    yieldDelayMs = state === 'throttled' && autoThrottleEnabled ? 15 : 0;
  } else if (governorMode === 'cool') {
    yieldDelayMs = state === 'throttled' ? 45 : state === 'warm' ? 30 : 15;
  } else {
    // adaptive balanced
    yieldDelayMs = state === 'throttled' && autoThrottleEnabled
      ? 35
      : state === 'warm'
      ? 15
      : 0;
  }

  return {
    temperatureC: Math.round(currentTempC * 10) / 10,
    state,
    governorMode,
    warnThresholdC,
    criticalThresholdC,
    autoThrottleEnabled,
    yieldDelayMs,
  };
}

export function getThermalYieldDelay(): number {
  return getThermalTelemetry().yieldDelayMs;
}

export function setThermalGovernor(mode: ThermalGovernorMode): void {
  governorMode = mode;
  notifyThermalListeners();
}

export function updateThermalTelemetry(updates: {
  tempC?: number;
  warnThresholdC?: number;
  criticalThresholdC?: number;
  autoThrottleEnabled?: boolean;
}): void {
  if (typeof updates.tempC === 'number') currentTempC = updates.tempC;
  if (typeof updates.warnThresholdC === 'number') warnThresholdC = updates.warnThresholdC;
  if (typeof updates.criticalThresholdC === 'number') criticalThresholdC = updates.criticalThresholdC;
  if (typeof updates.autoThrottleEnabled === 'boolean') autoThrottleEnabled = updates.autoThrottleEnabled;
  notifyThermalListeners();
}

export function subscribeThermalTelemetry(listener: ThermalListener): () => void {
  listeners.add(listener);
  listener(getThermalTelemetry());
  return () => {
    listeners.delete(listener);
  };
}

function notifyThermalListeners(): void {
  const current = getThermalTelemetry();
  listeners.forEach((fn) => {
    try {
      fn(current);
    } catch (_) {}
  });
}

export function isThermalThrottled(tempC?: number, thresholdC: number = 45): boolean {
  const temp = typeof tempC === 'number' ? tempC : currentTempC;
  return temp >= thresholdC;
}

export async function yieldThermalFrame(): Promise<number> {
  const delay = getThermalYieldDelay();
  if (delay > 0) {
    await new Promise((res) => setTimeout(res, delay));
  }
  return delay;
}
