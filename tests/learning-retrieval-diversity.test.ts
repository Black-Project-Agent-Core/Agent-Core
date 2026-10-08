import { describe, expect, it } from 'vitest';
import { createRetrievalDiversityArchive } from '../src/learning/retrieval-diversity.js';

const dimensions = [
  { id: 'candidateRate', min: 0, max: 1, bins: 4 },
  { id: 'regressionFraction', min: 0, max: 1, bins: 2 },
];

describe('retrieval quality-diversity archive', () => {
  it('keeps the best observed candidate in each declared behavior cell', () => {
    const result = createRetrievalDiversityArchive([
      { reportId: 'a', comparisonKey: 'same', fitness: 0.6, features: { candidateRate: 0.6, regressionFraction: 0.1 } },
      { reportId: 'b', comparisonKey: 'same', fitness: 0.8, features: { candidateRate: 0.7, regressionFraction: 0.1 } },
      { reportId: 'specialist', comparisonKey: 'same', fitness: 0.55, features: { candidateRate: 0.55, regressionFraction: 0.8 } },
    ], dimensions);
    expect(result.occupiedCells).toBe(2);
    expect(result.archive.map(cell => cell.winner)).toEqual(expect.arrayContaining(['b', 'specialist']));
    expect(result.deploymentRecommendation).toBe(false);
    expect(result.generatesCandidates).toBe(false);
  });

  it('uses deterministic boundary binning and report-id tie breaking', () => {
    const result = createRetrievalDiversityArchive([
      { reportId: 'z', comparisonKey: 'same', fitness: 1, features: { candidateRate: 1, regressionFraction: 0 } },
      { reportId: 'a', comparisonKey: 'same', fitness: 1, features: { candidateRate: 1, regressionFraction: 0 } },
    ], dimensions);
    expect(result.archive).toHaveLength(1);
    expect(result.archive[0]).toMatchObject({ coordinates: [3, 0], winner: 'a' });
  });

  it('refuses incomparable, missing, and non-finite feature evidence', () => {
    expect(() => createRetrievalDiversityArchive([
      { reportId: 'a', comparisonKey: 'one', fitness: 1, features: { candidateRate: 0.5, regressionFraction: 0.2 } },
      { reportId: 'b', comparisonKey: 'two', fitness: 1, features: { candidateRate: 0.5, regressionFraction: 0.2 } },
    ], dimensions)).toThrow(/INCOMPARABLE/);
    expect(() => createRetrievalDiversityArchive([
      { reportId: 'a', comparisonKey: 'one', fitness: 1, features: { candidateRate: 0.5 } },
    ], dimensions)).toThrow(/FEATURE_MISSING/);
    expect(() => createRetrievalDiversityArchive([
      { reportId: 'a', comparisonKey: 'one', fitness: 1, features: { candidateRate: Number.NaN, regressionFraction: 0 } },
    ], dimensions)).toThrow(/NONFINITE/);
  });
});
