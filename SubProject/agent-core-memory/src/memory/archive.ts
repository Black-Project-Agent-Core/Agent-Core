import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import { experienceManifestSchema, digestSchema, safeIdSchema, sourceRefSchema, type SourceRef } from './experience-types.js';
import { memorySemanticRevision, stableDisclosureJson } from './disclosure.js';
import { parseCanonicalNote, serializeCanonicalNote } from './note-format.js';
import type { MemoryPaths } from './paths.js';
import type { MemoryRecord } from './types.js';
import { assertContainedPath, fingerprintFile, fingerprintText, fingerprintBytes, type MemoryTransactionMutation } from './transaction.js';

/** Integrity is checked on the actual bytes before fatal UTF-8 decoding.
 * ignoreBOM preserves the original BOM character; no newline/NUL normalization.
 */
async function readArchiveTextFile(paths:MemoryPaths,file:string,expectedDigest?:string,expectedBytes?:number) {
  const contained=await assertContainedPath(paths.root,file);
  const bytes=await readFile(contained),fingerprint=fingerprintBytes(bytes);
  if(expectedDigest!==undefined && `sha256:${fingerprint}`!==expectedDigest)throw new Error('Archive checksum mismatch');
  if(expectedBytes!==undefined && bytes.length!==expectedBytes)throw new Error('Archive byte length mismatch');
  return {text:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),fingerprint,bytes:bytes.length};
}

const memoryManifestSchema = z.strictObject({schemaVersion:z.literal(1),kind:z.literal('memory'),id:safeIdSchema,
  revision:digestSchema,objectDigest:digestSchema});
/** Canonical refs can have 128-character IDs; their combined filename is longer. */
export function memoryArchiveManifestKey(ref:SourceRef):string {
  sourceRefSchema.parse(ref);
  if (ref.kind !== 'memory') throw new Error('MEMORY_ARCHIVE_KIND_UNSUPPORTED');
  return `archive/manifests/memory-${ref.id}-${ref.revision.slice(7)}.json`;
}
export function isMemoryArchiveManifestKey(key:string):boolean {
  const match=/^archive\/manifests\/memory-([A-Za-z0-9][A-Za-z0-9._-]{2,127})-([a-f0-9]{64})\.json$/.exec(key);
  return Boolean(match && memoryArchiveManifestKey({kind:'memory',id:match[1]!,revision:`sha256:${match[2]}`})===key);
}
function manifestPath(paths: MemoryPaths, ref: SourceRef): string {
  return path.join(paths.root,memoryArchiveManifestKey(ref));
}

export async function readArchivedMemory(paths: MemoryPaths, ref: SourceRef): Promise<MemoryRecord> {
  const file = await assertContainedPath(paths.root,manifestPath(paths,ref));
  try {
    const manifest = memoryManifestSchema.parse(JSON.parse((await readArchiveTextFile(paths,file)).text));
    if (manifest.id !== ref.id || manifest.revision !== ref.revision) throw new Error('Reference mismatch');
    const object = await assertContainedPath(paths.root,path.join(paths.archiveObjects,manifest.objectDigest.slice(7)));
    const {text} = await readArchiveTextFile(paths,object,manifest.objectDigest);
    const record = parseCanonicalNote(text);
    if (record.id !== ref.id || memorySemanticRevision(record) !== ref.revision) throw new Error('Semantic revision mismatch');
    return record;
  } catch (error) { throw new Error('MEMORY_ARCHIVE_SOURCE_UNAVAILABLE',{cause:error}); }
}

/** First exact snapshot owns an immutable semantic ref; access-only changes do not create revisions. */
export async function buildArchiveMutations(paths: MemoryPaths, records: MemoryRecord[]): Promise<MemoryTransactionMutation[]> {
  const mutations = new Map<string,MemoryTransactionMutation>();
  for (const record of records) {
    const ref: SourceRef = {kind:'memory',id:record.id,revision:memorySemanticRevision(record)};
    const target = await assertContainedPath(paths.root,manifestPath(paths,ref));
    if (mutations.has(target)) continue;
    if (await fingerprintFile(target) !== null) { await readArchivedMemory(paths,ref); continue; }
    const content = serializeCanonicalNote(record), digest = fingerprintText(content);
    const object = await assertContainedPath(paths.root,path.join(paths.archiveObjects,digest));
    const existing = await fingerprintFile(object);
    if (existing !== null && existing !== digest) throw new Error('MEMORY_ARCHIVE_IMMUTABLE_CONFLICT');
    if (existing === null) mutations.set(object,{targetPath:object,content,expectedFingerprint:null});
    mutations.set(target,{targetPath:target,expectedFingerprint:null,content:JSON.stringify({schemaVersion:1,kind:'memory',id:ref.id,revision:ref.revision,objectDigest:`sha256:${digest}`})+'\n'});
  }
  return [...mutations.values()];
}

