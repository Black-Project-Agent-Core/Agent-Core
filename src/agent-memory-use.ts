import { safeEvidenceRefSchema } from './learning/evaluation.js';

export interface AgentMemoryUse {
  memoryId: string;
  title: string;
  applicability: 'applied' | 'adapted' | 'rejected';
  evidenceRefs: string[];
  verification: 'pass' | 'fail' | 'unavailable';
}

/** Bounded presentation metadata from committed use receipts, never a benefit score. */
export function normalizeMemoryUse(raw: unknown): AgentMemoryUse[] {
  if (!Array.isArray(raw)) return [];
  const text = (value: unknown, max: number) => typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
  return raw.slice(-12).flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const memoryId = text(value.memoryId, 128);
    if (!memoryId || !['applied', 'adapted', 'rejected'].includes(value.applicability)) return [];
    const evidenceRefs: string[] = Array.isArray(value.evidenceRefs)
      ? [...new Set<string>(value.evidenceRefs.filter((ref: unknown): ref is string =>
          typeof ref === 'string' && ref.length <= 1_000 && safeEvidenceRefSchema().safeParse(ref).success))].slice(0, 8) : [];
    return [{ memoryId, title: text(value.title, 200) || memoryId,
      applicability: value.applicability as AgentMemoryUse['applicability'], evidenceRefs,
      verification: ['pass', 'fail'].includes(value.verification)
        ? value.verification as 'pass' | 'fail' : 'unavailable' as const }];
  });
}
