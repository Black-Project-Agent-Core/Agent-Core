import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import * as z from 'zod/v4';
import { CONTINUITY_TASK_STATUSES, CONTINUITY_TURN_STATES, FRONTIER_STATUSES, normalizeContinuityCheckpointInput } from '../../continuity/types.js';
import { validateWorkflowRecord, workflowScopeId } from '../../workflow/store.js';
import { sanitizeStructured } from '../record-types.js';
import { MEMORY_PERSISTENCE_DECISIONS, MEMORY_WRITE_REASON_CODES, type MemoryScope } from '../types.js';
import { canonicalFileNativeProjectId, type FileNativeMemoryPaths } from './paths.js';

/** This allowlist deliberately excludes context leases, sync receipts and source caches. */
export const WORKFLOW_PROJECTION_CATEGORIES = [
  'continuity-tasks', 'continuity-turns', 'continuity-checkpoints', 'continuity-frontier',
  'write-decisions', 'lifecycles', 'workflow-contracts',
] as const;
export type WorkflowProjectionCategory = typeof WORKFLOW_PROJECTION_CATEGORIES[number];
export const WORKFLOW_PROJECTION_LIMITS = { recordBytes: 2 * 1024 * 1024, records: 10_000, manifestBytes: 2 * 1024 * 1024 } as const;
export class WorkflowProjectionError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'WorkflowProjectionError'; }
}
const fail = (code: string): never => { throw new WorkflowProjectionError(code); };
const binary = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function workflowCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(workflowCanonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => binary(a, b)).map(([k, v]) => `${JSON.stringify(k)}:${workflowCanonicalJson(v)}`).join(',')}}`;
}
export const workflowHash = (value: unknown) => createHash('sha256').update(workflowCanonicalJson(value)).digest('hex');
const id = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const text = z.string().max(20_000);
const timestamp = z.number().int().nonnegative();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const scopeFields = { principalId: z.string().min(1).max(1000), projectId: z.string().max(4096).optional() };
const jsonObject = z.record(z.string(), z.json());
const taskSchema = z.strictObject({
  ...scopeFields, taskId: id, parentTaskId: id.optional(), title: text, objective: text.optional(),
  acceptanceCriteria: z.array(text).max(50), constraints: z.array(text).max(50), status: z.enum(CONTINUITY_TASK_STATUSES),
  priority: z.number().finite(), blockers: z.array(jsonObject).max(100), lastCheckpointId: id.optional(),
  createdAt: timestamp, updatedAt: timestamp, completedAt: timestamp.optional(),
});
const turnSchema = z.strictObject({
  ...scopeFields, turnId: id, taskId: id, routeContextId: id, state: z.enum(CONTINUITY_TURN_STATES),
  createdAt: timestamp, closedAt: timestamp.optional(), expiresAt: timestamp.optional(),
});
const decisionSchema = z.strictObject({
  ...scopeFields, id, routeContextId: id, continuityTaskId: id.optional(), contextId: id.optional(),
  decisionType: z.enum(MEMORY_PERSISTENCE_DECISIONS), candidateCanonicalKey: text.optional(), candidateHash: digest,
  targetMemoryId: id.optional(), existingMemoryIds: z.array(id).max(10_000), reasonCodes: z.array(z.enum(MEMORY_WRITE_REASON_CODES)).max(128),
  evidenceRefs: z.array(text).max(128), relationPlan: z.array(jsonObject).max(128), rootReason: text.optional(),
  createdAt: timestamp, appliedAt: timestamp.optional(), applyResult: jsonObject.optional(),
  coveredMeaningfulWorkCount: z.number().int().nonnegative().optional(), plannedRevisionId: id.optional(),
});
const noMemory = z.strictObject({ reasonCode: z.enum(['TRANSIENT_OPERATION', 'INSUFFICIENT_EVIDENCE', 'NO_FUTURE_RELEVANCE']), explanation: text });
const checkpointSchema = z.strictObject({
  ...scopeFields, checkpointId: id, taskId: id, routeContextId: id, phase: z.enum(CONTINUITY_TASK_STATUSES),
  input: jsonObject, stateHash: digest, createdAt: timestamp, turnId: id.optional(), contextId: id.optional(),
  requestHash: digest.optional(), priorCheckpointId: id.optional(), memoryDecision: noMemory.optional(),
});
const frontierSchema = z.strictObject({
  ...scopeFields, frontierId: id, sourceTaskId: id, title: text, rationale: text, status: z.enum(FRONTIER_STATUSES),
  dependencyTaskIds: z.array(id).max(128), priority: z.number().finite(), createdAt: timestamp, updatedAt: timestamp,
  ordinal: z.number().int().nonnegative().optional(),
});
const lifecycleSchema = z.strictObject({
  ...scopeFields, contextId: id, authorityPrincipalId: z.string().optional(), routeContextId: id, continuityTaskId: id.optional(),
  objectiveHash: digest, postflightState: z.enum(['OPEN', 'POSTFLIGHT_PENDING', 'CLOSED']), meaningfulWorkCount: z.number().int().nonnegative(),
  firstMeaningfulAt: timestamp.optional(), lastMeaningfulAt: timestamp.optional(), lastToolName: text.optional(), lastReasonCode: text.optional(),
  postflightAppliedAt: timestamp.optional(), closedAt: timestamp.optional(), createdAt: timestamp, updatedAt: timestamp,
  expiresAt: timestamp.optional(), localDurableGeneration: text.optional(), localDurableHash: text.optional(),
});
const schemas = {
  'continuity-tasks': taskSchema, 'continuity-turns': turnSchema, 'continuity-checkpoints': checkpointSchema,
  'continuity-frontier': frontierSchema, 'write-decisions': decisionSchema, lifecycles: lifecycleSchema,
};
const identityFields = {
  'continuity-tasks': 'taskId', 'continuity-turns': 'turnId', 'continuity-checkpoints': 'checkpointId',
  'continuity-frontier': 'frontierId', 'write-decisions': 'id', lifecycles: 'contextId', 'workflow-contracts': 'taskId',
} as const;

export const workflowRecordRefSchema = z.strictObject({
  category: z.enum(WORKFLOW_PROJECTION_CATEGORIES), recordId: id, recordVersion: timestamp, contentHash: digest,
});
export type WorkflowRecordRef = z.infer<typeof workflowRecordRefSchema>;
export interface WorkflowProjectionRecord extends WorkflowRecordRef {
  principalId: string;
  projectId: string;
  document: Record<string, unknown>;
}
export const workflowManifestSchema = z.strictObject({
  schemaVersion: z.literal(1), principalId: scopeFields.principalId, projectId: z.string().max(4096),
  records: z.array(workflowRecordRefSchema).max(WORKFLOW_PROJECTION_LIMITS.records),
  memories: z.array(z.strictObject({ memoryId: z.string().uuid(), contentHash: digest })).max(10_000).optional(),
});
export type WorkflowProjectionManifest = z.infer<typeof workflowManifestSchema>;
export interface WorkflowProjectionSnapshot {
  schemaVersion: 1;
  principalId: string;
  projectId: string;
  records: WorkflowProjectionRecord[];
  manifest: WorkflowProjectionManifest;
  logicalStateHash: string;
}

/** Validate before projecting: malformed state must never be silently omitted from a generation. */
export function validateWorkflowProjectionDocument(category: WorkflowProjectionCategory, raw: unknown): Record<string, unknown> {
  try {
    if (category === 'workflow-contracts') return validateWorkflowRecord(raw) as unknown as Record<string, unknown>;
    const record = schemas[category].parse(raw) as Record<string, unknown>;
    if (category === 'continuity-checkpoints') {
      normalizeContinuityCheckpointInput(record.input as Parameters<typeof normalizeContinuityCheckpointInput>[0]);
      if ((record.input as Record<string, unknown>).status !== record.phase) return fail('WORKFLOW_PROJECTION_CHECKPOINT_INVALID');
      if (record.stateHash !== workflowHash(record.input)) return fail('WORKFLOW_PROJECTION_CHECKPOINT_HASH_INVALID');
    }
    return record;
  } catch (error) {
    if (error instanceof WorkflowProjectionError) throw error;
    return fail('WORKFLOW_PROJECTION_RECORD_INVALID');
  }
}

function logicalDocument(category: WorkflowProjectionCategory, record: Record<string, unknown>) {
  const document = { ...record };
  if (category === 'lifecycles') {
    // A receipt certifies this closure; including the receipt would recursively change its own hash.
    delete document.localDurableGeneration; delete document.localDurableHash; delete document.expiresAt;
    document.updatedAt = Math.max(...['createdAt', 'firstMeaningfulAt', 'lastMeaningfulAt', 'postflightAppliedAt', 'closedAt']
      .map(key => typeof document[key] === 'number' ? document[key] as number : 0));
  }
  if (category === 'continuity-turns') delete document.expiresAt;
  return document;
}

export function makeWorkflowProjectionRecord(category: WorkflowProjectionCategory, recordId: string, raw: unknown,
  scope: { principalId: string; projectId: string }): WorkflowProjectionRecord {
  const valid = validateWorkflowProjectionDocument(category, raw);
  if (valid.principalId !== scope.principalId || String(valid.projectId ?? '') !== scope.projectId) return fail('WORKFLOW_PROJECTION_SCOPE_MISMATCH');
  if (!id.safeParse(recordId).success || (category !== 'workflow-contracts' && valid[identityFields[category]] !== recordId)) return fail('WORKFLOW_PROJECTION_ID_MISMATCH');
  if (category === 'workflow-contracts' && recordId !== workflowScopeId({ ...scope, taskId: String(valid.taskId) })) return fail('WORKFLOW_PROJECTION_ID_MISMATCH');
  const document = logicalDocument(category, valid);
  const sanitized = sanitizeStructured(document);
  if (category === 'workflow-contracts' && workflowCanonicalJson(document) !== workflowCanonicalJson(sanitized)) {
    // Do not corrupt an integrity checked contract while hiding a leaked secret. Repair the source record instead.
    return fail('WORKFLOW_PROJECTION_SECRET_DETECTED');
  }
  const projected = sanitized as Record<string, unknown>;
  validateWorkflowProjectionDocument(category, projected);
  if (Buffer.byteLength(workflowCanonicalJson(projected)) > WORKFLOW_PROJECTION_LIMITS.recordBytes) return fail('WORKFLOW_PROJECTION_RECORD_TOO_LARGE');
  const recordVersion = category === 'workflow-contracts' ? Number(projected.version)
    : Math.max(...['updatedAt', 'appliedAt', 'closedAt', 'createdAt'].map(key => typeof projected[key] === 'number' ? projected[key] as number : 0));
  if (!timestamp.safeParse(recordVersion).success) return fail('WORKFLOW_PROJECTION_VERSION_INVALID');
  return { principalId:scope.principalId,projectId:scope.projectId, category, recordId, recordVersion, contentHash: workflowHash(projected), document: projected };
}

export function makeWorkflowProjectionSnapshot(scope: { principalId: string; projectId: string }, records: WorkflowProjectionRecord[], memories?: WorkflowProjectionManifest['memories']): WorkflowProjectionSnapshot {
  const ordered = [...records].sort((a, b) => binary(`${a.category}/${a.recordId}`, `${b.category}/${b.recordId}`));
  const refs = ordered.map(({ category, recordId, recordVersion, contentHash }) => ({ category, recordId, recordVersion, contentHash }));
  const manifest = workflowManifestSchema.parse({ schemaVersion: 1, principalId:scope.principalId,projectId:scope.projectId, records: refs, ...(memories?.length ? { memories: [...memories].sort((a,b)=>binary(a.memoryId,b.memoryId)) } : {}) });
  if (memories && new Set(memories.map(m=>m.memoryId)).size !== memories.length) return fail('WORKFLOW_PROJECTION_DUPLICATE_MEMORY');
  if (new Set(refs.map(r => `${r.category}/${r.recordId}`)).size !== refs.length) return fail('WORKFLOW_PROJECTION_DUPLICATE_RECORD');
  if (Buffer.byteLength(workflowCanonicalJson(manifest)) > WORKFLOW_PROJECTION_LIMITS.manifestBytes) return fail('WORKFLOW_PROJECTION_MANIFEST_TOO_LARGE');
  validateWorkflowProjectionReferences(ordered);
  return { schemaVersion: 1, principalId:scope.principalId,projectId:scope.projectId, records: ordered, manifest, logicalStateHash: workflowHash(manifest) };
}

export function validateWorkflowProjectionReferences(records: WorkflowProjectionRecord[]): void {
  const tasks = new Set(records.filter(r => r.category === 'continuity-tasks').map(r => r.document.taskId));
  const checkpoints = new Set(records.filter(r => r.category === 'continuity-checkpoints').map(r => r.document.checkpointId));
  for (const record of records) {
    const doc = record.document;
    const taskId = ['continuity-turns', 'continuity-checkpoints', 'workflow-contracts'].includes(record.category) ? doc.taskId
      : record.category === 'continuity-frontier' ? doc.sourceTaskId : doc.continuityTaskId;
    if (taskId && !tasks.has(taskId)) return fail('WORKFLOW_PROJECTION_TASK_MISSING');
    if (record.category === 'continuity-tasks' && doc.lastCheckpointId && !checkpoints.has(doc.lastCheckpointId)) return fail('WORKFLOW_PROJECTION_CHECKPOINT_MISSING');
  }
}

async function readProjectionRecords(paths: FileNativeMemoryPaths, scope: MemoryScope, categories:readonly WorkflowProjectionCategory[]) {
  const normalized = { principalId: scope.principalId, projectId: canonicalFileNativeProjectId(paths, scope.projectId) };
  if (!scopeFields.principalId.safeParse(normalized.principalId).success) return fail('MEMORY_SCOPE_REQUIRED');
  const records: WorkflowProjectionRecord[] = [];
  for (const category of categories) {
    const dir = path.join(paths.vaultRoot, '.agent-core', 'state', category);
    let names: string[];
    try {
      const stat = await lstat(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return fail('WORKFLOW_PROJECTION_PATH_INVALID');
      names = (await readdir(dir)).filter(name => name.endsWith('.json')).sort(binary);
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    for (const name of names) {
      const file = path.join(dir, name), stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > WORKFLOW_PROJECTION_LIMITS.recordBytes) return fail('WORKFLOW_PROJECTION_FILE_INVALID');
      let raw: Record<string, unknown>;
      try { raw = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>; }
      catch { return fail('WORKFLOW_PROJECTION_RECORD_INVALID'); }
      if (!raw || typeof raw !== 'object' || typeof raw.principalId !== 'string') return fail('WORKFLOW_PROJECTION_RECORD_INVALID');
      if (raw.principalId !== normalized.principalId || canonicalFileNativeProjectId(paths, String(raw.projectId ?? '')) !== normalized.projectId) continue;
      records.push(makeWorkflowProjectionRecord(category, name.slice(0, -5), { ...raw, projectId: normalized.projectId }, normalized));
      if (records.length > WORKFLOW_PROJECTION_LIMITS.records) return fail('WORKFLOW_PROJECTION_RECORD_LIMIT');
    }
  }
  return {normalized,records};
}
export async function readWorkflowProjection(paths:FileNativeMemoryPaths,scope:MemoryScope):Promise<WorkflowProjectionSnapshot>{
  const {normalized,records}=await readProjectionRecords(paths,scope,WORKFLOW_PROJECTION_CATEGORIES);
  return makeWorkflowProjectionSnapshot(normalized,records);
}
export async function hasWorkflowProjectionContract(paths:FileNativeMemoryPaths,scope:MemoryScope):Promise<boolean>{
  return(await readProjectionRecords(paths,scope,['workflow-contracts'])).records.length>0;
}
