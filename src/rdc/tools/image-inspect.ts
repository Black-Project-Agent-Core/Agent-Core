import { createHash, randomUUID } from 'node:crypto';
import { stat, lstat, readlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import * as z from 'zod/v4';
import { validatePath } from './filesystem.js';
import { openRegularFile } from '../utils/files/safe-regular-file.js';
import { assertSameFileIdentity } from '../../security/file-identity.js';
import { imageReviewCriteriaSchema, referencedReviewIds, buildImageReviewReport, type ImageReviewView } from './image-review.js';
import {captureSourceDependencies, sampleSourceDependencies, completeSourceDependencies, noSourceDependencies,
  type SourceSnapshot } from './image-source-dependencies.js';

const INPUT_BYTES = 32 * 1024 * 1024;
const INPUT_PIXELS = 24_000_000;
const OUTPUT_BYTES = 2 * 1024 * 1024;
const OUTPUT_EDGE = 1536;
const OUTPUT_PIXELS = 1_500_000;
const VIEW_TTL = 15 * 60_000;
const MAX_VIEWS = 64;
// ponytail: process-wide two-operation cap; no queue retaining unbounded input buffers.
let active = 0;

/** One action-specific strict schema prevents public tools/list union duplication. */
export const imageInspectSchema = z.strictObject({
  action: z.enum(['overview','crop','review']),
  path: z.string().min(1).max(4096),
  format: z.enum(['png','jpeg']).optional(),
  maxEdge: z.number().int().min(128).max(OUTPUT_EDGE).optional(),
  viewId: z.string().uuid().optional(),
  rectangle: z.strictObject({
    x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(),
    width: z.number().finite().positive(), height: z.number().finite().positive(),
  }).optional(),
  zoom: z.number().finite().min(1).max(16).optional(),
  criteria: imageReviewCriteriaSchema.optional(),
  sourceFiles: z.array(z.string().min(1).max(4096)).min(1).max(8).optional(),
}).superRefine((value,ctx)=>{
  const invalid=(key:'format'|'maxEdge'|'viewId'|'rectangle'|'zoom'|'criteria'|'sourceFiles',message:string)=>
    ctx.addIssue({code:'custom',path:[key],message});
  if(value.action==='overview'){
    for(const key of ['viewId','rectangle','zoom','criteria'] as const)
      if(value[key]!==undefined) invalid(key,'Not valid for overview');
  } else if(value.action==='crop'){
    if(!value.viewId)invalid('viewId','Crop requires viewId');
    if(!value.rectangle)invalid('rectangle','Crop requires rectangle');
    if(value.criteria!==undefined)invalid('criteria','Not valid for crop');
    if(value.sourceFiles!==undefined)invalid('sourceFiles','Only valid for overview');
  } else {
    if(!value.viewId)invalid('viewId','Review requires viewId');
    if(!value.criteria)invalid('criteria','Review requires criteria');
    for(const key of ['format','maxEdge','rectangle','zoom','sourceFiles'] as const)
      if(value[key]!==undefined)invalid(key,'Not valid for review');
  }
});

type Rectangle = { x: number; y: number; width: number; height: number };
type Dimensions = { width: number; height: number };
type View = {
  canonicalPath: string; digest: string; expiresAt: number; sourceSnapshot:SourceSnapshot|null;
  original: Dimensions; displayed: Dimensions; sourceRect: Rectangle;
  /** Metadata is the exact immutable object emitted alongside the delivered image. */
  metadata: Readonly<ImageReviewView & Record<string,unknown>>;
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

/**
 * One inspector per scope id, so a view cited by a later call survives a rebuilt tool registry and the next turn.
 * At most 32 scopes are kept (oldest used first out) and a scope idle for 15 minutes is dropped.
 */
export function createImageInspectorScopes() {
  const scopes = new Map<string, { inspect: ReturnType<typeof createImageInspector>; lastUsed: number }>();
  return (id: string) => {
    const now = Date.now();
    for (const [key, scope] of scopes) if (scope.lastUsed + 15 * 60_000 <= now) scopes.delete(key);
    const scope = scopes.get(id) ?? { inspect: createImageInspector(), lastUsed: now };
    scope.lastUsed = now;
    scopes.delete(id);
    while (scopes.size >= 32) scopes.delete(scopes.keys().next().value!);
    scopes.set(id, scope);
    return scope.inspect;
  };
}

/** Create once per authenticated inspector scope; store metadata only, never image bytes. */
export function createImageInspector() {
  const views = new Map<string, View>();
  return async (args: unknown): Promise<{ content: Array<Record<string, unknown>> }> => {
    // Bound review payload before any image I/O or view-state mutations.
    if(args && typeof args==='object' && ((args as {action?:unknown}).action==='review'||'sourceFiles' in args)) {
      let size:number;
      try{size=Buffer.byteLength(JSON.stringify(args),'utf8');}
      catch{throw new Error('IMAGE_INSPECT_REVIEW_INPUT_INVALID');}
      if(size>24*1024)throw new Error('IMAGE_INSPECT_INPUT_LIMIT: maximum 24 KiB with review/sourceFiles');
    }
    const input = imageInspectSchema.parse(args);
    const now = Date.now();
    for (const [id, view] of views) if (view.expiresAt <= now) views.delete(id);
    const parent = input.action === 'crop' ? views.get(input.viewId!) : undefined;
    if (input.action === 'crop' && !parent) throw new Error('IMAGE_INSPECT_VIEW_NOT_FOUND: expired or foreign view; request overview again');
    const reviewIds = input.action==='review' ? referencedReviewIds(input.viewId!,input.criteria!) : [];
    if (reviewIds.length>8)throw new Error('IMAGE_INSPECT_REVIEW_VIEW_LIMIT');
    const reviewViews = reviewIds.map(id=>({id,view:views.get(id)}));
    if(input.action==='review'&&reviewViews.some(item=>!item.view))
      throw new Error('IMAGE_INSPECT_VIEW_NOT_FOUND: expired or foreign evidence view');
    if (active >= 2) throw new Error('IMAGE_INSPECT_BUSY: two image operations already active; retry after one finishes');
    active++;
    try {
      // Validate and capture declared dependencies before raster decode/read.
      const captured=input.action==='overview'&&input.sourceFiles
        ? await captureSourceDependencies(input.sourceFiles):null;
      const source = await readSource(input.path);
      if (parent && (source.canonicalPath !== parent.canonicalPath || source.digest !== parent.digest)) {
        throw new Error('IMAGE_INSPECT_SOURCE_CHANGED: request overview again');
      }
      const sourceSnapshot=input.action==='crop'?(parent?.sourceSnapshot??null):(captured?.snapshot??null);
      const dependencyBudget=captured?.budget??{attempts:0};
      const initialDependencies=captured?.observed??(sourceSnapshot
        ? await sampleSourceDependencies(sourceSnapshot,dependencyBudget):undefined);
      if(input.action==='review') {
        const checked=reviewViews.map(({view})=>view!);
        if(checked.some(view=>view.canonicalPath!==source.canonicalPath||view.digest!==source.digest))
          throw new Error('IMAGE_INSPECT_SOURCE_CHANGED: source or view snapshot mismatch');
        const reviewSnapshot=checked[0]?.sourceSnapshot??null;
        if(checked.some(view=>(view.sourceSnapshot?.snapshotId??null)!==(reviewSnapshot?.snapshotId??null)))
          throw new Error('IMAGE_INSPECT_DEPENDENCY_SNAPSHOT_MISMATCH');
        if(reviewViews.some(({id,view})=>views.get(id)!==view||view!.expiresAt<=Date.now()))
          throw new Error('IMAGE_INSPECT_VIEW_NOT_FOUND: expired or evicted during source read');
        const reportBase=buildImageReviewReport({criteria:input.criteria!,sourceDigest:source.digest,
          snapshotAt:new Date().toISOString(),views:checked.map(view=>({
            viewId:view.metadata.viewId,digest:view.metadata.digest,viewDigest:view.metadata.viewDigest,
            viewDigestAlgorithm:view.metadata.viewDigestAlgorithm,sourceRect:view.metadata.sourceRect,
            original:view.metadata.original,displayed:view.metadata.displayed,mimeType:view.metadata.mimeType,
            fidelity:view.metadata.fidelity,createdAt:view.metadata.createdAt,expiresAt:view.metadata.expiresAt,
          }))});
        const reviewBudget={attempts:0};
        const first=reviewSnapshot?await sampleSourceDependencies(reviewSnapshot,reviewBudget):undefined;
        const deps=await completeSourceDependencies(reviewSnapshot,first,reviewBudget);
        const report={...reportBase,sourceDependencies:deps};
        const json=JSON.stringify(report);
        if(Buffer.byteLength(json,'utf8')>32_768)throw new Error('IMAGE_INSPECT_REVIEW_OUTPUT_LIMIT');
        if(reviewViews.some(({id,view})=>views.get(id)!==view||view!.expiresAt<=Date.now()))
          throw new Error('IMAGE_INSPECT_VIEW_NOT_FOUND: expired before review delivery');
        return {content:[{type:'text',text:json}]};
      }
      const decoder = sharp(source.bytes, { limitInputPixels: INPUT_PIXELS, failOn: 'warning' }).timeout({ seconds: 10 });
      const info = await decoder.metadata();
      if (!['png','jpeg','webp'].includes(info.format ?? '') || !info.width || !info.height) throw new Error('IMAGE_INSPECT_FORMAT_UNSUPPORTED');
      if (info.depth !== 'uchar') throw new Error('IMAGE_INSPECT_BIT_DEPTH_UNSUPPORTED: initial support is 8-bit samples only; no automatic quantization');
      if ((info.pages ?? 1) !== 1) throw new Error('IMAGE_INSPECT_ANIMATION_UNSUPPORTED');
      if (info.width * info.height > INPUT_PIXELS) throw new Error('IMAGE_INSPECT_PIXEL_LIMIT');
      const swap = (info.orientation ?? 1) >= 5;
      const original = { width: swap ? info.height : info.width, height: swap ? info.width : info.height };
      const sourceRect = input.action === 'crop' ? mapRectangle(input.rectangle!, parent!) : { x: 0, y: 0, ...original };
      const desiredScale = input.action === 'crop' ? (input.zoom ?? 1) : 1;
      const maxEdge=input.maxEdge??OUTPUT_EDGE;
      const scale = Math.min(desiredScale, maxEdge / sourceRect.width, maxEdge / sourceRect.height, Math.sqrt(OUTPUT_PIXELS / (sourceRect.width * sourceRect.height)));
      const displayed = { width: Math.max(1, Math.floor(sourceRect.width * scale)), height: Math.max(1, Math.floor(sourceRect.height * scale)) };
      let pipeline = decoder.autoOrient().extract({ left: sourceRect.x, top: sourceRect.y, width: sourceRect.width, height: sourceRect.height })
        .resize(displayed.width, displayed.height, { fit: 'fill', kernel: 'lanczos3' });
      const format=input.format??'png';
      pipeline = format === 'png' ? pipeline.png() : pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4' });
      const output = await pipeline.toBuffer();
      if (output.length > OUTPUT_BYTES) throw new Error('IMAGE_INSPECT_OUTPUT_LIMIT: maximum 2 MiB encoded; lower maxEdge/zoom, request a smaller crop, or explicitly choose JPEG');
      const sourceDependencies=await completeSourceDependencies(sourceSnapshot,initialDependencies,dependencyBudget);
      if(parent && (views.get(input.viewId!)!==parent||parent.expiresAt<=Date.now()))
        throw new Error('IMAGE_INSPECT_VIEW_NOT_FOUND: expired or evicted before crop delivery');
      const viewId = randomUUID();
      const createdAt=new Date().toISOString();
      const expiresAt = Math.min(Date.now()+VIEW_TTL,sourceSnapshot?.expiresAt??Infinity,parent?.expiresAt??Infinity);
      if(expiresAt<=Date.now())throw new Error('IMAGE_INSPECT_DEPENDENCY_SNAPSHOT_EXPIRED');
      const viewDigest=createHash('sha256').update(output).digest('hex');
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const resized = displayed.width !== sourceRect.width || displayed.height !== sourceRect.height;
      const metadata = Object.freeze({
        viewId, digest: source.digest, digestAlgorithm: 'sha256-original-file',
        viewDigest,viewDigestAlgorithm:'sha256-returned-image-bytes' as const,
        createdAt,expiresAt: new Date(expiresAt).toISOString(),
        original, displayed, sourceRect, mimeType, encodedBytes: output.length,
        sourceDependencies,
        fileValidation: process.platform === 'linux' ? 'opened-descriptor target and parent identities' : 'parent identities; trusted local workspace required, no adversarial replacement guarantee',
        inputColor: { space: info.space, channels: info.channels, bitsPerSample: info.bitsPerSample ?? 8, embeddedProfile: info.hasProfile },
        outputColor: '8-bit sRGB; source color profiles converted by sharp; EXIF and other source metadata removed',
        coordinates: 'absolute displayed pixel edges; top-left origin; right/bottom exclusive; floor left/top, ceil right/bottom on original',
        originalPixelsPerDisplayedPixel: { x: sourceRect.width / displayed.width, y: sourceRect.height / displayed.height },
        interpolation: !resized ? 'none' : displayed.width > sourceRect.width || displayed.height > sourceRect.height ? 'cubic' : 'lanczos3',
        fidelity: format === 'jpeg' ? 'lossy JPEG quality 95, 4:4:4' : 'lossless PNG encoding',
        note: 'EXIF orientation normalized; every crop uses original oriented pixels. Resizing/interpolation adds no source information. Use returned displayed dimensions for coordinates; clients may transform images.',
      });
      const view:View=Object.freeze({canonicalPath:source.canonicalPath,digest:source.digest,expiresAt,sourceSnapshot,
        original:Object.freeze(original),displayed:Object.freeze(displayed),sourceRect:Object.freeze(sourceRect),metadata});
      while (views.size >= MAX_VIEWS) views.delete(views.keys().next().value!);
      views.set(viewId, view);
      return { content: [{ type: 'text', text: JSON.stringify(metadata) }, { type: 'image', data: output.toString('base64'), mimeType }] };
    } finally { active--; }
  };
}
