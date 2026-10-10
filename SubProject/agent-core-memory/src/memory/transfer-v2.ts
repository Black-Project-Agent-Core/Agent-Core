import {readFile,readdir,lstat,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {resolveMemoryPaths} from './paths.js';
import {withMemoryProcessLock} from './lock.js';
import {assertContainedPath,fingerprintBytes,fingerprintText,MemoryTransactionCoordinator} from './transaction.js';
import {experienceManifestSchema,sourceRefSchema,type SourceRef} from './experience-types.js';
import {disclosureDigest,memorySemanticRevision,stableDisclosureJson} from './disclosure.js';
import {parseCanonicalNote} from './note-format.js';
import {memoryArchiveManifestKey,archivePersistenceSchemas,parseRetainedTelemetry,isRetainedTelemetryKey} from './archive.js';
import {episodePersistenceSchemas as episodeSchemas,validateEpisodeSnapshot} from './episodes.js';
import {promotionPersistenceSchemas,promotionTransferReferenceView} from './promotion.js';
import {parseRevisionFile} from './revisions.js';
import {strictForgottenIdsFromContent,feedbackRecordSubjects} from './feedback.js';
import {inspectRetrievalTelemetry} from './retrieval-ledger.js';
import {writeOwnedFileAtomic} from '../persistence/atomic-file.js';
import type {MemoryRecord} from './types.js';

export const MEMORY_TRANSFER_V2_VERSION='agent-core-memory-transfer/2' as const;
export interface MemoryTransferV2Policy {allowedWorkspaces:string[];allowUnscoped?:boolean}
export interface MemoryTransferV2ExportOptions extends MemoryTransferV2Policy {completeness:'complete'|'knowledge-only';chunkBytes?:number}
const digest=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const entrySchema=z.strictObject({path:z.string().min(1).max(500),digest,bytes:z.number().int().nonnegative(),chunks:z.array(digest)});
const manifestSchema=z.strictObject({version:z.literal(MEMORY_TRANSFER_V2_VERSION),completeness:z.enum(['complete','knowledge-only']),
 sourceRootId:z.string(),exportedAt:z.iso.datetime(),workspaces:z.array(z.string()),unscoped:z.boolean(),recordCount:z.number().int().nonnegative(),
 entries:z.array(entrySchema),retainedRefs:z.array(sourceRefSchema),omitted:z.array(z.string())});
const bundleSchema=z.strictObject({manifest:manifestSchema,manifestDigest:digest,chunks:z.array(z.strictObject({digest,data:z.string()}))});
export type MemoryTransferV2Bundle=z.infer<typeof bundleSchema>;
export interface MemoryTransferV2Preview {bundleDigest:string;completeness:'complete'|'knowledge-only';sourceRootId:string;workspaces:string[];recordCount:number;objectCount:number;bytes:number;retainedRefs:SourceRef[];unresolvedRefs:SourceRef[];omitted:string[]}
export interface MemoryTransferV2Receipt {version:2;status:'complete';bundleDigest:string;sourceRootId:string;destinationDigest:string;objectCount:number;duplicate:boolean}
const activationPath='state/experience-manifest.json',receiptPath='state/transfer-v2-receipt.json';
const allowedState=new Set(['feedback.json','retrieval-ledger.jsonl','retrieval-use-receipts.jsonl','experience-manifest.json']);
const stateTrees=new Set(['revisions','episodes','episode-tasks','capsules','operations','consolidation']);
function fail(code:string):never {throw new Error(code);}
function hash(bytes:Uint8Array|string){return `sha256:${typeof bytes==='string'?fingerprintText(bytes):fingerprintBytes(bytes)}`;}
function keyAllowed(key:string):boolean {
 if(key.includes('\\')||key.includes('\0')||key.split('/').some(p=>!p||p==='.'||p==='..'||! /^[A-Za-z0-9._-]+$/.test(p)))return false;
 if(key==='00-agent-core-memory.md')return true;
 if(/^notes\/[A-Za-z0-9][A-Za-z0-9._-]{2,127}\.md$/.test(key))return true;
 if(/^archive\/objects\/[a-f0-9]{64}$/.test(key)||/^archive\/manifests\/[A-Za-z0-9][A-Za-z0-9._-]+\.json$/.test(key))return true;
 const parts=key.split('/');return parts[0]==='state'&&(parts.length===2&&allowedState.has(parts[1]!)||parts.length>=3&&stateTrees.has(parts[1]!)&&key.endsWith('.json'));
}
async function collect(root:string):Promise<Map<string,Buffer>> {
 const files=new Map<string,Buffer>();
 async function visit(key:string){
  const full=await assertContainedPath(root,path.join(root,key)),info=await lstat(full).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!info)return;
  if(info.isSymbolicLink())fail('MEMORY_TRANSFER_SYMLINK');
  if(info.isDirectory()){for(const name of (await readdir(full)).sort())await visit(key?`${key}/${name}`:name);return;}
  if(!info.isFile()||!keyAllowed(key))fail('MEMORY_TRANSFER_FILE_UNSUPPORTED');files.set(key,await readFile(full));
 }
 for(const key of ['00-agent-core-memory.md','notes','archive',...allowedState].map(k=>allowedState.has(k)?`state/${k}`:k).concat([...stateTrees].map(k=>`state/${k}`)))await visit(key);
 return files;
}
function decode(bytes:Uint8Array):string {try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{return fail('MEMORY_TRANSFER_UTF8_INVALID');}}
function parseJson(bytes:Uint8Array):any {try{return JSON.parse(decode(bytes));}catch{return fail('MEMORY_TRANSFER_SCHEMA_INVALID');}}
function refKey(ref:SourceRef){return stableDisclosureJson(ref);}
type Owner={rootId:string;workspaceKey:string;taskId:string};
/** Inspect all retained references, including old revisions and operation receipts.
 * Byte checksums prove integrity, not authenticity or semantic verification.
 */
