import { buildBm25Profile } from './bm25.js';
import { cosineSimilarity } from './embedder.js';
import { buildSemanticDocument } from './semantic-document.js';
import { memorySemanticRevision } from './disclosure.js';
import { flattenRetrievalTokens, lexicalRetrievalTokens, tokenizeRetrievalText } from './identifier-tokenizer.js';
import { normalizeMemorySourceFile, normalizeMemoryWorkspace } from './provenance.js';
import { traverseRelations } from './graph-traversal.js';
import { concreteIdentifiers, normalizeFusionWeights, type FusionChannelWeights } from './query-intent.js';
import type { MemoryTier } from './memory-tiers.js';
import type { SemanticSearchContext } from './index.js';
import type { MemoryRecord } from './types.js';

export interface RetrievalComponents {
  lexicalTokenizationDegraded?: boolean;
  contentExactPhrase: boolean;
  contentLexicalCoverage: number;
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
  /** Optional bounded epistemic-confidence term; absent unless the host enabled it. */
  epistemicInfluence?: number;
}

export const FUSION_DIVERSITY_POLICY = {
  version: 'semantic-lexical-mmr/v1',
  maxCandidates: 256,
  maxCodepoints: 8192,
  maxUniqueTokens: 512,
  maxLexicalPairs: 8192,
} as const;

type RedundancyBasis = 'semantic' | 'lexical' | 'mixed' | 'none';

export interface FusionSelectionDiagnostics {
  profile: 'fusion';
  channels: Array<'lexical' | 'metadata' | 'semantic' | 'source'>;
  rrfScore: number;
  relativeScore: number;
  thresholdFloor: number;
  bypassedThreshold: boolean;
  redundancy: number;
  diversityVersion: typeof FUSION_DIVERSITY_POLICY.version;
  /** Comparisons actually available for this candidate when it was selected. */
  redundancyBasis: RedundancyBasis;
  /** Invocation totals, including comparisons for candidates that were not selected. */
  lexicalPairsEvaluated: number;
  lexicalPairsSkipped: number;
  lexicalCoverage: 'complete' | 'bounded';
}

export interface MemorySearchResult {
  record: MemoryRecord;
  score: number;
  components: RetrievalComponents;
  matchType: 'direct' | 'linked';
  viaMemoryId?: string;
  viaLinkType?: string;
  /** Traversal depth of a linked result; 1 is a direct neighbor of a direct result. */
  hops?: number;
  /** Ids from the originating direct result to this linked result, exclusive. */
  viaPath?: string[];
  tier?: MemoryTier;
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
  /** Include explicitly general, unscoped records alongside a workspace. */
  includeGeneral?: boolean;
  /** Internal task-bound evaluation intervention, applied before disclosure. */
  excludeMemoryIds?: string[];
  asOf?: string;
  feedbackSalience?: ReadonlyMap<string, number>;
  /** Host-selected relation traversal depth; 1 (default) is the original single hop. */
  maxHops?: number;
  /** Host-selected per-channel multipliers for the fusion profile; neutral when omitted. */
  channelWeights?: Partial<FusionChannelWeights>;
  /** Host-computed bounded epistemic influence per record id for the fusion profile. */
  epistemicInfluence?: ReadonlyMap<string, number>;
}

