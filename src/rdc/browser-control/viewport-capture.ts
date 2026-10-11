import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod/v3';
import type { BrowserTransport } from './extension-bridge.js';
import type { PointerPoint } from './pointer-actions.js';

export const MAX_CAPTURE_BYTES = 128 * 1024;
export const MAX_CAPTURE_METADATA_BYTES = 16 * 1024;
export const MAX_CAPTURE_ENVELOPE_BYTES = 240 * 1024;
export const screenshotOptionsSchema = z.object({
  maxAgeMs: z.number().int().min(1).max(120000).optional(),
  maxWidth: z.number().int().min(320).max(1280).optional(),
  maxHeight: z.number().int().min(240).max(960).optional(),
  crop: z.object({ x: z.number().finite().min(0), y: z.number().finite().min(0),
    width: z.number().finite().positive().max(8192), height: z.number().finite().positive().max(8192) }).strict().optional(),
}).strict();
export type BrowserScreenshotOptions = z.infer<typeof screenshotOptionsSchema>;
export interface ViewportGeometry {
  documentKey: unknown; width: number; height: number; devicePixelRatio: number;
  scale: number; offsetX: number; offsetY: number; pageX: number; pageY: number; zoom: number;
}
export interface BrowserCapture {
  captureId: string; targetId: string; documentId: string; geometryVersion: string;
  capturedAt: string; expiresAt: string; coordinateSpace: 'css-viewport'; oneMutation: true;
  image: { width: number; height: number; scaleX: number; scaleY: number; mimeType: 'image/jpeg'; byteLength: number };
  viewport: Omit<ViewportGeometry, 'documentKey'>;
  crop: { x: number; y: number; width: number; height: number };
  quality: number;
}
export interface CaptureState { metadata: BrowserCapture; geometry: ViewportGeometry; expiresAt: number }
const GEOMETRY_SCRIPT = `(() => { /* __agentCorePointerGeometry */
  const v=window.visualViewport;
  return {documentKey:[performance.timeOrigin,location.href],width:innerWidth,height:innerHeight,
    devicePixelRatio:devicePixelRatio,scale:v?.scale??1,offsetX:v?.offsetLeft??0,offsetY:v?.offsetTop??0,
    pageX:v?.pageLeft??scrollX,pageY:v?.pageTop??scrollY,zoom:1};
})()`;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const documentIdentity = (geometry: ViewportGeometry) => hash(geometry.documentKey);
export const geometryIdentity = (geometry: ViewportGeometry) => hash(geometry);

export async function readViewportGeometry(client: BrowserTransport): Promise<ViewportGeometry> {
  const evaluated = await client.send('Runtime.evaluate', { expression: GEOMETRY_SCRIPT, returnByValue: true });
  const value = evaluated.result?.value as ViewportGeometry;
  const layout = await client.send('Page.getLayoutMetrics');
  const visual = layout.cssVisualViewport;
  if (evaluated.exceptionDetails || !value || !Array.isArray(value.documentKey) || !visual)
    throw new Error('BROWSER_CONTROL_CAPTURE_GEOMETRY_UNAVAILABLE');
  const geometry = { ...value, zoom: visual.zoom ?? 1 };
  for (const key of ['width','height','devicePixelRatio','scale','zoom'] as const)
    if (!Number.isFinite(geometry[key]) || geometry[key] <= 0) throw new Error('BROWSER_CONTROL_CAPTURE_GEOMETRY_UNAVAILABLE');
  for (const key of ['offsetX','offsetY','pageX','pageY'] as const)
    if (!Number.isFinite(geometry[key])) throw new Error('BROWSER_CONTROL_CAPTURE_GEOMETRY_UNAVAILABLE');
  // Pinch-zoom has a separate visual input mapping. Refuse instead of guessing where a click lands.
  if (geometry.scale !== 1 || geometry.offsetX !== 0 || geometry.offsetY !== 0)
    throw new Error('BROWSER_CONTROL_CAPTURE_PINCH_ZOOM_UNSUPPORTED');
  return geometry;
}

