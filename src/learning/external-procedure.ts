import * as z from 'zod/v4';
import { assertLearningTextSafe } from '../memory/safety.js';
import { safeEvidenceRefSchema } from './evaluation.js';

const text = z.string().min(1).max(1800).refine(value => Boolean(value.trim()), 'Nonblank text required');
const list = z.array(text).min(1).max(8);
const evidenceRef = z.string().max(1000).refine(value => value === value.trim()
  && safeEvidenceRefSchema().safeParse(value).success, 'Exact safe evidence reference required');
const example = z.strictObject({ situation: text, expected: text });
export const externalProcedureAdmissionSchema = z.strictObject({
  schemaVersion: z.literal(1), description: text, trigger: text,
  prerequisite: list, action: z.array(text).min(1).max(32), avoid: list,
  expectedConsequence: z.strictObject({ consequence: text, checker: text }),
  reversalOrStop: list,
  rollback: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('actions'), action: list }),
    z.strictObject({ kind: z.literal('not-applicable'), reason: text }),
  ]),
  cases: z.strictObject({ positive: z.array(example).min(1).max(4), negative: z.array(example).min(1).max(4), exception: z.array(example).min(1).max(4) }),
  provenanceRefs: z.array(evidenceRef).min(1).max(24),
  allowedTools: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,119}$/)).max(50),
  parameters: z.array(z.strictObject({ name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    source: evidenceRef, field: text, fallback: text })).max(16).optional(),
});
export type ExternalProcedureAdmission = z.infer<typeof externalProcedureAdmissionSchema>;
export const EXTERNAL_PROCEDURE_GUIDE = {
  revision: 'external-procedure-admission/v1',
  payload: 'schemaVersion=1; description, trigger, prerequisite:string[], action:string[], avoid:string[], expectedConsequence:{consequence,checker}, reversalOrStop:string[], rollback:{kind:actions,action:string[]}|{kind:not-applicable,reason}, cases:{positive,negative,exception:[{situation,expected}]}, provenanceRefs and allowedTools. Every section must be nonblank; allowedTools may be empty.',
  parameters: 'Optional parameters:[{name,source:<safe evidence reference>,field,fallback}]. Refer to each declared binding as {{name}}. source/field identify the lookup; fallback describes what to do when unavailable. This adapter stores the binding, never resolves it or stores an injected secret value.',
  preservation: 'Text is encoded as labelled JSON strings in the existing ordered steps. Negation, whitespace and repeated actions remain exact. Oversize contracts and known secret-shaped text are rejected, never truncated or silently redacted.',
  limits: 'Structured admission remains a candidate and grants no tool or policy authority. Existing qualification and meaningful replay still apply. No semantic-equivalence or automatic private-hostname detection is claimed. No-payload procedures retain the legacy path and are structurally incomplete under this guide.',
} as const;

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  return value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
}

export function parseExternalProcedureAdmission(payload: unknown): ExternalProcedureAdmission {
  const parsed = externalProcedureAdmissionSchema.safeParse(payload);
  if (!parsed.success) throw new Error('EXTERNAL_PROCEDURE_ADMISSION_INVALID: ' + parsed.error.issues.map(issue => issue.path.join('.')).join(', '));
  const value = parsed.data;
  assertLearningTextSafe(strings(value).join('\n'));
  const declared = (value.parameters ?? []).map(parameter => parameter.name);
  if (new Set(declared).size !== declared.length) throw new Error('EXTERNAL_PROCEDURE_PARAMETER_DUPLICATE');
  const references = strings(value).flatMap(item => [...item.matchAll(/\{\{([^{}]+)\}\}/g)].map(match => match[1]));
  if (references.some(name => !declared.includes(name))) throw new Error('EXTERNAL_PROCEDURE_PARAMETER_UNBOUND');
  if (declared.some(name => !references.includes(name))) throw new Error('EXTERNAL_PROCEDURE_PARAMETER_UNUSED');
  return value;
}

/** Encode original values inside JSON; existing contract trimming cannot alter their text. */
export function normalizeExternalProcedure(payload: unknown) {
  const value = parseExternalProcedureAdmission(payload);
  const entry = (label: string, item: unknown) => label + ': ' + JSON.stringify(item);
  const many = (label: string, items: readonly unknown[]) => items.map(item => entry(label, item));
  const steps = [
    entry('ADMISSION-VERSION', value.schemaVersion), entry('DESCRIPTION', value.description), entry('TRIGGER', value.trigger),
    ...many('PREREQUISITE', value.prerequisite), ...many('ACTION', value.action), ...many('AVOID', value.avoid),
    entry('EXPECTED-CONSEQUENCE', value.expectedConsequence.consequence), entry('CHECKER', value.expectedConsequence.checker),
    ...many('REVERSAL-OR-STOP', value.reversalOrStop), entry('ROLLBACK-KIND', value.rollback.kind),
    ...(value.rollback.kind === 'actions' ? many('ROLLBACK-ACTION', value.rollback.action) : [entry('ROLLBACK-NOT-APPLICABLE', value.rollback.reason)]),
    ...many('POSITIVE-CASE', value.cases.positive), ...many('NEGATIVE-CASE', value.cases.negative), ...many('EXCEPTION-CASE', value.cases.exception),
    ...many('LOOKUP-PARAMETER', value.parameters ?? []), ...many('PROVENANCE', value.provenanceRefs), entry('ALLOWED-TOOLS', value.allowedTools),
  ];
  const reuseCondition = entry('TRIGGER', value.trigger);
  if (steps.length > 50 || steps.some(step => step.length > 2000) || reuseCondition.length > 2000)
    throw new Error('EXTERNAL_PROCEDURE_CONTRACT_LIMIT_EXCEEDED');
  return { description: value.description, reuseCondition, steps, allowedTools: [...value.allowedTools], evidenceRefs: [...value.provenanceRefs],
    admission: { revision: EXTERNAL_PROCEDURE_GUIDE.revision, status: 'structured-candidate' as const,
      textPreservation: 'exact-json-values' as const, semanticEquivalence: 'not-assessed' as const, lookupResolution: 'not-performed' as const } };
}