const zero = (): RetrievalComponents => ({
  contentExactPhrase:false,contentLexicalCoverage:0,
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
  // Admission evidence is content-only and uses the active lexical tokenizer.
  // These fields never contribute to ranking or channel weights.
  const lexicalContent = lexicalRetrievalTokens(record.content);
  const contentTokens = new Set(lexicalContent.tokens);
  components.contentExactPhrase = Boolean(normalizedQuery && record.content.toLowerCase().includes(normalizedQuery));
  let contentOverlap = 0;
  for (const token of queryTokens) if (contentTokens.has(token)) contentOverlap++;
  components.contentLexicalCoverage = queryTokens.size ? contentOverlap / queryTokens.size : 0;
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
  appendLinkedResults(output, direct, byId, limit, maxNeighbors, options.maxHops, referenceTime);

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
  redundancyBasis: RedundancyBasis;
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

/** Appends relation-linked results; hop 1 is the original single-hop expansion. */
function appendLinkedResults(
  output: MemorySearchResult[],
  seeds: Array<{ record: MemoryRecord; score: number }>,
  byId: ReadonlyMap<string, MemoryRecord>,
  limit: number,
  maxNeighbors: number,
  maxHops: number | undefined,
  referenceTime: number,
): void {
  const hits = traverseRelations(seeds, byId, {
    maxHops: maxHops ?? 1,
    maxNeighbors,
    capacity: limit + maxNeighbors * limit,
    initialCount: output.length,
    referenceTime,
    seen: new Set(output.map((item) => item.record.id)),
  });
  for (const hit of hits) {
    const components = zero();
    components.linkBoost = hit.linkBoost;
    output.push({
      record: hit.record,
      score: hit.score,
      components,
      matchType: 'linked',
      viaMemoryId: hit.viaMemoryId,
      viaLinkType: hit.viaLinkType,
      ...(hit.hops > 1 ? { hops: hit.hops, viaPath: hit.path } : {}),
    });
  }
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
/** Reject incomplete content before normalization; never fall back to an unbounded document scan. */
function diversityTokens(content: string): Set<string> | undefined {
  let end = 0;
  for (let points = 0; end < content.length && points < FUSION_DIVERSITY_POLICY.maxCodepoints; points += 1) {
    end += content.codePointAt(end)! > 0xffff ? 2 : 1;
  }
  if (end < content.length) return undefined;
  const parsed = tokenizeRetrievalText(content);
  if (parsed.truncated) return undefined;
  const tokens = new Set<string>();
  for (const token of flattenRetrievalTokens(parsed)) {
    if (tokens.has(token)) continue;
    if (tokens.size >= FUSION_DIVERSITY_POLICY.maxUniqueTokens) return undefined;
    tokens.add(token);
  }
  return tokens.size ? tokens : undefined;
}

function addRedundancy(candidate: FusionCandidate, similarity: number, basis: 'semantic' | 'lexical'): void {
  candidate.redundancy = Math.max(candidate.redundancy, similarity);
  candidate.redundancyBasis = candidate.redundancyBasis === 'none' ? basis
    : candidate.redundancyBasis === basis ? basis : 'mixed';
}

function selectFusionCandidates(
  candidates: FusionCandidate[],
  limit: number,
  semantic?: SemanticSearchContext,
): { selected: FusionCandidate[]; lexicalPairsEvaluated: number; lexicalPairsSkipped: number } {
  const selected: FusionCandidate[] = [];
  const pool = [...candidates];
  const tokenCache = new Map<string, Set<string> | undefined>();
  if (limit > 1 && candidates.some(candidate => !semantic?.vectors.get(candidate.record.id))) {
    // Admission, threshold and exact-signature dedup already ran. Cache allowance
    // follows native candidate order without limiting the candidate universe.
    for (const candidate of candidates.slice(0, FUSION_DIVERSITY_POLICY.maxCandidates)) {
      tokenCache.set(candidate.record.id, diversityTokens(candidate.record.content));
    }
  }
  let lexicalPairsEvaluated = 0;
  let lexicalPairsSkipped = 0;
  while (selected.length < limit && pool.length > 0) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    const prior = selected.at(-1);
    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index]!;
      if (prior) {
        // Only the newly selected candidate is compared. Earlier maxima remain
        // cached on each candidate, so no pair consumes the allowance twice.
        const vector = semantic?.vectors.get(candidate.record.id);
        const priorVector = semantic?.vectors.get(prior.record.id);
        if (vector && priorVector) {
          addRedundancy(candidate, Math.max(0, Math.min(1, cosineSimilarity(vector, priorVector))), 'semantic');
        } else {
          const tokens = tokenCache.get(candidate.record.id);
          const priorTokens = tokenCache.get(prior.record.id);
          if (!tokens || !priorTokens || lexicalPairsEvaluated >= FUSION_DIVERSITY_POLICY.maxLexicalPairs) {
            lexicalPairsSkipped += 1;
          } else {
            let intersection = 0;
            for (const token of tokens) if (priorTokens.has(token)) intersection += 1;
            lexicalPairsEvaluated += 1;
            addRedundancy(candidate, intersection / (tokens.size + priorTokens.size - intersection), 'lexical');
          }
        }
      }
      const score = FUSION_MMR_LAMBDA * candidate.relativeScore
        + (1 - FUSION_MMR_LAMBDA) * (1 - candidate.redundancy)
        + candidate.components.feedbackInfluence
        + (candidate.components.epistemicInfluence ?? 0);
      const currentBest = bestIndex >= 0 ? pool[bestIndex]! : undefined;
      if (
        score > bestScore
        || (score === bestScore && candidate.rrf > (currentBest?.rrf ?? -1))
        || (score === bestScore && candidate.rrf === (currentBest?.rrf ?? -1)
          && candidate.record.id.localeCompare(currentBest?.record.id ?? '') < 0)
      ) {
        bestIndex = index;
        bestScore = score;
      }
    }
    if (bestIndex < 0) break;
    const [picked] = pool.splice(bestIndex, 1);
    picked!.score = bestScore;
    selected.push(picked!);
  }
  return { selected, lexicalPairsEvaluated, lexicalPairsSkipped };
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
  const channelWeights = normalizeFusionWeights(options.channelWeights);

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
    const epistemic = options.epistemicInfluence?.get(record.id);
    if (epistemic !== undefined && Number.isFinite(epistemic)) components.epistemicInfluence = epistemic;
    return {
      record,
      components,
      channelScores: fusionChannelScores(components),
      channels: [],
      rrf: 0,
      relativeScore: 0,
      bypassedThreshold: false,
      redundancy: 0,
      redundancyBasis: 'none' as const,
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
      candidate.rrf += channelWeights[channel] / (FUSION_RRF_K + index + 1);
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

  const { selected, lexicalPairsEvaluated, lexicalPairsSkipped } = selectFusionCandidates(deduped, limit, semantic);
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
      diversityVersion: FUSION_DIVERSITY_POLICY.version,
      redundancyBasis: candidate.redundancyBasis,
      lexicalPairsEvaluated,
      lexicalPairsSkipped,
      lexicalCoverage: lexicalPairsSkipped > 0 ? 'bounded' : 'complete',
    },
  }));
  const byId = new Map(scopedRecords.map((record) => [record.id, record]));
  appendLinkedResults(output, selected, byId, limit, maxNeighbors, options.maxHops, referenceTime);

  output.sort((left, right) => right.score - left.score || left.record.id.localeCompare(right.record.id));
  return output.slice(0, limit + maxNeighbors * limit);
}
