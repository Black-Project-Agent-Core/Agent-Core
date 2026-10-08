import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { MemoryRecord } from './types.js';

import { digestSchema } from './experience-types.js';
import type { Digest, IsoInstant, SourceRef, Verification, RetentionTier, EpistemicType, TemporalClass,Validity,TimeValue } from './experience-types.js';
export { digestSchema } from './experience-types.js';
export type { Digest, IsoInstant, SourceRef, Verification, RetentionTier, EpistemicType, TemporalClass,Validity,TimeValue } from './experience-types.js';
export type DisclosureView = 'map' | 'abstract' | 'record' | 'episode' | 'evidence';
export interface ControllerScope { workspaceKey: string; taskId: string; controllerId: string; sessionId?: string }
export interface ReadBudget { maxBytes?: number }
export interface BudgetMetrics { payloadBytes: number; estimatedTokens: number; tokenEstimator: 'unicode-codepoints/4-v1' }
export type Budgeted<T> =
  | { status: 'ok' | 'partial'; data: T; metrics: BudgetMetrics; warnings: string[] }
  | { status: 'insufficient-budget'; requiredBytes: number; metrics: BudgetMetrics; warnings: string[] };
export interface RecallInput {
  query?: string; view?: 'map' | 'abstract'; retention?: 'active-durable' | 'archive' | 'all';
  asOf?: IsoInstant; limit?: number; cursor?: string; budget?: ReadBudget;
}
export interface MemoryHit {
  id: string; revision: Digest; title: string; abstract?: string; validity?:Validity;observedAt?:TimeValue;invalidatedBy?:SourceRef[];retention: RetentionTier;
  epistemic: EpistemicType; temporal: TemporalClass; verification: Verification['status'];
  applicability: 'current' | 'historical' | 'superseded' | 'conflicted' | 'unknown';
  freshness: 'current' | 'stale' | 'unknown'; availableViews: Array<'record' | 'episode' | 'evidence'>; score?: number;
  retrievalEvidence: { attemptId: string; contentDigest: Digest; recordFingerprint: Digest };
}
export interface RecallPage {
  snapshot: Digest; hits: MemoryHit[]; nextCursor?: string; archiveSearchAvailable: boolean;
  completeness: 'complete' | 'partial';
}
export interface ExpandInput { source: SourceRef; view: 'record' | 'episode' | 'evidence'; cursor?: string; budget?: ReadBudget }
export interface ExpansionPage {
  source: SourceRef; view: ExpandInput['view']; text: string; offset: number; totalCodePoints: number;
  sourceRefs: SourceRef[]; nextCursor?: string; availability: 'available' | 'reference-only' | 'unavailable';
}
export interface ControllerMemoryCapabilities {
  contractVersion: 1; views: DisclosureView[];
  budgets: { defaultBytes: 8192; minBytes: 512; maxBytes: 65536 };
  writeMode: 'legacy-read' | 'experience-v2'; temporalAsOf: boolean; advisory: true;
}
export type MemoryControllerErrorCode = 'MEMORY_INPUT_INVALID' | 'MEMORY_SCOPE_MISMATCH' | 'MEMORY_SOURCE_UNAVAILABLE'
  | 'MEMORY_REVISION_CONFLICT' | 'MEMORY_CURSOR_STALE' | 'MEMORY_CURSOR_INVALID'
  | 'MEMORY_SCHEMA_UNSUPPORTED' | 'MEMORY_EXPERIENCE_NOT_ENABLED' | 'MEMORY_TEMPORAL_UNSUPPORTED'
  | 'MEMORY_CONSOLIDATION_INVALID' | 'MEMORY_CONSOLIDATION_REVIEW_REQUIRED'
  | 'MEMORY_DISCLOSURE_LEDGER_UNAVAILABLE' | 'MEMORY_OPERATION_CONFLICT' | 'MEMORY_PRESERVATION_REQUIRED' | 'MEMORY_TASK_NOT_FOUND';
