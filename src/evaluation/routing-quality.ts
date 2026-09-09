import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CapabilityRecord, CapabilityRisk } from '../capabilities/types.js';
import type { RoutePlan, RouteTier } from '../capabilities/route-types.js';
import { writeRegistryGeneration } from '../capabilities/registry-writer.js';
import { CapabilityRegistry } from '../capabilities/registry-service.js';
import { CapabilityRouter } from '../capabilities/router.js';

export type SkillLoadExpectation = 'required' | 'forbidden' | 'optional';

export interface RoutingQualityCase {
  id: string;
  task: string;
  context?: string;
  acceptedTiers: RouteTier[];
  acceptedDomains?: string[];
  acceptedRisks?: CapabilityRisk[];
  mustAllowTools?: string[];
  mustNotAllowTools?: string[];
  relevantCapabilityIds?: string[];
  readOnlyIntent: boolean;
  highImpactExpected: boolean;
  skillLoadExpectation: SkillLoadExpectation;
  verificationRequired: boolean;
}

export interface RoutingQualityFailure {
  caseId: string;
  metric:
    | 'tier_accuracy'
    | 'risk_correctness'
    | 'domain_correctness'
    | 'false_high_impact'
    | 'unsafe_overpermission'
    | 'false_read_only_classification'
    | 'relevant_skill_precision_at_2'
    | 'unnecessary_skill_load'
    | 'required_skill_missing'
    | 'verification_correctness'
    | 'deterministic_replay';
  details: Record<string, unknown>;
}

export interface RoutingQualityMetrics {
  caseCount: number;
  tierAccuracy: number;
  riskCorrectness: number;
  domainCorrectness: number;
  falseHighImpactRate: number;
  unsafeOverpermissionRate: number;
  falseReadOnlyClassificationRate: number;
  relevantSkillPrecisionAt2: number;
  unnecessarySkillLoadRate: number;
  requiredSkillLoadCorrectness: number;
  verificationCorrectness: number;
  deterministicReplayEquality: number;
}

export interface RoutingQualityCaseResult {
  caseId: string;
  route: RoutePlan;
  replayEqual: boolean;
  failures: RoutingQualityFailure[];
}

export interface RoutingQualityResult {
  metrics: RoutingQualityMetrics;
  cases: RoutingQualityCaseResult[];
  failures: RoutingQualityFailure[];
}

const MUTATION_TOOLS = new Set([
  'write_file',
  'edit_file',
  'create_directory',
  'move_file',
  'execute_command',
  'start_process',
  'execution_create',
  'execution_start',
  'execution_add_nodes',
  'execution_retry',
  'execution_cancel',
]);

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function assertStringArray(value: unknown, field: string, required = false): string[] | undefined {
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value) || (required && value.length === 0) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`ROUTING_QUALITY_CASE_INVALID:${field}`);
  }
  return value as string[];
}

function validateCase(input: RoutingQualityCase): RoutingQualityCase {
  if (!input || typeof input !== 'object') throw new Error('ROUTING_QUALITY_CASE_INVALID:case');
  if (typeof input.id !== 'string' || !input.id.trim()) throw new Error('ROUTING_QUALITY_CASE_INVALID:id');
  if (typeof input.task !== 'string' || !input.task.trim()) throw new Error(`ROUTING_QUALITY_CASE_INVALID:${input.id}:task`);
  if (input.context !== undefined && typeof input.context !== 'string') throw new Error(`ROUTING_QUALITY_CASE_INVALID:${input.id}:context`);
  assertStringArray(input.acceptedTiers, `${input.id}:acceptedTiers`, true);
  assertStringArray(input.acceptedDomains, `${input.id}:acceptedDomains`);
  assertStringArray(input.acceptedRisks, `${input.id}:acceptedRisks`);
  assertStringArray(input.mustAllowTools, `${input.id}:mustAllowTools`);
  assertStringArray(input.mustNotAllowTools, `${input.id}:mustNotAllowTools`);
  assertStringArray(input.relevantCapabilityIds, `${input.id}:relevantCapabilityIds`);
  if (typeof input.readOnlyIntent !== 'boolean') throw new Error(`ROUTING_QUALITY_CASE_INVALID:${input.id}:readOnlyIntent`);
  if (typeof input.highImpactExpected !== 'boolean') throw new Error(`ROUTING_QUALITY_CASE_INVALID:${input.id}:highImpactExpected`);
  if (!['required', 'forbidden', 'optional'].includes(input.skillLoadExpectation)) {
    throw new Error(`ROUTING_QUALITY_CASE_INVALID:${input.id}:skillLoadExpectation`);
  }
  if (typeof input.verificationRequired !== 'boolean') throw new Error(`ROUTING_QUALITY_CASE_INVALID:${input.id}:verificationRequired`);
  return input;
}

