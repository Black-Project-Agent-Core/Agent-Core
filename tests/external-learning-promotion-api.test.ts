import path from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: {
  record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readFeatureOutcomes: () => [],
} }));
import { memoryTaskFixture } from './memory/memory-task-test-utils.js';
import { report } from './skill-proposal-fixture.js';
import { controllerLearning } from '../src/mcp/controller-learning-schemas.js';
import { registerControllerLearningTools } from '../src/mcp/controller-learning-tools.js';
import { installInvocationContext } from '../src/mcp/external-controller-tool-support.js';
import type { ExternalProcedureAdmission } from '../src/learning/external-procedure.js';
import * as workflowVerifier from '../src/memory/workflow-verifier.js';
import { readEvidenceSnapshot } from '../src/verification/evidence-snapshot.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve('runtime/tmp') || !path.basename(root).startsWith('memory-task-')) throw new Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true });
  }
});
function procedurePayload(): ExternalProcedureAdmission {
  return { schemaVersion: 1, description: 'Check the report approval.', trigger: 'A report is ready.',
    prerequisite: ['The report revision is available.'], action: ['Read the report.', 'Check the approval.', 'Read the report.'],
    avoid: ['Jangan kirim laporan tanpa persetujuan'], expectedConsequence: { consequence: 'The approval matches.', checker: 'Compare revisions.' },
    reversalOrStop: ['Stop on missing approval.'], rollback: { kind: 'not-applicable', reason: 'The procedure only reads evidence.' },
    cases: { positive: [{ situation: 'Matching approval.', expected: 'Check passes.' }], negative: [{ situation: 'Approval absent.', expected: 'Stop.' }],
      exception: [{ situation: 'Source unavailable.', expected: 'Wait for evidence.' }] },
    provenanceRefs: ['source:procedure-api-origin'], allowedTools: ['read_file'] };
}
async function fixture() {
  const f = await memoryTaskFixture(); roots.push(f.root);
  const ownerId = 'api-owner', sessionId = 'api-session';
  const task = await f.start(ownerId, sessionId, 'promotion-api');
  const verificationRef = await report(f.root, task.id);
  const captured = await f.external.captureToolInvocationContext({ invocationId: 'api-fixture-verification', processSessionId: 'api-fixture',
    sessionId, ownerId, taskScope: { taskId: task.id } });
  await f.external.verifyEpisode(sessionId, { taskId: task.id, outcome: 'verified', verificationRef }, captured);
  const facade = (session = sessionId) => {
    const tools = new Map<string, (args: unknown, ctx: unknown) => Promise<any>>();
    const server = { registerTool(name: string, _config: unknown, callback: any) { tools.set(name, callback); } };
    installInvocationContext(server as any, { external: f.external, sessionId: session, ownerId, checkpointGranted: false });
    registerControllerLearningTools(server as any, f.external, session, { ownerId, browserAllowed: false,
      workspaceIdentity: workspace => f.memory.registeredWorkspaceIdentity(workspace) });
    return async (input: unknown, signal?: AbortSignal) => tools.get('controller_learning')!(input, { mcpReq: { signal } });
  };
  const invoke = facade();
  const propose = { action: 'procedure', procedureOperation: 'propose', taskId: task.id, name: 'approval-review',
    workspace: 'agent-core', verificationRef, payload: procedurePayload() };
  return { ...f, task, ownerId, sessionId, verificationRef, facade, invoke, propose };
}
function decode(result: any) {
  expect(result.isError, JSON.stringify(result)).not.toBe(true);
  return JSON.parse(result.content[0].text);
}

