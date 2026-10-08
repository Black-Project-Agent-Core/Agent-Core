import { createHash, randomUUID } from 'node:crypto';
import { stat, lstat, readlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import * as z from 'zod/v4';
import { validatePath } from './filesystem.js';
import { openRegularFile } from '../utils/files/safe-regular-file.js';
import { assertSameFileIdentity } from '../../security/file-identity.js';

const INPUT_BYTES = 32 * 1024 * 1024;
const INPUT_PIXELS = 24_000_000;
const OUTPUT_BYTES = 2 * 1024 * 1024;
const OUTPUT_EDGE = 1536;
const OUTPUT_PIXELS = 1_500_000;
const VIEW_TTL = 15 * 60_000;
const MAX_VIEWS = 64;
// ponytail: process-wide two-operation cap; no queue retaining unbounded input buffers.
let active = 0;

const base = {
  path: z.string().min(1).max(4096),
  format: z.enum(['png', 'jpeg']).default('png'),
  maxEdge: z.number().int().min(128).max(OUTPUT_EDGE).default(OUTPUT_EDGE),
};
export const imageInspectSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('overview'), ...base }),
  z.strictObject({
    action: z.literal('crop'), ...base,
    viewId: z.string().uuid(),
    rectangle: z.strictObject({
      x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(),
      width: z.number().finite().positive(), height: z.number().finite().positive(),
    }),
    zoom: z.number().finite().min(1).max(16).default(1),
  }),
]);

type Rectangle = { x: number; y: number; width: number; height: number };
type Dimensions = { width: number; height: number };
type View = {
  canonicalPath: string; digest: string; expiresAt: number;
  original: Dimensions; displayed: Dimensions; sourceRect: Rectangle;
};

/** Check the container before decoding: never hand SVG/PDF/URLs to libvips. */
function inspectContainer(bytes: Buffer): void {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      if (type === 'acTL') throw new Error('IMAGE_INSPECT_ANIMATION_UNSUPPORTED');
      if (length > bytes.length - offset - 12) throw new Error('IMAGE_INSPECT_FORMAT_INVALID');
      offset += length + 12;
      if (type === 'IEND') break;
    }
    return;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return;
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const type = bytes.toString('ascii', offset, offset + 4);
      const length = bytes.readUInt32LE(offset + 4);
      if (type === 'ANIM' || type === 'ANMF') throw new Error('IMAGE_INSPECT_ANIMATION_UNSUPPORTED');
      if (length > bytes.length - offset - 8) throw new Error('IMAGE_INSPECT_FORMAT_INVALID');
      offset += 8 + length + (length % 2);
    }
    return;
  }
  throw new Error('IMAGE_INSPECT_FORMAT_UNSUPPORTED: local PNG, JPEG and WebP only');
}

async function ancestorIdentities(file: string) {
  const ancestors = [];
  for (let directory = path.dirname(file);; directory = path.dirname(directory)) {
    const identity = await lstat(directory, { bigint: true });
    if (!identity.isDirectory() || identity.isSymbolicLink()) throw new Error('IMAGE_INSPECT_ANCESTOR_CHANGED');
    ancestors.push({ directory, identity });
    if (path.dirname(directory) === directory) break;
    if (ancestors.length >= 128) throw new Error('IMAGE_INSPECT_PATH_DEPTH_LIMIT');
  }
  return ancestors;
}

async function verifyOpenedPath(fd: number, canonicalPath: string, ancestors: Awaited<ReturnType<typeof ancestorIdentities>>) {
  // Linux exposes the kernel's opened-file target. Other platforms retain the
  // existing trusted-local-workspace boundary; parent snapshots detect drift,
  // but are not claimed to prevent every adversarial replacement race.
  if (process.platform === 'linux' && await readlink(`/proc/self/fd/${fd}`) !== canonicalPath) {
    throw new Error('IMAGE_INSPECT_OPENED_PATH_CHANGED');
  }
  for (const { directory, identity } of ancestors) {
    const current = await lstat(directory, { bigint: true });
    if (!current.isDirectory() || current.isSymbolicLink()) throw new Error('IMAGE_INSPECT_ANCESTOR_CHANGED');
    assertSameFileIdentity(identity, current, 'image ancestor');
  }
}