export function assertPointInCapture(point: PointerPoint, capture: BrowserCapture): void {
  const { viewport: v, crop: c } = capture;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x >= v.width || point.y >= v.height
    || point.x < c.x || point.y < c.y || point.x >= c.x + c.width || point.y >= c.y + c.height)
    throw new Error('BROWSER_CONTROL_POINTER_OUTSIDE_CAPTURE');
}

export async function captureViewport(client: BrowserTransport, targetId: string, options: BrowserScreenshotOptions,
  assertLive: () => void): Promise<{ state: CaptureState; image: { type: 'image'; mimeType: 'image/jpeg'; data: string } }> {
  const geometry = await readViewportGeometry(client); assertLive();
  const crop = options.crop ?? { x: 0, y: 0, width: geometry.width, height: geometry.height };
  if (crop.x + crop.width > geometry.width || crop.y + crop.height > geometry.height || crop.width > 8192 || crop.height > 8192)
    throw new Error('BROWSER_CONTROL_CAPTURE_CROP_OUTSIDE_VIEWPORT');
  const scale = Math.min(1, (options.maxWidth ?? 1280) / crop.width / geometry.devicePixelRatio,
    (options.maxHeight ?? 960) / crop.height / geometry.devicePixelRatio);
  let data = '', quality = 70;
  const capturedAt = Date.now();
  for (const candidate of [70, 55]) {
    assertLive(); quality = candidate;
    try {
      const result = await client.send('Page.captureScreenshot', { format: 'jpeg', quality,
        fromSurface: true, captureBeyondViewport: false,
        clip: { x: geometry.pageX + crop.x, y: geometry.pageY + crop.y, width: crop.width, height: crop.height, scale } });
      if (typeof result.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.data)) throw new Error('BROWSER_CONTROL_CAPTURE_INVALID_IMAGE');
      if (result.data.length > Math.ceil(MAX_CAPTURE_BYTES / 3) * 4 || Buffer.from(result.data, 'base64').length > MAX_CAPTURE_BYTES)
        throw new Error('BROWSER_CONTROL_CAPTURE_TOO_LARGE');
      data = result.data; break;
    } catch (error) {
      if (candidate === 55 || !(error instanceof Error) || !error.message.includes('BROWSER_CONTROL_CAPTURE_TOO_LARGE')) throw error;
    }
  }
  assertLive();
  const after = await readViewportGeometry(client); assertLive();
  if (geometryIdentity(geometry) !== geometryIdentity(after)) throw new Error('BROWSER_CONTROL_CAPTURE_CHANGED');
  const binary = Buffer.from(data, 'base64');
  const dimensions = await sharp(binary, { limitInputPixels: 1280 * 960 }).metadata();
  if (dimensions.format !== 'jpeg' || !dimensions.width || !dimensions.height || dimensions.width > (options.maxWidth ?? 1280)
    || dimensions.height > (options.maxHeight ?? 960)) throw new Error('BROWSER_CONTROL_CAPTURE_INVALID_IMAGE');
  const expiresAt = capturedAt + (options.maxAgeMs ?? 30000);
  if (Date.now() >= expiresAt) throw new Error('BROWSER_CONTROL_CAPTURE_EXPIRED');
  const { documentKey: _documentKey, ...viewport } = geometry;
  const metadata: BrowserCapture = { captureId: randomUUID(), targetId, documentId: documentIdentity(geometry),
    geometryVersion: geometryIdentity(geometry), capturedAt: new Date(capturedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString(),
    coordinateSpace: 'css-viewport', oneMutation: true,
    image: { width: dimensions.width, height: dimensions.height, scaleX: dimensions.width / crop.width,
      scaleY: dimensions.height / crop.height, mimeType: 'image/jpeg', byteLength: binary.length }, viewport, crop, quality };
  return { state: { metadata, geometry, expiresAt }, image: { type: 'image', mimeType: 'image/jpeg', data } };
}