describe.sequential('external promotion API contract', () => {
  it('rejects payload action confusion, mixed procedure contracts and missing host selectors', () => {
    const structured = { action: 'procedure', procedureOperation: 'propose', taskId: 'host-task', name: 'approval-review',
      verificationRef: 'verification:fixture', payload: procedurePayload() };
    expect(controllerLearning.safeParse(structured).success).toBe(true);
    for (const patch of [{ description: 'Another contract.' }, { steps: ['A different step.'] }, { allowedTools: [] },
      { reuseCondition: 'Another trigger.' }, { taskId: undefined }, { procedureOperation: 'list' }])
      expect(controllerLearning.safeParse({ ...structured, ...patch }).success, JSON.stringify(patch)).toBe(false);
    expect(controllerLearning.safeParse({ action: 'context', payload: {} }).success).toBe(false);
    expect(controllerLearning.safeParse({ action: 'improvement', payload: { operation: 'inspect' } }).success).toBe(false);
  });

  it('exposes the actual structured guides through controller status', async () => {
    const f = await fixture(); const result = decode(await f.invoke({ action: 'status' }));
    expect(result.externalGuides.procedure.revision).toBe('external-procedure-admission/v1');
    expect(result.externalGuides.evaluation.revision).toBe('external-evaluation/v1');
    expect(result.externalGuides.improvement.authority).toContain('never authenticated user consent');
    expect(result.featureOutcomeEvidence.benefitVerdict).toBe('withheld');
  });

  it('forwards explicit evaluation payload and keeps unexercised attempts and unknown identity visible', async () => {
    const f = await fixture(); const candidate = await f.start(f.ownerId, 'candidate-session', 'evaluation-unexercised');
    const context = { purpose: 'production', population: 'fixture/v1', controllerId: 'declared-controller', model: 'declared-model',
      loadedAssetRevision: 'declared-asset/v1', loadedConfigRevision: 'declared-config/v1', evaluatorRevision: 'declared-evaluator/v1',
      collectorRevision: 'declared-collector/v1', opportunityUnit: 'task', eligibleOpportunities: 1,
      window: { start: '2026-01-01T00:00:00Z', end: '2027-01-01T00:00:00Z' } };
    const payload = { schemaVersion: 1, minimumSamples: 1,
      baseline: { ...context, opportunities: [{ taskId: f.task.id, caseId: 'same-case' }] },
      candidate: { ...context, opportunities: [{ taskId: candidate.id, caseId: 'same-case' }] } };
    const result = decode(await f.invoke({ action: 'evaluate', workspace: 'agent-core', cohortId: 'api-cohort',
      baselineEpisodeIds: [f.task.id], candidateEpisodeIds: [candidate.id], payload }));
    expect(result.allAttempts.episodes).toBe(2); expect(result.comparison.candidate.allAttempts).toBe(1);
    expect(result.comparison.declaredManifest.candidate.model).toBe('declared-model');
    expect(result.comparison).toMatchObject({ status: 'insufficient', metadataAuthority: 'declaration-only', differences: null,
      productionScore: null, benefitVerdict: 'withheld' });
    expect(result.comparison.candidate.outcomes['evidence-unavailable']).toBe(1);
    const spoof = decode(await f.invoke({ action: 'evaluate', baselineEpisodeIds: [f.task.id], candidateEpisodeIds: [candidate.id],
      payload: { ...payload, hostVerified: true } }));
    expect(spoof.comparison.reasons).toContain('manifest-invalid'); expect(spoof.comparison.differences).toBeNull();
  });

  it('persists the structured procedure through the existing exact contract without losing negative conditions or duplicates', async () => {
    const f = await fixture();
    await readEvidenceSnapshot(f.verificationRef.slice('verification:'.length).split('#')[0]);
    expect(await workflowVerifier.recheckWorkflowReport(f.verificationRef, f.task.id)).toBe('pass');
    const result = decode(await f.invoke(f.propose));
    expect(result.admission).toMatchObject({ status: 'structured-candidate', textPreservation: 'exact-json-values', semanticEquivalence: 'not-assessed' });
    const values = (label: string) => result.steps.filter((step: string) => step.startsWith(label + ': ')).map((step: string) => JSON.parse(step.slice(label.length + 2)));
    expect(values('ACTION')).toEqual(f.propose.payload.action); expect(values('AVOID')).toEqual(f.propose.payload.avoid);
    expect(result.evidenceAttribution.supportTaskIds).toEqual([f.task.id]);
    const stored = (await f.learning.procedures('agent-core')).find(item => item.fingerprint === result.fingerprint);
    expect(stored?.steps).toEqual(result.steps); expect(stored?.status).toBe('candidate');
    expect(stored?.evidenceRefs).toContain('source:procedure-api-origin');
  });

  it('keeps the legacy proposal path compatible and labels its admission incomplete', async () => {
    const f = await fixture(); const { payload: _payload, ...base } = f.propose;
    const result = decode(await f.invoke({ ...base, name: 'legacy-review', description: 'Read the report.', steps: ['Read the report.'], allowedTools: ['read_file'] }));
    expect(result.admission).toMatchObject({ status: 'legacy-structurally-incomplete', semanticEquivalence: 'not-assessed' });
  });

  it.each(['procedure', 'improvement', 'improvement-secret'])('does not reconnect a task for invalid %s payload', async action => {
    const f = await fixture(); const newSession = 'new-invalid-' + action;
    await f.external.touchSession(newSession);
    const statePath = path.join(f.root, 'external/external-controller.json'), before = await readFile(statePath, 'utf8');
    const input = action === 'procedure' ? { ...f.propose, payload: {} }
      : { action: 'improvement', taskId: f.task.id, payload: action === 'improvement-secret'
        ? { operation: 'feedback', id: 'review-evidence', operationId: 'unsafe-feedback', expectedRevision: null,
          decision: 'accepted', reason: 'Use api_key=abcdefghijklmnop123456789.', evidenceRefs: ['source:response'] }
        : { operation: 'not-an-operation' } };
    const result = await f.facade(newSession)(input); expect(result.isError).toBe(true);
    expect(await readFile(statePath, 'utf8')).toBe(before);
  });

  it.each(['wrong-task', 'wrong-workspace', 'cancelled'])('refuses structured procedure %s without reaching persistence', async mode => {
    const f = await fixture(); const support = vi.spyOn(f.learning, 'supportProcedure'); const abort = new AbortController();
    if (mode === 'cancelled') {
      const original = f.external.getEpisode.bind(f.external);
      vi.spyOn(f.external, 'getEpisode').mockImplementationOnce(async (...args) => { const result = await original(...args); abort.abort(); return result; });
    }
    const result = await f.invoke({ ...f.propose,
      ...(mode === 'wrong-task' ? { taskId: 'another-host-task' } : {}),
      ...(mode === 'wrong-workspace' ? { workspace: 'another-workspace' } : {}) }, abort.signal);
    expect(result.isError).toBe(true); expect(support).not.toHaveBeenCalled();
    expect(await f.learning.procedures('agent-core')).toEqual([]);
  });

  it('refuses a task rotation during procedure catalog I/O before persisting support', async () => {
    const f = await fixture(); const original = f.learning.procedures.bind(f.learning);
    vi.spyOn(f.learning, 'procedures').mockImplementationOnce(async (...args) => {
      const result = await original(...args); await f.start(f.ownerId, f.sessionId, 'replacement-task'); return result;
    });
    const support = vi.spyOn(f.learning, 'supportProcedure');
    const result = await f.invoke(f.propose); expect(result.isError).toBe(true);
    expect(support).not.toHaveBeenCalled(); expect(await original('agent-core')).toEqual([]);
  });

  it.each([32, 33])('keeps the %s unique-reference boundary consistent when verification is also provenance', async count => {
    const f = await fixture();
    const payload = { ...f.propose.payload, provenanceRefs: Array.from({ length: 24 }, (_, index) => 'source:origin-' + index) };
    const evidenceRefs = [f.verificationRef, ...Array.from({ length: count - 25 }, (_, index) => 'source:extra-' + index)];
    const support = vi.spyOn(f.learning, 'supportProcedure');
    const result = await f.invoke({ ...f.propose, payload, evidenceRefs });
    if (count === 32) {
      const value = decode(result); expect(value.evidenceAttribution.supportTaskIds).toEqual([f.task.id]);
      expect(support.mock.calls[0][0].evidenceRefs).toHaveLength(32);
    } else {
      expect(result.isError).toBe(true); expect(support).not.toHaveBeenCalled();
      expect(await f.learning.procedures('agent-core')).toEqual([]);
    }
  });

  it.each(['rotated', 'cancelled'])('rechecks %s authority after independent verification and inside the support commit', async mode => {
    const f = await fixture(); const abort = new AbortController();
    const original = workflowVerifier.recheckWorkflowReport;
    vi.spyOn(workflowVerifier, 'recheckWorkflowReport').mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      if (mode === 'rotated') await f.start(f.ownerId, f.sessionId, 'replacement-during-oracle');
      else abort.abort();
      return result;
    });
    const support = vi.spyOn(f.learning, 'supportProcedure');
    const result = await f.invoke(f.propose, abort.signal);
    expect(result.isError).toBe(true); expect(support).toHaveBeenCalledOnce();
    expect(await f.learning.procedures('agent-core')).toEqual([]);
  });
});
