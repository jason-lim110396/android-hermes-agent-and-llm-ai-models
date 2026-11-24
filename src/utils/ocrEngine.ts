import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Real OCR front door.
 *
 * Android System WebView (what the shipped APK runs) has no text-recognition
 * API at all, so a browser-only implementation could never read a scanned
 * photo. The native `HermesOCR` Capacitor plugin wraps Google ML Kit's bundled
 * Latin recognizer: inference happens on the phone, offline, inside the app.
 *
 * When the app runs as a plain web page (desktop preview, QA harness) there is
 * no engine. That case reports `engine: 'unavailable'` instead of inventing
 * text, so the UI can say plainly what is missing.
 */

interface HermesOCRPlugin {
  recognize(options: { image: string }): Promise<{
    text: string;
    lines: string[];
    blockCount: number;
    engine: string;
    /** Which script model produced the text: Latin, or the CJK model. */
    script?: string;
  }>;
}

let ocrPlugin: HermesOCRPlugin | null = null;

function getOcrPlugin(): HermesOCRPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  if (!ocrPlugin) {
    ocrPlugin = registerPlugin<HermesOCRPlugin>('HermesOCR');
  }
  return ocrPlugin;
}

export interface OcrResult {
  /** Full recognized text, newline separated. Empty when nothing was read. */
  text: string;
  /** Recognized text lines, in reading order. */
  lines: string[];
  /** Which engine produced this: native ML Kit, or none available. */
  engine: 'mlkit' | 'unavailable';
  /** Script model that produced the text: Latin, or the CJK model. */
  script?: 'latin' | 'cjk';
  /** Human readable reason when OCR could not run. */
  reason?: string;
}

const EMPTY_UNAVAILABLE: OcrResult = {
  text: '',
  lines: [],
  engine: 'unavailable',
};

/**
 * Extract text from a data URL image.
 *
 * Never throws: callers render `reason` when the engine is missing or the
 * image cannot be decoded, which keeps a scan failure from tripping the tab
 * error boundary on a phone.
 */
export async function recognizeTextFromDataUrl(dataUrl: string): Promise<OcrResult> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return {
      ...EMPTY_UNAVAILABLE,
      reason: 'This page is not a raster image, so text recognition cannot run on it.',
    };
  }

  const plugin = getOcrPlugin();
  if (!plugin) {
    return {
      ...EMPTY_UNAVAILABLE,
      reason:
        'OCR runs inside the Android app (on-device text recognition). Open Hermes on your phone to scan and extract text.',
    };
  }

  try {
    const result = await plugin.recognize({ image: dataUrl });
    const lines = (result.lines || [])
      .map((line) => (typeof line === 'string' ? line.trim() : ''))
      .filter((line) => line.length > 0);
    const text = (result.text || lines.join('\n')).trim();
    return {
      text,
      lines: lines.length > 0 ? lines : text ? text.split('\n') : [],
      engine: 'mlkit',
      script: result.script === 'cjk' ? 'cjk' : 'latin',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'unknown error');
    return {
      ...EMPTY_UNAVAILABLE,
      reason: `Text recognition failed on this image: ${message}`,
    };
  }
}
