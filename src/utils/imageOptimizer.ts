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
// Length of the 'data:image/webp;base64,' prefix, excluded from size math.
const PREFIX_LENGTH = 'data:image/webp;base64,'.length;

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
  try {
    const original = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      // Fail-open contract: read failures resolve to an empty string so this
      // function never rejects outward; the caller decides what to do with it.
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    if (!original) return { dataUrl: '', mimeType: file.type, sizeBytes: file.size };

    // Small images pass through untouched - no re-encode quality loss.
    if (file.size <= 350 * 1024) {
      return { dataUrl: original, mimeType: file.type, sizeBytes: file.size };
    }

    const img = await loadImage(file);
    const longest = Math.max(img.width, img.height);
    if (longest <= MAX_DIMENSION) {
      return { dataUrl: original, mimeType: file.type, sizeBytes: file.size };
    }
    const scale = MAX_DIMENSION / longest;
    if (typeof document === 'undefined') return { dataUrl: original, mimeType: file.type, sizeBytes: file.size };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { dataUrl: original, mimeType: file.type, sizeBytes: file.size };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(OUTPUT_MIME, OUTPUT_QUALITY);
    if (!dataUrl.startsWith('data:image/webp')) {
      // WebP encode unsupported in this WebView (silent PNG fallback):
      // keep the original bytes rather than mislabel the format.
      return { dataUrl: original, mimeType: file.type, sizeBytes: file.size };
    }
    if (dataUrl.length >= original.length) {
      // Re-encode somehow grew (rare for tiny-but-heavy files): keep original.
      return { dataUrl: original, mimeType: file.type, sizeBytes: file.size };
    }
    // Base64 inflates by ~4/3 over the decoded bytes; exclude the URL prefix.
    return {
      dataUrl,
      mimeType: OUTPUT_MIME,
      sizeBytes: Math.round(((dataUrl.length - PREFIX_LENGTH) * 3) / 4),
    };
  } catch (_) {
    // Decode or canvas allocation failure (e.g. extreme megapixel input):
    // fall back to reading the original file as-is, still fail-open.
    const original = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    return { dataUrl: original, mimeType: file.type, sizeBytes: file.size };
  }
}

/**
 * Applies an adaptive high-contrast black-and-white filter to a captured document data URL.
 * Produces crisp, high-legibility text regions for on-device OCR inference.
 */
export function applyHighContrastDocumentFilter(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const val = lum > 132 ? 255 : Math.max(0, Math.round((lum / 132) * 55));
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch (_) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
