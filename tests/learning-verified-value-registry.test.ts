import { describe, expect, it } from 'vitest';
import { VerifiedValueRegistry, collectNumericLeaves } from '../src/learning/verified-value-registry.js';

describe('verified numeric provenance registry', () => {
  it('retains exact, rounded, and percent transformations with provenance', () => {
    const registry = new VerifiedValueRegistry();
    registry.add(0.12345, 'verified-profile:r1:candidateRate', 'verified-input');
    expect(registry.lookup(0.12345)[0].sources[0]).toMatchObject({ transform: 'exact', originalValue: 0.12345 });
    expect(registry.lookup(0.123)[0].sources.some(source => source.transform === 'rounded-3')).toBe(true);
    expect(registry.lookup(12.345)[0].sources.some(source => source.transform === 'percent')).toBe(true);
  });

  it('preserves ambiguous sources instead of choosing one', () => {
    const registry = new VerifiedValueRegistry();
    registry.add(0.5, 'verified-profile:a:score', 'verified-input', false);
    registry.add(0.5, 'verified-profile:b:score', 'verified-input', false);
    const matches = registry.lookup(0.5);
    expect(matches).toHaveLength(1);
    expect(matches[0].sources.map(source => source.source)).toEqual([
      'verified-profile:a:score',
      'verified-profile:b:score',
    ]);
  });

  it('bounds source fanout explicitly and rejects non-finite values or unsafe tolerances', () => {
    const registry = new VerifiedValueRegistry();
    for (let index = 0; index < 40; index += 1) registry.add(1, 'source:' + index, 'verified-input', false);
    const entry = registry.lookup(1)[0];
    expect(entry.sources).toHaveLength(32);
    expect(entry.omittedSources).toBe(8);
    expect(() => registry.add(Number.NaN, 'bad', 'verified-input')).toThrow(/NONFINITE/);
    expect(() => registry.lookup(1, { relativeTolerance: 0.5 })).toThrow(/TOLERANCE/);
  });

  it('collects numeric leaves without treating strings or booleans as measurements', () => {
    const registry = new VerifiedValueRegistry();
    collectNumericLeaves({ score: 0.8, nested: { count: 4, ok: true, label: '4' } }, registry, 'report:r1', 'analysis-derived');
    expect(registry.lookup(0.8)).toHaveLength(1);
    expect(registry.lookup(4)).toHaveLength(1);
    expect(registry.toJSON().entries.some(entry => entry.sources.some(source => source.source.endsWith(':nested.ok')))).toBe(false);
  });
});
