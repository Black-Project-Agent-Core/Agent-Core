import { buildBm25Profile } from './bm25.js';
import { cosineSimilarity } from './embedder.js';
import { buildSemanticDocument } from './semantic-document.js';
import { memorySemanticRevision } from './disclosure.js';
import { lexicalRetrievalTokens } from './identifier-tokenizer.js';
import { normalizeMemorySourceFile, normalizeMemoryWorkspace } from './provenance.js';
import { isMemoryLinkActive } from './relations.js';
import type { SemanticSearchContext } from './index.js';
import type { MemoryRecord } from './types.js';

export interface RetrievalComponents {
  lexicalTokenizationDegraded?: boolean;
  exactPhrase: number;
  tokenOverlap: number;
  keywordMatch: number;
  tagMatch: number;
  contextMatch: number;
  categoryMatch: number;
  semanticSimilarity: number;
  bm25Lexical: number;
  bm25Weight: number;
  sourceFileMatch: number;
  feedbackInfluence: number;
  recency: number;
  linkBoost: number;
}

export interface FusionSelectionDiagnostics {
  profile: 'fusion';
  channels: Array<'lexical' | 'metadata' | 'semantic' | 'source'>;
  rrfScore: number;
  relativeScore: number;
  thresholdFloor: number;
  bypassedThreshold: boolean;
  redundancy: number;
}

export interface MemorySearchResult {
  record: MemoryRecord;
  score: number;
  components: RetrievalComponents;
  matchType: 'direct' | 'linked';
  viaMemoryId?: string;
  viaLinkType?: string;
  suppressedDuplicateIds?: string[];
  selection?: FusionSelectionDiagnostics;
}

export interface MemorySearchOptions {
  /** Host-bound task, never taken from model-supplied search arguments. */
  taskId?: string;
  limit?: number;
  maxNeighbors?: number;
  budgetChars?: number;
  sourceFiles?: string[];
  rankingProfile?: 'legacy' | 'bm25' | 'fusion';
  workspace?: string;
  asOf?: string;
  feedbackSalience?: ReadonlyMap<string, number>;
}

const zero = (): RetrievalComponents => ({
  exactPhrase: 0, tokenOverlap: 0, keywordMatch: 0, tagMatch: 0,
  contextMatch: 0, categoryMatch: 0, semanticSimilarity: 0, bm25Lexical: 0, bm25Weight: 0,
  sourceFileMatch: 0, feedbackInfluence: 0, recency: 0, linkBoost: 0,
});
function countMatches(queryTokens: Set<string>, values: string[]): number {
  let matches = 0;
  for (const value of values) {
    const tokens = lexicalRetrievalTokens(value).tokens;
    if (tokens.some((token) => queryTokens.has(token))) matches++;
  }
  return matches;
}

function normalizedList(values: string[]): string[] {
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean).sort();
}

function duplicateSignature(record: MemoryRecord): string | undefined {
  if (record.pinned) return undefined;
  return JSON.stringify({
    content: record.content.trim().replace(/\s+/g, ' ').toLowerCase(),
    ...(record.version===2?{experience:record.experience}:{}),
    context: record.context.trim().replace(/\s+/g, ' ').toLowerCase(),
    category: record.category.trim().toLowerCase(),
    keywords: normalizedList(record.keywords),
    tags: normalizedList(record.tags),
    workspace: record.provenance?.workspace?.trim().toLowerCase() ?? '',
    repo: record.provenance?.repo?.trim().toLowerCase() ?? '',
    files: normalizedList(record.provenance?.files ?? []),
    source: record.source ? [record.source.type, record.source.ref ?? ''] : [],
    links: record.links.map((link) => record.version===2?[link.type,link.targetId,link.validFrom,link.validTo]:[link.type, link.targetId]).sort(),
  });
}

