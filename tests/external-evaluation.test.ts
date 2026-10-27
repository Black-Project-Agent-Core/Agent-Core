import { describe, expect, it } from 'vitest';
import type { TrackerEvent } from '../src/tracker/activity-tracker.js';
import { evaluateExternalComparison, externalEvaluationManifestSchema, projectExternalFeatureOutcomes,externalFeatureOutcomeProposals,
  type ExternalEvaluationEpisode, type ExternalEvaluationManifest, type ExternalEvaluationObservation } from '../src/learning/external-evaluation.js';

function fixture() {
  const context = { purpose: 'production' as const, population: 'frozen-cases/v1', controllerId: 'external-fixture',
    model: 'fixture-model/v1', loadedAssetRevision: 'asset/v1', loadedConfigRevision: 'config/v1',
    evaluatorRevision: 'oracle/v1', collectorRevision: 'collector/v1' };
  const window = { start: '2026-10-22T00:00:00Z', end: '2026-10-22T01:00:00Z' };
  const arm = (prefix: string) => ({ ...context, window, opportunityUnit: 'task' as const, eligibleOpportunities: 2,
    opportunities: [1, 2].map(index => ({ taskId: prefix + index, caseId: 'case-' + index })) });
  const manifest: ExternalEvaluationManifest = { schemaVersion: 1, minimumSamples: 2, baseline: arm('b'), candidate: arm('c') };
  const episodes: ExternalEvaluationEpisode[] = ['b1', 'b2', 'c1', 'c2'].map(id => ({ id,
    startedAt: '2026-10-22T00:10:00Z', terminalOutcome: id === 'c2' ? 'failed' : 'verified',
    verificationStatus: id === 'c2' ? 'fail' : 'pass' }));
  const observations: ExternalEvaluationObservation[] = (['baseline', 'candidate'] as const).flatMap(armName =>
    manifest[armName].opportunities.map(opportunity => ({ ...context, arm: armName, ...opportunity,
      observedAt: '2026-10-22T00:15:00Z', evidenceRef: 'verification:isolated-harness-' + opportunity.taskId })));
  return { manifest, episodes, observations, evaluate: () => evaluateExternalComparison(episodes, manifest, { observations }) };
}

