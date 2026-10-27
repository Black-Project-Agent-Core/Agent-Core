import { describe, expect, it } from 'vitest';
import {
  cognitiveOptionsFromEnv, COGNITIVE_FEATURES, COGNITIVE_ENV_FLAG, enabledCognitiveFeatures, resolveMemoryCognitiveConfig,
} from '../../src/memory/cognitive-config.js';
import {
  assessEpistemicConfidence, buildEpistemicLinkIndex, epistemicRankingInfluence,
} from '../../src/memory/epistemic-confidence.js';
import { legacyExperience } from '../../src/memory/experience-types.js';
import { FORGETTING_PARAMS, scoreMemoryForgetting } from '../../src/memory/forgetting-curve.js';
import type { MemoryRecord } from '../../src/memory/types.js';
import { link, NOW, record } from './memory-cognitive-test-utils.js';

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(NOW - offsetDays * DAY).toISOString();

describe('cognitive configuration', () => {
  it('disables every feature by default and clamps numeric bounds', () => {
    const config = resolveMemoryCognitiveConfig();
    expect(enabledCognitiveFeatures(config)).toEqual([]);
    expect(Object.isFrozen(config)).toBe(true);
    expect(config.maxHops).toBe(2);

    const wild = resolveMemoryCognitiveConfig({
      maxHops: 99, tier: { l1WindowMs: 1, l2WindowMs: 1 }, rem: { intervalMs: 1, minClusterSize: 99, maxClusterSize: 1 },
      contradiction: { confidenceMargin: 9, recencyGapMs: 1 },
    });
    expect(wild.maxHops).toBe(3);
    expect(wild.tier.l2WindowMs).toBeGreaterThanOrEqual(wild.tier.l1WindowMs);
    expect(wild.rem.intervalMs).toBe(60_000);
    expect(wild.rem.minClusterSize).toBe(12);
    expect(wild.rem.maxClusterSize).toBeGreaterThanOrEqual(wild.rem.minClusterSize);
    expect(wild.contradiction.confidenceMargin).toBe(0.9);
    expect(resolveMemoryCognitiveConfig({ maxHops: Number.NaN }).maxHops).toBe(2);
    expect(resolveMemoryCognitiveConfig({ maxHops: 0 }).maxHops).toBe(1);
  });

  it('only a literal true enables a feature', () => {
    const config = resolveMemoryCognitiveConfig({ features: { tiering: true, multiHop: 1 as unknown as boolean } });
    expect(enabledCognitiveFeatures(config)).toEqual(['tiering']);
  });

  it('parses the host environment flag fail-soft', () => {
    const parse = (value?: string) => cognitiveOptionsFromEnv({ [COGNITIVE_ENV_FLAG]: value });
    expect(parse(undefined).options.features).toEqual({});
    expect(parse('none').options.features).toEqual({});
    expect(Object.keys(parse('ALL').options.features!)).toHaveLength(COGNITIVE_FEATURES.length);
    const mixed = parse(' adaptiveFusion , TIERING,bogus,');
    expect(mixed.options.features).toEqual({ adaptiveFusion: true, tiering: true });
    expect(mixed.unknown).toEqual(['bogus']);
  });
});

