import {evaluateIntentions,decodeIntention,intentionObservationSchema,type IntentionObservation} from './prospective-intentions.js';
import {promotionEpistemicRefs} from './promotion.js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { budgetedCapsuleSchema,isCurrentWorkingAssertion,renderTaskCapsule,uniqueSourceRefs,workingItemRefs } from './capsule.js';
import { archiveJsonKey, archiveTextObjectKey, readArchivedJson, readArchiveObject, readArchivedMemory, readArchiveManifest, memoryArchiveManifestKey } from './archive.js';
import { disclosureDigest, memorySemanticRevision, MemoryControllerError, parseControllerInput, stableDisclosureJson } from './disclosure.js';
import type { Budgeted,ControllerScope, MemoryControllerErrorCode } from './disclosure.js';
import { ingestionBindingSchema,ingestionCursorInputSchema,ingestionReceiptSchema,retentionInputSchema,retentionReceiptSchema,appendEventInputSchema, captureEvidenceInputSchema, checkpointInputSchema,digestSchema, episodeHeaderSchema, episodeStatusInputSchema, isoInstantSchema, safeIdSchema, sourceRefSchema, startEpisodeInputSchema, taskCapsuleSchema,temporalAssertionSchema,timeValueSchema, workingItemSchema, workingStateChangeSchema } from './experience-types.js';
import type { IngestionCursor,RetentionInput,RetentionReceipt,AppendEventInput, ArtifactReceipt, CaptureEvidenceInput, CheckpointInput,EpisodeAppendResult, EpisodeEvent, EpisodeHeader, EpisodeStatusInput, ExperienceManifest, SourceRef, StartEpisodeInput,TaskCapsule,TaskContext, WorkingItem } from './experience-types.js';
import { strictForgottenIdsFromContent } from './feedback.js';
import { isMemoryLinkActive } from './relations.js';
import { scanMemorySafety } from './safety.js';
import { memorySourcePathAllowed } from './source-snapshot.js';
import { assessMemoryStaleness } from './provenance.js';
import type { FileMemoryStore, StoreSnapshot } from './store.js';
import { assertContainedPath, fingerprintText } from './transaction.js';
import type { MemoryRecord } from './types.js';
import { isMemoryExpired } from './visibility.js';
import { decideToolEvidenceCapture } from '../security/evidence-capture-policy.js';
import { assertEvidenceLocalPath,evidenceDirectoryIdentity, EVIDENCE_DOCUMENT_MAX, readEvidenceSnapshot, revalidateEvidenceSnapshot,sameEvidenceIdentity } from '../verification/evidence-snapshot.js';
const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
const ownershipSchema = z.strictObject({ rootId: safeIdSchema, workspaceKey: z.string().min(1), taskId: identity });
type Ownership = z.infer<typeof ownershipSchema>;
const eventSchema = z.strictObject({ schemaVersion: z.literal(1), id: safeIdSchema, episodeId: safeIdSchema, sequence: z.number().int().positive(), operationId: identity, kind: z.enum(['action', 'observation', 'decision', 'failure', 'success', 'correction', 'checkpoint', 'status-change']), summary: z.string().min(1), recordedAt: isoInstantSchema, observedAt: timeValueSchema.optional(), temporalAssertion:temporalAssertionSchema.optional(),clockSkewMs:z.number().positive().optional(), origin: z.strictObject({ controllerId: identity, sessionId: identity.optional(), role: z.enum(['controller', 'tool', 'user']) }), sourceRefs: z.array(sourceRefSchema).max(64), stateChanges: z.array(workingStateChangeSchema).max(64), ingestion:ingestionBindingSchema.optional() });
const eventManifestSchema = z.strictObject({ schemaVersion: z.literal(1), kind: z.literal('event'), owner: ownershipSchema, event: eventSchema });
const episodeSnapshotSchema = z.strictObject({ schemaVersion: z.literal(1), kind: z.literal('episode'), owner: ownershipSchema, header: episodeHeaderSchema, predecessorRef: sourceRefSchema.optional(), workingState: z.array(workingItemSchema), eventRefs: z.array(sourceRefSchema) });
type EpisodeSnapshot = z.infer<typeof episodeSnapshotSchema>;
const liveSchema = z.strictObject({ schemaVersion: z.literal(1), owner: ownershipSchema, header: episodeHeaderSchema, snapshotRef: sourceRefSchema,capsuleRef:sourceRefSchema.optional() });
const taskSchema = z.strictObject({ schemaVersion: z.literal(1), owner: ownershipSchema, episodeId: safeIdSchema });
const fileIdentitySchema=z.strictObject({dev:z.string().regex(/^\d+$/).max(40),ino:z.string().regex(/^\d+$/).max(40),bytes:z.number().int().nonnegative().max(EVIDENCE_DOCUMENT_MAX),mtimeNs:z.string().regex(/^-?\d+$/).max(40),ctimeNs:z.string().regex(/^-?\d+$/).max(40),birthtimeNs:z.string().regex(/^-?\d+$/).max(40)});
const artifactManifestSchema = z.strictObject({ schemaVersion: z.literal(1), id: safeIdSchema, kind: z.literal('artifact'), owner: ownershipSchema,originIdentity:z.strictObject({rootDigest:digestSchema,fileIdentity:fileIdentitySchema}).optional(), origin: z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('workspace-file'), relativePath: z.string().optional(), controllerId: identity, sessionId: identity.optional(), role: z.literal('controller') }),
        z.strictObject({ kind: z.literal('controller-text'), originRef: z.string().optional(), controllerId: identity, sessionId: identity.optional(), role: z.literal('controller') }),
    ]), observedAt: timeValueSchema.optional(), capturedAt: isoInstantSchema, availability: z.enum(['available', 'reference-only', 'unavailable']), bodyDigest: digestSchema.optional(), bytes: z.number().int().nonnegative().max(EVIDENCE_DOCUMENT_MAX).optional(), mediaType: z.literal('text/plain; charset=utf-8'), reason: z.string().optional() })
    .refine(value => value.availability === 'available' ? value.bodyDigest !== undefined && value.bytes !== undefined && value.reason === undefined : value.bodyDigest === undefined && value.bytes === undefined && value.reason !== undefined);
const capsuleManifestSchema=z.strictObject({schemaVersion:z.literal(1),kind:z.literal('capsule'),owner:ownershipSchema,capsule:taskCapsuleSchema,
  episodeRef:sourceRefSchema,memoryDependencies:z.array(sourceRefSchema),lineageRefs:z.array(sourceRefSchema),currentAssertionRefs:z.array(sourceRefSchema),predecessorRef:sourceRefSchema.optional()});
type CapsuleManifest=z.infer<typeof capsuleManifestSchema>;
const receiptSchema = z.strictObject({ schemaVersion: z.literal(1), owner: ownershipSchema, method: z.enum(['startEpisode', 'appendEvent', 'setEpisodeStatus', 'captureEvidence','checkpoint','setRetention']), operationId: identity, payloadDigest: digestSchema, result: z.unknown() });
/** Internal transfer validator reuses persistence schemas; not a controller API. */
export const episodePersistenceSchemas = { event:eventSchema, eventManifest:eventManifestSchema, episode:episodeSnapshotSchema, live:liveSchema, task:taskSchema, artifact:artifactManifestSchema, capsule:capsuleManifestSchema, receipt:receiptSchema };
const appendResultSchema = z.strictObject({episodeId:safeIdSchema,revision:z.number().int().positive(),eventRef:sourceRefSchema,duplicate:z.boolean(),ingestionReceipt:ingestionReceiptSchema.optional()});
function fail(code: MemoryControllerErrorCode): never { throw new MemoryControllerError(code); }
const json = (value: unknown) => stableDisclosureJson(value) + '\n';
const revision = (content: string) => `sha256:${fingerprintText(content)}`;
const liveKey = (id: string) => `episodes/${id}/manifest.json`;
const episodeArchiveId = (ref: SourceRef) => `episode-${ref.id}-${ref.revision.slice(7)}`;
const origin = (scope: ControllerScope) => ({ controllerId: scope.controllerId, ...(scope.sessionId ? { sessionId: scope.sessionId } : {}), role: 'controller' as const });
/** Events, not a replacement array, own current working state. No semantic verification is inferred. */
function reduce(events: EpisodeEvent[]): WorkingItem[] {
    const items = new Map<string, WorkingItem>();
    for (const event of events)
        for (const change of event.stateChanges) {
            if (change.op === 'resolve') {
                const prior = items.get(change.itemId);
                if (!prior || prior.state !== 'active' || !change.reason.trim() || !change.sourceRefs.length)
                    fail('MEMORY_PRESERVATION_REQUIRED');
                items.set(prior.id, { ...prior, state: 'resolved', sourceRefs: [...new Map([...prior.sourceRefs, ...change.sourceRefs].map(ref => [stableDisclosureJson(ref), ref])).values()] });
            }
            else {
                const next = change.item, prior = items.get(next.id);
                if (next.verification.status === 'verified')
                    fail('MEMORY_INPUT_INVALID');
                if (prior) {
                    if (prior.kind !== next.kind || prior.state !== next.state || prior.critical && !next.critical)
                        fail('MEMORY_PRESERVATION_REQUIRED');
                    if (prior.critical && prior.state === 'active' && stableDisclosureJson(prior) !== stableDisclosureJson(next) && event.kind !== 'correction')
                        fail('MEMORY_PRESERVATION_REQUIRED');
                    const refs = new Set(next.sourceRefs.map(stableDisclosureJson));
                    if (prior.sourceRefs.some(ref => !refs.has(stableDisclosureJson(ref))))
                        fail('MEMORY_PRESERVATION_REQUIRED');
                    if (prior.kind === 'decision' && prior.text !== next.text && event.kind !== 'correction')
                        fail('MEMORY_PRESERVATION_REQUIRED');
                }
                else if (next.state !== 'active')
                    fail('MEMORY_PRESERVATION_REQUIRED');
                items.set(next.id, structuredClone(next));
            }
        }
    if (![...items.values()].some(item => item.kind === 'goal' && item.state === 'active'))
        fail('MEMORY_PRESERVATION_REQUIRED');
    return [...items.values()];
}
/** Shared domain invariant for live reads and complete isolated restore.
 * Callers parse snapshots/events through the schemas and verify retained event
 * digests/ownership before invoking this pure consistency check. */