function scoreRecord(
  record: MemoryRecord,
  query: string,
  semantic?: SemanticSearchContext,
  sourceFiles: string[] = [],
  bm25Score = 0,
  bm25Weight = 0,
  rankingTime = Date.now(),
): { score: number; components: RetrievalComponents } {
  const normalizedQuery = query.trim().toLowerCase();
  const queryTokens = new Set(lexicalRetrievalTokens(query,'query').tokens);
  const rawDocument = buildSemanticDocument(record);
  const document = rawDocument.toLowerCase();
  const lexicalDocument = lexicalRetrievalTokens(rawDocument);
  const documentSet = new Set(lexicalDocument.tokens);
  const components = zero();
  if (lexicalDocument.degraded) components.lexicalTokenizationDegraded = true;
  components.bm25Lexical = Math.max(0, Math.min(1, bm25Score));
  components.bm25Weight = Math.max(0, Math.min(2, bm25Weight));

  components.exactPhrase = normalizedQuery && document.includes(normalizedQuery) ? 4 : 0;
  let overlap = 0;
  for (const token of queryTokens) if (documentSet.has(token)) overlap++;
  components.tokenOverlap = queryTokens.size ? (overlap / queryTokens.size) * 3 : 0;
  components.keywordMatch = countMatches(queryTokens, record.keywords) * 0.8;
  components.tagMatch = countMatches(queryTokens, record.tags) * 0.7;
  components.contextMatch = countMatches(queryTokens, [record.context]) * 0.6;
  components.categoryMatch = countMatches(queryTokens, [record.category]) * 0.5;

  if (sourceFiles.length && record.provenance?.files.length) {
    const sourceSet = new Set(sourceFiles);
    let sourceMatches = 0;
    for (const file of record.provenance.files) {
      if (sourceSet.has(file)) sourceMatches += 1;
    }
    components.sourceFileMatch = sourceMatches
      ? 1.25 * Math.min(1, sourceMatches / Math.max(1, sourceSet.size))
      : 0;
  }

  const vector = semantic?.vectors.get(record.id);
  if (semantic?.passageScores) {
    const passage = semantic.passageScores.get(record.id);
    if (passage && passage.parentRevision === memorySemanticRevision(record)) {
      components.semanticSimilarity = Math.max(0, Math.min(1, passage.score));
    }
  } else if (vector && semantic) {
    components.semanticSimilarity = Math.max(0, Math.min(1, cosineSimilarity(semantic.queryVector, vector)));
  }
  const ageMs = Math.max(0, rankingTime - Date.parse(record.updatedAt));
  components.recency = Math.max(
    0,
    0.05 - Math.min(0.05, ageMs / (365 * 24 * 60 * 60 * 1000) * 0.05),
  );
  const score = components.exactPhrase
    + components.tokenOverlap
    + components.keywordMatch
    + components.tagMatch
    + components.contextMatch
    + components.categoryMatch
    + components.semanticSimilarity * 4
    + components.bm25Lexical * components.bm25Weight
    + components.sourceFileMatch
    + components.recency
    + components.linkBoost;
  return { score, components };
}

