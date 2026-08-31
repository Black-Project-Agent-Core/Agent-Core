import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../config.js';
import { MemoryService } from '../memory/service.js';
import type {
  MemoryEnforcement,
  MemoryKind,
  MemoryRelation,
  MemoryScope,
  MemorySearchHit,
} from '../memory/types.js';

export interface MemoryQualityScope {
  principalId: string;
  projectId: string;
}

export interface MemoryQualityCommitOperation {
  op: 'commit';
  ref: string;
  scope?: MemoryQualityScope;
  canonicalKey: string;
  kind: MemoryKind;
  value: string;
  importance?: number;
  pinned?: boolean;
  enforcement?: MemoryEnforcement;
  relations?: Array<{ targetRef: string; relation: MemoryRelation; weight?: number }>;
}

export interface MemoryQualityReviseOperation {
  op: 'revise';
  ref: string;
  value: string;
}

export interface MemoryQualityConflictOperation {
  op: 'conflict';
  leftRef: string;
  rightRef: string;
  conflictType?: string;
}

export interface MemoryQualityAgeOperation {
  op: 'age';
  ref: string;
  ageMs: number;
}

export type MemoryQualitySetupOperation =
  | MemoryQualityCommitOperation
  | MemoryQualityReviseOperation
  | MemoryQualityConflictOperation
  | MemoryQualityAgeOperation;

export interface MemoryQualityIsolationProbe {
  type: 'project' | 'principal';
  scope: MemoryQualityScope;
  query: string;
  mustExcludeRefs: string[];
}

export interface MemoryQualityCase {
  id: string;
  scope: MemoryQualityScope;
  setup: MemoryQualitySetupOperation[];
  query: string;
  limit?: number;
  characterBudget?: number;
  relevantRefs?: string[];
  primaryRelevantRef?: string;
  hardGuardrailRefs?: string[];
  currentRevision?: Array<{ ref: string; valueIncludes: string; valueExcludes?: string }>;
  priorFailureRefs?: string[];
  graphTargetRefs?: string[];
  conflictPairs?: Array<{ leftRef: string; rightRef: string }>;
  artifactProcedureRefs?: string[];
  noiseRefs?: string[];
  isolationProbes?: MemoryQualityIsolationProbe[];
}

export interface MemoryQualityMetrics {
  caseCount: number;
  recallAtK: number;
  mrr: number;
  hardGuardrailRecall: number;
  currentRevisionCorrectness: number;
  priorFailureRecall: number;
  graphTargetRecall: number;
  conflictVisibility: number;
  artifactProcedureRecall: number;
  noiseDisplacementRate: number;
  crossProjectContamination: number;
  crossPrincipalContamination: number;
  characterBudgetCorrectness: number;
  deterministicReplayEquality: number;
}

export interface MemoryQualityFailure {
  caseId: string;
  metric:
    | 'recall_at_k'
    | 'mrr'
    | 'hard_guardrail_recall'
    | 'current_revision_correctness'
    | 'prior_failure_recall'
    | 'graph_target_recall'
    | 'conflict_visibility'
    | 'artifact_procedure_recall'
    | 'noise_displacement'
    | 'cross_project_contamination'
    | 'cross_principal_contamination'
    | 'character_budget_correctness'
    | 'deterministic_replay';
  details: Record<string, unknown>;
}

export interface MemoryQualityProjection {
  hitRefs: string[];
  hitMemoryIds: string[];
  hitRevisionIds: string[];
  snapshotHash: string;
  hardGuardrailRefs: string[];
  priorFailureRefs: string[];
  graphRefs: string[];
  openConflictRefs: Array<[string, string]>;
}

export interface MemoryQualityCaseResult {
  caseId: string;
  projection: MemoryQualityProjection;
  failures: MemoryQualityFailure[];
}

export interface MemoryQualityResult {
  metrics: MemoryQualityMetrics;
  cases: MemoryQualityCaseResult[];
  failures: MemoryQualityFailure[];
}

interface RefRecord {
  memoryId: string;
  scope: MemoryQualityScope;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function validScope(scope: unknown): scope is MemoryQualityScope {
  if (!scope || typeof scope !== 'object') return false;
  const value = scope as Partial<MemoryQualityScope>;
  return typeof value.principalId === 'string' && Boolean(value.principalId.trim())
    && typeof value.projectId === 'string' && Boolean(value.projectId.trim());
}

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`MEMORY_QUALITY_CASE_INVALID:${field}`);
  }
  return value as string[];
}