export function validateEpisodeSnapshot(snapshot:EpisodeSnapshot,events:EpisodeEvent[]):void {
    const {header,owner}=snapshot;
    if(header.taskId!==owner.taskId||header.workspaceKey!==owner.workspaceKey
      ||header.eventCount!==snapshot.eventRefs.length||header.revision!==header.eventCount
      ||events.length!==snapshot.eventRefs.length)fail('MEMORY_SOURCE_UNAVAILABLE');
    for(const [index,event] of events.entries()){
      const ref=snapshot.eventRefs[index]!;
      if(ref.kind!=='event'||ref.id!==event.id||event.episodeId!==header.id||event.sequence!==index+1)fail('MEMORY_SOURCE_UNAVAILABLE');
    }
    const streams=new Map<string,{sequence:number;receipt:SourceRef;batches:Set<string>}>();
    for(const [index,event] of events.entries())if(event.ingestion){
      const binding=event.ingestion,previous=streams.get(binding.streamId);
      if(binding.sequence!==(previous?.sequence??0)+1||previous?.batches.has(binding.batchId)
        ||stableDisclosureJson(binding.previousReceipt??null)!==stableDisclosureJson(previous?.receipt??null))fail('MEMORY_SOURCE_UNAVAILABLE');
      streams.set(binding.streamId,{sequence:binding.sequence,receipt:snapshot.eventRefs[index]!,batches:new Set([...(previous?.batches??[]),binding.batchId])});
    }
    if(stableDisclosureJson(reduce(events))!==stableDisclosureJson(snapshot.workingState))fail('MEMORY_SOURCE_UNAVAILABLE');
}

/** Internal restore/live-read invariant; receipts establish durable ingestion, not claim validity. */
export function validateIngestionReceipt(event:EpisodeEvent,eventRef:SourceRef,raw:unknown,owner:unknown):EpisodeAppendResult {
    try {
        if(!event.ingestion)fail('MEMORY_SOURCE_UNAVAILABLE');
        const receipt=receiptSchema.parse(raw),accepted=appendResultSchema.parse(receipt.result);
        const {schemaVersion,id,episodeId,sequence,operationId,recordedAt,clockSkewMs,origin,ingestion,...eventInput}=event;
        if(stableDisclosureJson(receipt.owner)!==stableDisclosureJson(owner)||receipt.method!=='appendEvent'||receipt.operationId!==operationId
          ||receipt.payloadDigest!==disclosureDigest(['appendEvent/v1',episodeId,eventInput,ingestion])
          ||accepted.episodeId!==episodeId||accepted.revision!==sequence||accepted.duplicate
          ||stableDisclosureJson(accepted.eventRef)!==stableDisclosureJson(eventRef)
          ||stableDisclosureJson(accepted.ingestionReceipt)!==stableDisclosureJson({streamId:ingestion.streamId,sequence:ingestion.sequence,eventRef}))fail('MEMORY_SOURCE_UNAVAILABLE');
        return accepted;
    }catch{return fail('MEMORY_SOURCE_UNAVAILABLE');}
}

