import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { bootstrapRecord, normalizeRecord, parseCanonicalNote, serializeCanonicalNote, validateMemoryId } from './note-format.js';
import { notePath, type MemoryPaths } from './paths.js';
import { buildPublicationMutation, buildRevisionMutation, parseRevisionFile, readKnownMemoryRevision, readMemoryRevisions, type HistoricalMemorySnapshot, type KnownHistoryCoverage, type MemoryRevisionRead } from './revisions.js';
import { assertMemoryRecordSafe } from './safety.js';
import { memoryRetirementFingerprint } from './retirement.js';
import { assertContainedPath, fingerprintFile, fingerprintText, nextMemoryPublicationClock, MemoryTransactionCoordinator, type MemoryTransactionMutation } from './transaction.js';
import type { MemoryIssue, MemoryRecord } from './types.js';
import { MEMORY_LOCK_STALE_MS, withMemoryProcessLock } from './lock.js';
import { buildArchiveMutations, buildRecordAuditMutations, readArchivedMemory, isMemoryArchiveManifestKey } from './archive.js';
import { experienceManifestSchema, isoInstantSchema, legacyExperience, type ExperienceManifest, type SourceRef } from './experience-types.js';
import { memorySemanticRevision } from './disclosure.js';

export interface LoadedMemories {
  records: MemoryRecord[];
  issues: MemoryIssue[];
  complete: boolean;
  fingerprints: ReadonlyMap<string,string|null>;
}

export interface MemoryBatchPlan<T> {
  records: MemoryRecord[];
  touchedIds: string[];
  result: T;
}