async function readSource(requestedPath: string): Promise<{ canonicalPath: string; bytes: Buffer; digest: string }> {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(requestedPath) || /^(data|file):/i.test(requestedPath)) {
    throw new Error('IMAGE_INSPECT_LOCAL_PATH_REQUIRED');
  }
  const canonicalPath = await validatePath(requestedPath);
  const ancestors = await ancestorIdentities(canonicalPath);
  const guarded = await openRegularFile(canonicalPath, { followSymlinks: false });
  try {
    await verifyOpenedPath(guarded.handle.fd, canonicalPath, ancestors);
    const before = await guarded.handle.stat({ bigint: true });
    if (before.size > BigInt(INPUT_BYTES)) throw new Error('IMAGE_INSPECT_INPUT_LIMIT: maximum 32 MiB');
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const read = await guarded.handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) throw new Error('IMAGE_INSPECT_SOURCE_CHANGED');
      offset += read.bytesRead;
    }
    const after = await guarded.handle.stat({ bigint: true });
    const revalidated = await validatePath(requestedPath);
    if (revalidated !== canonicalPath || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      throw new Error('IMAGE_INSPECT_SOURCE_CHANGED');
    }
    assertSameFileIdentity(before, after, 'image source');
    assertSameFileIdentity(after, await stat(revalidated, { bigint: true }), 'image source');
    await verifyOpenedPath(guarded.handle.fd, canonicalPath, ancestors);
    inspectContainer(bytes);
    return { canonicalPath, bytes, digest: createHash('sha256').update(bytes).digest('hex') };
  } finally { await guarded.close(); }
}

function mapRectangle(rectangle: Rectangle, view: View): Rectangle {
  const { x, y, width, height } = rectangle;
  if (x + width > view.displayed.width || y + height > view.displayed.height) {
    throw new Error('IMAGE_INSPECT_RECTANGLE_OUT_OF_BOUNDS');
  }
  // Multiply before division so exact source edges survive non-integral zoom ratios.
  const left = Math.floor(x * view.sourceRect.width / view.displayed.width);
  const top = Math.floor(y * view.sourceRect.height / view.displayed.height);
  const right = Math.min(view.sourceRect.width, Math.ceil((x + width) * view.sourceRect.width / view.displayed.width));
  const bottom = Math.min(view.sourceRect.height, Math.ceil((y + height) * view.sourceRect.height / view.displayed.height));
  return { x: view.sourceRect.x + left, y: view.sourceRect.y + top, width: right - left, height: bottom - top };
}

