import { describe, expect, it } from 'vitest';
import { analyzeRetrievalStability } from '../../src/memory/evaluation/retrieval-stability.js';

const config = { absoluteTolerance: 0.01, zMultiplier: 1, consecutiveWindows: 2 };

describe('retrieval stability advisory', () => {
  it('reports insufficient evidence for fewer than two rounds', () => {
    expect(analyzeRetrievalStability([], config)).toMatchObject({
      status: 'insufficient-data',
      stopsExecution: false,
    });
  });

  it('observes a bounded stability window without gaining stop authority', () => {
    const result = analyzeRetrievalStability([
      { iteration: 0, comparisonKey: 'same', mean: 0.50, populationStdDev: 0.01, sampleCount: 4 },
      { iteration: 1, comparisonKey: 'same', mean: 0.505, populationStdDev: 0.01, sampleCount: 4 },
      { iteration: 2, comparisonKey: 'same', mean: 0.507, populationStdDev: 0.01, sampleCount: 4 },
    ], config);
    expect(result.status).toBe('stable-window-observed');
    expect(result.windows.at(-1)?.streak).toBe(2);
    expect(result.stopsExecution).toBe(false);
    expect(result.approvalAuthority).toBe(false);
  });

  it('resets the streak on a large shift and keeps missing dispersion explicit', () => {
    const shifted = analyzeRetrievalStability([
      { iteration: 0, comparisonKey: 'same', mean: 0.5, populationStdDev: 0.01, sampleCount: 4 },
      { iteration: 1, comparisonKey: 'same', mean: 0.505, populationStdDev: 0.01, sampleCount: 4 },
      { iteration: 2, comparisonKey: 'same', mean: 0.8, populationStdDev: 0.01, sampleCount: 4 },
    ], config);
    expect(shifted.status).toBe('not-stable');
    expect(shifted.windows.at(-1)?.streak).toBe(0);

    const unknown = analyzeRetrievalStability([
      { iteration: 0, comparisonKey: 'same', mean: 0.5, populationStdDev: null, sampleCount: 1 },
      { iteration: 1, comparisonKey: 'same', mean: 0.5, populationStdDev: null, sampleCount: 1 },
    ], config);
    expect(unknown.status).toBe('insufficient-data');
    expect(unknown.dispersionEvidence).toBe('partial-or-missing');
  });

  it('refuses protocol/comparison drift', () => {
    expect(() => analyzeRetrievalStability([
      { iteration: 0, comparisonKey: 'one', mean: 0.5, populationStdDev: 0.1, sampleCount: 2 },
      { iteration: 1, comparisonKey: 'two', mean: 0.5, populationStdDev: 0.1, sampleCount: 2 },
    ], config)).toThrow(/INCOMPARABLE/);
  });
});