describe('external comparable evaluation', () => {
  it('withholds legacy or caller-only metadata without manufacturing observed identity', () => {
    const f = fixture();
    const legacy = evaluateExternalComparison(f.episodes);
    expect(legacy.status).toBe('insufficient'); expect(legacy.reasons).toContain('manifest-unavailable');
    const declared = evaluateExternalComparison(f.episodes, f.manifest);
    expect(declared.status).toBe('insufficient'); expect(declared.metadataAuthority).toBe('declaration-only');
    expect(declared.declaredManifest).toEqual(f.manifest); expect(declared.differences).toBeNull();
    expect(declared.productionScore).toBeNull(); expect(declared.benefitVerdict).toBe('withheld');
    expect(externalEvaluationManifestSchema.safeParse({ ...f.manifest, hostVerified: true }).success).toBe(false);
  });

  it('keeps the signed regression and missing cost/time unavailable', () => {
    const result = fixture().evaluate();
    expect(result.status).toBe('comparable'); expect(result.reasons).toEqual([]);
    expect(result.baseline.allAttempts).toBe(2); expect(result.candidate.verifiedOpportunities).toBe(2);
    expect(result.differences).toEqual({ allAttemptsSuccessRateDelta: -0.5, verifiedSuccessRateDelta: -0.5,
      costUsdPerTaskDelta: null, timeMsPerTaskDelta: null });
    expect(result.productionScore).toBe(-0.5); expect(result.benefitVerdict).toBe('withheld');
  });

  it.each(['model', 'evaluatorRevision', 'collectorRevision', 'controllerId', 'population', 'purpose'] as const)
    ('rejects a changed %s before computing differences', key => {
      const f = fixture(); (f.manifest.candidate as any)[key] = key === 'purpose' ? 'exploration' : 'changed/v2';
      const result = f.evaluate(); expect(result.status).toBe('incomparable');
      expect(result.reasons).toContain('declared-' + key + '-mismatch'); expect(result.differences).toBeNull();
    });

  it('does not turn exploration into a production score', () => {
    const f = fixture();
    f.manifest.baseline.purpose = f.manifest.candidate.purpose = 'exploration';
    f.observations.forEach(item => { item.purpose = 'exploration'; });
    const result = f.evaluate(); expect(result.status).toBe('comparable');
    expect(result.purpose).toBe('exploration'); expect(result.productionScore).toBeNull();
  });

  it('includes provider outage in all attempts without treating it as method failure', () => {
    const f = fixture(); f.manifest.minimumSamples = 1;
    f.observations.find(item => item.taskId === 'c2')!.cause = 'infrastructure-failure';
    const result = f.evaluate(); expect(result.status).toBe('comparable');
    expect(result.candidate.allAttempts).toBe(2); expect(result.candidate.verifiedOpportunities).toBe(1);
    expect(result.candidate.outcomes['infrastructure-failure']).toBe(1);
    expect(result.candidate.outcomes['method-failure']).toBe(0);
    expect(result.differences?.allAttemptsSuccessRateDelta).toBe(-0.5);
    expect(result.differences?.verifiedSuccessRateDelta).toBe(0);
  });

  it('does not omit unverified, interrupted or unexercised attempts', () => {
    for (const cause of ['evidence-unavailable', 'interrupted', 'not-exercised', 'unknown'] as const) {
      const f = fixture(); f.manifest.minimumSamples = 1;
      Object.assign(f.episodes[3], { terminalOutcome: undefined, verificationStatus: undefined });
      f.observations[3].cause = cause;
      const result = f.evaluate(); expect(result.candidate.allAttempts).toBe(2);
      expect(result.candidate.outcomes[cause]).toBe(1); expect(result.candidate.outcomes['method-failure']).toBe(0);
    }
  });

  it('requires actual loaded revisions and complete membership and coverage', () => {
    const f = fixture(); f.observations[3].loadedAssetRevision = 'actually-loaded/v0';
    expect(f.evaluate().reasons).toContain('candidate-observed-context-mismatch');
    f.observations[3].loadedAssetRevision = 'asset/v1'; f.manifest.candidate.eligibleOpportunities = 3;
    expect(f.evaluate().reasons).toContain('candidate-attempt-coverage-incomplete');
    f.manifest.candidate.eligibleOpportunities = 2; f.observations.pop();
    expect(f.evaluate().reasons).toContain('candidate-observed-coverage-incomplete');
    const mismatch = evaluateExternalComparison(f.episodes, f.manifest, { observations: f.observations,
      selection: { baselineEpisodeIds: ['b1', 'b2'], candidateEpisodeIds: ['c1'] } });
    expect(mismatch.reasons).toContain('candidate-membership-mismatch'); expect(mismatch.differences).toBeNull();
  });

  it('refuses missing case coverage, unknown metadata, window drift and overlapping tasks', () => {
    const cases = fixture(); cases.manifest.candidate.opportunities[1].caseId = 'other-case';
    expect(cases.evaluate().reasons).toContain('case-population-coverage-mismatch');
    const unknown = fixture(); unknown.manifest.baseline.model = unknown.manifest.candidate.model = 'unknown';
    unknown.observations.forEach(item => { item.model = 'unknown'; });
    expect(unknown.evaluate().status).toBe('insufficient');
    const window = fixture(); window.observations[0].observedAt = '2026-10-23T00:00:00Z';
    expect(window.evaluate().reasons).toContain('baseline-time-window-mismatch');
    const overlap = fixture(); overlap.manifest.candidate.opportunities[0].taskId = 'b1';
    expect(overlap.evaluate().reasons).toContain('duplicate-or-overlapping-tasks');
  });

  it('uses measured values only when every opportunity has them', () => {
    const f = fixture(); f.observations.forEach(item => { item.measuredCostUsd = item.arm === 'baseline' ? 2 : 3; item.measuredTimeMs = 100; });
    expect(f.evaluate().differences?.costUsdPerTaskDelta).toBe(1);
    delete f.observations[0].measuredCostUsd;
    expect(f.evaluate().differences?.costUsdPerTaskDelta).toBeNull();
  });

  it('deduplicates repeated episode rows and refuses repeated declared opportunities', () => {
    const f = fixture();
    const repeated = evaluateExternalComparison(Array.from({ length: 10 }, () => f.episodes).flat(), f.manifest, { observations: f.observations });
    expect(repeated).toEqual(f.evaluate());
    f.manifest.candidate.opportunities.push(f.manifest.candidate.opportunities[0]);
    const result = f.evaluate(); expect(result.status).toBe('incomparable'); expect(result.candidate.allAttempts).toBe(2);
  });
});