function stableRouteProjection(route: RoutePlan): Record<string, unknown> {
  return {
    tier: route.tier,
    mode: route.mode,
    domain: route.domain,
    confidence: route.confidence,
    risk: route.risk,
    recommendedCapabilities: route.recommendedCapabilities.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      category: item.category,
      state: item.state,
      risk: item.risk,
      nativeEligible: item.nativeEligible,
      invocation: item.invocation,
      score: item.score ?? null,
    })),
    requiredSkillLoads: route.requiredSkillLoads.map((item) => ({ ...item })),
    allowedTools: [...route.allowedTools],
    verification: {
      required: route.verification.required,
      suggestedTools: [...route.verification.suggestedTools],
    },
    reasonCodes: [...route.reasonCodes],
  };
}

function addFailure(
  failures: RoutingQualityFailure[],
  caseId: string,
  metric: RoutingQualityFailure['metric'],
  details: Record<string, unknown>,
): void {
  failures.push({ caseId, metric, details });
}

export async function evaluateRoutingQuality(
  corpusInput: RoutingQualityCase[],
  capabilityRecords: CapabilityRecord[],
): Promise<RoutingQualityResult> {
  if (!Array.isArray(corpusInput) || corpusInput.length === 0) throw new Error('ROUTING_QUALITY_CASE_INVALID:corpus');
  if (!Array.isArray(capabilityRecords) || capabilityRecords.length === 0) throw new Error('ROUTING_QUALITY_CAPABILITIES_INVALID');

  const corpus = corpusInput.map(validateCase);
  const ids = new Set<string>();
  for (const entry of corpus) {
    if (ids.has(entry.id)) throw new Error(`ROUTING_QUALITY_CASE_INVALID:duplicate:${entry.id}`);
    ids.add(entry.id);
  }

  const knownCapabilities = new Set(capabilityRecords.map((record) => record.id));
  for (const entry of corpus) {
    for (const capabilityId of entry.relevantCapabilityIds ?? []) {
      if (!knownCapabilities.has(capabilityId)) {
        throw new Error(`ROUTING_QUALITY_UNKNOWN_CAPABILITY:${entry.id}:${capabilityId}`);
      }
    }
  }

  const root = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'agent-core-routing-quality-'));
  try {
    const catalogSha = capabilityRecords[0]!.catalogSha;
    if (capabilityRecords.some((record) => record.catalogSha !== catalogSha)) {
      throw new Error('ROUTING_QUALITY_CAPABILITIES_INVALID:catalogSha');
    }
    await writeRegistryGeneration(root, capabilityRecords, {
      catalogSha,
      generatedAt: '2026-08-31T00:00:00.000Z',
    });
    const router = new CapabilityRouter(CapabilityRegistry.open(root));
    const caseResults: RoutingQualityCaseResult[] = [];

    let tierCorrect = 0;
    let riskCorrect = 0;
    let domainCorrect = 0;
    let domainCases = 0;
    let falseHighImpact = 0;
    let highImpactNegativeCases = 0;
    let unsafeOverpermission = 0;
    let readOnlyCases = 0;
    let falseReadOnly = 0;
    let relevantRecommended = 0;
    let relevantRecommendationSlots = 0;
    let forbiddenSkillCases = 0;
    let unnecessarySkillLoads = 0;
    let requiredSkillCases = 0;
    let requiredSkillCorrect = 0;
    let verificationCorrect = 0;
    let replayEqualCount = 0;

    for (const entry of corpus) {
      const route = router.route(entry.task, entry.context ?? '');
      const replay = router.route(entry.task, entry.context ?? '');
      const failures: RoutingQualityFailure[] = [];
      const replayEqual = JSON.stringify(stableRouteProjection(route)) === JSON.stringify(stableRouteProjection(replay));
      if (replayEqual) replayEqualCount += 1;
      else addFailure(failures, entry.id, 'deterministic_replay', {});

      if (entry.acceptedTiers.includes(route.tier)) tierCorrect += 1;
      else addFailure(failures, entry.id, 'tier_accuracy', { observed: route.tier, expected: entry.acceptedTiers });

      if (!entry.acceptedRisks?.length || entry.acceptedRisks.includes(route.risk)) riskCorrect += 1;
      else addFailure(failures, entry.id, 'risk_correctness', { observed: route.risk, expected: entry.acceptedRisks });

      if (entry.acceptedDomains?.length) {
        domainCases += 1;
        if (entry.acceptedDomains.includes(route.domain)) domainCorrect += 1;
        else addFailure(failures, entry.id, 'domain_correctness', { observed: route.domain, expected: entry.acceptedDomains });
      }

      if (!entry.highImpactExpected) {
        highImpactNegativeCases += 1;
        if (route.tier === 'high_impact') {
          falseHighImpact += 1;
          addFailure(failures, entry.id, 'false_high_impact', { observedTier: route.tier });
        }
      }

      const forbiddenTools = entry.mustNotAllowTools ?? [];
      const leakedTools = forbiddenTools.filter((tool) => route.allowedTools.includes(tool));
      if (leakedTools.length > 0) {
        unsafeOverpermission += 1;
        addFailure(failures, entry.id, 'unsafe_overpermission', { leakedTools });
      }
      const missingAllowed = (entry.mustAllowTools ?? []).filter((tool) => !route.allowedTools.includes(tool));
      if (missingAllowed.length > 0) {
        addFailure(failures, entry.id, 'unsafe_overpermission', { missingRequiredTools: missingAllowed });
      }

      if (entry.readOnlyIntent) {
        readOnlyCases += 1;
        const mutationTools = route.allowedTools.filter((tool) => MUTATION_TOOLS.has(tool));
        if (mutationTools.length > 0) {
          falseReadOnly += 1;
          addFailure(failures, entry.id, 'false_read_only_classification', { mutationTools });
        }
      }

      if (entry.relevantCapabilityIds?.length) {
        const top = route.recommendedCapabilities.slice(0, 2);
        const relevantTop = top.filter((item) => entry.relevantCapabilityIds!.includes(item.id));
        relevantRecommendationSlots += top.length;
        relevantRecommended += relevantTop.length;
        if (top.length === 0 || relevantTop.length !== top.length) {
          addFailure(failures, entry.id, 'relevant_skill_precision_at_2', {
            observed: top.map((item) => item.id),
            relevant: entry.relevantCapabilityIds,
            relevantCount: relevantTop.length,
            evaluatedSlots: top.length,
          });
        }
      }

      if (entry.skillLoadExpectation === 'forbidden') {
        forbiddenSkillCases += 1;
        if (route.requiredSkillLoads.length > 0) {
          unnecessarySkillLoads += 1;
          addFailure(failures, entry.id, 'unnecessary_skill_load', {
            observed: route.requiredSkillLoads.map((item) => item.id),
          });
        }
      } else if (entry.skillLoadExpectation === 'required') {
        requiredSkillCases += 1;
        const relevant = entry.relevantCapabilityIds ?? [];
        const hasRequired = route.requiredSkillLoads.length > 0
          && (relevant.length === 0 || route.requiredSkillLoads.some((item) => relevant.includes(item.id)));
        if (hasRequired) requiredSkillCorrect += 1;
        else addFailure(failures, entry.id, 'required_skill_missing', {
          observed: route.requiredSkillLoads.map((item) => item.id),
          relevant,
        });
      }

      if (route.verification.required === entry.verificationRequired) verificationCorrect += 1;
      else addFailure(failures, entry.id, 'verification_correctness', {
        observed: route.verification.required,
        expected: entry.verificationRequired,
      });

      caseResults.push({ caseId: entry.id, route, replayEqual, failures });
    }

    const failures = caseResults.flatMap((entry) => entry.failures);
    return {
      metrics: {
        caseCount: corpus.length,
        tierAccuracy: ratio(tierCorrect, corpus.length),
        riskCorrectness: ratio(riskCorrect, corpus.length),
        domainCorrectness: ratio(domainCorrect, domainCases),
        falseHighImpactRate: ratio(falseHighImpact, highImpactNegativeCases),
        unsafeOverpermissionRate: ratio(unsafeOverpermission, corpus.length),
        falseReadOnlyClassificationRate: ratio(falseReadOnly, readOnlyCases),
        relevantSkillPrecisionAt2: ratio(relevantRecommended, relevantRecommendationSlots),
        unnecessarySkillLoadRate: ratio(unnecessarySkillLoads, forbiddenSkillCases),
        requiredSkillLoadCorrectness: ratio(requiredSkillCorrect, requiredSkillCases),
        verificationCorrectness: ratio(verificationCorrect, corpus.length),
        deterministicReplayEquality: ratio(replayEqualCount, corpus.length),
      },
      cases: caseResults,
      failures,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
