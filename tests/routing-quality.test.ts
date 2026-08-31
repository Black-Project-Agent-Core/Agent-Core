import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { CapabilityRecord } from '../src/capabilities/types.js';
import {
  evaluateRoutingQuality,
  type RoutingQualityCase,
} from '../src/evaluation/routing-quality.js';

const CATALOG_SHA = 'wave-e-routing-quality-fixture';

function capability(
  id: string,
  overrides: Partial<CapabilityRecord> = {},
): CapabilityRecord {
  return {
    id,
    name: id,
    displayName: id,
    aliases: [],
    type: 'skill',
    category: 'general',
    categoryTitle: 'General',
    declaredPurpose: `Support ${id} workflows`,
    functionalSummary: `Provide deterministic ${id} guidance`,
    source: { url: `https://example.invalid/${id}`, repo: 'fixture/repo', path: 'SKILL.md', sha: 'fixture' },
    compatibility: ['chatgpt'],
    language: ['en'],
    triggers: [],
    invocation: 'auto_candidate',
    inputsContext: [],
    outputsArtifacts: [],
    requiredTools: [],
    dependencies: [],
    sideEffects: [],
    risk: 'low',
    license: { status: 'verified', id: 'MIT' },
    state: 'native_ready',
    nativeEligible: true,
    normalizedPath: `normalized/skills/${id}/SKILL.md`,
    equivalenceGroup: null,
    catalogSha: CATALOG_SHA,
    catalogFile: 'fixture.md',
    catalogRow: 1,
    ...overrides,
  };
}

const records: CapabilityRecord[] = [
  capability('frontend-quality', {
    category: 'frontend',
    categoryTitle: 'Frontend',
    aliases: ['frontend design'],
    declaredPurpose: 'Improve frontend dashboard visual hierarchy spacing and layout',
    functionalSummary: 'Refactor frontend presentation quality and visual hierarchy',
    triggers: ['frontend', 'dashboard', 'spacing', 'hierarchy', 'refactor', 'review'],
  }),
  capability('docs-helper', {
    category: 'documentation',
    categoryTitle: 'Documentation',
    declaredPurpose: 'Write API reference documentation and changelogs',
    triggers: ['documentation', 'changelog'],
  }),
];

const corpus: RoutingQualityCase[] = [
  {
    id: 'atomic-read',
    task: 'Read notes.txt',
    acceptedTiers: ['atomic'],
    acceptedRisks: ['low'],
    mustAllowTools: ['read_file'],
    mustNotAllowTools: ['write_file', 'edit_file', 'execute_command'],
    readOnlyIntent: true,
    highImpactExpected: false,
    skillLoadExpectation: 'forbidden',
    verificationRequired: false,
  },
  {
    id: 'safe-remove-text',
    task: 'Remove trailing whitespace from notes.txt',
    acceptedTiers: ['atomic'],
    acceptedRisks: ['low'],
    mustAllowTools: ['edit_file'],
    readOnlyIntent: false,
    highImpactExpected: false,
    skillLoadExpectation: 'forbidden',
    verificationRequired: true,
  },
  {
    id: 'frontend-review-readonly',
    task: 'Review frontend dashboard hierarchy spacing',
    acceptedTiers: ['domain_complex'],
    acceptedDomains: ['frontend'],
    acceptedRisks: ['low'],
    mustAllowTools: ['read_file', 'search_files'],
    mustNotAllowTools: ['write_file', 'edit_file', 'execute_command', 'execution_create'],
    relevantCapabilityIds: ['frontend-quality'],
    readOnlyIntent: true,
    highImpactExpected: false,
    skillLoadExpectation: 'required',
    verificationRequired: true,
  },
  {
    id: 'frontend-refactor',
    task: 'Refactor frontend dashboard visual hierarchy spacing',
    acceptedTiers: ['domain_complex'],
    acceptedDomains: ['frontend'],
    acceptedRisks: ['low'],
    mustAllowTools: ['edit_file'],
    relevantCapabilityIds: ['frontend-quality'],
    readOnlyIntent: false,
    highImpactExpected: false,
    skillLoadExpectation: 'required',
    verificationRequired: true,
  },
];

describe('deterministic routing quality evaluator', () => {
  it('calculates quantitative metrics from real CapabilityRouter outputs', async () => {
    const result = await evaluateRoutingQuality(corpus, records);

    expect(result.metrics.caseCount).toBe(4);
    expect(result.metrics.tierAccuracy).toBe(1);
    expect(result.metrics.falseHighImpactRate).toBe(0);
    expect(result.metrics.unsafeOverpermissionRate).toBe(0);
    expect(result.metrics.falseReadOnlyClassificationRate).toBe(0);
    expect(result.metrics.relevantSkillPrecisionAt2).toBe(1);
    expect(result.metrics.unnecessarySkillLoadRate).toBe(0);
    expect(result.metrics.verificationCorrectness).toBe(1);
    expect(result.metrics.deterministicReplayEquality).toBe(1);
    expect(result.failures).toEqual([]);
  });

  it('rejects malformed corpus entries instead of silently skipping them', async () => {
    await expect(evaluateRoutingQuality([
      { task: 'Read notes.txt', acceptedTiers: ['atomic'] },
    ] as unknown as RoutingQualityCase[], records)).rejects.toThrow('ROUTING_QUALITY_CASE_INVALID');
  });

  it('rejects corpus expectations that reference unknown capabilities', async () => {
    await expect(evaluateRoutingQuality([
      {
        ...corpus[0]!,
        id: 'unknown-capability',
        relevantCapabilityIds: ['does-not-exist'],
      },
    ], records)).rejects.toThrow('ROUTING_QUALITY_UNKNOWN_CAPABILITY');
  });

  it('loads the repo-owned routing corpus with broad deterministic coverage', async () => {
    const [corpusText, capabilitiesText] = await Promise.all([
      readFile(new URL('./fixtures/quality/routing-corpus.json', import.meta.url), 'utf8'),
      readFile(new URL('./fixtures/quality/routing-capabilities.json', import.meta.url), 'utf8'),
    ]);
    const fullCorpus = JSON.parse(corpusText) as RoutingQualityCase[];
    const fullCapabilities = JSON.parse(capabilitiesText) as CapabilityRecord[];

    expect(fullCorpus.length).toBeGreaterThanOrEqual(32);
    expect(fullCapabilities.length).toBeGreaterThanOrEqual(6);
    expect(new Set(fullCorpus.map((entry) => entry.id)).size).toBe(fullCorpus.length);

    const first = await evaluateRoutingQuality(fullCorpus, fullCapabilities);
    const second = await evaluateRoutingQuality(fullCorpus, fullCapabilities);
    expect(second.metrics).toEqual(first.metrics);
    expect(second.cases.map((entry) => entry.route)).toEqual(first.cases.map((entry) => entry.route));
  });
});