interface Prepared {
    owner: Ownership;
    activation: ExperienceManifest;
    dependencies: Map<string, string | null>;
    memoryCurrent: Map<string, string>;
    records: MemoryRecord[];
    forgotten: Set<string>;
    historical?:boolean;
}
export interface EpisodeExpansion {
    text: string;
    sourceRefs: SourceRef[];
    availability: 'available' | 'reference-only' | 'unavailable';
    warning?: string;
}
/** Domain owner reuses the canonical store lock, declared read sets, journal and archive. */
export class MemoryEpisodes {
    constructor(private readonly store: FileMemoryStore, private readonly host: {
        inScope(record: MemoryRecord, workspace: string): boolean;
        workspaceRoot(workspace: string): string | undefined;
    }) { }
    private owner(rootId: string, scope: ControllerScope): Ownership { return { rootId, workspaceKey: scope.workspaceKey, taskId: scope.taskId }; }
    private scope(owner: Ownership, expected: Ownership): void { if (stableDisclosureJson(owner) !== stableDisclosureJson(expected))
        fail('MEMORY_SCOPE_MISMATCH'); }
    private taskKey(owner: Ownership): string { return `episode-tasks/${disclosureDigest(['episode-task/v1', owner]).slice(7)}.json`; }
    private operationKey(owner: Ownership, method: string, id: string): string { return `operations/${disclosureDigest(['episode-operation/v1', owner, method, id]).slice(7)}.json`; }
    private async readKey(key: string, dependencies?: Map<string, string | null>): Promise<string | null> {
        const file = await assertContainedPath(this.store.paths.root, path.join(this.store.paths.root, key.startsWith('archive/') ? key : `state/${key}`));
        const content = await readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT')
            return null; throw error; });
        dependencies?.set(key, content);
        return content;
    }
    private visible(records: MemoryRecord[], forgotten: Set<string>, workspace: string, id: string,historical=false): MemoryRecord {
        const record = records.find(record => record.id === id);
        if (!record)
            fail('MEMORY_SOURCE_UNAVAILABLE');
        if (!this.host.inScope(record, workspace))
            fail('MEMORY_SCOPE_MISMATCH');
        const now = Date.now();
        const superseded = records.some(owner => this.host.inScope(owner, workspace) && owner.links.some(link => link.type === 'supersedes' && link.targetId === id && isMemoryLinkActive(link, now)));
        if (!record.pinned && (forgotten.has(id) || (!historical&&(isMemoryExpired(record, now) || superseded))))
            fail('MEMORY_SOURCE_UNAVAILABLE');
        return record;
    }
    private async prepare<T>(scope: ControllerScope, reader: (prepared: Prepared) => Promise<T>): Promise<T> {
        return this.store.snapshot(async (loaded, activation) => {
            if (!loaded.complete)
                fail('MEMORY_SOURCE_UNAVAILABLE');
            if (!activation)
                fail('MEMORY_EXPERIENCE_NOT_ENABLED');
            const dependencies = new Map<string, string | null>();
            let forgotten: Set<string>;
            try {
                forgotten = strictForgottenIdsFromContent(await this.readKey('feedback.json', dependencies));
            }
            catch {
                fail('MEMORY_SOURCE_UNAVAILABLE');
            }
            return reader({ owner: this.owner(activation.rootId, scope), activation, dependencies, memoryCurrent: new Map(), records: loaded.records, forgotten });
        });
    }
    private async readJson<T>(key: string, schema: z.ZodType<T>, dependencies: Map<string, string | null>): Promise<T> {
        try {
            const content = await this.readKey(key, dependencies);
            if (content === null)
                fail('MEMORY_SOURCE_UNAVAILABLE');
            return schema.parse(JSON.parse(content));
        }
        catch (error) {
            if (error instanceof MemoryControllerError)
                throw error;
            return fail('MEMORY_SOURCE_UNAVAILABLE');
        }
    }
    private async archived<T>(id: string, ref: SourceRef, schema: z.ZodType<T>, dependencies: Map<string, string | null>): Promise<T> {
        try {
            const key = archiveJsonKey(id);
            const content = await this.readKey(key, dependencies);
            if (content === null || revision(content) !== ref.revision) fail('MEMORY_SOURCE_UNAVAILABLE');
            return await readArchivedJson(this.store.paths, id, ref.revision, schema);
        } catch {
            return fail('MEMORY_SOURCE_UNAVAILABLE');
        }
    }
    private async event(ref: SourceRef, p: Prepared): Promise<EpisodeEvent> {
        if (ref.kind !== 'event')
            fail('MEMORY_SOURCE_UNAVAILABLE');
        const manifest = await this.archived(`event-${ref.id}`, ref, eventManifestSchema, p.dependencies);
        this.scope(manifest.owner, p.owner);
        if (manifest.event.id !== ref.id)
            fail('MEMORY_SOURCE_UNAVAILABLE');
        return manifest.event;
    }
    private async episode(ref: SourceRef, p: Prepared): Promise<{
        snapshot: EpisodeSnapshot;
        events: EpisodeEvent[];
    }> {
        if (ref.kind !== 'episode')
            fail('MEMORY_SOURCE_UNAVAILABLE');
        const snapshot = await this.archived(episodeArchiveId(ref), ref, episodeSnapshotSchema, p.dependencies);
        this.scope(snapshot.owner, p.owner);
        if(snapshot.header.id!==ref.id)fail('MEMORY_SOURCE_UNAVAILABLE');
        const events:EpisodeEvent[]=[];
        for(const eventRef of snapshot.eventRefs)events.push(await this.event(eventRef,p));
        validateEpisodeSnapshot(snapshot,events);
        return { snapshot, events };
    }
    private async artifact(ref: SourceRef, p: Prepared, tolerateUnavailableBody = false) {
        const manifest = await this.archived(`artifact-${ref.id}`, ref, artifactManifestSchema, p.dependencies);
        this.scope(manifest.owner, p.owner);
        if (manifest.id !== ref.id) fail('MEMORY_SOURCE_UNAVAILABLE');
        let text = '', availability = manifest.availability;
        let warning: string | undefined;
        if (manifest.availability === 'available') {
            try {
                text = await readArchiveObject(this.store.paths, manifest.bodyDigest!,manifest.bytes);
                p.dependencies.set(`archive/objects/${manifest.bodyDigest!.slice(7)}`,text);
            } catch {
                if (!tolerateUnavailableBody) fail('MEMORY_SOURCE_UNAVAILABLE');
                availability = 'unavailable';
                warning = 'evidence-body-unavailable';
            }
        }
        return { manifest, text, availability, warning };
    }
    private async workspaceIdentity(root:string):Promise<string> {
        const identity=await evidenceDirectoryIdentity(root);
        return disclosureDigest(['artifact-workspace-origin/v1',root,identity.dev,identity.ino]);
    }
    /** Archived bytes and live-origin freshness are separate checks. Old captures are never backfilled. */
    private async artifactOrigin(ref:SourceRef,p:Prepared):Promise<{freshness:TaskContext['freshness'];warning?:string;validate?:()=>Promise<void>}> {
        const {manifest}=await this.artifact(ref,p);
        if(manifest.origin.kind!=='workspace-file')return {freshness:manifest.availability==='available'?'current':'unknown',...(manifest.availability==='available'?{}:{warning:'evidence-unavailable'})};
        const root=this.host.workspaceRoot(p.owner.workspaceKey),relative=manifest.origin.relativePath;
        if(!root||!relative||!memorySourcePathAllowed(relative)||manifest.availability!=='available')return {freshness:'unknown',warning:'live-source-unavailable'};
        try {
            const rootDigest=await this.workspaceIdentity(root),file=path.resolve(root,relative);
            await assertEvidenceLocalPath(file);
            const policy=decideToolEvidenceCapture('read_file',{path:file});
            if(policy.policyState==='invalid'||policy.disposition!=='full')return {freshness:'unknown',warning:'live-source-unavailable'};
            const snapshot=await readEvidenceSnapshot(file);
            const validate=async()=>{
                try {
                    if(this.host.workspaceRoot(p.owner.workspaceKey)!==root||await this.workspaceIdentity(root)!==rootDigest)fail('MEMORY_REVISION_CONFLICT');
                    await revalidateEvidenceSnapshot(file,snapshot.identity,snapshot.digest);
                    const currentPolicy=decideToolEvidenceCapture('read_file',{path:file});
                    if(currentPolicy.policyState==='invalid'||currentPolicy.disposition!=='full')fail('MEMORY_REVISION_CONFLICT');
                }catch{fail('MEMORY_REVISION_CONFLICT');}
            };
            if(snapshot.digest!==manifest.bodyDigest||snapshot.bytes.length!==manifest.bytes)return {freshness:'stale',warning:'live-source-changed',validate};
            if(!manifest.originIdentity)return {freshness:'unknown',warning:'live-source-freshness-unknown',validate};
            if(manifest.originIdentity.rootDigest!==rootDigest||!sameEvidenceIdentity(manifest.originIdentity.fileIdentity,snapshot.identity))return {freshness:'stale',warning:'live-source-identity-mismatch',validate};
            return {freshness:'current',validate};
        }catch{return {freshness:'unknown',warning:'live-source-unavailable'};}
    }
    private async memoryOrigin(ref:SourceRef,p:Prepared):Promise<{freshness:TaskContext['freshness'];warning?:string;validate?:()=>Promise<void>}> {
        const record=this.visible(p.records,p.forgotten,p.owner.workspaceKey,ref.id,p.historical);
        if(!record.provenance?.files.length)return {freshness:'current'};
        const root=this.host.workspaceRoot(p.owner.workspaceKey);
        if(!root)return {freshness:'unknown',warning:'live-source-unavailable'};
        const assessment=await assessMemoryStaleness(record,root);
        const freshness=assessment.status==='current'?'current':assessment.status==='changed'?'stale':'unknown';
        const validate=async()=>{
            if(this.host.workspaceRoot(p.owner.workspaceKey)!==root)fail('MEMORY_REVISION_CONFLICT');
            const current=await assessMemoryStaleness(record,root);
            if(stableDisclosureJson({...assessment,observedAt:undefined,currentCommit:undefined})!==stableDisclosureJson({...current,observedAt:undefined,currentCommit:undefined}))fail('MEMORY_REVISION_CONFLICT');
        };
        return {freshness,...(freshness==='current'?{}:{warning:freshness==='stale'?'live-source-changed':'live-source-unavailable'}),validate};
    }
    private async validateRefs(refs: SourceRef[], p: Prepared, requireAvailable = false): Promise<void> {
        for (const ref of refs) {
            if (ref.kind === 'memory') {
                const current = this.visible(p.records, p.forgotten, p.owner.workspaceKey, ref.id,p.historical);
                p.memoryCurrent.set(ref.id, memorySemanticRevision(current));
                if (memorySemanticRevision(current) !== ref.revision) {
                    const key = memoryArchiveManifestKey(ref);
                    const bytes = await this.readKey(key, p.dependencies);
                    if (bytes === null)
                        fail('MEMORY_REVISION_CONFLICT');
                    let objectDigest: string;
                    try {
                        objectDigest = digestSchema.parse(JSON.parse(bytes).objectDigest);
                    }
                    catch {
                        fail('MEMORY_SOURCE_UNAVAILABLE');
                    }
                    await this.readKey(`archive/objects/${(objectDigest!).slice(7)}`, p.dependencies);
                    let historical: MemoryRecord;
                    try {
                        historical = await readArchivedMemory(this.store.paths, ref);
                    }
                    catch {
                        fail('MEMORY_SOURCE_UNAVAILABLE');
                    }
                    if (!this.host.inScope(historical!, p.owner.workspaceKey))
                        fail('MEMORY_SCOPE_MISMATCH');
                }
            }
            else if (ref.kind === 'artifact') {
                const value = await this.artifact(ref, p);
                if (requireAvailable && value.manifest.availability !== 'available')
                    fail('MEMORY_SOURCE_UNAVAILABLE');
            }
            else if (ref.kind === 'episode')
                await this.episode(ref, p);
            else if (ref.kind === 'event')
                await this.event(ref, p);
            else {
                // T2 record-audit manifests derive scope from exact canonical source refs.
                await this.readKey(archiveJsonKey(ref.id), p.dependencies);
                let manifest;
                try {
                    manifest = await readArchiveManifest(this.store.paths, ref);
                }
                catch {
                    fail('MEMORY_SOURCE_UNAVAILABLE');
                }
                if (!['record-audit','promotion','retention'].includes((manifest!).purpose) || !(manifest!).sourceRefs.length)
                    fail('MEMORY_SOURCE_UNAVAILABLE');
                if(['promotion','retention'].includes(manifest!.purpose))this.scope(ownershipSchema.parse(manifest!.details.owner),p.owner);
                await this.validateRefs((manifest!).sourceRefs, p, requireAvailable);
            }
        }
    }
    /** Traverse existing immutable source groups without collapsing their historical revision lineage. */
    private async lineage(refs:SourceRef[],p:Prepared,seen=new Set<string>(),includeMemory=false,promotionEvidenceOnly=false):Promise<SourceRef[]> {
        const result:SourceRef[]=[];
        for(const ref of uniqueSourceRefs(refs)){
            const key=stableDisclosureJson(ref);if(seen.has(key))continue;seen.add(key);result.push(ref);
            let nested:SourceRef[]=[];
            if(ref.kind==='event'){const event=await this.event(ref,p);nested=[...event.sourceRefs,...(event.temporalAssertion?[event.temporalAssertion.predecessor,event.temporalAssertion.successor,...event.temporalAssertion.evidence]:[]),...event.stateChanges.flatMap(change=>change.op==='resolve'?change.sourceRefs:workingItemRefs(change.item))];}
            else if(ref.kind==='episode'){const {snapshot}=await this.episode(ref,p);nested=[...snapshot.eventRefs,...snapshot.workingState.flatMap(workingItemRefs)];}
            else if(ref.kind==='memory'&&includeMemory){
                await this.validateRefs([ref],p);
                const current=this.visible(p.records,p.forgotten,p.owner.workspaceKey,ref.id,p.historical);
                const record=memorySemanticRevision(current)===ref.revision?current:await readArchivedMemory(this.store.paths,ref);
                if(record.version===2)nested=[...record.experience.sourceRefs,...record.experience.verification.evidence];
            }
            else if(ref.kind==='manifest'){
                const manifest=await readArchiveManifest(this.store.paths,ref).catch(()=>fail('MEMORY_SOURCE_UNAVAILABLE'));
                if(!['record-audit','promotion','retention'].includes(manifest.purpose))fail('MEMORY_SOURCE_UNAVAILABLE');
                if(['promotion','retention'].includes(manifest.purpose))this.scope(ownershipSchema.parse(manifest.details.owner),p.owner);
                await this.readKey(archiveJsonKey(ref.id),p.dependencies);
                nested=promotionEvidenceOnly&&manifest.purpose==='promotion'?promotionEpistemicRefs(manifest):manifest.sourceRefs;
            }
            result.push(...await this.lineage(nested,p,seen,includeMemory,promotionEvidenceOnly));
        }
        return uniqueSourceRefs(result);
    }
    private async capsule(ref:SourceRef,p:Prepared):Promise<CapsuleManifest> {
        if(ref.kind!=='manifest'||!/^capsule-[a-f0-9-]{36}$/.test(ref.id))fail('MEMORY_SOURCE_UNAVAILABLE');
        const manifest=await this.archived(ref.id,ref,capsuleManifestSchema,p.dependencies);this.scope(manifest.owner,p.owner);
        if(`capsule-${manifest.capsule.id}`!==ref.id||manifest.capsule.taskId!==p.owner.taskId||manifest.episodeRef.kind!=='episode'||manifest.episodeRef.id!==manifest.capsule.episodeId)fail('MEMORY_SOURCE_UNAVAILABLE');
        const {snapshot,events}=await this.episode(manifest.episodeRef,p);
        // Stored derivatives cannot add, paraphrase, duplicate or silently drop mandatory state.
        const rendered=renderTaskCapsule({id:manifest.capsule.id,header:snapshot.header,generatedAt:manifest.capsule.generatedAt,trigger:manifest.capsule.trigger,
            workingState:snapshot.workingState,events,episodeRef:manifest.episodeRef,maxBytes:Number.MAX_SAFE_INTEGER});
        if(rendered.status==='insufficient-budget')fail('MEMORY_SOURCE_UNAVAILABLE');
        const expected=rendered.data,selectedIds=new Set(manifest.capsule.supportingItems.map(item=>item.id));
        if(stableDisclosureJson(expected.criticalItems)!==stableDisclosureJson(manifest.capsule.criticalItems)
            ||manifest.capsule.episodeRevision!==snapshot.header.revision||selectedIds.size!==manifest.capsule.supportingItems.length
            ||stableDisclosureJson(expected.supportingItems.filter(item=>selectedIds.has(item.id)))!==stableDisclosureJson(manifest.capsule.supportingItems)
            ||stableDisclosureJson(expected.supportingItems.filter(item=>!selectedIds.has(item.id)).map(item=>item.id))!==stableDisclosureJson(manifest.capsule.omittedSupportingItemIds)
            ||stableDisclosureJson(uniqueSourceRefs([manifest.episodeRef,...[...manifest.capsule.criticalItems,...manifest.capsule.supportingItems].flatMap(workingItemRefs)]))!==stableDisclosureJson(manifest.capsule.sourceRefs))fail('MEMORY_SOURCE_UNAVAILABLE');
        return manifest;
    }
    private replay<T>(content: string | null, owner: Ownership, method: string, id: string, payloadDigest: string, schema: z.ZodType<T>): T | undefined {
        if (content === null)
            return undefined;
        let receipt;
        try {
            receipt = receiptSchema.parse(JSON.parse(content));
        }
        catch {
            fail('MEMORY_SOURCE_UNAVAILABLE');
        }
        this.scope((receipt!).owner, owner);
        if ((receipt!).method !== method || (receipt!).operationId !== id || (receipt!).payloadDigest !== payloadDigest)
            fail('MEMORY_OPERATION_CONFLICT');
        try {
            return schema.parse((receipt!).result);
        }
        catch {
            return fail('MEMORY_SOURCE_UNAVAILABLE');
        }
    }
    private assertDependencies(p: Prepared, snapshot: StoreSnapshot): void {
        if (!snapshot.experience)
            fail('MEMORY_EXPERIENCE_NOT_ENABLED');
        if (stableDisclosureJson(snapshot.experience) !== stableDisclosureJson(p.activation))
            fail('MEMORY_REVISION_CONFLICT');
        for (const [id, expected] of p.memoryCurrent) {
            const current = snapshot.records.find(record => record.id === id);
            if (!current || memorySemanticRevision(current) !== expected)
                fail('MEMORY_REVISION_CONFLICT');
            this.visible(snapshot.records, p.forgotten, p.owner.workspaceKey, id,p.historical);
        }
        for (const [key, content] of p.dependencies)
            if (snapshot.state.get(key)?.content !== content)
                fail('MEMORY_REVISION_CONFLICT');
    }
    private receipt(owner: Ownership, method: string, operationId: string, payloadDigest: string, result: unknown) { return { schemaVersion: 1, owner, method, operationId, payloadDigest, result }; }
    private safe(text: string): void { if (scanMemorySafety(text).length)
        fail('MEMORY_INPUT_INVALID'); }
    /** Walk schema-validated T3 fields before serialization can escape source strings. */
    private safeInput(value:unknown):void {
        const strings:string[]=[];
        const collect=(item:unknown):void=>{
            if(typeof item==='string')strings.push(item);
            else if(Array.isArray(item))item.forEach(collect);
            else if(item && typeof item==='object')for(const [key,child]of Object.entries(item)){strings.push(key);collect(child);}
        };
        collect(value);
        if(strings.some(text=>text.includes('\0')||Buffer.from(text,'utf8').toString('utf8')!==text))fail('MEMORY_INPUT_INVALID');
        this.safe(strings.join('\n'));
    }
    private eventRefs(input: AppendEventInput): SourceRef[] { return [...input.event.sourceRefs,...(input.event.temporalAssertion?[input.event.temporalAssertion.predecessor,input.event.temporalAssertion.successor,...input.event.temporalAssertion.evidence]:[]), ...input.event.stateChanges.flatMap(change => change.op === 'resolve' ? change.sourceRefs : [...change.item.sourceRefs, ...change.item.verification.evidence])]; }
    private async validateEvent(input: AppendEventInput, p: Prepared): Promise<void> {
        const refs = this.eventRefs(input);
        if (refs.length > 64)
            fail('MEMORY_INPUT_INVALID');
        await this.validateRefs(refs, p);
        if(input.event.temporalAssertion){if(!['correction','observation','decision'].includes(input.event.kind))fail('MEMORY_INPUT_INVALID');await this.validateRefs(await this.lineage(input.event.temporalAssertion.evidence,p,new Set(),true),p,true);}
        for (const change of input.event.stateChanges)
            if (change.op === 'upsert' && change.item.verification.status === 'supported')
                await this.validateRefs(change.item.verification.evidence, p, true);
    }
    private publication(owner: Ownership, header: EpisodeHeader, events: EpisodeEvent[], priorRefs: SourceRef[], event: EpisodeEvent, predecessorRef?: SourceRef,capsuleRef?:SourceRef) {
        const eventManifest = { schemaVersion: 1 as const, kind: 'event' as const, owner, event };
        const eventContent = json(eventManifest);
        const eventRef: SourceRef = { kind: 'event', id: event.id, revision: revision(eventContent) };
        const snapshot: EpisodeSnapshot = { schemaVersion: 1, kind: 'episode', owner, header, ...(predecessorRef ? { predecessorRef } : {}), workingState: reduce(events), eventRefs: [...priorRefs, eventRef] };
        const snapshotContent = json(snapshot), snapshotRef: SourceRef = { kind: 'episode', id: header.id, revision: revision(snapshotContent) };
        const writes = [{ key: `episodes/${header.id}/events/${event.sequence}-${event.id}.json`, content: json(event) }, { key: archiveJsonKey(`event-${event.id}`), content: eventContent }, { key: archiveJsonKey(episodeArchiveId(snapshotRef)), content: snapshotContent }, { key: liveKey(header.id), content: json({ schemaVersion: 1, owner, header, snapshotRef,...(capsuleRef?{capsuleRef}:{}) }) }];
        return { writes, eventRef, snapshotRef };
    }
    /** Internal promotion port: reuse one scoped snapshot, exact lineage and reducer publication. */
    async promotionSnapshot<T>(scope:ControllerScope,reader:(context:PromotionContext)=>Promise<T>):Promise<T> {
        return this.prepare(scope,async p=>{
            // Exact historical evidence is available independently of current target applicability.
            p.historical=true;let temporalTargets=false;return reader({
            owner:p.owner,activation:p.activation,records:p.records,dependencies:p.dependencies,
            enableTemporal:()=>{temporalTargets=true;},
            temporalEvidence:async refs=>Promise.all(refs.map(async source=>({source,...(source.kind==='event'?{temporalAssertion:(await this.event(source,p)).temporalAssertion}:{})}))),
            read:(key)=>this.readKey(key,p.dependencies),
            sourceOrigin:ref=>ref.kind==='artifact'?this.artifactOrigin(ref,p):ref.kind==='memory'?this.memoryOrigin(ref,p):Promise.resolve({freshness:'current' as const}),
            validate:async(refs,available=false)=>this.validateRefs(await this.lineage(refs,p,new Set(),true),p,available),
            lineage:refs=>this.lineage(refs,p,new Set(),true),
            epistemicLineage:refs=>this.lineage(refs,p,new Set(),true,true),
            memory:async ref=>{
                if(ref.kind!=='memory')fail('MEMORY_CONSOLIDATION_INVALID');
                await this.validateRefs([ref],p);
                const current=this.visible(p.records,p.forgotten,p.owner.workspaceKey,ref.id,p.historical);
                return memorySemanticRevision(current)===ref.revision?current:readArchivedMemory(this.store.paths,ref);
            },
            visible:id=>this.visible(p.records,p.forgotten,p.owner.workspaceKey,id),
            eligible:records=>records.filter(record=>{try{return !record.pinned&&this.visible(records,p.forgotten,p.owner.workspaceKey,record.id,temporalTargets)===record;}catch{return false;}}),
            assert:snapshot=>this.assertDependencies(p,snapshot),
            episode:async id=>{
                const live=await this.readJson(liveKey(id),liveSchema,p.dependencies);this.scope(live.owner,p.owner);
                const {snapshot,events}=await this.episode(live.snapshotRef,p);
                if(stableDisclosureJson(snapshot.header)!==stableDisclosureJson(live.header))fail('MEMORY_SOURCE_UNAVAILABLE');
                return {header:live.header,ref:live.snapshotRef,workingState:snapshot.workingState,
                    publish:(operationId,auditRef)=>{
                        const now=new Date().toISOString(),header={...live.header,revision:live.header.revision+1,eventCount:live.header.eventCount+1,updatedAt:now};
                        const event:EpisodeEvent={schemaVersion:1,id:randomUUID(),episodeId:id,sequence:header.eventCount,operationId,kind:'status-change',
                            summary:'Consolidation committed; task lifecycle unchanged',recordedAt:now,...(Date.parse(now)<Date.parse(live.header.updatedAt)?{clockSkewMs:Date.parse(live.header.updatedAt)-Date.parse(now)}:{}),origin:origin(scope),sourceRefs:[auditRef],stateChanges:[]};
                        return {header,...this.publication(p.owner,header,[...events,event],snapshot.eventRefs,event,snapshot.predecessorRef,live.capsuleRef)};
                    }};
            },
        });});
    }
    async setRetention(scope:ControllerScope,raw:RetentionInput):Promise<RetentionReceipt> {
        const input=parseControllerInput(retentionInputSchema,raw);this.safeInput(input);
        const {expectedRevision:_expectedRevision,...business}=input;
        const payload=disclosureDigest(['setRetention/v1',business]);
        const prepared=await this.prepare(scope,async p=>{
            p.historical=true;
            const opKey=this.operationKey(p.owner,'setRetention',input.operationId);
            const prior=this.replay(await this.readKey(opKey,p.dependencies),p.owner,'setRetention',input.operationId,payload,retentionReceiptSchema);
            const record=this.visible(p.records,p.forgotten,p.owner.workspaceKey,input.memoryId,true);
            if(record.version!==2||record.pinned)fail('MEMORY_INPUT_INVALID');
            if(prior)return {p,opKey,prior,record};
            if(memorySemanticRevision(record)!==input.expectedRevision)fail('MEMORY_REVISION_CONFLICT');
            p.memoryCurrent.set(record.id,input.expectedRevision);
            try {await this.validateRefs(await this.lineage([{kind:'memory',id:record.id,revision:input.expectedRevision},...input.sourceRefs],p,new Set(),true),p,input.tier==='archive');}
            catch(error){if(error instanceof MemoryControllerError&&error.code==='MEMORY_SOURCE_UNAVAILABLE')fail('MEMORY_PRESERVATION_REQUIRED');throw error;}
            return {p,opKey,record};
        });
        const {p,opKey,record,prior}=prepared;if(prior)return {...prior,duplicate:true};
        if(record.version!==2)fail('MEMORY_INPUT_INVALID');
        const next={...record,updatedAt:new Date().toISOString(),experience:{...record.experience,retention:input.tier}};
        const before:SourceRef={kind:'memory',id:record.id,revision:memorySemanticRevision(record)},after:SourceRef={...before,revision:memorySemanticRevision(next)};
        const id='retention-'+randomUUID();
        const audit={schemaVersion:1,id,purpose:'retention',sourceRefs:uniqueSourceRefs([before,after,...input.sourceRefs]),
            details:{owner:p.owner,before,after,tier:input.tier,reason:input.reason,recordedAt:next.updatedAt}};
        const content=json(audit),auditRef:SourceRef={kind:'manifest',id,revision:revision(content)};
        const result:RetentionReceipt={memoryId:record.id,revision:after.revision,tier:input.tier,auditRef,duplicate:false};
        const writes=[{key:archiveJsonKey(id),content},{key:opKey,content:json(this.receipt(p.owner,'setRetention',input.operationId,payload,result))}];
        return (await this.store.transact([...new Set([...p.dependencies.keys(),...writes.map(w=>w.key)])],snapshot=>{
            const replay=this.replay(snapshot.state.get(opKey)!.content,p.owner,'setRetention',input.operationId,payload,retentionReceiptSchema);
            if(replay)return {records:snapshot.records,touchedIds:[],stateWrites:[],result:{...replay,duplicate:true}};
            this.assertDependencies(p,snapshot);
            return {records:snapshot.records.map(r=>r.id===record.id?{...r,updatedAt:next.updatedAt,experience:next.experience}:r),touchedIds:[record.id],stateWrites:writes,result};
        })).result;
    }
    async startEpisode(scope: ControllerScope, raw: StartEpisodeInput): Promise<EpisodeHeader> {
        const input = parseControllerInput(startEpisodeInputSchema, raw);
        this.safeInput(input);
        const payload = disclosureDigest(['startEpisode/v1', input]);
        const prepared = await this.prepare(scope, async (p) => {
            const opKey = this.operationKey(p.owner, 'startEpisode', input.startKey), taskKey = this.taskKey(p.owner);
            const prior = await this.readKey(opKey);
            const replay = this.replay(prior, p.owner, 'startEpisode', input.startKey, payload, episodeHeaderSchema);
            if (replay)
                return { replay };
            await this.validateRefs(input.sourceRefs, p);
            const taskContent = await this.readKey(taskKey, p.dependencies);
            let predecessorRef: SourceRef | undefined;
            if (taskContent !== null) {
                const task = taskSchema.parse(JSON.parse(taskContent));
                this.scope(task.owner, p.owner);
                const current = await this.readJson(liveKey(task.episodeId), liveSchema, p.dependencies);
                this.scope(current.owner, p.owner);
                if (current.header.status === 'open' || current.header.status === 'paused')
                    fail('MEMORY_OPERATION_CONFLICT');
                predecessorRef = current.snapshotRef;
                await this.episode(predecessorRef, p);
            }
            const id = randomUUID(), now = new Date().toISOString();
            const header: EpisodeHeader = { schemaVersion: 1, id, taskId: p.owner.taskId, workspaceKey: p.owner.workspaceKey, startKey: input.startKey, status: 'open', revision: 1, createdAt: now, updatedAt: now, eventCount: 1 };
            const event: EpisodeEvent = { schemaVersion: 1, id: randomUUID(), episodeId: id, sequence: 1, operationId: input.startKey, kind: 'action', summary: input.goal, recordedAt: now, origin: origin(scope), sourceRefs: input.sourceRefs, stateChanges: [{ op: 'upsert', item: { id: randomUUID(), kind: 'goal', text: input.goal, critical: true, state: 'active', sourceRefs: input.sourceRefs, verification: { status: 'unverified', evidence: [] } } }] };
            const publication = this.publication(p.owner, header, [event], [], event, predecessorRef);
            const writes = [...publication.writes, { key: taskKey, content: json({ schemaVersion: 1, owner: p.owner, episodeId: id }) }, { key: opKey, content: json(this.receipt(p.owner, 'startEpisode', input.startKey, payload, header)) }];
            return { p, opKey, writes, header };
        });
        if ('replay' in prepared)
            return prepared.replay!;
        const { p, opKey, writes, header } = prepared;
        const result = await this.store.transact([...new Set([...p.dependencies.keys(), ...writes.map(write => write.key)])], snapshot => {
            const replay = this.replay((snapshot.state.get(opKey)!).content, p.owner, 'startEpisode', input.startKey, payload, episodeHeaderSchema);
            if (replay)
                return { records: snapshot.records, touchedIds: [], stateWrites: [], result: replay };
            this.assertDependencies(p, snapshot);
            return { records: snapshot.records, touchedIds: [], stateWrites: writes, result: header };
        });
        return result.result;
    }
    async appendEvent(scope: ControllerScope, raw: AppendEventInput): Promise<EpisodeAppendResult> {
        const input = parseControllerInput(appendEventInputSchema, raw);
        this.safeInput(input);
        return this.mutate(scope, 'appendEvent', input.operationId, disclosureDigest(['appendEvent/v1', input.episodeId, input.event,...(input.ingestion?[input.ingestion]:[])]), input.episodeId, input.expectedRevision, input);
    }
    async setEpisodeStatus(scope: ControllerScope, raw: EpisodeStatusInput): Promise<EpisodeHeader> {
        const input = parseControllerInput(episodeStatusInputSchema, raw);
        this.safeInput(input);
        return this.mutate(scope, 'setEpisodeStatus', input.operationId, disclosureDigest(['setEpisodeStatus/v1', input.episodeId, input.status, input.reason, input.sourceRefs]), input.episodeId, input.expectedRevision, input);
    }
    async checkpoint(scope:ControllerScope,raw:CheckpointInput):Promise<Budgeted<TaskCapsule>> {
        const input=parseControllerInput(checkpointInputSchema,raw);this.safeInput(input);
        const maxBytes=input.budget?.maxBytes??8192,payload=disclosureDigest(['checkpoint/v1',input.episodeId,input.trigger,maxBytes]);
        const prepared=await this.prepare(scope,async p=>{
            const opKey=this.operationKey(p.owner,'checkpoint',input.operationId),replay=this.replay(await this.readKey(opKey),p.owner,'checkpoint',input.operationId,payload,budgetedCapsuleSchema);
            if(replay)return {replay};
            const live=await this.readJson(liveKey(input.episodeId),liveSchema,p.dependencies);this.scope(live.owner,p.owner);
            const {snapshot,events}=await this.episode(live.snapshotRef,p);
            if(live.header.id!==input.episodeId||stableDisclosureJson(live.header)!==stableDisclosureJson(snapshot.header))fail('MEMORY_SOURCE_UNAVAILABLE');
            if(live.header.revision!==input.expectedRevision)fail('MEMORY_REVISION_CONFLICT');
            const lineageRefs=await this.lineage([...snapshot.eventRefs,...snapshot.workingState.flatMap(workingItemRefs)],p);await this.validateRefs(lineageRefs,p);
            const currentAssertionRefs:SourceRef[]=[],validations:Array<()=>Promise<void>>=[],originWarnings:string[]=[];
            for(const item of snapshot.workingState.filter(isCurrentWorkingAssertion)){
                const refs=await this.lineage(workingItemRefs(item),p);
                for(const id of new Set(refs.filter(ref=>ref.kind==='memory').map(ref=>ref.id)))
                    if(!refs.some(ref=>ref.kind==='memory'&&ref.id===id&&ref.revision===p.memoryCurrent.get(id)))fail('MEMORY_REVISION_CONFLICT');
                currentAssertionRefs.push(...refs.filter(ref=>ref.kind!=='artifact'&&(ref.kind!=='memory'||ref.revision===p.memoryCurrent.get(ref.id))));
                const groups=new Map<string,SourceRef[]>();
                for(const ref of refs.filter(ref=>ref.kind==='artifact')){
                    const {manifest}=await this.artifact(ref,p);
                    if(manifest.origin.kind!=='workspace-file'){currentAssertionRefs.push(ref);if(manifest.availability!=='available')originWarnings.push('evidence-unavailable');continue;}
                    const key=manifest.origin.relativePath?stableDisclosureJson(['workspace-origin/v1',p.owner.workspaceKey,manifest.origin.relativePath]):stableDisclosureJson(ref);
                    groups.set(key,[...(groups.get(key)??[]),ref]);
                }
                for(const refs of groups.values()){
                    const origins=await Promise.all(refs.map(async ref=>({ref,...await this.artifactOrigin(ref,p)})));
                    const current=origins.filter(origin=>origin.freshness==='current'),selected=current.length?current:origins.filter(origin=>origin.freshness==='unknown');
                    if(!selected.length)fail('MEMORY_REVISION_CONFLICT');
                    for(const origin of selected){currentAssertionRefs.push(origin.ref);if(origin.validate)validations.push(origin.validate);if(origin.warning)originWarnings.push(origin.warning);}
                }
            }
            const memoryDependencies=[...p.memoryCurrent].map(([id,revision])=>({kind:'memory' as const,id,revision}));
            const currentMemoryIds=new Set(currentAssertionRefs.filter(ref=>ref.kind==='memory').map(ref=>ref.id));
            for(const ref of memoryDependencies.filter(ref=>currentMemoryIds.has(ref.id))){const origin=await this.memoryOrigin(ref,p);if(origin.freshness==='stale')fail('MEMORY_REVISION_CONFLICT');if(origin.validate)validations.push(origin.validate);if(origin.warning)originWarnings.push(origin.warning);}
            return {p,opKey,live,snapshot,events,lineageRefs,currentAssertionRefs:uniqueSourceRefs(currentAssertionRefs),memoryDependencies,validations,originWarnings:[...new Set(originWarnings)]};
        });
        if('replay' in prepared)return prepared.replay!;
        const {p,opKey,live,snapshot,events,lineageRefs,currentAssertionRefs,memoryDependencies,validations,originWarnings}=prepared;
        // Async boundary deliberately permits competing controllers between snapshot and publication.
        const result=await renderTaskCapsule({id:randomUUID(),header:snapshot.header,generatedAt:new Date().toISOString(),trigger:input.trigger,
            workingState:snapshot.workingState,events,episodeRef:live.snapshotRef,maxBytes,warnings:originWarnings});
        if(result.status==='insufficient-budget')return result;
        const manifest:CapsuleManifest={schemaVersion:1,kind:'capsule',owner:p.owner,capsule:result.data,episodeRef:live.snapshotRef,memoryDependencies,lineageRefs,currentAssertionRefs,...(live.capsuleRef?{predecessorRef:live.capsuleRef}:{})};
        const content=json(manifest),ref:SourceRef={kind:'manifest',id:`capsule-${result.data.id}`,revision:revision(content)};
        const writes=[{key:`capsules/${input.episodeId}/${ref.revision.slice(7)}.json`,content},{key:archiveJsonKey(ref.id),content},
            {key:liveKey(input.episodeId),content:json({...live,capsuleRef:ref})},{key:opKey,content:json(this.receipt(p.owner,'checkpoint',input.operationId,payload,result))}];
        return (await this.store.transact([...new Set([...p.dependencies.keys(),...writes.map(write=>write.key)])],snapshot=>{
            const replay=this.replay(snapshot.state.get(opKey)!.content,p.owner,'checkpoint',input.operationId,payload,budgetedCapsuleSchema);
            if(replay)return {records:snapshot.records,touchedIds:[],stateWrites:[],result:replay};
            this.assertDependencies(p,snapshot);
            return {records:snapshot.records,touchedIds:[],stateWrites:writes,result,validateSources:async()=>{for(const validate of validations)await validate();}};
        })).result;
    }
    private async mutate(scope: ControllerScope, method: 'appendEvent', operationId: string, payload: string, id: string, expectedRevision: number, input: AppendEventInput): Promise<EpisodeAppendResult>;
    private async mutate(scope: ControllerScope, method: 'setEpisodeStatus', operationId: string, payload: string, id: string, expectedRevision: number, input: EpisodeStatusInput): Promise<EpisodeHeader>;
    private async mutate(scope: ControllerScope, method: 'appendEvent' | 'setEpisodeStatus', operationId: string, payload: string, id: string, expectedRevision: number, input: AppendEventInput | EpisodeStatusInput): Promise<EpisodeAppendResult | EpisodeHeader> {
        const resultSchema: z.ZodType<EpisodeAppendResult | EpisodeHeader> = method === 'appendEvent' ? appendResultSchema : episodeHeaderSchema;
        const duplicate = (value: EpisodeAppendResult | EpisodeHeader) => 'duplicate' in value ? { ...value, duplicate: true } : value;
        const prepared = await this.prepare(scope, async (p) => {
            const opKey = this.operationKey(p.owner, method, operationId);
            const replay = this.replay(await this.readKey(opKey), p.owner, method, operationId, payload, resultSchema);
            if (replay)
                return { replay: duplicate(replay) };
            const live = await this.readJson(liveKey(id), liveSchema, p.dependencies);
            this.scope(live.owner, p.owner);
            if (live.header.id !== id)
                fail('MEMORY_SOURCE_UNAVAILABLE');
            const { snapshot, events } = await this.episode(live.snapshotRef, p);
            if (stableDisclosureJson(snapshot.header) !== stableDisclosureJson(live.header))
                fail('MEMORY_SOURCE_UNAVAILABLE');
            if (live.header.revision !== expectedRevision)
                fail('MEMORY_REVISION_CONFLICT');
            if ('event' in input) {
                if (live.header.status !== 'open')
                    fail('MEMORY_OPERATION_CONFLICT');
                await this.validateEvent(input, p);
                if(input.ingestion){
                    const task=await this.readJson(this.taskKey(p.owner),taskSchema,p.dependencies);this.scope(task.owner,p.owner);
                    if(task.episodeId!==id)fail('MEMORY_SCOPE_MISMATCH');
                    const cursor=await this.ingestionCursor(snapshot,events,p,input.ingestion.streamId);
                    if(events.some(event=>event.ingestion?.streamId===input.ingestion!.streamId&&event.ingestion.batchId===input.ingestion!.batchId)
                      ||input.ingestion.sequence!==cursor.sequence+1
                      ||stableDisclosureJson(input.ingestion.previousReceipt??null)!==stableDisclosureJson(cursor.receipt??null))fail('MEMORY_OPERATION_CONFLICT');
                    await this.validateIngestionSources(input.event.sourceRefs,input.ingestion.sourceDigest,p);
                }
            }
            else {
                await this.validateRefs(input.sourceRefs, p);
                if (input.status === 'completed' && snapshot.workingState.some(item => item.state === 'active' && (item.kind === 'blocker' || item.kind === 'obligation')))
                    fail('MEMORY_PRESERVATION_REQUIRED');
                if (live.header.status === 'completed' || live.header.status === 'abandoned')
                    fail('MEMORY_OPERATION_CONFLICT');
            }
            const now = new Date().toISOString(), header: EpisodeHeader = { ...live.header, revision: live.header.revision + 1, eventCount: live.header.eventCount + 1, updatedAt: now, ...('status' in input ? { status: input.status } : {}) };
            const event: EpisodeEvent = { schemaVersion: 1, id: randomUUID(), episodeId: id, sequence: header.eventCount, operationId, recordedAt: now,...(Date.parse(now)<Date.parse(live.header.updatedAt)?{clockSkewMs:Date.parse(live.header.updatedAt)-Date.parse(now)}:{}), origin: origin(scope), ...('event' in input ? {...input.event,...(input.ingestion?{ingestion:input.ingestion}:{})} : { kind: 'status-change' as const, summary: input.reason, sourceRefs: input.sourceRefs, stateChanges: [] }) };
            const publication = this.publication(p.owner, header, [...events, event], snapshot.eventRefs, event, snapshot.predecessorRef,live.capsuleRef);
            const result: EpisodeAppendResult | EpisodeHeader = method === 'appendEvent' ? { episodeId: id, revision: header.revision, eventRef: publication.eventRef, duplicate: false,...('event' in input&&input.ingestion?{ingestionReceipt:{streamId:input.ingestion.streamId,sequence:input.ingestion.sequence,eventRef:publication.eventRef}}:{}) } : header;
            const writes = [...publication.writes, { key: opKey, content: json(this.receipt(p.owner, method, operationId, payload, result)) }];
            return { p, opKey, writes, result };
        });
        if ('replay' in prepared)
            return prepared.replay!;
        const { p, opKey, writes, result } = prepared;
        const committed = await this.store.transact([...new Set([...p.dependencies.keys(), ...writes.map(write => write.key)])], snapshot => {
            const replay = this.replay((snapshot.state.get(opKey)!).content, p.owner, method, operationId, payload, resultSchema);
            if (replay)
                return { records: snapshot.records, touchedIds: [], stateWrites: [], result: duplicate(replay) };
            this.assertDependencies(p, snapshot);
            return { records: snapshot.records, touchedIds: [], stateWrites: writes, result };
        });
        return committed.result;
    }
    async captureEvidence(scope: ControllerScope, raw: CaptureEvidenceInput, assertExternalCurrent?:()=>void|Promise<void>): Promise<ArtifactReceipt> {
        if(assertExternalCurrent){if(scope.controllerId!=='agent-core-external')fail('MEMORY_SCOPE_MISMATCH');await assertExternalCurrent();}
        const input = parseControllerInput(captureEvidenceInputSchema, raw);
        this.safe(input.operationId);
        const payload = disclosureDigest(['captureEvidence/v1', input]);
        const receiptResultSchema = z.strictObject({ source: sourceRefSchema, availability: z.enum(['available', 'reference-only', 'unavailable']), bytes: z.number().int().nonnegative().optional(), reason: z.string().optional(), duplicate: z.boolean() });
        const prepared = await this.prepare(scope, async (p) => { const opKey = this.operationKey(p.owner, 'captureEvidence', input.operationId); const replay = this.replay(await this.readKey(opKey), p.owner, 'captureEvidence', input.operationId, payload, receiptResultSchema); return { p, opKey, replay }; });
        if (prepared.replay)
            return { ...prepared.replay, duplicate: true };
        const { p, opKey } = prepared;
        let captureRoot: string | undefined,captureRootDigest:string|undefined;
        const sourceMetadata = input.source.kind === 'controller-text' ? input.source.originRef : input.source.relativePath;
        const observedTexts = input.observedAt ? Object.values(input.observedAt).filter((value):value is string=>typeof value==='string') : [];
        const metadataTexts = [...(sourceMetadata ? [sourceMetadata] : []), ...observedTexts];
        // Scan original values: JSON escaping must not conceal quoted secret-shaped text.
        const metadataSafety = scanMemorySafety(metadataTexts.join('\n'));
        let metadataReason = metadataSafety.length ? 'safety-' + metadataSafety[0]!.code : undefined;
        if (!metadataReason && metadataTexts.some(value=>value.includes('\0') || Buffer.from(value,'utf8').toString('utf8')!==value)) metadataReason='unsupported-metadata';
        if (!metadataReason && input.observedAt && 'timezone' in input.observedAt && input.observedAt.timezone) {
            try { new Intl.DateTimeFormat('en-US',{timeZone:input.observedAt.timezone}); }
            catch { metadataReason='observed-timezone-invalid'; }
        }
        let text: string | undefined, availability: ArtifactReceipt['availability'] = 'unavailable', reason: string | undefined, fileSnapshot: Awaited<ReturnType<typeof readEvidenceSnapshot>> | undefined, file: string | undefined;
        if (metadataReason) {
            reason = metadataReason;
        }
        else if (input.source.kind === 'controller-text') {
            if (Buffer.byteLength(input.source.text, 'utf8') > EVIDENCE_DOCUMENT_MAX)
                reason = 'document-limit';
            else
                text = input.source.text;
        }
        else {
            const workspaceRoot = this.host.workspaceRoot(scope.workspaceKey);
            captureRoot = workspaceRoot;
            if (!workspaceRoot)
                reason = 'workspace-identity-unverified';
            else if (!memorySourcePathAllowed(input.source.relativePath))
                reason = 'excluded-path';
            else {
                file = path.resolve(workspaceRoot, input.source.relativePath);
                try {
                    captureRootDigest=await this.workspaceIdentity(workspaceRoot);
                    await assertEvidenceLocalPath(file);
                    const policy = decideToolEvidenceCapture('read_file', { path: file });
                    if (policy.policyState === 'invalid' || policy.disposition === 'omit')
                        reason = 'evidence-policy';
                    else if (policy.disposition === 'metadata-only') {
                        reason = 'evidence-policy';
                        availability = 'reference-only';
                    }
                    else {
                        fileSnapshot = await readEvidenceSnapshot(file);
                        text = fileSnapshot.text;
                    }
                }
                catch (error) {
                    reason = (error as Error).message === 'EVIDENCE_INPUT_LIMIT' ? 'document-limit' : 'unreadable-or-unsupported';
                }
            }
        }
        if (text !== undefined && (text.includes('\0') || Buffer.from(text, 'utf8').toString('utf8') !== text)) {
            reason = 'unsupported-text';
            text = undefined;
        }
        if (text !== undefined) {
            const findings = scanMemorySafety(text);
            if (findings.length) {
                reason = 'safety-' + (findings[0]!).code;
                text = undefined;
            }
            else
                availability = 'available';
        }
        // Recheck frozen file identity, contents and policy before any publication.
        if (file && fileSnapshot && text !== undefined) {
            try {
                await revalidateEvidenceSnapshot(file, fileSnapshot.identity, fileSnapshot.digest);
                const policy = decideToolEvidenceCapture('read_file', { path: file });
                if (policy.policyState === 'invalid' || policy.disposition !== 'full')
                    throw new Error('Policy changed');
            }
            catch {
                availability = 'unavailable';
                reason = 'source-changed';
                text = undefined;
            }
        }
        const id = randomUUID(), manifest = { schemaVersion: 1 as const, id, kind: 'artifact' as const, owner: p.owner, origin: { kind: input.source.kind, ...origin(scope), ...(input.source.kind === 'workspace-file' && !metadataReason && memorySourcePathAllowed(input.source.relativePath) ? { relativePath: input.source.relativePath } : {}), ...(input.source.kind === 'controller-text' && !metadataReason && input.source.originRef ? { originRef: input.source.originRef } : {}) }, ...(input.observedAt && !metadataReason ? { observedAt: input.observedAt } : {}), capturedAt: new Date().toISOString(), availability, mediaType: 'text/plain; charset=utf-8' as const, ...(text !== undefined ? { bodyDigest: revision(text), bytes: Buffer.byteLength(text, 'utf8') } : { reason: reason ?? 'unreadable-or-unsupported' }) };
        const acceptedManifest = artifactManifestSchema.parse({...manifest,...(text!==undefined&&fileSnapshot&&captureRootDigest?{originIdentity:{rootDigest:captureRootDigest,fileIdentity:fileSnapshot.identity}}:{})});
        const content = json(acceptedManifest), source: SourceRef = { kind: 'artifact', id, revision: revision(content) };
        const result: ArtifactReceipt = { source, availability, ...(acceptedManifest.bytes !== undefined ? { bytes: acceptedManifest.bytes } : {}), ...(acceptedManifest.reason ? { reason: acceptedManifest.reason } : {}), duplicate: false };
        const writes = [...(text !== undefined ? [{ key: archiveTextObjectKey(text), content: text }] : []), { key: archiveJsonKey(`artifact-${id}`), content }, { key: opKey, content: json(this.receipt(p.owner, 'captureEvidence', input.operationId, payload, result)) }];
        const committed = await this.store.transact([...new Set([...p.dependencies.keys(), ...writes.map(write => write.key)])], snapshot => {
            const replay = this.replay((snapshot.state.get(opKey)!).content, p.owner, 'captureEvidence', input.operationId, payload, receiptResultSchema);
            if (replay)
                return { records: snapshot.records, touchedIds: [], stateWrites: [], result: { ...replay, duplicate: true } };
            this.assertDependencies(p, snapshot);
            return { records: snapshot.records, touchedIds: [], stateWrites: writes, result, ...(file && fileSnapshot && text !== undefined || assertExternalCurrent ? { validateSources: async () => {
                        await assertExternalCurrent?.();
                        if(!file || !fileSnapshot || text===undefined)return;
                        try {
                            if (this.host.workspaceRoot(scope.workspaceKey) !== captureRoot)
                                fail('MEMORY_REVISION_CONFLICT');
                            if(await this.workspaceIdentity(captureRoot!)!==captureRootDigest)fail('MEMORY_REVISION_CONFLICT');
                            await revalidateEvidenceSnapshot(file!, (fileSnapshot!).identity, (fileSnapshot!).digest);
                            const policy = decideToolEvidenceCapture('read_file', { path: file });
                            if (policy.policyState === 'invalid' || policy.disposition !== 'full')
                                fail('MEMORY_REVISION_CONFLICT');
                        }
                        catch {
                            fail('MEMORY_REVISION_CONFLICT');
                        }
                    } } : {}) };
        });
        return committed.result;
    }
    private async validateIngestionSources(refs:SourceRef[],digest:string,p:Prepared):Promise<void> {
        const artifacts=refs.filter(ref=>ref.kind==='artifact');
        if(!artifacts.length||new Set(artifacts.map(stableDisclosureJson)).size!==artifacts.length)fail('MEMORY_INPUT_INVALID');
        const texts:string[]=[];
        for(const ref of artifacts){const source=await this.artifact(ref,p);if(source.availability!=='available')fail('MEMORY_SOURCE_UNAVAILABLE');texts.push(source.text);}
        if(disclosureDigest(texts)!==digest)fail('MEMORY_OPERATION_CONFLICT');
    }
    private async ingestionCursor(snapshot:EpisodeSnapshot,events:EpisodeEvent[],p:Prepared,streamId:string):Promise<IngestionCursor> {
        let cursor:IngestionCursor={sequence:0};
        for(const [index,event] of events.entries())if(event.ingestion?.streamId===streamId){
            const eventRef=snapshot.eventRefs[index]!;
            const ingestion=event.ingestion;
            const key=this.operationKey(p.owner,'appendEvent',event.operationId);
            try{validateIngestionReceipt(event,eventRef,JSON.parse((await this.readKey(key,p.dependencies))??'null'),p.owner);}
            catch{return fail('MEMORY_SOURCE_UNAVAILABLE');}
            try{await this.validateIngestionSources(event.sourceRefs,ingestion.sourceDigest,p);}catch(error){if(error instanceof MemoryControllerError&&error.code==='MEMORY_SCOPE_MISMATCH')throw error;fail('MEMORY_SOURCE_UNAVAILABLE');}
            cursor={sequence:ingestion.sequence,receipt:eventRef};
        }
        return cursor;
    }
    async getIngestionCursor(scope:ControllerScope,raw:{streamId:string}):Promise<IngestionCursor> {
        const input=parseControllerInput(ingestionCursorInputSchema,raw);
        return this.prepare(scope,async p=>{
            const content=await this.readKey(this.taskKey(p.owner),p.dependencies);if(content===null)fail('MEMORY_TASK_NOT_FOUND');
            let task;try{task=taskSchema.parse(JSON.parse(content));}catch{return fail('MEMORY_SOURCE_UNAVAILABLE');}
            this.scope(task.owner,p.owner);const live=await this.readJson(liveKey(task.episodeId),liveSchema,p.dependencies);this.scope(live.owner,p.owner);
            const {snapshot,events}=await this.episode(live.snapshotRef,p);if(stableDisclosureJson(snapshot.header)!==stableDisclosureJson(live.header))fail('MEMORY_SOURCE_UNAVAILABLE');
            return this.ingestionCursor(snapshot,events,p,input.streamId);
        });
    }
    async taskContext(scope: ControllerScope,maxBytes=8192,rawIntentions?:IntentionObservation): Promise<{context:TaskContext;warnings:string[]}> {
        const intentions=rawIntentions?parseControllerInput(intentionObservationSchema,rawIntentions):undefined;
        return this.prepare(scope, async (p) => {
            const content = await this.readKey(this.taskKey(p.owner));
            if (content === null)
                fail('MEMORY_TASK_NOT_FOUND');
            let task;
            try {
                task = taskSchema.parse(JSON.parse(content));
            }
            catch {
                fail('MEMORY_SOURCE_UNAVAILABLE');
            }
            this.scope((task!).owner, p.owner);
            const live = await this.readJson(liveKey((task!).episodeId), liveSchema, p.dependencies);
            this.scope(live.owner, p.owner);
            const { snapshot,events } = await this.episode(live.snapshotRef, p);
            if (stableDisclosureJson(snapshot.header) !== stableDisclosureJson(live.header))
                fail('MEMORY_SOURCE_UNAVAILABLE');
            const context:TaskContext={detail:'full',episode:live.header,episodeRef:live.snapshotRef,freshness:'unknown',needsCheckpoint:true,...(live.capsuleRef?{capsuleRef:live.capsuleRef}:{})};
            const intentionWarnings:string[]=[];
            if(intentions){
                context.intentionEvaluation={...evaluateIntentions(snapshot.workingState,intentions,intentions.limit??64),episodeRevision:live.header.revision};
                if(snapshot.workingState.some(item=>item.kind==='obligation'&&decodeIntention(item.text).status==='invalid'))intentionWarnings.push('intention-envelope-invalid');
                if(context.intentionEvaluation.truncated)intentionWarnings.push('intentions-truncated');
            }
            const required=renderTaskCapsule({id:live.header.id,header:live.header,generatedAt:live.header.updatedAt,trigger:'explicit',workingState:snapshot.workingState,events,episodeRef:live.snapshotRef,maxBytes});
            const mandatoryOverflow=required.status==='insufficient-budget';
            if(!live.capsuleRef){if(mandatoryOverflow){context.detail='handle-only';delete context.episode;delete context.intentionEvaluation;}return {context,warnings:[...intentionWarnings,'capsule-not-available',...(mandatoryOverflow?['capsule-omitted-budget']:[])]};}
            let manifest:CapsuleManifest;
            try{manifest=await this.capsule(live.capsuleRef,p);}catch(error){if(error instanceof MemoryControllerError&&error.code==='MEMORY_SCOPE_MISMATCH')throw error;return {context,warnings:[...intentionWarnings,'capsule-unavailable']};}
            const stale:SourceRef[]=[],warnings:string[]=[...intentionWarnings];
            let unknown=false,available=true;
            if(stableDisclosureJson(manifest.episodeRef)!==stableDisclosureJson(live.snapshotRef))stale.push(manifest.episodeRef);
            for(const ref of manifest.memoryDependencies){
                if(ref.kind!=='memory')fail('MEMORY_SOURCE_UNAVAILABLE');
                try{const record=this.visible(p.records,p.forgotten,p.owner.workspaceKey,ref.id,p.historical);if(memorySemanticRevision(record)!==ref.revision)stale.push(ref);}
                catch(error){if(error instanceof MemoryControllerError&&error.code==='MEMORY_SCOPE_MISMATCH')throw error;stale.push(ref);available=false;warnings.push('capsule-source-unavailable');}
            }
            try{await this.validateRefs(manifest.lineageRefs,p);}
            catch(error){if(error instanceof MemoryControllerError&&error.code==='MEMORY_SCOPE_MISMATCH')throw error;unknown=true;available=false;warnings.push('capsule-evidence-unavailable');}
            for(const ref of manifest.currentAssertionRefs.filter(ref=>ref.kind==='artifact')){
                try{const origin=await this.artifactOrigin(ref,p);if(origin.freshness==='stale')stale.push(ref);if(origin.freshness==='unknown')unknown=true;if(origin.warning)warnings.push(origin.warning);}
                catch{unknown=true;available=false;warnings.push('capsule-evidence-unavailable');}
            }
            const currentMemoryIds=new Set(manifest.currentAssertionRefs.filter(ref=>ref.kind==='memory').map(ref=>ref.id));
            for(const ref of manifest.memoryDependencies.filter(ref=>currentMemoryIds.has(ref.id))){
                try{const origin=await this.memoryOrigin(ref,p);if(origin.freshness==='stale')stale.push(ref);if(origin.freshness==='unknown')unknown=true;if(origin.warning)warnings.push(origin.warning);}
                catch(error){if(error instanceof MemoryControllerError&&error.code==='MEMORY_SCOPE_MISMATCH')throw error;unknown=true;available=false;warnings.push('capsule-source-unavailable');}
            }
            context.freshness=stale.length?'stale':unknown?'unknown':'current';context.needsCheckpoint=context.freshness!=='current';
            if(stale.length)context.staleSourceRefs=uniqueSourceRefs(stale);
            if(available){context.capsule=manifest.capsule;context.capsuleRef=live.capsuleRef;if(manifest.capsule.omittedSupportingItemIds.length)warnings.push('supporting-items-omitted');}
            if(mandatoryOverflow){context.detail='handle-only';delete context.episode;delete context.capsule;delete context.capsuleRef;delete context.staleSourceRefs;delete context.intentionEvaluation;return {context,warnings:[...intentionWarnings,'capsule-omitted-budget']};}
            return {context,warnings:[...new Set(warnings)]};
        });
    }
    async expand(scope: ControllerScope, ref: SourceRef, view: 'episode' | 'evidence'): Promise<EpisodeExpansion> {
        return this.prepare(scope, async (p) => {
            // Exact history is not a current-applicability assertion; visibility and scope still apply.
            p.historical=true;
            if (view === 'episode' && ref.kind === 'episode') {
                const { snapshot, events } = await this.episode(ref, p);
                await this.validateRefs(await this.lineage([ref],p,new Set(),true),p);
                this.safeInput({snapshot,events});
                return { text: stableDisclosureJson({ header: snapshot.header, ...(snapshot.predecessorRef ? { predecessorRef: snapshot.predecessorRef } : {}), workingState: snapshot.workingState, eventRefs: snapshot.eventRefs, events }), sourceRefs: [ref], availability: 'available' };
            }
            if (view === 'episode' && ref.kind === 'event') {
                const event = await this.event(ref, p);
                await this.validateRefs(await this.lineage([ref],p,new Set(),true),p);
                this.safeInput(event);
                return { text: stableDisclosureJson(event), sourceRefs: [ref], availability: 'available' };
            }
            if(view==='episode'&&ref.kind==='manifest'&&ref.id.startsWith('capsule-')){
                const manifest=await this.capsule(ref,p);
                // Preserved derivatives still require current access to their complete source lineage.
                // Exact old revisions are allowed; live-origin freshness is not a history-read gate.
                await this.validateRefs(await this.lineage([...manifest.lineageRefs,...manifest.memoryDependencies],p),p);
                return {text:stableDisclosureJson(manifest),sourceRefs:[ref],availability:'available'};
            }
            if(view==='evidence'&&ref.kind==='manifest'&&(ref.id.startsWith('promotion-')||ref.id.startsWith('retention-'))){
                const manifest=await readArchiveManifest(this.store.paths,ref);
                if(Array.isArray(manifest.details.actions)&&manifest.details.actions.some((a:any)=>a.kind==='supersede'))p.historical=true;
                await this.validateRefs(await this.lineage([ref],p),p);
                return {text:stableDisclosureJson(manifest),sourceRefs:[ref],availability:'available'};
            }
            if (view === 'evidence' && ref.kind === 'artifact') {
                const { text, availability, warning } = await this.artifact(ref, p, true);
                return { text, sourceRefs: [], availability, ...(warning ? {warning} : {}) };
            }
            return fail('MEMORY_INPUT_INVALID');
        });
    }
}

