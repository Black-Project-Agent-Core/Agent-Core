import type { DecisionRecord } from './decision-review.js';
import { redactSensitiveString } from '../security/redaction.js';

export interface DecisionEvidenceItem {
  id: string;
  question: string;
  assumptions: Array<{ statement: string; basis: string }>;
  alternatives: Array<{ id: string; claim: string; check: string; falsifier: string; status: string }>;
  summary: string;
  evidenceRefs: string[];
  assessedAt?: string;
}
export interface DecisionEvidence {
  status: 'available' | 'unavailable';
  taskId: string;
  records: DecisionEvidenceItem[];
  truncated: boolean;
  attribution: 'controller-declared';
  goalVerification: 'not-established';
}

/** Read model only: declarations/findings do not establish semantic truth or a verified goal. */
export function projectDecisionEvidence(records: DecisionRecord[], binding: { taskId: string; workspace: string }): DecisionEvidence {
  const output: DecisionEvidence = { status: 'unavailable', taskId: binding.taskId, records: [], truncated: false,
    attribution: 'controller-declared', goalVerification: 'not-established' };
  const text = (value: string, limit: number) => {
    const clean = redactSensitiveString(value);
    if (Array.from(clean).length > limit) output.truncated = true;
    return Array.from(clean).slice(0, limit).join('');
  };
  const scoped = records.filter(record => record.taskId === binding.taskId && record.workspace === binding.workspace);
  for (const record of scoped.slice(-3).reverse()) {
    const declaration = record.declaration, inquiry = declaration.inquiry, assessment = record.assessments.at(-1);
    const evidenceRefs = [...new Set([...(assessment?.observationRefs ?? []), ...(assessment?.actionRefs ?? []),
      ...declaration.context.flatMap(row => row.evidenceRefs), ...(inquiry?.assumptions.flatMap(row => row.evidenceRefs) ?? []),
      ...(inquiry?.alternatives.flatMap(row => row.evidenceRefs) ?? []),
      ...(assessment?.inquiryFindings?.flatMap(row => row.evidenceRefs) ?? [])])];
    if (evidenceRefs.length > 8) output.truncated = true;
    const item: DecisionEvidenceItem = { id: text(declaration.id, 160), question: text(inquiry?.question ?? declaration.goal, 500),
      assumptions: (inquiry?.assumptions ?? []).map(row => ({ statement: text(row.statement, 200), basis: row.basis })),
      alternatives: (inquiry?.alternatives ?? []).map(row => ({ id: text(row.id, 160), claim: text(row.claim, 200),
        check: text(row.distinguishingObservation, 200), falsifier: text(row.falsifier, 200),
        status: assessment?.inquiryFindings?.find(finding => finding.alternativeId === row.id)?.status ?? 'unresolved' })),
      summary: text(assessment?.summary ?? 'No assessment recorded.', 500),
      evidenceRefs: evidenceRefs.slice(0, 8).map(ref => text(ref, 300)),
      ...(assessment ? { assessedAt: assessment.assessedAt } : {}) };
    if (Buffer.byteLength(JSON.stringify({ ...output, records: [...output.records, item] }), 'utf8') > 4096) {
      output.truncated = true;
      continue;
    }
    output.records.push(item);
  }
  if (scoped.length > output.records.length) output.truncated = true;
  if (output.records.length) output.status = 'available';
  return output;
}
