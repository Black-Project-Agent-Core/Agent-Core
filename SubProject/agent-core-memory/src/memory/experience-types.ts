import { z } from 'zod';
import type { MemoryRecord } from './types.js';

export type Digest = string;
export type IsoInstant = string;
export type RetentionTier = 'active' | 'durable' | 'archive';
export type EpistemicType = 'unknown' | 'fact' | 'observation' | 'hypothesis' | 'prediction' | 'opinion';
export type TemporalClass = 'unknown' | 'atemporal' | 'static' | 'dynamic';
export const safeIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/);
export const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const isoInstantSchema = z.iso.datetime({ offset:true }).transform(value => new Date(value).toISOString());
export const sourceRefSchema = z.strictObject({kind:z.enum(['memory','episode','event','artifact','manifest']),id:safeIdSchema,revision:digestSchema});
export type SourceRef = z.infer<typeof sourceRefSchema>;
export const timeValueSchema = z.discriminatedUnion('precision',[
  z.strictObject({precision:z.literal('instant'),value:isoInstantSchema}),
  z.strictObject({precision:z.literal('day'),value:z.iso.date(),timezone:z.string().min(1).optional()}),
  z.strictObject({precision:z.literal('month'),value:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),timezone:z.string().min(1).optional()}),
  z.strictObject({precision:z.literal('year'),value:z.string().regex(/^\d{4}$/),timezone:z.string().min(1).optional()}),
  z.strictObject({precision:z.literal('unknown'),text:z.string().optional()}),
]);
export type TimeValue = z.infer<typeof timeValueSchema>;
export const validitySchema = z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('unknown')}),
  z.strictObject({state:z.literal('known'),from:timeValueSchema.nullable(),to:timeValueSchema.nullable()}),
]).refine(value => value.state !== 'known' || value.from?.precision !== 'instant' || value.to?.precision !== 'instant'
  || Date.parse(value.from.value) < Date.parse(value.to.value), 'Validity must be a nonempty forward interval');
export type Validity = z.infer<typeof validitySchema>;
const verificationText = z.string().min(1).regex(/\S/);
const verificationMetadata = {method:verificationText.optional(),verifierRevision:verificationText.optional(),verifiedAt:isoInstantSchema.optional()};
/** A verified label requires provenance shape; this parser does not execute a verifier. */
export const verificationSchema = z.discriminatedUnion('status',[
  z.strictObject({status:z.literal('unverified'),evidence:z.array(sourceRefSchema),...verificationMetadata}),
  z.strictObject({status:z.literal('supported'),evidence:z.array(sourceRefSchema).min(1),...verificationMetadata}),
  z.strictObject({status:z.literal('verified'),evidence:z.array(sourceRefSchema).min(1),method:verificationText,verifierRevision:verificationText,verifiedAt:isoInstantSchema}),
]);
export type Verification = z.infer<typeof verificationSchema>;
export const recordExperienceSchema = z.strictObject({
  schemaVersion:z.literal(1),kind:z.enum(['note','project-direction','decision','instruction','observation','lesson','procedure']),
  retention:z.enum(['active','durable','archive']),epistemic:z.enum(['unknown','fact','observation','hypothesis','prediction','opinion']),
  temporal:z.enum(['unknown','atemporal','static','dynamic']),observedAt:timeValueSchema.optional(),
  validity:validitySchema,verification:verificationSchema,sourceRefs:z.array(sourceRefSchema),
});
export type RecordExperience = z.infer<typeof recordExperienceSchema>;
export type RecordKind = RecordExperience['kind'];

export function legacyExperience(): RecordExperience {
  return {schemaVersion:1,kind:'note',retention:'durable',epistemic:'unknown',temporal:'unknown',
    validity:{state:'unknown'},verification:{status:'unverified',evidence:[]},sourceRefs:[]};
}
export function recordExperience(record: MemoryRecord): RecordExperience {
  return record.version === 2 ? structuredClone(record.experience) : legacyExperience();
}
export const experienceManifestSchema = z.strictObject({
  schemaVersion:z.literal(1),formatVersion:z.literal(2),rootId:safeIdSchema,generation:z.number().int().positive(),
  status:z.enum(['incomplete','complete']),
  origin:z.strictObject({sourceDigest:digestSchema,sourceCount:z.number().int().nonnegative(),
    historyCompleteness:z.literal('available-only'),sourceRefs:z.array(sourceRefSchema)}).optional(),
});
export type ExperienceManifest = z.infer<typeof experienceManifestSchema>;

const inputIdentity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
const text = z.string().min(1).refine(value => /\S/.test(value) && Array.from(value).length <= 200_000);
const refs = z.array(sourceRefSchema).max(64);
export const workingItemSchema = z.strictObject({id:safeIdSchema,
  kind:z.enum(['goal','constraint','decision','current-state','successful-strategy','failed-path','blocker','obligation','next-action','changed-file','important-id']),
  // Stored reducer lineage accumulates across events; per-call bounds belong to input validation.
  text,critical:z.boolean(),state:z.enum(['active','resolved']),sourceRefs:z.array(sourceRefSchema),verification:verificationSchema});
export type WorkingItem = z.infer<typeof workingItemSchema>;
export const workingStateChangeSchema = z.discriminatedUnion('op',[
  z.strictObject({op:z.literal('upsert'),item:workingItemSchema}),
  z.strictObject({op:z.literal('resolve'),itemId:safeIdSchema,reason:text,sourceRefs:refs.min(1)}),
]);
export type WorkingStateChange = z.infer<typeof workingStateChangeSchema>;
export const temporalAssertionSchema=z.strictObject({kind:z.enum(['correction','state-transition']),predecessor:sourceRefSchema.refine(r=>r.kind==='memory'),successor:sourceRefSchema.refine(r=>r.kind==='memory'),effectiveAt:isoInstantSchema,evidence:refs.min(1)});
export type TemporalAssertion=z.infer<typeof temporalAssertionSchema>;
export const episodeEventInputSchema = z.strictObject({kind:z.enum(['action','observation','decision','failure','success','correction','checkpoint']),
  summary:text,observedAt:timeValueSchema.optional(),temporalAssertion:temporalAssertionSchema.optional(),sourceRefs:refs,stateChanges:z.array(workingStateChangeSchema).max(64)});
