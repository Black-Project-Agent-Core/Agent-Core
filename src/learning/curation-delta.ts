import { createHash } from 'node:crypto';
import * as z from 'zod/v4';
import { stableDisclosureJson } from '../memory/disclosure.js';
import { learningCandidateSchema } from './candidate-purpose.js';
import { safeEvidenceRefSchema, safeMetadataSchema } from './evaluation.js';
import { validateCandidate } from './review.js';
import type { CurationDelta, LearningCandidate } from './types.js';

const entrySchema = z.strictObject({
  kind: z.enum(['add-lesson', 'add-counterexample']),
  target: z.strictObject({ id: safeMetadataSchema(128), revision: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).optional(),
  refinement: z.literal(true).optional(),
  candidate: learningCandidateSchema.strict(),
});
export const curationDeltaSchema = z.strictObject({
  operationId: safeMetadataSchema(200), checkpointKey: safeMetadataSchema(200), taskId: safeMetadataSchema(200),
  workspace: safeMetadataSchema(120), entries: z.array(entrySchema).min(1).max(8),
});
const digest = (value: unknown) => 'sha256:' + createHash('sha256').update(stableDisclosureJson(value), 'utf8').digest('hex');
export const curationEntryFingerprint = (entry: CurationDelta['entries'][number]): string => digest(entry);
export const curationCandidateId = (operationId: string, entry: CurationDelta['entries'][number]): string =>
  'curation:' + digest([operationId, curationEntryFingerprint(entry)]).slice(7);
export function curationDeltaFingerprint(delta: CurationDelta): string { return digest(delta); }

/** Additive, bounded declarations. Validation does not turn source text or feedback into authority. */
export function validateCurationDelta(value: unknown): CurationDelta {
  if (Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8') > 8192) throw new Error('CURATION_DELTA_TOO_LARGE');
  const delta = curationDeltaSchema.parse(value) as CurationDelta;
  const seen = new Set<string>();
  for (const entry of delta.entries) {
    if (Buffer.byteLength(JSON.stringify(entry.candidate), 'utf8') > 2048) throw new Error('CURATION_CANDIDATE_TOO_LARGE');
    if (entry.candidate.evidenceRefs.length < 1 || entry.candidate.evidenceRefs.length > 8
      || entry.candidate.evidenceRefs.some(ref => !safeEvidenceRefSchema().safeParse(ref).success)) throw new Error('CURATION_EVIDENCE_INVALID');
    validateCandidate(entry.candidate);
    if (entry.kind === 'add-counterexample' && !entry.target) throw new Error('CURATION_TARGET_REQUIRED');
    if (entry.kind === 'add-lesson' && entry.target && !entry.refinement) throw new Error('CURATION_REFINEMENT_REQUIRED');
    if (entry.refinement && (!entry.target || entry.kind !== 'add-lesson')) throw new Error('CURATION_REFINEMENT_INVALID');
    const key = curationEntryFingerprint(entry);
    if (seen.has(key)) throw new Error('CURATION_DUPLICATE_ENTRY');
    seen.add(key);
  }
  return delta;
}

export function curationCandidates(delta: CurationDelta): LearningCandidate[] {
  return delta.entries.map(entry => ({ ...entry.candidate, candidateId: curationCandidateId(delta.operationId, entry),
    checkpointKey: delta.checkpointKey, workspace: delta.workspace }));
}