const archiveManifestSchema = z.strictObject({schemaVersion:z.literal(1),id:safeIdSchema,purpose:z.string().min(1),
  sourceRefs:z.array(sourceRefSchema),details:z.record(z.string(),z.unknown())});
/** Internal persistence schemas reused during isolated restore validation. */
export const archivePersistenceSchemas = {memory:memoryManifestSchema,manifest:archiveManifestSchema};
export type ArchiveManifest = z.infer<typeof archiveManifestSchema>;

export async function readArchiveObject(paths:MemoryPaths,digest:string,expectedBytes?:number):Promise<string> {
  digestSchema.parse(digest);
  try {
    const file = await assertContainedPath(paths.root,path.join(paths.archiveObjects,digest.slice(7)));
    return (await readArchiveTextFile(paths,file,digest,expectedBytes)).text;
  } catch (error) { throw new Error('MEMORY_ARCHIVE_SOURCE_UNAVAILABLE',{cause:error}); }
}

export async function readArchiveManifest(paths:MemoryPaths,ref:SourceRef):Promise<ArchiveManifest> {
  sourceRefSchema.parse(ref);
  if (ref.kind !== 'manifest') throw new Error('MEMORY_ARCHIVE_KIND_UNSUPPORTED');
  try {
    const file = await assertContainedPath(paths.root,path.join(paths.archiveManifests,`${ref.id}.json`));
    const {text} = await readArchiveTextFile(paths,file,ref.revision);
    const manifest = archiveManifestSchema.parse(JSON.parse(text));
    if (manifest.id !== ref.id) throw new Error('Manifest identity mismatch');
    if (manifest.purpose === 'record-audit') {
      const {id,...body} = manifest;
      if (typeof body.details.memoryId !== 'string' || id !== auditPrefix(body.details.memoryId)+fingerprintText(stableDisclosureJson(body))) throw new Error('Audit identity mismatch');
    }
    return manifest;
  } catch (error) { throw new Error('MEMORY_ARCHIVE_SOURCE_UNAVAILABLE',{cause:error}); }
}

function auditPrefix(id:string):string { safeIdSchema.parse(id); return `audit-${fingerprintText(id).slice(0,32)}-`; }

/** Retain newly recorded audit events even when bounded telemetry does not change meaning. */
export async function buildRecordAuditMutations(paths:MemoryPaths,before:MemoryRecord,after:MemoryRecord):Promise<MemoryTransactionMutation[]> {
  const prior = new Set(before.evolutionHistory.filter(event=>event.kind!=='retrieved').map(stableDisclosureJson));
  if (!after.evolutionHistory.some(event=>event.kind!=='retrieved' && !prior.has(stableDisclosureJson(event)))) return [];
  const mutations:MemoryTransactionMutation[] = [];
  const snapshots = [serializeCanonicalNote(before),serializeCanonicalNote(after)];
  const digests = snapshots.map(bytes=>`sha256:${fingerprintText(bytes)}`);
  for (const [index,bytes] of snapshots.entries()) {
    const targetPath = await assertContainedPath(paths.root,path.join(paths.archiveObjects,digests[index]!.slice(7)));
    const actual = await fingerprintFile(targetPath);
    if (actual !== null && actual !== digests[index]!.slice(7)) throw new Error('MEMORY_ARCHIVE_IMMUTABLE_CONFLICT');
    if (actual === null) mutations.push({targetPath,content:bytes,expectedFingerprint:null});
  }
  const body = {schemaVersion:1 as const,purpose:'record-audit',
    sourceRefs:[{kind:'memory' as const,id:after.id,revision:memorySemanticRevision(after)}],
    details:{memoryId:after.id,beforeObject:digests[0],afterObject:digests[1]}};
  const id = auditPrefix(after.id)+fingerprintText(stableDisclosureJson(body));
  const manifest:ArchiveManifest = {...body,id};
  const content = JSON.stringify(manifest)+'\n';
  const targetPath = await assertContainedPath(paths.root,path.join(paths.archiveManifests,`${id}.json`));
  const actual = await fingerprintFile(targetPath);
  if (actual !== null && actual !== fingerprintText(content)) throw new Error('MEMORY_ARCHIVE_IMMUTABLE_CONFLICT');
  if (actual === null) mutations.push({targetPath,content,expectedFingerprint:null});
  return mutations;
}

