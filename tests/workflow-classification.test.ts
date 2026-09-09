import { describe, expect, it } from 'vitest';
import { classifyWorkflowInput, classificationProvenance } from '../src/workflow/classification.js';

describe('requested workflow classification', () => {
  it.each([
    'Verify craft, DAG and HTTPS that have been tested; evidence in reports/workflow-implementation-20260909',
    'Review donor retry.py and explain the already implemented retry behavior',
    'Verify that the code and craft integration from retry.py passed its tests',
    'Craft, DAG and HTTPS have been tested against retry.py',
    'Jangan implement retry dari donor retry.py; jelaskan hasil pengujian',
    'Do not adapt retry from donor retry.py; verify the existing output',
    'Explain why "Implement retry from donor retry.py" was previously requested',
    'Status: implement retry from donor retry.py was completed',
    'Do not adapt retry from donor retry.py and integrate the native endpoint',
    'Jangan ambil retry dari donor retry.py lalu integrasikan ke endpoint',
  ])('keeps retrospective, quoted, read-only or negated text outside new implementation: %s', brief => {
    expect(classifyWorkflowInput({ brief }, 1).result).toEqual({ craftRequired: false, dagRequired: false, planRequired: false });
  });

  it.each([
    'Implement retry from donor retry.py',
    'Ambil mekanisme dari file retry.ts lalu integrasikan',
    'Review donor retry.go then implement the feature',
    'Review donor referensi/retry then implement feature',
    'Please adapt retry from "E:\\repo\\retry.py" into a TypeScript module',
    'Can you implement retry from donor https://example.com/retry.git and test the native endpoint',
    'Port retry.py retry behavior into a native async implementation',
    'Implement retry from the previously tested donor file retry.py',
    'Craft retry from the previously tested donor retry.py',
    'Craft retry from donor retry.py that was tested',
    '- Implement retry from donor retry.py',
    '* Implement retry from donor retry.py',
  ])('requires grounded craft for an affirmative donor-and-feature request: %s', brief => {
    const result = classifyWorkflowInput({ brief, workflow: 'direct' }, 1);
    expect(result.result).toEqual({ craftRequired: true, dagRequired: true, planRequired: true });
    expect(result.reasons).toContain('REQUESTED_SOURCE_ADAPTATION');
  });

  it('does not promote unrelated report paths or feature names into a donor', () => {
    expect(classifyWorkflowInput({ brief: 'Implement craft workflow in src/workflow/service.ts' }, 1).result)
      .toEqual({ craftRequired: false, dagRequired: false, planRequired: true });
    expect(classifyWorkflowInput({ brief: 'Implement retry in retry.py', context: 'Prior craft and HTTPS verification results are in reports/acceptance.json' }, 1).result.craftRequired).toBe(false);
    expect(classifyWorkflowInput({ brief: 'Implement endpoint in server.ts and explain previous port from donor old/retry.py' }, 1).result.craftRequired).toBe(false);
    expect(classifyWorkflowInput({ brief: 'Implement endpoint from docs/spec.md' }, 1).result.craftRequired).toBe(false);
    expect(classifyWorkflowInput({ brief: 'Build health report from logs/current.log' }, 1).result.craftRequired).toBe(false);
    expect(classifyWorkflowInput({ brief: 'Adapt mechanism from explicit donor docs/spec.md' }, 1).result.craftRequired).toBe(true);
    expect(classifyWorkflowInput({ brief: 'Implement retry from repository referensi/retry' }, 1).result.craftRequired).toBe(true);
    expect(classifyWorkflowInput({ brief: 'Fix a typo; implement authentication' }, 1).result.planRequired).toBe(true);
  });

  it('accepts actual instructions in context but ignores quoted source instructions', () => {
    expect(classifyWorkflowInput({ brief: 'Please handle this request', context: 'Implement retry from donor referensi/retry and integrate the native endpoint' }, 1).result.craftRequired).toBe(true);
    expect(classifyWorkflowInput({ brief: 'Verify current behavior', context: '> Implement retry from donor retry.py\n```text\nImplement retry from donor retry.py\n```' }, 1).result.craftRequired).toBe(false);
  });

  it('keeps explicit verification DAG and explicit structured craft authoritative', () => {
    const verification = classifyWorkflowInput({ brief: 'Verify current behavior', workflow: 'dag' }, 1);
    expect(verification.result).toEqual({ craftRequired: false, dagRequired: true, planRequired: true });
    expect(classifyWorkflowInput({ brief: 'Continue', workflow: 'direct', craft: { requirements: [{ id: 'retry', description: 'Bound attempts' }], donors: [{ id: 'donor', source: 'retry.py' }] } }, 1).result)
      .toEqual({ craftRequired: true, dagRequired: true, planRequired: true });
  });

  it('retains the actual resumed instruction that established a sticky obligation', () => {
    const first = classifyWorkflowInput({ brief: 'Verify existing behavior', workflow: 'dag' }, 1);
    const original = classificationProvenance(undefined, null, first);
    const elevated = classifyWorkflowInput({ brief: 'Implement retry from donor retry.py', context: 'Preserve final error', workflow: 'direct' }, 2);
    const next = classificationProvenance(original, { ...first.result, version: 1, stateHash: 'a'.repeat(64) }, elevated);
    const resumed = classificationProvenance(next, { ...elevated.result, version: 2, stateHash: 'b'.repeat(64) }, classifyWorkflowInput({ brief: 'Continue' }, 3));
    expect(resumed.obligations.craftRequired).toMatchObject({ brief: elevated.brief, context: elevated.context, inputHash: elevated.inputHash });
    expect(resumed.obligations.dagRequired?.inputHash).toBe(first.inputHash);
    expect(resumed.latest.brief).toBe('Continue');
    expect(resumed.legacy).toBeUndefined();
  });

  it('identifies unproven legacy flags without retroactively inventing a trigger', () => {
    const legacy = { craftRequired: true, dagRequired: true, planRequired: true, version: 2, stateHash: 'c'.repeat(64) };
    const provenance = classificationProvenance(undefined, legacy, classifyWorkflowInput({ brief: 'Verify existing results' }, 3));
    expect(provenance.legacy).toEqual(legacy);
    expect(provenance.obligations.craftRequired).toBeUndefined();
    expect(provenance.latest.result.craftRequired).toBe(false);
  });
});
