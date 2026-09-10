export interface DeviceHardwareProfile {
  estimatedRamGB: number;
  cpuCores: number;
  hasWebGpu: boolean;
  gpuRenderer: string;
  storageEstimateGB: {
    quota: number;
    usage: number;
    available: number;
  };
  deviceTier: 'ultra-light' | 'standard' | 'flagship';
  recommendedModelId: string;
  isMobileDevice: boolean;
  thermalStateSafe: boolean;
}

export async function profileMobileHardware(): Promise<DeviceHardwareProfile> {
  let ram = 4; // safe default fallback
  if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
    ram = (navigator as unknown as { deviceMemory: number }).deviceMemory || 4;
  }

  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const isMobile = typeof navigator !== 'undefined' ? /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) : true;

  // Check WebGPU & WebGL Renderer
  let hasWebGpu = false;
  let gpuRenderer = 'Standard Mobile Adreno/Mali GPU';

  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const adapter = await (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter();
      if (adapter) hasWebGpu = true;
    } catch (_) {
      hasWebGpu = false;
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          gpuRenderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || gpuRenderer;
        }
      }
    } catch (_) {}
  }

  // Storage estimation
  let quota = 32;
  let usage = 2.4;
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      if (est.quota) quota = Math.round((est.quota / (1024 * 1024 * 1024)) * 10) / 10;
      if (est.usage) usage = Math.round((est.usage / (1024 * 1024 * 1024)) * 10) / 10;
    } catch (_) {}
  }

  const available = Math.max(0, Math.round((quota - usage) * 10) / 10);

  // Determine Mobile Tier & Best Model
  let deviceTier: DeviceHardwareProfile['deviceTier'] = 'standard';
  let recommendedModelId = 'hermes-3-llama-3.2-3b';

  if (ram <= 3 || cores <= 4) {
    deviceTier = 'ultra-light';
    recommendedModelId = 'qwen2.5-1.5b-instruct';
  } else if (ram >= 8 && (hasWebGpu || cores >= 8)) {
    deviceTier = 'flagship';
    recommendedModelId = 'hermes-3-llama-3.2-3b';
  } else {
    deviceTier = 'standard';
    recommendedModelId = 'hermes-3-llama-3.2-3b';
  }

  return {
    estimatedRamGB: ram,
    cpuCores: cores,
    hasWebGpu,
    gpuRenderer,
    storageEstimateGB: {
      quota,
      usage,
      available,
    },
    deviceTier,
    recommendedModelId,
    isMobileDevice: isMobile,
    thermalStateSafe: true,
  };
}