export class MemoryControllerError extends Error {
  constructor(readonly code: MemoryControllerErrorCode) { super(code); this.name = 'MemoryControllerError'; }
}

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/);
const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
const budgetSchema = z.strictObject({ maxBytes: z.number().int().min(512).max(65536).optional() });
export const taskContextInputSchema=z.strictObject({budget:budgetSchema.optional()});
export const controllerScopeSchema = z.strictObject({
  workspaceKey: z.string().min(1).max(120).refine(value => value === value.trim() && !/[\x00-\x1f\x7f]/.test(value)),
  taskId: identity, controllerId: identity, sessionId: identity.optional(),
});
export const recallInputSchema = z.strictObject({
  query: z.string().max(200_000).optional(), view: z.enum(['map','abstract']).optional(),
  retention: z.enum(['active-durable','archive','all']).optional(), asOf: z.string().optional(),
  limit: z.number().int().min(1).max(20).optional(), cursor: z.string().min(1).max(2048).optional(), budget: budgetSchema.optional(),
});
export const expandInputSchema = z.strictObject({
  source: z.strictObject({ kind: z.enum(['memory','episode','event','artifact','manifest']), id, revision: digestSchema }),
  view: z.enum(['record','episode','evidence']), cursor: z.string().min(1).max(2048).optional(), budget: budgetSchema.optional(),
});
export function parseControllerInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new MemoryControllerError('MEMORY_INPUT_INVALID');
  return parsed.data;
}

/** Stable key ordering makes object-property insertion order irrelevant. */
export function stableDisclosureJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item);
}
export function disclosureDigest(value: unknown): Digest {
  return 'sha256:' + createHash('sha256').update(stableDisclosureJson(value), 'utf8').digest('hex');
}
export function disclosurePayloadDigest(value: unknown): Digest {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

/** Stable v1 meaning fields plus explicit v2 experience; derived history is archived separately. */
export function semanticMemoryValue(record: MemoryRecord) {
  return { version: record.version, id: record.id, title: record.title, content: record.content,
    keywords: record.keywords, context: record.context, tags: record.tags, category: record.category,
    links: record.links, expiresAt: record.expiresAt, pinned: record.pinned, source: record.source, provenance: record.provenance,
    ...(record.version === 2 ? {experience:record.experience} : {}) };
}
export function memorySemanticRevision(record: MemoryRecord): Digest {
  return disclosureDigest([record.version === 1 ? 'agent-core-memory-semantic/v1' : 'agent-core-memory-semantic/v2', semanticMemoryValue(record)]);
}

/** Relevant canonical fields, without access statistics or derived history.
 * Host-absolute legacy source/repo pointers are omitted from the public text.
 * Legacy links are opaque metadata, never fabricated exact SourceRefs.
 */
export function serializeMemoryRecordView(record: MemoryRecord): string {
  const absolute = (value: string | undefined) => Boolean(value && (/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(value)));
  const value = semanticMemoryValue(record);
  const source = record.source ? { type: record.source.type,
    ...(typeof record.source.ref === 'string' && !absolute(record.source.ref) ? { ref: record.source.ref } : {}) } : undefined;
  const provenance = record.provenance ? { ...record.provenance,
    ...(absolute(record.provenance.repo) ? { repo: undefined } : {}),
    ...(absolute(record.provenance.workspace) ? { workspace: undefined } : {}) } : undefined;
  return stableDisclosureJson({ ...value, source, provenance });
}

/** Solve metrics against the final envelope, including metrics' own digits. */
export function measureBudgeted<T>(result: Omit<Extract<Budgeted<T>, { data: T }>, 'metrics'>
  | Omit<Extract<Budgeted<T>, { status: 'insufficient-budget' }>, 'metrics'>): Budgeted<T> {
  const output = { ...result, metrics: { payloadBytes: 0, estimatedTokens: 0, tokenEstimator: 'unicode-codepoints/4-v1' as const } };
  for (;;) {
    const json = JSON.stringify(output);
    const payloadBytes = Buffer.byteLength(json, 'utf8');
    const estimatedTokens = Math.ceil(Array.from(json).length / 4);
    if (output.metrics.payloadBytes === payloadBytes && output.metrics.estimatedTokens === estimatedTokens) return output as Budgeted<T>;
    output.metrics.payloadBytes = payloadBytes;
    output.metrics.estimatedTokens = estimatedTokens;
  }
}
export function insufficientBudget<T>(requiredBytes: number, warnings: string[]): Budgeted<T> {
  return measureBudgeted<T>({ status: 'insufficient-budget', requiredBytes, warnings });
}
