import { describe, expect, it } from 'vitest';
import { externalProcedureAdmissionSchema, normalizeExternalProcedure, parseExternalProcedureAdmission,
  type ExternalProcedureAdmission } from '../src/learning/external-procedure.js';

function fixture(): ExternalProcedureAdmission {
  return {
    schemaVersion: 1, description: 'Validate a report before publication', trigger: 'A report is ready for review.',
    prerequisite: ['The report and its approval record are available.'],
    action: ['Read the report.', 'Check the approval record.', 'Read the report.'],
    avoid: ['Jangan kirim laporan tanpa persetujuan.'],
    expectedConsequence: { consequence: 'The reviewed report has matching approval evidence.', checker: 'Compare the report revision with the approval revision.' },
    reversalOrStop: ['Stop when the approved revision differs from the report.'],
    rollback: { kind: 'not-applicable', reason: 'This procedure only reads and checks the report.' },
    cases: {
      positive: [{ situation: 'Approval matches the report revision.', expected: 'The check passes.' }],
      negative: [{ situation: 'No approval exists.', expected: 'Stop publication.' }],
      exception: [{ situation: 'The approval source is unavailable.', expected: 'Stop and request an available approval record.' }],
    },
    provenanceRefs: ['source:report-review-fixture'], allowedTools: ['read_file'],
  };
}
function values(steps: readonly string[], label: string): unknown[] {
  return steps.filter(step => step.startsWith(label + ': ')).map(step => JSON.parse(step.slice(label.length + 2)));
}