export async function readMemoryAuditRefs(paths:MemoryPaths,id:string):Promise<SourceRef[]> {
  try {
    const prefix = auditPrefix(id);
    await assertContainedPath(paths.root,paths.archiveManifests);
    const refs:SourceRef[] = [];
    for (const name of (await readdir(paths.archiveManifests)).filter(name=>name.startsWith(prefix)&&name.endsWith('.json')).sort()) {
      const file = await assertContainedPath(paths.root,path.join(paths.archiveManifests,name));
      const snapshot=await readArchiveTextFile(paths,file);
      const ref:SourceRef = {kind:'manifest',id:name.slice(0,-5),revision:`sha256:${snapshot.fingerprint}`};
      const manifest = await readArchiveManifest(paths,ref);
      if (manifest.purpose !== 'record-audit' || manifest.details.memoryId !== id) throw new Error('MEMORY_ARCHIVE_SOURCE_UNAVAILABLE');
      refs.push(ref);
    }
    return refs;
  } catch(error) { throw new Error('MEMORY_ARCHIVE_SOURCE_UNAVAILABLE',{cause:error}); }
}

/** Shared text-object keys keep byte retention under the existing transaction owner. */
export function archiveTextObjectKey(content:string):string {return `archive/objects/${fingerprintText(content)}`;}
export function archiveJsonKey(id:string):string {safeIdSchema.parse(id);return `archive/manifests/${id}.json`;}
export async function readArchivedJson<T>(paths:MemoryPaths,id:string,revision:string,schema:z.ZodType<T>):Promise<T> {
  digestSchema.parse(revision);
  try {
    const file=await assertContainedPath(paths.root,path.join(paths.root,archiveJsonKey(id)));
    const {text}=await readArchiveTextFile(paths,file,revision);
    return schema.parse(JSON.parse(text));
  }catch(error){throw new Error('MEMORY_ARCHIVE_SOURCE_UNAVAILABLE',{cause:error});}
}

/** Called under the shared store lock. Immutable evidence is durable before recent telemetry rotates. */
export async function preservesMemoryHistory(paths:MemoryPaths):Promise<boolean> {
  try {const content=await readArchiveTextFile(paths,paths.experienceManifest);const manifest=experienceManifestSchema.parse(JSON.parse(content.text));
    if(manifest.status!=='complete')throw new Error('MEMORY_PRESERVATION_REQUIRED');return true;
  } catch(error) {if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
}
function telemetryId(kind:'feedback'|'retrieval-attempt'|'use-receipt',key:string):string {return `${kind}-${fingerprintText(key)}`;}
/** Validate the immutable telemetry envelope without filesystem access. Payload
 * validation remains with the feedback/retrieval owners. */
export function isRetainedTelemetryKey(key:string,purpose:unknown):boolean {
  return /^archive\/manifests\/(?:feedback|retrieval-attempt|use-receipt)-/i.test(key)
    ||typeof purpose==='string'&&['feedback','retrieval-attempt','use-receipt'].includes(purpose);
}
export function parseRetainedTelemetry(raw:unknown):{kind:'feedback'|'retrieval-attempt'|'use-receipt';key:string;value:unknown} {
  const manifest=archiveManifestSchema.parse(raw),kind=manifest.purpose,key=manifest.details.key;
  if(!['feedback','retrieval-attempt','use-receipt'].includes(kind)||typeof key!=='string'||!key
    ||manifest.id!==telemetryId(kind as 'feedback'|'retrieval-attempt'|'use-receipt',key)
    ||manifest.details.digest!==`sha256:${fingerprintText(stableDisclosureJson(manifest.details.value))}`)throw new Error('MEMORY_ARCHIVE_SOURCE_UNAVAILABLE');
  return {kind:kind as 'feedback'|'retrieval-attempt'|'use-receipt',key,value:manifest.details.value};
}
export async function readRetainedTelemetry(paths:MemoryPaths,kind:'feedback'|'retrieval-attempt'|'use-receipt',key:string):Promise<unknown|undefined> {
  const id=telemetryId(kind,key),file=path.join(paths.archiveManifests,id+'.json');
  try {
    const {text}=await readArchiveTextFile(paths,file);const retained=parseRetainedTelemetry(JSON.parse(text));
    if(retained.kind!==kind||retained.key!==key)throw new Error('Invalid retained telemetry');
    return retained.value;
  } catch(error) {if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw new Error('MEMORY_ARCHIVE_SOURCE_UNAVAILABLE',{cause:error});}
}
export async function retainTelemetry(paths:MemoryPaths,kind:'feedback'|'retrieval-attempt'|'use-receipt',key:string,value:unknown):Promise<void> {
  const id=telemetryId(kind,key),content=stableDisclosureJson({schemaVersion:1,id,purpose:kind,sourceRefs:[],details:{key,value,digest:`sha256:${fingerprintText(stableDisclosureJson(value))}`}})+'\n';
  const file=await assertContainedPath(paths.root,path.join(paths.archiveManifests,id+'.json'));
  const existing=await fingerprintFile(file);
  if(existing!==null){if(existing!==fingerprintText(content))throw new Error('MEMORY_ARCHIVE_IMMUTABLE_CONFLICT');return;}
  await writeOwnedFileAtomic(file,content,{mode:0o600});
}