function inspect(files:Map<string,Buffer>,complete:boolean,policy:MemoryTransferV2Policy) {
 const activation=experienceManifestSchema.parse(parseJson(files.get(activationPath)??Buffer.alloc(0)));
 if(activation.status!=='complete')fail('MEMORY_EXPERIENCE_INCOMPLETE');
 const allowed=new Set(policy.allowedWorkspaces),workspaces=new Set<string>(),refs=new Map<string,SourceRef>();let unscoped=false,recordCount=0;
 const feedbackSubjects=new Set<string>(),recordWorkspaces=new Map<string,Set<string|undefined>>();
 const records=new Map<string,MemoryRecord>(),documents:Array<{key:string;value:any;referenceValue?:unknown;owner?:Owner}>=[];
 function workspace(value:string|undefined,pinned=false){if(pinned)return;if(value){if(!allowed.has(value))fail('MEMORY_SCOPE_MISMATCH');workspaces.add(value);}else {unscoped=true;if(!policy.allowUnscoped)fail('MEMORY_SCOPE_MISMATCH');}}
 function walk(value:any,owner?:Owner){
  if(!value||typeof value!=='object')return;
  const own=value.owner??value.details?.owner??(value.scope?.rootId?value.scope:undefined);if(own){if(own.rootId!==activation.rootId||typeof own.workspaceKey!=='string'||typeof own.taskId!=='string')fail('MEMORY_SCOPE_MISMATCH');workspace(own.workspaceKey);owner=own;}
  if((value.version===1||value.version===2)&&typeof value.content==='string'&&typeof value.id==='string'&&!value.pinned){
   workspace(value.provenance?.workspace);const scopes=recordWorkspaces.get(value.id)??new Set<string|undefined>();scopes.add(value.provenance?.workspace);recordWorkspaces.set(value.id,scopes);
  }
  const parsed=sourceRefSchema.safeParse(value);if(parsed.success)refs.set(refKey(parsed.data),parsed.data);
  for(const child of Object.values(value))if(child&&typeof child==='object')walk(child,owner);
 }
 for(const [key,bytes] of files){
  if(key.startsWith('notes/')){const record=parseCanonicalNote(decode(bytes));if(key!==`notes/${record.id}.md`||record.pinned||record.version!==2)fail('MEMORY_TRANSFER_SCHEMA_INVALID');workspace(record.provenance?.workspace);records.set(record.id,record);recordCount++;documents.push({key,value:record});walk(record);}
  else if(key.startsWith('archive/objects/')){if(hash(bytes).slice(7)!==key.slice('archive/objects/'.length))fail('MEMORY_TRANSFER_CHECKSUM');}
  else if(key.endsWith('.json')){const value=parseJson(bytes);
   validateDocument(key,value,bytes);
   if(key==='state/feedback.json')for(const id of feedbackRecordSubjects(decode(bytes)))feedbackSubjects.add(id);
   if(key.startsWith('archive/manifests/')&&isRetainedTelemetryKey(key,value.purpose)){
    const retained=parseRetainedTelemetry(value);
    if(retained.kind==='feedback')for(const id of feedbackRecordSubjects(JSON.stringify(retained.value)))feedbackSubjects.add(id);
    else {const metadata=inspectRetrievalTelemetry(retained.kind,retained.value);if(metadata.key!==retained.key)fail('MEMORY_TRANSFER_LINKAGE_INVALID');workspace(metadata.workspace);}
   }
   const referenceValue=key.startsWith('state/consolidation/')?promotionTransferReferenceView(value,'saved'):key.startsWith('state/operations/')&&value.method==='prepareConsolidation'?promotionTransferReferenceView(value,'prepare-operation'):value;
   documents.push({key,value,referenceValue,owner:value.owner??value.details?.owner});walk(referenceValue);
   if(key.startsWith('archive/manifests/')&&value.kind!=='memory'){
    const ref:SourceRef=value.kind==='episode'?{kind:'episode',id:value.header.id,revision:hash(bytes)}:value.kind==='event'?{kind:'event',id:value.event.id,revision:hash(bytes)}:value.kind==='artifact'?{kind:'artifact',id:value.id,revision:hash(bytes)}:{kind:'manifest',id:value.kind==='capsule'?`capsule-${value.capsule.id}`:value.id,revision:hash(bytes)};
    refs.set(refKey(ref),ref);
   }
   // Historical canonical snapshots preserve provenance even if they have no live note.
   if(key.startsWith('archive/manifests/')&&value.kind==='memory'){
    const ref=sourceRefSchema.parse({kind:'memory',id:value.id,revision:value.revision});refs.set(refKey(ref),ref);
    const object=files.get(`archive/objects/${String(value.objectDigest).slice(7)}`);if(complete&&!object)fail('MEMORY_TRANSFER_UNRESOLVED_REF');
    if(object){if(hash(object)!==value.objectDigest)fail('MEMORY_TRANSFER_CHECKSUM');const record=parseCanonicalNote(decode(object));workspace(record.provenance?.workspace,record.pinned);walk(record);documents.push({key,value:record});if(record.id!==ref.id||memorySemanticRevision(record)!==ref.revision||key!==memoryArchiveManifestKey(ref))fail('MEMORY_TRANSFER_LINKAGE_INVALID');}
   }
  }else if(key.endsWith('.jsonl')){for(const line of decode(bytes).split('\n').filter(Boolean)){const value=parseJson(Buffer.from(line));documents.push({key,value});walk(value);const kind=key==='state/retrieval-ledger.jsonl'?'retrieval-attempt':'use-receipt';workspace(inspectRetrievalTelemetry(kind,value).workspace);}}
 }
 for(const id of feedbackSubjects){if(id==='agent-core-foundational')continue;const scopes=recordWorkspaces.get(id);if(!scopes?.size)workspace(undefined);else for(const scope of scopes)workspace(scope);}
 const unresolved:SourceRef[]=[];
 function resolve(ref:SourceRef,owner?:Owner){
  const key=ref.kind==='memory'?memoryArchiveManifestKey(ref):`archive/manifests/${ref.kind==='episode'?`episode-${ref.id}-${ref.revision.slice(7)}`:ref.kind==='event'?`event-${ref.id}`:ref.kind==='artifact'?`artifact-${ref.id}`:ref.id}.json`;
  const bytes=files.get(key);if(!bytes){unresolved.push(ref);return;}
  const value=parseJson(bytes);
  if(ref.kind==='manifest'&&(value.kind==='capsule'?`capsule-${value.capsule.id}`:value.id)!==ref.id)fail('MEMORY_TRANSFER_LINKAGE_INVALID');
  if(ref.kind!=='memory'&&hash(bytes)!==ref.revision)fail('MEMORY_TRANSFER_CHECKSUM');
  const other=value.owner??value.details?.owner;
  if(owner&&other&&(owner.rootId!==other.rootId||owner.workspaceKey!==other.workspaceKey||owner.taskId!==other.taskId))fail('MEMORY_SCOPE_MISMATCH');
  if(ref.kind==='memory'){
   const object=files.get(`archive/objects/${String(value.objectDigest).slice(7)}`);if(!object){unresolved.push(ref);return;}
   const record=parseCanonicalNote(decode(object));if(owner&&!record.pinned&&record.provenance?.workspace!==owner.workspaceKey)fail('MEMORY_SCOPE_MISMATCH');
  }else if(ref.kind==='episode'&&(value.kind!=='episode'||value.header?.id!==ref.id)||ref.kind==='event'&&(value.kind!=='event'||value.event?.id!==ref.id)||ref.kind==='artifact'&&(value.kind!=='artifact'||value.id!==ref.id))fail('MEMORY_TRANSFER_LINKAGE_INVALID');
 }
 function validate(value:any,owner?:Owner){
  if(!value||typeof value!=='object')return;owner=value.owner??value.details?.owner??(value.scope?.rootId?value.scope:undefined)??owner;
  const parsed=sourceRefSchema.safeParse(value);if(parsed.success)resolve(parsed.data,owner);
  // These fields are actual content-addressed object links, never opaque source text.
  for(const name of ['objectDigest','bodyDigest','beforeObject','afterObject'])if(typeof value[name]==='string'){
   const object=files.get(`archive/objects/${value[name].slice(7)}`);if(!object){if(complete)fail('MEMORY_TRANSFER_UNRESOLVED_REF');}else if(hash(object)!==value[name])fail('MEMORY_TRANSFER_CHECKSUM');
  }
  if(value.kind==='artifact'&&value.availability==='available'){const object=files.get(`archive/objects/${String(value.bodyDigest).slice(7)}`);if(object&&object.length!==value.bytes)fail('MEMORY_TRANSFER_CHECKSUM');}
  for(const child of Object.values(value))if(child&&typeof child==='object')validate(child,owner);
 }
 for(const document of documents)validate(document.referenceValue??document.value,document.owner);
 for(const ref of refs.values())resolve(ref);
 if(complete&&unresolved.length)fail('MEMORY_TRANSFER_UNRESOLVED_REF');
 if(complete){
  if(!files.has('00-agent-core-memory.md'))fail('MEMORY_TRANSFER_FOUNDATION_REQUIRED');
  if(!decode(files.get('00-agent-core-memory.md')!).trim())fail('MEMORY_TRANSFER_SCHEMA_INVALID');
  try{strictForgottenIdsFromContent(files.has('state/feedback.json')?decode(files.get('state/feedback.json')!):null);}catch{fail('MEMORY_TRANSFER_SCHEMA_INVALID');}
  for(const document of documents){
   validateLiveLinks(document.key,document.value,files);
   if(document.key.startsWith('archive/manifests/')&&document.value.kind==='episode'){
    const snapshot=episodeSchemas.episode.parse(document.value);
    const events=snapshot.eventRefs.map(ref=>{
     const bytes=files.get(`archive/manifests/event-${ref.id}.json`);if(!bytes)fail('MEMORY_TRANSFER_UNRESOLVED_REF');
     const manifest=episodeSchemas.eventManifest.parse(parseJson(bytes));if(stableDisclosureJson(manifest.owner)!==stableDisclosureJson(snapshot.owner))fail('MEMORY_SCOPE_MISMATCH');
     return manifest.event;
    });
    try{validateEpisodeSnapshot(snapshot,events);}catch{fail('MEMORY_TRANSFER_LINKAGE_INVALID');}
   }
  }
  for(const record of records.values())for(const link of record.links){const target=records.get(link.targetId);if(link.targetId==='agent-core-foundational')continue;if(!target)fail('MEMORY_TRANSFER_UNRESOLVED_LINK');if(record.provenance?.workspace!==target.provenance?.workspace)fail('MEMORY_SCOPE_MISMATCH');}
 }
 return {activation,workspaces:[...workspaces].sort(),unscoped,recordCount,refs:[...refs.values()].sort((a,b)=>refKey(a).localeCompare(refKey(b))),unresolved:[...new Map(unresolved.map(r=>[refKey(r),r])).values()]};
}
/** Reject malformed persistence shapes before creating a destination. Schemas stay
 * with their domain owners, so restore cannot silently invent a second parser. */