describe('external-only feature outcome projection', () => {
  const event = (id: string, outcome = 'success', taskId = 'task-a'): TrackerEvent => ({ id, timestamp: '2026-10-22T00:00:00Z', time: '00:00',
    module: 'TEST', level: 'info', message: 'Isolated outcome', source: 'node', kind: 'feature-outcome',
    context: { binding: 'bound', taskId }, featureOutcome: { featureId: 'fixture-feature', outcome, properties: { artifactRevision: 'asset/v1' } } });

  it('does not turn ten events or retries for one task into independent opportunities', () => {
    const tasks: ExternalEvaluationEpisode[] = [{ id: 'task-a', startedAt: '2026-10-22T00:00:00Z', terminalOutcome: 'verified', verificationStatus: 'pass' }];
    const once = projectExternalFeatureOutcomes([event('once')], tasks);
    expect(projectExternalFeatureOutcomes(Array.from({ length: 10 }, (_, i) => event(String(i))), tasks)).toEqual(once);
    expect(once.groups[0].opportunities).toBe(1); expect(once.groups[0].outcomes['goal-success']).toBe(1);
  });

  it('keeps outage and evidence missing separate from method negatives, with legacy unknown', () => {
    const legacy = event('legacy'); delete legacy.context;
    const result = projectExternalFeatureOutcomes([event('outage', 'provider-outage'), event('missing', 'unavailable', 'task-b'), legacy]);
    expect(result.legacyUnknownEvents).toBe(1); expect(result.groups[0].opportunities).toBe(2);
    expect(result.groups[0].outcomes['infrastructure-failure']).toBe(1);
    expect(result.groups[0].outcomes['evidence-unavailable']).toBe(1); expect(result.groups[0].outcomes['method-failure']).toBe(0);
    expect(projectExternalFeatureOutcomes([event('unsupported-success')]).groups[0].outcomes.unknown).toBe(1);
  });
  it('curates external method evidence by independent tasks, preserves default pool separately and withholds unknown outcomes',()=>{
    const episodes:ExternalEvaluationEpisode[]=['task-a','task-b'].map(id=>({id,startedAt:'2026-10-22T00:00:00Z',terminalOutcome:'failed',verificationStatus:'fail'}));
    const failures=[event('one','failure'),event('two','failure','task-b')];
    const once=externalFeatureOutcomeProposals(failures,episodes);
    expect(once[0].support).toEqual({positive:0,negative:2,score:-0.5});
    expect(externalFeatureOutcomeProposals(Array.from({length:10},()=>failures).flat(),episodes)[0].support).toEqual(once[0].support);
    expect(externalFeatureOutcomeProposals([event('one','unavailable'),event('two','provider-outage','task-b')],episodes)).toEqual([]);
    expect(projectExternalFeatureOutcomes([event('ambiguous','unclassified')],episodes).groups[0].outcomes.unknown).toBe(1);
  });
});
