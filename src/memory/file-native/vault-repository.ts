import { createHash, randomUUID } from 'node:crypto';
import { MEMORY_ANCHOR_TYPES, extractMemoryAnchors } from '../anchors.js';
import { lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MUTABLE_MEMORY_KINDS, type MemoryCommitRequest, type MemoryCommitResult, type MemoryRelation, type MemoryReviseRequest, type MemoryReviseResult, type MemoryScope, type MemoryState } from '../types.js';
import { normalizeCanonicalKey } from '../normalizer.js';
import { normalizeMemoryValue, type StoredMemoryRecord, type StoredMemoryRevision } from '../record-types.js';
import { containsRedactionMarker, redactMemoryText } from '../redaction.js';
import { shouldMirrorMemoryRelation, RELATION_WEIGHTS } from '../relation-policy.js';
import { atomicReplaceValidated, writeImmutableRevision } from './atomic-writer.js';
import { canonicalFileNativeProjectId, fileNativePrincipalNamespace, fileNativeProjectNamespace, type FileNativeMemoryPaths } from './paths.js';
import { canonicalKeyIndexKey, VaultSegmentIndex, walkSegments, type SegmentIndexSnapshot } from './segment-index.js';
import { chooseSegment, type SegmentWithSize } from './segment-placement.js';
import { VaultTransactionJournal } from './transaction-journal.js';
import type { MemoryContextFamily, VaultMemoryEntry, VaultRelation, VaultSegment } from './types.js';
import { parseVaultSegment, serializeVaultSegment } from './vault-codec.js';

const FOLDERS: Record<MemoryContextFamily,string> = {
  project:'Projects', brainstorming:'Brainstorming', coding:'Coding', decision:'Decisions', failure:'Failures',
  procedure:'Procedures', task:'Tasks', artifact:'Artifacts', guardrail:'Guardrails', relationship:'Relationships', general:'General',
};
const FAMILIES = new Set<MemoryContextFamily>(Object.keys(FOLDERS) as MemoryContextFamily[]);

function contextFamily(request: MemoryCommitRequest): MemoryContextFamily {
  const raw = request.metadata?.contextFamily;
  if (typeof raw === 'string' && FAMILIES.has(raw as MemoryContextFamily)) return raw as MemoryContextFamily;
  if (request.kind === 'decision') return 'decision'; if (request.kind === 'failure') return 'failure';
  if (request.kind === 'procedure') return 'procedure'; if (request.kind === 'task' || request.kind === 'goal') return 'task';
  if (request.kind === 'artifact') return 'artifact'; if (request.kind === 'guardrail') return 'guardrail'; if (request.kind === 'relationship') return 'relationship';
  if (request.kind === 'project_state' || request.kind === 'tool_state') return 'project'; return 'general';
}
function topicKey(request: MemoryCommitRequest, canonicalKey: string): string {
  const explicit = request.metadata?.topicKey;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'') || 'memory';
  return canonicalKey.split(':').slice(0,2).join('-').replace(/[^a-z0-9._-]+/g,'-') || 'memory';
}
function segmentLabel(no: number): string { return no >= 1 && no <= 26 ? String.fromCharCode(64+no) : `S${no}`; }
function toStored(scope: MemoryScope, segment: VaultSegment, entry: VaultMemoryEntry): StoredMemoryRecord {
  return { memoryId:entry.memoryId,revisionId:entry.revisionId,revisionNo:entry.revisionNo,principalId:scope.principalId,projectId:scope.projectId??segment.projectId,
    canonicalKey:entry.canonicalKey,kind:entry.kind,state:entry.state,importance:entry.importance,pinned:entry.pinned,enforcement:entry.enforcement,
    valueText:entry.valueText,...(entry.valueJson===undefined?{}:{valueJson:entry.valueJson}),valueHash:entry.valueHash,...(entry.sourceEventId?{sourceEventId:entry.sourceEventId}:{}),createdAt:entry.createdAt,updatedAt:entry.updatedAt };
}
function cloneSegment(s: VaultSegment): VaultSegment { return structuredClone(s); }
function relationKey(r: VaultRelation): string { return `${r.targetMemoryId}\0${r.relation}`; }
function currentRevision(entry:VaultMemoryEntry):StoredMemoryRevision{
  return{revisionId:entry.revisionId,memoryId:entry.memoryId,revisionNo:entry.revisionNo,valueText:entry.valueText,...(entry.valueJson===undefined?{}:{valueJson:entry.valueJson}),valueHash:entry.valueHash,...(entry.sourceEventId?{sourceEventId:entry.sourceEventId}:{}),validFrom:entry.revisionNo===1?entry.createdAt:entry.updatedAt,createdAt:entry.updatedAt};
}