/** Create once per authenticated inspector scope; store metadata only, never image bytes. */
export function createImageInspector() {
  const views = new Map<string, View>();
  return async (args: unknown): Promise<{ content: Array<Record<string, unknown>> }> => {
    const input = imageInspectSchema.parse(args);
    const now = Date.now();
    for (const [id, view] of views) if (view.expiresAt <= now) views.delete(id);
    const parent = input.action === 'crop' ? views.get(input.viewId) : undefined;
    if (input.action === 'crop' && !parent) throw new Error('IMAGE_INSPECT_VIEW_NOT_FOUND: expired or foreign view; request overview again');
    if (active >= 2) throw new Error('IMAGE_INSPECT_BUSY: two image operations already active; retry after one finishes');
    active++;
    try {
      const source = await readSource(input.path);
      if (parent && (source.canonicalPath !== parent.canonicalPath || source.digest !== parent.digest)) {
        throw new Error('IMAGE_INSPECT_SOURCE_CHANGED: request overview again');
      }
      const decoder = sharp(source.bytes, { limitInputPixels: INPUT_PIXELS, failOn: 'warning' }).timeout({ seconds: 10 });
      const info = await decoder.metadata();
      if (!['png','jpeg','webp'].includes(info.format ?? '') || !info.width || !info.height) throw new Error('IMAGE_INSPECT_FORMAT_UNSUPPORTED');
      if (info.depth !== 'uchar') throw new Error('IMAGE_INSPECT_BIT_DEPTH_UNSUPPORTED: initial support is 8-bit samples only; no automatic quantization');
      if ((info.pages ?? 1) !== 1) throw new Error('IMAGE_INSPECT_ANIMATION_UNSUPPORTED');
      if (info.width * info.height > INPUT_PIXELS) throw new Error('IMAGE_INSPECT_PIXEL_LIMIT');
      const swap = (info.orientation ?? 1) >= 5;
      const original = { width: swap ? info.height : info.width, height: swap ? info.width : info.height };
      const sourceRect = input.action === 'crop' ? mapRectangle(input.rectangle, parent!) : { x: 0, y: 0, ...original };
      const desiredScale = input.action === 'crop' ? input.zoom : 1;
      const scale = Math.min(desiredScale, input.maxEdge / sourceRect.width, input.maxEdge / sourceRect.height, Math.sqrt(OUTPUT_PIXELS / (sourceRect.width * sourceRect.height)));
      const displayed = { width: Math.max(1, Math.floor(sourceRect.width * scale)), height: Math.max(1, Math.floor(sourceRect.height * scale)) };
      let pipeline = decoder.autoOrient().extract({ left: sourceRect.x, top: sourceRect.y, width: sourceRect.width, height: sourceRect.height })
        .resize(displayed.width, displayed.height, { fit: 'fill', kernel: 'lanczos3' });
      pipeline = input.format === 'png' ? pipeline.png() : pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4' });
      const output = await pipeline.toBuffer();
      if (output.length > OUTPUT_BYTES) throw new Error('IMAGE_INSPECT_OUTPUT_LIMIT: maximum 2 MiB encoded; lower maxEdge/zoom, request a smaller crop, or explicitly choose JPEG');
      const viewId = randomUUID();
      const expiresAt = Date.now() + VIEW_TTL;
      const view = Object.freeze({ canonicalPath: source.canonicalPath, digest: source.digest, expiresAt,
        original: Object.freeze(original), displayed: Object.freeze(displayed), sourceRect: Object.freeze(sourceRect) });
      while (views.size >= MAX_VIEWS) views.delete(views.keys().next().value!);
      views.set(viewId, view);
      const mimeType = input.format === 'png' ? 'image/png' : 'image/jpeg';
      const resized = displayed.width !== sourceRect.width || displayed.height !== sourceRect.height;
      const metadata = {
        viewId, digest: source.digest, digestAlgorithm: 'sha256-original-file', expiresAt: new Date(expiresAt).toISOString(),
        original, displayed, sourceRect, mimeType, encodedBytes: output.length,
        fileValidation: process.platform === 'linux' ? 'opened-descriptor target and parent identities' : 'parent identities; trusted local workspace required, no adversarial replacement guarantee',
        inputColor: { space: info.space, channels: info.channels, bitsPerSample: info.bitsPerSample ?? 8, embeddedProfile: info.hasProfile },
        outputColor: '8-bit sRGB; source color profiles converted by sharp; EXIF and other source metadata removed',
        coordinates: 'absolute displayed pixel edges; top-left origin; right/bottom exclusive; floor left/top, ceil right/bottom on original',
        originalPixelsPerDisplayedPixel: { x: sourceRect.width / displayed.width, y: sourceRect.height / displayed.height },
        interpolation: !resized ? 'none' : displayed.width > sourceRect.width || displayed.height > sourceRect.height ? 'cubic' : 'lanczos3',
        fidelity: input.format === 'jpeg' ? 'lossy JPEG quality 95, 4:4:4' : 'lossless PNG encoding',
        note: 'EXIF orientation normalized; every crop uses original oriented pixels. Resizing/interpolation adds no source information. Use returned displayed dimensions for coordinates; clients may transform images.',
      };
      return { content: [{ type: 'text', text: JSON.stringify(metadata) }, { type: 'image', data: output.toString('base64'), mimeType }] };
    } finally { active--; }
  };
}