function validateDocument(key:string,value:any,bytes:Buffer):void {
 try {
  if(key===activationPath)experienceManifestSchema.parse(value);
  else if(key==='state/feedback.json')strictForgottenIdsFromContent(decode(bytes));
  else if(key.startsWith('state/revisions/'))parseRevisionFile(decode(bytes),path.basename(key,'.json'));
  else if(key.startsWith('state/episode-tasks/'))episodeSchemas.task.parse(value);
  else if(/^state\/episodes\/[^/]+\/manifest.json$/.test(key))episodeSchemas.live.parse(value);
  else if(/^state\/episodes\/[^/]+\/events\/[^/]+.json$/.test(key))episodeSchemas.event.parse(value);
  else if(key.startsWith('state/capsules/'))episodeSchemas.capsule.parse(value);
  else if(key.startsWith('state/consolidation/'))promotionPersistenceSchemas.saved.parse(value);
  else if(key.startsWith('state/operations/')){
   if(['prepareConsolidation','applyConsolidation'].includes(value.method))promotionPersistenceSchemas.operation.parse(value);
   else episodeSchemas.receipt.parse(value);
  }else if(key.startsWith('archive/manifests/')){
   if(value.kind==='memory')archivePersistenceSchemas.memory.parse(value);
   else if(value.kind==='event')episodeSchemas.eventManifest.parse(value);
   else if(value.kind==='episode')episodeSchemas.episode.parse(value);
   else if(value.kind==='artifact')episodeSchemas.artifact.parse(value);
   else if(value.kind==='capsule')episodeSchemas.capsule.parse(value);
   else archivePersistenceSchemas.manifest.parse(value);
  }else fail('MEMORY_TRANSFER_SCHEMA_INVALID');
 }catch{fail('MEMORY_TRANSFER_SCHEMA_INVALID');}
}
function validateLiveLinks(key:string,value:any,files:Map<string,Buffer>):void {
 const get=(key:string)=>{const bytes=files.get(key);if(!bytes)fail('MEMORY_TRANSFER_UNRESOLVED_REF');return parseJson(bytes);};
 const same=(a:unknown,b:unknown)=>{if(stableDisclosureJson(a)!==stableDisclosureJson(b))fail('MEMORY_TRANSFER_LINKAGE_INVALID');};
 if(key.startsWith('state/episode-tasks/')){
  same(key,`state/episode-tasks/${disclosureDigest(['episode-task/v1',value.owner]).slice(7)}.json`);
  same(value.owner,get(`state/episodes/${value.episodeId}/manifest.json`).owner);
 }else if(/^state\/episodes\/[^/]+\/manifest.json$/.test(key)){
  same(key,`state/episodes/${value.header.id}/manifest.json`);
  const snapshot=get(`archive/manifests/episode-${value.snapshotRef.id}-${value.snapshotRef.revision.slice(7)}.json`);
  same(snapshot.header,value.header);same(snapshot.owner,value.owner);
 }else if(/^state\/episodes\/[^/]+\/events\//.test(key)){
  same(key,`state/episodes/${value.episodeId}/events/${value.sequence}-${value.id}.json`);
  const archived=get(`archive/manifests/event-${value.id}.json`);same(value,archived.event);
  same(archived.owner,get(`state/episodes/${value.episodeId}/manifest.json`).owner);
 }else if(key.startsWith('state/capsules/')){
  same(key,`state/capsules/${value.capsule.episodeId}/${hash(files.get(key)!).slice(7)}.json`);
  same(value,get(`archive/manifests/capsule-${value.capsule.id}.json`));
 }else if(key.startsWith('state/operations/')){
  const family=['prepareConsolidation','applyConsolidation'].includes(value.method)?'promotion-operation/v1':'episode-operation/v1';
  same(key,`state/operations/${disclosureDigest([family,value.owner,value.method,value.operationId]).slice(7)}.json`);
 }else if(key.startsWith('state/consolidation/'))same(key,`state/consolidation/${value.plan.id}.json`);
}
function unpack(raw:unknown,policy:MemoryTransferV2Policy){
 const parsed=bundleSchema.safeParse(raw);if(!parsed.success)fail('MEMORY_TRANSFER_SCHEMA_INVALID');const bundle=parsed.data;
 if(disclosureDigest(bundle.manifest)!==bundle.manifestDigest)fail('MEMORY_TRANSFER_CHECKSUM');
 const chunks=new Map<string,Buffer>();for(const chunk of bundle.chunks){const bytes=Buffer.from(chunk.data,'base64');if(bytes.toString('base64')!==chunk.data||hash(bytes)!==chunk.digest||chunks.has(chunk.digest))fail('MEMORY_TRANSFER_CHECKSUM');chunks.set(chunk.digest,bytes);}
 const used=new Set<string>(),folded=new Set<string>(),files=new Map<string,Buffer>();
 for(const entry of bundle.manifest.entries){if(!keyAllowed(entry.path))fail('MEMORY_TRANSFER_PATH_INVALID');const fold=entry.path.toLowerCase();if(folded.has(fold))fail('MEMORY_TRANSFER_PATH_COLLISION');folded.add(fold);
  const parts=entry.chunks.map(id=>{const bytes=chunks.get(id);if(!bytes)fail('MEMORY_TRANSFER_CHECKSUM');used.add(id);return bytes;});const bytes=Buffer.concat(parts);
  if(bytes.length!==entry.bytes||hash(bytes)!==entry.digest)fail('MEMORY_TRANSFER_CHECKSUM');decode(bytes);files.set(entry.path,bytes);
 }
 if(used.size!==chunks.size)fail('MEMORY_TRANSFER_UNUSED_CHUNK');
 const found=inspect(files,bundle.manifest.completeness==='complete',policy),m=bundle.manifest;
 if(m.sourceRootId!==found.activation.rootId||m.recordCount!==found.recordCount||m.unscoped!==found.unscoped||stableDisclosureJson(m.workspaces)!==stableDisclosureJson(found.workspaces)||stableDisclosureJson(m.retainedRefs)!==stableDisclosureJson(found.refs))fail('MEMORY_TRANSFER_LINKAGE_INVALID');
 return {bundle,files,found};
}
/** Whole-root host-authorized snapshot. Paging chunks never imposes a record limit. */
export async function exportMemoryTransferV2(root:string,options:MemoryTransferV2ExportOptions):Promise<MemoryTransferV2Bundle>{
 const paths=resolveMemoryPaths(root,root),chunkBytes=options.chunkBytes??65536;
 if(!Number.isInteger(chunkBytes)||chunkBytes<1024||chunkBytes>1024*1024)fail('MEMORY_TRANSFER_CHUNK_SIZE_INVALID');
 // Capture all canonical bytes under the existing process lock. Once the Map has
 // been frozen in memory, validation/hashing/base64 encoding no longer needs
 // filesystem ownership. Keeping synchronous bundle work under the lease can
 // starve proper-lockfile heartbeat updates during large Windows migrations.
 const files=await withMemoryProcessLock(paths.lock,async()=>{
  await new MemoryTransactionCoordinator(paths.state).recover();
  return collect(paths.root);
 });
 if(options.completeness==='knowledge-only')for(const key of files.keys())if(key!==activationPath&&key!=='00-agent-core-memory.md'&&!key.startsWith('notes/'))files.delete(key);
 const found=inspect(files,options.completeness==='complete',options),chunks=new Map<string,string>();
 const entries=[...files].sort(([a],[b])=>a.localeCompare(b)).map(([key,bytes])=>{const ids:string[]=[];for(let offset=0;offset<bytes.length;offset+=chunkBytes){const chunk=bytes.subarray(offset,offset+chunkBytes),id=hash(chunk);ids.push(id);chunks.set(id,chunk.toString('base64'));}return {path:key,digest:hash(bytes),bytes:bytes.length,chunks:ids};});
 const manifest:MemoryTransferV2Bundle['manifest']={version:MEMORY_TRANSFER_V2_VERSION,completeness:options.completeness,sourceRootId:found.activation.rootId,exportedAt:new Date().toISOString(),workspaces:found.workspaces,unscoped:found.unscoped,recordCount:found.recordCount,entries,retainedRefs:found.refs,omitted:options.completeness==='complete'?['derived-index','transaction-journals','transfer-receipts']:['episodes','capsules','retained-revisions','evidence','receipts','derived-index']};
 return {manifest,manifestDigest:disclosureDigest(manifest),chunks:[...chunks].map(([digest,data])=>({digest,data}))};
}
export function previewMemoryTransferV2(raw:unknown,policy:MemoryTransferV2Policy):MemoryTransferV2Preview {
 const {bundle,files,found}=unpack(raw,policy);return {bundleDigest:bundle.manifestDigest,completeness:bundle.manifest.completeness,sourceRootId:found.activation.rootId,workspaces:found.workspaces,recordCount:found.recordCount,objectCount:files.size,bytes:[...files.values()].reduce((n,b)=>n+b.length,0),retainedRefs:found.refs,unresolvedRefs:found.unresolved,omitted:bundle.manifest.omitted};
}
/** A killed atomic writer can leave an unpublished temporary sibling. Only
 * discard exact bundle-owned temporary names after verifying the incomplete
 * destination receipt under its lock. Canonical files are never removed. */