const ANCHOR_TYPES=new Set<string>(MEMORY_ANCHOR_TYPES);
function buildAnchors(request:MemoryCommitRequest,canonicalKey:string,valueText:string):Array<{type:string;value:string}>{
  const map=new Map<string,{type:string;value:string}>();const add=(type:string,value:string)=>{const v=value.trim();if(!v||containsRedactionMarker(v)||/REDACTED/i.test(v)||map.size>=128)return;map.set(`${type}\0${v}`,{type,value:v});};
  add('canonical_key',canonicalKey);for(const a of extractMemoryAnchors(`${canonicalKey} ${valueText}`))add(a.type,a.value);
  for(const a of request.explicitAnchors??[]){const type=String(a.type??''),value=String(a.value??'').trim(),redacted=value?redactMemoryText(value).text:'';if(!ANCHOR_TYPES.has(type)||!value||redacted!==value||containsRedactionMarker(value)||/REDACTED/i.test(value))throw new Error('MEMORY_EXPLICIT_ANCHOR_INVALID');add(type,value);}
  return [...map.values()].sort((a,b)=>`${a.type}\0${a.value}`.localeCompare(`${b.type}\0${b.value}`));
}

/**
 * A segment belongs to a scope only when both its principal and its canonical project match.
 * This is the pre-cutover contract (the certified store scoped every read by principal AND project);
 * the first file-native cut matched on project alone, which let one principal read another's
 * memories inside a shared project. Recall, lookups, counts and export all go through this one test.
 */
export function segmentInScope(paths:Pick<FileNativeMemoryPaths,'projectRoot'>,segment:Pick<VaultSegment,'principalId'|'projectId'>,scope:MemoryScope):boolean {
  return segment.principalId===scope.principalId && segment.projectId===canonicalFileNativeProjectId(paths,scope.projectId);
}

export class FileNativeMemoryRepository {
  /** Derived, in-process, never authoritative: it only says which file to open. See segment-index.ts. */
  private readonly index: VaultSegmentIndex;
  private readonly parsed = new Map<string, { contentHash:string; segment: SegmentWithSize }>();
  constructor(readonly paths: FileNativeMemoryPaths) { this.index=new VaultSegmentIndex(paths.vaultRoot); }

  /**
   * A logical operation validates the tree once and hands the snapshot to every lookup it makes
   * (the optional trailing `snapshot` argument below). Lookups without one validate for themselves.
   */
  readSnapshot(options:{verifyContent?:boolean}={}): Promise<SegmentIndexSnapshot> { return this.index.refresh(options); }

  /** One segment by path, served from cache only when its canonical content digest matches. */
  async readIndexedSegment(relativePath: string, snapshot: SegmentIndexSnapshot): Promise<SegmentWithSize|null> {
    const spine = snapshot.spineByPath.get(relativePath);
    if (!spine) return null;
    const cached = this.parsed.get(relativePath);
    if (cached?.contentHash===spine.contentHash) return cached.segment;
    const loaded = await this.readSegment(relativePath);
    if (loaded) {
      this.parsed.delete(relativePath);
      // A writer may change the file after the index snapshot. Bind the parsed
      // value to the bytes actually read so restoring older bytes cannot reuse it.
      this.parsed.set(relativePath, loaded);
      if (this.parsed.size > 128) this.parsed.delete(this.parsed.keys().next().value!);
    }
    return loaded?.segment ?? null;
  }

