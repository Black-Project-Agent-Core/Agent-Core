import { stat, type Stats } from 'node:fs';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { MemoryContextFamily, VaultSegment } from './types.js';
import { parseVaultSegment } from './vault-codec.js';

/**
 * Derived lookup spine for one vault segment file: everything needed to decide *which* file to
 * open, plus the aggregate counters `status()` reports. Entry bodies are deliberately absent so a
 * 100k-memory vault costs tens of megabytes of index instead of hundreds of megabytes of parsed
 * entries; resolving a memory still reads its own Markdown segment, which stays the only authority.
 */
export interface SegmentSpine {
  relativePath: string;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  /** SHA-256 of the canonical Markdown bytes, independent of restored file timestamps. */
  contentHash: string;
  contextFamily: MemoryContextFamily;
  principalId: string;
  projectId: string;
  topicKey: string;
  segmentNo: number;
  /** Every memory id in the file, in file order. `canonicalKeys` is the parallel array. */
  memoryIds: string[];
  canonicalKeys: string[];
  active: number;
  tombstoned: number;
  edges: number;
}

export interface SegmentIndexSnapshot {
  /** Segment spines in vault path order, matching the order a full scan would produce. */
  spines: SegmentSpine[];
  /** relative path -> spine, for callers that already know which file they want. */
  spineByPath: Map<string, SegmentSpine>;
  malformedFiles: Array<{ relativePath: string; error: string }>;
  /** memoryId -> segment relative path. */
  byMemoryId: Map<string, string>;
  /** `${principalId}\0${projectId}\0${canonicalKey}` -> segment relative path. */
  byCanonicalKey: Map<string, string>;
}

export function canonicalKeyIndexKey(principalId: string, projectId: string, canonicalKey: string): string {
  return `${principalId}\0${projectId}\0${canonicalKey}`;
}

function spineOf(segment: VaultSegment, size: number, mtimeMs: number, ctimeMs:number, contentHash:string): SegmentSpine {
  const memoryIds: string[] = [], canonicalKeys: string[] = [];
  let active = 0, tombstoned = 0, edges = 0;
  for (const entry of segment.entries) {
    memoryIds.push(entry.memoryId); canonicalKeys.push(entry.canonicalKey);
    if (entry.state === 'active') active += 1;
    if (entry.state === 'tombstoned') tombstoned += 1;
    edges += entry.relations.length;
  }
  return {
    relativePath: segment.relativePath, size, mtimeMs, ctimeMs, contentHash,
    contextFamily: segment.contextFamily, principalId: segment.principalId, projectId: segment.projectId,
    topicKey: segment.topicKey, segmentNo: segment.segmentNo,
    memoryIds, canonicalKeys, active, tombstoned, edges,
  };
}

interface CacheEntry { size: number; mtimeMs: number; ctimeMs:number; contentHash?:string; spine?: SegmentSpine; error?: string }

/**
 * In-process, self-validating index over the vault's segment files.
 *
 * It is a cache, never a record: nothing is persisted, so it cannot be the authority, cannot be
 * restored ahead of the Markdown, cannot enter the Second Memory manifest or the durable logical
 * root hash, and a cold process simply rebuilds it from the vault. Every refresh re-lists the tree
 * and re-stats every file, so a segment written by any process - this one, a second Agent Core, or
 * a human editing Markdown by hand - is revalidated before it is used.
 *
 * Read scope: one logical operation (a recall, a postflight, an export) calls `refresh()` once and
 * hands the snapshot to every lookup it makes, so N lookups cost one validation pass. The only
 * staleness that buys is the operation's own duration: a foreign write landing while an operation
 * runs is seen by the next operation's refresh, exactly as it would be by any point-in-time read.
 * Nothing is trusted across operations without a fresh readdir + stat pass. When nothing changed,
 * `refresh()` returns the same snapshot object, which downstream caches use as their revision key.
 *
 * Warm lookup caches validate (size, mtimeMs, ctimeMs); the filesystem change time catches ordinary
 * edits even when a writer restores mtime. The spine holds the actual content digest, and callers
 * at an authority boundary request verifyContent to reread and hash bytes regardless of metadata.
 */
export class VaultSegmentIndex {
  private readonly cache = new Map<string, CacheEntry>();
  private snapshot: SegmentIndexSnapshot | undefined;
  private inFlight: Promise<SegmentIndexSnapshot> | undefined;
  private inFlightVerifiesContent=false;

  constructor(private readonly vaultRoot: string) {}

  /** Forget one segment so the next refresh re-reads it regardless of its timestamps. */
  invalidate(relativePath: string): void {
    this.cache.delete(relativePath);
    this.snapshot = undefined;
  }

  /** Concurrent callers share one validation pass; each pass still re-stats the whole vault. */
  refresh(options:{verifyContent?:boolean}={}): Promise<SegmentIndexSnapshot> {
    if(this.inFlight&&options.verifyContent&&!this.inFlightVerifiesContent)return this.inFlight.then(()=>this.refresh(options));
    if(!this.inFlight){
      this.inFlightVerifiesContent=options.verifyContent??false;
      this.inFlight=this.revalidate(this.inFlightVerifiesContent).finally(()=>{this.inFlight=undefined;this.inFlightVerifiesContent=false;});
    }
    return this.inFlight;
  }

