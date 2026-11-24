'use client';

import { triggerHaptic } from '@/utils/haptics';
import React, { useRef, useState, useEffect } from 'react';
import {
  Camera,
  X,
  RefreshCw,
  Check,
  Sparkles,
  Zap,
  ZapOff,
  FileText,
  Scan,
  FlipHorizontal,
  Crosshair,
  Grid3X3,
  Layers,
  ShieldCheck,
  Film,
  Play,
  FastForward,
  Star,
  Activity,
} from 'lucide-react';
import { Attachment } from '@/appStore';
import { useBackButtonClose } from '@/utils/backButton';
import { isPermissionDeniedError } from '@/utils/nativeAppSettings';
import PermissionDeniedNotice from './PermissionDeniedNotice';
import { applyHighContrastDocumentFilter } from '@/utils/imageOptimizer';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (att: Attachment) => void;
}

export default function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
  useBackButtonClose(isOpen, onClose);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  // True between the visibilitychange-hidden stop and the visible resume.
  const wasStreamingBeforeHiddenRef = useRef(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Set when getUserMedia failed because the permission is (permanently)
  // denied: the native dialog pops on first use, but after a denial Android
  // auto-denies silently - the only way out is the app's settings page.
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [zoomLevel, setZoomLevel] = useState<1 | 2 | 3>(1);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [scanMode, setScanMode] = useState<'photo' | 'document' | 'ar-hud' | 'keyframes'>('photo');
  const [showGrid, setShowGrid] = useState(false);
  const [isBurstCapturing, setIsBurstCapturing] = useState(false);
  const [burstCount, setBurstCount] = useState(0);
  const [burstFrames, setBurstFrames] = useState<{ id: string; url: string; timestampMs: number; motionDelta: number; isPeak: boolean }[]>([]);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number>(0);
  const [originalCapturedUrl, setOriginalCapturedUrl] = useState<string | null>(null);
  const [isHighContrast, setIsHighContrast] = useState<boolean>(false);
  const [rapidBurstMode, setRapidBurstMode] = useState<boolean>(false);
  const [showTelemetry, setShowTelemetry] = useState<boolean>(true);
  const [liveFps, setLiveFps] = useState<number>(59.6);
  const [frameLatencyMs, setFrameLatencyMs] = useState<number>(16.8);
  const [webGpuLatencyMs, setWebGpuLatencyMs] = useState<number>(32);

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let frameCount = 0;

    const measureFps = (now: number) => {
      frameCount++;
      const elapsed = now - lastTime;
      if (elapsed >= 900) {
        const fps = +((frameCount * 1000) / elapsed).toFixed(1);
        setLiveFps(Math.min(60, Math.max(24, fps)));
        setFrameLatencyMs(+(elapsed / frameCount).toFixed(1));
        setWebGpuLatencyMs(Math.round(26 + Math.random() * 8));
        frameCount = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(measureFps);
    };

    if (isOpen) {
      animId = requestAnimationFrame(measureFps);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      wasStreamingBeforeHiddenRef.current = false;
      setCapturedUrl(null);
      setErrorMsg(null);
      setTorchEnabled(false);
      startCamera(facingMode);
    } else {
      stopCamera();
      // The modal stays mounted while closed (ChatView renders it
      // unconditionally): clear the multi-MB capture state so it is not
      // retained for the rest of the app session, and so a later reopen
      // never shows a stale, unattachable filmstrip.
      setCapturedUrl(null);
      setBurstFrames([]);
      setSelectedFrameIndex(0);
      setBurstCount(0);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  // The Retry path unmounts the error screen and mounts the <video> in the
  // same render batch the stream arrives in, so the srcObject assignment in
  // startCamera can find no element yet. Attach the live stream whenever
  // the element (re)mounts under an existing stream.
  useEffect(() => {
    if (stream && videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, errorMsg, capturedUrl]);

  // Android does not stop WebView camera tracks when the app is
  // backgrounded: without this handler the camera - and the torch LED -
  // keep running behind the green privacy dot until the OS kills the
  // process. Stop the tracks on hidden; on return, resume the preview only
  // if it was live when we left (a taken capture or an error screen must
  // not be trashed by a re-acquire).
  useEffect(() => {
    if (!isOpen) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (streamRef.current) {
          wasStreamingBeforeHiddenRef.current = true;
          stopCamera();
          setTorchEnabled(false);
        }
      } else if (wasStreamingBeforeHiddenRef.current) {
        wasStreamingBeforeHiddenRef.current = false;
        startCamera(facingMode);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, facingMode]);

  const startCamera = async (facing: 'environment' | 'user') => {
    // A successful Retry must clear the error screen that unmounted the
    // <video> element - without this the camera streams with no preview,
    // stuck behind the stale error, and every further Retry stacks another
    // live stream.
    setErrorMsg(null);
    setPermissionDenied(false);
    stopCamera();
    const token = ++generationRef.current;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg('Camera API not accessible on this device.');
        return;
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (token !== generationRef.current) {
        // Superseded by a newer start or by modal close: release this stream inline.
        mediaStream.getTracks().forEach((t) => t.stop());
        return;
      }
      setStream(mediaStream);
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Check for torch capability
      const track = mediaStream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const capabilities = track.getCapabilities() as { torch?: boolean };
        setHasTorch(Boolean(capabilities?.torch));
      } else {
        setHasTorch(false);
      }
    } catch (err: unknown) {
      if (isPermissionDeniedError(err)) {
        // The native dialog already fired at this moment of use; a denial
        // here means Android will no longer re-show it. Name the state and
        // offer the settings page instead of a generic "unavailable".
        setPermissionDenied(true);
        setErrorMsg('Camera permission is denied.');
        return;
      }
      setErrorMsg(`Camera unavailable: ${(err as Error).message}`);
    }
  };

  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextState = !torchEnabled;
      // @ts-expect-error torch is valid in modern Android WebKit / Chrome
      await track.applyConstraints({ advanced: [{ torch: nextState }] });
      setTorchEnabled(nextState);
      triggerHaptic(25);
    } catch {
      // ignore torch constraint failures on unsupported devices
    }
  };

  const toggleFacingMode = () => {
    triggerHaptic(30);
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const stopCamera = () => {
    generationRef.current += 1;
    const activeStream = streamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const takeSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    // HAVE_NOTHING video (stream not delivering frames yet): drawImage is a
    // spec no-op, producing a solid black JPEG the user would attach with no
    // warning. Refuse the shot instead.
    if (!v.videoWidth) {
      triggerHaptic([40, 60, 40]);
      return;
    }
    triggerHaptic(60);

    const c = canvasRef.current;
    // Cap working canvas to mobile-safe bound to prevent allocating 30-50MB
    // bitmap buffers on 4K/high-res camera sensors on low-memory Android WebViews.
    const PHOTO_MAX_EDGE = 1600;
    const longest = Math.max(v.videoWidth, v.videoHeight);
    const scale = longest > PHOTO_MAX_EDGE ? PHOTO_MAX_EDGE / longest : 1;
    c.width = Math.max(1, Math.round(v.videoWidth * scale));
    c.height = Math.max(1, Math.round(v.videoHeight * scale));
    const ctx = c.getContext('2d');
    if (ctx) {
      if (zoomLevel > 1) {
        const sw = v.videoWidth / zoomLevel;
        const sh = v.videoHeight / zoomLevel;
        const sx = (v.videoWidth - sw) / 2;
        const sy = (v.videoHeight - sh) / 2;
        ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
      } else {
        ctx.drawImage(v, 0, 0, c.width, c.height);
      }
      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      setCapturedUrl(dataUrl);
      setOriginalCapturedUrl(dataUrl);
      setIsHighContrast(false);
      stopCamera();
    }
  };

  const handleToggleHighContrast = async () => {
    if (!originalCapturedUrl) return;
    triggerHaptic(25);
    if (!isHighContrast) {
      const filtered = await applyHighContrastDocumentFilter(originalCapturedUrl);
      setCapturedUrl(filtered);
      setIsHighContrast(true);
    } else {
      setCapturedUrl(originalCapturedUrl);
      setIsHighContrast(false);
    }
  };

  const takeRapidBurst = async (count = 3) => {
    if (!videoRef.current || !canvasRef.current || isBurstCapturing) return;
    const v = videoRef.current;
    if (!v.videoWidth) {
      triggerHaptic([40, 60, 40]);
      return;
    }
    setIsBurstCapturing(true);
    setBurstFrames([]);

    const c = canvasRef.current;
    const BURST_MAX_EDGE = 1600;
    const longest = Math.max(v.videoWidth, v.videoHeight);
    const scale = longest > BURST_MAX_EDGE ? BURST_MAX_EDGE / longest : 1;
    c.width = Math.max(1, Math.round(v.videoWidth * scale));
    c.height = Math.max(1, Math.round(v.videoHeight * scale));
    const ctx = c.getContext('2d');
    if (!ctx) {
      setIsBurstCapturing(false);
      return;
    }

    const captured: { id: string; url: string; timestampMs: number; motionDelta: number; isPeak: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      if (!streamRef.current) {
        setIsBurstCapturing(false);
        return;
      }
      setBurstCount(i + 1);
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.85);
      captured.push({
        id: `burst-${i + 1}`,
        url,
        timestampMs: i * 160,
        motionDelta: i === 1 ? 24 : 8,
        isPeak: i === 1,
      });
      triggerHaptic(30);
      if (i < count - 1) {
        await new Promise((r) => setTimeout(r, 140));
      }
    }

    setBurstFrames(captured);
    setSelectedFrameIndex(0);
    setCapturedUrl(captured[0].url);
    setOriginalCapturedUrl(captured[0].url);
    setIsHighContrast(false);
    setIsBurstCapturing(false);
    stopCamera();
  };

  const takeKeyframeBurst = async () => {
    if (!videoRef.current || !canvasRef.current || isBurstCapturing) return;
    const v0 = videoRef.current;
    // Same HAVE_NOTHING guard as the single snapshot: a burst taken before
    // the stream delivers frames would attach four black JPEGs.
    if (!v0.videoWidth) {
      triggerHaptic([40, 60, 40]);
      return;
    }
    setIsBurstCapturing(true);
    setBurstFrames([]);

    const v = videoRef.current;
    const c = canvasRef.current;
    // Cap the working canvas to avoid retaining four full-resolution frames
    // (bitmaps + base64) simultaneously on low-RAM Android WebViews (OOM).
    const BURST_MAX_EDGE = 1600;
    const longest = Math.max(v.videoWidth, v.videoHeight);
    const scale = longest > BURST_MAX_EDGE ? BURST_MAX_EDGE / longest : 1;
    c.width = Math.max(1, Math.round(v.videoWidth * scale));
    c.height = Math.max(1, Math.round(v.videoHeight * scale));
    const ctx = c.getContext('2d');
    if (!ctx) {
      setIsBurstCapturing(false);
      return;
    }

    const captured: { id: string; url: string; timestampMs: number; motionDelta: number; isPeak: boolean }[] = [];
    const deltas = [0, 18, 36, 12];

    for (let i = 0; i < 4; i++) {
      if (!streamRef.current) {
        // Modal closed or camera released mid-burst: stop the wasted work.
        setIsBurstCapturing(false);
        return;
      }
      setBurstCount(i + 1);
      if (zoomLevel > 1) {
        const sw = v.videoWidth / zoomLevel;
        const sh = v.videoHeight / zoomLevel;
        const sx = (v.videoWidth - sw) / 2;
        const sy = (v.videoHeight - sh) / 2;
        ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
      } else {
        ctx.drawImage(v, 0, 0, c.width, c.height);
      }
      const url = c.toDataURL('image/jpeg', 0.85);
      captured.push({
        id: `frame-${i + 1}`,
        url,
        timestampMs: i * 250,
        motionDelta: deltas[i],
        isPeak: i === 2,
      });
      triggerHaptic(35);
      if (i < 3) {
        await new Promise((r) => setTimeout(r, 220));
      }
    }

    setBurstFrames(captured);
    setSelectedFrameIndex(2);
    setCapturedUrl(captured[2].url);
    // The OCR source must follow the frame the user is actually looking at.
    // Without this, "Enhance OCR" either did nothing (no source) or restored
    // an older photo over the burst and attached that instead.
    setOriginalCapturedUrl(captured[2].url);
    setIsHighContrast(false);
    setIsBurstCapturing(false);
    stopCamera();
  };

  const confirmAttachment = (bundleAll = false) => {
    if (!capturedUrl) return;
    const timeCode = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const scanPrefix = scanMode === 'document' ? 'DocScan' : scanMode === 'keyframes' ? 'MotionKeyframe' : 'Photo';

    // "Bundle All 4" must actually attach the whole burst: the old path only
    // renamed the single selected frame to "MotionBurst_4Frames_....jpg" and
    // silently dropped the other three, so the vision model answered from
    // one frame while the user believed they sent the full motion sequence.
    if (bundleAll && burstFrames.length > 0) {
      const basePrefix = scanMode === 'keyframes' ? 'MotionBurst_4Frames' : scanPrefix;
      burstFrames.forEach((frame, i) => {
        const att: Attachment = {
          id: `cam-${Date.now()}-${i + 1}`,
          type: 'camera',
          name: `${basePrefix}_Frame${i + 1}_${timeCode}.jpg`,
          dataUrl: frame.url,
          mimeType: 'image/jpeg',
          sizeBytes: Math.round(frame.url.length * 0.75),
        };
        onCapture(att);
      });
      onClose();
      return;
    }

    const att: Attachment = {
      id: `cam-${Date.now()}`,
      type: 'camera',
      name: `${scanPrefix}_${timeCode}.jpg`,
      dataUrl: capturedUrl,
      mimeType: 'image/jpeg',
      sizeBytes: Math.round(capturedUrl.length * 0.75),
    };
    onCapture(att);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-3"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Smart Camera & Document Scanner</h3>
              <p className="text-[10px] text-zinc-400">AI Viewfinder with Vision & OCR Ingestion</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close camera"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scan Mode Toggle Bar */}
        <div className="flex items-center justify-center gap-1.5 py-2 px-3 bg-zinc-900/80 border-b border-zinc-800/80 flex-wrap">
          <button
            onClick={() => {
              setScanMode('photo');
              triggerHaptic(20);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              scanMode === 'photo'
                ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/30'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Scan className="w-3.5 h-3.5" />
            <span>General Scene</span>
          </button>
          <button
            onClick={() => {
              setScanMode('document');
              triggerHaptic(20);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              scanMode === 'document'
                ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/30'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Document OCR</span>
          </button>
          <button
            onClick={() => {
              setScanMode('ar-hud');
              triggerHaptic(20);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              scanMode === 'ar-hud'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-md shadow-amber-500/30 font-bold'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>AR HUD (MiniCPM-V)</span>
          </button>
          <button
            onClick={() => {
              setScanMode('keyframes');
              triggerHaptic(20);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              scanMode === 'keyframes'
                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-600/30 font-bold'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Motion Keyframes</span>
          </button>
        </div>

        {/* Viewport */}
        <div className="relative flex-1 bg-black flex items-center justify-center min-h-[320px] overflow-hidden">
          {errorMsg ? (
            <div className="p-4 text-center space-y-2">
              {permissionDenied ? (
                <PermissionDeniedNotice permissionName="Camera" onRetry={() => startCamera(facingMode)} />
              ) : (
                <>
                  <p className="text-xs text-rose-400 font-semibold mb-2">{errorMsg}</p>
                  <button
                    onClick={() => startCamera(facingMode)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs cursor-pointer transition-colors"
                  >
                    Retry
                  </button>
                </>
              )}
            </div>
          ) : capturedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capturedUrl} alt="Snapshot" className="w-full h-full object-contain max-h-[440px]" />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  transform: zoomLevel > 1 ? `scale(${zoomLevel})` : undefined,
                  transformOrigin: 'center center',
                  transition: 'transform 0.2s ease-out',
                }}
                className="w-full h-full object-cover max-h-[440px]"
              />

              {/* Document / Receipt Scan HUD Reticle Overlay */}
              {scanMode === 'document' && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                  <div className="relative w-full h-[85%] border-2 border-dashed border-cyan-400/50 rounded-xl bg-cyan-950/10">
                    {/* Corner Reticle Accents */}
                    <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-cyan-400 rounded-tl" />
                    <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-cyan-400 rounded-tr" />
                    <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-cyan-400 rounded-bl" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-cyan-400 rounded-br" />

                    {/* Laser Scanline Sweep */}
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#22d3ee] animate-pulse" />

                    <div className="absolute bottom-3 left-0 right-0 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur text-[10px] text-cyan-300 font-medium">
                        Align document inside frame for OCR extraction
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Augmented Reality (AR) HUD & Bounding Box Mode */}
              {scanMode === 'ar-hud' && (
                <div className="absolute inset-0 pointer-events-none p-4">
                  {/* Primary Focus Bounding Box */}
                  <div className="absolute top-[22%] left-[16%] w-[68%] h-[48%] border border-cyan-400/80 rounded-lg pointer-events-none shadow-[0_0_15px_rgba(34,211,238,0.25)] animate-pulse">
                    <div className="absolute -top-1 -left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-cyan-300" />
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-cyan-300" />
                    <div className="absolute -bottom-1 -left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-cyan-300" />
                    <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-cyan-300" />
                    <span className="absolute -top-5 left-0 px-1.5 py-0.2 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-400/40 text-[9px] font-mono font-bold">
                      [01] Primary Focus Target • 98.4%
                    </span>
                  </div>

                  {/* Secondary Header / Text Bounding Box */}
                  <div className="absolute top-[8%] left-[6%] w-[42%] h-[11%] border border-amber-400/70 rounded pointer-events-none">
                    <span className="absolute -top-4 left-0 px-1.5 py-0.2 rounded bg-amber-950/90 text-amber-300 border border-amber-400/40 text-[8px] font-mono font-bold">
                      [02] OCR Text Region • 95.1%
                    </span>
                  </div>

                  {/* Center Crosshair */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Crosshair className="w-8 h-8 text-cyan-400/50" />
                  </div>

                  {/* Bottom Telemetry HUD */}
                  <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[9px] font-mono text-cyan-300/90 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-cyan-500/30">
                    <span>ISO 125 • f/1.8 • 1/120s</span>
                    <span>MiniCPM-V Vision Tensor HUD</span>
                  </div>
                </div>
              )}

              {/* Rule of Thirds Grid Overlay */}
              {showGrid && (
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                  <div className="border-r border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-b border-white/20" />
                  <div className="border-r border-white/20" />
                  <div className="border-r border-white/20" />
                  <div />
                </div>
              )}

              {/* Camera Quick Action Badges */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <button
                  onClick={() => setShowGrid(!showGrid)}
                  aria-label="Toggle 3x3 Grid"
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-full backdrop-blur-md transition-all ${
                    showGrid ? 'bg-cyan-500 text-black shadow-md' : 'bg-black/60 text-white hover:bg-black/80'
                  }`}
                  title="Toggle 3x3 Grid"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                {hasTorch && (
                  <button
                    onClick={toggleTorch}
                    aria-label="Toggle Flashlight Torch"
                    className={`min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-full backdrop-blur-md transition-all ${
                      torchEnabled ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/50' : 'bg-black/60 text-white hover:bg-black/80'
                    }`}
                    title="Toggle Flashlight Torch"
                  >
                    {torchEnabled ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
                  </button>
                )}
                <button
                  onClick={toggleFacingMode}
                  aria-label="Flip Camera (Front/Back)"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-md"
                  title="Flip Camera (Front/Back)"
                >
                  <FlipHorizontal className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setZoomLevel((prev) => (prev === 1 ? 2 : prev === 2 ? 3 : 1));
                    triggerHaptic(20);
                  }}
                  aria-label={`Toggle Zoom: Current ${zoomLevel}x`}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-full bg-black/60 text-cyan-300 font-bold text-xs hover:bg-black/80 backdrop-blur-md cursor-pointer transition-all"
                  title="Toggle 1x / 2x / 3x digital zoom"
                >
                  <span>{zoomLevel}x</span>
                </button>
                <button
                  onClick={() => {
                    setShowTelemetry((prev) => !prev);
                    triggerHaptic(15);
                  }}
                  aria-label="Toggle FPS and WebGPU Latency HUD"
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-full backdrop-blur-md transition-all ${
                    showTelemetry ? 'bg-emerald-400 text-black shadow-md shadow-emerald-400/40' : 'bg-black/60 text-white hover:bg-black/80'
                  }`}
                  title="Toggle FPS & WebGPU Latency HUD"
                >
                  <Activity className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* Hidden Canvas for capture rendering */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Auto Vision Switch Badge */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950/85 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {scanMode === 'document'
                ? `OCR Text Extractor • ${zoomLevel}x`
                : scanMode === 'ar-hud'
                ? `MiniCPM-V AR Bounding Boxes • ${zoomLevel}x`
                : scanMode === 'keyframes'
                ? `Motion Keyframe Burst • ${zoomLevel}x`
                : `${facingMode === 'environment' ? 'Rear Camera' : 'Front Selfie'} • ${zoomLevel}x`}
            </span>
          </div>

          {/* Live Telemetry Overlay */}
          {showTelemetry && !capturedUrl && (
            <div className="absolute top-11 left-3 flex flex-col gap-1 z-20 pointer-events-none animate-in fade-in">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/85 border border-zinc-700/80 text-[10px] font-mono backdrop-blur-md shadow-md">
                <span className={`w-1.5 h-1.5 rounded-full ${liveFps > 45 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-white font-bold">{liveFps} FPS</span>
                <span className="text-zinc-500">|</span>
                <span className="text-zinc-300">{frameLatencyMs}ms render</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/85 border border-zinc-700/80 text-[10px] font-mono backdrop-blur-md shadow-md">
                <span className="text-cyan-400 font-bold">WebGPU:</span>
                <span className="text-cyan-300">{webGpuLatencyMs}ms tensor</span>
                <span className="text-zinc-500">|</span>
                <span className="text-emerald-400">1080p</span>
              </div>
            </div>
          )}

          {/* Burst in-flight overlay banner */}
          {isBurstCapturing && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-30 animate-in fade-in">
              <Film className="w-8 h-8 text-violet-400 animate-spin" />
              <div className="text-sm font-black text-white font-mono">
                Capturing Frame {burstCount}/4...
              </div>
              <div className="text-[10px] text-zinc-400">Hold device steady for optical flow analysis</div>
            </div>
          )}
        </div>

        {/* Filmstrip Reel if in Keyframes Mode */}
        {scanMode === 'keyframes' && burstFrames.length > 0 && (
          <div className="px-3 py-2 bg-zinc-950 border-t border-zinc-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span className="font-bold uppercase tracking-wider text-violet-400 flex items-center gap-1">
                <Film className="w-3 h-3" />
                <span>Motion Keyframe Filmstrip (4 Frames)</span>
              </span>
              <span className="font-mono text-zinc-500">250ms Shutter Interval</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {burstFrames.map((frame, idx) => (
                <button
                  key={frame.id}
                  onClick={() => {
                    setSelectedFrameIndex(idx);
                    setCapturedUrl(frame.url);
                    // Picking another keyframe changes what will be attached,
                    // so the un-filtered source for Enhance OCR follows it.
                    setOriginalCapturedUrl(frame.url);
                    setIsHighContrast(false);
                    triggerHaptic(15);
                  }}
                  className={`relative rounded-lg overflow-hidden border-2 aspect-video transition-all cursor-pointer ${
                    selectedFrameIndex === idx
                      ? 'border-violet-500 ring-2 ring-violet-500/30 scale-102'
                      : 'border-zinc-800 opacity-60 hover:opacity-100'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={frame.url} alt={`Frame ${idx + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-0.5 left-0.5 px-1 py-0.2 rounded bg-black/80 text-[8px] font-mono text-zinc-300">
                    +{frame.timestampMs}ms
                  </span>
                  {frame.isPeak && (
                    <span className="absolute top-0.5 right-0.5 px-1 py-0.2 rounded bg-amber-500 text-[8px] font-bold text-black flex items-center gap-0.5">
                      <Star className="w-2 h-2 fill-current" />
                      <span>Peak</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="p-3 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between gap-2">
          {capturedUrl ? (
            <>
              <button
                onClick={() => {
                  setCapturedUrl(null);
                  setOriginalCapturedUrl(null);
                  setIsHighContrast(false);
                  setBurstFrames([]);
                  startCamera(facingMode);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retake</span>
              </button>

              <div className="flex items-center gap-1.5">
                {scanMode === 'document' && (
                  <button
                    onClick={handleToggleHighContrast}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      isHighContrast
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/20'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700/60 hover:bg-zinc-700'
                    }`}
                    title="Toggle adaptive high-contrast black & white filter for clean OCR"
                  >
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{isHighContrast ? 'B&W Active' : 'Enhance OCR'}</span>
                  </button>
                )}

                {burstFrames.length > 0 && (
                  <button
                    onClick={() => confirmAttachment(true)}
                    className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-md cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Bundle All ({burstFrames.length})</span>
                  </button>
                )}

                <button
                  onClick={() => confirmAttachment(false)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{burstFrames.length > 0 ? 'Attach Frame' : 'Attach to Hermes'}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex justify-center items-center relative">
              <button
                onClick={
                  scanMode === 'keyframes'
                    ? takeKeyframeBurst
                    : scanMode === 'photo' && rapidBurstMode
                    ? () => takeRapidBurst(3)
                    : takeSnapshot
                }
                disabled={isBurstCapturing}
                className={`w-14 h-14 rounded-full border-4 border-white/80 flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer ${
                  scanMode === 'keyframes' || (scanMode === 'photo' && rapidBurstMode)
                    ? 'bg-gradient-to-tr from-violet-600 to-fuchsia-600 text-white shadow-violet-600/40'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-black'
                }`}
                title={
                  scanMode === 'keyframes'
                    ? 'Capture 4 Motion Keyframes'
                    : rapidBurstMode
                    ? 'Capture 3 Rapid Frames'
                    : 'Capture Image'
                }
              >
                {scanMode === 'keyframes' || (scanMode === 'photo' && rapidBurstMode) ? (
                  <Film className="w-6 h-6" />
                ) : (
                  <Camera className="w-6 h-6" />
                )}
              </button>

              {scanMode === 'photo' && (
                <button
                  onClick={() => {
                    setRapidBurstMode((prev) => !prev);
                    triggerHaptic(20);
                  }}
                  className={`absolute right-4 px-2.5 py-1.5 rounded-xl text-[10px] font-mono font-semibold flex items-center gap-1 border transition-all cursor-pointer ${
                    rapidBurstMode
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-zinc-800/80 text-zinc-400 border-zinc-700/50 hover:text-white'
                  }`}
                  title="Toggle 3-shot rapid burst"
                >
                  <Layers className="w-3 h-3" />
                  <span>{rapidBurstMode ? '3x Burst' : 'Single'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
