// Client-side image downsampling: modern phone cameras produce 12-50MP
// photos (3-15MB base64). Stored raw as chat attachments they exhaust RAM,
// blow the localStorage persistence quota, and lag the timeline render. This
// util resizes image files to a mobile-safe bound entirely on-device via
// canvas, preserving aspect ratio, before they ever reach the attachment
// store. All failures fall back to the original data URL - never blocks an
// attachment from being added.

const MAX_DIMENSION = 1280;
const OUTPUT_MIME = 'image/webp';
const OUTPUT_QUALITY = 0.82;

/** True when the file is an image that would benefit from downsampling. */
export function isOversizedImage(file: File): boolean {
  return file.type.startsWith('image/') && !file.type.startsWith('image/svg');
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    };
    img.src = url;
  });
}

export interface OptimizedImage {
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Downsample an image file so its longest edge is <= 1280px, encoded as WebP.
 * Returns the original base64 as-is if the image is already small, decoding
 * fails, or canvas allocation fails (e.g. extreme megapixel inputs).
 */
export async function downsampleImageFile(file: File): Promise<OptimizedImage> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('file read failed'));
    reader.readAsDataURL(file);
  });

  // Small images pass through untouched - no re-encode quality loss.
  if (file.size <= 350 * 1024) {
    return { dataUrl: original, mimeType: file.type, sizeBytes: file.size };
  }

  try {
    const img = await loadImage(file);
    const longest = Math.max(img.width, img.height);
    if (longest <= MAX_DIMENSION) {
      return { dataUrl: original, mimeType: file.type, sizeBytes: file.size };
    }
    const scale = MAX_DIMENSION / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { dataUrl: original, mimeType: file.type, sizeBytes: file.size };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(OUTPUT_MIME, OUTPUT_QUALITY);
    if (!dataUrl || dataUrl.length >= original.length) {
      // Re-encode somehow grew (rare for tiny-but-heavy files): keep original.
      return { dataUrl: original, mimeType: file.type, sizeBytes: file.size };
    }
    // Base64 inflates by ~4/3; approximate the decoded byte size.
    return { dataUrl, mimeType: OUTPUT_MIME, sizeBytes: Math.round((dataUrl.length * 3) / 4) };
  } catch (_) {
    return { dataUrl: original, mimeType: file.type, sizeBytes: file.size };
  }
}