describe('epistemic confidence', () => {
  it('separates verified, supported, inferred and unverified records', () => {
    const plain = assessEpistemicConfidence(record('plain'));
    expect(plain.status).toBe('unverified');
    expect(plain.confidence).toBe(0.35);

    expect(assessEpistemicConfidence(record('v', { tags: ['verified'] })).status).toBe('verified');
    const reviewed = assessEpistemicConfidence(record('r', { source: { type: 'learning-review' } }));
    expect(reviewed.status).toBe('supported');
    expect(reviewed.confidence).toBeGreaterThan(plain.confidence);

    const inferred = assessEpistemicConfidence(record('i', { tags: ['Hypothesis'] }));
    expect(inferred.status).toBe('inferred');
    expect(inferred.confidence).toBeLessThan(plain.confidence);
    expect(assessEpistemicConfidence(record('d', { links: [link('x', 'derived-from')] })).status).toBe('inferred');
    expect(assessEpistemicConfidence(record('s', { source: { type: 'rem-consolidation' } })).status).toBe('inferred');
  });

  it('reads the experience verification of v2 records', () => {
    const base = record('v2') as MemoryRecord & { version: 1 };
    const ref = { kind: 'memory' as const, id: 'source-1', revision: `sha256:${'a'.repeat(64)}` };
    const verified = { ...base, version: 2 as const, experience: {
      ...legacyExperience(), epistemic: 'fact' as const,
      verification: { status: 'verified' as const, evidence: [ref], method: 'test', verifierRevision: 'r1', verifiedAt: iso(1) },
    } };
    const hypothesis = { ...base, version: 2 as const, experience: { ...legacyExperience(), epistemic: 'hypothesis' as const } };
    expect(assessEpistemicConfidence(verified).status).toBe('verified');
    expect(assessEpistemicConfidence(hypothesis).status).toBe('inferred');
    expect(assessEpistemicConfidence(verified).confidence).toBeGreaterThan(assessEpistemicConfidence(hypothesis).confidence);
  });

  it('counts supports and contradictions from active links and ignores superseded endpoints', () => {
    const records = [
      record('a', { links: [link('b', 'contradicts'), link('c', 'supports')] }),
      record('b'),
      record('c'),
      record('old', { links: [link('a', 'contradicts')] }),
      record('new', { links: [link('old', 'supersedes')] }),
    ];
    const index = buildEpistemicLinkIndex(records, NOW);
    expect(index.get('a')).toEqual({ supports: 1, contradicts: 1 });
    expect(index.get('b')?.contradicts).toBe(1);
    expect(index.get('c')?.supports).toBe(1);
    expect(index.has('old')).toBe(false);

    expect(assessEpistemicConfidence(records[0]!, index.get('a')).status).toBe('contested');
    expect(assessEpistemicConfidence(records[2]!, index.get('c')).confidence)
      .toBeGreaterThan(assessEpistemicConfidence(records[2]!).confidence);
  });

  it('keeps ranking influence bounded and neutral at the midpoint', () => {
    const at = (confidence: number) => epistemicRankingInfluence({ status: 'unverified', confidence, factors: [] });
    expect(at(0.5)).toBe(0);
    expect(at(0.99)).toBeLessThanOrEqual(0.04);
    expect(at(0.05)).toBeGreaterThanOrEqual(-0.04);
    expect(at(0.9)).toBeGreaterThan(at(0.6));
  });
});

describe('forgetting curve', () => {
  it('decays with time and is reinforced by access frequency', () => {
    const idle = record('idle', { updatedAt: iso(30) });
    const used = record('used', { updatedAt: iso(30), lastAccessedAt: iso(1), retrievalCount: 20 });
    const stale = scoreMemoryForgetting(idle, NOW)!;
    const reinforced = scoreMemoryForgetting(used, NOW)!;
    expect(stale.retrievability).toBeGreaterThan(0);
    expect(stale.retrievability).toBeLessThan(1);
    expect(reinforced.retrievability).toBeGreaterThan(stale.retrievability);
    expect(reinforced.stabilityDays).toBeGreaterThan(stale.stabilityDays);
    expect(scoreMemoryForgetting(record('older', { updatedAt: iso(90) }), NOW)!.retrievability)
      .toBeLessThan(stale.retrievability);
    expect(stale.score).toBe(stale.retrievability);
  });

  it('raises stability with salience and confidence and stays inside its bounds', () => {
    const subject = record('s', { updatedAt: iso(14), retrievalCount: 3, lastAccessedAt: iso(14) });
    const base = scoreMemoryForgetting(subject, NOW)!;
    expect(scoreMemoryForgetting(subject, NOW, { confidence: 0.99 })!.stabilityDays).toBeGreaterThan(base.stabilityDays);
    expect(scoreMemoryForgetting(subject, NOW, { salience: 2 })!.stabilityDays).toBeGreaterThan(base.stabilityDays);
    expect(scoreMemoryForgetting(subject, NOW, { salience: 0 })!.salience).toBe(0.25);
    const huge = scoreMemoryForgetting(record('h', { retrievalCount: Number.MAX_SAFE_INTEGER, lastAccessedAt: iso(0) }), NOW, { salience: 2, confidence: 1 })!;
    expect(huge.stabilityDays).toBeLessThanOrEqual(FORGETTING_PARAMS.maxStabilityDays);
    expect(scoreMemoryForgetting(record('f', { updatedAt: iso(0) }), NOW)!.retrievability).toBe(1);
  });

  it('refuses unparseable timestamps instead of inventing a score', () => {
    expect(scoreMemoryForgetting(record('bad', { updatedAt: 'not-a-date' }), NOW)).toBeNull();
    expect(scoreMemoryForgetting(record('bad2', { lastAccessedAt: 'nope' }), NOW)).toBeNull();
  });
});