  private async revalidate(verifyContent:boolean): Promise<SegmentIndexSnapshot> {
    await mkdir(this.vaultRoot, { recursive: true });
    const files = await walkSegments(this.vaultRoot);
    const stats = await statAll(files);
    const present = new Map<string, { file: string; size: number; mtimeMs: number; ctimeMs:number }>();
    for (const [index, entry] of files.entries()) {
      const info = stats[index];
      if (!info) continue; // vanished between listing and stat; the next refresh will see the truth
      present.set(entry.relativePath, { file: entry.file, size: info.size, mtimeMs: info.mtimeMs, ctimeMs:info.ctimeMs });
    }

    let changed = this.cache.size !== present.size;
    for (const [relativePath, current] of present) {
      const cached = this.cache.get(relativePath);
      const sameMetadata=cached&&cached.size===current.size&&cached.mtimeMs===current.mtimeMs&&cached.ctimeMs===current.ctimeMs;
      if(sameMetadata&&!verifyContent)continue;
      const loaded=await this.load(relativePath,current,cached);
      if(sameMetadata&&cached.contentHash===loaded.contentHash&&cached.error===loaded.error)continue;
      changed = true;
      this.cache.set(relativePath, loaded);
    }
    for (const relativePath of [...this.cache.keys()]) {
      if (!present.has(relativePath)) { this.cache.delete(relativePath); changed = true; }
    }
    if (!changed && this.snapshot) return this.snapshot;

    const spines: SegmentSpine[] = [], malformedFiles: Array<{ relativePath: string; error: string }> = [];
    const spineByPath = new Map<string, SegmentSpine>();
    const byMemoryId = new Map<string, string>(), byCanonicalKey = new Map<string, string>();
    for (const relativePath of [...present.keys()].sort()) {
      const cached = this.cache.get(relativePath);
      if (!cached) continue;
      if (cached.error !== undefined) { malformedFiles.push({ relativePath, error: cached.error }); continue; }
      const spine = cached.spine!;
      spines.push(spine); spineByPath.set(relativePath, spine);
      for (const [position, memoryId] of spine.memoryIds.entries()) {
        // First segment in path order wins, matching the order a full scan resolved ids in.
        if (!byMemoryId.has(memoryId)) byMemoryId.set(memoryId, relativePath);
        const key = canonicalKeyIndexKey(spine.principalId, spine.projectId, spine.canonicalKeys[position]!);
        if (!byCanonicalKey.has(key)) byCanonicalKey.set(key, relativePath);
      }
    }
    this.snapshot = { spines, spineByPath, malformedFiles, byMemoryId, byCanonicalKey };
    return this.snapshot;
  }

  private async load(relativePath: string, current: { file: string; size: number; mtimeMs: number; ctimeMs:number }, cached?: CacheEntry): Promise<CacheEntry> {
    try {
      const bytes=await readFile(current.file),contentHash=createHash('sha256').update(bytes).digest('hex');
      // Authority checks still read and hash canonical bytes. Identical bytes at
      // the same path cannot change a previously validated derived spine.
      if(cached?.spine&&cached.error===undefined&&cached.contentHash===contentHash){
        const sameMetadata=cached.size===current.size&&cached.mtimeMs===current.mtimeMs&&cached.ctimeMs===current.ctimeMs;
        const spine=sameMetadata?cached.spine:{...cached.spine,size:current.size,mtimeMs:current.mtimeMs,ctimeMs:current.ctimeMs};
        return{size:current.size,mtimeMs:current.mtimeMs,ctimeMs:current.ctimeMs,contentHash,spine};
      }
      const segment = parseVaultSegment(bytes.toString('utf8'), relativePath);
      return { size: current.size, mtimeMs: current.mtimeMs, ctimeMs:current.ctimeMs, contentHash, spine: spineOf(segment, current.size, current.mtimeMs,current.ctimeMs,contentHash) };
    } catch (error) {
      return { size: current.size, mtimeMs: current.mtimeMs, ctimeMs:current.ctimeMs, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export interface SegmentFile { file: string; relativePath: string }

/**
 * One stat per file, fanned out at once through callback `fs.stat`. The per-file stat is the whole
 * cost of a warm refresh, so its mechanics matter: measured on a 1.5k-file vault on Windows, this is
 * ~4 ms cheaper at p50 and half the p95 of `fs.promises.stat` under `Promise.all`, and three times
 * faster than a `statSync` loop. A file that vanished mid-pass reports `null`.
 */
function statAll(files: readonly SegmentFile[]): Promise<Array<Stats | null>> {
  return new Promise((resolve,reject) => {
    if (!files.length) { resolve([]); return; }
    const out: Array<Stats | null> = new Array(files.length).fill(null);
    let pending = files.length;
    files.forEach((entry, index) => stat(entry.file, (error, info) => {
      // A removed file is a normal concurrent edit. Permission/I/O failures are unavailable
      // canonical memory, and must never become a successful empty snapshot.
      if(error&&error.code!=='ENOENT'){reject(error);return;}
      out[index] = error ? null : info;
      if (--pending === 0) resolve(out);
    }));
  });
}

/**
 * Every canonical `.md` segment under the vault. Prune `.agent-core` before opening
 * it: workflow/state receipts can vastly outnumber Markdown memory segments.
 * Directory symlinks are not followed; callers sort canonical paths as needed.
 */
export async function walkSegments(root: string): Promise<SegmentFile[]> {
  const out: SegmentFile[] = [];
  const pending = [{ file: root, relativePath: '' }];
  while(pending.length){
    const directory=pending.pop()!;
    for(const entry of await readdir(directory.file,{withFileTypes:true})){
      if(entry.isSymbolicLink())continue;
      const relativePath=directory.relativePath?`${directory.relativePath}/${entry.name}`:entry.name;
      if(entry.isDirectory()){
        if(entry.name!=='.agent-core')pending.push({file:directory.file+path.sep+entry.name,relativePath});
      }else if(entry.isFile()&&entry.name.toLowerCase().endsWith('.md')){
        out.push({file:directory.file+path.sep+entry.name,relativePath});
      }
    }
  }
  return out;
}