export type EpisodeEventKind = z.infer<typeof episodeEventInputSchema>['kind'] | 'status-change';
export interface EpisodeEvent {
  schemaVersion:1;id:string;episodeId:string;sequence:number;operationId:string;kind:EpisodeEventKind;summary:string;
  recordedAt:IsoInstant;observedAt?:TimeValue;temporalAssertion?:TemporalAssertion;clockSkewMs?:number;origin:{controllerId:string;sessionId?:string;role:'controller'|'tool'|'user'};
  sourceRefs:SourceRef[];stateChanges:WorkingStateChange[];
}
export const episodeHeaderSchema = z.strictObject({schemaVersion:z.literal(1),id:safeIdSchema,taskId:inputIdentity,
  workspaceKey:z.string().min(1).max(120),startKey:inputIdentity,status:z.enum(['open','paused','completed','abandoned']),
  revision:z.number().int().positive(),createdAt:isoInstantSchema,updatedAt:isoInstantSchema,eventCount:z.number().int().positive()});
export type EpisodeHeader = z.infer<typeof episodeHeaderSchema>;
export const startEpisodeInputSchema = z.strictObject({startKey:inputIdentity,goal:text,sourceRefs:refs});
export type StartEpisodeInput = z.infer<typeof startEpisodeInputSchema>;
export const appendEventInputSchema = z.strictObject({episodeId:safeIdSchema,expectedRevision:z.number().int().positive(),
  operationId:inputIdentity,event:episodeEventInputSchema}).refine(value=>value.event.stateChanges.every(change=>change.op==='resolve'||change.item.verification.status!=='verified'));
export type AppendEventInput = z.infer<typeof appendEventInputSchema>;
export interface EpisodeAppendResult {episodeId:string;revision:number;eventRef:SourceRef;duplicate:boolean}
export const episodeStatusInputSchema = z.strictObject({episodeId:safeIdSchema,expectedRevision:z.number().int().positive(),
  operationId:inputIdentity,status:z.enum(['open','paused','completed','abandoned']),reason:text,sourceRefs:refs});
export type EpisodeStatusInput = z.infer<typeof episodeStatusInputSchema>;
export const captureEvidenceInputSchema = z.strictObject({operationId:inputIdentity,observedAt:timeValueSchema.optional(),source:z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('workspace-file'),relativePath:z.string().min(1).max(500)}),
  z.strictObject({kind:z.literal('controller-text'),text:z.string().refine(value=>Buffer.byteLength(value,'utf8')<=32*1024*1024),
    originRef:z.string().min(1).max(500).refine(value=>!/[\x00-\x1f\x7f]/.test(value)&&!/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(value)).optional()}),
])});
export type CaptureEvidenceInput = z.infer<typeof captureEvidenceInputSchema>;
export type ArtifactAvailability = 'available'|'reference-only'|'unavailable';
export interface ArtifactReceipt {source:SourceRef;availability:ArtifactAvailability;bytes?:number;reason?:string;duplicate:boolean}
export const checkpointTriggerSchema=z.enum(['phase-complete','decision','verified-correction','state-change','milestone','failure-resolved','budget-pressure','handoff','explicit']);
export type CheckpointTrigger=z.infer<typeof checkpointTriggerSchema>;
export const checkpointInputSchema=z.strictObject({episodeId:safeIdSchema,expectedRevision:z.number().int().positive(),operationId:inputIdentity,
  trigger:checkpointTriggerSchema,budget:z.strictObject({maxBytes:z.number().int().min(512).max(65536).optional()}).optional()});
export type CheckpointInput=z.infer<typeof checkpointInputSchema>;
export const taskCapsuleSchema=z.strictObject({schemaVersion:z.literal(1),id:safeIdSchema,taskId:inputIdentity,episodeId:safeIdSchema,
  episodeRevision:z.number().int().positive(),generatedAt:isoInstantSchema,generator:z.literal('deterministic-v1'),trigger:checkpointTriggerSchema,
  criticalItems:z.array(workingItemSchema),supportingItems:z.array(workingItemSchema),sourceRefs:z.array(sourceRefSchema),omittedSupportingItemIds:z.array(safeIdSchema)});
export type TaskCapsule=z.infer<typeof taskCapsuleSchema>;
export interface TaskContext {detail:'full'|'handle-only';episode?:EpisodeHeader;episodeRef:SourceRef;
  freshness:'current'|'stale'|'unknown';capsule?:TaskCapsule;capsuleRef?:SourceRef;staleSourceRefs?:SourceRef[];needsCheckpoint:boolean}

export const retentionInputSchema = z.strictObject({memoryId:safeIdSchema,expectedRevision:digestSchema,
  operationId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),tier:z.enum(['active','durable','archive']),
  reason:z.string().trim().min(1).max(2000),sourceRefs:z.array(sourceRefSchema).max(64)});
export type RetentionInput = z.infer<typeof retentionInputSchema>;
export const retentionReceiptSchema = z.strictObject({memoryId:safeIdSchema,revision:digestSchema,
  tier:z.enum(['active','durable','archive']),auditRef:sourceRefSchema,duplicate:z.boolean()});
export type RetentionReceipt = z.infer<typeof retentionReceiptSchema>;
