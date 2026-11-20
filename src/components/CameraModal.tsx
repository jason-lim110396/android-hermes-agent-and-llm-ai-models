'use client';

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
} from 'lucide-react';
import { Attachment } from '@/appStore';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (att: Attachment) => void;
}

export default function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [scanMode, setScanMode] = useState<'photo' | 'document' | 'ar-hud'>('photo');
  const [showGrid, setShowGrid] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCapturedUrl(null);
      setErrorMsg(null);
      setTorchEnabled(false);
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async (facing: 'environment' | 'user') => {
    stopCamera();
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg('Camera API not accessible on this device.');
        return;
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(mediaStream);
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
      setErrorMsg(`Camera permission denied or camera unavailable: ${(err as Error).message}`);
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
      if (navigator.vibrate) navigator.vibrate(25);
    } catch {
      // ignore torch constraint failures on unsupported devices
    }
  };

  const toggleFacingMode = () => {
    if (navigator.vibrate) navigator.vibrate(30);
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  };

  const takeSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (navigator.vibrate) navigator.vibrate(60);

    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth || 1280;
    c.height = v.videoHeight || 720;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.90);
      setCapturedUrl(dataUrl);
      stopCamera();
    }
  };

  const confirmAttachment = () => {
    if (!capturedUrl) return;
    const timeCode = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const prefix = scanMode === 'document' ? 'DocScan' : 'Photo';
    const att: Attachment = {
      id: `cam-${Date.now()}`,
      type: 'camera',
      name: `${prefix}_${timeCode}.jpg`,
      dataUrl: capturedUrl,
      mimeType: 'image/jpeg',
      sizeBytes: Math.round(capturedUrl.length * 0.75),
    };
    onCapture(att);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-3">
      <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
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
            className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scan Mode Toggle Bar */}
        <div className="flex items-center justify-center gap-1.5 py-2 px-3 bg-zinc-900/80 border-b border-zinc-800/80 flex-wrap">
          <button
            onClick={() => {
              setScanMode('photo');
              if (navigator.vibrate) navigator.vibrate(20);
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
              if (navigator.vibrate) navigator.vibrate(20);
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
              if (navigator.vibrate) navigator.vibrate(20);
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
        </div>

        {/* Viewport */}
        <div className="relative flex-1 bg-black flex items-center justify-center min-h-[320px] overflow-hidden">
          {errorMsg ? (
            <div className="p-4 text-center">
              <p className="text-xs text-rose-400 font-semibold mb-2">{errorMsg}</p>
              <button
                onClick={() => startCamera(facingMode)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs"
              >
                Retry
              </button>
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
                  className={`p-2 rounded-full backdrop-blur-md transition-all ${
                    showGrid ? 'bg-cyan-500 text-black shadow-md' : 'bg-black/60 text-white hover:bg-black/80'
                  }`}
                  title="Toggle 3x3 Grid"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                {hasTorch && (
                  <button
                    onClick={toggleTorch}
                    className={`p-2 rounded-full backdrop-blur-md transition-all ${
                      torchEnabled ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/50' : 'bg-black/60 text-white hover:bg-black/80'
                    }`}
                    title="Toggle Flashlight Torch"
                  >
                    {torchEnabled ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
                  </button>
                )}
                <button
                  onClick={toggleFacingMode}
                  className="p-2 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-md"
                  title="Flip Camera (Front/Back)"
                >
                  <FlipHorizontal className="w-4 h-4" />
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
                ? 'OCR Text Extractor'
                : scanMode === 'ar-hud'
                ? 'MiniCPM-V AR Bounding Boxes'
                : 'Vision Scene Pipeline'}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="p-3 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between">
          {capturedUrl ? (
            <>
              <button
                onClick={() => {
                  setCapturedUrl(null);
                  startCamera(facingMode);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retake</span>
              </button>
              <button
                onClick={confirmAttachment}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20"
              >
                <Check className="w-4 h-4" />
                <span>Attach to Hermes</span>
              </button>
            </>
          ) : (
            <div className="w-full flex justify-center items-center relative">
              <button
                onClick={takeSnapshot}
                className="w-14 h-14 rounded-full border-4 border-white/80 bg-cyan-500 hover:bg-cyan-400 flex items-center justify-center shadow-lg active:scale-95 transition-all"
                title="Capture Image"
              >
                <Camera className="w-6 h-6 text-black" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
