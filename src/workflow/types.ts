import * as z from 'zod/v4';

export const WORKFLOW_POLICY_VERSION = 'workflow-v1';
export class WorkflowError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: Record<string, unknown>) {
    super(message); this.name = 'WorkflowError';
  }
}
export interface WorkflowScope { principalId: string; projectId: string; taskId: string }
export interface WorkflowBindInput {
  brief: string;
  context?: string;
  workflow?: 'auto' | 'direct' | 'dag';
  craft?: { requirements: Array<{ id: string; description: string }>; donors: Array<{ id: string; source: string; ref?: string }> };
}
const text = z.string().min(1).max(20_000);
const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const pathKind = z.enum(['file', 'directory', 'missing']);
const pathStateSchema = z.strictObject({ path: text, kind: pathKind, hash: hash.nullable() });
export type WorkflowPathState = z.infer<typeof pathStateSchema>;
export const workflowStepSchema = z.strictObject({
  id, purpose: text, kind: z.enum(['edit', 'command', 'verification']),
  paths: z.array(text).max(100).default([]), command: text.optional(),
});
export const workflowMappingSchema = z.strictObject({
  requirementId: id, donorId: id, donorReceiptIds: z.array(id).min(1).max(100),
  targetReceiptIds: z.array(id).min(1).max(100),
  mechanism: text, inputs: text, outputs: text, dependencies: text, failureBehavior: text,
  reuse: text, adaptation: text, rejected: text,
  targetPaths: z.array(text).min(1).max(100), stepIds: z.array(id).min(1).max(100),
  integrationSeamPaths: z.array(text).max(100).optional(),
  license: z.strictObject({ mode: z.enum(['adapt_mechanism', 'literal_reuse']), receiptIds: z.array(id).max(20), attribution: text.optional() }),
});
export const workflowCheckSchema = z.strictObject({
  id, purpose: text, kind: z.enum(['behavior', 'integration', 'regression']),
  requirementIds: z.array(id).max(100), stepIds: z.array(id).min(1).max(100),
  artifactPaths: z.array(text).min(1).max(100),
});
export const workflowPlanInputSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  steps: z.array(workflowStepSchema).min(1).max(100),
  mappings: z.array(workflowMappingSchema).max(100).default([]),
  checks: z.array(workflowCheckSchema).min(1).max(100),
});
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowMapping = z.infer<typeof workflowMappingSchema>;
export type WorkflowCheck = z.infer<typeof workflowCheckSchema>;
export type WorkflowPlanInput = z.input<typeof workflowPlanInputSchema>;
const snapshotSchema = z.strictObject({
  id, role: z.enum(['donor', 'target']), donorId: id.optional(), source: text, path: text,
  contentHash: hash, bytes: z.number().int().nonnegative(), acquiredAt: z.number(),
  commit: z.string().regex(/^[a-f0-9]{40,64}$/).optional(),
  ref: text.optional(),
  contentClass: z.enum(['code', 'documentation', 'configuration', 'other']),
  language: id, analysisLevel: z.enum(['source_read','structural_only']),
});
const receiptSchema = z.strictObject({
  id, snapshotId: id, contentHash: hash, startLine: z.number().int().positive(), endLine: z.number().int().nonnegative(),
  deliveredHash: hash, complete: z.boolean(), issuedAt: z.number(),
});
export type WorkflowSnapshot = z.infer<typeof snapshotSchema>;
export type WorkflowReceipt = z.infer<typeof receiptSchema>;
const classificationFlagsSchema = z.strictObject({ craftRequired: z.boolean(), dagRequired: z.boolean(), planRequired: z.boolean() });
const classificationEventSchema = z.strictObject({
  at: z.number(), inputHash: hash, brief: text, context: z.string().max(20_000).optional(),
  workflow: z.enum(['auto', 'direct', 'dag']), structuredCraftHash: hash.optional(),
  result: classificationFlagsSchema, reasons: z.array(id).min(1).max(10),
  clauses: z.array(z.strictObject({ field: z.enum(['brief', 'context']), text })).max(500),
});
const classificationProvenanceSchema = z.strictObject({
  policyVersion: z.literal('workflow-intent-v2'), latest: classificationEventSchema,
  obligations: z.strictObject({ craftRequired: classificationEventSchema.optional(), dagRequired: classificationEventSchema.optional(), planRequired: classificationEventSchema.optional() }),
  legacy: classificationFlagsSchema.extend({ version: z.number().int().positive(), stateHash: hash }).optional(),
});
export type WorkflowClassificationEvent = z.infer<typeof classificationEventSchema>;
export type WorkflowClassificationProvenance = z.infer<typeof classificationProvenanceSchema>;
export const workflowRecordSchema = z.strictObject({
  schemaVersion: z.literal(1), principalId: id, projectId: text, taskId: id,
  version: z.number().int().positive(), stateHash: hash, targetRoot: text,
  brief: text, context: z.string().max(20_000).optional(), briefHash: hash, createdAt: z.number(), updatedAt: z.number(),
  phase: z.enum(['DISCOVERY', 'READY_TO_IMPLEMENT', 'IMPLEMENTING', 'VERIFIED', 'CLOSURE_PENDING', 'CLOSED']),
  planRequired: z.boolean(), craftRequired: z.boolean(), dagRequired: z.boolean(),
  blockers: z.array(z.strictObject({ code: id, detail: text })).max(100),
  requirements: z.array(z.strictObject({ id, description: text })).max(100),
  donors: z.array(z.strictObject({ id, source: text, ref: text.optional() })).max(20),
  snapshots: z.array(snapshotSchema).max(500), receipts: z.array(receiptSchema).max(2000),
  plan: z.strictObject({
    revision: z.number().int().positive(), hash, acceptedAt: z.number(),
    steps: z.array(workflowStepSchema).min(1).max(100), mappings: z.array(workflowMappingSchema).max(100),
    checks: z.array(workflowCheckSchema).min(1).max(100),
    targetBaseline: z.array(z.strictObject({ path: text, hash: hash.nullable(), expectedKind: pathKind.optional(), operationRecorded: z.boolean().optional() })).max(300),
  }).optional(),
  verification: z.strictObject({ checkedAt: z.number(), planHash: hash, runIds: z.array(id).max(100), outputHashes: z.array(z.strictObject({ path: text, hash })).max(300), outputStates: z.array(pathStateSchema).max(300).optional() }).optional(),
  closure: z.strictObject({ checkpointId: id }).optional(),
  classification: classificationProvenanceSchema.optional(),
  classificationRecovery: z.strictObject({
    policyVersion: z.literal('workflow-intent-v2'), requestHash: hash, correctedAt: z.number(), operator: id, reason: text,
    beforeVersion: z.literal(2), beforeStateHash: hash, beforeContentHash: hash, predecessorContentHash: hash,
    auditHeadHash: hash, executionInventoryHash: hash, backupHash: hash,
  }).optional(),
});
export type WorkflowRecord = z.infer<typeof workflowRecordSchema>;
export interface WorkflowSourceInput {
  operation: 'list' | 'read'; role: 'donor' | 'target'; donorId?: string; path?: string;
  startLine?: number; lineCount?: number; maxBytes?: number; expectedVersion?: number;
}
export interface WorkflowAuthorizeInput {
  toolName: string; path?: string; paths?: string[]; command?: string;
  stepId?: string; stepIds?: string[]; planVersion?: number; viaExecution?: boolean;
}
export interface WorkflowExecutionRequest {
  operation: string; runId?: string; objective?: string; continuityTaskId?: string;
  nodes?: Array<{ id?: string; nodeId?: string; purpose?: string; command?: string; cwd?: string; stepIds?: string[]; resources?: unknown; inputs?: unknown }>;
  planVersion?: number;
}
export interface WorkflowExecutionBinding { policyVersion: string; planRevision: string; planHash: string; requiredStepIds: string[] }
/** Only the runtime integration may construct this evidence from its execution store. Never expose as user-asserted proof. */
export interface WorkflowRunEvidence {
  runId: string; taskId: string; state: string; verification: string; planHash: string;
  nodes: Array<{ stepIds: string[]; state: string; verification: string; artifacts: Array<{ path: string; sha256?: string; verification: string }>; inputHashes?: Array<{ path: string; hash: string }>; inputEntries?: WorkflowPathState[] }>;
}