describe('external structured procedure admission', () => {
  it('preserves action order and duplicates, conditions and provenance in the existing contract', () => {
    const input = fixture(), result = normalizeExternalProcedure(input);
    expect(values(result.steps, 'ACTION')).toEqual(input.action);
    expect(values(result.steps, 'PREREQUISITE')).toEqual(input.prerequisite);
    expect(values(result.steps, 'AVOID')).toEqual(input.avoid);
    expect(values(result.steps, 'EXPECTED-CONSEQUENCE')).toEqual([input.expectedConsequence.consequence]);
    expect(values(result.steps, 'CHECKER')).toEqual([input.expectedConsequence.checker]);
    expect(values(result.steps, 'REVERSAL-OR-STOP')).toEqual(input.reversalOrStop);
    expect(values(result.steps, 'ROLLBACK-NOT-APPLICABLE')).toEqual([(input.rollback as { reason: string }).reason]);
    expect(values(result.steps, 'PROVENANCE')).toEqual(input.provenanceRefs);
    expect(result.allowedTools).toEqual(input.allowedTools); expect(result.evidenceRefs).toEqual(input.provenanceRefs);
    expect(result.admission).toMatchObject({ status: 'structured-candidate', semanticEquivalence: 'not-assessed', lookupResolution: 'not-performed' });
  });

  it('retains positive, negative and exception cases without claiming they were executed', () => {
    const input = fixture(), result = normalizeExternalProcedure(input);
    for (const [name, label] of [['positive', 'POSITIVE-CASE'], ['negative', 'NEGATIVE-CASE'], ['exception', 'EXCEPTION-CASE']] as const)
      expect(values(result.steps, label)).toEqual(input.cases[name]);
  });

  it('keeps the provided negation fixtures distinct byte for byte', () => {
    const first = fixture(), second = fixture();
    first.avoid = ['Kirim laporan tanpa persetujuan']; second.avoid = ['Jangan kirim laporan tanpa persetujuan'];
    const left = normalizeExternalProcedure(first), right = normalizeExternalProcedure(second);
    expect(left.steps).not.toEqual(right.steps);
    expect(values(left.steps, 'AVOID')).toEqual(first.avoid); expect(values(right.steps, 'AVOID')).toEqual(second.avoid);
  });

  it('does not mistake compatible wording for a semantic polarity verdict', () => {
    const first = fixture(), second = fixture();
    first.avoid = ['boleh kirim setelah persetujuan']; second.avoid = ['jangan kirim tanpa persetujuan'];
    expect(normalizeExternalProcedure(first).admission.semanticEquivalence).toBe('not-assessed');
    expect(normalizeExternalProcedure(second).admission.semanticEquivalence).toBe('not-assessed');
  });

  it('preserves leading whitespace, newlines, quotes and repeated tools instead of silently trimming values', () => {
    const input = fixture(); input.action = ['  Check "approved".\nDo not publish.  ', '\\read\\report', '  Check "approved".\nDo not publish.  '];
    input.allowedTools = ['read_file', 'read_file'];
    const result = normalizeExternalProcedure(input);
    expect(values(result.steps.map(step => step.trim()), 'ACTION')).toEqual(input.action);
    expect(values(result.steps, 'ALLOWED-TOOLS')).toEqual([input.allowedTools]);
  });

  it.each(['trigger', 'prerequisite', 'action', 'avoid', 'expectedConsequence', 'reversalOrStop', 'rollback', 'cases', 'provenanceRefs'] as const)
    ('rejects a missing %s section rather than guessing it', key => {
      const input: any = fixture(); delete input[key];
      expect(() => normalizeExternalProcedure(input)).toThrow('EXTERNAL_PROCEDURE_ADMISSION_INVALID');
    });

  it('requires a rollback action list or an explicit nonblank not-applicable reason', () => {
    const input = fixture(); input.rollback = { kind: 'actions', action: ['Restore the original report.', 'Verify the original digest.'] };
    expect(values(normalizeExternalProcedure(input).steps, 'ROLLBACK-ACTION')).toEqual(input.rollback.action);
    expect(() => normalizeExternalProcedure({ ...input, rollback: { kind: 'not-applicable', reason: '  ' } })).toThrow('EXTERNAL_PROCEDURE_ADMISSION_INVALID');
  });

  it('records an explicit lookup source, field and fallback without resolving or substituting it', () => {
    const input = fixture(); input.action = ['Read the report from {{report_host}}.', 'Check its approval record.'];
    input.parameters = [{ name: 'report_host', source: 'file:authorized-report-config', field: 'reportHost', fallback: 'Stop if the authorized lookup is unavailable.' }];
    const result = normalizeExternalProcedure(input);
    expect(values(result.steps, 'ACTION')).toEqual(input.action);
    expect(values(result.steps, 'LOOKUP-PARAMETER')).toEqual(input.parameters);
    expect(result.admission.lookupResolution).toBe('not-performed');
  });

  it('refuses unbound, unused and duplicate lookup parameters', () => {
    const input = fixture(); input.action = ['Read {{report_host}}.'];
    expect(() => parseExternalProcedureAdmission(input)).toThrow('EXTERNAL_PROCEDURE_PARAMETER_UNBOUND');
    input.parameters = [{ name: 'report_host', source: 'file:authorized-report-config', field: 'reportHost', fallback: 'Stop.' }];
    input.parameters.push(input.parameters[0]);
    expect(() => parseExternalProcedureAdmission(input)).toThrow('EXTERNAL_PROCEDURE_PARAMETER_DUPLICATE');
    input.parameters.pop(); input.action = ['Read the report.'];
    expect(() => parseExternalProcedureAdmission(input)).toThrow('EXTERNAL_PROCEDURE_PARAMETER_UNUSED');
  });

  it('refuses secret-shaped constants in procedure text or fallback without lossy redaction', () => {
    const input = fixture(); input.action = ['Set api_key=abcdefghijklmnop123456789.'];
    expect(() => normalizeExternalProcedure(input)).toThrow('LEARNING_SAFETY_REJECTED: credential');
    input.action = ['Read {{report_host}}.'];
    input.parameters = [{ name: 'report_host', source: 'file:authorized-report-config', field: 'reportHost', fallback: 'Use Bearer abcdefghijklmnop123456789' }];
    expect(() => normalizeExternalProcedure(input)).toThrow('LEARNING_SAFETY_REJECTED: credential');
    expect(input.parameters[0].fallback).toBe('Use Bearer abcdefghijklmnop123456789');
  });

  it('rejects oversize encoded text and too many normalized steps without truncating actions', () => {
    const input = fixture(); input.action = ['\\'.repeat(1500)];
    expect(() => normalizeExternalProcedure(input)).toThrow('EXTERNAL_PROCEDURE_CONTRACT_LIMIT_EXCEEDED');
    input.action = Array.from({ length: 32 }, (_, index) => 'Action ' + index); input.prerequisite = Array(8).fill('Prerequisite.'); input.avoid = Array(8).fill('Avoid an unapproved report.');
    expect(() => normalizeExternalProcedure(input)).toThrow('EXTERNAL_PROCEDURE_CONTRACT_LIMIT_EXCEEDED');
    expect(input.action).toHaveLength(32);
  });

  it('refuses undeclared keys and does not reinterpret legacy input as complete admission', () => {
    expect(externalProcedureAdmissionSchema.safeParse({ ...fixture(), automaticApproval: true }).success).toBe(false);
    expect(() => normalizeExternalProcedure({ description: 'Legacy procedure', steps: ['Read a report.'] })).toThrow('EXTERNAL_PROCEDURE_ADMISSION_INVALID');
  });
});