async function exists(filePath: string): Promise<boolean> {
  try { await readFile(filePath); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export type StateSnapshot = {content:string|null;fingerprint:string|null};
export type StoreSnapshot = {records:MemoryRecord[];state:ReadonlyMap<string,StateSnapshot>;experience:ExperienceManifest|null};
export type StorePlan<T> = MemoryBatchPlan<T> & {stateWrites:Array<{key:string;content:string}>;
  /** Host-only bounded, read-only evidence check. Must not acquire this store lock or write. */
  validateSources?:()=>Promise<void>};

export class FileMemoryStore {
  private readonly transactions: MemoryTransactionCoordinator;

  constructor(readonly paths: MemoryPaths, private readonly options: {experience?:{enabled:true};hostActivation?:boolean} = {}) {
    this.transactions = new MemoryTransactionCoordinator(paths.state);
  }

  async initialize(): Promise<LoadedMemories> {
    await assertContainedPath(this.paths.root,this.paths.bootstrap);
    await mkdir(this.paths.root,{recursive:true});
    return withMemoryProcessLock(this.paths.lock,async () => {
      for (const dir of [this.paths.notes,this.paths.index,this.paths.state,this.paths.revisions]) {
        await assertContainedPath(this.paths.root,dir); await mkdir(dir,{recursive:true});
      }
      await this.transactions.initialize();
      const {manifest} = await this.activation();
      const loaded = await this.loadAll();
      this.assertActivationRecords(manifest,loaded.records);
      if (!manifest && this.options.experience?.enabled) {
        if (!loaded.complete || loaded.records.some(record => !record.pinned)
          || (await readdir(this.paths.notes)).length || (await readdir(this.paths.revisions)).length
          || (await readdir(this.paths.state)).some(name=>![...['transactions','revisions','feedback.json'],...(this.options.hostActivation?['host','backups']:[])].includes(name))) {
          throw new Error('MEMORY_EXPERIENCE_REQUIRES_EMPTY_ROOT');
        }
        const feedback = await readFile(path.join(this.paths.state,'feedback.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
        if (feedback !== null) {
          const visibility = JSON.parse(feedback);
          if (visibility.version !== 1 || !Array.isArray(visibility.records) || visibility.records.length) throw new Error('MEMORY_EXPERIENCE_REQUIRES_EMPTY_ROOT');
        }
        const next:ExperienceManifest = {schemaVersion:1,formatVersion:2,rootId:randomUUID(),generation:1,status:'complete'};
        await this.transactions.commit([
          ...await buildArchiveMutations(this.paths,loaded.records),
          {targetPath:this.paths.experienceManifest,content:JSON.stringify(next)+'\n',expectedFingerprint:null},
        ]);
      }
      return loaded;
    // Cold startup must outwait an orphan lease; ordinary operations keep their short timeout.
    }, MEMORY_LOCK_STALE_MS + 5_000);
  }

  private assertActivationRecords(manifest:ExperienceManifest|null,records:MemoryRecord[]):void {
    if (!manifest && records.some(record=>record.version===2)) throw new Error('MEMORY_EXPERIENCE_MANIFEST_REQUIRED');
    if (manifest && records.some(record=>!record.pinned && record.version!==2)) throw new Error('MEMORY_EXPERIENCE_SCHEMA_MISMATCH');
  }

  async experienceEnabled():Promise<boolean> {
    return withMemoryProcessLock(this.paths.lock,async()=>{await this.transactions.recover();return Boolean((await this.activation()).manifest);});
  }

  private async activation(): Promise<{manifest:ExperienceManifest|null;fingerprint:string|null}> {
    await assertContainedPath(this.paths.root,this.paths.experienceManifest);
    try {
      const bytes = await readFile(this.paths.experienceManifest,'utf8');
      const manifest = experienceManifestSchema.parse(JSON.parse(bytes));
      if (manifest.status !== 'complete') throw new Error('MEMORY_EXPERIENCE_INCOMPLETE');
      if(!manifest.knowledgeClock){
        // An old root has only v1 snapshots. Missing a watermark on already
        // published v2 history is corruption, never permission to reset order.
        const names=await readdir(this.paths.revisions).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
        for(const name of names.filter(name=>name.endsWith('.json'))){
          const file=await assertContainedPath(this.paths.root,path.join(this.paths.revisions,name));
          if(parseRevisionFile(await readFile(file,'utf8'),path.basename(name,'.json')).version===2)throw new Error('MEMORY_PUBLICATION_CLOCK_REQUIRED');
        }
      }
      return {manifest,fingerprint:fingerprintText(bytes)};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        for (const dir of [this.paths.archiveObjects,this.paths.archiveManifests,...['episodes','episode-tasks','capsules','operations','consolidation','claim-reviews'].map(name=>path.join(this.paths.state,name))]) {
          await assertContainedPath(this.paths.root,dir);
          const names = await readdir(dir).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
          if (names.length) throw new Error('MEMORY_EXPERIENCE_MANIFEST_REQUIRED');
        }
        return {manifest:null,fingerprint:null};
      }
      throw error;
    }
  }

  /** Consistent engine snapshot. Reader must be local and must not acquire the memory lock again. */
  async snapshot():Promise<LoadedMemories>;
  async snapshot<T>(reader:(loaded:LoadedMemories,experience:ExperienceManifest|null)=>Promise<T>):Promise<T>;
  async snapshot<T>(reader?: (loaded:LoadedMemories,experience:ExperienceManifest|null)=>Promise<T>): Promise<T|LoadedMemories> {
    return withMemoryProcessLock(this.paths.lock,async () => {
      await this.transactions.recover(); const {manifest} = await this.activation();
      const loaded = await this.loadAll();
      this.assertActivationRecords(manifest,loaded.records);
      return reader ? reader(loaded,manifest) : loaded;
    });
  }

  async archivedRevision(ref:SourceRef):Promise<MemoryRecord|null> {
    return withMemoryProcessLock(this.paths.lock,async () => {
      await this.transactions.recover();
      if (!(await this.activation()).manifest) return null;
      try { return await readArchivedMemory(this.paths,ref); }
      catch (error) {
        if (((error as Error).cause as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
        throw error;
      }
    });
  }

  /** History and current privacy eligibility are checked under the same canonical lock. */
  async historicalSnapshot(workspace:string,input:{knownAt:string;maxRecords:number},eligible?:(loaded:LoadedMemories)=>Promise<MemoryRecord[]>):Promise<HistoricalMemorySnapshot> {
    const knownAt=isoInstantSchema.parse(input.knownAt);
    if(!Number.isInteger(input.maxRecords)||input.maxRecords<1||input.maxRecords>500)throw new Error('MEMORY_INPUT_INVALID');
    return this.snapshot(async(loaded,manifest)=>{
      if(!manifest)throw new Error('MEMORY_TEMPORAL_UNSUPPORTED');
      if(!loaded.complete)throw new Error('MEMORY_SOURCE_UNAVAILABLE');
      if(manifest.knowledgeClock?.regressed)return {records:[],revisionRefs:[],coverage:{complete:false,reason:'clock-regression'}};
      const allowed=eligible?await eligible(loaded):loaded.records.filter(record=>record.provenance?.workspace===workspace);
      const current=allowed.filter(record=>!record.pinned).sort((a,b)=>a.id.localeCompare(b.id));
      let coverage:KnownHistoryCoverage={complete:true};const records:MemoryRecord[]=[];
      for(const record of current.slice(0,input.maxRecords)){
        const historical=await readKnownMemoryRevision(this.paths,record,knownAt,manifest.knowledgeClock);
        if(!historical.coverage.complete)coverage=historical.coverage;
        else if(coverage.complete&&historical.coverage.from&&(!coverage.from||historical.coverage.from>coverage.from))coverage={...coverage,from:historical.coverage.from};
        // Current visibility cannot authorize a formerly foreign revision.
        if(historical.record&&historical.record.provenance?.workspace===workspace)records.push(historical.record);
      }
      if(current.length>input.maxRecords)coverage={complete:false,reason:'bounded-scan'};
      return {records,coverage,revisionRefs:records.map(record=>({kind:'memory' as const,id:record.id,revision:memorySemanticRevision(record)}))};
    });
  }

  async loadAll(): Promise<LoadedMemories> {
    const records: MemoryRecord[] = [];
    const fingerprints = new Map<string,string|null>();
    const issues: MemoryIssue[] = [];
    let complete = true;

    await assertContainedPath(this.paths.root,this.paths.bootstrap);
    await assertContainedPath(this.paths.root,this.paths.notes);
    if (!await exists(this.paths.bootstrap)) {
      complete = false;
      issues.push({ path: this.paths.bootstrap, message: 'Pinned bootstrap memory is missing', severity: 'error' });
    } else {
      try {
        const bytes = await readFile(this.paths.bootstrap,'utf8');
        fingerprints.set(this.paths.bootstrap,fingerprintText(bytes));
        records.push(bootstrapRecord(bytes,this.paths.bootstrap));
      } catch (error) {
        complete = false;
        issues.push({ path: this.paths.bootstrap, message: error instanceof Error ? error.message : String(error), severity: 'error' });
      }
    }

    let entries: string[] = [];
    try { entries = await readdir(this.paths.notes); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    for (const name of entries.filter((value) => value.toLowerCase().endsWith('.md')).sort()) {
      const filePath = path.join(this.paths.notes, name);
      try {
        await assertContainedPath(this.paths.root,filePath);
        const bytes = await readFile(filePath,'utf8');
        fingerprints.set(filePath,fingerprintText(bytes));
        const record = parseCanonicalNote(bytes);
        if (`${record.id}.md` !== name) throw new Error(`Memory id/file mismatch: ${record.id}`);
        records.push(record);
      } catch (error) {
        complete = false;
        issues.push({ path: filePath, message: error instanceof Error ? error.message : String(error), severity: 'degraded' });
      }
    }

    const duplicates = new Map<string, number>();
    for (const record of records) duplicates.set(record.id, (duplicates.get(record.id) ?? 0) + 1);
    for (const [id, count] of duplicates) if (count > 1) {
      complete = false;
      issues.push({ path: this.paths.notes, message: `Duplicate memory id: ${id}`, severity: 'error' });
    }
    return { records, issues, complete, fingerprints };
  }

  async read(id: string): Promise<MemoryRecord | null> {
    validateMemoryId(id);
    if (id === 'agent-core-foundational') {
      if (!await exists(this.paths.bootstrap)) return null;
      return bootstrapRecord(await readFile(this.paths.bootstrap, 'utf8'), this.paths.bootstrap);
    }
    const filePath = await assertContainedPath(this.paths.root,notePath(this.paths, id));
    try { return parseCanonicalNote(await readFile(filePath, 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async revisions(id: string, limit = 5): Promise<MemoryRevisionRead> {
    if (id === 'agent-core-foundational') return { revisions: [] };
    return readMemoryRevisions(this.paths, id, limit);
  }


  private assertLinkTargets(record: MemoryRecord, records: MemoryRecord[]): void {
    const ids = new Set(records.map((item) => item.id));
    for (const link of record.links) {
      if (link.targetId === record.id) throw new Error('Memory cannot link to itself');
      if (!ids.has(link.targetId)) throw new Error(`Linked memory not found at commit time: ${link.targetId}`);
      for (const ref of link.evidenceRefs ?? []) {
        if (!ref.toLowerCase().startsWith('memory:')) continue;
        const evidenceId = ref.slice('memory:'.length);
        if (!ids.has(evidenceId)) throw new Error(`Linked memory evidence not found at commit time: ${evidenceId}`);
      }
    }
  }

  async mutate(id: string, mutation: (current: MemoryRecord, validIds: Set<string>) => MemoryRecord): Promise<MemoryRecord> {
    validateMemoryId(id);
    const committed = await this.commitPlan([],({records}) => {
      const current = records.find(record => record.id === id);
      if (!current) throw new Error(`Memory not found: ${id}`);
      if (current.pinned) throw new Error('Pinned foundational memory cannot be rewritten through ordinary store APIs');
      const next = mutation(current,new Set(records.map(record => record.id)));
      if (next.id !== id || next.pinned) throw new Error('Memory mutation cannot change identity or pin state');
      return {records:records.map(record => record.id === id ? next : record),touchedIds:[id],stateWrites:[],result:id};
    },true);
    return committed.records.find(record => record.id === id)!;
  }

  async create(record: MemoryRecord): Promise<void> {
    if (record.pinned) throw new Error('Pinned memories cannot be created through ordinary store APIs');
    await this.commitPlan([],({records}) => {
      if (records.some(current => current.id === record.id)) throw new Error(`Memory already exists: ${record.id}`);
      return {records:[...records,record],touchedIds:[record.id],stateWrites:[],result:undefined};
    },true);
  }

  private statePath(key: string): {path:string;immutable:boolean;readOnly?:boolean} {
    if (key === 'feedback.json') return {path:path.join(this.paths.state,key),immutable:false,readOnly:true};
    const id = '[A-Za-z0-9][A-Za-z0-9._-]{2,127}', digest = '[a-f0-9]{64}';
    if (new RegExp(`^episode-tasks/${digest}\\.json$`).test(key)) return {path:path.join(this.paths.state,key),immutable:false};
    if (new RegExp(`^claim-reviews/${digest}\\.json$`).test(key)) return {path:path.join(this.paths.state,key),immutable:false};
    if (new RegExp(`^episodes/${id}/manifest\\.json$`).test(key)) return {path:path.join(this.paths.state,key),immutable:false};
    if (new RegExp(`^(?:episodes/${id}/events/[0-9]+-${id}\\.json|capsules/${id}/${digest}\\.json|operations/${digest}\\.json|consolidation/${id}\\.json)$`).test(key)) {
      return {path:path.join(this.paths.state,key),immutable:!key.startsWith('consolidation/')};
    }
    if (new RegExp(`^archive/(?:objects/${digest}|manifests/${id}\\.json)$`).test(key)) return {path:path.join(this.paths.root,key),immutable:true};
    if (isMemoryArchiveManifestKey(key)) return {path:path.join(this.paths.root,key),immutable:true,readOnly:true};
    throw new Error('MEMORY_STATE_KEY_INVALID');
  }

  async transact<T>(stateKeys:readonly string[],planner:(snapshot:StoreSnapshot)=>StorePlan<T>):Promise<{records:MemoryRecord[];result:T}> {
    return this.commitPlan(stateKeys,planner);
  }

  private async commitPlan<T>(stateKeys:readonly string[],planner:(snapshot:StoreSnapshot)=>StorePlan<T>,tolerateLegacyDegraded=false):Promise<{records:MemoryRecord[];result:T}> {
    return withMemoryProcessLock(this.paths.lock,async () => {
      await this.transactions.recover();
      const {manifest:activation,fingerprint:activationFingerprint} = await this.activation();
      const loaded = await this.loadAll();
      if (loaded.issues.length && (activation || !tolerateLegacyDegraded || loaded.issues.some(issue=>issue.severity==='error'))) throw new Error('Canonical memory store contains issues; batch mutation is blocked');
      this.assertActivationRecords(activation,loaded.records);
      if (!activation && stateKeys.length) throw new Error('MEMORY_EXPERIENCE_MANIFEST_REQUIRED');
      const readSet = new Map<string,string|null>();
      for (const record of loaded.records) {
        const target = record.pinned ? this.paths.bootstrap : notePath(this.paths,record.id);
        readSet.set(target,loaded.fingerprints.get(target) ?? null);
      }
      // Activation decisions and CAS must refer to the exact same bytes (or original absence).
      readSet.set(this.paths.experienceManifest,activationFingerprint);
      const state = new Map<string,StateSnapshot>();
      for (const key of stateKeys) {
        if (state.has(key)) throw new Error('MEMORY_STATE_KEY_DUPLICATE');
        const target = await assertContainedPath(this.paths.root,this.statePath(key).path);
        const content = await readFile(target,'utf8').catch(error => {if (error.code === 'ENOENT') return null; throw error;});
        const fingerprint = content === null ? null : fingerprintText(content);
        state.set(key,{content,fingerprint}); readSet.set(target,fingerprint);
      }
      const plan = planner({records:structuredClone(loaded.records),state,experience:activation});
      if (!plan || typeof (plan as unknown as {then?:unknown}).then === 'function') throw new Error('MEMORY_PLANNER_MUST_BE_SYNCHRONOUS');
      const before = new Map(loaded.records.map(record => [record.id,record]));
      const after = new Map<string,MemoryRecord>();
      for (let record of plan.records) {
        validateMemoryId(record.id);
        if (after.has(record.id)) throw new Error(`Duplicate memory id in batch: ${record.id}`);
        if (activation && !record.pinned && record.version === 1) record = {...record,version:2,experience:legacyExperience()};
        if (!activation && record.version === 2) throw new Error('MEMORY_EXPERIENCE_MANIFEST_REQUIRED');
        record = normalizeRecord(record,record.content);
        after.set(record.id,record);
      }
      if (serializeCanonicalNote(before.get('agent-core-foundational')!) !== serializeCanonicalNote(after.get('agent-core-foundational')!)) {
        throw new Error('Pinned foundational memory cannot be altered through memory_batch');
      }
      const finalRecords = [...after.values()];
      for (const record of finalRecords) {
        if (record.pinned && record.id !== 'agent-core-foundational') throw new Error('Pinned memories cannot be created through ordinary store APIs');
        // Legacy single-record APIs historically validate only their touched/new record.
        // Batch and every activated-root write retain whole-store link validation.
        if (!record.pinned && (activation || !tolerateLegacyDegraded || plan.touchedIds.includes(record.id))) this.assertLinkTargets(record,finalRecords);
      }
      const mutations:MemoryTransactionMutation[] = [], retained:MemoryRecord[] = [];
      let publicationClock=activation?.knowledgeClock;
      for (const id of new Set([...before.keys(),...after.keys()])) {
        if (id === 'agent-core-foundational') continue;
        const previous = before.get(id), next = after.get(id);
        if (!next && activation) throw new Error('MEMORY_PRESERVATION_REQUIRED');
        const targetPath = notePath(this.paths,id);
        const expectedFingerprint = readSet.get(targetPath) ?? null;
        if (!next) { mutations.push({targetPath,content:null,expectedFingerprint}); continue; }
        const content = serializeCanonicalNote(next);
        if (!previous || serializeCanonicalNote(previous) !== content) {
          assertMemoryRecordSafe(next);
          const semanticChange = previous && memorySemanticRevision(previous) !== memorySemanticRevision(next);
          if (activation && (!previous || semanticChange)) {
            publicationClock=nextMemoryPublicationClock(publicationClock);
            mutations.push(await buildPublicationMutation(this.paths,previous,next,publicationClock));
          }
          else if (!activation && previous && previous.content !== next.content) mutations.push(await buildRevisionMutation(this.paths,previous));
          if (activation) {
            retained.push(...(previous ? [previous] : []),next);
            if (previous && !semanticChange) mutations.push(...await buildRecordAuditMutations(this.paths,previous,next));
          }
          mutations.push({targetPath,content,expectedFingerprint});
        }
      }
      if (activation) {
        mutations.unshift(...await buildArchiveMutations(this.paths,retained));
        if(publicationClock!==activation.knowledgeClock)mutations.push({targetPath:this.paths.experienceManifest,
          content:JSON.stringify({...activation,knowledgeClock:publicationClock})+'\n',expectedFingerprint:activationFingerprint});
      }
      const written = new Set<string>();
      for (const write of plan.stateWrites) {
        const snapshot = state.get(write.key);
        if (!snapshot || written.has(write.key)) throw new Error('MEMORY_STATE_WRITE_UNDECLARED_OR_DUPLICATE');
        written.add(write.key);
        const destination = this.statePath(write.key);
        if (destination.readOnly) throw new Error('MEMORY_STATE_READ_ONLY');
        if (destination.immutable && snapshot.content !== null && snapshot.content !== write.content) throw new Error('MEMORY_STATE_IMMUTABLE_CONFLICT');
        if (write.key.startsWith('archive/objects/') && write.key.slice('archive/objects/'.length) !== fingerprintText(write.content)) throw new Error('MEMORY_ARCHIVE_DIGEST_MISMATCH');
        if (snapshot.content !== write.content) mutations.push({targetPath:destination.path,content:write.content,expectedFingerprint:snapshot.fingerprint});
      }
      for (const [target,expected] of readSet) if (await fingerprintFile(target) !== expected) throw new Error('MEMORY_REVISION_CONFLICT');
      await plan.validateSources?.();
      await this.transactions.commit(mutations);
      return {records:finalRecords,result:plan.result};
    });
  }

  async batch<T>(planner:(records:MemoryRecord[])=>MemoryBatchPlan<T>):Promise<{records:MemoryRecord[];result:T}> {
    return this.transact([],snapshot => ({...planner(snapshot.records),stateWrites:[]}));
  }

  async deleteWithLinkRepair(id: string, expectedReviewFingerprint?: string): Promise<boolean> {
    if (id === 'agent-core-foundational') throw new Error('Pinned foundational memory cannot be deleted');
    const normalized = id.trim();
    const committed = await this.batch((records) => {
      const byId = new Map(records.map((record) => [record.id, record]));
      const target = byId.get(normalized);
      if (!target) return { records, touchedIds: [], result: false };
      if (target.pinned) throw new Error('Pinned foundational memory cannot be deleted');
      if (expectedReviewFingerprint) {
        const expected = expectedReviewFingerprint.trim().toLowerCase();
        if (!/^sha256:[0-9a-f]{64}$/.test(expected)) throw new Error('MEMORY_RETIREMENT_FINGERPRINT_INVALID');
        if (memoryRetirementFingerprint(target) !== expected) {
          throw new Error('MEMORY_RETIREMENT_REVIEW_STALE');
        }
      }

      byId.delete(normalized);
      const touched = new Set<string>([normalized]);
      const now = new Date().toISOString();
      for (const [recordId, record] of byId) {
        if (record.pinned) continue;
        const filtered = record.links.filter((link) => link.targetId !== normalized);
        if (filtered.length === record.links.length) continue;
        byId.set(recordId, {
          ...record,
          links: filtered,
          updatedAt: now,
          evolutionHistory: [...record.evolutionHistory, {
            kind: 'link_removed' as const,
            timestamp: now,
            source: 'system' as const,
            changedFields: ['links'],
            details: { removedTargetId: normalized, reason: 'target_deleted' },
          }].slice(-64),
        });
        touched.add(recordId);
      }
      return { records: [...byId.values()], touchedIds: [...touched], result: true };
    });
    return committed.result;
  }
}
