import { z } from 'zod';
import { sourceRefSchema, digestSchema, isoInstantSchema } from './experience-types.js';
import { disclosureDigest, stableDisclosureJson, serializeMemoryRecordView, MemoryControllerError, type ControllerScope } from './disclosure.js';
import { assertLearningTextSafe } from './safety.js';
import {fingerprintText} from './transaction.js';
import type { MemoryEpisodes } from './episodes.js';

const range = z.strictObject({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).refine(r => r.end > r.start);
const revision = z.string().min(1).max(120);
const operation = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
const receiptSchema = z.strictObject({
  schemaVersion: z.literal(1), kind: z.literal('external-derivation'), source: sourceRefSchema, sourceTextDigest: digestSchema,
  range, parserRevision: revision, normalizerRevision: revision, policyDigest: digestSchema, promptDigest: digestSchema,
  referenceTime: isoInstantSchema,
  declaredRole: z.enum(['user', 'assistant', 'tool', 'unknown']), declaredController: revision.optional(), declaredModel: revision.optional(),
  toolIdentity: z.strictObject({ callRef: revision, resultRef: revision }).optional(),
  claims: z.array(z.strictObject({ text: z.string().min(1).max(1000), range })).min(1).max(8),
  excludedRanges: z.array(range).max(16), lostRanges: z.array(range).max(16), corrections: z.array(sourceRefSchema).max(16),
  previous: sourceRefSchema.optional(), sourceValidation: z.enum(['available', 'unavailable']),
  observedController: z.literal('agent-core-external'), observedModel: z.null(), observedRole:z.literal('unknown'), observedToolIdentity:z.null(), semanticEquivalence: z.literal('unknown'),
  instructionAuthority: z.literal(false), interpretationDigest: digestSchema,
});
const write = receiptSchema.omit({ kind: true, sourceValidation: true, observedController: true, observedModel: true,
  observedRole:true,observedToolIdentity:true,semanticEquivalence: true, instructionAuthority: true, interpretationDigest: true }).extend({ operationId: operation });
const read = z.strictObject({ source: sourceRefSchema });
export const DERIVATION_GUIDE = {
  write: { tool: 'memory_v2_write', action: 'derivation', payload: ['schemaVersion:1', 'operationId', 'source', 'sourceTextDigest',
    'range:{start,end} (Unicode code points); sourceTextDigest=sha256 of exact UTF-8 source text', 'parserRevision', 'normalizerRevision', 'policyDigest', 'promptDigest', 'referenceTime',
    'declaredRole', 'claims:[{text,range}]', 'excludedRanges:[]', 'lostRanges:[]', 'corrections:[]', 'previous?:SourceRef'] },
  read: { tool: 'memory_v2_read', action: 'derivation', payload: ['source (receipt artifact)'] },
  limitations: 'Selected conclusions only; no hidden reasoning, whole chat capture, role authority or invented model identity. Different interpretation contracts create distinct receipts. Evidence availability is not semantic equivalence.',
} as const;

/** Receipts are ordinary scoped evidence artifacts owned by MemoryEpisodes. */
export class MemoryDerivations {
  constructor(private readonly episodes: MemoryEpisodes) {}
  async read(scope: ControllerScope, raw: unknown, assertCurrent?: () => void | Promise<void>) {
    this.external(scope); const input = read.parse(raw); await assertCurrent?.();
    const source = await this.episodes.expand(scope, input.source, 'evidence'); await assertCurrent?.();
    if (source.availability !== 'available') throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');
    return receiptSchema.parse(JSON.parse(source.text));
  }
  async write(scope: ControllerScope, raw: unknown, assertCurrent?: () => void | Promise<void>) {
    this.external(scope); const input = write.parse(raw); assertLearningTextSafe(stableDisclosureJson(input));
    await assertCurrent?.();
    let sourceValidation: 'available' | 'unavailable' = 'unavailable';
    try {
      const source = input.source.kind === 'memory'
        ? await this.episodes.promotionSnapshot(scope, async p => ({ text: serializeMemoryRecordView(await p.memory(input.source)), availability: 'available' as const }))
        : await this.episodes.expand(scope, input.source, input.source.kind === 'episode' ? 'episode' : 'evidence');
      if (source.availability === 'available') {
        const points = Array.from(source.text);
        if ('sha256:'+fingerprintText(source.text) !== input.sourceTextDigest || input.range.end > points.length
          || [...input.excludedRanges, ...input.lostRanges].some(r => r.end > points.length)
          || input.claims.some(c => c.range.start < input.range.start || c.range.end > input.range.end))
          throw new MemoryControllerError('MEMORY_REVISION_CONFLICT');
        sourceValidation = 'available';
      }
    } catch (error) {
      // Unavailable evidence remains unresolved; foreign scope and mismatched bytes must fail closed.
      if (!(error instanceof MemoryControllerError) || !['MEMORY_SOURCE_UNAVAILABLE'].includes(error.code)) throw error;
    }
    await assertCurrent?.();
    if (input.previous) await this.read(scope, { source: input.previous }, assertCurrent);
    if (input.corrections.length) await this.episodes.promotionSnapshot(scope, p => p.validate(input.corrections, true));
    const { operationId, ...metadata } = input;
    const receipt = receiptSchema.parse({ ...metadata, kind: 'external-derivation', sourceValidation,
      observedController: 'agent-core-external', observedModel: null, observedRole:'unknown',observedToolIdentity:null,semanticEquivalence: 'unknown', instructionAuthority: false,
      interpretationDigest: disclosureDigest(metadata) });
    await assertCurrent?.();
    const artifact = await this.episodes.captureEvidence(scope, { operationId,
      source: { kind: 'controller-text', text: stableDisclosureJson(receipt), originRef: 'external-derivation:' + receipt.interpretationDigest } },assertCurrent);
    await assertCurrent?.();
    return { artifact, interpretationDigest: receipt.interpretationDigest, sourceValidation, semanticEquivalence: 'unknown', executionAuthority: false };
  }
  private external(scope: ControllerScope) {
    if (scope.controllerId !== 'agent-core-external') throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
  }
}