async function cleanInterruptedTemps(root:string,files:Map<string,Buffer>):Promise<void> {
 const directories=new Map<string,Set<string>>();
 for(const key of files.keys()){
  const directory=path.dirname(key),names=directories.get(directory)??new Set<string>();
  names.add(path.basename(key));directories.set(directory,names);
 }
 for(const [directory,names] of directories){
  const full=directory==='.'?root:await assertContainedPath(root,path.join(root,directory));
  const entries=await readdir(full).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  for(const name of entries){const match=/^\.(.+)\.tmp-\d+-[a-f0-9-]{36}$/.exec(name);if(!match||!names.has(match[1]!))continue;
   const temporary=await assertContainedPath(root,path.join(full,name));if(!(await lstat(temporary)).isFile())fail('MEMORY_TRANSFER_DESTINATION_DRIFT');await rm(temporary);
  }
 }
}
/** Only restore into an empty destination or resume this exact bundle there.
 * Logical source identity is retained: this is a restore, not a merge or new tenant.
 */
export async function importMemoryTransferV2(raw:unknown,destination:string,options:MemoryTransferV2Policy&{signal?:AbortSignal}):Promise<MemoryTransferV2Receipt>{
 const {bundle,files,found}=unpack(raw,options);if(bundle.manifest.completeness!=='complete')fail('MEMORY_TRANSFER_COMPLETE_REQUIRED');
 const paths=resolveMemoryPaths(destination,destination),destinationDigest=disclosureDigest(['transfer-destination/v2',paths.root]);
 await assertContainedPath(paths.root,paths.experienceManifest);await mkdir(paths.root,{recursive:true});
 return withMemoryProcessLock(paths.lock,async()=>{
  const tx=new MemoryTransactionCoordinator(paths.state);await tx.recover();
  const receiptFile=await assertContainedPath(paths.root,path.join(paths.root,receiptPath));
  const priorBytes=await readFile(receiptFile).catch(e=>{if(e.code==='ENOENT')return null;throw e;});const prior=priorBytes?parseJson(priorBytes):null;
  const identity={version:2,bundleDigest:bundle.manifestDigest,sourceRootId:found.activation.rootId,destinationDigest,objectCount:files.size};
  if(prior){for(const [key,value] of Object.entries(identity))if(prior[key]!==value)fail('MEMORY_TRANSFER_DESTINATION_CONFLICT');if(!['incomplete','complete'].includes(prior.status))fail('MEMORY_TRANSFER_DESTINATION_CONFLICT');}
  else {
   const names=(await readdir(paths.root)).filter(name=>name!=='.memory.lock');
   // Transaction recovery can create an empty state/transactions directory.
   if(names.some(name=>name!=='state')||(names.includes('state')&&(await readdir(paths.state)).some(name=>name!=='transactions')))fail('MEMORY_TRANSFER_DESTINATION_NOT_EMPTY');
   await tx.commit([{targetPath:paths.experienceManifest,content:JSON.stringify({...found.activation,status:'incomplete'})+'\n',expectedFingerprint:null},{targetPath:receiptFile,content:JSON.stringify({...identity,status:'incomplete'})+'\n',expectedFingerprint:null}]);
  }
  const incomplete=JSON.stringify({...found.activation,status:'incomplete'})+'\n';
  const actualActivation=await readFile(await assertContainedPath(paths.root,paths.experienceManifest));
  if(!actualActivation.equals(prior?.status==='complete'?files.get(activationPath)!:Buffer.from(incomplete)))fail('MEMORY_TRANSFER_DESTINATION_DRIFT');
  for(const [key,bytes] of files){if(key===activationPath)continue;const target=await assertContainedPath(paths.root,path.join(paths.root,key)),actual=await readFile(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(actual&&!actual.equals(bytes))fail('MEMORY_TRANSFER_DESTINATION_DRIFT');if(prior?.status==='complete'&&!actual)fail('MEMORY_TRANSFER_DESTINATION_DRIFT');}
  if(prior?.status==='incomplete')await cleanInterruptedTemps(paths.root,files);
  const present=await collect(paths.root);for(const key of present.keys())if(!files.has(key))fail('MEMORY_TRANSFER_DESTINATION_DRIFT');
  if(prior?.status==='complete')return {...identity,version:2,status:'complete',duplicate:true};
  if(options.signal?.aborted)fail('MEMORY_TRANSFER_INTERRUPTED');
  for(const [key,bytes] of files){if(key===activationPath)continue;const target=await assertContainedPath(paths.root,path.join(paths.root,key));
   const exists=await readFile(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!exists)await writeOwnedFileAtomic(target,bytes,{mode:0o600});if(options.signal?.aborted)fail('MEMORY_TRANSFER_INTERRUPTED');
  }
  // Verify every destination byte immediately before activation. The completed
  // activation and receipt publish last together under the existing journal.
  for(const [key,bytes] of files)if(key!==activationPath&&!bytes.equals(await readFile(await assertContainedPath(paths.root,path.join(paths.root,key)))))fail('MEMORY_TRANSFER_DESTINATION_DRIFT');
  const receipt:MemoryTransferV2Receipt={...identity,version:2,status:'complete',duplicate:false};
  await tx.commit([{targetPath:paths.experienceManifest,content:decode(files.get(activationPath)!),expectedFingerprint:fingerprintText(incomplete)},{targetPath:receiptFile,content:JSON.stringify(receipt)+'\n',expectedFingerprint:hash(priorBytes??Buffer.from(JSON.stringify({...identity,status:'incomplete'})+'\n')).slice(7)}]);
  return receipt;
 });
}
