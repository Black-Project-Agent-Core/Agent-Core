import sharp from 'sharp';
import type { ScreenshotOptions } from './types.js';

export interface EncodedImage {
  base64: string;
  mimeType: string;
  /** Encoded output size after any downscale. */
  width: number;
  height: number;
  /** Native input size (device pixels). */
  sourceWidth: number;
  sourceHeight: number;
  bytes: number;
}

const MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const DEFAULT_MAX_WIDTH = 720;
const DEFAULT_QUALITY = 60;

function clampQuality(quality: number | undefined, format: string): number {
  if (format === 'png') return 100;
  const value = Number.isFinite(quality) ? Math.round(quality as number) : DEFAULT_QUALITY;
  return Math.min(100, Math.max(1, value));
}

/**
 * Downscale + re-encode a raw device screenshot for vision use. Big PNG screencaps
 * (~1MB) blow up the token budget; a width-bounded JPEG keeps game UI legible while
 * staying small. `raw` returns the untouched device image.
 */
export async function encodeScreenshot(
  input: Buffer,
  sourceMime: string,
  options: ScreenshotOptions = {},
): Promise<EncodedImage> {
  let sourceWidth = 0;
  let sourceHeight = 0;
  try {
    const meta = await sharp(input).metadata();
    sourceWidth = meta.width ?? 0;
    sourceHeight = meta.height ?? 0;
  } catch {
    // Non-decodable input still round-trips in raw mode below.
  }

  if (options.raw) {
    return {
      base64: input.toString('base64'),
      mimeType: sourceMime,
      width: sourceWidth,
      height: sourceHeight,
      sourceWidth,
      sourceHeight,
      bytes: input.length,
    };
  }

  const format = options.format ?? 'jpeg';
  const quality = clampQuality(options.quality, format);
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;

  let pipeline = sharp(input, { failOn: 'none' });
  if (maxWidth > 0) pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  if (format === 'jpeg') pipeline = pipeline.jpeg({ quality });
  else if (format === 'webp') pipeline = pipeline.webp({ quality });
  else pipeline = pipeline.png();

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    base64: data.toString('base64'),
    mimeType: MIME[format] ?? sourceMime,
    width: info.width,
    height: info.height,
    sourceWidth: sourceWidth || info.width,
    sourceHeight: sourceHeight || info.height,
    bytes: data.length,
  };
}

/** Decode a base64 image (from the gateway) so it can be re-encoded consistently. */
export function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}