export function searchMemories(
  records: MemoryRecord[],
  query: string,
  options: MemorySearchOptions = {},
  semantic?: SemanticSearchContext,
  candidateLimit = 50,
  rankingTime?: number,
): MemorySearchResult[] {
  lexicalRetrievalTokens(query,'query');
  if (options.rankingProfile === 'fusion') {
    return searchMemoriesFusion(records, query, options, semantic, candidateLimit, rankingTime);
  }
  const limit = Math.max(1, Math.min(candidateLimit, options.limit ?? 5));
  const maxNeighbors = Math.max(0, Math.min(10, options.maxNeighbors ?? 2));
  const sourceFiles = [...new Set((options.sourceFiles ?? []).map(normalizeMemorySourceFile))].slice(0, 32);
  const rankingProfile = options.rankingProfile ?? 'legacy';
  const workspace = options.workspace ? normalizeMemoryWorkspace(options.workspace) : undefined;
  const referenceTime = resolveReferenceTime(options.asOf);
  const scopedRecords = workspace
    ? records.filter((record) => record.pinned || (record.provenance?.workspace && normalizeMemoryWorkspace(record.provenance.workspace) === workspace))
    : records;
  const bm25 = rankingProfile === 'bm25'
    ? buildBm25Profile(scopedRecords, query)
    : { scores: new Map<string, number>(), meaningfulQueryTokens: 0, weight: 0 };
  const byId = new Map(scopedRecords.map((record) => [record.id, record]));
  const ranked = scopedRecords
    .map((record) => ({
      record,
      ...scoreRecord(record, query, semantic, sourceFiles, bm25.scores.get(record.id) ?? 0, bm25.weight, rankingTime),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
  const signatures = new Map<string, string>();
  const suppressed = new Map<string, string[]>();
  const direct: typeof ranked = [];
  for (const item of ranked) {
    const signature = duplicateSignature(item.record);
    if (signature) {
      const representative = signatures.get(signature);
      if (representative) {
        suppressed.set(representative, [...(suppressed.get(representative) ?? []), item.record.id]);
        continue;
      }
      signatures.set(signature, item.record.id);
    }
    direct.push(item);
    if (direct.length >= limit) break;
  }
  const output: MemorySearchResult[] = direct.map((item) => ({
    record: item.record,
    score: item.score,
    components: item.components,
    matchType: 'direct',
    ...(suppressed.get(item.record.id)?.length ? { suppressedDuplicateIds: suppressed.get(item.record.id) } : {}),
  }));
  const seen = new Set(output.map((item) => item.record.id));

  for (const item of direct) {
    let expanded = 0;
    for (const link of item.record.links.slice().sort((a, b) => b.strength - a.strength)) {
      if (expanded >= maxNeighbors || output.length >= limit + maxNeighbors * limit) break;
      if (!isMemoryLinkActive(link, referenceTime)) continue;
      if (seen.has(link.targetId)) continue;
      const neighbor = byId.get(link.targetId);
      if (!neighbor) continue;
      const components = zero();
      components.linkBoost = 0.5 + link.strength;
      output.push({
        record: neighbor,
        score: Math.max(0.01, item.score * 0.35 + components.linkBoost),
        components,
        matchType: 'linked',
        viaMemoryId: item.record.id,
        viaLinkType: link.type,
      });
      seen.add(neighbor.id);
      expanded++;
    }
  }

  output.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
  return output.slice(0, limit + maxNeighbors * limit);
}

type FusionChannel = 'lexical' | 'metadata' | 'semantic' | 'source';

interface FusionCandidate {
  record: MemoryRecord;
  components: RetrievalComponents;
  channelScores: Record<FusionChannel, number>;
  channels: FusionChannel[];
  rrf: number;
  relativeScore: number;
  bypassedThreshold: boolean;
  redundancy: number;
  score: number;
}

const FUSION_RRF_K = 60;
const FUSION_THRESHOLD_RATIO = 0.2;
const FUSION_MMR_LAMBDA = 0.8;
const FUSION_FEEDBACK_MAX_BOOST = 0.08;
const FUSION_FEEDBACK_MAX_PENALTY = -0.06;

function resolveReferenceTime(asOf?: string): number {
  if (!asOf) return Date.now();
  const parsed = Date.parse(asOf);
  if (!Number.isFinite(parsed)) throw new Error('MEMORY_SEARCH_AS_OF_INVALID');
  return parsed;
}

function feedbackInfluence(salience: number | undefined): number {
  if (!Number.isFinite(salience)) return 0;
  const raw = (Number(salience) - 1) * 0.08;
  return Math.max(FUSION_FEEDBACK_MAX_PENALTY, Math.min(FUSION_FEEDBACK_MAX_BOOST, raw));
}

function fusionChannelScores(components: RetrievalComponents): Record<FusionChannel, number> {
  return {
    lexical: components.exactPhrase + components.tokenOverlap
      + components.bm25Lexical * components.bm25Weight,
    metadata: components.keywordMatch + components.tagMatch
      + components.contextMatch + components.categoryMatch,
    semantic: components.semanticSimilarity,
    source: components.sourceFileMatch,
  };
}
function concreteIdentifiers(query: string): string[] {
  const matches = query.match(/[A-Za-z0-9][A-Za-z0-9_.:/\\-]{7,}/g) ?? [];
  return [...new Set(matches
    .map((value) => value.toLowerCase().replaceAll('\\', '/'))
    .filter((value) => /[0-9_.:/-]/.test(value)))]
    .slice(0, 16);
}

function identifierHaystack(record: MemoryRecord): string {
  return [
    buildSemanticDocument(record),
    ...(record.provenance?.files ?? []),
  ].join('\n').toLowerCase().replaceAll('\\', '/');
}

function identifierEligible(record: MemoryRecord, identifiers: string[]): boolean {
  if (record.pinned || identifiers.length === 0) return true;
  const haystack = identifierHaystack(record);
  return identifiers.every((identifier) => haystack.includes(identifier));
}

function strongFusionEvidence(candidate: FusionCandidate): boolean {
  const c = candidate.components;
  return c.exactPhrase > 0
    || c.bm25Lexical >= 0.6
    || c.semanticSimilarity >= 0.75
    || c.sourceFileMatch >= 0.75
    || candidate.channelScores.metadata >= 0.8;
}
function maxSemanticRedundancy(
  candidate: FusionCandidate,
  selected: FusionCandidate[],
  semantic?: SemanticSearchContext,
): number {
  const vector = semantic?.vectors.get(candidate.record.id);
  if (!vector || selected.length === 0) return 0;
  let maximum = 0;
  for (const prior of selected) {
    const priorVector = semantic?.vectors.get(prior.record.id);
    if (!priorVector) continue;
    maximum = Math.max(maximum, Math.max(0, Math.min(1, cosineSimilarity(vector, priorVector))));
  }
  return maximum;
}

function selectFusionCandidates(
  candidates: FusionCandidate[],
  limit: number,
  semantic?: SemanticSearchContext,
): FusionCandidate[] {
  const selected: FusionCandidate[] = [];
  const pool = [...candidates];
  while (selected.length < limit && pool.length > 0) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestRedundancy = 0;
    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index]!;
      const redundancy = maxSemanticRedundancy(candidate, selected, semantic);
      const score = FUSION_MMR_LAMBDA * candidate.relativeScore
        + (1 - FUSION_MMR_LAMBDA) * (1 - redundancy)
        + candidate.components.feedbackInfluence;
      const currentBest = bestIndex >= 0 ? pool[bestIndex]! : undefined;
      if (
        score > bestScore
        || (score === bestScore && candidate.rrf > (currentBest?.rrf ?? -1))
        || (score === bestScore && candidate.rrf === (currentBest?.rrf ?? -1)
          && candidate.record.id.localeCompare(currentBest?.record.id ?? '') < 0)
      ) {
        bestIndex = index;
        bestScore = score;
        bestRedundancy = redundancy;
      }
    }
    if (bestIndex < 0) break;
    const [picked] = pool.splice(bestIndex, 1);
    picked!.redundancy = bestRedundancy;
    picked!.score = bestScore;
    selected.push(picked!);
  }
  return selected;
}