/** Internal only; not reachable through controller or package-root exports. */
export interface PromotionContext {
    owner:Ownership;activation:ExperienceManifest;records:MemoryRecord[];dependencies:Map<string,string|null>;
    enableTemporal():void;
    temporalEvidence(refs:SourceRef[]):Promise<import('./temporal.js').ResolvedTemporalEvidence[]>;
    read(key:string):Promise<string|null>;
    sourceOrigin(ref:SourceRef):Promise<{freshness:TaskContext['freshness'];warning?:string;validate?:()=>Promise<void>}>;
    validate(refs:SourceRef[],available?:boolean):Promise<void>;
    lineage(refs:SourceRef[]):Promise<SourceRef[]>;
    epistemicLineage(refs:SourceRef[]):Promise<SourceRef[]>;
    visible(id:string):MemoryRecord;
    memory(ref:SourceRef):Promise<MemoryRecord>;
    eligible(records:MemoryRecord[]):MemoryRecord[];
    assert(snapshot:StoreSnapshot):void;
    episode(id:string):Promise<{header:EpisodeHeader;ref:SourceRef;workingState:WorkingItem[];
        publish(operationId:string,auditRef:SourceRef):{header:EpisodeHeader;writes:Array<{key:string;content:string}>;eventRef:SourceRef;snapshotRef:SourceRef}}>;
}
