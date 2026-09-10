'use client';

import React, { useRef, useState } from 'react';
import { Camera, X, RefreshCw, Check, Sparkles } from 'lucide-react';
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

  React.useEffect(() => {
    if (isOpen) {
      setCapturedUrl(null);
      setErrorMsg(null);
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg('Camera API not accessible on this device.');
        return;
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: unknown) {
      setErrorMsg(`Camera permission denied or camera unavailable: ${(err as Error).message}`);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  };

  const takeSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      setCapturedUrl(dataUrl);
      stopCamera();
    }
  };

  const confirmAttachment = () => {
    if (!capturedUrl) return;
    const att: Attachment = {
      id: `cam-${Date.now()}`,
      type: 'camera',
      name: `Photo_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.jpg`,
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
      <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Live Camera Ingestion</h3>
              <p className="text-[10px] text-zinc-400">Auto-routes to Vision Model for scene analysis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewport */}
        <div className="relative flex-1 bg-black flex items-center justify-center min-h-[300px] overflow-hidden">
          {errorMsg ? (
            <div className="p-4 text-center">
              <p className="text-xs text-rose-400 font-semibold mb-2">{errorMsg}</p>
              <button
                onClick={startCamera}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs"
              >
                Retry
              </button>
            </div>
          ) : capturedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capturedUrl} alt="Snapshot" className="w-full h-full object-contain max-h-[420px]" />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover max-h-[420px]"
            />
          )}

          {/* Hidden Canvas for capture rendering */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Auto Vision Switch Badge */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-[9px] font-bold backdrop-blur-md">
            <Sparkles className="w-3 h-3" />
            <span>AI Multimodal Vision Active</span>
          </div>
        </div>

        {/* Controls */}
        <div className="p-3 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between">
          {capturedUrl ? (
            <>
              <button
                onClick={() => {
                  setCapturedUrl(null);
                  startCamera();
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
            <div className="w-full flex justify-center">
              <button
                onClick={takeSnapshot}
                className="w-14 h-14 rounded-full border-4 border-white/80 bg-cyan-500 hover:bg-cyan-400 flex items-center justify-center shadow-lg active:scale-95 transition-all"
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