function searchMemoriesFusion(
  records: MemoryRecord[],
  query: string,
  options: MemorySearchOptions,
  semantic?: SemanticSearchContext,
  candidateLimit = 50,
  rankingTime?: number,
): MemorySearchResult[] {
  const limit = Math.max(1, Math.min(candidateLimit, options.limit ?? 5));
  const maxNeighbors = Math.max(0, Math.min(10, options.maxNeighbors ?? 2));
  const sourceFiles = [...new Set((options.sourceFiles ?? []).map(normalizeMemorySourceFile))].slice(0, 32);
  const workspace = options.workspace ? normalizeMemoryWorkspace(options.workspace) : undefined;
  const referenceTime = resolveReferenceTime(options.asOf);
  const scopedRecords = workspace
    ? records.filter((record) => record.pinned
      || (record.provenance?.workspace
        && normalizeMemoryWorkspace(record.provenance.workspace) === workspace))
    : records;
  const bm25 = buildBm25Profile(scopedRecords, query);
  const identifiers = concreteIdentifiers(query);

  let candidates: FusionCandidate[] = scopedRecords.map((record) => {
    const { components } = scoreRecord(
      record,
      query,
      semantic,
      sourceFiles,
      bm25.scores.get(record.id) ?? 0,
      bm25.weight,
      rankingTime,
    );
    components.feedbackInfluence = feedbackInfluence(options.feedbackSalience?.get(record.id));
    return {
      record,
      components,
      channelScores: fusionChannelScores(components),
      channels: [],
      rrf: 0,
      relativeScore: 0,
      bypassedThreshold: false,
      redundancy: 0,
      score: 0,
    };
  }).filter((candidate) =>
    identifierEligible(candidate.record, identifiers)
    && Object.values(candidate.channelScores).some((value) => value > 0),
  );

  for (const channel of ['lexical', 'metadata', 'semantic', 'source'] as const) {
    const ranked = candidates
      .filter((candidate) => candidate.channelScores[channel] > 0)
      .sort((left, right) =>
        right.channelScores[channel] - left.channelScores[channel]
        || left.record.id.localeCompare(right.record.id),
      );
    ranked.forEach((candidate, index) => {
      candidate.rrf += 1 / (FUSION_RRF_K + index + 1);
      candidate.channels.push(channel);
    });
  }

  candidates = candidates
    .filter((candidate) => candidate.rrf > 0)
    .sort((left, right) => right.rrf - left.rrf || left.record.id.localeCompare(right.record.id));
  if (candidates.length === 0) return [];

  const topRrf = candidates[0]!.rrf;
  const thresholdFloor = topRrf * FUSION_THRESHOLD_RATIO;
  candidates = candidates.filter((candidate) => {
    candidate.relativeScore = topRrf > 0 ? candidate.rrf / topRrf : 0;
    candidate.bypassedThreshold = candidate.channels.length >= 2 && strongFusionEvidence(candidate);
    return candidate.rrf >= thresholdFloor || candidate.bypassedThreshold;
  });

  const signatures = new Map<string, string>();
  const suppressed = new Map<string, string[]>();
  const deduped: FusionCandidate[] = [];
  for (const candidate of candidates) {
    const signature = duplicateSignature(candidate.record);
    if (signature) {
      const representative = signatures.get(signature);
      if (representative) {
        suppressed.set(representative, [...(suppressed.get(representative) ?? []), candidate.record.id]);
        continue;
      }
      signatures.set(signature, candidate.record.id);
    }
    deduped.push(candidate);
  }

  const selected = selectFusionCandidates(deduped, limit, semantic);
  const output: MemorySearchResult[] = selected.map((candidate) => ({
    record: candidate.record,
    score: candidate.score,
    components: candidate.components,
    matchType: 'direct',
    ...(suppressed.get(candidate.record.id)?.length
      ? { suppressedDuplicateIds: suppressed.get(candidate.record.id) }
      : {}),
    selection: {
      profile: 'fusion',
      channels: candidate.channels,
      rrfScore: candidate.rrf,
      relativeScore: candidate.relativeScore,
      thresholdFloor,
      bypassedThreshold: candidate.bypassedThreshold,
      redundancy: candidate.redundancy,
    },
  }));
  const seen = new Set(output.map((item) => item.record.id));
  const byId = new Map(scopedRecords.map((record) => [record.id, record]));

  for (const parent of selected) {
    let expanded = 0;
    for (const link of parent.record.links.slice().sort((a, b) => b.strength - a.strength)) {
      if (expanded >= maxNeighbors || output.length >= limit + maxNeighbors * limit) break;
      if (!isMemoryLinkActive(link, referenceTime)) continue;
      if (seen.has(link.targetId)) continue;
      const neighbor = byId.get(link.targetId);
      if (!neighbor) continue;
      const components = zero();
      components.linkBoost = 0.5 + link.strength;
      output.push({
        record: neighbor,
        score: Math.max(0.01, parent.score * 0.35 + components.linkBoost),
        components,
        matchType: 'linked',
        viaMemoryId: parent.record.id,
        viaLinkType: link.type,
      });
      seen.add(neighbor.id);
      expanded += 1;
    }
  }

  output.sort((left, right) => right.score - left.score || left.record.id.localeCompare(right.record.id));
  return output.slice(0, limit + maxNeighbors * limit);
}
