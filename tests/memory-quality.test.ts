import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  evaluateMemoryQuality,
  type MemoryQualityCase,
} from '../src/evaluation/memory-quality.js';

const corpus: MemoryQualityCase[] = [
  {
    id: 'hard-guardrail-basic',
    scope: { principalId: 'p1', projectId: 'project-a' },
    setup: [
      {
        op: 'commit', ref: 'guardrail', canonicalKey: 'guardrail.build.drive', kind: 'guardrail',
        value: 'Build output must stay on drive F.', importance: 1, pinned: true, enforcement: 'hard',
      },
      {
        op: 'commit', ref: 'noise', canonicalKey: 'observation.build.drive', kind: 'observation',
        value: 'Build output drive F packaging chatter.', importance: 0.4,
      },
    ],
    query: 'build output drive F',
    limit: 5,
    relevantRefs: ['guardrail'],
    primaryRelevantRef: 'guardrail',
    hardGuardrailRefs: ['guardrail'],
    noiseRefs: ['noise'],
  },
  {
    id: 'current-revision-basic',
    scope: { principalId: 'p1', projectId: 'project-a' },
    setup: [
      {
        op: 'commit', ref: 'decision', canonicalKey: 'decision.renderer', kind: 'decision',
        value: 'Use renderer A.', importance: 0.9,
      },
      { op: 'revise', ref: 'decision', value: 'Use renderer B.' },
    ],
    query: 'decision.renderer',
    limit: 5,
    relevantRefs: ['decision'],
    primaryRelevantRef: 'decision',
    currentRevision: [{ ref: 'decision', valueIncludes: 'renderer B', valueExcludes: 'renderer A' }],
  },
  {
    id: 'project-isolation-basic',
    scope: { principalId: 'p1', projectId: 'project-a' },
    setup: [
      {
        op: 'commit', ref: 'local', canonicalKey: 'fact.region', kind: 'fact',
        value: 'Project A deployment region is Jakarta.',
      },
      {
        op: 'commit', ref: 'other-project', scope: { principalId: 'p1', projectId: 'project-b' },
        canonicalKey: 'fact.region', kind: 'fact', value: 'Project B deployment region is Singapore.',
      },
    ],
    query: 'deployment region',
    limit: 5,
    relevantRefs: ['local'],
    primaryRelevantRef: 'local',
    isolationProbes: [
      {
        type: 'project',
        scope: { principalId: 'p1', projectId: 'project-a' },
        query: 'deployment region',
        mustExcludeRefs: ['other-project'],
      },
    ],
  },
];

describe('deterministic memory quality evaluator', () => {
  it('measures real MemoryService recall, revision, safety, isolation, and replay behavior', async () => {
    const result = await evaluateMemoryQuality(corpus);

    expect(result.metrics.caseCount).toBe(3);
    expect(result.metrics.recallAtK).toBe(1);
    expect(result.metrics.mrr).toBe(1);
    expect(result.metrics.hardGuardrailRecall).toBe(1);
    expect(result.metrics.currentRevisionCorrectness).toBe(1);
    expect(result.metrics.crossProjectContamination).toBe(0);
    expect(result.metrics.crossPrincipalContamination).toBe(0);
    expect(result.metrics.deterministicReplayEquality).toBe(1);
    expect(result.metrics.noiseDisplacementRate).toBe(0);
  });

  it('computes MRR from the first relevant hit instead of the noise-resistance primary ref', async () => {
    const result = await evaluateMemoryQuality([{
      id: 'mrr-first-relevant',
      scope: { principalId: 'p1', projectId: 'project-a' },
      setup: [
        { op: 'commit', ref: 'artifact', canonicalKey: 'artifact.release.manifest', kind: 'artifact', value: 'Release artifact manifest SHA256 verification.', importance: 0.9 },
        { op: 'commit', ref: 'procedure', canonicalKey: 'procedure.release.verify', kind: 'procedure', value: 'Release procedure verifies artifact manifest SHA256.', importance: 0.8 },
      ],
      query: 'release artifact manifest SHA256 verification',
      relevantRefs: ['artifact', 'procedure'],
      primaryRelevantRef: 'procedure',
    }]);

    expect(result.metrics.recallAtK).toBe(1);
    expect(result.metrics.mrr).toBe(1);
    expect(result.failures.some((failure) => failure.metric === 'mrr')).toBe(false);
  });

  it('rejects malformed cases and unknown fixture references', async () => {
    await expect(evaluateMemoryQuality([{ id: 'bad' }] as unknown as MemoryQualityCase[]))
      .rejects.toThrow('MEMORY_QUALITY_CASE_INVALID');

    await expect(evaluateMemoryQuality([{
      ...corpus[0]!,
      id: 'bad-ref',
      relevantRefs: ['does-not-exist'],
    }])).rejects.toThrow('MEMORY_QUALITY_UNKNOWN_REF');
  });

  it('loads the repo-owned memory corpus and replays it deterministically', async () => {
    const text = await readFile(new URL('./fixtures/quality/memory-corpus.json', import.meta.url), 'utf8');
    const fullCorpus = JSON.parse(text) as MemoryQualityCase[];
    expect(fullCorpus.length).toBeGreaterThanOrEqual(12);
    expect(new Set(fullCorpus.map((entry) => entry.id)).size).toBe(fullCorpus.length);

    const first = await evaluateMemoryQuality(fullCorpus);
    const second = await evaluateMemoryQuality(fullCorpus);
    expect(second.metrics).toEqual(first.metrics);
    expect(second.failures.map(({ caseId, metric }) => ({ caseId, metric })))
      .toEqual(first.failures.map(({ caseId, metric }) => ({ caseId, metric })));
    expect(first.metrics.deterministicReplayEquality).toBe(1);
    expect(first.metrics.mrr).toBeGreaterThanOrEqual(0.9);
    expect(first.metrics.noiseDisplacementRate).toBe(0);
    expect(first.failures.some((failure) => (
      failure.caseId === 'm07-stale-decision-resists-noise'
      && (failure.metric === 'mrr' || failure.metric === 'noise_displacement')
    ))).toBe(false);
  });
});