  async scanSegments(): Promise<{segments:SegmentWithSize[];malformedFiles:Array<{relativePath:string;error:string}>}> {
    await mkdir(this.paths.vaultRoot,{recursive:true});const files=(await walkSegments(this.paths.vaultRoot)).sort((a,b)=>a.relativePath<b.relativePath?-1:a.relativePath>b.relativePath?1:0);const segments:SegmentWithSize[]=[],malformedFiles:Array<{relativePath:string;error:string}>=[];
    for(const {file,relativePath:rel} of files){try{const text=await readFile(file,'utf8');segments.push({...parseVaultSegment(text,rel),byteSize:Buffer.byteLength(text,'utf8')});}catch(error){malformedFiles.push({relativePath:rel,error:error instanceof Error?error.message:String(error)});}}
    return{segments,malformedFiles};
  }
  async listSegments(): Promise<SegmentWithSize[]> { return (await this.scanSegments()).segments; }

  /** Vault-wide counters for status, taken from the index so a report never re-parses the whole vault. */
  async counts(scope?: MemoryScope): Promise<{active:number;tombstones:number;edges:number;segments:number;malformedFiles:Array<{relativePath:string;error:string}>}> {
    const snapshot=await this.index.refresh(); let active=0,tombstones=0,edges=0;
    for(const spine of snapshot.spines){if(scope&&!segmentInScope(this.paths,spine,scope))continue;active+=spine.active;tombstones+=spine.tombstoned;edges+=spine.edges;}
    return {active,tombstones,edges,segments:snapshot.spines.length,malformedFiles:snapshot.malformedFiles};
  }

  /** One segment, read fresh from its Markdown; the index only chose the path. */
  private async readSegment(relativePath:string):Promise<{contentHash:string;segment:SegmentWithSize}|null>{
    try{const bytes=await readFile(path.join(this.paths.vaultRoot,...relativePath.split('/')));return {contentHash:createHash('sha256').update(bytes).digest('hex'),segment:{...parseVaultSegment(bytes.toString('utf8'),relativePath),byteSize:bytes.byteLength}};}
    catch{return null;}
  }
  private async segmentChain(contextFamily:MemoryContextFamily,principalId:string,projectId:string,topic:string,validated?:SegmentIndexSnapshot):Promise<SegmentWithSize[]>{
    const snapshot=validated??await this.index.refresh();
    const wanted=snapshot.spines.filter(s=>s.contextFamily===contextFamily&&s.principalId===principalId&&s.projectId===projectId&&s.topicKey===topic);
    return (await Promise.all(wanted.map(s=>this.readIndexedSegment(s.relativePath,snapshot)))).filter((s):s is SegmentWithSize=>s!==null);
  }

  async findEntry(scope: MemoryScope, memoryId: string, validated?: SegmentIndexSnapshot): Promise<{segment:SegmentWithSize;entry:VaultMemoryEntry}|null> {
    const snapshot=validated??await this.index.refresh(); const relativePath=snapshot.byMemoryId.get(memoryId); if(!relativePath) return null;
    const segment=await this.readIndexedSegment(relativePath,snapshot); if(!segment||!segmentInScope(this.paths,segment,scope)) return null;
    const entry=segment.entries.find(e=>e.memoryId===memoryId); return entry?{segment,entry}:null;
  }

  /** Resolve many ids at once: one read per segment that actually holds one of them. */
  async findEntries(scope: MemoryScope, memoryIds: readonly string[], validated?: SegmentIndexSnapshot): Promise<Array<{segment:SegmentWithSize;entry:VaultMemoryEntry}>> {
    if(!memoryIds.length) return [];
    const snapshot=validated??await this.index.refresh(); const byFile=new Map<string,Set<string>>();
    for(const memoryId of memoryIds){const relativePath=snapshot.byMemoryId.get(memoryId);if(!relativePath)continue;const bucket=byFile.get(relativePath)??new Set<string>();bucket.add(memoryId);byFile.set(relativePath,bucket);}
    const out:Array<{segment:SegmentWithSize;entry:VaultMemoryEntry}>=[];
    for(const relativePath of [...byFile.keys()].sort()){
      const segment=await this.readIndexedSegment(relativePath,snapshot); if(!segment||!segmentInScope(this.paths,segment,scope)) continue;
      const wanted=byFile.get(relativePath)!;
      for(const entry of segment.entries) if(wanted.has(entry.memoryId)) out.push({segment,entry});
    }
    return out;
  }