function validateCorpus(corpus: MemoryQualityCase[]): void {
  if (!Array.isArray(corpus) || corpus.length === 0) throw new Error('MEMORY_QUALITY_CASE_INVALID:corpus');
  const caseIds = new Set<string>();
  for (const item of corpus) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
      throw new Error('MEMORY_QUALITY_CASE_INVALID:id');
    }
    if (caseIds.has(item.id)) throw new Error(`MEMORY_QUALITY_CASE_INVALID:duplicate:${item.id}`);
    caseIds.add(item.id);
    if (!validScope(item.scope)) throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:scope`);
    if (!Array.isArray(item.setup) || item.setup.length === 0) throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:setup`);
    if (typeof item.query !== 'string' || !item.query.trim()) throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:query`);
    if (item.limit !== undefined && (!Number.isInteger(item.limit) || item.limit < 1)) throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:limit`);
    if (item.characterBudget !== undefined && (!Number.isInteger(item.characterBudget) || item.characterBudget < 1)) {
      throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:characterBudget`);
    }

    const producedRefs = new Set<string>();
    for (const op of item.setup) {
      if (!op || typeof op !== 'object' || typeof op.op !== 'string') throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:operation`);
      if (op.op === 'commit') {
        if (typeof op.ref !== 'string' || !op.ref.trim() || producedRefs.has(op.ref)) throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:commit-ref`);
        if (op.scope !== undefined && !validScope(op.scope)) throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:commit-scope`);
        if (typeof op.canonicalKey !== 'string' || !op.canonicalKey.trim() || typeof op.value !== 'string') {
          throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:commit`);
        }
        for (const relation of op.relations ?? []) {
          if (!producedRefs.has(relation.targetRef)) throw new Error(`MEMORY_QUALITY_UNKNOWN_REF:${item.id}:${relation.targetRef}`);
        }
        producedRefs.add(op.ref);
      } else if (op.op === 'revise' || op.op === 'age') {
        if (!producedRefs.has(op.ref)) throw new Error(`MEMORY_QUALITY_UNKNOWN_REF:${item.id}:${op.ref}`);
        if (op.op === 'revise' && typeof op.value !== 'string') throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:revise`);
        if (op.op === 'age' && (!Number.isFinite(op.ageMs) || op.ageMs < 0)) throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:age`);
      } else if (op.op === 'conflict') {
        if (!producedRefs.has(op.leftRef)) throw new Error(`MEMORY_QUALITY_UNKNOWN_REF:${item.id}:${op.leftRef}`);
        if (!producedRefs.has(op.rightRef)) throw new Error(`MEMORY_QUALITY_UNKNOWN_REF:${item.id}:${op.rightRef}`);
      } else {
        throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:operation`);
      }
    }

    const expectedRefs = [
      ...stringArray(item.relevantRefs, `${item.id}:relevantRefs`),
      ...(item.primaryRelevantRef ? [item.primaryRelevantRef] : []),
      ...stringArray(item.hardGuardrailRefs, `${item.id}:hardGuardrailRefs`),
      ...(item.currentRevision ?? []).map((entry) => entry.ref),
      ...stringArray(item.priorFailureRefs, `${item.id}:priorFailureRefs`),
      ...stringArray(item.graphTargetRefs, `${item.id}:graphTargetRefs`),
      ...(item.conflictPairs ?? []).flatMap((entry) => [entry.leftRef, entry.rightRef]),
      ...stringArray(item.artifactProcedureRefs, `${item.id}:artifactProcedureRefs`),
      ...stringArray(item.noiseRefs, `${item.id}:noiseRefs`),
      ...(item.isolationProbes ?? []).flatMap((entry) => entry.mustExcludeRefs),
    ];
    for (const ref of expectedRefs) {
      if (!producedRefs.has(ref)) throw new Error(`MEMORY_QUALITY_UNKNOWN_REF:${item.id}:${ref}`);
    }
    for (const probe of item.isolationProbes ?? []) {
      if (!validScope(probe.scope) || !probe.query?.trim() || !['project', 'principal'].includes(probe.type)) {
        throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:isolationProbe`);
      }
    }
  }
}

function toScope(value: MemoryQualityScope): MemoryScope {
  return { principalId: value.principalId, projectId: value.projectId };
}

function refsForHits(hits: MemorySearchHit[], refs: Map<string, RefRecord>): string[] {
  const byId = new Map([...refs.entries()].map(([ref, record]) => [record.memoryId, ref]));
  return hits.map((hit) => byId.get(hit.memoryId)).filter((ref): ref is string => Boolean(ref));
}

function orderedConflictRefs(
  conflicts: Array<Record<string, unknown>>,
  refs: Map<string, RefRecord>,
): Array<[string, string]> {
  const byId = new Map([...refs.entries()].map(([ref, record]) => [record.memoryId, ref]));
  return conflicts
    .map((conflict): [string, string] | null => {
      const left = byId.get(String(conflict.leftMemoryId ?? ''));
      const right = byId.get(String(conflict.rightMemoryId ?? ''));
      return left && right ? [left, right] : null;
    })
    .filter((pair): pair is [string, string] => Boolean(pair))
    .map(([left, right]): [string, string] => left.localeCompare(right) <= 0 ? [left, right] : [right, left])
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
}

function sameProjection(left: MemoryQualityProjection, right: MemoryQualityProjection): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function addFailure(
  failures: MemoryQualityFailure[],
  caseId: string,
  metric: MemoryQualityFailure['metric'],
  details: Record<string, unknown>,
): void {
  failures.push({ caseId, metric, details });
}

interface MemoryQualityCounters {
  relevantExpected: number;
  relevantFound: number;
  mrrCases: number;
  reciprocalRank: number;
  hardExpected: number;
  hardFound: number;
  revisionExpected: number;
  revisionCorrect: number;
  failureExpected: number;
  failureFound: number;
  graphExpected: number;
  graphFound: number;
  conflictExpected: number;
  conflictFound: number;
  artifactExpected: number;
  artifactFound: number;
  noiseCases: number;
  noiseDisplaced: number;
  projectContamination: number;
  principalContamination: number;
  characterCases: number;
  characterCorrect: number;
  replayCases: number;
  replayEqual: number;
}

function emptyCounters(): MemoryQualityCounters {
  return {
    relevantExpected: 0,
    relevantFound: 0,
    mrrCases: 0,
    reciprocalRank: 0,
    hardExpected: 0,
    hardFound: 0,
    revisionExpected: 0,
    revisionCorrect: 0,
    failureExpected: 0,
    failureFound: 0,
    graphExpected: 0,
    graphFound: 0,
    conflictExpected: 0,
    conflictFound: 0,
    artifactExpected: 0,
    artifactFound: 0,
    noiseCases: 0,
    noiseDisplaced: 0,
    projectContamination: 0,
    principalContamination: 0,
    characterCases: 0,
    characterCorrect: 0,
    replayCases: 0,
    replayEqual: 0,
  };
}

async function evaluateCase(
  item: MemoryQualityCase,
  root: string,
): Promise<{
  result: MemoryQualityCaseResult;
  counters: MemoryQualityCounters;
}> {
  const config = {
    ...loadConfig({}, root).memory,
    enabled: true,
    dbPath: path.join(root, 'memory.sqlite'),
    graphMaxHops: 4,
    recallItemBudget: 32,
    recallCharacterBudget: 20_000,
    temporalNeighborWindowMs: 1,
  };
  let service = new MemoryService(config);
  const refs = new Map<string, RefRecord>();
  const failures: MemoryQualityFailure[] = [];
  const counters = emptyCounters();
  counters.replayCases = 1;

  try {
    for (const op of item.setup) {
      if (op.op === 'commit') {
        const scope = op.scope ?? item.scope;
        const committed = await service.commit({
          scope: toScope(scope),
          canonicalKey: op.canonicalKey,
          kind: op.kind,
          value: op.value,
          ...(op.importance === undefined ? {} : { importance: op.importance }),
          ...(op.pinned === undefined ? {} : { pinned: op.pinned }),
          ...(op.enforcement === undefined ? {} : { enforcement: op.enforcement }),
          sourceType: 'wave_e_quality',
          ...(op.relations?.length ? {
            explicitRelations: op.relations.map((relation) => ({
              targetMemoryId: refs.get(relation.targetRef)!.memoryId,
              relation: relation.relation,
              ...(relation.weight === undefined ? {} : { weight: relation.weight }),
            })),
          } : {}),
        });
        refs.set(op.ref, { memoryId: committed.memoryId, scope });
      } else if (op.op === 'revise') {
        const target = refs.get(op.ref)!;
        await service.revise({
          scope: toScope(target.scope),
          memoryId: target.memoryId,
          value: op.value,
          sourceType: 'wave_e_quality_revision',
        });
      } else if (op.op === 'conflict') {
        const left = refs.get(op.leftRef)!;
        const right = refs.get(op.rightRef)!;
        if (left.scope.principalId !== right.scope.principalId || left.scope.projectId !== right.scope.projectId) {
          throw new Error(`MEMORY_QUALITY_CASE_INVALID:${item.id}:cross-scope-conflict`);
        }
        await service.openConflict(
          toScope(left.scope),
          left.memoryId,
          right.memoryId,
          op.conflictType ?? 'quality_fixture',
          { source: 'wave_e_quality' },
        );
      } else if (op.op === 'age') {
        const target = refs.get(op.ref)!;
        await service.close();
        const db = new DatabaseSync(config.dbPath);
        try {
          const agedAt = Date.now() - op.ageMs;
          db.prepare('UPDATE memory_items SET updated_at = ?, last_accessed_at = ?, access_count = 0 WHERE id = ?')
            .run(agedAt, agedAt, target.memoryId);
        } finally {
          db.close();
        }
        service = new MemoryService(config);
      }
    }

    const searchRequest = {
      scope: toScope(item.scope),
      query: item.query,
      ...(item.limit === undefined ? {} : { limit: item.limit }),
      ...(item.characterBudget === undefined ? {} : { characterBudget: item.characterBudget }),
    };
    const firstSearch = await service.search(searchRequest);
    const firstPreflight = await service.preflight({
      scope: toScope(item.scope),
      routeContextId: `quality-${item.id}-first`,
      task: item.query,
      expiresAt: Date.now() + 60_000,
    });
    const secondSearch = await service.search(searchRequest);
    const secondPreflight = await service.preflight({
      scope: toScope(item.scope),
      routeContextId: `quality-${item.id}-second`,
      task: item.query,
      expiresAt: Date.now() + 60_000,
    });

    const hitRefs = refsForHits(firstSearch.hits, refs);
    const secondHitRefs = refsForHits(secondSearch.hits, refs);
    const preflightRefs = refsForHits(firstPreflight.recalled, refs);
    const secondPreflightRefs = refsForHits(secondPreflight.recalled, refs);
    const failureRefs = refsForHits(firstPreflight.priorFailures, refs);
    const secondFailureRefs = refsForHits(secondPreflight.priorFailures, refs);
    const hardRefs = refsForHits(firstPreflight.blockingGuardrails, refs);
    const secondHardRefs = refsForHits(secondPreflight.blockingGuardrails, refs);
    const graphRefs = firstSearch.hits.filter((hit) => hit.whyMatched.graph > 0).map((hit) => refsForHits([hit], refs)[0]).filter((ref): ref is string => Boolean(ref));
    const secondGraphRefs = secondSearch.hits.filter((hit) => hit.whyMatched.graph > 0).map((hit) => refsForHits([hit], refs)[0]).filter((ref): ref is string => Boolean(ref));
    const conflictRefs = orderedConflictRefs(firstPreflight.openConflicts, refs);
    const secondConflictRefs = orderedConflictRefs(secondPreflight.openConflicts, refs);

    const projection: MemoryQualityProjection = {
      hitRefs,
      hitMemoryIds: firstSearch.hits.map((hit) => hit.memoryId),
      hitRevisionIds: firstSearch.hits.map((hit) => hit.revisionId),
      snapshotHash: firstSearch.snapshotHash,
      hardGuardrailRefs: hardRefs,
      priorFailureRefs: failureRefs,
      graphRefs,
      openConflictRefs: conflictRefs,
    };
    const replayProjection: MemoryQualityProjection = {
      hitRefs: secondHitRefs,
      hitMemoryIds: secondSearch.hits.map((hit) => hit.memoryId),
      hitRevisionIds: secondSearch.hits.map((hit) => hit.revisionId),
      snapshotHash: secondSearch.snapshotHash,
      hardGuardrailRefs: secondHardRefs,
      priorFailureRefs: secondFailureRefs,
      graphRefs: secondGraphRefs,
      openConflictRefs: secondConflictRefs,
    };
    if (sameProjection(projection, replayProjection) && JSON.stringify(preflightRefs) === JSON.stringify(secondPreflightRefs)) {
      counters.replayEqual = 1;
    } else {
      addFailure(failures, item.id, 'deterministic_replay', { first: projection, second: replayProjection });
    }

    const relevantRefs = item.relevantRefs ?? [];
    counters.relevantExpected = relevantRefs.length;
    counters.relevantFound = relevantRefs.filter((ref) => hitRefs.includes(ref)).length;
    if (counters.relevantFound !== counters.relevantExpected) {
      addFailure(failures, item.id, 'recall_at_k', { relevantRefs, observed: hitRefs });
    }
    if (item.primaryRelevantRef) {
      counters.mrrCases = 1;
      const rank = hitRefs.indexOf(item.primaryRelevantRef);
      counters.reciprocalRank = rank >= 0 ? 1 / (rank + 1) : 0;
      if (rank < 0) addFailure(failures, item.id, 'mrr', { primaryRelevantRef: item.primaryRelevantRef, observed: hitRefs });
    }

    const expectedHard = item.hardGuardrailRefs ?? [];
    counters.hardExpected = expectedHard.length;
    counters.hardFound = expectedHard.filter((ref) => hardRefs.includes(ref) || hitRefs.includes(ref)).length;
    if (counters.hardExpected !== counters.hardFound) {
      addFailure(failures, item.id, 'hard_guardrail_recall', { expected: expectedHard, observed: [...new Set([...hardRefs, ...hitRefs])] });
    }

    for (const expected of item.currentRevision ?? []) {
      counters.revisionExpected += 1;
      const target = refs.get(expected.ref)!;
      const hit = firstSearch.hits.find((entry) => entry.memoryId === target.memoryId);
      const correct = Boolean(hit?.valueText.includes(expected.valueIncludes))
        && (!expected.valueExcludes || !hit?.valueText.includes(expected.valueExcludes));
      if (correct) counters.revisionCorrect += 1;
      else addFailure(failures, item.id, 'current_revision_correctness', { ref: expected.ref, observed: hit?.valueText ?? null });
    }

    const expectedFailures = item.priorFailureRefs ?? [];
    counters.failureExpected = expectedFailures.length;
    counters.failureFound = expectedFailures.filter((ref) => failureRefs.includes(ref)).length;
    if (counters.failureExpected !== counters.failureFound) {
      addFailure(failures, item.id, 'prior_failure_recall', { expected: expectedFailures, observed: failureRefs });
    }

    const expectedGraph = item.graphTargetRefs ?? [];
    counters.graphExpected = expectedGraph.length;
    counters.graphFound = expectedGraph.filter((ref) => graphRefs.includes(ref)).length;
    if (counters.graphExpected !== counters.graphFound) {
      addFailure(failures, item.id, 'graph_target_recall', { expected: expectedGraph, observed: graphRefs });
    }

    const expectedConflicts = (item.conflictPairs ?? []).map(({ leftRef, rightRef }) => leftRef.localeCompare(rightRef) <= 0 ? [leftRef, rightRef] as [string, string] : [rightRef, leftRef] as [string, string]);
    counters.conflictExpected = expectedConflicts.length;
    counters.conflictFound = expectedConflicts.filter((pair) => conflictRefs.some((seen) => seen[0] === pair[0] && seen[1] === pair[1])).length;
    if (counters.conflictExpected !== counters.conflictFound) {
      addFailure(failures, item.id, 'conflict_visibility', { expected: expectedConflicts, observed: conflictRefs });
    }

    const expectedArtifacts = item.artifactProcedureRefs ?? [];
    counters.artifactExpected = expectedArtifacts.length;
    counters.artifactFound = expectedArtifacts.filter((ref) => hitRefs.includes(ref)).length;
    if (counters.artifactExpected !== counters.artifactFound) {
      addFailure(failures, item.id, 'artifact_procedure_recall', { expected: expectedArtifacts, observed: hitRefs });
    }

    if (item.primaryRelevantRef && (item.noiseRefs?.length ?? 0) > 0) {
      counters.noiseCases = 1;
      const relevantRank = hitRefs.indexOf(item.primaryRelevantRef);
      const firstNoiseRank = Math.min(...item.noiseRefs!.map((ref) => hitRefs.indexOf(ref)).filter((rank) => rank >= 0), Number.POSITIVE_INFINITY);
      if (relevantRank < 0 || firstNoiseRank < relevantRank) {
        counters.noiseDisplaced = 1;
        addFailure(failures, item.id, 'noise_displacement', { primary: item.primaryRelevantRef, noiseRefs: item.noiseRefs, observed: hitRefs });
      }
    }

    for (const probe of item.isolationProbes ?? []) {
      const probeResult = await service.search({ scope: toScope(probe.scope), query: probe.query, limit: item.limit ?? 10 });
      const observedRefs = refsForHits(probeResult.hits, refs);
      const leaked = probe.mustExcludeRefs.filter((ref) => observedRefs.includes(ref));
      if (leaked.length > 0) {
        if (probe.type === 'project') counters.projectContamination += leaked.length;
        else counters.principalContamination += leaked.length;
        addFailure(failures, item.id, probe.type === 'project' ? 'cross_project_contamination' : 'cross_principal_contamination', {
          leaked,
          probeScope: probe.scope,
          observedRefs,
        });
      }
    }

    if (item.characterBudget !== undefined) {
      counters.characterCases = 1;
      const ordinaryCharacters = firstSearch.hits
        .filter((hit) => !(hit.kind === 'guardrail' && hit.state === 'active' && hit.enforcement === 'hard'))
        .reduce((sum, hit) => sum + hit.valueText.length, 0);
      if (ordinaryCharacters <= item.characterBudget) counters.characterCorrect = 1;
      else addFailure(failures, item.id, 'character_budget_correctness', { budget: item.characterBudget, ordinaryCharacters });
    }

    return { result: { caseId: item.id, projection, failures }, counters };
  } finally {
    await service.close().catch(() => undefined);
  }
}

export async function evaluateMemoryQuality(corpus: MemoryQualityCase[]): Promise<MemoryQualityResult> {
  validateCorpus(corpus);
  const parent = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'agent-core-memory-quality-'));
  try {
    const results: MemoryQualityCaseResult[] = [];
    const total = emptyCounters();
    for (let index = 0; index < corpus.length; index += 1) {
      const caseRoot = path.join(parent, `case-${String(index).padStart(3, '0')}`);
      const evaluated = await evaluateCase(corpus[index]!, caseRoot);
      results.push(evaluated.result);
      for (const key of Object.keys(evaluated.counters) as Array<keyof MemoryQualityCounters>) {
        total[key] += evaluated.counters[key];
      }
    }
    const failures = results.flatMap((entry) => entry.failures);
    return {
      metrics: {
        caseCount: corpus.length,
        recallAtK: ratio(total.relevantFound ?? 0, total.relevantExpected ?? 0),
        mrr: ratio(total.reciprocalRank ?? 0, total.mrrCases ?? 0),
        hardGuardrailRecall: ratio(total.hardFound ?? 0, total.hardExpected ?? 0),
        currentRevisionCorrectness: ratio(total.revisionCorrect ?? 0, total.revisionExpected ?? 0),
        priorFailureRecall: ratio(total.failureFound ?? 0, total.failureExpected ?? 0),
        graphTargetRecall: ratio(total.graphFound ?? 0, total.graphExpected ?? 0),
        conflictVisibility: ratio(total.conflictFound ?? 0, total.conflictExpected ?? 0),
        artifactProcedureRecall: ratio(total.artifactFound ?? 0, total.artifactExpected ?? 0),
        noiseDisplacementRate: ratio(total.noiseDisplaced ?? 0, total.noiseCases ?? 0),
        crossProjectContamination: total.projectContamination ?? 0,
        crossPrincipalContamination: total.principalContamination ?? 0,
        characterBudgetCorrectness: ratio(total.characterCorrect ?? 0, total.characterCases ?? 0),
        deterministicReplayEquality: ratio(total.replayEqual ?? 0, total.replayCases ?? 0),
      },
      cases: results,
      failures,
    };
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}
