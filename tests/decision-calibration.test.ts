import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateDecisionCalibration } from '../src/learning/decision-calibration.js';
import { evaluateDecisionRecord, type DecisionRecord } from '../src/learning/decision-review.js';

vi.mock('../src/learning/decision-review.js', () => ({ evaluateDecisionRecord: vi.fn() }));
const replay = vi.mocked(evaluateDecisionRecord);
beforeEach(() => replay.mockReset());

function record(id: string, probability: number | undefined, outcome: 'pass' | 'fail' | 'unknown',
  control: 'proceed' | 'inspect' | 'abstain' = 'proceed', contextKey = 'dependency-a', prospective = true) {
  const value = { taskId: 'task-' + id, declaration: { id, control, predictions: [{ id: 'assertion', checkIndex: 0 }] } } as DecisionRecord;
  const result = { contextKey, context: [{ attribute: 'dependency', state: 'known', compatibility: 'compatible' }],
    suggestedControl: 'proceed', predictions: [{ id: 'assertion', probability, outcome, prospective, predictionMeaning: 'registered-oracle-check' }] } as Awaited<ReturnType<typeof evaluateDecisionRecord>>;
  replay.mockResolvedValueOnce(result);
  return value;
}

describe('decision calibration diagnostics', () => {
  it('replays prospective pairs and computes Brier, reliability, discrimination and risk–coverage', async () => {
    const result = await evaluateDecisionCalibration([
      record('one', 0.9, 'pass'), record('two', 0.8, 'fail'), record('three', 0.2, 'fail', 'inspect'), record('four', 0.1, 'pass', 'abstain'),
    ]);
    expect(replay).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({ status: 'descriptive', samples: 4, distinctTasks: 4, meanConfidence: 0.5, successRate: 0.5 });
    expect(result.brierScore).toBeCloseTo(0.375);
    expect(result.discrimination.value).toBe(0.5);
    expect(result.reliability.reduce((sum, bin) => sum + bin.samples, 0)).toBe(4);
    expect(result.riskCoverage.find(point => point.threshold === 0.8)).toEqual({ threshold: 0.8, selected: 2, coverage: 0.5, risk: 0.5 });
    expect(result.riskCoverage.at(-1)).toEqual({ threshold: 1, selected: 0, coverage: 0, risk: null });
    expect(result.declaredControl).toMatchObject({ proceeded: 2, inspected: 1, abstained: 1, coverage: 0.5, risk: 0.5,
      abstainedWithObservedPass: 1, falseAbstention: 'not-established' });
    expect(result.calibratedCompetence).toBe('not-established');
    expect(result.causalInfluence).toBe('not-established');
  });

  it('keeps version-specific cohorts separate and does not count checks as independent tasks', async () => {
    const a = record('same', 0.8, 'pass', 'proceed', 'dependency-a');
    const b = record('other', 0.2, 'fail', 'inspect', 'dependency-b');
    b.taskId = a.taskId;
    b.declaration.predictions[0].checkIndex = 1;
    const result = await evaluateDecisionCalibration([a, b]);
    expect(result.distinctTasks).toBe(1);
    expect(result.contexts.map(group => [group.contextKey, group.samples, group.successRate])).toEqual([
      ['dependency-a', 1, 1], ['dependency-b', 1, 0],
    ]);
    expect(result.discrimination.value).toBe(1);
    expect(result.contexts.every(group => group.discrimination.value === null)).toBe(true);
  });

  it('excludes retrospective, unresolved and missing forecasts without manufacturing zeros', async () => {
    const result = await evaluateDecisionCalibration([
      record('late', 0.99, 'pass', 'proceed', 'dependency-a', false),
      record('unverified', 0.8, 'unknown'), record('no-probability', undefined, 'pass'), record('bad-probability', NaN, 'pass'),
    ]);
    expect(result).toMatchObject({ status: 'insufficient-evidence', samples: 0, brierScore: null, successRate: null, meanConfidence: null });
    expect(result.excluded.map(item => item.reason)).toEqual([
      'prospective-evidence-unavailable', 'independent-outcome-unavailable', 'probability-not-declared', 'probability-invalid',
    ]);
    expect(result.riskCoverage.every(point => point.coverage === null && point.risk === null)).toBe(true);
    expect(result.monitoring).toHaveLength(4);
  });

  it('keeps inference and scoped insufficiency visible independently of successful outcomes', async () => {
    const input = record('context', 0.9, 'pass');
    replay.mockReset();
    replay.mockResolvedValue({ contextKey: 'changed', context: [
      { attribute: 'dependency', state: 'unknown', compatibility: 'unknown', reason: 'evidence-unavailable' },
      { attribute: 'contract', state: 'inferred', compatibility: 'compatible' },
    ], suggestedControl: 'inspect', predictions: [{ id: 'assertion', probability: 0.9, outcome: 'pass', prospective: true, predictionMeaning: 'registered-oracle-check' }] } as Awaited<ReturnType<typeof evaluateDecisionRecord>>);
    const result = await evaluateDecisionCalibration([input]);
    expect(result.monitoring[0]).toMatchObject({ suggestedControl: 'inspect', context: [
      { attribute: 'dependency', state: 'unknown' }, { attribute: 'contract', state: 'inferred' },
    ] });
    expect(result.successRate).toBe(1);
    expect(result.calibratedCompetence).toBe('not-established');
  });

  it('includes probability endpoints, treats tied confidence neutrally and rejects duplicate forecast credit', async () => {
    const first = record('one', 1, 'pass'), second = record('two', 1, 'fail');
    const repeated = record('one', 1, 'pass');
    const result = await evaluateDecisionCalibration([first, second, repeated, record('zero', 0, 'fail')]);
    expect(result.samples).toBe(3);
    expect(result.reliability[0].samples).toBe(1);
    expect(result.reliability.at(-1)?.samples).toBe(2);
    expect(result.discrimination.value).toBe(0.75);
    expect(result.excluded).toContainEqual({ taskId: 'task-one', decisionId: 'one', predictionId: 'assertion', reason: 'duplicate-forecast' });
  });

  it('bounds replay to the latest 64 decisions and reports omitted history', async () => {
    const records = Array.from({ length: 65 }, (_, index) => ({ taskId: 'task-' + index, declaration: { id: String(index), control: 'inspect', predictions: [] } } as unknown as DecisionRecord));
    replay.mockResolvedValue({ contextKey: 'same', context: [], suggestedControl: 'inspect', predictions: [] } as Awaited<ReturnType<typeof evaluateDecisionRecord>>);
    const result = await evaluateDecisionCalibration(records);
    expect(result).toMatchObject({ inspectedDecisions: 64, omittedDecisions: 1, samples: 0 });
    expect(replay).toHaveBeenCalledTimes(64);
    expect(replay.mock.calls[0][0]).toBe(records[1]);
  });

  it('forwards read grants and separates technical tool forecasts from functional oracle checks', async () => {
    const tool = record('tool', 0.9, 'pass'), oracle = record('oracle', 0.8, 'fail');
    tool.declaration.predictions = [{ id: 'assertion', expected: 'Read succeeds', expectedTool: 'read_file', expectedOutcome: 'success' }];
    replay.mockReset();
    for (const [predictionMeaning, probability, outcome] of [
      ['technical-invocation-outcome', 0.9, 'pass'], ['registered-oracle-check', 0.8, 'fail'],
    ] as const) replay.mockResolvedValueOnce({ contextKey: 'same', context: [], suggestedControl: 'inspect',
      predictions: [{ id: 'assertion', probability, outcome, prospective: true, predictionMeaning }] } as Awaited<ReturnType<typeof evaluateDecisionRecord>>);
    const access = { readFiles: true };
    const result = await evaluateDecisionCalibration([tool, oracle], access);
    expect(replay.mock.calls.every(call => call[1] === access)).toBe(true);
    expect(result.populations.map(group => [group.predictionMeaning, group.samples, group.successRate])).toEqual([
      ['technical-invocation-outcome', 1, 1], ['registered-oracle-check', 1, 0],
    ]);
    expect(result.contexts).toHaveLength(2);
    expect(result.goalSuccess).toBe('not-inferred-from-calibration');
  });

  it('does not inflate one task target by declaring the same forecast again under a new decision ID', async () => {
    const first = record('one', 0.9, 'pass'), repeated = record('two', 0.1, 'pass');
    repeated.taskId = first.taskId;
    const result = await evaluateDecisionCalibration([first, repeated]);
    expect(result.samples).toBe(1);
    expect(result.meanConfidence).toBe(0.9);
    expect(result.excluded[0]).toMatchObject({ decisionId: 'two', reason: 'duplicate-forecast' });
    expect(replay.mock.calls[0][1]).toEqual({ readFiles: false });
  });
});
