// Inference throughput sampler and sparkline path generator for live LLM generation metrics.

export interface ThroughputStats {
  current: number;
  peak: number;
  avg: number;
  samplesCount: number;
  sparklinePolyline: string;
}

/**
 * Calculates current, peak, average tokens/sec and SVG polyline coordinates.
 * @param samples Array of recent tokens/sec samples (up to maxSamples)
 * @param width SVG width in px (default 36)
 * @param height SVG height in px (default 14)
 */
export function calculateThroughputStats(
  samples: number[],
  width = 36,
  height = 14
): ThroughputStats {
  if (!samples || samples.length === 0) {
    return {
      current: 0,
      peak: 0,
      avg: 0,
      samplesCount: 0,
      sparklinePolyline: `0,${height / 2} ${width},${height / 2}`,
    };
  }

  const current = samples[samples.length - 1];
  let peak = 0;
  let sum = 0;

  for (const s of samples) {
    if (s > peak) peak = s;
    sum += s;
  }

  const avg = +(sum / samples.length).toFixed(1);
  const maxVal = Math.max(peak, 1.0);
  const paddingY = 2;
  const drawHeight = height - paddingY * 2;

  if (samples.length === 1) {
    const y = +(height - paddingY - (samples[0] / maxVal) * drawHeight).toFixed(1);
    return {
      current,
      peak,
      avg,
      samplesCount: 1,
      sparklinePolyline: `0,${y} ${width},${y}`,
    };
  }

  const points = samples.map((val, idx) => {
    const x = +((idx / (samples.length - 1)) * width).toFixed(1);
    const normalizedY = Math.min(1, Math.max(0, val / maxVal));
    const y = +(height - paddingY - normalizedY * drawHeight).toFixed(1);
    return `${x},${y}`;
  });

  return {
    current,
    peak,
    avg,
    samplesCount: samples.length,
    sparklinePolyline: points.join(' '),
  };
}

/**
 * Formats a raw tokens/second value for compact mobile UI display.
 */
export function formatThroughput(tps: number): string {
  if (tps <= 0) return '0.0 t/s';
  return `${tps.toFixed(1)} t/s`;
}
