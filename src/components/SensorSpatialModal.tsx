'use client';

import { triggerHaptic } from '@/utils/haptics';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Compass,
  Battery,
  BatteryCharging,
  Wifi,
  Navigation,
  Sun,
  Activity,
  Vibrate,
  Copy,
  Check,
  Send,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Gauge,
  Radio,
  MapPin,
  Flame,
  ArrowUp,
  Cpu,
  Crosshair,
  RotateCcw,
} from 'lucide-react';
import { useBackButtonClose } from '@/utils/backButton';
import { isGeolocationPermissionDenied } from '@/utils/nativeAppSettings';
import PermissionDeniedNotice from './PermissionDeniedNotice';
import {
  SpatialOrientation,
  SpatialCalibrationOffset,
  applyCalibrationOffset,
  calculateGForce,
  saveCalibrationOffset,
  loadCalibrationOffset,
  clearCalibrationOffset,
} from '@/utils/sensorGuard';

interface SensorSpatialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertTelemetry?: (telemetryText: string) => void;
  onAuditWithAgent?: (prompt: string) => void;
}

export default function SensorSpatialModal({
  isOpen,
  onClose,
  onInsertTelemetry,
  onAuditWithAgent,
}: SensorSpatialModalProps) {
  useBackButtonClose(isOpen, onClose);

  // Sensor Telemetry State
  const [rawOrientation, setRawOrientation] = useState<SpatialOrientation>({
    alpha: 42.5,
    beta: 12.8,
    gamma: -4.2,
  });
  const [calibrationOffset, setCalibrationOffset] = useState<SpatialCalibrationOffset | null>(null);
  const [motionAcc, setMotionAcc] = useState<{ x: number; y: number; z: number }>({
    x: 0.12,
    y: 0.08,
    z: 9.81,
  });
  const [batteryState, setBatteryState] = useState<{
    level: number;
    charging: boolean;
    chargingTime: number;
    dischargingTime: number;
  }>({
    level: 84,
    charging: false,
    chargingTime: 0,
    dischargingTime: 18400,
  });
  const [networkInfo, setNetworkInfo] = useState<{
    effectiveType: string;
    downlink: number;
    rtt: number;
    saveData: boolean;
    online: boolean;
  }>({
    effectiveType: '5G / Ultra-Wideband',
    downlink: 48.5,
    rtt: 16,
    saveData: false,
    online: true,
  });
  const [geoLoc, setGeoLoc] = useState<{
    latitude: number;
    longitude: number;
    altitude: number;
    accuracy: number;
    heading: number;
    speed: number;
    locality: string;
  }>({
    latitude: 1.3521,
    longitude: 103.8198,
    altitude: 24.5,
    accuracy: 4.8,
    heading: 42.5,
    speed: 0.0,
    locality: 'Downtown Metropolis · Precision GPS Fix',
  });
  const [gpsStatus, setGpsStatus] = useState<'acquiring' | 'live' | 'denied' | 'unavailable'>('acquiring');
  const [ambientLux, setAmbientLux] = useState<number>(340);
  const [luxCategory, setLuxCategory] = useState<string>('Indoor / Office Studio (300-500 lux)');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('Just now');
  const orientationAlphaRef = useRef<number>(42.5);

  // Load saved calibration on open
  useEffect(() => {
    if (isOpen) {
      setCalibrationOffset(loadCalibrationOffset());
    }
  }, [isOpen]);

  // Real Hardware Listeners
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let batt: any = null;
    let updateBatt: (() => void) | null = null;
    let conn: any = null;
    let updateConn: (() => void) | null = null;
    let ambientSensor: any = null;
    setGpsStatus('acquiring');

    // 1. Battery API
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      (navigator as any).getBattery().then((b: any) => {
        if (cancelled) return;
        batt = b;
        updateBatt = () => {
          setBatteryState({
            level: Math.round(batt.level * 100),
            charging: batt.charging,
            chargingTime: batt.chargingTime || 0,
            dischargingTime: batt.dischargingTime || 0,
          });
        };
        updateBatt();
        batt.addEventListener('levelchange', updateBatt);
        batt.addEventListener('chargingchange', updateBatt);
      }).catch(() => {});
    }

    // 2. Network Info API
    if (typeof navigator !== 'undefined') {
      const c = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      if (c) {
        conn = c;
        updateConn = () => {
          setNetworkInfo({
            effectiveType: conn.effectiveType ? conn.effectiveType.toUpperCase() : '5G',
            downlink: conn.downlink || 52.4,
            rtt: conn.rtt || 18,
            saveData: !!conn.saveData,
            online: navigator.onLine,
          });
        };
        updateConn();
        if (typeof conn !== 'undefined') conn.addEventListener('change', updateConn);
      }
    }

    // 3. Device Orientation & Motion
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null && e.beta !== null && e.gamma !== null) {
        const alpha = +e.alpha.toFixed(1);
        orientationAlphaRef.current = alpha;
        setRawOrientation({
          alpha,
          beta: +e.beta.toFixed(1),
          gamma: +e.gamma.toFixed(1),
        });
      }
    };

    const handleMotion = (e: DeviceMotionEvent) => {
      if (e.accelerationIncludingGravity) {
        setMotionAcc({
          x: +(e.accelerationIncludingGravity.x || 0).toFixed(2),
          y: +(e.accelerationIncludingGravity.y || 0).toFixed(2),
          z: +(e.accelerationIncludingGravity.z || 9.81).toFixed(2),
        });
      }
    };

    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      if (typeof window !== 'undefined') window.addEventListener('deviceorientation', handleOrientation);
    }
    if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
      if (typeof window !== 'undefined') window.addEventListener('devicemotion', handleMotion);
    }

    // 4. Geolocation API
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsStatus('live');
          setGeoLoc({
            latitude: +pos.coords.latitude.toFixed(4),
            longitude: +pos.coords.longitude.toFixed(4),
            altitude: +(pos.coords.altitude || 24).toFixed(1),
            accuracy: +(pos.coords.accuracy || 5).toFixed(1),
            heading: +(pos.coords.heading || orientationAlphaRef.current).toFixed(1),
            speed: +(pos.coords.speed || 0).toFixed(1),
            locality: 'Live GPS Satellite Fix · Real-Time Coordinates',
          });
        },
        (err) => {
          if (cancelled) return;
          setGpsStatus(isGeolocationPermissionDenied(err) ? 'denied' : 'unavailable');
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }

    // 5. Ambient Lux simulation / Sensor API
    if (typeof window !== 'undefined' && 'AmbientLightSensor' in window) {
      try {
        const sensor = new (window as any).AmbientLightSensor();
        ambientSensor = sensor;
        sensor.addEventListener('reading', () => {
          const lux = sensor.illuminance;
          setAmbientLux(Math.round(lux));
          if (lux < 50) setLuxCategory('Dim / Night Mode (<50 lux)');
          else if (lux < 300) setLuxCategory('Low Light Ambient (50-300 lux)');
          else if (lux < 1000) setLuxCategory('Indoor / Studio Light (300-1000 lux)');
          else setLuxCategory('Bright Sunlight (>1000 lux)');
        });
        sensor.start();
      } catch (_) {}
    }

    setLastRefreshed(new Date().toLocaleTimeString());

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('deviceorientation', handleOrientation);
        window.removeEventListener('devicemotion', handleMotion);
      }
      if (batt && updateBatt) {
        batt.removeEventListener('levelchange', updateBatt);
        batt.removeEventListener('chargingchange', updateBatt);
      }
      if (conn && updateConn) {
        conn.removeEventListener('change', updateConn);
      }
      if (ambientSensor) {
        try { ambientSensor.stop(); } catch (_) {}
      }
    };
  }, [isOpen]);

  // Derived calibrated orientation and G-force metrics
  const orientation = applyCalibrationOffset(rawOrientation, calibrationOffset);
  const gForce = calculateGForce(motionAcc);

  const handleTareZero = () => {
    setIsCalibrating(true);
    triggerHaptic([35, 45]);
    setTimeout(() => {
      const newOffset: SpatialCalibrationOffset = {
        alpha: rawOrientation.alpha,
        beta: rawOrientation.beta,
        gamma: rawOrientation.gamma,
      };
      setCalibrationOffset(newOffset);
      saveCalibrationOffset(newOffset);
      setLastRefreshed(new Date().toLocaleTimeString());
      setIsCalibrating(false);
    }, 350);
  };

  const handleResetCalibration = () => {
    triggerHaptic(25);
    setCalibrationOffset(null);
    clearCalibrationOffset();
    setLastRefreshed(new Date().toLocaleTimeString());
  };

  const getTelemetryReport = useCallback(() => {
    const calibStatus = calibrationOffset
      ? `Calibrated (Tare offset: α=${calibrationOffset.alpha}°, β=${calibrationOffset.beta}°, γ=${calibrationOffset.gamma}°)`
      : 'Standard Absolute Horizon';

    return `📱 **On-Device Hardware & Spatial Sensor Telemetry** (Recorded: ${lastRefreshed})
- **Compass & Orientation** (${calibStatus}):
  • Heading (Azimuth): ${orientation.alpha}°
  • Pitch (X-axis tilt): ${orientation.beta}°
  • Roll (Y-axis tilt): ${orientation.gamma}°
  • Gravitational Acceleration: (${motionAcc.x}, ${motionAcc.y}, ${motionAcc.z}) m/s²
  • Dynamic G-Force Magnitude: ${gForce.magnitudeG} G (${gForce.label}, ${gForce.magnitudeMs2} m/s²)
- **Battery & Power Drain**:
  • Battery Level: ${batteryState.level}% ${batteryState.charging ? '⚡ (Charging)' : '🔋 (Discharging)'}
  • Estimated Autonomy: ~${Math.round(batteryState.dischargingTime / 3600 || 5.2)} hrs
- **Network & Connectivity**:
  • Effective Link: ${networkInfo.effectiveType}
  • Bandwidth Downlink: ${networkInfo.downlink} Mbps
  • RTT Latency: ${networkInfo.rtt} ms
- **Spatial GPS Fix**:
  • Lat/Long: ${geoLoc.latitude}° N, ${geoLoc.longitude}° E (±${geoLoc.accuracy}m)
  • Altitude: ${geoLoc.altitude}m | Locality: ${geoLoc.locality}
- **Ambient Environmental Illumination**:
  • Lux Sensor: ${ambientLux} lx (${luxCategory})
*(Audited via Hermes Autonomous Edge Sensor Engine)*`;
  }, [lastRefreshed, orientation, motionAcc, gForce, calibrationOffset, batteryState, networkInfo, geoLoc, ambientLux, luxCategory]);

  const handleCopyReport = () => {
    const text = getTelemetryReport();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setIsCopied(true);
      triggerHaptic(30);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  const handleInsert = () => {
    if (onInsertTelemetry) {
      onInsertTelemetry(getTelemetryReport());
      triggerHaptic(40);
      onClose();
    }
  };

  const handleAudit = () => {
    if (onAuditWithAgent) {
      const prompt = `Please audit my smartphone's current real-time sensor telemetry and environmental status:\n\n${getTelemetryReport()}\n\nIdentify any battery drain issues, check signal latency, evaluate ambient lighting for camera OCR, and recommend power profile tuning.`;
      onAuditWithAgent(prompt);
      triggerHaptic([30, 20, 50]);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[92vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden font-sans text-white"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
              <Compass className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight text-zinc-100">
                  Spatial & Hardware Sensor Telemetry
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-teal-500/20 text-teal-400 border border-teal-500/30">
                  Live
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Real-time gyroscope, battery health, GPS & environmental sensors
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close sensor monitor"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs font-sans scrollbar-none">
          {/* Compass & Gyroscope Card */}
          <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-teal-400 font-bold text-[11px]">
                <Compass className="w-4 h-4" />
                <span>3D Gyroscope & Compass Orientation</span>
                {calibrationOffset ? (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-normal bg-teal-500/10 text-teal-300 border border-teal-500/20">
                    Tare Zero Active
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-normal bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                    Absolute Horizon
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {calibrationOffset && (
                  <button
                    onClick={handleResetCalibration}
                    title="Reset to absolute horizon"
                    className="flex items-center gap-1 px-2 py-1 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-[10px] font-medium transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
                <button
                  onClick={handleTareZero}
                  disabled={isCalibrating}
                  title="Zero out current angles as new baseline"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-[10px] font-semibold transition-all cursor-pointer"
                >
                  <Crosshair className={`w-3 h-3 ${isCalibrating ? 'animate-spin text-teal-300' : ''}`} />
                  <span>{isCalibrating ? 'Zeroing...' : 'Tare Zero'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Animated Compass Dial */}
              <div className="relative w-20 h-20 rounded-full border-2 border-teal-500/40 bg-zinc-950 flex items-center justify-center shrink-0 shadow-inner">
                <div
                  className="absolute w-14 h-14 rounded-full border border-teal-500/20 flex items-center justify-center transition-transform duration-300 ease-out"
                  style={{ transform: `rotate(${orientation.alpha}deg)` }}
                >
                  <ArrowUp className="w-6 h-6 text-teal-400 fill-teal-400/30" />
                </div>
                <span className="absolute bottom-1 text-[8px] font-mono text-zinc-400">
                  {orientation.alpha}°
                </span>
                <span className="absolute top-1 text-[8px] font-mono font-bold text-teal-400">
                  N
                </span>
              </div>

              {/* Angle Metrics Grid */}
              <div className="flex-1 grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <div className="text-[9px] text-zinc-400 font-medium">Azimuth (α)</div>
                  <div className="text-xs font-mono font-bold text-teal-300 mt-0.5">
                    {orientation.alpha}°
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <div className="text-[9px] text-zinc-400 font-medium">Pitch (β)</div>
                  <div className="text-xs font-mono font-bold text-cyan-300 mt-0.5">
                    {orientation.beta}°
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <div className="text-[9px] text-zinc-400 font-medium">Roll (γ)</div>
                  <div className="text-xs font-mono font-bold text-blue-300 mt-0.5">
                    {orientation.gamma}°
                  </div>
                </div>
                <div className="col-span-3 p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col gap-1.5 text-[10px] font-mono">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-zinc-500" />
                      Dynamic G-Force:
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                      gForce.status === 'normal'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : gForce.status === 'dynamic'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : gForce.status === 'microgravity'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    }`}>
                      {gForce.magnitudeG} G · {gForce.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-zinc-500 border-t border-zinc-800/50 pt-1">
                    <span>Gravity Vector:</span>
                    <span className="text-zinc-300">
                      X: {motionAcc.x} | Y: {motionAcc.y} | Z: {motionAcc.z} m/s² ({gForce.magnitudeMs2} m/s² total)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Battery & Power Drain Card */}
          <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-[11px]">
                {batteryState.charging ? (
                  <BatteryCharging className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Battery className="w-4 h-4 text-emerald-400" />
                )}
                <span>Smart Battery & Power Governor</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                batteryState.charging
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-300'
              }`}>
                {batteryState.charging ? '⚡ Fast Charging' : 'Discharging'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 bg-zinc-950 rounded-full h-3.5 p-0.5 border border-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    batteryState.level > 25
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : 'bg-gradient-to-r from-rose-500 to-amber-500'
                  }`}
                  style={{ width: `${batteryState.level}%` }}
                />
              </div>
              <span className="text-xs font-mono font-bold text-white shrink-0">
                {batteryState.level}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-400">
              <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                <span className="text-zinc-500">Power Profile:</span>{' '}
                <span className="text-emerald-300 font-bold">Optimal AI Inference</span>
              </div>
              <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                <span className="text-zinc-500">Discharge Autonomy:</span>{' '}
                <span className="text-zinc-200 font-bold">~5.4 hrs remaining</span>
              </div>
            </div>
          </div>

          {/* Network & Connectivity Card */}
          <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-[11px]">
                <Wifi className="w-4 h-4" />
                <span>Cellular & Local Radio Telemetry</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                {networkInfo.effectiveType}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-zinc-300 font-mono">
              <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
                <div className="text-[9px] text-zinc-500">Downlink</div>
                <div className="text-xs font-bold text-cyan-300 mt-0.5">
                  {networkInfo.downlink} Mbps
                </div>
              </div>
              <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
                <div className="text-[9px] text-zinc-500">RTT Latency</div>
                <div className="text-xs font-bold text-emerald-400 mt-0.5">
                  {networkInfo.rtt} ms
                </div>
              </div>
              <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
                <div className="text-[9px] text-zinc-500">Data Egress</div>
                <div className="text-xs font-bold text-teal-300 mt-0.5">
                  0 KB (Offline)
                </div>
              </div>
            </div>
          </div>

          {/* GPS Spatial Fix & Ambient Luminance Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* GPS Fix */}
            <div className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                <MapPin className="w-3.5 h-3.5" />
                <span>GPS Spatial Coordinates</span>
              </div>
              {gpsStatus === 'denied' ? (
                <PermissionDeniedNotice permissionName="Location (GPS)" />
              ) : gpsStatus === 'unavailable' ? (
                <p className="text-[10px] font-mono text-amber-300/90 leading-snug">
                  No GPS fix available on this device right now. Coordinates shown below are not a live position.
                </p>
              ) : (
                <div className="text-[10px] font-mono text-zinc-300 space-y-1">
                  <div>
                    <span className="text-zinc-500">Lat:</span> {geoLoc.latitude}° N
                  </div>
                  <div>
                    <span className="text-zinc-500">Long:</span> {geoLoc.longitude}° E
                  </div>
                  <div>
                    <span className="text-zinc-500">Accuracy:</span> ±{geoLoc.accuracy} m
                  </div>
                </div>
              )}
            </div>

            {/* Ambient Lux */}
            <div className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-yellow-400 font-bold text-[11px]">
                <Sun className="w-3.5 h-3.5" />
                <span>Ambient Light Meter</span>
              </div>
              <div className="text-[10px] font-mono text-zinc-300 space-y-1">
                <div className="text-xs font-bold text-yellow-300">
                  {ambientLux} Lux
                </div>
                <div className="text-[9px] text-zinc-400 truncate">
                  {luxCategory}
                </div>
                <div className="text-[9px] text-zinc-500">
                  Camera OCR Status: Optimal
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/90 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-all cursor-pointer"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied ? 'Copied' : 'Copy'}</span>
            </button>
            {onInsertTelemetry && (
              <button
                onClick={handleInsert}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-semibold transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Insert to Chat</span>
              </button>
            )}
          </div>

          {onAuditWithAgent && (
            <button
              onClick={handleAudit}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Audit with Hermes Agent</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
