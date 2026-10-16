import { expect, it } from 'vitest';
import { input, load, report, temp, run, readJSON } from './memory/evaluation/helpers/retrieval-report-fixtures.js';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
async function fixture(scores = [2, 8, 5]) {
  const { deriveRetrievalProfile } = await load('retrieval-profile');
  const baseline = Array(10).fill(false);
  const manifest: any = { schemaVersion: 1, protocol: { id: 'curve-protocol',
    splits: { train: [], validation: baseline.map((_, i) => 'q' + i), holdout: [] },
    trainingExposure: { status: 'not-established', evidenceRefs: [] } },
    runs: scores.map((_, i) => ({ id: 'r' + i, iteration: i * 3, checkpoint: 'c' + i,
      split: 'validation', status: 'evaluable', report: 'report-' + i })) };
  const evidence = scores.map((n, i) => { const f = input(baseline, baseline.map((_, k) => k < n),
    { experimentId: 'e' + i, candidateRevision: 'v' + i });
    return { id: 'r' + i, status: 'evaluable', profile: deriveRetrievalProfile(f.c, f.o, f.score) }; });
  const config: any = { metric: 'candidateRate', direction: 'maximize',
    streams: [{ id: 's', runIds: scores.map((_, i) => 'r' + i), evidenceRefs: ['source:declared-order'] }] };
  return { manifest, evidence, config };
}
it('computes the donor prefix-mean convention without calling it trapezoidal area', async () => {
  const { analyzeRetrievalCurve } = await load('retrieval-curve'); const f = await fixture();
  const before = JSON.stringify(f); const result = analyzeRetrievalCurve(f.manifest, f.evidence, f.config);
  expect(result.streams[0].metrics).toMatchObject({ initial: 0.2, latest: 0.5, best: 0.8, bestRunId: 'r1' });
  expect(result.streams[0].metrics.latestMinusInitial).toBeCloseTo(0.3, 14);
  expect(result.streams[0].metrics.prefixMeanScore).toBeCloseTo(0.4, 14);
  expect(result.axis).toBe('checkpoint-order'); expect(result.approvalAuthority).toBe(false);
  expect(result.stopsExecution).toBe(false); expect(result.launchesExperiments).toBe(false);
  expect(JSON.stringify(f)).toBe(before);
});
it('keeps minimized direction and negative deltas without an automatic verdict', async () => {
  const { analyzeRetrievalCurve } = await load('retrieval-curve'); const f = await fixture([8, 2]);
  f.config.direction = 'minimize'; const r = analyzeRetrievalCurve(f.manifest, f.evidence, f.config);
  expect(r.streams[0].metrics.bestRunId).toBe('r1'); expect(r.streams[0].metrics.latestMinusInitial).toBeCloseTo(-0.6);
  expect(r.winner).toBeUndefined(); expect(r.statisticalSignificance).toBe('not-established');
});
it.each(['duplicate', 'nonmonotone', 'seed', 'cohort', 'split', 'unknown-run', 'duplicate-stream', 'shared-run', 'duplicate-report'])
('refuses incompatible declarations: %s', async mode => {
  const { analyzeRetrievalCurve } = await load('retrieval-curve'); const f = await fixture();
  if (mode === 'duplicate') f.config.streams[0].runIds = ['r0', 'r0'];
  if (mode === 'nonmonotone') f.config.streams[0].runIds = ['r1', 'r0'];
  if (mode === 'seed') f.manifest.runs[1].seed = 'different';
  if (mode === 'cohort') f.evidence[1].profile.baselineRevision = 'other';
  if (mode === 'split') f.manifest.runs[1].split = 'holdout';
  if (mode === 'unknown-run') f.config.streams[0].runIds.push('missing');
  if (mode === 'duplicate-stream') f.config.streams.push({ ...f.config.streams[0] });
  if (mode === 'shared-run') f.config.streams.push({ ...f.config.streams[0], id: 'other' });
  if (mode === 'duplicate-report') f.evidence[1].profile.reportId = f.evidence[0].profile.reportId;
  expect(() => analyzeRetrievalCurve(f.manifest, f.evidence, f.config)).toThrow();
});
it.each(['failed', 'incomplete', 'missing', 'nonfinite'])('does not join a curve across %s evidence', async mode => {
  const { analyzeRetrievalCurve } = await load('retrieval-curve'); const f = await fixture();
  if (mode === 'missing') f.evidence.splice(1, 1);
  else if (mode === 'nonfinite') f.evidence[1].profile.candidateRate = NaN;
  else f.evidence[1].status = mode;
  const r = analyzeRetrievalCurve(f.manifest, f.evidence, f.config);
  expect(r.streams[0].metrics).toBeNull(); expect(r.streams[0].points).toHaveLength(3);
  expect(r.streams[0].status).toBe('unavailable');
});
it('preserves null regression, explicit zero, single points and unassigned runs', async () => {
  const { analyzeRetrievalCurve } = await load('retrieval-curve'); const f = await fixture([0, 0]);
  expect(analyzeRetrievalCurve(f.manifest, f.evidence, f.config).streams[0].metrics.latestMinusInitial).toBe(0);
  f.config.metric = 'regressionFraction';
  expect(analyzeRetrievalCurve(f.manifest, f.evidence, f.config).streams[0].metrics).toBeNull();
  f.config.metric = 'candidateRate'; f.config.streams[0].runIds = ['r0'];
  const r = analyzeRetrievalCurve(f.manifest, f.evidence, f.config);
  expect(r.streams[0].status).toBe('insufficient-trajectory'); expect(r.streams[0].metrics).toBeNull();
  expect(r.unassigned.map((x: any) => x.id)).toEqual(['r1']);
});
it('digests are insensitive to object key order, not to declared stream order', async () => {
  const { analyzeRetrievalCurve } = await load('retrieval-curve'); const f = await fixture();
  const a = analyzeRetrievalCurve(f.manifest, f.evidence, f.config);
  const shuffled = Object.fromEntries(Object.entries(f.config).reverse());
  expect(analyzeRetrievalCurve(f.manifest, f.evidence, shuffled).inputDigest).toBe(a.inputDigest);
  f.config.streams[0].runIds = ['r0', 'r2'];
  expect(analyzeRetrievalCurve(f.manifest, f.evidence, f.config).inputDigest).not.toBe(a.inputDigest);
});
it('bounds streams and run counts with strict config', async () => {
  const { analyzeRetrievalCurve } = await load('retrieval-curve'); const f = await fixture();
  for (const config of [{ ...f.config, arbitrary: true }, { ...f.config, metric: 'code()' },
    { ...f.config, streams: Array.from({ length: 17 }, (_, i) => ({ id: 's' + i, runIds: ['r0'], evidenceRefs: ['source:x'] })) }])
    expect(() => analyzeRetrievalCurve(f.manifest, f.evidence, config)).toThrow();
  f.manifest.runs = Array(101).fill(f.manifest.runs[0]);
  expect(() => analyzeRetrievalCurve(f.manifest, f.evidence, f.config)).toThrow();
});
it('executes the real compiled curve CLI and keeps other modes/exclusive output intact', async () => {
  const a = await report(input()), b = await report(input(undefined, [true, true, true, true], { experimentId: 'later' }));
  expect(a.result.status).toBe(0); expect(b.result.status).toBe(0);
  const manifest: any = { schemaVersion: 1, protocol: { id: 'cli-test',
    splits: { train: [], validation: ['q0', 'q1', 'q2', 'q3'], holdout: [] },
    trainingExposure: { status: 'not-established', evidenceRefs: [] } }, runs: [
    { id: 'r0', iteration: 0, checkpoint: 'a', split: 'validation', status: 'evaluable', report: a.output },
    { id: 'r1', iteration: 1, checkpoint: 'b', split: 'validation', status: 'evaluable', report: b.output } ],
    analysis: { curve: { metric: 'candidateRate', direction: 'maximize',
      streams: [{ id: 's', runIds: ['r0', 'r1'], evidenceRefs: ['source:declared'] }] },
      stability: { absoluteTolerance: 0.1, zMultiplier: 1, consecutiveWindows: 2 },
      pareto: { resourceBasis: 'per-run', objectives: [
        { id: 'candidateRate', direction: 'maximize' }, { id: 'objective', direction: 'maximize' }] } } };
  const dir = await temp(), m = path.join(dir, 'manifest.json'), out = path.join(dir, 'curve.json');
  await writeFile(m, JSON.stringify(manifest));
  const result = run('analyze-retrieval.mjs', ['--curve', m, '--output', out]);
  expect(result.status, result.stderr).toBe(0);
  const parsed = await readJSON(out); expect(parsed.streams[0].metrics.latestMinusInitial).toBe(0.5);
  expect(parsed.numericProvenance).toBeDefined(); expect(parsed.memoryPersisted).toBe(false);
  expect(run('analyze-retrieval.mjs', ['--curve', m, '--output', out]).status).not.toBe(0);
  for (const mode of ['--frontier', '--pareto', '--stability']) {
    const r = run('analyze-retrieval.mjs', [mode, m, '--output', path.join(dir, mode + '.json')]);
    expect(r.status, r.stderr).toBe(0);
  }
}, 60000);