  async getMemory(scope: MemoryScope,memoryId:string,validated?:SegmentIndexSnapshot):Promise<StoredMemoryRecord|null>{ const found=await this.findEntry(scope,memoryId,validated); return found?toStored(scope,found.segment,found.entry):null; }
  async getMemoryByCanonicalKey(scope:MemoryScope,canonicalKey:string,validated?:SegmentIndexSnapshot):Promise<StoredMemoryRecord|null>{
    const key=normalizeCanonicalKey(canonicalKey),snapshot=validated??await this.index.refresh();
    const relativePath=snapshot.byCanonicalKey.get(canonicalKeyIndexKey(scope.principalId,canonicalFileNativeProjectId(this.paths,scope.projectId),key)); if(!relativePath) return null;
    const segment=await this.readIndexedSegment(relativePath,snapshot); if(!segment||!segmentInScope(this.paths,segment,scope)) return null;
    const entry=segment.entries.find(x=>x.canonicalKey===key); return entry?toStored(scope,segment,entry):null;
  }

  async commit(request: MemoryCommitRequest): Promise<MemoryCommitResult> {
    if(!request.scope.principalId?.trim()) throw new Error('MEMORY_SCOPE_REQUIRED');
    const canonicalKey=normalizeCanonicalKey(request.canonicalKey??''); if(!canonicalKey)throw new Error('MEMORY_CANONICAL_KEY_REQUIRED');
    // One validation pass covers every read this commit makes; the write below invalidates it.
    const snapshot=await this.index.refresh();
    const normalized=normalizeMemoryValue(request.value); const existing=await this.getMemoryByCanonicalKey(request.scope,canonicalKey,snapshot);
    if(existing){
      if(existing.kind!==request.kind)throw new Error('MEMORY_KIND_MISMATCH');
      if(existing.valueHash===normalized.valueHash)return {memoryId:existing.memoryId,revisionId:existing.revisionId,eventId:randomUUID(),revisionNo:existing.revisionNo,deduplicated:true,state:existing.state};
      if(request.revisionAuthority!=='structured_state')throw new Error('MEMORY_REVISION_REQUIRED');
      return this.revise({scope:request.scope,memoryId:existing.memoryId,value:request.value,sourceType:request.sourceType,sourceRef:request.sourceRef,metadata:request.metadata});
    }
    const now=Date.now(); const memoryId=randomUUID(), revisionId=randomUUID(), eventId=randomUUID();
    const entry:VaultMemoryEntry={memoryId,revisionId,revisionNo:1,canonicalKey,kind:request.kind,state:'active',importance:request.importance??0.5,pinned:Boolean(request.pinned),enforcement:request.enforcement??'none',valueText:normalized.valueText,...(normalized.valueJson===undefined?{}:{valueJson:normalized.valueJson}),valueHash:normalized.valueHash,sourceEventId:eventId,createdAt:now,updatedAt:now,title:typeof request.metadata?.title==='string'?String(request.metadata.title):undefined,anchors:buildAnchors(request,canonicalKey,normalized.valueText),relations:[]};
    for(const r of request.explicitRelations??[]){const target=await this.findEntry(request.scope,r.targetMemoryId,snapshot);if(!target||target.entry.state==='tombstoned')throw new Error('MEMORY_RELATION_TARGET_NOT_FOUND');entry.relations.push({targetMemoryId:r.targetMemoryId,targetFile:target.segment.relativePath,relation:r.relation,weight:r.weight??RELATION_WEIGHTS[r.relation]});}
    const family=contextFamily(request), topic=topicKey(request,canonicalKey);
    const projectId=canonicalFileNativeProjectId(this.paths,request.scope.projectId),principalId=request.scope.principalId;
    // chooseSegment filters on exactly this family/principal/project/topic chain, so nothing else is read.
    const segments=await this.segmentChain(family,principalId,projectId,topic,snapshot);const matching=[...segments].sort((a,b)=>b.segmentNo-a.segmentNo)[0];
    const trial=matching?cloneSegment(matching):undefined; if(trial)trial.entries.push(entry);
    const prospective=trial?Buffer.byteLength(serializeVaultSegment(trial),'utf8'):Buffer.byteLength(normalized.valueText,'utf8')+2048;
    const placement=chooseSegment({segments,contextFamily:family,principalId,projectId,topicKey:topic,prospectiveBytes:prospective,semanticDistinct:request.metadata?.semanticDistinct===true});
    if(placement.action==='reuse'&&placement.segment){const updated=cloneSegment(placement.segment);delete (updated as any).byteSize;updated.entries.push(entry);updated.updatedAt=new Date(now).toISOString();await this.writeSegment(updated);}
    else if(placement.action==='successor'&&placement.segment){await this.createSuccessor(placement.segment,entry,now);}
    else {const rel=`${FOLDERS[family]}/${fileNativeProjectNamespace(projectId)}/${fileNativePrincipalNamespace(principalId)}/${topic}-${segmentLabel(1)}.md`;const s:VaultSegment={schemaVersion:1,fileId:`mf_${randomUUID()}`,relativePath:rel,contextFamily:family,principalId,projectId,topicKey:topic,segmentNo:1,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),entries:[entry]};await this.writeSegment(s);}
    await this.writeEvent(eventId,request.scope,'memory.committed',request.sourceType??'primary_ai',request.sourceRef,normalized.valueText,{canonicalKey,kind:request.kind,memoryId});
    return {memoryId,revisionId,eventId,revisionNo:1,deduplicated:false,state:'active'};
  }

  async revise(request:MemoryReviseRequest):Promise<MemoryReviseResult>{
    const found=await this.findEntry(request.scope,request.memoryId);if(!found)throw new Error('MEMORY_NOT_FOUND');
    if(!MUTABLE_MEMORY_KINDS.includes(found.entry.kind as any))throw new Error(`MEMORY_KIND_IMMUTABLE`);
    const normalized=normalizeMemoryValue(request.value); if(normalized.valueHash===found.entry.valueHash)return {memoryId:found.entry.memoryId,revisionId:found.entry.revisionId,eventId:randomUUID(),revisionNo:found.entry.revisionNo,deduplicated:true,state:found.entry.state};
    const now=Date.now(),eventId=randomUUID(),revisionId=randomUUID();
    const prior:StoredMemoryRevision={revisionId:found.entry.revisionId,memoryId:found.entry.memoryId,revisionNo:found.entry.revisionNo,valueText:found.entry.valueText,...(found.entry.valueJson===undefined?{}:{valueJson:found.entry.valueJson}),valueHash:found.entry.valueHash,...(found.entry.sourceEventId?{sourceEventId:found.entry.sourceEventId}:{}),validFrom:found.entry.revisionNo===1?found.entry.createdAt:found.entry.updatedAt,validTo:now,createdAt:found.entry.createdAt};
    await writeImmutableRevision(path.join(this.paths.vaultRoot,'.agent-core','history'),found.entry.memoryId,prior.revisionNo,prior.revisionId,JSON.stringify(prior,null,2)+'\n');
    const s=cloneSegment(found.segment);delete (s as any).byteSize;const e=s.entries.find(x=>x.memoryId===request.memoryId)!;const superseded=e.revisionId;e.revisionId=revisionId;e.revisionNo+=1;e.valueText=normalized.valueText;e.valueJson=normalized.valueJson;e.valueHash=normalized.valueHash;e.sourceEventId=eventId;e.updatedAt=now;s.updatedAt=new Date(now).toISOString();await this.writeSegment(s);
    await this.writeEvent(eventId,request.scope,'memory.revised',request.sourceType??'memory_revise',request.sourceRef,normalized.valueText,{memoryId:request.memoryId});
    return {memoryId:request.memoryId,revisionId,eventId,revisionNo:e.revisionNo,deduplicated:false,state:e.state,supersededRevisionId:superseded};
  }

  async listRevisions(scope:MemoryScope,memoryId:string,validated?:SegmentIndexSnapshot):Promise<StoredMemoryRevision[]>{
    const found=await this.findEntry(scope,memoryId,validated);if(!found)return[];
    const rootExists=await this.checkHistoryRoot();
    const out=rootExists?await this.readHistoricalRevisions(memoryId,true):[];
    out.push(currentRevision(found.entry));return out.sort((a,b)=>a.revisionNo-b.revisionNo);
  }

  /** One operation only: every canonical digest and existing revision body is read afresh. */
  async readScopedRevisionBatch(scope:MemoryScope,validated?:SegmentIndexSnapshot):Promise<Array<{entry:VaultMemoryEntry;revisions:StoredMemoryRevision[]}>>{
    const snapshot=validated??await this.readSnapshot({verifyContent:true});
    if(snapshot.malformedFiles.length)throw new Error('MEMORY_REVISION_VAULT_INVALID');
    const spines=snapshot.spines.filter(spine=>segmentInScope(this.paths,spine,scope));
    const wanted=new Set(spines.flatMap(spine=>spine.memoryIds));
    const before=await this.historyInventory(wanted),out:Array<{entry:VaultMemoryEntry;revisions:StoredMemoryRevision[]}>=[];
    for(const spine of spines){
      const segment=await this.readIndexedSegment(spine.relativePath,snapshot);
      if(!segment)throw new Error('MEMORY_REVISION_VAULT_INVALID');
      if(!segmentInScope(this.paths,segment,scope))throw new Error('MEMORY_REVISION_SCOPE_CHANGED');
      const firstEntries=new Map<string,VaultMemoryEntry>();
      for(const entry of segment.entries)if(!firstEntries.has(entry.memoryId))firstEntries.set(entry.memoryId,entry);
      for(const entry of segment.entries){
        // Preserve the repository's canonical first-path identity rule for duplicate IDs.
        const found=snapshot.byMemoryId.get(entry.memoryId)===spine.relativePath?{entry:firstEntries.get(entry.memoryId)!}:await this.findEntry(scope,entry.memoryId,snapshot);
        const revisions=found&&before.has(entry.memoryId)?await this.readHistoricalRevisions(entry.memoryId,false):[];
        if(found)revisions.push(currentRevision(found.entry));
        out.push({entry,revisions:revisions.sort((a,b)=>a.revisionNo-b.revisionNo)});
      }
    }
    const after=await this.historyInventory(wanted);
    if(before.size!==after.size||[...before].some(([id,kind])=>after.get(id)!==kind))throw new Error('MEMORY_REVISION_HISTORY_CHANGED');
    return out;
  }

  private historyRoot(){return path.join(this.paths.vaultRoot,'.agent-core','history');}
  private async checkHistoryRoot():Promise<boolean>{
    // History may be absent, but none of its existing directory ancestors may redirect outside the vault.
    for(const directory of [this.paths.vaultRoot,path.join(this.paths.vaultRoot,'.agent-core'),this.historyRoot()]){
      let info;try{info=await lstat(directory);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw new Error('MEMORY_REVISION_HISTORY_READ_FAILED');}
      if(info.isSymbolicLink()||!info.isDirectory())throw new Error('MEMORY_REVISION_HISTORY_PATH_INVALID');
    }
    return true;
  }
  private async historyInventory(wanted:ReadonlySet<string>):Promise<Map<string,string>>{
    if(!await this.checkHistoryRoot())return new Map();
    let entries;try{entries=await readdir(this.historyRoot(),{withFileTypes:true});}catch{throw new Error('MEMORY_REVISION_HISTORY_READ_FAILED');}
    const inventory=new Map<string,string>();
    for(const entry of entries){
      if(!wanted.has(entry.name))continue;
      if(entry.isSymbolicLink()||!entry.isDirectory())throw new Error('MEMORY_REVISION_HISTORY_PATH_INVALID');
      inventory.set(entry.name,'directory');
    }
    return inventory;
  }
  private async readHistoricalRevisions(memoryId:string,missingAllowed:boolean):Promise<StoredMemoryRevision[]>{
    if(!/^[A-Za-z0-9._-]+$/.test(memoryId)||memoryId==='.'||memoryId==='..')throw new Error('MEMORY_REVISION_HISTORY_PATH_INVALID');
    const directory=path.join(this.historyRoot(),memoryId);
    let info;try{info=await lstat(directory);}catch(error){if(missingAllowed&&(error as NodeJS.ErrnoException).code==='ENOENT')return[];throw new Error('MEMORY_REVISION_HISTORY_READ_FAILED');}
    if(info.isSymbolicLink()||!info.isDirectory())throw new Error('MEMORY_REVISION_HISTORY_PATH_INVALID');
    const inventory=async()=>{
      let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch{throw new Error('MEMORY_REVISION_HISTORY_READ_FAILED');}
      const files=entries.filter(entry=>entry.name.endsWith('.md'));
      if(files.some(entry=>entry.isSymbolicLink()||!entry.isFile()))throw new Error('MEMORY_REVISION_HISTORY_PATH_INVALID');
      return files.map(entry=>entry.name).sort();
    };
    const before=await inventory(),out:StoredMemoryRevision[]=[];
    for(const name of before){
      let text:string;try{text=await readFile(path.join(directory,name),'utf8');}catch{throw new Error('MEMORY_REVISION_HISTORY_READ_FAILED');}
      try{out.push(JSON.parse(text) as StoredMemoryRevision);}catch{throw new Error('MEMORY_REVISION_HISTORY_INVALID');}
    }
    if(JSON.stringify(await inventory())!==JSON.stringify(before))throw new Error('MEMORY_REVISION_HISTORY_CHANGED');
    return out;
  }

  async addExplicitRelation(input:{scope:MemoryScope;fromMemoryId:string;toMemoryId:string;relation:MemoryRelation;weight?:number;evidenceEventId?:string;reasonCode:string}):Promise<{createdEdges:number}>{
    if(input.fromMemoryId===input.toMemoryId)throw new Error('MEMORY_RELATION_INVALID');const snapshot=await this.index.refresh();const source=await this.findEntry(input.scope,input.fromMemoryId,snapshot),target=await this.findEntry(input.scope,input.toMemoryId,snapshot);if(!source||source.entry.state==='tombstoned')throw new Error('MEMORY_RELATION_SOURCE_NOT_FOUND');if(!target||target.entry.state==='tombstoned')throw new Error('MEMORY_RELATION_TARGET_NOT_FOUND');
    const weight=input.weight??RELATION_WEIGHTS[input.relation];if(!Number.isFinite(weight)||weight<0||weight>1)throw new Error('MEMORY_RELATION_WEIGHT_INVALID');
    if(input.relation==='continues'&&(source.segment.contextFamily!==target.segment.contextFamily||source.segment.topicKey!==target.segment.topicKey))throw new Error('MEMORY_CONTINUATION_FAMILY_MISMATCH');
    const updates=new Map<string,VaultSegment>();const add=(found:NonNullable<typeof source>,to:NonNullable<typeof target>,relation:MemoryRelation)=>{let s=updates.get(found.segment.relativePath);if(!s){s=cloneSegment(found.segment);delete(s as any).byteSize;updates.set(s.relativePath,s);}const e=s.entries.find(x=>x.memoryId===found.entry.memoryId)!;const r:VaultRelation={targetMemoryId:to.entry.memoryId,targetFile:to.segment.relativePath,relation,weight,...(input.evidenceEventId?{evidenceEventId:input.evidenceEventId}:{} )};if(!new Set(e.relations.map(relationKey)).has(relationKey(r)))e.relations.push(r);};
    const beforeCount=source.entry.relations.length;add(source,target,input.relation);if(shouldMirrorMemoryRelation(input.relation))add(target,source,input.relation);await this.writeSegmentsTransaction([...updates.values()]);return{createdEdges:(updates.get(source.segment.relativePath)?.entries.find(e=>e.memoryId===source.entry.memoryId)?.relations.length??beforeCount)-beforeCount+(shouldMirrorMemoryRelation(input.relation)?1:0)};
  }

  async tombstoneMemory(scope:MemoryScope,memoryId:string,reason:string):Promise<void>{const found=await this.findEntry(scope,memoryId);if(!found)throw new Error('MEMORY_NOT_FOUND');const s=cloneSegment(found.segment);delete(s as any).byteSize;const e=s.entries.find(x=>x.memoryId===memoryId)!;e.state='tombstoned';e.updatedAt=Date.now();s.updatedAt=new Date(e.updatedAt).toISOString();await this.writeSegment(s);await this.writeEvent(randomUUID(),scope,'memory.tombstoned','memory_forget',memoryId,reason,{memoryId});}

  /** Move a memory into a new lifecycle state without touching its current revision content. */
  async setMemoryState(scope:MemoryScope,memoryId:string,state:MemoryState,eventType:string,metadata:Record<string,unknown>):Promise<void>{
    const found=await this.findEntry(scope,memoryId);if(!found)throw new Error('MEMORY_NOT_FOUND');
    const s=cloneSegment(found.segment);delete(s as any).byteSize;const e=s.entries.find(x=>x.memoryId===memoryId)!;
    if(e.state===state)return; e.state=state;e.updatedAt=Date.now();s.updatedAt=new Date(e.updatedAt).toISOString();
    await this.writeSegment(s);await this.writeEvent(randomUUID(),scope,eventType,'memory_lifecycle',undefined,e.valueText,{memoryId,state,...metadata});
  }

  private async createSuccessor(current:SegmentWithSize,entry:VaultMemoryEntry,now:number):Promise<void>{const left=cloneSegment(current);delete(left as any).byteSize;const parent=path.dirname(left.relativePath).replace(/\\/g,'/');const rel=`${parent}/${left.topicKey}-${segmentLabel(left.segmentNo+1)}.md`;const right:VaultSegment={schemaVersion:1,fileId:`mf_${randomUUID()}`,relativePath:rel,contextFamily:left.contextFamily,principalId:left.principalId,projectId:left.projectId,topicKey:left.topicKey,segmentNo:left.segmentNo+1,previousFile:left.relativePath,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),entries:[entry]};left.nextFile=right.relativePath;left.updatedAt=new Date(now).toISOString();await this.writeSegmentsTransaction([left,right]);}
  private async writeSegment(segment:VaultSegment):Promise<void>{const target=path.join(this.paths.vaultRoot,...segment.relativePath.split('/'));const content=serializeVaultSegment(segment);this.index.invalidate(segment.relativePath);this.parsed.delete(segment.relativePath);await atomicReplaceValidated(target,content,t=>{parseVaultSegment(t,segment.relativePath);});}
  private async writeSegmentsTransaction(segments:VaultSegment[]):Promise<void>{const mutations=[] as Array<{path:string;beforeContent?:string;afterContent:string}>;for(const s of segments){const target=path.join(this.paths.vaultRoot,...s.relativePath.split('/'));let before: string|undefined;try{before=await readFile(target,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}mutations.push({path:target,...(before===undefined?{}:{beforeContent:before}),afterContent:serializeVaultSegment(s)});}const journal=new VaultTransactionJournal(this.paths.transactionRoot);const jp=await journal.begin(mutations);for(let i=0;i<segments.length;i++){const s=segments[i]!,m=mutations[i]!;this.index.invalidate(s.relativePath);this.parsed.delete(s.relativePath);await atomicReplaceValidated(m.path,m.afterContent,t=>{parseVaultSegment(t,s.relativePath);});}await rm(jp,{force:true});}
  private async writeEvent(eventId:string,scope:MemoryScope,eventType:string,sourceType:string,sourceRef:string|undefined,text:string,metadata:Record<string,unknown>):Promise<void>{const dir=path.join(this.paths.vaultRoot,'.agent-core','events');await mkdir(dir,{recursive:true});const safeText=redactMemoryText(text).text;await writeFile(path.join(dir,`${eventId}.json`),JSON.stringify({eventId,principalId:scope.principalId,projectId:canonicalFileNativeProjectId(this.paths,scope.projectId),eventType,sourceType,sourceRef:sourceRef?redactMemoryText(sourceRef).text:undefined,redactedText:safeText,metadata,createdAt:Date.now()},null,2)+'\n',{encoding:'utf8',flag:'wx'});}
}
